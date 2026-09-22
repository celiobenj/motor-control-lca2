// ============================================================
// charts.js — dois gráficos Chart.js sincronizados
// ============================================================

/** @typedef {{ t_ms: number, t_s: number, ref: number, medida: number, u: number }} Sample */

function baseChartOptions(yLabel) {
  return {
    responsive:           true,
    maintainAspectRatio:  false,
    animation:            false,
    parsing:              false,
    normalized:           true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          font: { family: "'Roboto', Arial, sans-serif", size: 12 },
          color: '#555555',
          boxWidth: 16,
          boxHeight: 8,
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        enabled: true,
        backgroundColor: '#1A1A1A',
        titleFont:  { size: 12, family: "'Roboto', Arial, sans-serif" },
        bodyFont:   { size: 12, family: "'Roboto Mono', monospace" },
        padding: 9,
        callbacks: {
          title: items => `t = ${Number(items[0].parsed.x).toFixed(2)} s`,
          label: item  => ` ${item.dataset.label}: ${Number(item.parsed.y).toFixed(3)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        grid:   { color: '#E4E6EB' },
        border: { color: '#CCCCCC' },
        ticks: {
          font: { size: 12, family: "'Roboto', Arial, sans-serif" },
          color: '#777777',
          maxTicksLimit: 16,
          callback: v => `${Number(v).toFixed(0)}s`,
        },
      },
      y: {
        grid:   { color: '#E4E6EB' },
        border: { color: '#CCCCCC' },
        title: {
          display: yLabel !== '',
          text:    yLabel,
          font:    { size: 12 },
          color:   '#777777',
        },
        ticks: {
          font:  { size: 12, family: "'Roboto', Arial, sans-serif" },
          color: '#777777',
          maxTicksLimit: 10,
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
    this._windowSec  = 15;    // 0 = sem janela, padrão 15s
    this._rafPending = false;

    /** Snapshot tirado no momento da pausa — null quando não pausado. */
    this._pauseSnapshot = null;

    this._chartMain    = null;
    this._chartControl = null;
  }

  /** Inicializa os dois gráficos nos canvas informados. */
  init(canvasMain, canvasControl) {
    this._chartMain = new Chart(canvasMain, {
      type: 'line',
      data: {
        datasets: [
          {
            label:           'Referência',
            data:            [],
            borderColor:     '#2E7D32',
            backgroundColor: 'transparent',
            borderWidth:     2,
            // borderDash:      [6, 4],   // Referência pontilhada
            pointRadius:     0,
            showLine:        true,
            tension:         0,
          },
          {
            label:           'Medição',
            data:            [],
            borderColor:     '#E65100',
            backgroundColor: '#E65100',
            borderWidth:     0,
            pointRadius:     1.5,
            pointHoverRadius: 3.0,
            showLine:        false,
            tension:         0,
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
            label:           'u',
            data:            [],
            borderColor:     '#1A3A5C',
            backgroundColor: '#1A3A5C',
            borderWidth:     0,
            pointRadius:     1.5,
            pointHoverRadius: 3.0,
            showLine:        false,
            tension:         0,
          },
        ],
      },
      options: baseChartOptions('u (PWM)'),
    });
  }

  /**
   * Adiciona nova amostra de telemetria com timestamp do microcontrolador.
   * @param {number} t_ms tempo decorrido em ms vindo da ESP32
   * @param {number} ref medida de referência
   * @param {number} medida valor medido pelo sensor
   * @param {number} u sinal de controle (PWM)
   */
  pushSample(t_ms, ref, medida, u) {
    const t_s  = t_ms / 1000;

    this._all.push({ t_ms, t_s, ref, medida, u });

    // Quando pausado, não atualiza o gráfico nem o snapshot
    if (!this._isPaused) this._scheduleRender();
  }

  /** Define a janela de tempo visível em segundos (0 = sem janela). */
  setWindow(seconds) {
    this._windowSec = seconds;
    if (!this._isPaused) this._scheduleRender();
  }

  /** Atualiza o label da série de medição conforme o modo. */
  setMode(mode) {
    if (!this._chartMain) return;
    this._chartMain.data.datasets[1].label = mode === 'speed' ? 'Medição (rad/s)' : 'Medição (graus)';
  }

  /** Congela o gráfico e tira um snapshot do estado atual para exportação. */
  pause() {
    this._isPaused = true;
    // Snapshot: cópia dos dados acumulados e da fatia visível até este momento
    const { slice } = this._computeSlice();
    this._pauseSnapshot = {
      all:     [...this._all],
      visible: [...slice],
    };
  }

  /** Retoma a atualização do gráfico e descarta o snapshot. */
  resume() {
    this._isPaused      = false;
    this._pauseSnapshot = null;
    this._scheduleRender();
  }

  get isPaused() { return this._isPaused; }

  /** Apaga todos os dados e reinicia o relógio. */
  clear() {
    this._all            = [];
    this._timeOrigin     = null;
    this._pauseSnapshot  = null;
    this._applyToCharts([], [], [], 0, this._windowSec || null);
  }

  /**
   * Retorna todos os dados acumulados até o momento da pausa (ou atual).
   * @returns {Sample[]}
   */
  getAllSamples() {
    return this._pauseSnapshot?.all ?? this._all;
  }

  /**
   * Retorna somente as amostras visíveis na janela no momento da pausa (ou atual).
   * @returns {Sample[]}
   */
  getVisibleSamples() {
    return this._pauseSnapshot?.visible ?? this._computeSlice().slice;
  }

  /** Força o redimensionamento dos dois gráficos (após resize do painel). */
  resize() {
    this._chartMain?.resize();
    this._chartControl?.resize();
  }

  // ---- Renderização interna ------------------------------------------

  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  /**
   * Calcula a fatia de dados a exibir e os limites do eixo X.
   *
   * Comportamento:
   *   - Sem janela (0):  x de 0 até maxT, todos os dados.
   *   - Com janela, crescendo: x fixo de 0 até windowSec, dados crescem da esquerda.
   *   - Com janela, rolando:   x de (maxT - window) até maxT.
   */
  _computeSlice() {
    if (this._all.length === 0) {
      return { slice: [], minT: 0, maxT: this._windowSec || 1 };
    }

    const maxT = this._all[this._all.length - 1].t_s;

    // Sem janela de tempo
    if (this._windowSec === 0) {
      return { slice: this._all, minT: 0, maxT };
    }

    // Janela ainda não preenchida → gráfico cresce da esquerda (eixo X fixo)
    if (maxT < this._windowSec) {
      return { slice: this._all, minT: 0, maxT: this._windowSec };
    }

    // Janela preenchida → modo rolante
    const minT = maxT - this._windowSec;

    // Busca binária do índice inicial
    let lo = 0, hi = this._all.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this._all[mid].t_s < minT) lo = mid + 1; else hi = mid - 1;
    }

    return { slice: this._all.slice(lo), minT, maxT };
  }

  _render() {
    if (!this._chartMain || !this._chartControl) return;
    const { slice, minT, maxT } = this._computeSlice();

    this._applyToCharts(
      slice.map(s => ({ x: s.t_s, y: s.ref })),
      slice.map(s => ({ x: s.t_s, y: s.medida })),
      slice.map(s => ({ x: s.t_s, y: s.u })),
      minT,
      maxT,
    );
  }

  _applyToCharts(refData, medidaData, uData, minT, maxT) {
    this._chartMain.data.datasets[0].data = refData;
    this._chartMain.data.datasets[1].data = medidaData;
    this._setXRange(this._chartMain, minT, maxT);
    this._chartMain.update('none');

    this._chartControl.data.datasets[0].data = uData;
    this._setXRange(this._chartControl, minT, maxT);
    this._chartControl.update('none');
  }

  _setXRange(chart, minT, maxT) {
    chart.options.scales.x.min = minT ?? undefined;
    chart.options.scales.x.max = (maxT != null && maxT > (minT ?? 0)) ? maxT : (minT ?? 0) + 1;
  }
}
