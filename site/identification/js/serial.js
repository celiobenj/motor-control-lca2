// ============================================================
// serial.js — gerenciamento da Web Serial API
// Emite CustomEvents: 'connected', 'disconnected', 'line' (detail: string)
// ============================================================

export class SerialManager extends EventTarget {
  constructor() {
    super();
    this._port      = null;
    this._reader    = null;
    this._writer    = null;
    this._keepReading = false;
    this._lineBuffer  = '';
    this._decoder    = new TextDecoder();
    this._encoder    = new TextEncoder();
  }

  /** @returns {boolean} */
  get connected() { return this._writer !== null; }

  /** Abre o seletor de porta e inicia o handshake. */
  async connect() {
    if (!navigator.serial) throw new Error('Web Serial API não suportada neste navegador.');

    this._port = await navigator.serial.requestPort();
    await this._port.open({ baudRate: 115200 });

    this._writer = this._port.writable.getWriter();
    this._keepReading = true;
    this._lineBuffer  = '';

    this._readLoop(); // inicia leitura sem await (loop em background)

    // Envia handshake inicial
    await this.sendJson({ cmd: 'ping' });
  }

  /** Encerra a conexão serial de forma limpa. */
  async disconnect() {
    this._keepReading = false;

    if (this._reader) {
      try { await this._reader.cancel(); } catch (_) {}
      this._reader = null;
    }

    if (this._writer) {
      try { await this._writer.releaseLock(); } catch (_) {}
      this._writer = null;
    }

    if (this._port) {
      try { await this._port.close(); } catch (_) {}
      this._port = null;
    }

    this.dispatchEvent(new CustomEvent('disconnected'));
  }

  /** Serializa obj para JSON e envia como linha única terminada em \n. */
  async sendJson(obj) {
    if (!this._writer) throw new Error('Porta serial não está aberta.');
    const data = this._encoder.encode(JSON.stringify(obj) + '\n');
    await this._writer.write(data);
  }

  /** Retorna informações da porta (objeto do browser). */
  getPortInfo() {
    return this._port?.getInfo() ?? {};
  }

  // ---- Loop de leitura interno ----------------------------------------

  async _readLoop() {
    while (this._port?.readable && this._keepReading) {
      this._reader = this._port.readable.getReader();
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await this._reader.read();
          if (done) break;
          if (value) this._processChunk(value);
        }
      } catch (_) {
        // Porta desconectada externamente
      } finally {
        this._reader.releaseLock();
        this._reader = null;
      }
    }

    // Chega aqui quando keepReading=false ou porta fechou externamente
    if (this._writer) await this.disconnect();
  }

  /** Decodifica chunk recebido e emite eventos por linha completa. */
  _processChunk(chunk) {
    this._lineBuffer += this._decoder.decode(chunk, { stream: true });
    const lines = this._lineBuffer.split('\n');
    this._lineBuffer = lines.pop(); // último elemento pode ser linha incompleta

    for (const raw of lines) {
      const line = raw.trim().replace(/\r$/, '');
      if (!line) continue;
      this.dispatchEvent(new CustomEvent('line', { detail: line }));
    }
  }
}
