// ============================================================
// export.js — exportação de dados CSV
// ============================================================

/**
 * Exporta amostras como arquivo CSV para download.
 * Formato: tempo_ms;ref;grandeza;u  (separador ;, decimal .)
 *
 * @param {Array}  samples  — array de objetos { t_ms, ref, medida, u }
 * @param {string} mode     — 'speed' | 'position'
 */
export function exportCsv(samples, mode) {
  if (!samples || samples.length === 0) {
    alert('Nenhum dado acumulado para exportar.');
    return;
  }

  const measureHeader = mode === 'speed' ? 'omega' : 'angulo';
  const lines = [`tempo_ms;ref;${measureHeader};u`];

  for (const s of samples) {
    lines.push(
      `${s.t_ms};${s.ref.toFixed(4)};${s.medida.toFixed(4)};${s.u}`
    );
  }

  const csvContent = lines.join('\r\n') + '\r\n';
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const now     = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix  = measureHeader;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `dados-controle-${suffix}-${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
