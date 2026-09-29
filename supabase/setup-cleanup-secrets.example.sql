-- Ejecutar una sola vez en el editor SQL de Supabase, sustituyendo ambos valores.
-- Los valores quedan cifrados en Vault y no aparecen dentro del trabajo programado.
-- Configura el mismo segundo valor como CLEANUP_WEBHOOK_SECRET en Edge Functions.
select vault.create_secret('https://TU-PROYECTO.supabase.co','beseen_project_url');
select vault.create_secret('GENERA-UN-SECRETO-LARGO-Y-ALEATORIO','beseen_cleanup_webhook_secret');
select vault.create_secret('GENERA-OTRO-SECRETO-LARGO-Y-ALEATORIO','beseen_match_webhook_secret');
select vault.create_secret('GENERA-UN-TERCER-SECRETO-LARGO-Y-ALEATORIO','beseen_chat_webhook_secret');
