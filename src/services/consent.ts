import { requireSupabase } from '../lib/supabase';

export const LEGAL_VERSION = '2026-09-03';

export async function recordCoreConsent() {
  const result = await requireSupabase().rpc('accept_core_legal', { version_input: LEGAL_VERSION });
  if (result.error) throw result.error;
}

export async function recordLocationConsent() {
  const result = await requireSupabase().rpc('accept_location_legal', { version_input: LEGAL_VERSION });
  if (result.error) throw result.error;
}
