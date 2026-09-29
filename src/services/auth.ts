import { requireSupabase } from '../lib/supabase';
import { isAuthCallbackUrl } from '../lib/validation';

const authLandingUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/auth-confirmed`;
const authLandingFor = (flow: 'signup' | 'recovery') => `${authLandingUrl}?flow=${flow}`;

export async function signUp(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: authLandingFor('signup'),
      data: { legal_version: '2026-09-03', legal_accepted_at: new Date().toISOString() },
    },
  });
  if (error) throw error;
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('An account already exists for this email. Sign in or request a new confirmation email.');
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return data;
}

export async function resetPassword(email: string) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authLandingFor('recovery'),
  });
  if (error) throw error;
}

export async function resendSignupConfirmation(email: string) {
  const { error } = await requireSupabase().auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authLandingFor('signup') },
  });
  if (error) throw error;
}

export async function handleAuthCallback(url: string) {
  if (!isAuthCallbackUrl(url)) return false;
  const client = requireSupabase();
  const parsed = new URL(url);
  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  return true;
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}
