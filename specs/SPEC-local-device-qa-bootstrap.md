# Spec: Bootstrap local de dispositivo para QA

Estado: aprobada para implementación local el 2026-08-28.
Módulo: `experience-quality` / `access-control`.
Capability map: `specs/CAPABILITY-MAP.md`.

## Objetivo

Permitir validar en localhost el flujo existente de autorización del primer dispositivo, creación del primer Admin y posterior login, sin desplegar ni escribir datos en Firebase de producción.

## Alcance

- Añadir un modo explícito `emulator` para conectar Firebase Authentication y Realtime Database a los emuladores locales.
- Añadir un helper de QA que reciba el UID mostrado por `DevicePending` y cree `v1/authorizedDevices/{uid}` sólo en `127.0.0.1:9000`.
- Mantener el logo y las pantallas existentes de dispositivo pendiente y primer Admin.
- Documentar los comandos y el recorrido completo de QA local.
- Dejar intactas las reglas que impiden a la aplicación cliente escribir `authorizedDevices`.

## Fuera de alcance

- Cambiar el modelo de autenticación o las reglas de producción.
- Crear un módulo de administración de dispositivos en la aplicación.
- Autorizar dispositivos de producción desde el navegador.
- Instalar dependencias, usar credenciales de Meta/Firebase o desplegar.
- Tratar la URL, el UID anónimo o el código de dispositivo como sustitutos de una autenticación fuerte.

## Criterios de aceptación

- [ ] `npm run emulators` inicia Auth y Realtime Database únicamente en los puertos locales documentados.
- [ ] `npm run dev:emulator` usa una configuración demo sin secretos y conecta el SDK a `127.0.0.1`.
- [ ] `npm run qa:authorize-device -- <uid>` valida el UID y crea un registro habilitado con etiqueta de QA en el emulador.
- [ ] El helper rechaza URLs de producción, hosts no locales, protocolos inseguros y UIDs inválidos antes de cualquier petición.
- [ ] El modo normal (`npm run dev`) conserva el comportamiento y la configuración de producción actuales.
- [ ] El flujo local completo es: pantalla con logo y UID → helper → pantalla de primer Admin → creación local del Admin → login local.
- [ ] No se modifican `database.rules.json`, credenciales, datos reales ni configuraciones de despliegue.

## Seguridad y privacidad

- El helper usa un endpoint fijo de loopback; no acepta una URL arbitraria desde la línea de comandos.
- La escritura del helper se realiza contra la API administrativa del emulador local, no desde el cliente y no contra producción.
- El modo emulator está deshabilitado por defecto.
- La configuración demo no contiene API keys, tokens ni secretos reutilizables.
- El futuro módulo de gestión de dispositivos deberá aplicar autorización del lado servidor/reglas, auditoría, revocación y una política de autenticación fuerte; ocultar la URL no será un control de seguridad.

## Archivos probables

- `app/.env.emulator`
- `app/.gitignore`
- `app/firebase.json`
- `app/package.json`
- `app/scripts/authorize-local-device.mjs`
- `app/src/firebase/config.ts`
- `app/src/firebase/auth.ts`
- `app/src/firebase/database.ts`
- `app/tests/local-device-authorization.test.mjs`
- `app/README.md`
- `Docs/decisions/ADR-002-local-device-emulator-bootstrap.md`

## Estrategia de pruebas y QA

- Pruebas unitarias del helper para validación de UID, construcción del registro y rechazo de producción.
- Typecheck y lint enfocados para la integración Firebase.
- Arranque de los emuladores y recorrido local completo en Chrome.
- La sesión de prueba se crea manualmente en el navegador; no se leen ni automatizan credenciales.
- La evidencia deberá incluir consola limpia, DOM de ambas pantallas, persistencia local del registro y login exitoso.
