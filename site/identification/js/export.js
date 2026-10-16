// ============================================================
// export.js — exportação de dados CSV de identificação
// ============================================================

/**
 * Exporta amostras como arquivo CSV para download.
 * Formato: tempo_ms,u,medida  (separador ,, decimal .)
 *
 * @param {Array}   samples       — array de objetos { t_ms, medida, u }
 * @param {string}  measure       — 'speed' | 'position'
 * @param {boolean} isVisibleOnly — se true, adiciona '-visivel' ao nome do arquivo
 */
export function exportCsv(samples, measure, isVisibleOnly = false) {
  if (!samples || samples.length === 0) {
    alert('Nenhum dado acumulado para exportar.');
    return;
  }

  const measureHeader = measure === 'speed' ? 'omega_rad_s' : 'angulo_rad';
  const lines = [`tempo_ms,u_pwm,${measureHeader}`];

  for (const s of samples) {
    const uStr = Number.isInteger(s.u) ? s.u : Number(s.u).toFixed(2);
    lines.push(
      `${s.t_ms},${uStr},${Number(s.medida).toFixed(4)}`
    );
  }

  const csvContent = lines.join('\r\n') + '\r\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const now     = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix  = isVisibleOnly ? 'dados-identificacao-visivel' : 'dados-identificacao';

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${prefix}-${measure}-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
