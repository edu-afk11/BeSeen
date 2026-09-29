import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('IDENTITY_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  let event: { id?: string; status?: string; age_over_18?: boolean };
  try { event = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (typeof event?.id !== 'string' || event.id.length>200 || !['verified','rejected','pending'].includes(event?.status)) return Response.json({ error: 'Invalid event' }, { status: 400 });
  const verified = event.status === 'verified' && event.age_over_18 === true;
  const status = verified ? 'verified' : event.status === 'rejected' || event.status === 'verified' ? 'rejected' : 'pending';
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.from('identity_verifications').update({ status, adult_verified: verified, verified_at: verified ? new Date().toISOString() : null, provider_reference: verified ? null : event.id }).eq('provider_reference', event.id).select('user_id').maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, processed: Boolean(data) });
});
