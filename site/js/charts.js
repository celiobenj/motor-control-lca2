// ============================================================
// charts.js — dois gráficos Chart.js sincronizados
// ============================================================

/** @typedef {{ t_ms: number, t_s: number, ref: number, medida: number, u: number }} Sample */

// Configuração base compartilhada para ambos os gráficos
function baseChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,      // dados já estão no formato {x, y}
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          font: { family: "'Roboto', Arial, sans-serif", size: 11 },
          color: '#555555',
          boxWidth: 14,
          boxHeight: 2,
          padding: 10,
          usePointStyle: false,
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: '#1A1A1A',
        titleFont: { size: 11 },
        bodyFont: { size: 11, family: "'Roboto Mono', monospace" },
        padding: 8,
        callbacks: {
          title: items => `t = ${Number(items[0].parsed.x).toFixed(2)} s`,
          label: item => ` ${item.dataset.label}: ${Number(item.parsed.y).toFixed(3)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid: { color: '#EBEBEB' },
        border: { color: '#CCCCCC' },
        ticks: {
          font: { size: 11, family: "'Roboto', Arial, sans-serif" },
          color: '#777777',
          maxTicksLimit: 8,
          callback: v => `${Number(v).toFixed(0)}s`,
        },
      },
      y: {
        grid: { color: '#EBEBEB' },
        border: { color: '#CCCCCC' },
        title: {
          display: yLabel !== '',
          text: yLabel,
          font: { size: 11 },
          color: '#777777',
        },
        ticks: {
          font: { size: 11, family: "'Roboto', Arial, sans-serif" },
          color: '#777777',
          maxTicksLimit: 6,
        },
      },
    },
  };
}

export class ChartManager {
  constructor() {
    /** @type {Sample[]} */
    this._all = [];
    this._timeOrigin = null;
    this._isPaused   = false;
    this._windowSec  = 30;   // 0 = sem janela
    this._rafPending = false;
    this._mode       = 'speed';

    /** @type {import('chart.js').Chart|null} */
    this._chartMain    = null;
    this._chartControl = null;
  }

  /** Inicializa os dois gráficos Chart.js nos canvas fornecidos. */
  init(canvasMain, canvasControl) {
    this._chartMain = new Chart(canvasMain, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Referência',
            data: [],
            borderColor: '#1A3A5C',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: 'Medição',
            data: [],
            borderColor: '#2E7D32',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: baseChartOptions(''),
    });

    this._chartControl = new Chart(canvasControl, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'u',
            data: [],
            borderColor: '#E65100',
            backgroundColor: 'rgba(230, 81, 0, 0.06)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
        ],
      },
      options: baseChartOptions('u (PWM)'),
    });
  }

  /**
   * Adiciona uma nova amostra de telemetria.
   * @param {number} ref    valor de referência
   * @param {number} medida medição do sensor
   * @param {number} u      sinal de controle (PWM)
   */
  pushSample(ref, medida, u) {
    const now = performance.now();
    if (this._timeOrigin === null) this._timeOrigin = now;
    const t_ms = Math.round(now - this._timeOrigin);
    const t_s  = t_ms / 1000;

    this._all.push({ t_ms, t_s, ref, medida, u });

    if (!this._isPaused) this._scheduleRender();
  }

  /** Define a janela de tempo visível (0 = tudo). */
  setWindow(seconds) {
    this._windowSec = seconds;
    this._scheduleRender();
  }

  /** Atualiza o label da série de medição com base no modo. */
  setMode(mode) {
    this._mode = mode;
    const label = mode === 'speed' ? 'Medição (rad/s)' : 'Medição (graus)';
    if (this._chartMain) {
      this._chartMain.data.datasets[1].label = label;
    }
  }

  pause()  { this._isPaused = true; }
  resume() { this._isPaused = false; this._scheduleRender(); }
  get isPaused() { return this._isPaused; }

  /** Apaga todos os dados e reinicia o relógio. */
  clear() {
    this._all = [];
    this._timeOrigin = null;
    this._applyToCharts([], [], [], null, null);
  }

  /** Retorna todas as amostras acumuladas. */
  getAllSamples() { return this._all; }

  /** Retorna somente as amostras atualmente visíveis no gráfico. */
  getVisibleSamples() {
    return this._computeSlice().slice;
  }

  // ---- Renderização interna -------------------------------------------

  /** Agenda uma atualização via requestAnimationFrame para evitar excesso de renders. */
  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  _computeSlice() {
    if (this._all.length === 0) return { slice: [], minT: 0, maxT: 0 };
    const maxT = this._all[this._all.length - 1].t_s;

    if (this._windowSec === 0) {
      return { slice: this._all, minT: 0, maxT };
    }

    const minT = maxT - this._windowSec;
    let startIdx = 0;
    // Busca binária do índice inicial
    let lo = 0, hi = this._all.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this._all[mid].t_s < minT) { lo = mid + 1; } else { hi = mid - 1; }
    }
    startIdx = lo;

    return { slice: this._all.slice(startIdx), minT, maxT };
  }

  _render() {
    if (!this._chartMain || !this._chartControl) return;
    const { slice, minT, maxT } = this._computeSlice();

    const refData    = slice.map(s => ({ x: s.t_s, y: s.ref }));
    const medidaData = slice.map(s => ({ x: s.t_s, y: s.medida }));
    const uData      = slice.map(s => ({ x: s.t_s, y: s.u }));

    this._applyToCharts(refData, medidaData, uData, minT, maxT);
  }

  _applyToCharts(refData, medidaData, uData, minT, maxT) {
    // Gráfico principal
    this._chartMain.data.datasets[0].data = refData;
    this._chartMain.data.datasets[1].data = medidaData;
    this._setXRange(this._chartMain, minT, maxT);
    this._chartMain.update('none');

    // Gráfico de controle
    this._chartControl.data.datasets[0].data = uData;
    this._setXRange(this._chartControl, minT, maxT);
    this._chartControl.update('none');
  }

  _setXRange(chart, minT, maxT) {
    if (minT === null || maxT === null) {
      chart.options.scales.x.min = undefined;
      chart.options.scales.x.max = undefined;
    } else {
      chart.options.scales.x.min = minT;
      chart.options.scales.x.max = maxT > minT ? maxT : minT + 1;
    }
  }
}
