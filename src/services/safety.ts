import { requireSupabase } from '../lib/supabase';

export async function blockEncounter(targetSessionId: string) {
  const result = await requireSupabase().rpc('block_encounter', { target_session_id_input: targetSessionId });
  if (result.error) throw result.error;
}

export async function reportEncounter(targetSessionId: string, reason: 'inappropriate_outfit' | 'harassment' | 'fake_profile' | 'other') {
  const result = await requireSupabase().rpc('report_encounter', { target_session_id_input: targetSessionId, reason_input: reason });
  if (result.error) throw result.error;
}
