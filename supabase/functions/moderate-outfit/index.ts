import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authHeader = request.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response('Unauthorized', { status: 401 });
  let body: { outfitId?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { outfitId } = body;
  if (typeof outfitId !== 'string' || !/^[0-9a-f-]{36}$/i.test(outfitId)) return Response.json({ error: 'Invalid outfit' }, { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: outfit, error: outfitError } = await admin.from('outfits').select('id,user_id,storage_path,automatic_moderated_at,expires_at').eq('id', outfitId).eq('user_id', userData.user.id).maybeSingle();
  if (outfitError) return Response.json({ error: outfitError.message }, { status: 500 });
  if (!outfit) return new Response('Not found', { status: 404 });
  if (new Date(outfit.expires_at).getTime()<=Date.now()) return Response.json({ error: 'Outfit expired' }, { status: 410 });
  if (outfit.automatic_moderated_at) return Response.json({ error: 'Automatic moderation already completed' }, { status: 409 });
  const signed = await admin.storage.from('outfits').createSignedUrl(outfit.storage_path, 60);
  if (signed.error) return Response.json({ error: signed.error.message }, { status: 500 });
  if (!signed.data?.signedUrl) return Response.json({ error: 'Image unavailable' }, { status: 500 });
  const endpoint = Deno.env.get('MODERATION_PROVIDER_URL');
  const key = Deno.env.get('MODERATION_PROVIDER_KEY');
  if (!endpoint || !key) return Response.json({ status: 'pending' }, { status: 202 });
  let moderationUrl: URL;
  try { moderationUrl = new URL(endpoint); } catch { return Response.json({ error: 'Invalid moderation provider URL' }, { status: 503 }); }
  if (moderationUrl.protocol !== 'https:') return Response.json({ error: 'Moderation provider must use HTTPS' }, { status: 503 });
  const claim = await admin.from('outfits').update({ automatic_moderated_at: new Date().toISOString() }).eq('id', outfit.id).is('automatic_moderated_at', null).select('id').maybeSingle();
  if (!claim.data) return Response.json({ error: 'Moderation already running' }, { status: 409 });
  let result: Response;
  try { result = await fetch(moderationUrl, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ image_url: signed.data.signedUrl, rules: ['no_nudity','no_face_closeup','no_text_or_personal_data','single_outfit'] }), signal: AbortSignal.timeout(8000) }); }
  catch { await admin.from('outfits').update({ automatic_moderated_at: null }).eq('id', outfit.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  if (!result.ok) { await admin.from('outfits').update({ automatic_moderated_at: null }).eq('id', outfit.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  let decision: { safe?: boolean };
  try { decision = await result.json(); } catch { await admin.from('outfits').update({ automatic_moderated_at: null }).eq('id', outfit.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  if (typeof decision.safe !== 'boolean') { await admin.from('outfits').update({ automatic_moderated_at: null }).eq('id', outfit.id); return Response.json({ status: 'pending' }, { status: 202 }); }
  const status = decision.safe === true ? 'approved' : 'rejected';
  const saved = await admin.from('outfits').update({ moderation_status: status }).eq('id', outfit.id);
  if (saved.error) return Response.json({ error: saved.error.message }, { status: 500 });
  if (status === 'rejected') {
    const removed = await admin.storage.from('outfits').remove([outfit.storage_path]);
    // The database status must remain readable by the phone. If Storage is
    // temporarily unavailable, the scheduled four-hour cleanup remains a fallback.
    return Response.json({ status, image_removed: !removed.error });
  }
  return Response.json({ status, image_removed: false });
});
