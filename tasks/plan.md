# Implementation Plan: Adopción de SDD en Kronos

## Overview

Establecer un flujo de desarrollo basado en specs, tareas verificables, implementación incremental, pruebas y validación obligatoria en Chrome para cambios de la aplicación web.

## Plan vigente: mantenimiento técnico y evolución funcional

### Gate obligatorio antes de cada fase

1. Crear o actualizar la spec de la fase con criterios de aceptación, límites, riesgos y QA web.
2. Presentar al usuario la spec para revisión y autorización explícita.
3. Sólo después de la autorización, crear/activar sus tareas e implementar en rebanadas pequeñas.
4. Para cualquier cambio web, validar en Chrome el flujo completo afectado. Playwright complementa con responsive y regresión visual; no sustituye Chrome.
5. El reporte final debe incluir árbol de archivos, flujos afectados/no afectados y un diagrama del impacto.

### Fase A: Dependencias y entorno de pruebas

1. Declarar npm como gestor autoritativo de `app/`, usando `app/package-lock.json`; conservar `app/pnpm-lock.yaml` sin actualizar hasta decidir su retiro explícito.
2. Aplicar sólo correcciones de auditoría no rompedoras y actualizar de forma controlada las herramientas de desarrollo que mantengan vulnerabilidades altas alcanzables.
3. Instalar o habilitar JDK 21, ejecutar `npm run test:rules` y registrar la evidencia sin modificar reglas ni datos reales.

**Criterios de aceptación:** no quedan vulnerabilidades altas alcanzables en producción; cualquier hallazgo dev-only tiene mitigación, responsable y fecha de revisión; el emulador de reglas ejecuta la suite con Java 21.

**Resultado 2026-08-26:** producción queda sin vulnerabilidades (`npm audit --omit=dev`); no quedan hallazgos críticos/altos. Persisten 5 moderados transitorios en `firebase-tools` de desarrollo; npm propone un downgrade rompedor a `14.23.0`, por lo que se difiere con revisión el 2026-09-26.

### Fase B: Formulario de atleta por pestañas

1. Revisar y autorizar `specs/SPEC-athlete-form-tabs.md` y `specs/SPEC-quality-gates.md` antes de implementar.
2. Dividirlo en pestañas: datos personales, membresía y admisión.
3. Mantener validación por campo, navegación por teclado, indicador de pestaña con errores y compatibilidad con edición/lectura por permisos.
4. Ejecutar Playwright como complemento en la matriz `320/768/1024/1440` px.
5. Validar en Chrome el flujo completo de alta y edición, incluyendo estados iniciales, errores, responsive y persistencia.

**Criterios de aceptación:** el diálogo reduce la altura visual, no pierde datos al cambiar de pestaña, permite llegar a cada error y conserva el contrato de admisión sensible.

### Fase C: Ficha de inscripción

1. Definir y probar un contrato puro desde `Athlete` + una proyección de `EmergencyContact`, sin recibir salud ni historial de pagos.
2. Mostrar nombre, fecha de nacimiento, fecha de inscripción, la frase recurrente `Tu fecha de pago será el {paymentDay} de cada mes.` y nombre/teléfono/parentesco del contacto de emergencia.
3. Extraer una primitiva mínima del renderer PDF para compartir encabezado, logo y lenguaje visual con recibos sin cambiar su salida existente.
4. Integrar una vista previa accesible en `Atletas`, con impresión, descarga y apertura manual de WhatsApp Web; el mensaje no incluirá contacto de emergencia y el PDF se adjuntará manualmente.
5. Validar contrato, regresión de recibos, estados de carga/error/datos ausentes, responsive `320/768/1024/1440` y flujo completo en Chrome.
6. Dejar WhatsApp Business Cloud API para una spec posterior con consentimiento, secretos fuera de Git y auditoría.

**Criterios de aceptación:** la ficha no contiene datos de salud ni historial de pagos, comunica el día recurrente, muestra el contacto de emergencia con permiso de admisión, conserva el diseño Kronos de recibos y permite revisar antes de compartir manualmente.

### Fase D: Código aleatorio y credencial QR de quiosco

1. Revisar y autorizar `specs/SPEC-kiosk-code.md` antes de implementar.
2. Mantener la generación aleatoria y única de 6 dígitos con `crypto.getRandomValues`, permitiendo regeneración ilimitada por Admin mediante candidato y confirmación.
3. Generar localmente una credencial PNG vertical con QR, `Kiosco Kronos`, nombre del atleta, código visible y `https://kronos-training.com/`.
4. Integrar lectura QR en la identificación de Kiosco y conservar la entrada manual, sin cambiar reglas, esquema o dependencias.
5. Verificar generación, descarga, regeneración, revocación del código anterior e identificación dentro de una compra sin confirmar una venta real.

**Criterios de aceptación:** Admin puede regenerar cuantas veces requiera; el código anterior permanece activo hasta guardar; el QR contiene sólo 6 dígitos aleatorios; la tarjeta refleja el diseño solicitado y Kiosco conserva escaneo QR y captura manual.

### Mejora aprobada: Punto de Venta y Kiosco

1. Definir contratos puros para ganancia bruta, productos disponibles, rol Coach y política fail-closed de `Pagar ahora`.
2. Incorporar Coach con cero permisos iniciales y asignación manual por Admin, conservando reglas de mínimo privilegio.
3. Mantener visible y reiniciar de forma segura el panel `Cobro`, filtrar stock agotado y mostrar la ganancia bruta sólo a Admin.
4. Persistir la política de Kiosco en `v1/settings/kiosk`, con modos `disabled`, `all-admins` y `selected-admins`, lectura/escritura exclusiva de Admin y sólo UIDs de Admin habilitados.
5. Abrir el lector QR al entrar a identificación, conservar código manual como alternativa y regresar al inicio cinco segundos después de una venta exitosa.
6. Verificar contratos, reglas, typecheck, lint, build, responsive y flujo completo en Chrome antes de publicar.

**Criterios de aceptación:** se cumplen los 13 criterios de `specs/SPEC-store-kiosk-improvements.md`; la configuración ausente o inválida deshabilita `Pagar ahora`; no se despliega ni se escriben ventas/configuración QA sin una autorización separada.

### Fase E: Notificaciones de pagos

1. Definir el contrato de adeudos de mensualidad y tienda, factura PDF, consentimiento, opt-out, idempotencia y reintentos.
2. Implementar primero el evento de pago aplicado y luego recordatorios programados; los envíos deben salir de una función/backend autorizado, no de secretos en el navegador.
3. Integrar WhatsApp Business Cloud API sólo después de confirmar credenciales, número remitente, plantillas y límites de Meta.

**Criterios de aceptación:** cada mensaje tiene destinatario y factura correctos, no se duplica ante reintentos, queda trazabilidad y los fallos no bloquean el registro del pago.

### QA local: bootstrap seguro de dispositivo

Para validar flujos protegidos sin desplegar:

1. Mantener `v1/authorizedDevices` como escritura prohibida desde el cliente.
2. Ejecutar Auth y Realtime Database sólo en los emuladores de loopback con un proyecto demo.
3. Usar un helper externo de QA que acepte el UID visible y rechace cualquier endpoint que no sea `127.0.0.1`.
4. Ejecutar el flujo local completo de UID, autorización, primer Admin y login; no usar datos ni credenciales reales.
5. Diseñar el futuro módulo de gestión de dispositivos con autorización del lado servidor/reglas, revocación y auditoría; la URL y el UID no serán secretos.

#### Plan autorizado de implementación incremental

- E0 — actualizar la spec autorizada y registrar tareas sin cambiar comportamiento.
- E1 — construir contratos puros de deuda, elegibilidad, cadencia, correlación, idempotencia, estados y sanitización; sin Firebase, Meta ni dependencias nuevas.
- E2 — construir el contrato puro de recibo/apunte de pago y aviso de deuda PDF, reutilizando los datos financieros existentes y preservando la privacidad; sin envío.
- E3 — integrar consentimiento y opt-out en la aplicación y su persistencia aislada; requiere revisión de esquema, permisos y reglas antes de modificar Firebase.
- E4 — crear la frontera backend/Cloud Functions y el adaptador fake de WhatsApp; requiere autorización para functions/, runtime, dependencias y configuración.
- E5 — integrar detección de pagos aplicados, jobs, locks, reintentos y webhooks contra emuladores/fakes; requiere contrato de reglas aprobado.
- E6 — integrar recordatorios programados, límites y estado de cuenta; requiere aprobación de cadencia, scheduler y retención.
- E7 — integrar plantillas y el proveedor Meta sólo con recursos, secretos y destinatario QA expresamente autorizados.
- E8 — ejecutar regresión, QA Chrome completo en https://kronos-training-fd5e5.web.app/ con gate manual, Playwright complementario y reporte de impacto; despliegue sólo con autorización separada.

#### Continuación autorizada: E8-PROD-1 — contrato operativo

El 2026-09-10 se autorizó consolidar la cadencia ya implementada localmente antes
de conectar Meta o desplegar: 09:00 America/Mexico_City; mensualidad tres días
antes, el día de vencimiento y tres días después; tienda miércoles y viernes;
máximo de un recordatorio por atleta y fecha, combinando deudas coincidentes.

Orden de implementación: (1) registrar spec/tarea, (2) completar pruebas del
contrato, (3) corregir sólo divergencias demostradas, (4) ejecutar gates y reporte.
La dependencia es estrictamente secuencial. No se habilitan proveedor real,
mensajes, recursos remotos, datos productivos ni despliegue.

#### Continuación autorizada: E8-PROD-2 — transporte Meta local

El 2026-09-10 se autorizó implementar el transporte HTTP concreto contra un `fetch`
inyectado. La rebanada construye y valida las solicitudes de upload PDF y plantilla,
limita respuestas y traduce resultados a códigos internos sin conectar la clase al
worker ni ejecutar red real.

Orden de implementación: (1) request y validación con RED/GREEN, (2) respuesta,
errores e incertidumbre con RED/GREEN, (3) export compatible con la interfaz existente,
(4) regresión, revisión y reporte. No se autorizan secretos, recursos Meta, mensajes,
datos productivos, cambios de infraestructura, conexión al worker ni despliegue.

**Resultado 2026-09-10:** transporte implementado y exportado sin activar una
Function. Upload y plantilla, validación de PDF/hash, host fijo, redirects bloqueados,
timeout integral, respuestas de 64 KiB y errores cerrados quedan cubiertos por pruebas
fake. Pasan 169/169 pruebas de Functions, typecheck, build, lint y whitespace.

#### Continuación autorizada: E8-PROD-3 — runtime seguro

El 2026-09-11 se autorizó implementar localmente el selector `disabled`/`local-fake`/
`meta`, declarar el token con `defineSecret` y reutilizar un solo
`onNotificationJobCreated`. El modo predeterminado permanece apagado; no se crean ni
asignan secretos, no se usa red real y no se despliega.

Orden de implementación: (1) resolver puro RED/GREEN, (2) factory e integración con
worker/fetch fake, (3) parámetros y secreto dentro del único handler, (4) regresión,
revisión y reporte.

**Resultado 2026-09-11:** runtime implementado y apagado por defecto. El resolver
limita el fake a demo+loopback y Meta a un proyecto desplegado, sin emulator y con
configuración válida. El único trigger enlaza `WHATSAPP_ACCESS_TOKEN`, lo lee de forma
diferida dentro del handler y evita crear adaptadores o usar red cuando el runtime no
es válido. Pasan 37 pruebas focalizadas, 184/184 pruebas de Functions, typecheck,
build, lint focalizado, whitespace, inspección de exports y revisión de cinco ejes.

#### Continuación autorizada: E8-PROD-4 — webhook productivo seguro y opt-out

El 2026-09-11 se autorizó enlazar verify token y app secret con Secret Manager,
autenticar el raw body, validar WABA/número, generalizar los stores locales para un
scope productivo y conectar estados de entrega y BAJA. La implementación y las pruebas
permanecen locales; no se crean/asignan secretos, no se registra el webhook, no se usa
red Meta ni datos publicados y no se despliega.

Orden de implementación: (1) resolver puro RED/GREEN, (2) frontera HTTP inyectable,
(3) scope de status inbox, (4) opt-out productivo y lote mixto, (5) metadata,
regresión, revisión y reporte.

El 2026-09-21 se autorizó continuar la implementación y habilitar en modo Meta el
consumidor existente de estados tempranos, sin crear otro trigger ni desplegarlo.

**Resultado 2026-09-21:** webhook productivo implementado y apagado por defecto. GET
y POST leen sólo su secreto, el HMAC cubre los bytes originales, WABA/número y lote se
validan antes de escribir, y los stores mantienen deduplicación, monotonicidad y BAJA
transaccional. El trigger existente recupera estados que llegaron antes de la
correlación del job, sin secretos ni otro trigger. Pasan 202/202 pruebas de Functions,
23/23 integraciones RTDB previamente verificadas, el recorrido Functions+RTDB del
estado temprano, typecheck, build, lint focalizado, whitespace, metadata y revisión de
cinco ejes. No se configuraron secretos o recursos remotos y no hubo deploy.

#### Continuación autorizada: E8-PROD-5 — recuperación productiva de jobs

Se propone añadir `recoveryAt` al contrato privado e indexarlo para que un único
scheduler, cada cinco minutos y apagado por defecto, procese hasta 25 jobs `queued`,
leases vencidos o `retryable-failed` cuyo backoff ya terminó. La política propuesta
confirma 1/5/30/180 minutos, cuatro reintentos después del intento inicial y 24 horas;
`unknown` permanece sin reenvío automático.

La fase requiere autorización explícita porque cambia el esquema interno, el índice en
`database.rules.json` y añade configuración de scheduler. Su implementación seguiría
siendo local: no crea recursos remotos, no asigna secretos, no usa Meta ni despliega.

El 2026-09-21 el usuario autorizó explícitamente esta spec y sus pruebas locales. No se
autorizan recursos remotos, secretos reales, migraciones, mensajes ni despliegue.

**Resultado 2026-09-21:** recuperación automática implementada y apagada por defecto.
`recoveryAt` mantiene una única fecha canónica para jobs recuperables; una consulta
RTDB indexada selecciona hasta 25 vencidos y el runner los procesa en grupos de tres
mediante el worker y lease existentes. El scheduler conserva una sola instancia e
invocación concurrente, enlaza sólo el access token y termina antes de secretos o base
de datos si el modo o runtime no son válidos. Pasan 9/9 pruebas focalizadas, 211/211
pruebas de Functions, 40/40 pruebas Rules + RTDB, 1/1 recorrido automático de
Functions y RTDB, typecheck, build, lint, whitespace, metadata y revisión de cinco
ejes. No se
crearon recursos remotos, no hubo red Meta, migración ni deploy.

#### Continuación autorizada: E8-PROD-6 — mantenimiento y telemetría operativa

Se propone convertir el mantenimiento local existente en un único scheduler backend
apagado por defecto: reconciliar hasta 25 estados tempranos y limpiar hasta 50 filas
vencidas por almacén en cada ciclo. Los nuevos marcadores de deduplicación general del
webhook tendrán `expiresAt` a 30 días e índice privado; los históricos sin TTL se
preservan para inventario y una decisión posterior.

Maintenance, recovery y webhook emitirán sólo códigos fijos, conteos y duración. La
fase no crea alertas o dashboards, pero deja señales seguras para configurarlos antes
del rollout. Requiere autorización explícita porque cambia el esquema/índice privado,
añade un scheduler y modifica telemetría de backend. Todo el trabajo seguiría local,
sin recursos remotos, datos publicados, Meta, mensajes ni despliegue.

El 2026-09-21 el usuario autorizó explícitamente la implementación local de esta
spec, incluido el campo/índice privado, el scheduler deshabilitado y la telemetría
sanitizada. No se autorizaron recursos o datos productivos, backfill, borrado real,
secretos, Meta, mensajes, alertas Cloud ni despliegue.

**Resultado 2026-09-21:** mantenimiento y telemetría implementados localmente y
apagados por defecto. El runner reconcilia hasta 25 estados, limpia hasta 50 vencidos
por almacén y conserva los registros históricos sin TTL. Los nuevos marcadores del
webhook vencen a 30 días; maintenance, recovery y webhook emiten sólo códigos y
agregados allowlist. Pasan 7/7 pruebas focalizadas, 218/218 Functions, 44/44 Rules +
RTDB, typecheck, build, lint, whitespace, metadata y revisión de cinco ejes. No se
crearon recursos o alertas remotas, no hubo Meta, mensajes, borrado real ni deploy.

#### Propuesta: E8-PROD-7 — preparación de despliegue y canario real

La auditoría del 2026-09-22 confirma que el backend local conserva 218/218 pruebas,
typecheck y build aprobados, pero aún no es seguro habilitar envíos. La Cloud Functions
API del proyecto publicado está deshabilitada; además faltan un kill switch de
productores, allowlist canaria de doble defensa, predeploy obligatorio, preflight de
IAM/billing/APIs/secrets, recursos Meta verificados y alertas/rollback.

`app/functions/SPEC-whatsapp-production-rollout.md` separa cuatro gates secuenciales:
(A) endurecimiento local, (B) Firebase, (C) Meta y (D) un único canario real. La fase
local A fue autorizada e implementada; los gates B, C y D continúan sin autorización.
Se prefiere un proyecto Firebase QA aislado. Si se usa producción, cada write
sintético, mensaje y limpieza requiere autorización específica.

El 2026-09-22 el usuario autorizó P7-1–P7-4 y P7-6; el 2026-09-23 autorizó P7-5 y
eligió un proyecto Firebase QA aislado. Permanecen fuera de autorización Firebase/Meta
remotos, secretos, rules publicadas, deploy, writes QA y mensajes reales.

El `projectId` elegido es `kronos-training-qa`; fue aprovisionado el 2026-09-23 y su
verificación de propagación continúa pendiente. No existen app Meta, WABA, número
remitente ni plantillas. P7-7 se divide en creación del
contenedor vacío, base operativa y deploy inerte; P7-8 cambia de verificación a alta
manual completa de Meta. Cada subfase conserva autorización independiente.

**Checkpoint P7-7A 2026-09-23:** Firebase CLI confirmó la creación de
`kronos-training-qa` y la consulta directa registra cero apps. El proyecto aún no se
propaga a `projects:list`; el listado RTDB devuelve 403 de IAM. No se alteró IAM, no se
reintentó la creación y P7-7B queda bloqueado hasta inventariar project number, estado
activo y baseline consistente.

El usuario adjuntó después una captura de Firebase Console abierta en
`project/kronos-training-qa/database`, con el nombre visible “Kronos Training QA”.
Esto confirma visualmente la identidad, pero no RTDB ni el baseline; P7-7A sigue abierto.
El onboarding Meta también quedó pausado: el intento de agregar un teléfono fue
rechazado porque ya está registrado en WhatsApp y el usuario confirma que todos sus
números disponibles tienen cuenta y no puede eliminar ninguna. No se desconectará ni
migrará un número. Queda pendiente decidir entre número de prueba Meta como remitente
QA, una línea dedicada o evaluar coexistencia; el primer camino cambia la estrategia
de verificación y requiere actualizar/autorización de la spec antes de configurarlo.
La fase E8-PROD-7 queda pausada por cambio de prioridad solicitado por el usuario el
2026-09-23; la prioridad nueva no se especificó. Reanudar con inventario Firebase QA y
decisión de remitente, sin alterar las cuentas existentes.

**Resultado local 2026-09-22/23:** P7-1–P7-6 implementados. El rollout sólo
admite `disabled` o un `athleteId` QA exacto; `production` continúa bloqueado. Los
productores y el worker aplican defensas independientes, recovery conserva la misma
política, el predeploy ejecuta typecheck+build y las nueve Functions del flujo quedan
en `us-central1` con `maxInstances: 1` y `concurrency: 1`. Se retiró el health endpoint
estático. Pasan 228/228 pruebas Functions, 20/20 integraciones RTDB, 38/38 reglas,
typecheck, build, lint y whitespace. `firebase-admin` quedó fijado en 14.4.0 y el audit
bajó de seis a dos vulnerabilidades moderadas transitivas de `uuid`, sin altas ni
críticas. No hubo APIs, secretos, deploy, writes remotos ni mensajes reales.

### Fase F: Alternativa push

Evaluar Firebase Cloud Messaging como canal opt-in para recordatorios y confirmaciones si WhatsApp no resulta viable. Debe incluir permiso explícito, revocación, asociación segura del dispositivo y una política para navegadores sin soporte.

## Architecture Decisions

- La aplicación vigente es `app/`; `AppKronos/` se conserva como referencia histórica.
- Las specs y tareas vivirán en la raíz del repositorio para que sobrevivan entre sesiones.
- `tasks/plan.md` contiene decisiones y riesgos; `tasks/todo.md` contiene el checklist ejecutable.
- La autenticación en Chrome será iniciada manualmente por el usuario en un perfil de pruebas.
- El navegador será un gate obligatorio para cambios de aplicación, no para cambios puramente documentales.
- Cada fase propuesta requiere revisión y autorización explícita de su spec antes de instalar dependencias o modificar comportamiento.
- Si se modifica un segmento de un flujo, Chrome debe recorrer el flujo completo afectado; Playwright se reserva para responsive y regresión visual repetible.
- Playwright se integrará como dependencia de desarrollo sólo después de autorizar `specs/SPEC-quality-gates.md`; no se reutilizarán credenciales ni datos reales.
- Las skills externas no se duplicarán si ya existe una versión equivalente disponible.
- `app/` usa npm como gestor autoritativo y `app/package-lock.json` como lock de instalación; el `app/pnpm-lock.yaml` legado no se actualiza en esta fase.

## Task List

### Fase 0: Base del proceso

- [x] Revisar y aprobar `specs/CAPABILITY-MAP.md`.
- [x] Confirmar la fuente/versionado de skills.
- [x] Configurar Chrome DevTools MCP para el primer cambio de interfaz.
- [x] Documentar el gate global de aprobación de specs, flujo completo afectado en Chrome y complemento Playwright.

### Fase 1: Primer piloto

- [x] Crear la spec del piloto elegido.
- [x] Descomponerla en tareas de tamaño S o M.
- [x] Aprobar `specs/SPEC-athletes-payments.md`.
- [x] Confirmar el modelo de acceso y privacidad para datos de salud: nodo `athleteIntake` separado y permisos `athletesIntake`/`athletesIntakeManage` con mínimo privilegio.
- [x] Implementar el modelo backward-compatible y validación determinista.
- [x] Añadir pruebas enfocadas de contacto de emergencia y cuestionario de salud.
- [x] Integrar errores por campo y estados de formulario.
- [x] Integrar secciones accesibles y campos condicionales.
- [x] Mejorar estados de carga, error y resultados vacíos.
- [x] Implementar una rebanada vertical.
- [x] Añadir o actualizar pruebas de comportamiento.
- [x] Ejecutar typecheck, build y pruebas relevantes; reglas pasan con Java 21 y la regresión de Iconify cubre la actualización ESM.
- [x] Validar el flujo en Chrome con autorización manual si requiere login.
- [x] Entregar el reporte de impacto.

### Checkpoint: Primer piloto

- [x] La spec está aprobada.
- [x] Todos los criterios de aceptación pasan.
- [x] La aplicación no tiene errores nuevos en consola.
- [x] El usuario revisó el reporte de archivos y flujos afectados.

### Fase 2: Aplicación progresiva

- [ ] Extender SDD a los módulos en el orden del capability map.
- [ ] Ejecutar checkpoints cada 2 o 3 tareas.
- [ ] Revisar y simplificar el proceso después de tres rebanadas.

### Fases funcionales priorizadas

- [x] Revisar y autorizar `specs/SPEC-athlete-form-tabs.md`.
- [x] Revisar y autorizar `specs/SPEC-quality-gates.md`.
- [x] Fase B: formulario por pestañas.
- [x] Fase C: ficha de inscripción y compartir por WhatsApp.
- [x] Revisar y autorizar `specs/SPEC-kiosk-code.md`.
- [x] Fase D: código aleatorio y credencial QR regenerable de quiosco.
- [x] Revisar y autorizar `specs/SPEC-store-kiosk-improvements.md`.
- [x] Implementar mejoras de Punto de Venta, Kiosco y perfil Coach.
- [ ] Fase E: WhatsApp Business para notificaciones de pago.
- [ ] Fase F: evaluación de notificaciones push.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Specs demasiado grandes | Alto | Capability map y tareas de máximo 5 archivos cuando sea posible |
| Duplicación de skills | Medio | Elegir una fuente de verdad y documentar versiones |
| Sesiones Chrome con datos sensibles | Alto | Perfil de pruebas, login manual y prohibición de leer tokens |
| Build afectado por permisos de `node_modules` | Medio | Resolver el entorno antes de atribuir fallos al cambio |
| Pruebas financieras o de reglas lentas | Alto | Ejecutar pruebas enfocadas por tarea y suite completa en checkpoints |
| Vulnerabilidad sólo corregible con cambio mayor | Alto | No usar `npm audit fix --force`; actualizar por paquete, probar y documentar alcance |
| WhatsApp expone PII o requiere secretos en cliente | Alto | Backend/Cloud Function, plantillas aprobadas, consentimiento y auditoría |
| Push no soportado o revocado | Medio | Opt-in, fallback visible y estado de suscripción revocable |
| Playwright no puede probar rutas protegidas sin sesión segura | Alto | Ejecutar responsive local/QA aislado; mantener login manual en Chrome y no versionar storageState |

## Known Baseline Findings

- `npm run typecheck` pasa en `app/`.
- `npm run build` falla antes de estos cambios al intentar escribir en `app/node_modules/.vite-temp` con `EPERM`.
- `npm run test:finance` falla antes de estos cambios con `uv_os_get_passwd returned ENOMEM`.
- En la regresión de Fase E, `npm run test:athlete-intake` presenta el mismo `uv_os_get_passwd returned ENOMEM` antes de cargar las pruebas; los tests enfocados de Fase E usan el preload local existente.
- En el sandbox sin escalada, `npm run test:iconify` no puede escribir su archivo temporal en `app/node_modules` y Firebase CLI no puede leer `C:/Users/inged/.config/configstore/firebase-tools.json`; con el JDK21 ya instalado y ejecución autorizada del emulador, `npm run test:rules` de Fase E pasa 30/30. No se modificaron Iconify ni datos reales.
- La validación visual de E3 en Chrome queda pendiente: el flujo protegido requiere login manual y la sesión actual no tiene Chrome DevTools MCP disponible; no se automatizaron credenciales ni se usó la instancia publicada.

## Open Questions

- Selección del primer piloto.
- Política definitiva para instalar `addyosmani/agent-skills`.
- Cuenta/perfil de Chrome de pruebas.
- ¿Se autoriza retirar el `app/pnpm-lock.yaml` legado después de confirmar que npm será el único gestor de `app/`?
- ¿La ficha inicial se compartirá manualmente desde el navegador o se prioriza desde el inicio la API oficial de WhatsApp Business?
- ¿Qué cuenta/número de WhatsApp Business y política de consentimiento se usarán para recordatorios?
- ¿Se autoriza instalar `@playwright/test` y descargar Chromium para la primera implementación de Fase B?

---

# Implementation Plan: Control administrativo y trazabilidad

Estado: plan implementado y validado localmente el 2026-09-24, incluidos esquema y reglas; sin datos reales ni despliegue. `reporting-contracts` queda listo para implementar.
Specs autorizadas: `store-payment-corrections`, `store-debt-statement`, `membership-advance-payments`, `athlete-lifecycle-statuses`, `inventory-reconciliation`, `workforce-payroll` y `birthday-outreach-card`.

## Overview

Fortalecer la integridad de cobros, membresías, estados de atletas, inventario, personal y seguimiento comunitario antes de construir el nuevo módulo ejecutivo de reportes. Las rebanadas priorizan contratos auditables y exactitud financiera; ninguna tarea autoriza despliegue, datos reales o credenciales.

## Dependency graph

```text
SC1 contratos de pagos efectivos
 └─ SC2 persistencia/reglas
     └─ SC3 corrección individual/grupal
         ├─ SC4 recibos y consumidores
         └─ SD1 contrato PDF → SD2 UI → SD3 QA

MA1 contrato temporal → MA2 persistencia/UI → MA3 consumidores → MA4 QA

AL1 contrato de estados → AL2 persistencia/reglas → AL3 UI
                                              └─ AL4 integraciones → AL5 QA
                                                                    └─ BD1 → BD2 → BD3 → BD4

IR1 contrato → IR2 finalización atómica → IR3 resoluciones → IR4 UI → IR5 QA

WF1 contrato → WF2 catálogo/reglas → WF3 trabajo → WF4 liquidación/egreso → WF5 UI → WF6 QA

SC + MA + AL + IR + WF ──→ reporting-contracts (listo para implementar)
```

## Architecture decisions

- Los pagos originales permanecen inmutables; correcciones y reversos son append-only.
- Los estados derivados usan una única utilidad compartida para evitar que Tienda, recibos y reportes calculen saldos distintos.
- Un adelanto abre un solo periodo y conserva snapshot de plan, importe, día y vencimiento; máximo 12 meses futuros.
- `AthleteStatus` es propio y no modifica `ActiveStatus`, usado también por productos, planes y skills.
- El conteo físico finalizado reemplaza el stock canónico en una actualización multipath; el ajuste conserva la diferencia histórica.
- Las pérdidas de inventario no crean egresos ficticios; las recuperaciones reales se registran por separado.
- Nómina operativa registra devengo y pago, pero no pretende sustituir nómina fiscal.
- Cumpleaños usa una plantilla PNG versionada y render local en canvas; no se genera una imagen remota por atleta.
- Cada cambio de reglas/esquema, QA autenticado, write remoto o despliegue mantiene un gate explícito separado.

## Task index

### Fase 1: Integridad de cobros y estado de cuenta

- SC1–SC2: contrato de pagos efectivos, persistencia y reglas.
- Checkpoint SC-A: pruebas puras y emulador antes de UI.
- SC3–SC4: corrección individual/grupal, recibos y consumidores.
- Checkpoint SC-B: flujo completo de cobro → corrección → saldo.
- SD1–SD3: contrato, interfaz y QA del estado de cuenta de tienda.

### Fase 2: Adelantos y ciclo de vida del atleta

- MA1–MA4: fechas, adelantos, consumidores y QA.
- AL1–AL5: estados, eventos, interfaz, integraciones y QA.
- Checkpoint AA: no hay cobros vencidos falsos y Kiosco respeta estados.

### Fase 3: Reconciliación de inventario

- IR1–IR5: contrato, cierre atómico, resoluciones, UI y QA.
- Checkpoint IR: un faltante no vuelve a acumularse.

### Fase 4: Empleados y pagos

- WF1–WF6: contratos, catálogo, trabajo, liquidación, UI y QA.
- Checkpoint WF: una liquidación produce exactamente un egreso.

### Fase 5: Cumpleaños y tarjeta

- BD1–BD4: estado anual, cola, tarjeta PNG y QA.
- Checkpoint BD: pendientes vencidos permanecen y la imagen no expone PII.

## Verification strategy

Cada tarea sigue RED → GREEN para lógica nueva. Los checkpoints ejecutan:

- pruebas enfocadas del módulo;
- `npm run test:rules` cuando cambien reglas;
- regresiones financieras, recibos, Kiosco y notificaciones según alcance;
- `npm run typecheck`;
- `npm run build`;
- lint focalizado y después global documentando deuda previa;
- Chrome obligatorio sobre el flujo completo afectado;
- Playwright complementario en `320`, `768`, `1024` y `1440` px;
- reporte conforme a `Docs/implementation-reports/README.md`.

Para rutas protegidas se detendrá antes del login y se solicitará inicio de sesión manual. No se automatizan credenciales ni se inspeccionan tokens/cookies.

## Parallelization and sequencing

Las fases SC, SD, MA, AL, IR, WF y BD quedaron cerradas localmente. `store-debt-statement` usa pagos efectivos, `birthday-outreach-card` usa estados auditables y el siguiente trabajo autorizado es `reporting-contracts`.

## Risks and mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Reverso sobre saldo a favor consumido | Alto | Validación transaccional y rechazo sin escrituras parciales |
| Consumidor que ignore ajustes | Alto | Utilidad única y búsqueda de todos los usos de `saleAppliedAmount` |
| Adelantos tratados como vencidos | Alto | Estado temporal puro con reloj inyectable y regresión de recordatorios |
| Transición duplicada de atleta | Alto | Escritura atómica, precondición de estado e idempotencia |
| Venta concurrente durante cierre | Alto | Verificación optimista del stock antes de finalizar |
| Doble egreso de nómina | Alto | Clave idempotente por liquidación y reglas de enlace único |
| PII en tarjeta o egreso | Medio | Proyecciones mínimas y pruebas de ausencia |
| Historial legado incompleto | Medio | Etiqueta explícita; sin backfill especulativo |

## Authorization gates

El usuario autorizó tareas locales verificables y cambios locales de esquema/reglas el 2026-09-24. Writes QA, migraciones de datos existentes, sesión autenticada de Chrome, despliegue y datos reales conservan autorizaciones separadas.

## Open questions

- Ninguna de producto para iniciar los contratos puros.
- Ninguna para comenzar SC1–SC2 localmente. QA autenticado, datos existentes y despliegue mantienen gates separados.

---

# Implementation Plan: Módulo de Reportes

Estado: Fases 1–7 implementadas y verificadas localmente; módulo de Reportes cerrado el 2026-09-25 mediante `specs/SPEC-reporting-phase-7-export-closeout.md`. Chrome validó descarga CSV real, conciliación, privacidad y cuatro anchos con fixture sintética; el perfil aislado de Playwright quedó en login y su matriz se documenta como limitación, sin copiar sesiones ni ampliar permisos.

## Overview

Construir un módulo de Reportes que avance de indicadores ejecutivos a dominios, tablas y registros auditables. Los cálculos partirán exclusivamente de ventas, pagos efectivos, eventos de ciclo de vida, cierres y resoluciones de inventario, trabajo/liquidaciones y egresos ya implementados. El módulo distinguirá ingreso reconocido, cobro y recuperación, cuentas por cobrar, costo histórico, utilidad bruta, egreso y flujo de efectivo; cuando el histórico no permita reconstruir una métrica, mostrará `Histórico parcial` o `No disponible` en vez de inventar datos.

## Dependency graph

```text
RP1 tipos, periodos y calidad del dato
 ├─ RP2 contratos Tienda y mensualidades
 ├─ RP3 contratos Atletas e inventario
 └─ RP4 contratos Personal y finanzas
      └─ Checkpoint R1: conciliación pura a $0.01
          └─ RP5 adaptador canónico de sólo lectura
              └─ RP6 permiso, reglas, ruta y shell
                  ├─ RP7 resumen ejecutivo y filtros globales
                  ├─ RP8 Tienda con drill-down
                  ├─ RP9 Atletas y mensualidades con drill-down
                  ├─ RP10 Inventario y personal con drill-down
                  └─ RP11 Egresos, flujo y conciliación con drill-down
                       └─ RP12 exportación permitida
                           └─ RP13 QA integral y reporte
```

## Architecture decisions

- Los cálculos serán funciones puras con redondeo monetario centralizado a centavos y reloj/zona `America/Mexico_City` explícitos.
- `reporting.service.ts` será un adaptador de sólo lectura sobre contratos canónicos; la UI no leerá Firebase ni recalculará métricas por su cuenta.
- Los filtros se serializarán en la URL. Producto vacío significa toda la tienda; uno o varios IDs limitan partidas y asignan cobros parciales multi-producto de forma proporcional y visible.
- Cada resultado incluirá procedencia/calidad: `Exacto`, `Asignación proporcional`, `Histórico parcial` o `No disponible`.
- Venta bruta y costo histórico se atribuyen a la fecha de venta; cobros, recuperaciones, egresos y flujo se atribuyen a la fecha efectiva del movimiento. Saldo representa cartera al corte.
- `utilidad` significará utilidad bruta de tienda (`venta reconocida - costo histórico`) y nunca utilidad neta ni flujo.
- Los estados de atletas usarán eventos auditables. Un registro legado sin eventos suficientes no se reconstruirá retrospectivamente.
- Finanzas, conciliación, inventario y personal permanecerán Admin-only. El permiso independiente `reports` no ampliará acceso a datos financieros.
- No habrá agregados persistidos, migraciones, nuevas dependencias ni escrituras de datos en el plan inicial. Cualquier necesidad posterior devuelve la fase a `propuesta`.

## Phases and authorization gates

### Fase 1 — Contratos semánticos y cálculos puros

Objetivo: definir tipos, diccionario de métricas, filtros/periodos y proyecciones puras para todos los dominios, demostrando conciliación a $0.01 y calidad del dato antes de crear interfaz o acceso a Firebase.

Alcance: RP1–RP4 y Checkpoint R1. Incluye tienda, selección multi-producto, atletas, mensualidades, inventario, personal, egresos, flujo y conciliación como contratos sobre datasets en memoria. No incluye servicio Firebase, ruta, permisos, UI, exportación ni QA autenticado. Resultado: tipos, métricas, periodos/filtros compartibles y proyecciones puras implementados; reporting 13/13, finanzas 4/4, typecheck, lint y build pasan.

Gate: autorizada por el usuario el 2026-09-24. No cambió esquema, reglas ni permisos.

### Fase 2 — Adaptador canónico, permiso y shell navegable

Objetivo: cargar sólo las colecciones canónicas detrás del adaptador, incorporar el permiso independiente de Reportes y crear la ruta/shell con filtros compartibles y estados de carga/error/vacío.

Alcance: RP5–RP6. Esta fase propone cambios en `app/database.rules.json` y en el contrato de permisos para permitir lecturas operativas de Reportes sin abrir finanzas, inventario o personal a no Admin.

Gate: autorizada el 2026-09-25. `reports` sólo otorga entrada al módulo; cada lectura exige también su permiso fuente y las colecciones Admin-only permanecen cerradas. Se permite validar localmente `permissions/reports` en rules; no se autorizan datos reales, migraciones ni despliegue.

Resultado: RP5–RP6 completadas localmente. El adaptador sólo carga atletas/visitas permitidos para esta cuenta no productiva; proyecciones allowlisted excluyen PII no necesaria. `reports` no concede lecturas y las reglas de negocio existentes no amplían `.read`. `/reportes` valida estados/filtros restaurables. Chrome confirmó sesión Admin manual, estado vacío con fuentes permitidas y sincronización de filtro de producto en URL. Dataset local vacío; no se validaron KPIs con transacciones. Pruebas focalizadas 19/19, reglas 45/45, config emulador 2/2, helper UID 7/7, typecheck y build pasan. Warnings de accesibilidad observados: campos sin etiqueta asociada (10) y campos sin `id`/`name` (2); no se detectaron errores de consola. No hubo escrituras a producción, migraciones ni despliegue.

### Fase 3 — Resumen ejecutivo y Tienda

Estado de ejecución: implementación y recorrido funcional completos en Chrome. Fixture DEV, Admin-only, sintética y sólo en memoria para validar registros sin poblar Firebase. Playwright apuntó a Vite ya iniciado en localhost (sin usar webServer); el contexto autenticado llegó a Atletas pero no tenía acceso a Reportes/fixture y fue redirigido al Dashboard; esa matriz queda pendiente de perfil QA autorizado.

- Tienda se suscribe sólo para Admin; comparaciones quedan no disponibles mientras las fuentes no expongan cobertura histórica.
- Costos/utilidad/margen sin costo histórico suficiente quedan parciales/no disponibles; no se usan precios actuales como reconstrucción.
- Cobrado no equivale a flujo de caja; los cobros usan fecha de movimiento y las cancelaciones fecha efectiva.
- Resultado: 39 pruebas reporting, 4 regresiones financieras, typecheck, lint focalizado y build correctos. Chrome validó resumen → KPI → tabla → registro y responsive a 320/768/1024/1440 sin overflow. Console sin errores/warnings.

Objetivo: entregar KPIs generales y el recorrido ejecutivo → Tienda → indicador → partidas/ventas/cobros.

Alcance: RP7–RP8. Incluye artículos vendidos, venta bruta, costo histórico, utilidad/margen bruto, cobrado, pendiente, recuperado proporcional y cancelaciones; filtros globales y uno/varios/todos los productos.

Gate: autorizada por el usuario el 2026-09-25 mediante `specs/SPEC-reporting-phase-3-executive-store.md`. Sin esquema, reglas, permisos, migraciones, datos reales ni despliegue previstos.

### Fase 4 — Atletas y mensualidades

Estado: implementada y verificada localmente el 2026-09-25. Spec: `specs/SPEC-reporting-phase-4-athletes-memberships.md`.

Objetivo: entregar evolución y detalle temporal de atletas y obligaciones de mensualidad sin fabricar histórico legado.

Alcance: RP9. Incluye RP9.1 contrato/proyección allowlisted y filtros URL; RP9.2 estados/eventos de atleta con cortes día/mes/año; RP9.3 membresías y partidas con esperado/cobrado/vencido/adelantado/pendiente; RP9.4 checkpoint. Eventos desde fecha efectiva, pagos por fecha efectiva y obligaciones por periodo/vencimiento. Historial incompleto se marca; crecimiento/retención sólo con cobertura suficiente.

Gate: spec autorizada por el usuario el 2026-09-25 para RP9.1–RP9.4. Atletas conserva permisos fuente existentes; mensualidades/pagos Admin-only como en Fase 2. Sin esquema, reglas, permisos, migraciones ni escrituras previstos. Login manual de Chrome y cualquier escritura real conservan gates separados.

Resultado: 38/38 pruebas reporting/finanzas, typecheck, lint focalizado y build correctos. Chrome recorrió Atletas → evento → registro y Mensualidades → obligación → movimiento, restauró filtros por URL tras recarga y confirmó consola limpia y ausencia de overflow en 320/768/1024/1440. Playwright ejecutó 0/4 porque su estado aislado quedó en login; no se reutilizó ni inspeccionó la sesión autenticada de Chrome.

### Fase 5 — Inventario y personal

Objetivo: mostrar diferencias y resoluciones de inventario, y devengo/pago/pendiente de empleados, con navegación al registro auditable.

Alcance: RP10. Incluye diferencias, recuperaciones, faltantes cubiertos, fondo perdido, trabajo devengado, pagado y pendiente; sin contacto de empleados.

Gate: spec `SPEC-reporting-phase-5-inventory-workforce.md` autorizada por el usuario el 2026-09-25. Inventario y Personal continúan Admin-only; se autorizó validación visible con la sesión manual ya iniciada. Sin esquema, reglas, permisos, dependencias, escrituras reales ni despliegue.

Orden de implementación: RP10.1 proyecciones allowlisted/acceso/filtros → RP10.2 Inventario → RP10.3 Personal → RP10.4 checkpoint R5. Cada rebanada usa TDD y mantiene las fases anteriores operativas.

Resultado: 49/49 pruebas reporting/finanzas, typecheck, lint focalizado y build correctos. Chrome recorrió Inventario → resolución y Personal → línea/liquidación, restauró filtros desde URL, mantuvo consola limpia y confirmó ausencia de overflow en 320/768/1024/1440. Playwright intentó 12 casos (4 de Fase 5) y todos llegaron al login porque su estado aislado ya no autentica; no se reutilizó ni inspeccionó la sesión Chrome.

### Fase 6 — Egresos, flujo de efectivo y conciliación

Objetivo: comparar ingreso reconocido con movimientos reales de caja/banco, egresos y cierres, sin presentar flujo como utilidad.

Alcance: RP11. Incluye métodos de pago, cuentas, diferencias de cierre y navegación a movimientos/egresos/cierres.

Gate: spec `SPEC-reporting-phase-6-finance-reconciliation.md` autorizada por el usuario el 2026-09-25. Finanzas continúa Admin-only y se autorizó validar la UI con la sesión manual ya iniciada. Sin esquema, reglas, permisos, dependencias, escrituras reales ni despliegue.

Orden de implementación: RP11.1 contratos allowlisted/suscripciones/filtros → RP11.2 cálculo financiero puro → RP11.3 UI de Finanzas → RP11.4 Conciliación y checkpoint R6. Cada rebanada usa TDD, no supera cinco archivos lógicos y mantiene operativas las fases anteriores.

Resultado: RP11.1–RP11.4 completadas. Las suites reporting/finanzas pasaron 56/56, además de typecheck, lint focalizado y build. Chrome validó Finanzas → egreso → origen → retorno, filtros restaurables, conciliación, ausencia de PII visible, consola limpia y responsive sin overflow en 320/768/1024/1440. Playwright alcanzó el login en sus primeros cuatro casos por estado aislado no autenticado y se detuvo sin reutilizar ni inspeccionar la sesión manual de Chrome.

### Fase 7 — Exportación, regresión y cierre

Objetivo: añadir únicamente la exportación contemplada por el spec y cerrar el módulo con evidencia integral.

Alcance: RP12–RP13. La exportación será un único CSV UTF-8 allowlisted derivado del resultado filtrado y visible, con metadata, definiciones/calidad y sin PII excluida.

Gate: spec `SPEC-reporting-phase-7-export-closeout.md` autorizada por el usuario el 2026-09-25. CSV único confirmado; Chrome puede reutilizar la sesión manual ya autorizada. Datos reales, writes QA y despliegue conservan autorización separada.

Orden: RP12.1 contrato/serializador seguro → RP12.2 proyección allowlisted → RP12.3 descarga accesible → RP13 regresión integral y reporte. Cada rebanada usa TDD, deriva de cálculos existentes y mantiene intactos Firebase y las Fases 1–6.

Resultado: RP12.1–RP13 completadas. Reporting/finanzas 61/61, revalidación focal 23/23, `npm run test:finance` 5/5, typecheck, lint focalizado y build correctos. Chrome descargó un CSV sintético de 66 registros, confirmó BOM/allowlist/conciliación, consola limpia y responsive sin overflow en 320/768/1024/1440. Playwright permaneció bloqueado por login en su perfil aislado; no se amplió acceso.

## Verification strategy

- RED → GREEN por cada contrato con `npx tsx --test tests/reporting-*.test.ts`.
- Regresión financiera con `npm run test:finance`; reglas con `npm run test:rules` sólo en la fase que las cambie.
- `npm run typecheck`, `npm run build` y lint focalizado en cada checkpoint.
- Pruebas de invariantes: suma detalle = KPI a $0.01; filtros producto; pagos proporcionales; cortes temporales; reversos/cancelaciones; histórico parcial; ausencia de PII.
- Chrome obligatorio en cada fase web, recorriendo filtro/KPI/gráfica → tabla → registro y revisando funcionalidad, consola, red, DOM, accesibilidad y evidencia visual.
- Playwright complementario a `320`, `768`, `1024` y `1440` px para estados y regresión visual.
- Para rutas protegidas se detendrá antes del login: el usuario inicia sesión manualmente y confirma la continuación; no se inspeccionan credenciales, tokens ni cookies.
- Reporte final conforme a `Docs/implementation-reports/README.md`, con árbol, flujos, diagrama, evidencia, riesgos y rollback.

## Risks and mitigations

| Riesgo | Impacto | Mitigación / rollback |
|---|---|---|
| Confundir venta, cobro, saldo, utilidad o flujo | Alto | Diccionario único, tipos distintos, etiquetas visibles y pruebas de invariantes; rollback de la fase sin tocar datos |
| Cobro parcial aplicado a varios productos | Alto | Asignación proporcional determinista, residuo de centavos estable y etiqueta obligatoria |
| Histórico de atletas incompleto | Alto | Calcular sólo desde eventos existentes y marcar `Histórico parcial`/`No disponible` |
| Permiso `reports` expone finanzas | Alto | Fase separada de reglas, pruebas negativas de no Admin y finanzas Admin-only |
| Lecturas canónicas demasiado grandes | Medio | Adaptador reemplazable, filtros en memoria inicialmente y medición; agregados persistidos quedan fuera hasta nueva autorización |
| KPI no coincide con detalle | Alto | Una sola proyección compartida y prueba de suma a $0.01 |
| Exportación contiene PII o cambia significado | Alto | Allowlist de columnas, misma proyección visible y pruebas de ausencia |
| Regresión visual o navegación sin retorno | Medio | Componentes pequeños, URL restaurable, Chrome por flujo y Playwright en cuatro viewports |

## Rollback strategy

- Fase 1: revertir únicamente tipos/utilidades/pruebas nuevas; no existen datos ni reglas que restaurar.
- Fase 2: revertir ruta, permiso y reglas como una unidad al commit anterior; validar de nuevo `npm run test:rules`. No hacer migración de usuarios.
- Fases 3–6: retirar componentes/rutas de Reportes manteniendo intactos los contratos canónicos de origen.
- Fase 7: retirar el adaptador de exportación sin afectar cálculos ni datos.
- Ninguna fase autoriza migraciones, modificaciones de datos reales o despliegue. Un despliegue futuro requerirá plan y aprobación propios.

## Fase 1 implementation result

- `app/src/types/reporting.ts` define métricas, calidad, filtros y periodos.
- `app/src/utils/reporting-*.ts` calcula fechas de negocio, comparaciones, filtros URL, asignaciones proporcionales, tienda, mensualidades, atletas, inventario, personal y finanzas sobre datos en memoria.
- `app/tests/reporting-*.test.ts` cubre 13 escenarios de contratos, filtros, asignación multi-producto, reversos, fechas, datos legados, snapshots, inventario, nómina y conciliación.
- Verificación: reporting 13/13, finanzas 4/4, typecheck, lint focalizado y build correctos.
- Rollback: retirar los tipos, utilidades y pruebas nuevas; no hay cambios de persistencia.
- Chrome: no aplica todavía porque no existe ruta ni interfaz en esta fase.

## Open questions

- Antes de RP12 debe fijarse el formato de exportación permitido por el spec (por ejemplo CSV y/o PDF) y su alcance exacto; no bloquea Fase 1.
- La Fase 2 deberá decidir, mediante reglas aprobadas, qué subconjunto operativo puede leer un usuario no Admin con `reports`; finanzas, inventario y personal permanecen Admin-only.

## Fase 8 — Analítica visual (resultado 2026-09-25)

RP14.1–RP14.6 se completaron en rebanadas: proyecciones puras y pruebas, componente accesible, integración por dominios y regresión en Chrome. Los gráficos son aditivos y no modifican fuentes, filtros, exportación ni permisos. El reporte de impacto está en `Docs/implementation-reports/2026-09-25-reporting-phase-8-visual-analytics.md`.

---

# Implementation Plan: mejoras operativas 2026-09-25

Estado: autorizado por el usuario el 2026-09-25 para implementación local de las seis fases. Datos reales y despliegue conservan autorización separada.

## Objetivo y alcance

Entregar seis rebanadas independientes: paginación transversal, recibos de liquidación, reapertura de adeudo de tienda, acceso visible a adelantos, cumpleaños de empleados y promociones de planes. Se reutilizan los contratos ya implementados de correcciones de cobro, adelantos, recibos y cumpleaños; no se duplican motores de dominio.

## Decisiones de arquitectura propuestas

- Paginación cliente uniforme sobre el conjunto ya filtrado/ordenado; una futura reducción de lecturas Firebase será otra spec.
- Recibos de nómina derivados de liquidación y líneas existentes, con folio estable y sin nueva transacción financiera.
- `Marcar nuevamente como adeudo` es una entrada contextual al reverso append-only existente, no una mutación de venta ni cancelación.
- Adelantos comparten el mismo diálogo/servicio actual; sólo se mejora entrada, etiquetas y recorrido.
- `Employee.birthDate` es obligatorio para altas nuevas y nullable al leer legado; Comunidad no gana permisos implícitos.
- Promociones son entidades independientes y el resultado aplicado queda congelado en el periodo/pago. No se acumulan; gana el mayor ahorro.

## Grafo y orden

```text
P1 auditoría de tablas → P2 utilidad de paginación → P3-P5 adopción por dominios → CP1

R1 constructor de recibo → R2 UI e historial → CP2

D1 acción contextual sobre reverso existente → D2 QA/conciliación → CP3

A1 navegación contextual → A2 claridad del periodo/recibo → CP4

B1 contrato birthDate → B2 Comunidad con permiso vigente → CP5

M1 contrato/promociones → M2 resolución pura → M3 administración
   → M4 integración con mensualidad/recibo/reportes → CP6
```

Paginación puede implementarse independientemente, pero cada página funcional se valida junto con su flujo. Las fases R, D y A pueden avanzar en paralelo después de sus autorizaciones porque reutilizan contratos distintos. B requiere decidir permisos antes de Comunidad. M es secuencial y de mayor riesgo por datos/reglas/finanzas.

## Fases y checkpoints

### Fase P — Paginación transversal

Spec: `specs/SPEC-application-table-pagination.md`.

1. Inventariar tablas productivas y escribir pruebas de comportamiento común.
2. Crear composable/componente mínimo reutilizable.
3. Adoptar por grupos: administración, finanzas/operación y reportes.
4. Cerrar con Chrome en flujos representativos y Playwright en cuatro viewports.

Checkpoint CP1: todas las tablas inventariadas están justificadas como paginadas o excluidas; ninguna usa scroll infinito y los filtros mantienen páginas válidas.

### Fase R — Recibos de liquidación

Spec: `specs/SPEC-payroll-settlement-receipts.md`.

1. Definir constructor puro y casos legados.
2. Mostrar recibo inmediato y un historial paginado de liquidaciones.
3. Conciliar con egreso/reportes y validar el recorrido completo.

Checkpoint CP2: una liquidación produce un egreso y un recibo reproducible, nunca una escritura adicional al reimprimir.

### Fase D — Reabrir adeudo de venta

Spec: `specs/SPEC-store-sale-debt-reopening.md`.

1. Añadir acción contextual en venta y vista previa de saldo.
2. Delegar al ajuste `reversal` existente y probar casos simple, parcial, agrupado y saldo a favor consumido.

Checkpoint CP3: la venta no se cancela, los cobros originales permanecen y todos los consumidores muestran la deuda efectiva.

### Fase A — Descubribilidad de adelantos

Spec: `specs/SPEC-membership-advance-payment-discoverability.md`.

1. Abrir el cobro desde Atletas con atleta preseleccionado y añadir CTA claro en Pagos.
2. Reemplazar entrada técnica de periodo por opciones comprensibles y verificar recibo/historial.

Checkpoint CP4: un usuario encuentra y completa el abono futuro sin escribir `YYYY-MM`, y el contrato financiero anterior no cambia.

### Fase B — Cumpleaños de empleados

Spec: `specs/SPEC-employee-birthdays-community.md`.

1. Añadir contrato/validación compatible con legados; cualquier regla o esquema se autoriza explícitamente antes.
2. Compartir cálculo anual y presentar sección de equipo sólo a roles ya autorizados.

Checkpoint CP5: alta y edición validan fecha; Comunidad no expone datos laborales ni amplía lecturas.

### Fase M — Promociones de planes

Spec: `specs/SPEC-plan-promotions.md`.

1. Aprobar tipos de descuento, regla de conflicto y contrato persistido.
2. Implementar resolución pura con TDD.
3. Crear administración de promociones y reglas Admin-only.
4. Integrar cotización/snapshot con abonos, recibos, deuda y reportes.

Checkpoint CP6: elegibilidad y vigencia son deterministas; históricos permanecen inmutables y todas las cifras concilian a $0.01.

## Verificación común

- RED → GREEN con el comando focal de cada spec.
- `npm run test:finance` cuando haya dinero; `npm run test:rules` cuando cambien reglas.
- `npm run typecheck`, lint focalizado y `npm run build` en cada checkpoint.
- Chrome obligatorio para el flujo completo afectado, con consola, red, DOM, accesibilidad y evidencia visual.
- Antes de cualquier ruta protegida: login manual por el usuario, sin inspeccionar credenciales, cookies ni tokens.
- Playwright complementario en 320/768/1024/1440 sólo con entorno QA aislado autorizado.
- Reporte conforme a `Docs/implementation-reports/README.md`, incluyendo árbol, flujo completo, diagrama, riesgos y rollback.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Paginador sólo cosmético mientras se cargan colecciones completas | Medio | Declarar límite; medir y crear spec cursor-based si el volumen lo exige |
| Duplicar recibos o egresos | Alto | Recibo derivado y pruebas de idempotencia |
| Confundir reverso con cancelación | Alto | Acción y confirmación explícitas; delegar al contrato append-only |
| Romper adelantos ya desplegados | Alto | Cambiar navegación/UI, no el cálculo; regresión financiera |
| Exponer datos de empleados en Comunidad | Alto | Mínimo privilegio y proyección allowlisted si se amplían roles |
| Recalcular descuentos históricos | Alto | Snapshot inmutable y pruebas tras editar/desactivar promoción |
| Dos promociones aplicables | Medio | Mayor ahorro, sin acumulación, desempate determinista |

## Rollback

- Cada fase se revierte de forma independiente.
- P/R/D/A pueden retirarse sin migración si no cambian persistencia.
- B mantiene lectura nullable; si se revierte UI no se elimina ningún dato capturado.
- M requiere revertir UI/servicio/reglas como unidad; snapshots históricos permanecen legibles aunque la administración se deshabilite.
- Nunca borrar datos reales para revertir; migraciones y despliegues requieren plan separado.

## Decisiones confirmadas para implementar

1. “Venta liquidada por accidente” se refiere a Tienda y se reabre revirtiendo el/los cobros seleccionados.
2. Cumpleaños de empleados será visible sólo para Admin inicialmente; otros roles exigirán proyección y reglas nuevas.
3. Promociones porcentuales y de monto fijo, sin acumulación y con selección automática del mayor ahorro.
4. Tamaños comunes 15/30/50; paginación de servidor fuera de esta iniciativa.
# Ampliación 2026-09-26: promociones gratuitas y PRs de coaches

Las specs autorizadas son `SPEC-plan-promotions.md` (ampliación) y `SPEC-coach-performance-prs.md`. Se ejecutan M6–M8 y luego C1–C3 de `tasks/todo.md`, en rebanadas de contrato/reglas → servicio → UI → QA.

Dependencias: el periodo gratis necesita snapshot de promoción y transacción exclusiva Admin; la constancia y los reportes dependen del nuevo estado persistido. Los PRs de coaches necesitan primero una identidad de empleado distinta de atleta en persistencia/reglas, luego servicio y finalmente selector/comparativos.

Riesgos: un $0 registrado como abono falsea caja; un coach tratado como atleta contamina membresías; reglas demasiado amplias permiten escrituras ajenas. Mitigación: ningún installment para periodo gratis, comprobante de tipo constancia, pruebas financieras y de reglas negativas; ruta de datos separada y permisos existentes para coaches.

Checkpoint antes de publicar: pruebas completas, typecheck, build, lint focalizado, Chrome en QA aislado desde entrada a resultado de ambos flujos, responsive 320/768/1024/1440, revisión del diff y reporte de impacto. El despliegue y la carga inicial de ID/nombre/estado de coaches fueron autorizados por separado y se ejecutaron con dry-run, verificación de conteo y reversión focalizada.
