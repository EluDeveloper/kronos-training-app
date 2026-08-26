# Implementation Report: dependencias y entorno Java 21

## Estado

- Gestor de paquetes: ✅ npm declarado en `app/package.json` como `npm@10.9.3`; `app/package-lock.json` es la fuente autoritativa de la aplicación.
- Vulnerabilidades de producción: ✅ `npm audit --omit=dev` reporta 0 vulnerabilidades.
- Vulnerabilidades altas/críticas: ✅ no quedan hallazgos altos o críticos. Se actualizaron `nanoid`, `firebase-tools` y `@iconify/tools` de forma controlada.
- Hallazgos pendientes: ⚠️ 5 moderados transitorios dentro de `firebase-tools` de desarrollo (`@opentelemetry/core` y `uuid`). npm propone un downgrade rompedor a `firebase-tools@14.23.0`; no se aplicó `--force`. Revisión programada: 2026-09-26.
- Procedencia: ✅ npm verificó 1271 paquetes con firma de registro y 132 con atestación.
- JDK: ✅ Temurin `21.0.12.1` instalado en `%LOCALAPPDATA%\Kronos\temurin-21`; Java 8 existente no fue modificado.
- Reglas: ✅ `npm run test:rules`, 26/26 pruebas con emulador local y Java 21.

## Árbol de archivos modificados

```text
app/
├── package.json
├── package-lock.json
├── README.md
├── src/plugins/iconify/build-icons.ts
└── tests/iconify-build.test.mjs
tasks/
├── plan.md
└── todo.md
Docs/implementation-reports/2026-08-26-dependency-java-maintenance.md
```

## Flujos afectados

- Instalación: npm queda identificado como gestor de la aplicación y las instalaciones reproducibles usan `app/package-lock.json`.
- Build de iconos: `@iconify/tools@5.0.14` se carga mediante su entrada ESM compatible y el generador sigue produciendo `icons.css`.
- Validación de reglas: el emulador puede ejecutarse con JDK 21 y conserva las pruebas de autorización, admisión, pagos, tienda, visitas y cierres.

## Flujos no afectados

- No se modificaron reglas Firebase, esquema, autenticación, permisos ni datos reales.
- No se cambiaron los artefactos de la aplicación Vue ni el comportamiento de producción.
- No se modificó `app/pnpm-lock.yaml`; permanece como lock legado hasta decidir su retiro explícito.

## Diagrama

```mermaid
flowchart TD
    A[app/package.json] --> B[npm@10.9.3]
    B --> C[app/package-lock.json]
    C --> D[npm audit]
    D -->|0 en producción| E[Dependencias runtime]
    D -->|5 moderadas dev-only| F[firebase-tools: revisar 2026-09-26]
    G[JDK Temurin 21] --> H[Firebase Database Emulator]
    H --> I[26 pruebas de reglas]
    J[Iconify Tools 5 ESM] --> K[build:icons]
    K --> L[icons.css]
```

## Evidencia

- `npm audit --omit=dev`: 0 vulnerabilidades.
- `npm audit --audit-level=high`: sin vulnerabilidades altas o críticas; quedan 5 moderadas dev-only.
- `npm audit signatures`: 1271 firmas y 132 atestaciones verificadas.
- `npm run test:iconify`: 1/1.
- `npm run build:icons`: ejecución exitosa.
- `npm run typecheck`: exitoso.
- `npm run build`: 1107 módulos transformados, exitoso.
- `npm run test:finance`: 2/2.
- `npm run test:athlete-intake`: 4/4.
- `npm run test:rules` con Java 21: 26/26.

## Riesgos y pendientes

- Revisar el árbol transitorio de `firebase-tools` el 2026-09-26 y actualizar cuando exista una corrección no rompiente; no ejecutar `npm audit fix --force` sin validar la CLI.
- Decidir explícitamente si se elimina `app/pnpm-lock.yaml` después de confirmar npm como único gestor.
- Java 21 quedó instalado para este equipo; CI y otros equipos deben provisionarlo de forma equivalente.
