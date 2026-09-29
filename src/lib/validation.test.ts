import { describe, expect, it } from 'vitest';
import { isAdult, isValidUsername, normalizeUsername, relativeTime, remainingTime } from './validation';

describe('identidad', () => {
  it('normaliza el @ sin cambiar su significado', () => expect(normalizeUsername(' @Marco.S ')).toBe('marco.s'));
  it('rechaza usuarios demasiado cortos o con espacios', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('ana maria')).toBe(false);
    expect(isValidUsername('@ana_23')).toBe(true);
  });
  it('exige 18 años cumplidos, no solo el año', () => {
    const today = new Date('2026-09-03T12:00:00Z');
    expect(isAdult('2008-09-03', today)).toBe(true);
    expect(isAdult('2008-09-04', today)).toBe(false);
  });
  it('rechaza formatos y fechas de calendario imposibles', () => {
    const today = new Date('2026-09-05T12:00:00Z');
    expect(isAdult('2000-02-31', today)).toBe(false);
    expect(isAdult('00/01/2000', today)).toBe(false);
    expect(isAdult('2027-01-01', today)).toBe(false);
    expect(isAdult('2008-02-29', today)).toBe(true);
  });
});

describe('modo calle', () => {
  it('muestra el tiempo restante sin valores negativos', () => {
    expect(remainingTime(1_800_000, 0)).toBe('30:00');
    expect(remainingTime(0, 1_000)).toBe('00:00');
  });
  it('resume cuándo ocurrió un cruce', () => {
    const now = new Date('2026-09-03T12:00:00Z').getTime();
    expect(relativeTime('2026-09-03T11:58:00Z', now)).toBe('2 min ago');
    expect(relativeTime('2026-09-03T10:00:00Z', now)).toBe('2 h ago');
  });
});
