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
