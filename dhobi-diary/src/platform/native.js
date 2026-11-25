// Thin bridge to phone features. In the browser each one falls back gracefully.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { App } from '@capacitor/app';

export const isNative = Capacitor.isNativePlatform();

/** Light tap feel on +/− and buttons. */
export function haptic(kind = 'light') {
  if (isNative) {
    const style = kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
  } else if (navigator.vibrate) {
    navigator.vibrate(kind === 'medium' ? 20 : 8);
  }
}
export const hapticSuccess = () => { if (isNative) Haptics.notification({ type: 'SUCCESS' }).catch(() => {}); else navigator.vibrate?.(25); };
export const hapticWarning = () => { if (isNative) Haptics.notification({ type: 'WARNING' }).catch(() => {}); else navigator.vibrate?.([30, 60, 30]); };

/** Opens the system share sheet (WhatsApp, SMS…). Returns 'shared' | 'copied' | 'failed'. */
export async function shareText(title, text) {
  try {
    if (isNative) { await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    if (String(e?.message || e).toLowerCase().includes('cancel')) return 'shared';
    return 'failed';
  }
}

/** Save a file and offer it through the share sheet (Drive, WhatsApp, Files…). */
export async function shareFile(filename, content, mime) {
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try { await Share.share({ title: filename, files: [uri], dialogTitle: filename }); } catch { /* user closed the sheet */ }
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Let the user pick a file (backup restore). Resolves with its text, or null. */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Android hardware back button → in-app back. */
export function onBackButton(handler) {
  if (!isNative) return;
  App.addListener('backButton', () => { if (!handler()) App.minimizeApp(); });
}
