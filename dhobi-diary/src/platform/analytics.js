// Visitor counts for the website (Vercel Web Analytics): no cookies, no personal data,
// and never anything typed into the diary. Off inside the phone app and in previews.
import { isNative } from './native.js';

export async function startAnalytics() {
  if (isNative || !location.hostname.endsWith('.vercel.app')) return;
  const { inject } = await import('@vercel/analytics');
  inject({ mode: 'production' });
}
