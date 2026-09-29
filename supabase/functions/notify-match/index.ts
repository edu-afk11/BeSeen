import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPush } from '../_shared/push.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('MATCH_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  let payload: { record?: { id?: string } };
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const matchId = payload.record?.id;
  if (typeof matchId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(matchId)) return Response.json({ error: 'Invalid match' }, { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: match, error: matchError } = await admin.from('matches').select('id,user_low,user_high').eq('id', matchId).maybeSingle();
  if (matchError) return Response.json({ error: matchError.message }, { status: 500 });
  if (!match) return Response.json({ sent: 0 });
  const { data: tokens, error } = await admin.from('push_tokens').select('token,user_id').in('user_id', [match.user_low, match.user_high]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const messages = (tokens ?? []).map(({ token }) => ({
    to: token,
    sound: 'default',
    title: '¡Os habéis visto! 💛',
    body: 'La solicitud es mutua. Ya puedes descubrir su @.',
    data: { type: 'match', matchId: match.id },
  }));
  const eventKey = `match:${match.id}`;
  const claim = await admin.from('notification_deliveries').insert({ event_key: eventKey });
  if (claim.error?.code === '23505') return Response.json({ sent: 0, duplicate: true });
  if (claim.error) return Response.json({ error: claim.error.message }, { status: 500 });
  try { return Response.json({ sent: await sendExpoPush(admin, messages) }); }
  catch (error) {
    await admin.from('notification_deliveries').delete().eq('event_key', eventKey);
    return Response.json({ error: error instanceof Error ? error.message : 'Push failed' }, { status: 502 });
  }
});
