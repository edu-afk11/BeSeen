import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const schema = readFileSync('supabase/schema.sql', 'utf8').toLowerCase();
const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();

describe('seguridad estructural de la base de datos', () => {
  it('activa RLS en todas las tablas públicas creadas por BeSeen', () => {
    const tables = [...schema.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/g)].map((match) => match[1]);

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(schema, `falta RLS en public.${table}`).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('mantiene privadas las funciones internas y la ubicación temporal', () => {
    expect(schema).toContain('revoke execute on function public.purge_expired_private_data() from public,anon,authenticated');
    expect(schema).toContain('revoke execute on function public.invoke_beseen_match_notification() from public,anon,authenticated');
    expect(schema).toContain('revoke execute on function public.invoke_beseen_city_response_notification() from public,anon,authenticated');
    expect(schema).toContain('delete from street_sessions where expires_at<now()');
    expect(schema).toContain('new.location=null');
    expect(schema).toContain('update street_sessions set location=null');
  });

  it('conserva migraciones SQL fechadas y sin nombres duplicados', () => {
    expect(migrations.length).toBeGreaterThan(0);
    expect(new Set(migrations).size).toBe(migrations.length);
    for (const migration of migrations) expect(migration).toMatch(/^\d{8}_[a-z0-9_]+\.sql$/);
  });

  it('elimina en cascada todos los datos asociados al cerrar una cuenta', () => {
    const profileReferences = [...schema.matchAll(/references public\.profiles\(id\)([^,\n]*)/g)];
    expect(profileReferences.length).toBeGreaterThan(0);
    for (const reference of profileReferences) {
      expect(reference[1], 'una relación con profiles no tiene borrado en cascada').toContain('on delete cascade');
    }
    expect(schema).toMatch(/public\.profiles[\s\S]*references auth\.users\(id\) on delete cascade/);
    expect(schema).toMatch(/public\.legal_consents[\s\S]*references auth\.users\(id\) on delete cascade/);
  });
});
