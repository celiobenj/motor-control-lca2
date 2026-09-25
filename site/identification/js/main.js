// ============================================================
// main.js — ponto de entrada e orquestração do site de identificação
// ============================================================

import { SerialManager }           from './serial.js';
import { ConfigPanel, HELP_CONTENT } from './config.js';
import { ChartManager }            from './charts.js';
import { exportCsv }               from './export.js';
import { initVersionFooter }        from './version.js';

// ---- Referências DOM -----------------------------------------------

const els = {
  // Header
  badge:          document.getElementById('serial-badge'),
  portName:       document.getElementById('serial-port-name'),
  btnConnect:     document.getElementById('btn-connect'),
  btnDisconnect:  document.getElementById('btn-disconnect'),
  btnApply:       document.getElementById('btn-apply'),
  btnStop:        document.getElementById('btn-stop'),

  // Config panel
  inputTs:        document.getElementById('prbs-ts'),
  inputStretch:   document.getElementById('prbs-stretch'),
  statSamples:    document.getElementById('stat-samples'),
  statTime:       document.getElementById('stat-time'),
  statU:          document.getElementById('stat-u'),
  statY:          document.getElementById('stat-y'),

  // Charts
  canvasMain:         document.getElementById('chart-main'),
  canvasControl:      document.getElementById('chart-control'),
  timeWindow:         document.getElementById('time-window'),
  checkCursorVisible: document.getElementById('check-cursor-visible'),
  btnPause:           document.getElementById('btn-pause'),
  iconPause:          document.getElementById('icon-pause'),
  iconResume:         document.getElementById('icon-resume'),
  btnClear:           document.getElementById('btn-clear'),
  btnExport:          document.getElementById('btn-export'),
  csvAll:             document.getElementById('csv-all'),
  csvVisible:         document.getElementById('csv-visible'),

  // Modais
  modalClear:           document.getElementById('modal-clear'),
  btnModalClearCancel:  document.getElementById('btn-modal-clear-cancel'),
  btnModalClearConfirm: document.getElementById('btn-modal-clear-confirm'),

  modalHelp:        document.getElementById('modal-help'),
  modalHelpTitle:   document.getElementById('modal-help-title'),
  modalHelpBody:    document.getElementById('modal-help-body'),
  btnModalHelpClose:document.getElementById('btn-modal-help-close'),

  modalReset:           document.getElementById('modal-reset'),
  btnModalResetCancel:  document.getElementById('btn-modal-reset-cancel'),
  btnModalResetConfirm: document.getElementById('btn-modal-reset-confirm'),

  // Compat
  compatWarning: document.getElementById('compat-warning'),

  // Resize
  resizeH:      document.getElementById('resize-h'),
  appContent:   document.getElementById('app-content'),
  resizeCharts: document.getElementById('resize-charts'),
  chartsArea:   document.getElementById('charts-area'),
  chart1:       document.getElementById('chart1-container'),
  chart2:       document.getElementById('chart2-container'),
  toolbar:      document.getElementById('chart-toolbar'),
};

// ---- Instâncias dos módulos ----------------------------------------

const serial = new SerialManager();
const charts = new ChartManager();
const config = new ConfigPanel(
  {
    inputTs:      els.inputTs,
    inputStretch: els.inputStretch,
    statSamples:  els.statSamples,
    statTime:     els.statTime,
    statU:        els.statU,
    statY:        els.statY,
  },
  (isValid) => _updateApplyBtn(isValid)
);

// ---- Estado --------------------------------------------------------

let _connState = 'disconnected'; // disconnected | waiting | connected | running | stopping
let _stopTimer = null;

// Amostra acumulada do ciclo de identificação
let _cycleBuf = { t: null, medida: null, u: null };

// ---- Init ----------------------------------------------------------

function init() {
  if (!navigator.serial) {
    els.compatWarning.hidden = false;
    els.btnConnect.disabled = true;
  }

  charts.init(els.canvasMain, els.canvasControl);
  charts.setWindow(parseInt(els.timeWindow.value, 10));
  config.init();

  _bindEvents();
  _initResizeH();
  _initResizeCharts();
  _applyConnState('disconnected');
  initVersionFooter();
}

// ---- Ligação de eventos --------------------------------------------

function _bindEvents() {
  // Serial
  els.btnConnect.addEventListener('click', _onConnectClick);
  els.btnDisconnect.addEventListener('click', () => serial.disconnect());
  serial.addEventListener('line',         (e) => _onSerialLine(e.detail));
  serial.addEventListener('disconnected', ()  => _applyConnState('disconnected'));

  // Ações do header
  els.btnApply.addEventListener('click', _onApplyClick);
  els.btnStop.addEventListener('click',  _onStopClick);

  // Janela de tempo
  els.timeWindow.addEventListener('change', () => {
    charts.setWindow(parseInt(els.timeWindow.value, 10));
  });

  // Cursor visível (toggle)
  els.checkCursorVisible?.addEventListener('change', () => {
    charts.setCursorVisible(els.checkCursorVisible.checked);
  });

  // Pausar / Retomar
  els.btnPause.addEventListener('click', _onPauseClick);

  // Limpar (com modal de confirmação)
  els.btnClear.addEventListener('click', () => { els.modalClear.hidden = false; });
  els.btnModalClearCancel.addEventListener('click',  () => { els.modalClear.hidden = true; });
  els.btnModalClearConfirm.addEventListener('click', async () => {
    charts.clear();
    _cycleBuf = { t: null, medida: null, u: null };
    config.updateStats(0, 0, 0, 0);
    if (serial.connected) {
      try { await serial.sendJson({ cmd: 'reset_time' }); } catch (_) {}
    }
    els.modalClear.hidden = true;
  });

  // Exportar CSV
  els.btnExport.addEventListener('click', _onExportClick);

  // Botões de ajuda
  document.getElementById('btn-help-measure')?.addEventListener('click', () => _openHelp('measure'));
  document.getElementById('btn-help-prbs')?.addEventListener('click',    () => _openHelp('prbs'));

  // Fechar modal de ajuda
  els.btnModalHelpClose.addEventListener('click', () => { els.modalHelp.hidden = true; });
  els.modalHelp.addEventListener('click', (e) => { if (e.target === els.modalHelp) els.modalHelp.hidden = true; });

  // Botão de reset PRBS (com modal de confirmação)
  document.getElementById('btn-reset-prbs')?.addEventListener('click', () => {
    els.modalReset.hidden = false;
  });
  els.btnModalResetCancel.addEventListener('click',  () => { els.modalReset.hidden = true; });
  els.btnModalResetConfirm.addEventListener('click', () => {
    config.resetDefaults();
    els.modalReset.hidden = true;
  });

  // Fechar modais com tecla ESC ou clique no fundo (backdrop)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeAllModals();
  });
  els.modalClear?.addEventListener('click', (e) => { if (e.target === els.modalClear) _closeAllModals(); });
  els.modalReset?.addEventListener('click', (e) => { if (e.target === els.modalReset) _closeAllModals(); });
  els.modalHelp?.addEventListener('click',  (e) => { if (e.target === els.modalHelp)  _closeAllModals(); });

  // Atualiza label do gráfico ao trocar modo de medição
  document.querySelectorAll('input[name="measure"]').forEach(r => {
    r.addEventListener('change', () => charts.setMeasure(config.measure));
  });
}

function _closeAllModals() {
  if (els.modalClear) els.modalClear.hidden = true;
  if (els.modalReset) els.modalReset.hidden = true;
  if (els.modalHelp) els.modalHelp.hidden = true;
}

// ---- Handlers de ação ---------------------------------------------

async function _onConnectClick() {
  try {
    _applyConnState('waiting');
    await serial.connect();
    // Fallback: se não receber handshake em 3s, considera conectado
    setTimeout(() => {
      if (_connState === 'waiting') _applyConnState('connected');
    }, 3000);
  } catch (err) {
    _applyConnState('disconnected');
    console.warn('Conexão cancelada:', err.message);
  }
}

async function _onApplyClick() {
  const payload = config.getPayload();
  if (!payload) return;
  try {
    charts.clear();
    _cycleBuf = { t: null, medida: null, u: null };
    config.updateStats(0, 0, 0, 0);
    await serial.sendJson(payload);
    charts.setMeasure(config.measure);
    _applyConnState('running');
  } catch (err) {
    console.error('Falha ao enviar:', err);
  }
}

async function _onStopClick() {
  try {
    await serial.sendJson({ cmd: 'stop' });
    _applyConnState('stopping');
    // Retorna para 'connected' após 1 s
    if (_stopTimer) clearTimeout(_stopTimer);
    _stopTimer = setTimeout(() => {
      if (_connState === 'stopping') _applyConnState('connected');
    }, 1000);
  } catch (err) {
    console.error('Falha ao parar:', err);
  }
}

function _onPauseClick() {
  if (charts.isPaused) {
    charts.resume();
    els.iconPause.hidden  = false;
    els.iconResume.hidden = true;
    els.btnPause.title    = 'Pausar gráfico';
  } else {
    charts.pause();
    els.iconPause.hidden  = true;
    els.iconResume.hidden = false;
    els.btnPause.title    = 'Retomar gráfico';
  }
}

function _onExportClick() {
  const isVisible = els.csvVisible.checked;
  const samples = isVisible
    ? charts.getVisibleSamples()
    : charts.getAllSamples();
  exportCsv(samples, config.measure, isVisible);
}

// ---- Modais --------------------------------------------------------

function _openHelp(group) {
  const content = HELP_CONTENT[group];
  if (!content) return;
  els.modalHelpTitle.textContent = content.title;
  els.modalHelpBody.innerHTML    = content.html;
  els.modalHelp.hidden = false;
}

// ---- Parser de linhas seriais -------------------------------------

function _onSerialLine(line) {
  if (line.startsWith('{')) {
    try {
      const data = JSON.parse(line);
      if (data.status === 'ok' && (_connState === 'waiting')) {
        _applyConnState('connected');
      }
    } catch (_) {}
    return;
  }

  if (line.startsWith('>')) {
    const colon = line.indexOf(':');
    if (colon < 2) return;
    const name = line.substring(1, colon);
    const val  = parseFloat(line.substring(colon + 1));
    if (isNaN(val)) return;

    if (name === 't') {
      _cycleBuf.t = val;
    } else if (name === 'omega' || name === 'angulo') {
      _cycleBuf.medida = val;
    } else if (name === 'u_ident' || name === 'u') {
      _cycleBuf.u = val;
    }

    if (_cycleBuf.medida !== null && _cycleBuf.u !== null) {
      const t_ms = (_cycleBuf.t !== null) ? _cycleBuf.t : 0;
      charts.pushSample(t_ms, _cycleBuf.medida, _cycleBuf.u);

      // Atualiza resumo numérico em tempo real
      config.updateStats(
        charts.getSampleCount(),
        charts.getLastTime(),
        _cycleBuf.u,
        _cycleBuf.medida
      );

      _cycleBuf = { t: null, medida: null, u: null };
    }
  }
}

// ---- Máquina de estados da conexão ---------------------------------

const BADGE_CFG = {
  disconnected: { text: 'Desconectado', cls: 'badge--disconnected', showConn: true,  showDisc: false },
  waiting:      { text: 'Aguardando',   cls: 'badge--waiting',      showConn: false, showDisc: true  },
  connected:    { text: 'Conectado',    cls: 'badge--connected',     showConn: false, showDisc: true  },
  running:      { text: 'Identificando', cls: 'badge--running',     showConn: false, showDisc: true  },
  stopping:     { text: 'Parando',      cls: 'badge--stopping',      showConn: false, showDisc: true  },
};

function _applyConnState(state) {
  _connState = state;
  const cfg = BADGE_CFG[state];
  if (!cfg) return;

  els.badge.textContent   = cfg.text;
  els.badge.className     = `badge ${cfg.cls}`;
  els.badge.dataset.state = state;

  els.btnConnect.hidden    = !cfg.showConn;
  els.btnDisconnect.hidden = !cfg.showDisc;

  const isConn = state === 'connected' || state === 'running' || state === 'stopping';
  els.portName.textContent = isConn ? _portLabel() : '';
  els.btnApply.disabled    = !isConn || !config.isValid;
  els.btnStop.disabled     = !isConn;
}

function _updateApplyBtn(isValid) {
  const isConn = _connState === 'connected' || _connState === 'running' || _connState === 'stopping';
  els.btnApply.disabled = !isConn || !isValid;
}

function _portLabel() {
  const info = serial.getPortInfo();
  if (info.usbVendorId) {
    const vid = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase();
    const pid = (info.usbProductId ?? 0).toString(16).padStart(4, '0').toUpperCase();
    return `USB ${vid}:${pid}`;
  }
  return 'Porta Serial';
}

// ---- Resize: handle vertical (config | charts) --------------------

function _initResizeH() {
  const handle  = els.resizeH;
  const content = els.appContent;
  let dragging  = false;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = content.getBoundingClientRect();
    const minPx = 250;
    const maxPx = Math.max(minPx, rect.width - 320);
    const px = Math.max(minPx, Math.min(maxPx, e.clientX - rect.left));
    const pct = (px / rect.width) * 100;
    content.style.gridTemplateColumns = `${pct.toFixed(1)}% 5px 1fr`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    charts.resize();
  });
}

// ---- Resize: handle horizontal (chart1 | chart2) -----------------

function _initResizeCharts() {
  const handle = els.resizeCharts;
  const chart1 = els.chart1;
  let dragging = false;
  let startY   = 0;
  let startH1  = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startY   = e.clientY;
    startH1  = chart1.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const available = els.chartsArea.offsetHeight
      - els.toolbar.offsetHeight
      - handle.offsetHeight;
    const minH  = 100;
    let newH    = startH1 + (e.clientY - startY);
    newH        = Math.max(minH, Math.min(available - minH, newH));
    chart1.style.flex   = 'none';
    chart1.style.height = `${newH}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    charts.resize();
  });
}

// ---- Entrada -------------------------------------------------------

init();
