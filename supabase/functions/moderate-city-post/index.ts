import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authHeader = request.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response('Unauthorized', { status: 401 });
  let body: { postId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { postId } = body;
  if (typeof postId !== 'string' || !/^[0-9a-f-]{36}$/i.test(postId)) return Response.json({ error: 'Invalid post' }, { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: post, error: postError } = await admin.from('city_posts').select('id,user_id,description,place_hint,time_hint,automatic_moderated_at').eq('id', postId).eq('user_id', userData.user.id).maybeSingle();
  if (postError) return Response.json({ error: postError.message }, { status: 500 });
  if (!post) return new Response('Not found', { status: 404 });
  if (post.automatic_moderated_at) return Response.json({ error: 'Automatic moderation already completed' }, { status: 409 });

  const endpoint = Deno.env.get('TEXT_MODERATION_PROVIDER_URL');
  const key = Deno.env.get('MODERATION_PROVIDER_KEY');
  if (!endpoint || !key) return Response.json({ status: 'pending' }, { status: 202 });
  let moderationUrl: URL;
  try { moderationUrl = new URL(endpoint); } catch { return Response.json({ error: 'Invalid moderation provider URL' }, { status: 503 }); }
  if (moderationUrl.protocol !== 'https:') return Response.json({ error: 'Moderation provider must use HTTPS' }, { status: 503 });
  const claim = await admin.from('city_posts').update({ automatic_moderated_at: new Date().toISOString() }).eq('id', post.id).is('automatic_moderated_at', null).select('id').maybeSingle();
  if (!claim.data) return Response.json({ error: 'Moderation already running' }, { status: 409 });
  let result: Response;
  try { result = await fetch(moderationUrl, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: `${post.description}\nLugar aproximado: ${post.place_hint}\nHora: ${post.time_hint}`, rules: ['no_harassment','no_sexual_content','no_personal_data','no_exact_address','no_phone_or_social_handle'] }), signal: AbortSignal.timeout(8000),
  }); } catch { await admin.from('city_posts').update({ automatic_moderated_at: null }).eq('id', post.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  if (!result.ok) { await admin.from('city_posts').update({ automatic_moderated_at: null }).eq('id', post.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  let decision: { safe?: boolean };
  try { decision = await result.json(); } catch { await admin.from('city_posts').update({ automatic_moderated_at: null }).eq('id', post.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  if (typeof decision.safe !== 'boolean') { await admin.from('city_posts').update({ automatic_moderated_at: null }).eq('id', post.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  const status = decision.safe === true ? 'approved' : 'rejected';
  const saved = await admin.from('city_posts').update({ moderation_status: status }).eq('id', post.id);
  if (saved.error) return Response.json({ error: saved.error.message }, { status: 500 });
  return Response.json({ status });
});
