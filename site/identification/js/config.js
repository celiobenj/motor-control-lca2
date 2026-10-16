// ============================================================
// config.js — painel de configuração e validação para identificação PRBS
// ============================================================

const _DEFAULTS = {
  speed: {
    levels:  '0, 255',
    ts:      '5',
    stretch: '5',
  },
  position: {
    levels:  '-255, 255',
    ts:      '5',
    stretch: '5',
  },
};

// ---- Conteúdo dos modais de ajuda -----------------------------------

export const HELP_CONTENT = {
  measure: {
    title: 'Grandeza Medida',
    html: `
      <p><strong>Velocidade Angular:</strong> Mede a velocidade de rotação do eixo do motor expressa em <strong>rad/s</strong>.
      É a grandeza ideal para identificar a função de transferência do motor em velocidade: 
      <code>G_v(s) = Ω(s) / U(s)</code>. Neste modo, o sinal de excitação PWM utiliza apenas valores não-negativos (0 a 255).</p>
      <p><strong>Posição Angular:</strong> Mede o ângulo acumulado do eixo em <strong>radianos</strong>.
      Adequada para modelar a dinâmica de posição: 
      <code>G_p(s) = θ(s) / U(s)</code> (que inclui o polo integrador puro em s = 0). Permite valores bipolares de PWM (-255 a 255).</p>
    `,
  },
  prbs: {
    title: 'Sinal de Excitação PRBS',
    html: `
      <p>A <strong>Sequência Binária Pseudo-Aleatória (PRBS)</strong> é um sinal determinístico gerado por um registrador de deslocamento com realimentação linear (LFSR de 14 bits), possuindo propriedades espectrais semelhantes às do ruído branco para excitar simultaneamente todas as frequências da planta.</p>
      <hr>
      <p><strong>Parâmetros Configuráveis:</strong></p>
      <p>• <strong>Níveis de PWM:</strong> Conjunto discreto de valores de amplitude que o sinal pode assumir. Em velocidade, aceita apenas valores positivos (<code>0 a 255</code>). Em posição, aceita valores bipolares (<code>-255 a 255</code>). Pode ser binário padrão (<code>0, 255</code> ou <code>-255, 255</code>) ou multi-nível (ex: <code>0, 128, 255, 55, 198</code>), onde cada nível é sorteado pseudo-aleatoriamente pelo LFSR.</p>
      <p>• <strong>Ts (Período de Amostragem):</strong> Intervalo de tempo entre coletas consecutivas da planta (em ms). Valores menores aumentam a densidade de dados e a frequência de Nyquist (padrão: 5 ms).</p>
      <p>• <strong>Stretch:</strong> Quantidade de amostras consecutivas que cada nível sorteado é sustentado. Aumentar o stretch reduz a frequência máxima do sinal, concentrando a energia nas dinâmicas mais lentas do motor (padrão: 5).</p>
      <hr>
      <p><strong>Parâmetros Operacionais Fixos da Planta:</strong></p>
      <p>• <strong>Registrador LFSR:</strong> <code>14 bits</code>, gerando uma sequência pseudo-aleatória determinística completa de <code>16.383</code> estados antes de se repetir.</p>
      <p>• <strong>Duração do Ensaio:</strong> Execução contínua em tempo real até a parada manual através do botão <em>Parar</em>.</p>
    `,
  },
};

/** Parseia string de níveis separados por vírgula em int[]. Valida limites do modo. */
function parseLevels(str, measure) {
  const trimmed = (str ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',');
  const result = [];
  for (const p of parts) {
    const s = p.trim();
    if (s === '') return null;
    const v = Number(s);
    if (!Number.isInteger(v)) return null;
    if (measure === 'speed') {
      if (v < 0 || v > 255) return null; // Apenas positivos / não-negativos em velocidade
    } else {
      if (v < -255 || v > 255) return null; // Entre -255 e 255 em posição
    }
    result.push(v);
  }
  if (result.length === 0 || result.length > 20) return null;
  return result;
}

export class ConfigPanel {
  /**
   * @param {Object} els Dicionário com referências DOM dos inputs
   * @param {Function} onValidityChange Callback (isValid: boolean) => void
   */
  constructor(els, onValidityChange) {
    this._els = els;
    this._onValidityChange = onValidityChange;

    this._currentMeasure = 'speed';
    this._modeState = {
      speed:    { ..._DEFAULTS.speed },
      position: { ..._DEFAULTS.position },
    };

    this.ts      = 5;
    this.stretch = 5;
    this.levels  = [0, 255];
    this.isValid = true;
  }

  get measure() {
    return document.querySelector('input[name="measure"]:checked')?.value ?? 'speed';
  }

  init() {
    this._applyState(this._modeState[this.measure]);
    this._bindInputs();
    this.validate();
  }

  _bindInputs() {
    // Rádios de grandeza medida
    document.querySelectorAll('input[name="measure"]').forEach(r => {
      r.addEventListener('change', () => this._onMeasureChange());
    });

    // Inputs de configuração
    this._els.inputLevels?.addEventListener('input', () => this.validate());
    this._els.inputTs.addEventListener('input', () => this.validate());
    this._els.inputStretch.addEventListener('input', () => this.validate());
  }

  _onMeasureChange() {
    const newMeasure = this.measure;
    if (newMeasure === this._currentMeasure) return;

    // 1. Salva inputs do modo atual antes de trocar
    this._modeState[this._currentMeasure] = this._captureInputs();

    // 2. Aplica estado persistido ou padrão do novo modo
    this._applyState(this._modeState[newMeasure]);
    this._currentMeasure = newMeasure;

    // 3. Valida os novos campos
    this.validate();
  }

  _captureInputs() {
    return {
      levels:  this._els.inputLevels?.value ?? '',
      ts:      this._els.inputTs?.value ?? '5',
      stretch: this._els.inputStretch?.value ?? '5',
    };
  }

  _applyState(state) {
    if (this._els.inputLevels) this._els.inputLevels.value = state.levels;
    if (this._els.inputTs)     this._els.inputTs.value     = state.ts;
    if (this._els.inputStretch)this._els.inputStretch.value= state.stretch;
  }

  validate() {
    const currentMeasure = this.measure;
    const parsedLevels = parseLevels(this._els.inputLevels?.value, currentMeasure);
    const rawTs = parseInt(this._els.inputTs.value, 10);
    const rawStretch = parseInt(this._els.inputStretch.value, 10);

    const isLevelsValid = parsedLevels !== null;
    const isTsValid = !isNaN(rawTs) && rawTs >= 1 && rawTs <= 1000;
    const isStretchValid = !isNaN(rawStretch) && rawStretch >= 1 && rawStretch <= 100;

    if (this._els.inputLevels) this._els.inputLevels.classList.toggle('is-invalid', !isLevelsValid);
    this._els.inputTs.classList.toggle('is-invalid', !isTsValid);
    this._els.inputStretch.classList.toggle('is-invalid', !isStretchValid);

    this.isValid = isLevelsValid && isTsValid && isStretchValid;

    if (this.isValid) {
      this.levels  = parsedLevels;
      this.ts      = rawTs;
      this.stretch = rawStretch;
    }

    if (typeof this._onValidityChange === 'function') {
      this._onValidityChange(this.isValid);
    }

    return this.isValid;
  }

  /** Retorna o payload JSON pronto para envio à ESP32 */
  getPayload() {
    if (!this.validate()) return null;
    return {
      cmd: 'ident',
      measure: this.measure,
      sample_time_ms: this.ts,
      stretch: this.stretch,
      levels: this.levels,
    };
  }

  /** Restaura os valores padrão do modo ativo */
  resetDefaults() {
    const cur = this.measure;
    this._modeState[cur] = { ..._DEFAULTS[cur] };
    this._applyState(this._modeState[cur]);
    this.validate();
  }

  /** Atualiza o card de telemetria em tempo real no painel lateral */
  updateStats(sampleCount, elapsedSec, lastU, lastY) {
    if (this._els.statSamples) {
      this._els.statSamples.textContent = sampleCount.toLocaleString('pt-BR');
    }
    if (this._els.statTime) {
      this._els.statTime.textContent = `${elapsedSec.toFixed(1)} s`;
    }
    if (this._els.statU) {
      this._els.statU.textContent = lastU !== null ? lastU.toString() : '0';
    }
    if (this._els.statY) {
      this._els.statY.textContent = lastY !== null ? lastY.toFixed(2) : '0.00';
    }
  }
}
