import { requireSupabase } from '../lib/supabase';

export type IdentityStatus = 'pending' | 'verified' | 'rejected';

export async function startIdentityVerification() {
  const { error } = await requireSupabase().rpc('confirm_profile_adult');
  if (error) throw new Error(error.message || 'We could not confirm your adult status.');
  return { verified: true };
}

export async function getIdentityStatus(): Promise<IdentityStatus> {
  const client = requireSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) throw new Error('Your session has expired.');
  const { data, error } = await client.from('identity_verifications').select('status').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return (data?.status as IdentityStatus | undefined) ?? 'pending';
}
