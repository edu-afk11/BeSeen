# BeSeen

BeSeen is a mobile social discovery app for the moments when two people notice each other but neither makes the first move. A temporary outfit photo and a 30-minute, foreground-only Street Mode allow nearby compatible users to reconnect without sharing exact locations. Usernames are revealed only after mutual interest.

## Run locally

1. Install dependencies with `npm install`.
2. Start Expo with `npm start`.
3. Scan the QR code with Expo Go, or press `w` for the web version.

The local demo covers welcome, authentication, outfit capture, Street Mode, nearby encounters, mutual matching, city chat and BeSeen Plus. Production setup is documented in `PRODUCTION.md`.

## Privacy model

Outfits expire after 24 hours. Street Mode lasts 30 minutes, runs only while BeSeen is open, and removes precise location when it ends or the app is backgrounded. Exact locations are never exposed to other users. Adult confirmation stores only the minimum status needed by the app, not an identity document image or full ID number.

## License and brand

The source code is licensed under the [GNU Affero General Public License v3.0](LICENSE). Modified versions that are distributed or made available over a network must keep the same license and provide their corresponding source code.

The BeSeen name, logo, visual identity and related marks are not granted for use as trademarks. The open-source license covers copyright permissions for the repository; it does not grant permission to present a modified or competing product as the official BeSeen app.

## Security

No production passwords, service-role keys, webhook secrets or user data belong in this repository. Local `.env` files, Expo/EAS credentials, caches and build outputs are excluded through `.gitignore`. Use `.env.example` only as a list of required public client configuration values.

## Next Gen checks

Run `npm run check:next-gen` to verify the repository requirements that can be checked locally. Academic eligibility, repository visibility, the public demo video and the required screenshot must be completed manually before submission.

After authenticating the Supabase CLI, deploy all Edge Functions with `powershell -ExecutionPolicy Bypass -File scripts/deploy-supabase.ps1`.

---

## Español

Primer prototipo móvil navegable de BeSeen.

## Ejecutar

1. Instala las dependencias con `npm install`.
2. Inicia Expo con `npm start`.
3. Escanea el QR con Expo Go o pulsa `w` para la versión web.

La demo permite recorrer bienvenida, acceso, inicio, creación de outfit, activación del modo calle, descubrimiento y match mutuo.

## Backend

La base para Supabase está en `supabase/schema.sql`. Copia `.env.example` a `.env` y añade la URL y la clave pública del proyecto. El esquema exige verificación de identidad y mayoría de edad antes de activar el modo calle; la ubicación exacta nunca queda expuesta por las políticas de acceso.

El modo calle solo actualiza la ubicación mientras BeSeen está abierta y visible. Al bloquear el móvil o enviar la app al fondo se desactiva; el servidor descarta además cualquier posición que lleve más de tres minutos sin actualizarse.

## Comprobaciones

- `npm run check`: tipos y pruebas automáticas.
- `npm run preflight`: comprueba que las claves públicas de producción estén configuradas y que el modo demo esté desactivado.
- `npm run check:production`: ejecuta ambas comprobaciones antes de compilar una entrega real.

La puesta en producción completa está explicada en `PRODUCTION.md`.
