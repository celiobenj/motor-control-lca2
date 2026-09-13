// ============================================================
// config.js — painel de configuração, validação, KaTeX e Gauge
// ============================================================

// ---- Padrões por modo -----------------------------------------------

const _DEFAULTS = {
  speed: {
    refType:     'internal',
    refLevels:   '5, 12, 6, 2',
    refInterval: '6',
    refMin:      '0',
    refMax:      '15',
    vecE:        '1',
    vecU:        '1',
  },
  position: {
    refType:     'internal',
    refLevels:   '30, 90, 150, 100',
    refInterval: '6',
    refMin:      '0',
    refMax:      '180',
    vecE:        '6.9, -6.8',
    vecU:        '1',
  },
};

const UNIT_LABELS = { speed: 'rad/s', position: 'graus' };

// ---- Conteúdo dos modais de ajuda -----------------------------------

export const HELP_CONTENT = {
  mode: {
    title: 'Modo de Controle',
    html: `
      <p><strong>Velocidade:</strong> Controla a velocidade angular do eixo do motor.
      A referência e a medição são expressas em <strong>rad/s</strong>.
      O sinal de controle u é restrito ao intervalo [0, 255] (PWM unidirecional — motor gira apenas em um sentido).</p>
      <p><strong>Posição:</strong> Controla o ângulo do eixo do motor.
      A referência e a medição são expressas em <strong>graus</strong>.
      O sinal de controle u pode variar entre [−255, 255] (PWM bidirecional — motor pode girar nos dois sentidos).</p>
    `,
  },
  ref: {
    title: 'Referência',
    html: `
      <p><strong>Interna:</strong> Percorre ciclicamente os níveis de referência definidos em degraus pelo intervalo de tempo estipulado.</p>
      <p><strong>Externa:</strong> Utiliza o potenciômetro físico da planta.
      A leitura analógica (0% a 100%) é mapeada linearmente entre os limites <strong>Mínimo</strong> e <strong>Máximo</strong> configurados.</p>
      <hr>
      <p><strong>Padrão Velocidade:</strong> Níveis <code>5, 12, 6, 2</code> (6 s) | Potenciômetro: <code>0</code> a <code>15</code> rad/s</p>
      <p><strong>Padrão Posição:</strong> Níveis <code>30, 90, 150, 100</code> (6 s) | Potenciômetro: <code>0</code> a <code>180</code> graus</p>
    `,
  },
  eq: {
    title: 'Equação de Diferenças',
    html: `
      <p>O controlador é definido como:</p>
      <p><code>u[k] = c_e0·e[k] + c_e1·e[k−1] + ... + c_u1·u[k−1] + ...</code></p>
      <p><strong>e[ ]:</strong> Coeficientes de erro. O primeiro coeficiente multiplica <code>e[k]</code>, o segundo <code>e[k−1]</code>, e assim por diante.</p>
      <p><strong>u[ ]:</strong> Coeficientes de saída passada. O primeiro multiplica <code>u[k−1]</code>, o segundo <code>u[k−2]</code>, etc. Pode ser deixado vazio.</p>
      <p>A ordem do controlador é determinada pelo vetor de maior comprimento. Coeficientes ausentes valem 0.</p>
      <hr>
      <p><strong>Padrão Velocidade:</strong> <code>e[] = 1</code> &nbsp; <code>u[] = 1</code></p>
      <p><strong>Padrão Posição:</strong> <code>e[] = 6.9, -6.8</code> &nbsp; <code>u[] = 1</code></p>
    `,
  },
};

// ---- Helpers de validação -------------------------------------------

/** Parseia string "1.0, -2.5, 3" em float[]. Retorna null se inválido. */
function parseVec(str) {
  const s = str.trim();
  if (!s) return [];
  return s.split(',').reduce((acc, p) => {
    if (acc === null) return null;
    const v = parseFloat(p.trim());
    return (isNaN(v) || p.trim() === '') ? null : [...acc, v];
  }, []);
}

/** Formata float com até 6 dígitos significativos. */
function fmtNum(v) {
  return parseFloat(v.toPrecision(6)).toString();
}

/** Gera string LaTeX da equação de diferenças. */
function buildLatex(eArr, uArr) {
  const terms = [];
  for (let i = 0; i < eArr.length; i++) {
    if (eArr[i] === 0) continue;
    terms.push({ coef: eArr[i], label: i === 0 ? 'e[k]' : `e[k-${i}]` });
  }
  for (let i = 0; i < uArr.length; i++) {
    if (uArr[i] === 0) continue;
    terms.push({ coef: uArr[i], label: `u[k-${i + 1}]` });
  }
  if (terms.length === 0) return 'u[k] = 0';

  return 'u[k] = ' + terms.map(({ coef, label }, idx) => {
    const a = fmtNum(Math.abs(coef));
    if (idx === 0) return `${fmtNum(coef)} \\cdot ${label}`;
    return coef >= 0 ? ` + ${a} \\cdot ${label}` : ` - ${a} \\cdot ${label}`;
  }).join('');
}

// ---- Classe principal -----------------------------------------------

export class ConfigPanel {
  /**
   * @param {object}   elements       refs de elementos DOM
   * @param {function} onValidChange  callback(isValid: boolean)
   */
  constructor(elements, onValidChange) {
    this._els = elements;
    this._onValidChange = onValidChange;

    // Estado salvo por modo
    this._modeState = {
      speed:    { ..._DEFAULTS.speed },
      position: { ..._DEFAULTS.position },
    };

    this._currentMode = 'speed';
    this._refType     = 'internal';
    this._lastPotNorm = 0.0;
    this._lastRef     = null;

    this._bind();
  }

  // ---- API pública ----------------------------------------------------

  get mode() {
    return document.querySelector('input[name="mode"]:checked')?.value ?? 'speed';
  }

  get refType() {
    return this._refType;
  }

  get isValid() {
    const e = parseVec(this._els.vecE.value);
    const u = parseVec(this._els.vecU.value);
    const eqOk = (
      e !== null &&
      u !== null &&
      ((e?.length ?? 0) > 0 || (u?.length ?? 0) > 0)
    );

    if (this._refType === 'external') {
      const min = parseFloat(this._els.refMin.value);
      const max = parseFloat(this._els.refMax.value);
      const extOk = !isNaN(min) && !isNaN(max) && min < max;
      return eqOk && extOk;
    } else {
      const l = parseVec(this._els.refLevels.value);
      const iv = parseInt(this._els.refInterval.value, 10);
      const intOk = l !== null && l.length > 0 && !isNaN(iv) && iv >= 1;
      return eqOk && intOk;
    }
  }

  /** Retorna payload JSON pronto para envio à ESP32. */
  getPayload() {
    if (!this.isValid) return null;
    const eArr = parseVec(this._els.vecE.value) ?? [];
    const uArr = parseVec(this._els.vecU.value) ?? [];
    const order = Math.max(eArr.length, uArr.length);

    const minVal = parseFloat(this._els.refMin.value);
    const maxVal = parseFloat(this._els.refMax.value);

    return {
      mode:       this.mode,
      ref_type:   this._refType,
      ref_min:    isNaN(minVal) ? 0.0 : minVal,
      ref_max:    isNaN(maxVal) ? 15.0 : maxVal,
      order,
      coeff_e:    Array.from({ length: order }, (_, i) => eArr[i] ?? 0),
      coeff_u:    Array.from({ length: order }, (_, i) => uArr[i] ?? 0),
      levels:     parseVec(this._els.refLevels.value),
      interval_s: parseInt(this._els.refInterval.value, 10),
    };
  }

  /** Alterna o tipo de referência ('internal' | 'external'). */
  setRefType(type) {
    this._refType = type;
    const isInt = type === 'internal';

    this._els.btnRefInternal.classList.toggle('active', isInt);
    this._els.btnRefExternal.classList.toggle('active', !isInt);

    this._els.refInternalGroup.hidden = !isInt;
    this._els.refExternalGroup.hidden = isInt;

    this._modeState[this.mode].refType = type;
    this._updateGaugeScaleLabels();
    this._validate();
    this.updateGauge(this._lastPotNorm, this._lastRef);
  }

  /** Atualiza a gauge com a posição normalizada do potenciômetro e o valor nominal. */
  updateGauge(potNorm, currentRef) {
    this._lastPotNorm = potNorm;
    this._lastRef     = currentRef;

    const clampedPot = Math.max(0, Math.min(1, potNorm));
    const pct = Math.round(clampedPot * 100);

    // Comprimento do arco de 180° = pi * 54 = ~169.65
    const totalArc = 169.65;
    const offset = totalArc * (1 - clampedPot);

    if (this._els.gaugeFill) {
      this._els.gaugeFill.style.strokeDashoffset = offset.toFixed(2);
    }
    if (this._els.potPct) {
      this._els.potPct.textContent = `Potenciômetro: ${pct}%`;
    }

    if (this._els.gaugeValue) {
      const unit = UNIT_LABELS[this.mode];
      let valStr;
      if (currentRef !== undefined && currentRef !== null) {
        valStr = currentRef.toFixed(1);
      } else {
        const min = parseFloat(this._els.refMin.value) || 0;
        const max = parseFloat(this._els.refMax.value) || 15;
        valStr = (min + clampedPot * (max - min)).toFixed(1);
      }
      this._els.gaugeValue.textContent = `${valStr} ${unit}`;
    }
  }

  /**
   * Restaura os valores padrão de um grupo específico para o modo atual.
   * @param {'ref'|'eq'} group
   */
  resetGroup(group) {
    const mode = this.mode;
    const def  = _DEFAULTS[mode];
    if (group === 'ref') {
      this._els.refLevels.value   = def.refLevels;
      this._els.refInterval.value = def.refInterval;
      this._els.refMin.value      = def.refMin;
      this._els.refMax.value      = def.refMax;

      this._modeState[mode].refLevels   = def.refLevels;
      this._modeState[mode].refInterval = def.refInterval;
      this._modeState[mode].refMin      = def.refMin;
      this._modeState[mode].refMax      = def.refMax;

      this.setRefType('internal');
    } else if (group === 'eq') {
      this._els.vecE.value = def.vecE;
      this._els.vecU.value = def.vecU;
      this._modeState[mode].vecE = def.vecE;
      this._modeState[mode].vecU = def.vecU;
    }
    this._validate();
  }

  /** Inicializa o painel com os valores do estado inicial. */
  init() {
    this._applyState(this._modeState[this._currentMode]);
    this._validate();
    this.updateGauge(0.0, null);
  }

  // ---- Métodos internos -----------------------------------------------

  _bind() {
    const { vecE, vecU, refLevels, refInterval, refMin, refMax, btnRefInternal, btnRefExternal } = this._els;

    [vecE, vecU, refLevels, refInterval, refMin, refMax].forEach(el => {
      el.addEventListener('input', () => {
        this._updateGaugeScaleLabels();
        this._validate();
        this.updateGauge(this._lastPotNorm, this._lastRef);
      });
    });

    btnRefInternal.addEventListener('click', () => this.setRefType('internal'));
    btnRefExternal.addEventListener('click', () => this.setRefType('external'));

    document.querySelectorAll('input[name="mode"]').forEach(r => {
      r.addEventListener('change', () => this._onModeChange());
    });
  }

  _onModeChange() {
    const newMode = this.mode;
    // Salva estado atual antes de trocar
    this._modeState[this._currentMode] = this._captureInputs();
    // Carrega estado do novo modo
    this._applyState(this._modeState[newMode]);
    this._currentMode = newMode;
    this._validate();
    this.updateGauge(this._lastPotNorm, this._lastRef);
  }

  _captureInputs() {
    return {
      refType:     this._refType,
      refLevels:   this._els.refLevels.value,
      refInterval: this._els.refInterval.value,
      refMin:      this._els.refMin.value,
      refMax:      this._els.refMax.value,
      vecE:        this._els.vecE.value,
      vecU:        this._els.vecU.value,
    };
  }

  _applyState(state) {
    this._els.refLevels.value   = state.refLevels;
    this._els.refInterval.value = state.refInterval;
    this._els.refMin.value      = state.refMin;
    this._els.refMax.value      = state.refMax;
    this._els.vecE.value        = state.vecE;
    this._els.vecU.value        = state.vecU;

    const unit = UNIT_LABELS[this.mode];
    this._els.refUnit.textContent    = unit;
    this._els.refMinUnit.textContent = unit;
    this._els.refMaxUnit.textContent = unit;

    this.setRefType(state.refType || 'internal');
    this._updateGaugeScaleLabels();
  }

  _updateGaugeScaleLabels() {
    if (this._els.gaugeLabelMin) {
      this._els.gaugeLabelMin.textContent = this._els.refMin.value;
    }
    if (this._els.gaugeLabelMax) {
      this._els.gaugeLabelMax.textContent = this._els.refMax.value;
    }
  }

  _validate() {
    const eArr = parseVec(this._els.vecE.value);
    const uArr = parseVec(this._els.vecU.value);
    const eEmpty = this._els.vecE.value.trim() === '';

    this._setErr(this._els.vecE, eArr === null || eEmpty);
    this._setErr(this._els.vecU, uArr === null);

    if (this._refType === 'external') {
      const min = parseFloat(this._els.refMin.value);
      const max = parseFloat(this._els.refMax.value);
      const err = isNaN(min) || isNaN(max) || min >= max;
      this._setErr(this._els.refMin, err);
      this._setErr(this._els.refMax, err);
    } else {
      const lArr = parseVec(this._els.refLevels.value);
      const iv   = parseInt(this._els.refInterval.value, 10);
      this._setErr(this._els.refLevels,  lArr === null || lArr.length === 0);
      this._setErr(this._els.refInterval, isNaN(iv) || iv < 1);
    }

    this._renderKatex(eArr, uArr);
    this._onValidChange(this.isValid);
  }

  _setErr(el, isErr) { el.classList.toggle('is-invalid', isErr); }

  _renderKatex(eArr, uArr) {
    const container = this._els.katexDisplay;
    if (eArr === null || uArr === null) {
      container.innerHTML = '<span class="katex-placeholder">Coeficientes inválidos</span>';
      return;
    }
    if (eArr.length === 0 && uArr.length === 0) {
      container.innerHTML = '<span class="katex-placeholder">Insira os coeficientes</span>';
      return;
    }
    const latex = buildLatex(eArr, uArr);
    if (window.katex) {
      try {
        window.katex.render(latex, container, { displayMode: true, throwOnError: false });
        return;
      } catch (_) {}
    }
    container.textContent = latex;
  }
}
