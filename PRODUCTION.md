# Preparación de BeSeen para producción

La app funciona en modo demostración sin cuentas externas. Para convertirla en una aplicación real hay que completar estos pasos.

## 1. Supabase

1. Crear el proyecto y aplicar `supabase/schema.sql` y las migraciones en orden.
2. Crear un bucket privado llamado `outfits`.
3. Copiar `.env.example` como `.env.local` y rellenar la URL y la clave pública.
4. Configurar confirmación de correo y las URL de retorno con el esquema `beseen://`.
5. Desplegar las funciones de `supabase/functions`.

No se debe colocar nunca `SUPABASE_SERVICE_ROLE_KEY` dentro de la app ni en archivos `EXPO_PUBLIC_*`.

## 2. Secretos privados de las funciones

Configurar en Supabase, no en el teléfono:

- `IDENTITY_PROVIDER_URL`, `IDENTITY_PROVIDER_KEY` e `IDENTITY_WEBHOOK_SECRET`.
- `MODERATION_PROVIDER_URL`, `TEXT_MODERATION_PROVIDER_URL` y `MODERATION_PROVIDER_KEY`.
- `REVENUECAT_WEBHOOK_AUTH`.
- `MATCH_WEBHOOK_SECRET` y `CHAT_WEBHOOK_SECRET`.
- `CLEANUP_WEBHOOK_SECRET`.

Después, ejecutar una sola vez una copia privada de `supabase/setup-cleanup-secrets.example.sql`, sustituyendo sus valores. Los tres secretos deben coincidir respectivamente con `CLEANUP_WEBHOOK_SECRET`, `MATCH_WEBHOOK_SECRET` y `CHAT_WEBHOOK_SECRET`.

## 3. RevenueCat

1. Crear el entitlement `plus` y una oferta mensual para iOS y Android.
2. Añadir las claves públicas `appl_…` y `goog_…` a `.env.local`.
3. Apuntar el webhook a `revenuecat-webhook` usando el mismo valor de `REVENUECAT_WEBHOOK_AUTH`.
4. Probar compra, cancelación, caducidad y restauración en sandbox.

## 4. Verificación, moderación y seguridad

- Elegir proveedores reales de verificación de edad/identidad y moderación de imagen/texto.
- Confirmar que el proveedor de identidad no envía ni almacena el DNI completo en BeSeen.
- Probar bloqueo, denuncia, eliminación de cuenta y borrado automático de outfits a las 4 horas.
- Revisar los textos legales con asesoramiento profesional antes del lanzamiento público.

## 5. Compilación y tiendas

1. Confirmar que `com.beseen.app` es el identificador definitivo.
2. Vincular la app con un proyecto Expo/EAS para que `app.json` contenga `expo.extra.eas.projectId`, y configurar las credenciales de Apple y Google.
   Las claves públicas de Supabase y RevenueCat deben configurarse en el entorno de producción de EAS; `.env.local` está excluido deliberadamente de la entrega.
3. Ejecutar `npm run check:production` y corregir todo lo marcado.
4. Crear versiones internas, probar en dos teléfonos reales y revisar permisos, ubicación, cámara, notificaciones y compras.
5. Preparar política de privacidad, términos, ficha de tienda, capturas y datos de contacto.

La validación automática solo comprueba la configuración pública. No puede demostrar que los servicios externos estén correctamente contratados o configurados; eso se valida con las pruebas reales del último paso.
