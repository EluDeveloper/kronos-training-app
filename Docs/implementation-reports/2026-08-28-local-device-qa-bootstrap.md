# Reporte de implementación: bootstrap local de dispositivo para QA

Fecha: 2026-08-28
Estado: implementación local completada; Chrome pendiente de sesión/herramienta disponible.
Spec: `specs/SPEC-local-device-qa-bootstrap.md`
ADR: `Docs/decisions/ADR-002-local-device-emulator-bootstrap.md`

## Resultado

Se habilitó un recorrido local para la pantalla de dispositivo pendiente, autorización del UID, creación del primer Admin y login, sin desplegar ni escribir en Firebase de producción.

El modo local es opt-in y usa el proyecto demo `demo-kronos-training`. El helper externo escribe sólo mediante `http://127.0.0.1:9000`; la aplicación cliente conserva la prohibición de escritura en `v1/authorizedDevices`.

## Árbol de archivos

```text
app/
├── .env.emulator
├── .gitignore
├── README.md
├── env.d.ts
├── firebase.json
├── package.json
├── scripts/authorize-local-device.mjs
├── src/firebase/
│   ├── auth.ts
│   ├── config.ts
│   ├── database.ts
│   └── emulator-config.ts
└── tests/
    ├── firebase-emulator-config.test.ts
    └── local-device-authorization.test.mjs
Docs/
├── decisions/ADR-002-local-device-emulator-bootstrap.md
└── implementation-reports/2026-08-28-local-device-qa-bootstrap.md
specs/SPEC-local-device-qa-bootstrap.md
tasks/
├── plan.md
└── todo.md
```

## Flujo afectado

```text
Vite --mode emulator
        │
        ├── Auth Emulator :9099 ── sesión anónima / cuenta local
        │
        └── RTDB Emulator :9000
              │
              ├── DevicePending muestra logo + UID
              │
              ├── helper PUT local-only
              │       └── v1/authorizedDevices/{uid}
              │
              └── FirstAdminSetup ── primer Admin ── Login local
```

## Verificaciones

- `npm run test:local-device`: 7/7.
- `npm run test:firebase-emulator-config`: 2/2.
- `npm run typecheck`: pasa.
- Auth Emulator y Realtime Database Emulator iniciaron en `127.0.0.1:9099` y `127.0.0.1:9000` con JDK 21.
- El helper creó y se verificó por lectura local el registro `v1/authorizedDevices/anonymous-qa-device` con `enabled: true` y etiqueta `Chrome QA local`.
- No se cambiaron `database.rules.json`, credenciales, datos de producción, dependencias ni despliegues.

## QA Chrome

Pendiente: se debe abrir `http://127.0.0.1:5173` en Chrome, ejecutar manualmente el flujo completo y revisar consola, red, DOM/accesibilidad y evidencia visual. La sesión actual no tiene Chrome DevTools MCP disponible y no se automatizaron credenciales.

## Riesgos pendientes

- El UID anónimo es un identificador de bootstrap, no un factor de autenticación fuerte.
- El modo normal continúa apuntando al entorno definido por `.env.local`; no debe usarse para este recorrido local.
- El futuro módulo de gestión de dispositivos debe añadir autorización del lado servidor/reglas, revocación y auditoría para el acceso operativo; no forma parte de esta implementación.
