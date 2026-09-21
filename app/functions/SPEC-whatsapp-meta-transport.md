# Spec: E8-PROD-2 — Transporte Meta local, deshabilitado por defecto

Estado: **implementada y verificada localmente el 2026-09-10**.
Fecha: 2026-09-10, America/Mexico_City.
Autorización: el usuario confirmó `Si puedes, continuar` el 2026-09-10.
Módulo: `athletes-payments`; verificación transversal: `experience-quality`.
Capability map: `../../specs/CAPABILITY-MAP.md`.
Spec matriz: `../../specs/SPEC-payment-notifications-whatsapp.md`.
Precedente: `SPEC-whatsapp-production-configuration.md`.

## Objetivo

Implementar el transporte HTTP concreto que el adaptador `MetaWhatsAppProvider`
necesita para cargar un PDF privado y enviar una plantilla Utility con encabezado de
documento. El transporte quedará aislado, probado con un `fetch` inyectado y sin
conectarse a Meta durante esta fase.

El resultado es código compatible con una futura Function productiva, pero sigue
sin estar conectado al worker exportado y sin una vía de activación accidental.

## Fuentes y supuestos

- La colección oficial de Meta en Postman confirma las operaciones
  `POST /{phone-number-id}/media` y `POST /{phone-number-id}/messages` bajo
  `https://graph.facebook.com/{Version}`.
- La documentación web oficial de Meta devolvió HTTP 429 durante la preparación. La
  versión Graph vigente, plantilla aprobada y compatibilidad exacta del header PDF se
  revalidarán antes de cualquier prueba real; esta fase no fija una versión por defecto.
- Node 22 aporta `fetch`, `FormData`, `Blob` y `AbortController`; no se necesita una
  dependencia HTTP adicional.
- El transporte recibe el token sólo en memoria. Esta fase no decide ni implementa
  todavía la conexión con Secret Manager.

## Alcance

### Incluye

- Un `MetaGraphApiTransport` que implemente la interfaz existente
  `MetaWhatsAppTransport`.
- Configuración explícita y validada de versión Graph y timeout; phone-number ID y
  token validados en cada operación conforme a la interfaz existente.
- URL base fija `https://graph.facebook.com`; no aceptar hosts arbitrarios.
- Upload multipart de `application/pdf` con `messaging_product=whatsapp`.
- Envío JSON de plantilla con locale, tres parámetros de texto y documento por
  `mediaId` en el encabezado.
- Lectura acotada y validación estricta de respuestas de upload y envío.
- Clasificación sanitizada de rechazo, rate limit, indisponibilidad y resultado
  ambiguo, sin exponer cuerpo remoto, token, teléfono, PDF o stack.
- Pruebas de contrato con `fetch` fake para request, respuesta, timeout, error de red,
  respuesta malformada y límites.

### Excluye

- Acceso a Meta, credenciales, WABA, número real, plantilla real o destinatario real.
- Secret Manager, configuración Firebase productiva o activación del worker real.
- Cambiar scheduler, reintentos, webhook, BAJA, inbox, retención, reglas o esquema.
- Mensajes, escrituras remotas, despliegue, CI/hosting o pruebas autenticadas.
- Cambios en Vue; Chrome y Playwright no aplican a esta fase local.

## Contrato propuesto

### Configuración

- `apiVersion`: obligatoria, patrón cerrado `^v\d{1,2}\.\d{1,2}$`; sin fallback
  silencioso.
- `phoneNumberId`: recibido por la interfaz existente, entre 5 y 32 dígitos.
- `accessToken`: recibido por la interfaz existente, entre 1 y 4096 caracteres ASCII
  visibles; nunca incluido en errores o resultados.
- `timeoutMs`: entero entre 1 y 60 000 ms; valor local por defecto de 15 segundos y
  cobertura de conexión y lectura del cuerpo.
- `fetch`: inyectable para pruebas; `globalThis.fetch` sólo en el constructor real.

El transporte no lee `process.env` directamente. Una fase posterior será dueña de
resolver configuración y secretos y de decidir si se conecta al worker.

### Upload de documento

```text
POST https://graph.facebook.com/{apiVersion}/{phoneNumberId}/media
Authorization: Bearer <token>
multipart/form-data:
  messaging_product = whatsapp
  type = application/pdf
  file = <bytes PDF + filename validado>
```

Antes del request se comprueban tamaño, filename, firma `%PDF-`, forma del SHA-256 y
correspondencia entre hash y bytes. Sólo una respuesta 2xx con un `id` numérico válido
produce `mediaId`. Una respuesta de error se traduce a código interno cerrado; una
respuesta 2xx malformada, timeout o error de
red lanza una incertidumbre sanitizada. El adaptador existente convierte esa
incertidumbre en `unknown` y evita reenvíos ciegos.

### Envío de plantilla

```text
POST https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages
Authorization: Bearer <token>
Content-Type: application/json
```

El cuerpo contiene exclusivamente `messaging_product`, destinatario, tipo template,
nombre, locale, encabezado document/media ID y tres parámetros body de texto. Sólo
una respuesta 2xx con `messages[0].id` válido produce `messageId`.

La implementación no registra requests o responses y rechaza redirects. Los códigos
remotos numéricos no se propagan; HTTP 429 se mapea a `RATE_LIMITED`, 408/5xx a
`SERVICE_UNAVAILABLE` y otros rechazos al código específico de operación
(`META_MEDIA_REJECTED` o `META_MESSAGE_REJECTED`). Las respuestas 2xx se limitan a
64 KiB antes de parsearse.

## Estructura y archivos probables

Node 22, TypeScript y dependencias actuales. Sin paquetes o scripts nuevos.
Rutas relativas a `app/functions/`:

```text
SPEC-whatsapp-meta-transport.md
src/whatsapp/meta-graph-api-transport.ts
src/whatsapp/client.ts                    sólo si el contrato existente lo requiere
tests/meta-graph-api-transport.test.ts
src/index.ts                              export de tipos/clase, sin Function activa
```

Documentación de seguimiento:

```text
../../tasks/plan.md
../../tasks/todo.md
../../Docs/implementation-reports/2026-09-10-whatsapp-meta-transport.md
```

## Incrementos propuestos

1. T1 — Validación y construcción de requests, con RED/GREEN y fetch fake.
2. T2 — Parseo acotado y clasificación de respuestas/errores, con RED/GREEN.
3. T3 — Integración con la interfaz existente y exports sin activar worker.
4. T4 — Regresión completa, build, revisión y reporte.

Cada incremento toca como máximo cinco archivos y conserva el proveedor real
deshabilitado. No se harán commits ni push salvo petición expresa.

## Comandos de verificación

Desde `app/`:

```powershell
node --require ./scripts/node-userinfo-preload.cjs --import tsx --test functions/tests/meta-graph-api-transport.test.ts functions/tests/meta-provider.test.ts
npm --prefix functions test
npm --prefix functions run typecheck
npm --prefix functions run build
.\node_modules\.bin\eslint.cmd functions/src/whatsapp/meta-graph-api-transport.ts functions/tests/meta-graph-api-transport.test.ts -c .eslintrc.cjs --rule "import/extensions: off"
git diff --check
```

## Criterios de aceptación

- [x] Ninguna construcción o configuración incompleta realiza una llamada HTTP.
- [x] Las únicas URLs posibles son `/media` y `/messages` en Graph API HTTPS con
  versión y phone-number ID validados.
- [x] El upload envía exactamente PDF, filename y `messaging_product`, y sólo acepta
  un media ID válido de una respuesta acotada.
- [x] El envío contiene exactamente la plantilla, locale, encabezado document/media
  ID y tres parámetros ya validados por el proveedor.
- [x] Token, destinatario, PDF, parámetros y cuerpo remoto no aparecen en errores,
  códigos, resultados o logs.
- [x] Rate limit y rechazo explícito quedan clasificados; timeout, error de red y
  éxito malformado se mantienen ambiguos y nunca se convierten en aceptación.
- [x] La respuesta se limita antes de parsearla y datos inesperados fallan cerrado.
- [x] El transporte satisface `MetaWhatsAppTransport`, pero no queda conectado a
  `onNotificationJobCreated` ni a otra Cloud Function activa.
- [x] No hay red real, mensajes, secretos, recursos remotos, datos reales ni deploy.
- [x] Pruebas, typecheck, build, lint, whitespace y revisión de cinco ejes pasan.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Exponer token o PII | Sin logs; errores y respuestas usan códigos internos fijos |
| SSRF o versión implícita | Host fijo y versión/ID validados sin fallback |
| Reenvío tras timeout | Timeout/red/malformado producen incertidumbre, no rechazo reintentable |
| Aceptar un falso 2xx | Validar forma e identificador antes de reportar éxito |
| Contrato Meta cambiado | Fetch inyectado y revalidación documental antes de QA real |
| Activación accidental | Clase sin conexión a worker ni lectura automática de secretos/env |

## Límites

Siempre: proveedor apagado, datos ficticios, sin red y respuestas sanitizadas.

Preguntar antes: versión Graph productiva, Secret Manager, recursos Meta, plantilla,
número remitente, destinatario QA, mensajes, configuración/deploy o conexión al worker.

Nunca: token en código, Git, logs o argumentos; host Graph arbitrario; texto libre
como fallback; reintento automático de `unknown`; llamadas desde Vue.

## Resultado local

`MetaGraphApiTransport` implementa el upload multipart y el envío de plantilla sobre
un host fijo, sin versión implícita. Valida ambos lados del límite: configuración,
credenciales, PDF, hash, template e IDs antes de enviar; status, tamaño, JSON e IDs
antes de aceptar una respuesta. Timeout, red, redirect y 2xx ambiguo producen un
error local fijo que el proveedor existente convierte en `unknown`.

La evidencia final es 169/169 pruebas de Functions, 21 pruebas enfocadas contando
subtests, typecheck, build, ESLint focalizado y whitespace aprobados. El build requirió
ejecución autorizada fuera del sandbox únicamente para escribir `functions/lib`; el
mismo comando terminó sin errores. La revisión de corrección, legibilidad,
arquitectura, seguridad y rendimiento no dejó hallazgos Critical/Required. Chrome y
Playwright no aplican porque no cambió Vue ni se habilitó una ruta remota.

## Gate de autorización

Autorización recibida el 2026-09-10 para código local y pruebas con `fetch` fake.
Esta autorización no cubre credenciales, recursos Meta, red real, mensajes, datos
productivos, conexión al worker ni despliegue.
