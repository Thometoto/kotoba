// Shared parser for UTF-8 CSV, including quoted commas, line breaks and doubled quotes.
export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
  const endField = () => { row.push(field); field = ''; closed = false; };
  const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i+1] === '\n') i++; endRow(); }
    else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('CSV : guillemet ou caractère inattendu.');
      field += char;
    }
  }
  if (quoted) throw new Error('CSV : guillemet non fermé.');
  if (field || row.length || closed) endRow();
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('CSV : en-têtes vides ou dupliqués.');
  return rows.map((r, i) => {
    if (r.length !== headers.length) throw new Error(`CSV : nombre de colonnes incorrect à l’enregistrement ${i+2}.`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
