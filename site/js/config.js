// ============================================================
// config.js — painel de configuração, validação e KaTeX
// ============================================================

/** Parseia string de vetor "1.0, -2.5, 3" em float[]. Retorna null se inválido. */
function parseVec(str) {
  const s = str.trim();
  if (!s) return [];
  const parts = s.split(',');
  const nums = [];
  for (const p of parts) {
    const v = parseFloat(p.trim());
    if (isNaN(v) || p.trim() === '') return null; // inválido
    nums.push(v);
  }
  return nums;
}

/** Formata número float removendo zeros desnecessários (até 6 dígitos). */
function fmtNum(v) {
  return parseFloat(v.toPrecision(6)).toString();
}

/** Gera string LaTeX da equação de diferenças a partir dos vetores. */
function buildLatex(eArr, uArr) {
  const terms = [];

  for (let i = 0; i < eArr.length; i++) {
    if (eArr[i] === 0) continue;
    const sub = i === 0 ? 'k' : `k-${i}`;
    terms.push({ coef: eArr[i], label: `e[${sub}]` });
  }
  for (let i = 0; i < uArr.length; i++) {
    if (uArr[i] === 0) continue;
    terms.push({ coef: uArr[i], label: `u[k-${i + 1}]` });
  }

  if (terms.length === 0) return 'u[k] = 0';

  let latex = 'u[k] = ';
  terms.forEach(({ coef, label }, idx) => {
    const absStr = fmtNum(Math.abs(coef));
    if (idx === 0) {
      latex += `${fmtNum(coef)} \\cdot ${label}`;
    } else {
      latex += coef >= 0
        ? ` + ${absStr} \\cdot ${label}`
        : ` - ${absStr} \\cdot ${label}`;
    }
  });
  return latex;
}

// Padrões padrão de referência por modo
const DEFAULT_LEVELS = { speed: '5, 12, 6, 2', position: '30, 90, 150, 100' };
const UNIT_LABELS    = { speed: 'rad/s',        position: 'graus' };

export class ConfigPanel {
  /**
   * @param {object} elements — refs de elementos do DOM
   * @param {function} onValidChange — callback(isValid: boolean)
   */
  constructor(elements, onValidChange) {
    this._els = elements;
    this._onValidChange = onValidChange;
    this._levelsEdited = false;

    this._bind();
    this._validate(); // estado inicial
  }

  // ---- Getters de estado ------------------------------------------------

  /** Retorna o modo selecionado ('speed' | 'position'). */
  get mode() {
    return document.querySelector('input[name="mode"]:checked')?.value ?? 'speed';
  }

  /** @returns {boolean} todos os campos estão válidos */
  get isValid() {
    const e = parseVec(this._els.vecE.value);
    const u = parseVec(this._els.vecU.value);
    const l = parseVec(this._els.refLevels.value);
    const iv = parseInt(this._els.refInterval.value, 10);

    const eOk = e !== null;
    const uOk = u !== null;
    const atLeastOne = (e?.length ?? 0) > 0 || (u?.length ?? 0) > 0;
    const levelsOk = l !== null && l.length > 0;
    const intervalOk = !isNaN(iv) && iv >= 1;

    return eOk && uOk && atLeastOne && levelsOk && intervalOk;
  }

  /**
   * Constrói e retorna o payload JSON para envio à ESP32.
   * @returns {object|null}
   */
  getPayload() {
    if (!this.isValid) return null;

    const eArr = parseVec(this._els.vecE.value) ?? [];
    const uArr = parseVec(this._els.vecU.value) ?? [];
    const order = Math.max(eArr.length, uArr.length);
    const levels = parseVec(this._els.refLevels.value);
    const interval_s = parseInt(this._els.refInterval.value, 10);

    return {
      mode:     this.mode,
      order,
      coeff_e:  Array.from({ length: order }, (_, i) => eArr[i] ?? 0),
      coeff_u:  Array.from({ length: order }, (_, i) => uArr[i] ?? 0),
      levels,
      interval_s,
    };
  }

  // ---- Métodos internos -------------------------------------------------

  _bind() {
    const { vecE, vecU, refLevels, refInterval } = this._els;

    vecE.addEventListener('input',         () => this._validate());
    vecU.addEventListener('input',         () => this._validate());
    refLevels.addEventListener('input',    () => { this._levelsEdited = true; this._validate(); });
    refInterval.addEventListener('input',  () => this._validate());

    document.querySelectorAll('input[name="mode"]').forEach(radio => {
      radio.addEventListener('change', () => this._onModeChange());
    });
  }

  _onModeChange() {
    const mode = this.mode;
    this._els.refUnit.textContent = UNIT_LABELS[mode];
    if (!this._levelsEdited) {
      this._els.refLevels.value = DEFAULT_LEVELS[mode];
    }
    this._validate();
  }

  /** Valida todos os campos, atualiza classes CSS e renderiza a equação. */
  _validate() {
    const { vecE, vecU, refLevels, refInterval } = this._els;

    const eStr = vecE.value;
    const uStr = vecU.value;
    const lStr = refLevels.value;
    const iv   = parseInt(refInterval.value, 10);

    const eArr = parseVec(eStr);
    const uArr = parseVec(uStr);
    const lArr = parseVec(lStr);

    // Marcar campos inválidos
    this._setFieldError(vecE,       eArr === null || eStr.trim() === '');
    this._setFieldError(vecU,       uArr === null);
    this._setFieldError(refLevels,  lArr === null || lArr.length === 0 || lStr.trim() === '');
    this._setFieldError(refInterval, isNaN(iv) || iv < 1);

    // Atualiza KaTeX
    this._renderEquation(eArr, uArr);

    // Notifica orquestrador
    this._onValidChange(this.isValid);
  }

  _setFieldError(el, isError) {
    el.classList.toggle('is-invalid', isError);
  }

  _renderEquation(eArr, uArr) {
    const container = this._els.katexDisplay;

    if (eArr === null || uArr === null) {
      container.innerHTML = '<span class="katex-placeholder">Coeficientes inválidos</span>';
      return;
    }

    const eVec = eArr ?? [];
    const uVec = uArr ?? [];

    if (eVec.length === 0 && uVec.length === 0) {
      container.innerHTML = '<span class="katex-placeholder">Insira os coeficientes</span>';
      return;
    }

    const latex = buildLatex(eVec, uVec);

    if (window.katex) {
      try {
        window.katex.render(latex, container, {
          displayMode: true,
          throwOnError: false,
        });
      } catch (_) {
        container.textContent = latex;
      }
    } else {
      // KaTeX ainda não carregou
      container.textContent = latex;
    }
  }

  /** Inicializa valores padrão ao carregar. */
  init() {
    this._els.refUnit.textContent = UNIT_LABELS[this.mode];
    this._els.refLevels.value = DEFAULT_LEVELS[this.mode];
    this._validate();
  }
}
