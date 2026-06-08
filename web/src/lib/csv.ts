// CSV 出力ユーティリティ。Excel が UTF-8 を認識できるよう BOM を付ける。

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(rows: Array<Array<unknown>>): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, rows: Array<Array<unknown>>): void {
  const csv = buildCsv(rows);
  const bom = '﻿';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ファイル名に使えない文字を _ に置換
export function sanitizeFilenamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'untitled';
}
