// ============================================================
// config.js — painel de configuração, validação e KaTeX
// ============================================================

// ---- Padrões por modo -----------------------------------------------

const _DEFAULTS = {
  speed: {
    refLevels:   '5, 12, 6, 2',
    refInterval: '6',
    vecE:        '1',
    vecU:        '1',
  },
  position: {
    refLevels:   '30, 90, 150, 100',
    refInterval: '6',
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
      <p><strong>Níveis:</strong> Lista de valores de referência separados por vírgula.
      O sistema percorre os valores em sequência e reinicia após o último.
      Exemplo: <code>5, 12, 6, 2</code></p>
      <p><strong>Intervalo:</strong> Duração em segundos inteiros de cada nível. Mínimo: 1 segundo.</p>
      <hr>
      <p><strong>Padrão Velocidade:</strong> <code>5, 12, 6, 2</code> — intervalo de <code>6</code> s</p>
      <p><strong>Padrão Posição:</strong> <code>30, 90, 150, 100</code> — intervalo de <code>6</code> s</p>
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
      <p><strong>Padrão Velocidade:</strong> <code>u[k] = 1·e[k] + 1·u[k−1]</code> (<code>e[] = 1</code> &nbsp; <code>u[] = 1</code>)</p>
      <p><strong>Padrão Posição:</strong> <code>u[k] = 6.9·e[k] − 6.8·e[k−1] + 1·u[k−1]</code> (<code>e[] = 6.9, -6.8</code> &nbsp; <code>u[] = 1</code>)</p>
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

    // Estado salvo por modo (inicia com defaults de referência e equações pré-preenchidos)
    this._modeState = {
      speed:    { ..._DEFAULTS.speed },
      position: { ..._DEFAULTS.position },
    };

    this._currentMode = 'speed';
    this._bind();
  }

  // ---- API pública ----------------------------------------------------

  get mode() {
    return document.querySelector('input[name="mode"]:checked')?.value ?? 'speed';
  }

  get isValid() {
    const e = parseVec(this._els.vecE.value);
    const u = parseVec(this._els.vecU.value);
    const l = parseVec(this._els.refLevels.value);
    const iv = parseInt(this._els.refInterval.value, 10);
    return (
      e !== null &&
      u !== null &&
      ((e?.length ?? 0) > 0 || (u?.length ?? 0) > 0) &&
      l !== null && l.length > 0 &&
      !isNaN(iv) && iv >= 1
    );
  }

  /** Retorna payload JSON pronto para envio à ESP32. */
  getPayload() {
    if (!this.isValid) return null;
    const eArr = parseVec(this._els.vecE.value) ?? [];
    const uArr = parseVec(this._els.vecU.value) ?? [];
    const order = Math.max(eArr.length, uArr.length);
    return {
      mode:       this.mode,
      order,
      coeff_e:    Array.from({ length: order }, (_, i) => eArr[i] ?? 0),
      coeff_u:    Array.from({ length: order }, (_, i) => uArr[i] ?? 0),
      levels:     parseVec(this._els.refLevels.value),
      interval_s: parseInt(this._els.refInterval.value, 10),
    };
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
      this._modeState[mode].refLevels   = def.refLevels;
      this._modeState[mode].refInterval = def.refInterval;
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
  }

  // ---- Métodos internos -----------------------------------------------

  _bind() {
    const { vecE, vecU, refLevels, refInterval } = this._els;
    [vecE, vecU, refLevels, refInterval].forEach(el => {
      el.addEventListener('input', () => this._validate());
    });
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
  }

  _captureInputs() {
    return {
      refLevels:   this._els.refLevels.value,
      refInterval: this._els.refInterval.value,
      vecE:        this._els.vecE.value,
      vecU:        this._els.vecU.value,
    };
  }

  _applyState(state) {
    this._els.refLevels.value   = state.refLevels;
    this._els.refInterval.value = state.refInterval;
    this._els.vecE.value        = state.vecE;
    this._els.vecU.value        = state.vecU;
    this._els.refUnit.textContent = UNIT_LABELS[this.mode];
  }

  _validate() {
    const eArr = parseVec(this._els.vecE.value);
    const uArr = parseVec(this._els.vecU.value);
    const lArr = parseVec(this._els.refLevels.value);
    const iv   = parseInt(this._els.refInterval.value, 10);

    const eEmpty = this._els.vecE.value.trim() === '';

    this._setErr(this._els.vecE,       eArr === null || eEmpty);
    this._setErr(this._els.vecU,       uArr === null);
    this._setErr(this._els.refLevels,  lArr === null || lArr.length === 0);
    this._setErr(this._els.refInterval, isNaN(iv) || iv < 1);

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
