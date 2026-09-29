export function isUsableSupabaseConfig(url?: string, key?: string) {
  if (!url || !key || /tu-proyecto|example|xxxxx/i.test(`${url} ${key}`)) return false;
  try {
    const parsed = new URL(url);
    const usableKey = (key.startsWith('sb_publishable_') && key.length > 30) || (key.split('.').length === 3 && key.length > 80);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname) && usableKey;
  } catch {
    return false;
  }
}

export function isUsableRevenueCatKey(key: string | undefined, platform: 'ios' | 'android') {
  if (!key || /xxxxx|example/i.test(key)) return false;
  const prefix = platform === 'ios' ? 'appl_' : 'goog_';
  return key.startsWith(prefix) && key.length > prefix.length + 8;
}

export function isUsableRevenueCatTestKey(key: string | undefined) {
  return Boolean(key && !/xxxxx|example/i.test(key) && key.startsWith('test_') && key.length > 13);
}
