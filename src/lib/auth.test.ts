import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isAuthCallbackUrl, isRecoveryCallbackUrl } from './validation';

describe('enlaces de autenticación', () => {
  it('acepta exclusivamente el callback de BeSeen', () => {
    expect(isAuthCallbackUrl('beseen://auth/callback?code=abc')).toBe(true);
    expect(isAuthCallbackUrl('beseen://auth/callback#access_token=x')).toBe(true);
    expect(isAuthCallbackUrl('beseen://auth/callback.evil?code=abc')).toBe(false);
    expect(isAuthCallbackUrl('https://example.com/callback?code=abc')).toBe(false);
    expect(isAuthCallbackUrl('not-a-url')).toBe(false);
  });

  it('reconoce recuperación solo mediante el parámetro exacto', () => {
    expect(isRecoveryCallbackUrl('beseen://auth/callback?code=abc&type=recovery')).toBe(true);
    expect(isRecoveryCallbackUrl('beseen://auth/callback#access_token=x&type=recovery')).toBe(true);
    expect(isRecoveryCallbackUrl('beseen://auth/callback?next=type%3Drecovery')).toBe(false);
    expect(isRecoveryCallbackUrl('beseen://auth/callback?type=signup')).toBe(false);
    expect(isRecoveryCallbackUrl('https://example.com/?type=recovery')).toBe(false);
  });
});

describe('confirmación de correo', () => {
  it('permite solicitar otro correo sin iniciar una sesión automática', () => {
    const authService = readFileSync('src/services/auth.ts', 'utf8');
    expect(authService).toContain("type: 'signup'");
    expect(authService).toContain('/functions/v1/auth-confirmed');
    expect(authService).toContain("emailRedirectTo: authLandingFor('signup')");
    expect(authService).toContain("redirectTo: authLandingFor('recovery')");
    expect(readFileSync('App.tsx', 'utf8')).toContain('Resend confirmation email');
  });
});
