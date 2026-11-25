// Website seat purchases, reported by Razorpay.
// Razorpay dashboard → Webhooks → URL: https://<project>.supabase.co/functions/v1/razorpay-webhook
// Event: payment.captured · Secret: the RAZORPAY_WEBHOOK_SECRET value.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { razorpaySignatureOk, seatFromRazorpay } from '../_shared/seats.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await razorpaySignatureOk(raw, req.headers.get('x-razorpay-signature'), Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? ''))) {
    return new Response('bad signature', { status: 401 });
  }
  const seat = seatFromRazorpay(JSON.parse(raw));
  if (!seat) return new Response('ignored');
  const { data, error } = await admin.rpc('add_seat', { p_household: seat.householdId, p_user: seat.userId, p_provider: seat.provider, p_txn: seat.txn, p_amount: seat.amountPaise });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ seats: data });
});
