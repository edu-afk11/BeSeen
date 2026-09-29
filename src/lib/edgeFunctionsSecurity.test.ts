import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const readFunction = (name: string) => readFileSync(`supabase/functions/${name}/index.ts`, 'utf8');

describe('seguridad de las funciones externas', () => {
  it.each(['identity-webhook', 'revenuecat-webhook', 'cleanup-expired', 'notify-match', 'notify-city-chat'])(
    '%s exige un secreto y solo acepta POST',
    (name) => {
      const source = readFunction(name);
      expect(source).toContain("request.method !== 'POST'");
      expect(source).toMatch(/request\.headers\.get\(['"](?:authorization|x-[a-z-]+)['"]\)/);
      expect(source).toMatch(/Deno\.env\.get\(['"][A-Z_]+SECRET|Deno\.env\.get\(['"]REVENUECAT_WEBHOOK_AUTH/);
    },
  );

  it.each(['moderate-outfit', 'moderate-city-post', 'start-identity-verification', 'delete-account'])(
    '%s valida la sesión del usuario',
    (name) => {
      const source = readFunction(name);
      expect(source).toContain("request.method !== 'POST'");
      expect(source).toContain("request.headers.get('authorization')");
      expect(source).toContain('.auth.getUser()');
      expect(source).toContain("if (!userData.user) return new Response('Unauthorized'");
    },
  );

  it('mantiene la clave administrativa fuera del código del teléfono', () => {
    const appSource = readFileSync('App.tsx', 'utf8');
    const mobileSources = [
      appSource,
      ...['auth', 'cityChat', 'identity', 'matches', 'notifications', 'outfits', 'profile', 'purchases', 'streetMode']
        .map((name) => readFileSync(`src/services/${name}.ts`, 'utf8')),
    ].join('\n');

    expect(mobileSources).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(mobileSources).not.toContain('service_role');
  });

  it('documenta todos los secretos externos necesarios para desplegar', () => {
    const productionGuide = readFileSync('PRODUCTION.md', 'utf8');
    const functionNames = readdirSync('supabase/functions', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
      .map((entry) => entry.name);
    const serverSources = functionNames.map(readFunction).join('\n');
    const standardSupabaseVariables = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
    const externalVariables = [...serverSources.matchAll(/Deno\.env\.get\(['"]([A-Z0-9_]+)['"]\)/g)]
      .map((match) => match[1])
      .filter((name) => !standardSupabaseVariables.has(name));

    for (const variable of new Set(externalVariables)) {
      expect(productionGuide, `falta documentar ${variable}`).toContain(`\`${variable}\``);
    }
  });

  it('declara la verificación JWT correcta para cada función desplegada', () => {
    const config = readFileSync('supabase/config.toml', 'utf8');
    const functionNames = readdirSync('supabase/functions', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
      .map((entry) => entry.name);
    const userFunctions = new Set(['moderate-outfit', 'moderate-city-post', 'start-identity-verification', 'delete-account']);

    for (const name of functionNames) {
      const expected = userFunctions.has(name) ? 'true' : 'false';
      expect(config, `falta configurar functions.${name}`).toMatch(
        new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt\\s*=\\s*${expected}`),
      );
    }
  });

  it('borra fotos almacenadas antes de eliminar la cuenta de acceso', () => {
    const deletion = readFunction('delete-account');
    const storageRemoval = deletion.indexOf("storage.from('outfits').remove(paths)");
    const accountRemoval = deletion.indexOf('auth.admin.deleteUser(userData.user.id)');

    expect(deletion).toContain("storage.from('outfits').list(userData.user.id, { limit: 100, offset: 0 })");
    expect(storageRemoval).toBeGreaterThan(-1);
    expect(accountRemoval).toBeGreaterThan(storageRemoval);
  });
});
