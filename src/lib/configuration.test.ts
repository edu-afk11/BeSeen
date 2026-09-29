import { describe, expect, it } from 'vitest';
import { isUsableRevenueCatKey, isUsableRevenueCatTestKey, isUsableSupabaseConfig } from './configuration';
import { readFileSync } from 'node:fs';

const appConfig = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const easConfig = JSON.parse(readFileSync('eas.json', 'utf8'));
const gitIgnore = readFileSync('.gitignore', 'utf8');
const easIgnore = readFileSync('.easignore', 'utf8');
const appSource = readFileSync('App.tsx', 'utf8');

function pngDimensions(path: string) {
  const png = readFileSync(path);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe('configuración de producción', () => {
  it('rechaza plantillas y conexiones inseguras de Supabase', () => {
    expect(isUsableSupabaseConfig('https://tu-proyecto.supabase.co', 'tu-clave-publica')).toBe(false);
    expect(isUsableSupabaseConfig('http://project.supabase.co', `sb_publishable_${'a'.repeat(30)}`)).toBe(false);
    expect(isUsableSupabaseConfig('https://project.supabase.co', 'corta')).toBe(false);
  });

  it('acepta claves públicas modernas o JWT con URL HTTPS', () => {
    expect(isUsableSupabaseConfig('https://project.supabase.co', `sb_publishable_${'a'.repeat(30)}`)).toBe(true);
    expect(isUsableSupabaseConfig('https://project.supabase.co', `${'a'.repeat(30)}.${'b'.repeat(30)}.${'c'.repeat(30)}`)).toBe(true);
  });

  it('comprueba la clave correspondiente de RevenueCat', () => {
    expect(isUsableRevenueCatKey('appl_xxxxx', 'ios')).toBe(false);
    expect(isUsableRevenueCatKey('goog_123456789abcdef', 'android')).toBe(true);
    expect(isUsableRevenueCatKey('goog_123456789abcdef', 'ios')).toBe(false);
  });

  it('acepta la clave de Test Store solo con su prefijo propio', () => {
    expect(isUsableRevenueCatTestKey('test_123456789abcdef')).toBe(true);
    expect(isUsableRevenueCatTestKey('test_xxxxx')).toBe(false);
    expect(isUsableRevenueCatTestKey('goog_123456789abcdef')).toBe(false);
  });

  it('solicita únicamente permisos necesarios', () => {
    const picker = appConfig.plugins.find((plugin: unknown[]) => plugin[0] === 'expo-image-picker')[1];
    const location = appConfig.plugins.find((plugin: unknown[]) => plugin[0] === 'expo-location')[1];
    expect(picker.microphonePermission).toBe(false);
    expect(location.isIosBackgroundLocationEnabled).toBe(false);
    expect(location.isAndroidBackgroundLocationEnabled).toBe(false);
    expect(location.isAndroidForegroundServiceEnabled).toBe(false);
    expect(appConfig.android.blockedPermissions).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(appConfig.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
  });

  it('utiliza un icono de tienda cuadrado de 1024 píxeles', () => {
    expect(appConfig.icon).toBe('./assets/app-icon-store-1024.png');
    expect(appConfig.android.adaptiveIcon.foregroundImage).toBe('./assets/app-icon-foreground-1024.png');
    expect(pngDimensions(appConfig.android.adaptiveIcon.foregroundImage.replace('./', ''))).toEqual({ width: 1024, height: 1024 });
    expect(pngDimensions(appConfig.icon.replace('./', ''))).toEqual({ width: 1024, height: 1024 });
  });

  it('excluye secretos y artefactos de las entregas', () => {
    expect(gitIgnore).toContain('.env.*');
    expect(gitIgnore).toContain('!.env.example');
    expect(gitIgnore).toContain('dist-*/');
    expect(easIgnore).toContain('.env*');
    expect(easIgnore).toContain('supabase/');
    expect(easIgnore).toContain('src/**/*.test.ts');
    expect(easIgnore).toContain('assets/app-icon-1024.png');
  });

  it('nunca crea una entrega de producción en modo demo', () => {
    expect(easConfig.build.production.env.EXPO_PUBLIC_DEMO_MODE).toBe('false');
    expect(easConfig.build.production.env.EXPO_PUBLIC_REVENUECAT_TEST_MODE).toBe('false');
    expect(easConfig.build.preview.env.EXPO_PUBLIC_REVENUECAT_TEST_MODE).toBe('false');
  });

  it('exige un proyecto EAS antes de habilitar notificaciones reales', () => {
    const preflight = readFileSync('scripts/preflight.mjs', 'utf8');
    expect(preflight).toContain('expo.extra.eas.projectId');
    expect(preflight).toContain('easProjectId');
  });

  it('no promete pruebas ni precios que RevenueCat no haya confirmado', () => {
    expect(appSource).not.toContain('PROBAR 7 DÍAS');
    expect(appSource).toContain('product.product.priceString');
    expect(appSource).toContain('OFFER UNAVAILABLE');
  });

  it('mantiene las acciones principales en el coral de BeSeen', () => {
    expect(appSource).not.toContain("orange: '#FF8A00'");
    expect(appSource).not.toContain('#FF704D');
    expect(appSource).not.toContain('#E85F40');
    expect(appSource).toContain('styles.coralAction');
    expect(appSource).toContain("coral: '#F98F73'");
  });

  it('mantiene la navegación inferior en coral sin alterar sus textos', () => {
    expect(appSource).toContain('const color = active ? C.coral');
    expect(appSource).toContain('navTextActive: { color: C.coral');
    expect(appSource).toContain('backgroundColor: C.coral, borderWidth: 5');
    expect(appSource).toContain('<Text style={styles.addOutfitText}>+</Text>');
    expect(appSource).toContain('<Text style={styles.navTextActive}>Home</Text>');
  });

  it('mantiene en coral los estados y acciones señalados de outfit y Plus', () => {
    expect(appSource).toContain('styles.coralAction, styles.storySave');
    expect(appSource).toContain('storyAdd: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.coral');
    expect(appSource).toContain('plusKicker: { color: C.coral');
    expect(appSource).toContain('rangeChipActive: { backgroundColor: C.coral }');
  });
});
