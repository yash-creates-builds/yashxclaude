// "Dhobi coming today?" — repeating local notifications on chosen weekdays. No server.
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from '../platform/native.js';

const BASE_ID = 7100; // ids 7100–7106, one per weekday

/**
 * @param {number[]} days 0 = Sunday … 6 = Saturday
 * @param {string} time 'HH:MM'
 * @returns {Promise<'ok'|'denied'|'web'>}
 */
export async function scheduleReminders(days, time, { title, body }) {
  if (!isNative) return 'web';
  try {
    await LocalNotifications.cancel({ notifications: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: BASE_ID + d })) });
    if (!days.length) return 'ok';
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return 'denied';
    const [hour, minute] = time.split(':').map(Number);
    await LocalNotifications.schedule({
      notifications: days.map((d) => ({
        id: BASE_ID + d,
        title,
        body,
        // Capacitor weekdays are 1 = Sunday … 7 = Saturday
        schedule: { on: { weekday: d + 1, hour, minute }, repeats: true, allowWhileIdle: true },
      })),
    });
    return 'ok';
  } catch {
    return 'denied';
  }
}
