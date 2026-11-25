// Website: creates a ₹19 Razorpay order for one family seat. Called by a signed-in family member.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SEAT_PRICE_PAISE, SEAT_PRODUCT } from '../_shared/seats.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await user.auth.getUser();
  if (!auth?.user) return new Response('sign in first', { status: 401, headers: cors });
  const { household_id } = await req.json();
  // RLS: this only returns a row if the caller is a member of the family.
  const { data: seats } = await user.rpc('family_seats', { p_household: household_id });
  if (!seats?.length) return new Response('not in this family', { status: 403, headers: cors });

  const keyId = Deno.env.get('RAZORPAY_KEY_ID')!;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${keyId}:${Deno.env.get('RAZORPAY_KEY_SECRET')}`) },
    body: JSON.stringify({ amount: SEAT_PRICE_PAISE, currency: 'INR', receipt: `seat-${Date.now()}`, notes: { product: SEAT_PRODUCT, household_id, user_id: auth.user.id } }),
  });
  if (!res.ok) return new Response('could not create order', { status: 502, headers: cors });
  const order = await res.json();
  return Response.json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId }, { headers: cors });
});
