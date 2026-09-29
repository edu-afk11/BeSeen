import { requireSupabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system/legacy';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_OUTFIT_BYTES = 10 * 1024 * 1024;

export async function uploadOutfit(uri: string, declaredType?: string | null, _declaredSize?: number) {
  const client = requireSupabase();
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  const user = userData.user;
  const accessToken = sessionData.session?.access_token;
  if (!user || !accessToken) throw new Error('Your session has expired.');

  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (!fileInfo.exists) throw new Error('The camera photo could not be found on this device.');
  if (typeof fileInfo.size === 'number' && fileInfo.size > MAX_OUTFIT_BYTES) throw new Error('The photo exceeds the 10 MB limit.');
  const uriType = /\.png(?:\?|$)/i.test(uri) ? 'image/png' : /\.webp(?:\?|$)/i.test(uri) ? 'image/webp' : 'image/jpeg';
  const contentType = [declaredType, uriType].find((type): type is string => Boolean(type && ALLOWED_IMAGE_TYPES.includes(type)));
  if (!contentType) throw new Error('Use a JPEG, PNG or WebP image.');
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${user.id}/${Date.now()}.${extension}`;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('The storage service is not configured.');

  // Upload the local camera file directly with Android's native file uploader.
  // This avoids the unreliable file:// -> fetch/ArrayBuffer conversion in RN.
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const upload = await FileSystem.uploadAsync(
    `${supabaseUrl}/storage/v1/object/outfits/${encodedPath}`,
    uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
        'x-upsert': 'false',
      },
    },
  );
  if (upload.status < 200 || upload.status >= 300) {
    let detail = upload.body;
    try {
      const parsed = JSON.parse(upload.body) as { message?: string; error?: string };
      detail = parsed.message ?? parsed.error ?? upload.body;
    } catch { /* Keep the server response as diagnostic text. */ }
    throw new Error(detail || `Photo upload failed (${upload.status}).`);
  }
  const created = await client.rpc('create_pending_outfit', { storage_path_input: path });
  if (created.error) {
    await client.storage.from('outfits').remove([path]).catch(() => undefined);
    throw created.error;
  }
  return created.data;
}

export async function getOutfitChangeAllowance(): Promise<{ has_plus: boolean; can_change: boolean; last_changed_at: string | null; next_available_at: string | null }> {
  const { data, error } = await requireSupabase().rpc('get_outfit_change_allowance');
  if (error) throw error;
  return data?.[0] ?? { has_plus: false, can_change: true, last_changed_at: null, next_available_at: null };
}

export async function getLatestOutfit() {
  const client = requireSupabase();
  const { data, error } = await client.from('outfits').select('id,storage_path,moderation_status,created_at,expires_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const imageUrl = await getTemporaryOutfitUrl(data.storage_path).catch(() => undefined);
  return { ...data, imageUrl };
}

export async function getTemporaryOutfitUrl(storagePath: string) {
  const result = await requireSupabase().storage.from('outfits').createSignedUrl(storagePath, 10 * 60);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
