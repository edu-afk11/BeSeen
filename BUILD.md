# BeSeen builds

## Android preview APK

- Estado: compilación completada
- Build ID: `8ebdeaf4-e00e-44ad-8447-8ca14a46602e`
- Descarga: https://expo.dev/accounts/edu-afk11/projects/beseen/builds/8ebdeaf4-e00e-44ad-8447-8ca14a46602e
- Correcciones: icono Android completo, enlace de confirmación y formulario visible con el teclado.
- Perfil: `preview`
- Proyecto EAS: `@edu-afk11/beseen`

Las APK internas de tipo `preview` son compilaciones release. Por seguridad deben usar la clave Android `goog_…` de RevenueCat, igual que producción. La clave `test_…` queda reservada para compilaciones de desarrollo/debug.

La confirmación de correo vuelve primero a la página HTTPS `auth-confirmed`, que confirma el resultado y ofrece el botón **ABRIR BESEEN**. Esa URL debe estar incluida en Authentication → URL Configuration → Redirect URLs de Supabase.
