import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('authorization') !== Deno.env.get('REVENUECAT_WEBHOOK_AUTH')) return new Response('Unauthorized', { status: 401 });

  let payload: { event?: Record<string, any> };
  try { payload = await request.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }
  const event = payload?.event;
  const userId = event?.app_user_id;
  const eventAt = Number(event?.event_timestamp_ms);
  const isUuid = typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId);
  if (!isUuid || !Number.isFinite(eventAt)) return new Response('Ignored', { status: 200 });

  const entitlementIds: string[] = event.entitlement_ids ?? [];
  const endsNow = ['EXPIRATION', 'REFUND'].includes(event.type);
  const expirationMs = endsNow ? eventAt : Number(event.expiration_at_ms ?? 253402300799000);
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!entitlementIds.includes('beseen_plus') && !endsNow) return new Response('No BeSeen Plus entitlement', { status: 200 });
  if (!Number.isFinite(expirationMs)) return new Response('Invalid expiration', { status: 400 });
  const result = await client.rpc('apply_revenuecat_event', {
    user_id_input: userId,
    expires_at_input: new Date(expirationMs).toISOString(),
    event_at_input: new Date(eventAt).toISOString(),
  });
  if (result.error) return new Response(result.error.message, { status: 500 });
  return new Response('OK', { status: 200 });
});
