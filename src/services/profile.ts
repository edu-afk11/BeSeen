import { requireSupabase } from '../lib/supabase';
import { isAdult, normalizeUsername } from '../lib/validation';
export { isAdult, normalizeUsername } from '../lib/validation';

export type DiscoveryCategory = 'woman' | 'man' | 'nonbinary';
export type DiscoveryPreference = DiscoveryCategory | 'everyone';

export async function createProfile(usernameInput: string, birthDate: string, cityInput: string, discoveryCategory: DiscoveryCategory, discoveryPreference: DiscoveryPreference) {
  const client = requireSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) throw new Error('Your session has expired.');
  const username = normalizeUsername(usernameInput);
  const city = cityInput.trim().replace(/\s+/g, ' ');
  if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error('This @ is not valid.');
  if (!isAdult(birthDate)) throw new Error('BeSeen is for adults only.');
  if (city.length < 2 || city.length > 80) throw new Error('Enter a valid city.');
  const result = await client.rpc('create_my_profile', {
    username_input: username,
    birth_date_input: birthDate,
    city_input: city,
    category_input: discoveryCategory,
    preference_input: discoveryPreference,
  });
  if (result.error) throw result.error;
  const adult = await client.rpc('confirm_profile_adult');
  if (adult.error) throw adult.error;
  return result.data;
}

export async function updateCity(cityInput: string) {
  const city = cityInput.trim().replace(/\s+/g, ' ');
  if (city.length < 2 || city.length > 80) throw new Error('Enter a valid city.');
  const result = await requireSupabase().rpc('update_city', { city_input: city });
  if (result.error) throw result.error;
  return city;
}

export async function updateDiscoveryPreferences(discoveryCategory: DiscoveryCategory, discoveryPreference: DiscoveryPreference) {
  const result = await requireSupabase().rpc('update_discovery_preferences', {
    category_input: discoveryCategory,
    preference_input: discoveryPreference,
  });
  if (result.error) throw result.error;
}

export async function updateUsername(usernameInput: string) {
  const username = normalizeUsername(usernameInput);
  if (!/^[a-z0-9._]{3,24}$/.test(username)) throw new Error('This @ is not valid.');
  const result = await requireSupabase().rpc('change_username', { username_input: username });
  if (result.error) throw result.error;
  return username;
}

export async function requestAccountDeletion() {
  const result = await requireSupabase().functions.invoke('delete-account', { body: {} });
  if (result.error) throw result.error;
}

export async function getCurrentProfile() {
  const client = requireSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) return null;
  const result = await client.from('profiles').select('id,username,city,discovery_category,discovery_preference').eq('id', user.id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
