import { requireSupabase } from '../lib/supabase';

export type CityPost = { post_id: string; description: string; place_hint: string; time_hint: string; created_at: string; response_sent: boolean; is_own: boolean; moderation_status: 'pending' | 'approved' | 'rejected' };

export async function listCityPosts() {
  const { data, error } = await requireSupabase().rpc('list_city_posts');
  if (error) throw error;
  return (data ?? []) as CityPost[];
}

export async function createCityPost(descriptionInput: string, placeHint: string, timeHint: string) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('create_city_post', { description_input: descriptionInput.trim(), place_hint_input: placeHint.trim(), time_hint_input: timeHint.trim() });
  if (error) throw error;
  client.functions.invoke('moderate-city-post', { body: { postId: data } }).catch(() => undefined);
  return data as string;
}

export async function reportCityPost(postId: string, reason = 'other') {
  const { error } = await requireSupabase().rpc('report_city_post', { post_id_input: postId, reason_input: reason });
  if (error) throw error;
}

export async function respondToCityPost(postId: string, outfitId: string) {
  const { error } = await requireSupabase().rpc('respond_to_city_post', { post_id_input: postId, outfit_id_input: outfitId });
  if (error) throw error;
}

export async function listCityPostResponses(postId: string) {
  const { data, error } = await requireSupabase().rpc('list_city_post_responses', { post_id_input: postId });
  if (error) throw error;
  return data ?? [];
}

export async function acceptCityPostResponse(responseId: string) {
  const { data, error } = await requireSupabase().rpc('accept_city_post_response', { response_id_input: responseId });
  if (error) throw error;
  return data as { matched: boolean; match_id: string; username: string };
}
