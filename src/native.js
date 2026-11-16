// Bridges to phone features when Seeti runs as an App Store / Play Store app (Capacitor).
// On the website these fall back to the browser versions.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { KeepAwake } from '@capacitor-community/keep-awake';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/** Vibrate: pattern (array of ms) or a single duration. iPhones only buzz inside the real app. */
export function nativeVibrate(pattern) {
  if (!isNative) return false;
  const total = Array.isArray(pattern) ? pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) : pattern;
  if (!total) return true;
  if (total <= 40) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else Haptics.vibrate({ duration: Math.min(total, 2000) }).catch(() => {});
  return true;
}

export async function nativeKeepAwake(on) {
  if (!isNative) return null;
  try {
    if (on) await KeepAwake.keepAwake(); else await KeepAwake.allowSleep();
    return true;
  } catch { return false; }
}

let notifAsked = false;
async function canNotify() {
  if (!isNative) return false;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && !notifAsked) {
      notifAsked = true;
      p = await LocalNotifications.requestPermissions();
    }
    return p.display === 'granted';
  } catch { return false; }
}

/** Ask once, early (e.g. when listening starts), so alarms can show on the lock screen. */
export const prepareNotifications = () => canNotify();

/** Schedule a lock-screen alert (works even if the app is in the background). */
export async function scheduleAlert(id, title, body, at = new Date(Date.now() + 500)) {
  if (!(await canNotify())) return;
  try {
    await LocalNotifications.schedule({ notifications: [{ id, title, body, schedule: { at, allowWhileIdle: true } }] });
  } catch { /* ignore */ }
}

export async function cancelAlert(id) {
  if (!isNative) return;
  try { await LocalNotifications.cancel({ notifications: [{ id }] }); } catch { /* ignore */ }
}
