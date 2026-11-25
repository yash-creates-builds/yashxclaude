// Play Store / App Store seat purchases, reported by RevenueCat.
// RevenueCat dashboard → Integrations → Webhooks → URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
// Authorization header value = the REVENUECAT_WEBHOOK_AUTH secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { seatFromRevenueCat } from '../_shared/seats.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (req.headers.get('authorization') !== Deno.env.get('REVENUECAT_WEBHOOK_AUTH')) return new Response('unauthorized', { status: 401 });
  const seat = seatFromRevenueCat(await req.json());
  if (!seat) return new Response('ignored'); // other events: 200 so RevenueCat doesn't retry
  if (seat.userId) {
    const { data } = await admin.from('members').select('user_id').eq('household_id', seat.householdId).eq('user_id', seat.userId).maybeSingle();
    if (!data) return new Response('buyer is not in this family', { status: 400 });
  }
  const { data, error } = await admin.rpc('add_seat', { p_household: seat.householdId, p_user: seat.userId, p_provider: seat.provider, p_txn: seat.txn, p_amount: seat.amountPaise });
  if (error) return new Response(error.message, { status: 500 }); // RevenueCat retries
  return Response.json({ seats: data });
});
