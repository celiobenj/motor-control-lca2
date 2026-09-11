// ============================================================
// main.js — ponto de entrada e orquestração dos módulos
// ============================================================

import { SerialManager }           from './serial.js';
import { ConfigPanel, HELP_CONTENT } from './config.js';
import { ChartManager }            from './charts.js';
import { exportCsv }               from './export.js';

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
  vecE:           document.getElementById('vec-e'),
  vecU:           document.getElementById('vec-u'),
  refLevels:      document.getElementById('ref-levels'),
  refInterval:    document.getElementById('ref-interval'),
  refUnit:        document.getElementById('ref-unit'),
  katexDisplay:   document.getElementById('katex-display'),

  // Charts
  canvasMain:     document.getElementById('chart-main'),
  canvasControl:  document.getElementById('chart-control'),
  timeWindow:     document.getElementById('time-window'),
  btnPause:       document.getElementById('btn-pause'),
  iconPause:      document.getElementById('icon-pause'),
  iconResume:     document.getElementById('icon-resume'),
  btnClear:       document.getElementById('btn-clear'),
  btnExport:      document.getElementById('btn-export'),
  csvAll:         document.getElementById('csv-all'),
  csvVisible:     document.getElementById('csv-visible'),

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
  { vecE: els.vecE, vecU: els.vecU, refLevels: els.refLevels,
    refInterval: els.refInterval, refUnit: els.refUnit, katexDisplay: els.katexDisplay },
  (isValid) => _updateApplyBtn(isValid)
);

// ---- Estado --------------------------------------------------------

let _connState = 'disconnected'; // disconnected | waiting | connected | running | stopping
let _pendingResetGroup = null;   // 'ref' | 'eq'
let _stopTimer = null;

// Trio de telemetria acumulado por ciclo
let _cycleBuf = { ref: null, medida: null, u: null };

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

  // Pausar / Retomar
  els.btnPause.addEventListener('click', _onPauseClick);

  // Limpar (com modal de confirmação)
  els.btnClear.addEventListener('click', () => { els.modalClear.hidden = false; });
  els.btnModalClearCancel.addEventListener('click',  () => { els.modalClear.hidden = true; });
  els.btnModalClearConfirm.addEventListener('click', () => { charts.clear(); els.modalClear.hidden = true; });

  // Exportar CSV
  els.btnExport.addEventListener('click', _onExportClick);

  // Botões de ajuda
  document.getElementById('btn-help-mode').addEventListener('click', () => _openHelp('mode'));
  document.getElementById('btn-help-ref').addEventListener('click',  () => _openHelp('ref'));
  document.getElementById('btn-help-eq').addEventListener('click',   () => _openHelp('eq'));

  // Fechar modal de ajuda
  els.btnModalHelpClose.addEventListener('click', () => { els.modalHelp.hidden = true; });
  els.modalHelp.addEventListener('click', (e) => { if (e.target === els.modalHelp) els.modalHelp.hidden = true; });

  // Botões de reset (com modal de confirmação)
  document.getElementById('btn-reset-ref').addEventListener('click', () => _openReset('ref'));
  document.getElementById('btn-reset-eq').addEventListener('click',  () => _openReset('eq'));
  els.btnModalResetCancel.addEventListener('click',  () => { els.modalReset.hidden = true; });
  els.btnModalResetConfirm.addEventListener('click', () => {
    if (_pendingResetGroup) config.resetGroup(_pendingResetGroup);
    els.modalReset.hidden = true;
  });

  // Atualiza label de medição ao trocar modo
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => charts.setMode(config.mode));
  });
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
    await serial.sendJson(payload);
    charts.setMode(config.mode);
    _applyConnState('running');
  } catch (err) {
    console.error('Falha ao enviar:', err);
  }
}

async function _onStopClick() {
  try {
    await serial.sendJson({ cmd: 'stop' });
    _applyConnState('stopping');
    // Retorna para 'connected' após 1,5 s
    if (_stopTimer) clearTimeout(_stopTimer);
    _stopTimer = setTimeout(() => {
      if (_connState === 'stopping') _applyConnState('connected');
    }, 1500);
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
  const samples = els.csvVisible.checked
    ? charts.getVisibleSamples()
    : charts.getAllSamples();
  exportCsv(samples, config.mode);
}

// ---- Modais --------------------------------------------------------

function _openHelp(group) {
  const content = HELP_CONTENT[group];
  els.modalHelpTitle.textContent = content.title;
  els.modalHelpBody.innerHTML    = content.html;
  els.modalHelp.hidden = false;
}

function _openReset(group) {
  _pendingResetGroup = group;
  const labels = { ref: 'referência cíclica', eq: 'equação de diferenças' };
  document.getElementById('modal-reset-text').textContent =
    `Restaurar os valores padrão da ${labels[group]} para o modo atual?`;
  els.modalReset.hidden = false;
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

    if      (name === 'ref')              _cycleBuf.ref    = val;
    else if (name === 'omega' || name === 'angulo') _cycleBuf.medida = val;
    else if (name === 'u')               _cycleBuf.u      = val;

    if (_cycleBuf.ref !== null && _cycleBuf.medida !== null && _cycleBuf.u !== null) {
      charts.pushSample(_cycleBuf.ref, _cycleBuf.medida, _cycleBuf.u);
      _cycleBuf = { ref: null, medida: null, u: null };
    }
  }
}

// ---- Máquina de estados da conexão ---------------------------------

const BADGE_CFG = {
  disconnected: { text: 'Desconectado', cls: 'badge--disconnected', showConn: true,  showDisc: false },
  waiting:      { text: 'Aguardando',   cls: 'badge--waiting',      showConn: false, showDisc: true  },
  connected:    { text: 'Conectado',    cls: 'badge--connected',     showConn: false, showDisc: true  },
  running:      { text: 'Rodando',      cls: 'badge--running',       showConn: false, showDisc: true  },
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
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.max(20, Math.min(68, pct));
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
