// ============================================================
// charts.js — dois gráficos Chart.js sincronizados para identificação
// ============================================================

/** @typedef {{ t_ms: number, t_s: number, medida: number, u: number }} Sample */

/** Formata valores do tooltip: inteiros quando exatos ou com até 2 casas decimais */
function formatSampleValue(val) {
  const num = Number(val);
  if (isNaN(num)) return '';
  if (Number.isInteger(num) || Math.abs(num - Math.round(num)) < 1e-4) {
    return Math.round(num).toString();
  }
  return num.toFixed(2);
}

/** Plugin Chart.js para desenhar linha vertical tracejada sincronizada nos dois gráficos */
const dualCrosshairPlugin = {
  id: 'dualCrosshair',
  afterDatasetsDraw: (chart) => {
    const manager = chart._manager;
    if (!manager || !manager._cursorVisible || manager._hoveredTime == null) return;
    const xScale = chart.scales?.x;
    if (!xScale) return;

    const xPixel = xScale.getPixelForValue(manager._hoveredTime);
    const { top, bottom, left, right } = chart.chartArea;
    if (xPixel < left || xPixel > right) return;

    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(74, 85, 104, 0.75)';
    ctx.moveTo(xPixel, top);
    ctx.lineTo(xPixel, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

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
        backgroundColor: 'rgba(26, 32, 44, 0.82)',
        borderColor:     'rgba(255, 255, 255, 0.18)',
        borderWidth:     1,
        cornerRadius:    6,
        boxPadding:      4,
        padding:         9,
        titleFont:  { size: 12, family: "'Roboto', Arial, sans-serif" },
        bodyFont:   { size: 12, family: "'Roboto Mono', monospace" },
        callbacks: {
          title: items => `t = ${Number(items[0].parsed.x).toFixed(3)} s`,
          label: item  => ` ${item.dataset.label}: ${formatSampleValue(item.parsed.y)}`,
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
    this._isPaused   = false;
    this._windowSec  = 15;    // 0 = sem janela, padrão 15s
    this._rafPending = false;
    this._cursorVisible = true;
    this._hoveredTime = null;
    this._mouseState  = null;

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
            label:           'Resposta y(t)',
            data:            [],
            borderColor:     '#E65100',
            backgroundColor: '#E65100',
            borderWidth:     1.5,
            pointRadius:     1,
            pointHoverRadius: 4,
            pointHitRadius:  8,
            showLine:        true,
            tension:         0,
          },
        ],
      },
      options: baseChartOptions('Velocidade (rad/s)'),
      plugins: [dualCrosshairPlugin],
    });

    this._chartControl = new Chart(canvasControl, {
      type: 'line',
      data: {
        datasets: [
          {
            label:           'u(t) [PWM]',
            data:            [],
            borderColor:     '#1A3A5C',
            backgroundColor: '#1A3A5C',
            borderWidth:     1.5,
            pointRadius:     0,
            pointHoverRadius: 4,
            pointHitRadius:  8,
            showLine:        true,
            stepped:         'before',
            tension:         0,
          },
        ],
      },
      options: baseChartOptions('u (PWM)'),
      plugins: [dualCrosshairPlugin],
    });

    this._chartMain._manager    = this;
    this._chartControl._manager = this;

    this._setupSync(canvasMain, canvasControl);
  }

  /**
   * Adiciona nova amostra de telemetria com timestamp da ESP32.
   * @param {number} t_ms tempo decorrido em ms
   * @param {number} medida valor medido (omega ou angulo)
   * @param {number} u sinal de excitacao PRBS (PWM: +255 ou -255)
   */
  pushSample(t_ms, medida, u) {
    const t_s = t_ms / 1000;
    this._all.push({ t_ms, t_s, medida, u });

    if (!this._isPaused) this._scheduleRender();
  }

  /** Define a janela de tempo visivel em segundos (0 = sem janela). */
  setWindow(seconds) {
    this._windowSec = seconds;
    if (!this._isPaused) this._scheduleRender();
  }

  /** Define se o cursor esta visivel. */
  setCursorVisible(visible) {
    this._cursorVisible = visible;
    if (this._chartMain) {
      this._chartMain.options.plugins.tooltip.enabled = visible;
      this._chartMain.update('none');
    }
    if (this._chartControl) {
      this._chartControl.options.plugins.tooltip.enabled = visible;
      this._chartControl.update('none');
    }
  }

  /** Alterna o rótulo do eixo Y de acordo com a grandeza selecionada */
  setMeasure(measure) {
    const yLabel = measure === 'speed' ? 'Velocidade (rad/s)' : 'Posição (rad)';
    if (this._chartMain) {
      this._chartMain.options.scales.y.title.text = yLabel;
      this._chartMain.data.datasets[0].label = `Resposta y(t) [${measure === 'speed' ? 'rad/s' : 'rad'}]`;
      this._chartMain.update('none');
    }
    const labelEl = document.getElementById('chart1-label');
    if (labelEl) {
      labelEl.textContent = `Resposta y(t) — ${yLabel}`;
    }
  }

  /** Pausa a atualização dos gráficos. */
  pause() {
    this._isPaused = true;
    this._pauseSnapshot = this._getSnapshot();
  }

  /** Retoma a atualização dos gráficos. */
  resume() {
    this._isPaused = false;
    this._pauseSnapshot = null;
    this._scheduleRender();
  }

  get isPaused() { return this._isPaused; }

  /** Limpa todos os dados acumulados. */
  clear() {
    this._all = [];
    this._pauseSnapshot = null;
    this._hoveredTime = null;
    this._mouseState = null;

    if (this._chartMain) {
      this._chartMain.data.datasets[0].data = [];
      this._chartMain.options.scales.x.min = 0;
      this._chartMain.options.scales.x.max = this._windowSec > 0 ? this._windowSec : 15;
      this._chartMain.update('none');
    }

    if (this._chartControl) {
      this._chartControl.data.datasets[0].data = [];
      this._chartControl.options.scales.x.min = 0;
      this._chartControl.options.scales.x.max = this._windowSec > 0 ? this._windowSec : 15;
      this._chartControl.update('none');
    }
  }

  /** Força o redimensionamento dos canvas */
  resize() {
    if (this._chartMain) this._chartMain.resize();
    if (this._chartControl) this._chartControl.resize();
  }

  /** Retorna todas as amostras acumuladas */
  getAllSamples() {
    return this._all;
  }

  /** Retorna amostras dentro da janela visível */
  getVisibleSamples() {
    const snapshot = this._isPaused ? this._pauseSnapshot : this._getSnapshot();
    return snapshot ? snapshot.samples : this._all;
  }

  getSampleCount() { return this._all.length; }
  getLastTime()    { return this._all.length > 0 ? this._all[this._all.length - 1].t_s : 0; }
  getLastU()       { return this._all.length > 0 ? this._all[this._all.length - 1].u : null; }
  getLastY()       { return this._all.length > 0 ? this._all[this._all.length - 1].medida : null; }

  // ---- Renderização interna ------------------------------------------

  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  _getSnapshot() {
    if (this._all.length === 0) return null;
    const lastT = this._all[this._all.length - 1].t_s;

    if (this._windowSec <= 0) {
      return {
        samples: this._all,
        xMin: 0,
        xMax: Math.max(lastT, 15),
      };
    }

    const xMin = Math.max(0, lastT - this._windowSec);
    const xMax = Math.max(xMin + this._windowSec, 15);

    // Busca binária para filtrar janela
    let low = 0;
    let high = this._all.length - 1;
    let startIdx = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (this._all[mid].t_s >= xMin) {
        startIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return {
      samples: this._all.slice(startIdx),
      xMin,
      xMax,
    };
  }

  _render() {
    if (!this._chartMain || !this._chartControl) return;

    const snapshot = this._getSnapshot();
    if (!snapshot) return;

    const { samples, xMin, xMax } = snapshot;

    const dataMedida = new Array(samples.length);
    const dataU      = new Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      dataMedida[i] = { x: s.t_s, y: s.medida };
      dataU[i]      = { x: s.t_s, y: s.u };
    }

    this._chartMain.data.datasets[0].data = dataMedida;
    this._chartMain.options.scales.x.min  = xMin;
    this._chartMain.options.scales.x.max  = xMax;
    this._chartMain.update('none');

    this._chartControl.data.datasets[0].data = dataU;
    this._chartControl.options.scales.x.min  = xMin;
    this._chartControl.options.scales.x.max  = xMax;
    this._chartControl.update('none');

    if (this._cursorVisible && this._mouseState) {
      this._retriggerHover(this._mouseState);
    }
  }

  // ---- Sincronização entre gráficos ----------------------------------

  _setupSync(canvasMain, canvasControl) {
    const handleMove = (srcChart, destChart, evt) => {
      if (!this._cursorVisible) return;
      const rect = srcChart.canvas.getBoundingClientRect();
      const xPixel = evt.clientX - rect.left;
      const xVal = srcChart.scales.x.getValueForPixel(xPixel);
      if (xVal == null) return;

      this._hoveredTime = xVal;
      this._mouseState = { canvas: srcChart.canvas, clientX: evt.clientX, clientY: evt.clientY };

      const destRect = destChart.canvas.getBoundingClientRect();
      const destXPixel = destChart.scales.x.getPixelForValue(xVal);
      const destYPixel = destRect.height / 2;

      destChart.setActiveElements([
        ...this._findNearestElements(destChart, destXPixel)
      ]);
      destChart.tooltip?.setActiveElements(
        this._findNearestElements(destChart, destXPixel),
        { x: destXPixel, y: destYPixel }
      );
      destChart.update('none');
      srcChart.update('none');
    };

    const handleLeave = (chartA, chartB) => {
      this._hoveredTime = null;
      this._mouseState = null;
      chartA.setActiveElements([]);
      chartA.tooltip?.setActiveElements([], {});
      chartB.setActiveElements([]);
      chartB.tooltip?.setActiveElements([], {});
      chartA.update('none');
      chartB.update('none');
    };

    canvasMain.addEventListener('mousemove', (e) => handleMove(this._chartMain, this._chartControl, e));
    canvasControl.addEventListener('mousemove', (e) => handleMove(this._chartControl, this._chartMain, e));

    canvasMain.addEventListener('mouseleave', () => handleLeave(this._chartMain, this._chartControl));
    canvasControl.addEventListener('mouseleave', () => handleLeave(this._chartControl, this._chartMain));
  }

  _findNearestElements(chart, xPixel) {
    const elements = [];
    chart.data.datasets.forEach((ds, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || meta.hidden) return;
      let closest = null;
      let minDiff = Infinity;
      meta.data.forEach((elem, index) => {
        const diff = Math.abs(elem.x - xPixel);
        if (diff < minDiff && diff < 30) {
          minDiff = diff;
          closest = { datasetIndex: dsIndex, index };
        }
      });
      if (closest) elements.push(closest);
    });
    return elements;
  }

  _retriggerHover({ canvas, clientX, clientY }) {
    const isMain = canvas === this._chartMain.canvas;
    const srcChart = isMain ? this._chartMain : this._chartControl;
    const destChart = isMain ? this._chartControl : this._chartMain;

    const rect = srcChart.canvas.getBoundingClientRect();
    const xPixel = clientX - rect.left;
    const xVal = srcChart.scales.x.getValueForPixel(xPixel);
    if (xVal == null) return;

    this._hoveredTime = xVal;
    const destRect = destChart.canvas.getBoundingClientRect();
    const destXPixel = destChart.scales.x.getPixelForValue(xVal);

    srcChart.setActiveElements(this._findNearestElements(srcChart, xPixel));
    srcChart.tooltip?.setActiveElements(this._findNearestElements(srcChart, xPixel), { x: xPixel, y: clientY - rect.top });
    srcChart.update('none');

    destChart.setActiveElements(this._findNearestElements(destChart, destXPixel));
    destChart.tooltip?.setActiveElements(this._findNearestElements(destChart, destXPixel), { x: destXPixel, y: destRect.height / 2 });
    destChart.update('none');
  }
}
