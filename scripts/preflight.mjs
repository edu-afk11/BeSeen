import { existsSync, readFileSync } from 'node:fs';

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}

const fileEnv = { ...readEnv('.env'), ...readEnv('.env.local') };
const env = { ...fileEnv, ...process.env };
const failures = [];
const warnings = [];

function requireValue(name, validate, hint) {
  const value = env[name];
  if (!value || !validate(value)) failures.push(`${name}: ${hint}`);
}

requireValue(
  'EXPO_PUBLIC_SUPABASE_URL',
  (value) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(value) && !/tu-proyecto|example/i.test(value),
  'añade la URL HTTPS real del proyecto Supabase.',
);
requireValue(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  (value) => !/tu-clave|xxxxx|example/i.test(value) && ((value.startsWith('sb_publishable_') && value.length > 30) || (value.split('.').length === 3 && value.length > 80)),
  'añade la clave pública/anon real; nunca la service_role.',
);
requireValue('EXPO_PUBLIC_REVENUECAT_IOS_KEY', (value) => /^appl_.{9,}$/.test(value) && !/xxxxx/i.test(value), 'añade la clave pública iOS de RevenueCat.');
requireValue('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY', (value) => /^goog_.{9,}$/.test(value) && !/xxxxx/i.test(value), 'añade la clave pública Android de RevenueCat.');

if (env.EXPO_PUBLIC_DEMO_MODE !== 'false') failures.push('EXPO_PUBLIC_DEMO_MODE: debe ser false en producción.');
if (!existsSync('supabase/schema.sql')) failures.push('supabase/schema.sql: no se encuentra el esquema de base de datos.');
if (!existsSync('assets/app-icon-store-1024.png')) failures.push('assets/app-icon-store-1024.png: falta el icono de la aplicación.');

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const easProjectId = app.extra?.eas?.projectId;
if (typeof easProjectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(easProjectId)) {
  failures.push('expo.extra.eas.projectId: vincula BeSeen con un proyecto EAS antes de generar la versión de tienda.');
}
if (app.version === '0.1.0') warnings.push('La versión sigue en 0.1.0; confírmala antes de enviar a las tiendas.');
if (app.ios?.bundleIdentifier === 'com.beseen.app' || app.android?.package === 'com.beseen.app') {
  warnings.push('Confirma que com.beseen.app es el identificador definitivo y que está disponible en ambas tiendas.');
}

if (failures.length) {
  console.error('\nBeSeen todavía no está listo para producción:\n');
  failures.forEach((failure) => console.error(`  ✗ ${failure}`));
  if (warnings.length) {
    console.error('\nAvisos:');
    warnings.forEach((warning) => console.error(`  ! ${warning}`));
  }
  console.error('\nLa demo y las pruebas locales pueden seguir usándose.\n');
  process.exit(1);
}

console.log('\n✓ Configuración pública preparada para producción.');
warnings.forEach((warning) => console.log(`! ${warning}`));
console.log('Recuerda completar también los secretos privados indicados en PRODUCTION.md.\n');
