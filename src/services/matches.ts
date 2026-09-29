import { requireSupabase } from '../lib/supabase';

export type MatchSummary = {
  match_id: string;
  username: string;
  matched_at: string;
};

export async function listMyMatches(): Promise<MatchSummary[]> {
  const result = await requireSupabase().rpc('list_my_matches');
  if (result.error) throw result.error;
  return (result.data ?? []) as MatchSummary[];
}

export async function getMatch(matchId: string) {
  const matches = await listMyMatches();
  return matches.find((item) => item.match_id === matchId) ?? null;
}
