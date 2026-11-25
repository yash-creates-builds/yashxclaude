// Where the diary lives on the phone.
//  - localStorage: instant read/write (the working copy).
//  - Native app: also mirrored to a JSON file in the app's private data folder,
//    which survives WebView cache clears. On start, the file wins if it is newer.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const KEY = 'dhobi-diary.db';
const FILE = 'dhobi-diary.json';
const native = Capacitor.isNativePlatform();

export async function readDB() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* corrupt → ignore */ }
  if (!native) return local;
  try {
    const { data } = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
    const file = JSON.parse(data);
    if (!local || (file.savedAt || 0) >= (local.savedAt || 0)) return file;
  } catch { /* first run: no file yet */ }
  return local;
}

let fileTimer = 0;
export function writeDB(db) {
  db.savedAt = Date.now();
  const json = JSON.stringify(db);
  try { localStorage.setItem(KEY, json); } catch { /* storage full — file copy still saves */ }
  if (!native) return;
  clearTimeout(fileTimer);
  fileTimer = setTimeout(() => {
    Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: json }).catch(() => {});
  }, 300);
}
