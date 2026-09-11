// ============================================================
// main.js — ponto de entrada e orquestração dos módulos
// ============================================================

import { SerialManager } from './serial.js';
import { ConfigPanel }   from './config.js';
import { ChartManager }  from './charts.js';
import { exportCsv }     from './export.js';

// ---- Referências de elementos DOM -----------------------------------

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

  // Export radio
  csvRangeAll:    document.getElementById('csv-all'),
  csvRangeVisible:document.getElementById('csv-visible'),

  // Modal de limpeza
  modalClear:     document.getElementById('modal-clear'),
  btnModalCancel: document.getElementById('btn-modal-cancel'),
  btnModalConfirm:document.getElementById('btn-modal-confirm'),

  // Aviso de compatibilidade
  compatWarning:  document.getElementById('compat-warning'),
};

// ---- Instâncias dos módulos -----------------------------------------

const serial = new SerialManager();
const charts = new ChartManager();

const config = new ConfigPanel(
  {
    vecE:         els.vecE,
    vecU:         els.vecU,
    refLevels:    els.refLevels,
    refInterval:  els.refInterval,
    refUnit:      els.refUnit,
    katexDisplay: els.katexDisplay,
  },
  (isValid) => _updateApplyButton(isValid)
);

// ---- Estado do buffer de telemetria (trio de dados por ciclo) --------
let _cycleBuf = { ref: null, medida: null, u: null };

// ---- Inicialização ---------------------------------------------------

function init() {
  // Verifica suporte à Web Serial API
  if (!navigator.serial) {
    els.compatWarning.hidden = false;
    els.btnConnect.disabled = true;
    return;
  }

  // Inicializa gráficos e painel de config
  charts.init(els.canvasMain, els.canvasControl);
  config.init();

  _bindEvents();
  _setConnectionState('disconnected');
}

// ---- Ligação de eventos ---------------------------------------------

function _bindEvents() {
  // Conexão serial
  els.btnConnect.addEventListener('click', _onConnectClick);
  els.btnDisconnect.addEventListener('click', () => serial.disconnect());

  // Ações do header
  els.btnApply.addEventListener('click', _onApplyClick);
  els.btnStop.addEventListener('click',  _onStopClick);

  // Eventos do SerialManager
  serial.addEventListener('line',         (e) => _onSerialLine(e.detail));
  serial.addEventListener('disconnected', ()  => _setConnectionState('disconnected'));

  // Janela de tempo
  els.timeWindow.addEventListener('change', () => {
    charts.setWindow(parseInt(els.timeWindow.value, 10));
  });

  // Pausar / Retomar
  els.btnPause.addEventListener('click', _onPauseClick);

  // Limpar dados
  els.btnClear.addEventListener('click', () => { els.modalClear.hidden = false; });
  els.btnModalCancel.addEventListener('click',  () => { els.modalClear.hidden = true; });
  els.btnModalConfirm.addEventListener('click', () => { charts.clear(); els.modalClear.hidden = true; });

  // Exportar CSV
  els.btnExport.addEventListener('click', _onExportClick);

  // Sincroniza label da série de medição ao trocar modo
  document.querySelectorAll('input[name="mode"]').forEach(r => {
    r.addEventListener('change', () => charts.setMode(config.mode));
  });
}

// ---- Handlers -------------------------------------------------------

async function _onConnectClick() {
  try {
    _setConnectionState('waiting');
    await serial.connect();
    // Estado 'connected' será definido ao receber {"status":"ok"}
    // Fallback: se não responder em 3 s, considera conectado mesmo assim
    setTimeout(() => {
      if (els.badge.dataset.state === 'waiting') _setConnectionState('connected');
    }, 3000);
  } catch (err) {
    _setConnectionState('disconnected');
    console.warn('Conexão cancelada ou falhou:', err.message);
  }
}

async function _onApplyClick() {
  const payload = config.getPayload();
  if (!payload) return;
  try {
    await serial.sendJson(payload);
    charts.setMode(config.mode);
  } catch (err) {
    console.error('Falha ao enviar:', err);
  }
}

async function _onStopClick() {
  try {
    await serial.sendJson({ cmd: 'stop' });
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
  const useVisible = els.csvRangeVisible.checked;
  const samples = useVisible ? charts.getVisibleSamples() : charts.getAllSamples();
  exportCsv(samples, config.mode);
}

// ---- Parser de linhas da serial ------------------------------------

function _onSerialLine(line) {
  // Resposta JSON (handshake, confirmação de comando)
  if (line.startsWith('{')) {
    try {
      const data = JSON.parse(line);
      if (data.status === 'ok' && els.badge.dataset.state !== 'connected') {
        _setConnectionState('connected');
      }
    } catch (_) {}
    return;
  }

  // Telemetria Teleplot: >nome:valor
  if (line.startsWith('>')) {
    const colon = line.indexOf(':');
    if (colon < 2) return;
    const name = line.substring(1, colon);
    const val  = parseFloat(line.substring(colon + 1));
    if (isNaN(val)) return;

    if      (name === 'ref')    _cycleBuf.ref    = val;
    else if (name === 'omega' || name === 'angulo') _cycleBuf.medida = val;
    else if (name === 'u')      _cycleBuf.u      = val;

    // Quando o trio estiver completo, registra no gráfico
    if (_cycleBuf.ref !== null && _cycleBuf.medida !== null && _cycleBuf.u !== null) {
      charts.pushSample(_cycleBuf.ref, _cycleBuf.medida, _cycleBuf.u);
      _cycleBuf = { ref: null, medida: null, u: null };
    }
  }
}

// ---- Estado de conexão (badge + botões) ----------------------------

function _setConnectionState(state) {
  els.badge.dataset.state = state;

  const cfg = {
    disconnected: {
      text:      'Desconectado',
      cls:       'badge--disconnected',
      showConn:  true,
      showDisc:  false,
      portText:  '',
    },
    waiting: {
      text:      'Aguardando ESP32',
      cls:       'badge--waiting',
      showConn:  false,
      showDisc:  true,
      portText:  '',
    },
    connected: {
      text:      'Conectado',
      cls:       'badge--connected',
      showConn:  false,
      showDisc:  true,
      portText:  _portLabel(),
    },
  }[state] ?? {};

  els.badge.textContent    = cfg.text;
  els.badge.className      = `badge ${cfg.cls}`;
  els.portName.textContent = cfg.portText;

  els.btnConnect.hidden    = !cfg.showConn;
  els.btnDisconnect.hidden = !cfg.showDisc;

  const isConnected = state === 'connected';
  els.btnApply.disabled = !isConnected || !config.isValid;
  els.btnStop.disabled  = !isConnected;
}

function _updateApplyButton(isValid) {
  if (els.badge.dataset.state === 'connected') {
    els.btnApply.disabled = !isValid;
  }
}

function _portLabel() {
  const info = serial.getPortInfo();
  if (info.usbVendorId) {
    const vid = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase();
    const pid = info.usbProductId?.toString(16).padStart(4, '0').toUpperCase() ?? '????';
    return `USB ${vid}:${pid}`;
  }
  return 'Porta Serial';
}

// ---- Entrada ---

init();
