import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const schema = readFileSync('supabase/schema.sql', 'utf8').toLowerCase();
const cleanupFunction = readFileSync('supabase/functions/cleanup-expired/index.ts', 'utf8').toLowerCase();
const matchNotifier = readFileSync('supabase/functions/notify-match/index.ts', 'utf8').toLowerCase();
const chatNotifier = readFileSync('supabase/functions/notify-city-chat/index.ts', 'utf8').toLowerCase();
const outfitModerator = readFileSync('supabase/functions/moderate-outfit/index.ts', 'utf8').toLowerCase();
const identityStarter = readFileSync('supabase/functions/start-identity-verification/index.ts', 'utf8').toLowerCase();
const cityModerator = readFileSync('supabase/functions/moderate-city-post/index.ts', 'utf8').toLowerCase();
const revenueCatWebhook = readFileSync('supabase/functions/revenuecat-webhook/index.ts', 'utf8').toLowerCase();
const pushSender = readFileSync('supabase/functions/_shared/push.ts', 'utf8').toLowerCase();

describe('privacidad de la base de datos', () => {
  it('protege todas las tablas sensibles con RLS', () => {
    const tables = [...schema.matchAll(/create table public\.([a-z_]+)/g)].map((match) => match[1]);
    expect(tables.length).toBeGreaterThan(10);
    for (const table of tables) {
      expect(schema).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('no permite leer directamente registros internos', () => {
    expect(schema).not.toMatch(/create policy[^\n]+on public\.street_activation_usage/);
    expect(schema).not.toMatch(/create policy[^\n]+on public\.notification_deliveries/);
  });

  it('impide invocar directamente funciones internas de disparador', () => {
    const triggerFunctions = [...schema.matchAll(/create or replace function public\.([a-z_]+)\(\)\s*returns trigger/g)].map((match) => match[1]);
    expect(triggerFunctions.length).toBeGreaterThan(3);
    for (const functionName of triggerFunctions) {
      expect(schema).toContain(`revoke execute on function public.${functionName}() from public,anon,authenticated`);
    }
  });

  it('no revela coordenadas en la respuesta de recientes', () => {
    const signature = schema.match(/find_recent_encounters[\s\S]*?returns table\(([^)]*)\)/)?.[1] ?? '';
    expect(signature).not.toContain('latitude');
    expect(signature).not.toContain('longitude');
    expect(signature).not.toContain('distance');
  });

  it('no crea cruces usando ubicaciones antiguas', () => {
    expect(schema).toContain('location_updated_at timestamptz not null default now()');
    expect(schema).toContain("location_updated_at>now()-interval '3 minutes'");
    expect(schema).toContain('location_updated_at=now()');
  });

  it('mantiene una red de seguridad si el sistema suspende la app', () => {
    const app = readFileSync('App.tsx', 'utf8').toLowerCase();
    expect(app).toContain("appstate.addeventlistener('change'");
    expect(app).toContain('setactiveuntil(null)');
    expect(app).toContain('deactivatestreetmode().catch');
    expect(app).toContain('when you lock your phone, leave the app or stop the mode');
  });

  it('borra la presencia antes de cerrar la sesión', () => {
    const app = readFileSync('App.tsx', 'utf8').toLowerCase();
    const logout = app.slice(app.indexOf('async function logout()'), app.indexOf('async function finishauth()'));
    expect(logout.indexOf('deactivatestreetmode()')).toBeGreaterThan(-1);
    expect(logout.indexOf('deactivatestreetmode()')).toBeLessThan(logout.indexOf('signout()'));
    expect(logout).toContain('setpreparedoutfit(null)');
  });

  it('exige un cruce reciente antes de solicitar interacción', () => {
    expect(schema).toContain("raise exception 'recent proximity encounter required'");
    expect(schema).toContain("created_at>now()-interval '1 hour'");
  });

  it('revalida el outfit y los bloqueos al aceptar una respuesta del chat', () => {
    const acceptance = schema.match(/accept_city_post_response[\s\S]*?end \$\$;/)?.[0] ?? '';
    expect(acceptance).toContain("o.expires_at>now() and o.moderation_status='approved'");
    expect(acceptance).toContain('from blocks b');
  });

  it('revoca las funciones sensibles a usuarios anónimos', () => {
    expect(schema).toContain('st_dwithin(s.location,own_session.location,50)');
    expect(schema).toContain('requester_session_id=recorded_encounter.target_session_id');
    expect(schema).toContain('target_session_id=recorded_encounter.observer_session_id');
    expect(schema).toContain('set ended_at = now(), location = null');
    expect(schema).not.toContain('policy "outfit owner manages own"');
    expect(schema).toContain('create_pending_outfit(storage_path_input text)');
    expect(schema).toContain('create or replace function public.can_upload_outfit()');
    expect(schema).toContain('return recent_uploads<10');
    expect(schema).toContain('public.can_upload_outfit()');
    expect(schema).not.toContain('profile owner updates self');
    expect(schema).toContain('create_my_profile(username_input text,birth_date_input date');
    expect(schema).toContain("email_confirmed_at is not null) then raise exception 'confirmed email required'");
    expect(schema).toContain("privacy_version='2026-09-03') then raise exception 'current legal consent required'");
    expect(schema).toContain('one_report_per_encounter');
    expect(schema).toContain('delete from interaction_requests where (requester_id=auth.uid()');
    expect(schema).toContain('delete from city_post_responses r using city_posts p');
    expect(schema).toContain('create trigger reject_blocked_interaction');
    expect(schema).toContain('create trigger reject_blocked_match');
    expect(schema).toContain('create trigger enforce_city_post_rate');
    expect(schema).toContain('create trigger enforce_city_response_rate');
    expect(schema).toContain('create trigger enforce_interaction_rate');
    expect(schema).toContain("hashtextextended('city-post:'||new.user_id::text,0)");
    expect(schema).toContain("created_at>now()-interval '24 hours')>=10");
    expect(schema).not.toContain('consent owner manages');
    expect(schema).toContain('require_street_location_consent');
    expect(schema).toContain('where subscriptions.revenuecat_event_at<excluded.revenuecat_event_at');
    expect(schema).toContain('to service_role');
    expect(schema).not.toContain('push token owner manages');
    expect(schema).toContain('register_push_token(token_input text,platform_input text)');
    expect(schema).toContain('unregister_push_token(token_input text)');
    expect(schema).toContain('delete from push_tokens where token=token_input and user_id=auth.uid()');
    expect(schema).not.toContain('push token owner deletes');
    expect(schema).toContain('reserve_identity_attempt(user_id_input uuid)');
    expect(schema).toContain("requested_at<now()-interval '10 minutes'");
    expect(schema).toContain("city_post_reports where reporter_id=auth.uid() and created_at>now()-interval '24 hours'");
    expect(schema).toContain('delete from encounters where observer_id=auth.uid() and target_session_id=target_session_id_input');
    expect(schema).toContain('cpr.post_id=p.id and cpr.reporter_id=auth.uid()');
    expect(schema).toContain('pg_advisory_xact_lock');
    expect(schema).toContain("now()+interval '30 minutes'");
    expect(schema).toContain('insert into street_activation_usage(user_id,started_at)');
    expect((schema.match(/from street_activation_usage where user_id=auth\.uid\(\) and started_at>now\(\)-interval '24 hours'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(schema).toContain("delete from street_activation_usage where started_at<=now()-interval '24 hours'");
    expect(schema).toContain('create or replace function public.invoke_beseen_storage_cleanup()');
    expect(schema).toContain("where name='beseen_cleanup_webhook_secret'");
    expect(schema).toContain("cron.schedule('beseen-storage-cleanup','*/15 * * * *'");
    expect(schema).toContain('on conflict(user_low,user_high) do nothing');
    expect((schema.match(/viewer\.discovery_preference='everyone'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(schema).toContain("author.discovery_preference='everyone' or author.discovery_preference=me.discovery_category");
    expect(schema).toContain('automatic_moderated_at timestamptz');
    expect(schema).toContain('is_own boolean,moderation_status text');
    expect((schema.match(/automatic_moderated_at timestamptz/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(schema).toContain('expires_at>=new.expires_at');
    expect(schema).toContain('revoke execute on function public.delete_my_account() from authenticated');
    expect(schema).toContain('revoke execute on function public.request_interaction(uuid) from public,anon');
    expect(schema).toContain('revoke execute on function public.delete_my_account() from public,anon');
  });

  it('minimiza identidad y limita los outfits a 24 horas', () => {
    const profilesDefinition = schema.match(/create table public\.profiles \([\s\S]*?\n\);/)?.[0] ?? '';
    expect(profilesDefinition).not.toContain('birth_date');
    expect(schema).toContain("default now()+interval '24 hours'");
    expect(schema).not.toContain("delete from storage.objects where bucket_id='outfits' and name in");
    expect(readFileSync('App.tsx', 'utf8')).toContain('Visible in Street Mode and related crossings for 24 hours.');
  });

  it('borra la última ubicación de sesiones vencidas', () => {
    expect(schema).toContain('update street_sessions set location=null');
    expect(cleanupFunction).toContain("from('street_sessions').update({ location: null })");
    expect(cleanupFunction).toContain(".lt('expires_at', now)");
    expect(cleanupFunction).toContain('date.now() - 15 * 60_000');
    expect(cleanupFunction).toContain("candidates.filter((path) => !known.has(path))");
    expect(cleanupFunction).toContain("from('notification_deliveries').delete()");
  });

  it('verifica en base de datos los destinatarios de las notificaciones', () => {
    expect(matchNotifier).toContain("from('matches').select('id,user_low,user_high')");
    expect(chatNotifier).toContain("from('city_post_responses').select('id,post_id,responder_id,accepted_at')");
    expect(matchNotifier).toContain("request.method !== 'post'");
    expect(chatNotifier).toContain("request.method !== 'post'");
    expect(matchNotifier).toContain("from('notification_deliveries').insert");
    expect(chatNotifier).toContain("from('notification_deliveries').insert");
  });

  it('conecta automáticamente matches y respuestas con sus webhooks', () => {
    expect(schema).toContain('create trigger notify_new_match after insert on public.matches');
    expect(schema).toContain('create trigger notify_new_city_response after insert on public.city_post_responses');
    expect(schema).toContain("'/functions/v1/notify-match'");
    expect(schema).toContain("'/functions/v1/notify-city-chat'");
    expect(schema).toContain("name='beseen_match_webhook_secret'");
    expect(schema).toContain("name='beseen_chat_webhook_secret'");
  });

  it('elimina físicamente las imágenes rechazadas', () => {
    expect(outfitModerator).toContain("status === 'rejected'");
    expect(outfitModerator).toContain("storage.from('outfits').remove([outfit.storage_path])");
    expect(outfitModerator).toContain('image_removed');
  });

  it('rechaza cuerpos JSON dañados en funciones sensibles', () => {
    expect(outfitModerator).toContain("error: 'invalid json'");
    expect(cityModerator).toContain("error: 'invalid json'");
    expect(revenueCatWebhook).toContain("response('invalid json', { status: 400 })");
  });

  it('limita y libera los intentos fallidos de verificación externa', () => {
    expect(identityStarter).toContain("request.method !== 'post'");
    expect(identityStarter).toContain("parsedproviderurl.protocol !== 'https:'");
    expect(identityStarter).toContain('abortsignal.timeout(10_000)');
    expect(identityStarter).toContain('releasereservation');
  });

  it('solo modera mediante proveedores HTTPS con respuestas explícitas', () => {
    for (const moderator of [outfitModerator, cityModerator]) {
      expect(moderator).toContain("moderationurl.protocol !== 'https:'");
      expect(moderator).toContain("typeof decision.safe !== 'boolean'");
      expect(moderator).toContain('abortsignal.timeout(8000)');
    }
  });

  it('reintenta respuestas inválidas o fallos temporales de notificaciones', () => {
    expect(pushSender).toContain('abortsignal.timeout(8_000)');
    expect(pushSender).toContain('expo push returned invalid json');
    expect(pushSender).toContain('tickets.length !== messages.length');
    expect(pushSender).toContain("details?.error !== 'devicenotregistered'");
  });

  it('concede solo las lecturas directas que necesita el teléfono', () => {
    expect(schema).toContain('grant usage on schema public to authenticated');
    expect(schema).toContain('grant select on table public.profiles to authenticated');
    expect(schema).toContain('grant select on table public.identity_verifications to authenticated');
    expect(schema).toContain('grant select on table public.outfits to authenticated');
    expect(schema).not.toContain('grant all on all tables');
    expect(schema).not.toContain('grant select on all tables');
  });
});
