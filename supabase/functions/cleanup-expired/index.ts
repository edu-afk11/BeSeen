import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (request.headers.get('x-cleanup-secret') !== Deno.env.get('CLEANUP_WEBHOOK_SECRET')) return new Response('Unauthorized', { status: 401 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let removedCount = 0;
  let removedOrphans = 0;
  for (;;) {
    const expired = await admin.from('outfits').select('id,storage_path').lt('expires_at', new Date().toISOString()).limit(100);
    if (expired.error) return Response.json({ error: expired.error.message }, { status: 500 });
    if (!expired.data?.length) break;
    const paths = expired.data.map((item) => item.storage_path);
    const removed = await admin.storage.from('outfits').remove(paths);
    if (removed.error) return Response.json({ error: removed.error.message }, { status: 500 });
    const deleted = await admin.from('outfits').delete().in('id', expired.data.map((item) => item.id));
    if (deleted.error) return Response.json({ error: deleted.error.message }, { status: 500 });
    removedCount += expired.data.length;
  }
  // A phone can close after Storage accepts a photo but before its database row
  // is created. Keep a generous grace period, then remove only untracked files.
  const orphanCutoff = Date.now() - 15 * 60_000;
  let rootOffset = 0;
  while (removedOrphans < 1000) {
    const root = await admin.storage.from('outfits').list('', { limit: 100, offset: rootOffset, sortBy: { column: 'name', order: 'asc' } });
    if (root.error) return Response.json({ error: root.error.message }, { status: 500 });
    const folders = (root.data ?? []).filter((item) => !item.id);
    for (const folder of folders) {
      let fileOffset = 0;
      while (removedOrphans < 1000) {
        const listed = await admin.storage.from('outfits').list(folder.name, { limit: 100, offset: fileOffset, sortBy: { column: 'name', order: 'asc' } });
        if (listed.error) return Response.json({ error: listed.error.message }, { status: 500 });
        const candidates = (listed.data ?? []).filter((item) => item.id && item.created_at && new Date(item.created_at).getTime() < orphanCutoff).map((item) => `${folder.name}/${item.name}`);
        if (candidates.length) {
          const tracked = await admin.from('outfits').select('storage_path').in('storage_path', candidates);
          if (tracked.error) return Response.json({ error: tracked.error.message }, { status: 500 });
          const known = new Set((tracked.data ?? []).map((item) => item.storage_path));
          const orphanPaths = candidates.filter((path) => !known.has(path)).slice(0, 1000 - removedOrphans);
          if (orphanPaths.length) {
            const removed = await admin.storage.from('outfits').remove(orphanPaths);
            if (removed.error) return Response.json({ error: removed.error.message }, { status: 500 });
            removedOrphans += orphanPaths.length;
          }
        }
        if ((listed.data ?? []).length < 100) break;
        fileOffset += 100;
      }
    }
    if ((root.data ?? []).length < 100 || removedOrphans >= 1000) break;
    rootOffset += 100;
  }
  const now = new Date().toISOString();
  const expiredSessions = await admin.from('street_sessions').update({ location: null }).is('ended_at', null).lt('expires_at', now).not('location', 'is', null);
  if (expiredSessions.error) return Response.json({ error: expiredSessions.error.message }, { status: 500 });
  const cityCleanup = await admin.from('city_posts').delete().lt('expires_at', now);
  if (cityCleanup.error) return Response.json({ error: cityCleanup.error.message }, { status: 500 });
  const encounterCleanup = await admin.from('encounters').delete().lt('expires_at', now);
  if (encounterCleanup.error) return Response.json({ error: encounterCleanup.error.message }, { status: 500 });
  const oldDeliveries = await admin.from('notification_deliveries').delete().lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString());
  if (oldDeliveries.error) return Response.json({ error: oldDeliveries.error.message }, { status: 500 });
  const oldUsage = await admin.from('street_activation_usage').delete().lte('started_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  if (oldUsage.error) return Response.json({ error: oldUsage.error.message }, { status: 500 });
  return Response.json({ removedOutfits: removedCount, removedOrphans, expiredLocationsErased: true });
});
