export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

export function isValidUsername(value: string) {
  return /^[a-z0-9._]{3,24}$/.test(normalizeUsername(value));
}

export function isAdult(birthDate: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return false;
  if (year < 1900 || candidate > now) return false;
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age >= 18;
}

export function relativeTime(isoDate: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

export function remainingTime(expiresAt: number | null, now = Date.now()) {
  if (!expiresAt) return '00:00';
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function isAuthCallbackUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'beseen:' && parsed.hostname === 'auth' && parsed.pathname === '/callback';
  } catch {
    return false;
  }
}

export function isRecoveryCallbackUrl(url: string) {
  if (!isAuthCallbackUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    return parsed.searchParams.get('type') === 'recovery' || fragment.get('type') === 'recovery';
  } catch {
    return false;
  }
}
