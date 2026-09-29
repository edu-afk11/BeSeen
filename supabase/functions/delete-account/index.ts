import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authHeader = request.headers.get('authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response('Unauthorized', { status: 401 });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  for (;;) {
    const listed = await admin.storage.from('outfits').list(userData.user.id, { limit: 100, offset: 0 });
    if (listed.error) return Response.json({ error: listed.error.message }, { status: 500 });
    const paths = (listed.data ?? []).filter((item) => item.id).map((item) => `${userData.user!.id}/${item.name}`);
    if (!paths.length) break;
    const removed = await admin.storage.from('outfits').remove(paths);
    if (removed.error) return Response.json({ error: removed.error.message }, { status: 500 });
  }

  const deleted = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleted.error) return Response.json({ error: deleted.error.message }, { status: 500 });
  return Response.json({ deleted: true });
});
