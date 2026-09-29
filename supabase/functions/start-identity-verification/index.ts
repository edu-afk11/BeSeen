import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authHeader = request.headers.get('authorization') ?? '';
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return new Response('Unauthorized', { status: 401 });
  const providerUrl = Deno.env.get('IDENTITY_PROVIDER_URL');
  const providerKey = Deno.env.get('IDENTITY_PROVIDER_KEY');
  let parsedProviderUrl: URL;
  try { parsedProviderUrl = new URL(providerUrl ?? ''); } catch { return Response.json({ error: 'Identity provider is not configured' }, { status: 503 }); }
  if (!providerKey || parsedProviderUrl.protocol !== 'https:') return Response.json({ error: 'Identity provider is not configured securely' }, { status: 503 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const reservation = await admin.rpc('reserve_identity_attempt', { user_id_input: userData.user.id });
  if (reservation.error) return Response.json({ error: reservation.error.message }, { status: 500 });
  if (!reservation.data) return Response.json({ error: 'Verification already completed or requested recently' }, { status: 409 });
  const releaseReservation = () => admin.from('identity_verifications').update({ status: 'rejected', requested_at: new Date(0).toISOString() }).eq('user_id', userData.user.id).eq('status', 'pending').is('provider_reference', null);
  let response: Response;
  try {
    response = await fetch(new URL('/sessions', parsedProviderUrl).toString(), {
      method: 'POST',
      headers: { authorization: `Bearer ${providerKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reference: userData.user.id, minimum_age: 18, document_types: ['national_identity_card'], callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/identity-webhook` }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    await releaseReservation();
    return Response.json({ error: 'Identity provider unavailable' }, { status: 502 });
  }
  if (!response.ok) { await releaseReservation(); return Response.json({ error: 'Provider rejected the request' }, { status: 502 }); }
  let session: { id?: string; url?: string };
  try { session = await response.json(); } catch { await releaseReservation(); return Response.json({ error: 'Invalid provider response' }, { status: 502 }); }
  if (typeof session.id !== 'string' || session.id.length>200 || typeof session.url !== 'string' || !session.url.startsWith('https://')) { await releaseReservation(); return Response.json({ error: 'Invalid provider response' }, { status: 502 }); }
  const stored = await admin.from('identity_verifications').update({ provider_reference: session.id }).eq('user_id', userData.user.id);
  if (stored.error) return Response.json({ error: stored.error.message }, { status: 500 });
  return Response.json({ url: session.url });
});
