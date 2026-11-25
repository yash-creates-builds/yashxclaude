// CSV export (for Excel / Google Sheets) and JSON backup / restore. Everything stays on the phone
// unless the user chooses where to send the file from the share sheet.
import { exportData, importData, getDB } from '../core/db.js';
import { statusOf, receivedQty } from '../core/calc.js';
import { today } from '../core/dates.js';
import { shareFile, pickTextFile } from '../platform/native.js';

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per item line. Names are passed in so the export is in the user's language. */
export function buildCSV({ itemName, serviceName, dhobiName, statusName }) {
  const db = getDB();
  const rows = [['Date', 'Dhobi', 'Item', 'Service', 'Given', 'Received', 'Missing', 'Rate', 'Amount', 'Status', 'Received on', 'Note']];
  const batches = [...db.batches].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const b of batches) {
    for (const l of b.lines) {
      const got = b.received ? Math.min(receivedQty(b, l), l.qty) : '';
      const billed = b.received ? got : l.qty;
      rows.push([
        b.date, dhobiName(b.dhobiId), itemName(l.itemId), serviceName(l.service), l.qty, got,
        b.received ? l.qty - got : '', l.rate, billed * l.rate, statusName(statusOf(b)), b.receivedDate || '', b.note || '',
      ]);
    }
  }
  // BOM so Excel opens Hindi / Gujarati text correctly.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

export const exportCSV = (names) => shareFile(`dhobi-khata-${today()}.csv`, buildCSV(names), 'text/csv');

export function backupJSON() {
  const data = { app: 'dhobi-diary', exportedAt: new Date().toISOString(), ...exportData() };
  return shareFile(`dhobi-khata-backup-${today()}.json`, JSON.stringify(data, null, 1), 'application/json');
}

/** Reads a file the user picks. Returns the parsed backup (not yet applied), or null if cancelled. */
export async function readBackupFile() {
  const text = await pickTextFile();
  if (text == null) return null;
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.batches) || !Array.isArray(data.dhobis)) throw new Error('bad-file');
  return data;
}

export const applyBackup = (data) => importData(data);
