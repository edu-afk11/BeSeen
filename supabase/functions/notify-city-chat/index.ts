import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendExpoPush } from '../_shared/push.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('CHAT_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  let payload: { record?: { id?: string }; old_record?: { accepted_at?: string | null } };
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const responseId = payload.record?.id;
  if (typeof responseId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(responseId)) return Response.json({ error: 'Invalid response' }, { status: 400 });
  const previous = payload.old_record as { accepted_at?: string | null } | undefined;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: response, error: responseError } = await admin.from('city_post_responses').select('id,post_id,responder_id,accepted_at').eq('id', responseId).maybeSingle();
  if (responseError) return Response.json({ error: responseError.message }, { status: 500 });
  if (!response) return Response.json({ sent: 0 });
  const { data: post } = await admin.from('city_posts').select('user_id').eq('id', response.post_id).single();
  if (!post) return Response.json({ sent: 0 });

  const acceptedNow = Boolean(response.accepted_at && !previous?.accepted_at);
  const recipientId = acceptedNow ? response.responder_id : post.user_id;
  let matchId: string | undefined;
  if (acceptedNow) {
    const [userLow, userHigh] = [response.responder_id, post.user_id].sort();
    const { data: match } = await admin.from('matches').select('id').eq('user_low', userLow).eq('user_high', userHigh).maybeSingle();
    matchId = match?.id;
  }
  const { data: tokens, error: tokenError } = await admin.from('push_tokens').select('token').eq('user_id', recipientId);
  if (tokenError) return Response.json({ error: tokenError.message }, { status: 500 });
  const messages = (tokens ?? []).map(({ token }) => acceptedNow ? {
    to: token, sound: 'default', title: 'Te han reconocido', body: 'La persona del Chat aceptó tu outfit. Ya podéis ver vuestro @.', data: matchId ? { type: 'match', matchId } : { type: 'city_response', postId: response.post_id },
  } : {
    to: token, sound: 'default', title: 'Nueva respuesta en el Chat', body: 'Alguien cree que era la persona que buscabas.', data: { type: 'city_response', postId: response.post_id },
  });
  const eventKey = `city-response:${response.id}:${acceptedNow ? 'accepted' : 'created'}`;
  const claim = await admin.from('notification_deliveries').insert({ event_key: eventKey });
  if (claim.error?.code === '23505') return Response.json({ sent: 0, duplicate: true });
  if (claim.error) return Response.json({ error: claim.error.message }, { status: 500 });
  try { return Response.json({ sent: await sendExpoPush(admin, messages) }); }
  catch (error) {
    await admin.from('notification_deliveries').delete().eq('event_key', eventKey);
    return Response.json({ error: error instanceof Error ? error.message : 'Push failed' }, { status: 502 });
  }
});
