import * as Location from 'expo-location';
import { requireSupabase } from '../lib/supabase';
import { recordLocationConsent } from './consent';

export async function activateStreetMode(outfitId: string, minutes = 30) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location access is required while you use Street Mode.');

  await recordLocationConsent();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const { data, error } = await requireSupabase().rpc('activate_street_mode', {
    outfit_id_input: outfitId,
    latitude_input: position.coords.latitude,
    longitude_input: position.coords.longitude,
    expires_at_input: expiresAt,
  });
  if (error) throw error;
  return data;
}

export async function refreshStreetLocation() {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Location permission unavailable');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const { error } = await requireSupabase().rpc('refresh_street_location', {
    latitude_input: position.coords.latitude,
    longitude_input: position.coords.longitude,
  });
  if (error) throw error;
}

export async function findRecentEncounters() {
  const { data, error } = await requireSupabase().rpc('find_recent_encounters');
  if (error) throw error;
  return data;
}

export async function requestInteraction(targetSessionId: string) {
  const { data, error } = await requireSupabase().rpc('request_interaction', {
    target_session_id_input: targetSessionId,
  });
  if (error) throw error;
  return data;
}

export async function deactivateStreetMode() {
  const { error } = await requireSupabase().rpc('deactivate_street_mode');
  if (error) throw error;
}

export async function getActiveStreetSession(): Promise<{ session_id: string; expires_at: string; outfit_id: string } | null> {
  const { data, error } = await requireSupabase().rpc('get_my_active_street_session');
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function getStreetModeAllowance(): Promise<{ has_plus: boolean; used: number; remaining: number }> {
  const { data, error } = await requireSupabase().rpc('get_street_mode_allowance');
  if (error) throw error;
  return data?.[0] ?? { has_plus: false, used: 0, remaining: 3 };
}
