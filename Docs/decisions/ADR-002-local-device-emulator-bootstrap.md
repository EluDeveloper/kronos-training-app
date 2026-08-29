# ADR-002: Bootstrap de dispositivos sólo mediante emulador local para QA

## Status

Accepted — autorizado para implementación local el 2026-08-28.

## Date

2026-08-28

## Context

Kronos conserva una barrera deliberada: el cliente puede leer su propio registro `v1/authorizedDevices/{uid}`, pero no puede crearlo. Esa barrera protege el alta del primer Admin y evita que cualquier navegador autorice un dispositivo en producción.

El flujo necesita validarse en local sin desplegar. La configuración de desarrollo existente apunta a Firebase de producción y no hay un mecanismo seguro para sembrar el registro del dispositivo en el emulador.

## Decision

Se agregará un modo opt-in de Firebase Emulator Suite para Auth y Realtime Database, con proyecto demo y hosts/puertos de loopback fijos. Un comando de QA separado recibirá el UID visible en la pantalla `DevicePending` y escribirá el registro habilitado mediante la API REST del emulador.

El helper no será importado por la aplicación, no aceptará una URL arbitraria y fallará cerrado si el destino no es exactamente el emulador local. El modo normal y las reglas de producción permanecerán sin cambios.

## Alternatives Considered

### Permitir que el cliente escriba `authorizedDevices`

- Ventaja: el flujo sería automático.
- Rechazo: elimina el control que impide que un navegador se autorice a sí mismo en producción.

### Escribir manualmente en Firebase Console

- Ventaja: no requiere código nuevo.
- Rechazo: depende de producción, no es repetible y mezcla QA con datos reales.

### Usar el UID o la URL como secreto

- Ventaja: implementación aparentemente simple.
- Rechazo: ambos pueden ser observados o regenerados; no constituyen autenticación fuerte.

## Consequences

- El flujo de bootstrap se puede reproducir sin despliegues ni datos reales.
- La configuración demo requiere iniciar dos emuladores locales y conservar el modo normal deshabilitado por defecto.
- El helper tiene privilegios administrativos sobre el emulador, por lo que su host fijo y sus pruebas de rechazo son parte del control de seguridad.
- El futuro módulo de gestión de dispositivos deberá definir revocación, auditoría, asociación robusta del dispositivo y autenticación adicional; no se implementa en este ADR.
