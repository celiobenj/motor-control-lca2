// ============================================================
// config.js — painel de configuração e validação para identificação PRBS
// ============================================================

const _DEFAULTS = {
  ts: 5,
  stretch: 5,
};

// ---- Conteúdo dos modais de ajuda -----------------------------------

export const HELP_CONTENT = {
  measure: {
    title: 'Grandeza Medida',
    html: `
      <p><strong>Velocidade Angular:</strong> Mede a velocidade de rotação do eixo do motor expressa em <strong>rad/s</strong>.
      É a grandeza ideal para identificar a função de transferência do motor em velocidade: 
      <code>G_v(s) = Ω(s) / U(s)</code>.</p>
      <p><strong>Posição Angular:</strong> Mede o ângulo acumulado do eixo em <strong>radianos</strong>.
      Adequada para modelar a dinâmica de posição: 
      <code>G_p(s) = θ(s) / U(s)</code> (que inclui o polo integrador puro em s = 0).</p>
    `,
  },
  prbs: {
    title: 'Sinal de Excitação PRBS',
    html: `
      <p>A <strong>Sequência Binária Pseudo-Aleatória (PRBS)</strong> é um sinal determinístico gerado por um registrador de deslocamento com realimentação linear (LFSR), possuindo propriedades espectrais semelhantes às do ruído branco para excitar simultaneamente todas as frequências da planta.</p>
      <hr>
      <p><strong>Parâmetros Configuráveis:</strong></p>
      <p>• <strong>Ts (Período de Amostragem):</strong> Intervalo de tempo entre amostragens consecutivas da planta (em ms). Valores menores aumentam a densidade de dados e a frequência de Nyquist (padrão: 5 ms).</p>
      <p>• <strong>Stretch:</strong> Quantidade de amostras consecutivas que cada bit do sinal é sustentado. Aumentar o stretch reduz a frequência máxima do sinal, concentrando a energia nas dinâmicas mais lentas do motor (padrão: 5).</p>
      <hr>
      <p><strong>Parâmetros Operacionais Fixos da Planta:</strong></p>
      <p>• <strong>Amplitude de Excitação:</strong> Fixada em <code>±255</code> (saturação máxima do PWM nos dois sentidos de rotação) para maximizar a relação sinal-ruído (SNR).</p>
      <p>• <strong>Registrador LFSR:</strong> <code>14 bits</code>, gerando uma sequência pseudo-aleatória completa de <code>16.383</code> estados antes de qualquer repetição.</p>
      <p>• <strong>Duração do Ensaio:</strong> Execução contínua em tempo real até a parada manual através do botão <em>Parar</em>.</p>
    `,
  },
};

export class ConfigPanel {
  /**
   * @param {Object} els Dicionário com referências DOM dos inputs
   * @param {Function} onValidityChange Callback (isValid: boolean) => void
   */
  constructor(els, onValidityChange) {
    this._els = els;
    this._onValidityChange = onValidityChange;

    this.measure = 'speed';
    this.ts      = _DEFAULTS.ts;
    this.stretch = _DEFAULTS.stretch;
    this.isValid = true;
  }

  init() {
    this._bindInputs();
    this.validate();
  }

  _bindInputs() {
    // Rádios de grandeza medida
    document.querySelectorAll('input[name="measure"]').forEach(r => {
      r.addEventListener('change', () => {
        const checked = document.querySelector('input[name="measure"]:checked');
        this.measure = checked ? checked.value : 'speed';
        this.validate();
      });
    });

    // Inputs numéricos
    this._els.inputTs.addEventListener('input', () => this.validate());
    this._els.inputStretch.addEventListener('input', () => this.validate());
  }

  validate() {
    const rawTs = parseInt(this._els.inputTs.value, 10);
    const rawStretch = parseInt(this._els.inputStretch.value, 10);

    const isTsValid = !isNaN(rawTs) && rawTs >= 1 && rawTs <= 100;
    const isStretchValid = !isNaN(rawStretch) && rawStretch >= 1 && rawStretch <= 100;

    this._els.inputTs.classList.toggle('is-invalid', !isTsValid);
    this._els.inputStretch.classList.toggle('is-invalid', !isStretchValid);

    this.isValid = isTsValid && isStretchValid;

    if (this.isValid) {
      this.ts = rawTs;
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
    };
  }

  /** Restaura os valores padrão */
  resetDefaults() {
    this._els.inputTs.value = _DEFAULTS.ts;
    this._els.inputStretch.value = _DEFAULTS.stretch;
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
