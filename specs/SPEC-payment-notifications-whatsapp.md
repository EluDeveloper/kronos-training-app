# Spec: Fase E — Notificaciones de pagos por WhatsApp Business Cloud API

Estado: aprobada para implementación incremental el 2026-08-28.
Módulo proveedor: athletes-payments.
Fuentes de adeudo: store-inventory.
QA transversal: experience-quality.
Capability map: specs/CAPABILITY-MAP.md, aprobado el 2026-08-26.
Especificaciones relacionadas: specs/SPEC-athletes-payments.md, specs/SPEC-enrollment-sheet.md, specs/SPEC-quality-gates.md, specs/SPEC-store-kiosk-improvements.md.

La autorización recibida el 2026-08-28 permite iniciar la implementación incremental descrita en esta spec. No autoriza por sí sola la creación de recursos de Meta, el uso de credenciales, las escrituras de QA en la instancia publicada ni el despliegue. Las acciones de infraestructura, dependencias, esquema o reglas se mantienen sujetas a sus gates específicos.

## Objetivo

Crear una integración backend-first para que Kronos pueda enviar, de forma segura y trazable, notificaciones transaccionales por WhatsApp Business Cloud API cuando se aplica un pago y recordatorios programados cuando existen adeudos de mensualidad o tienda.

El resultado debe:

- usar únicamente un backend autorizado para comunicarse con Meta;
- generar y adjuntar el comprobante PDF correcto para pagos aplicados;
- generar un estado de cuenta PDF informativo para recordatorios, sin presentarlo como comprobante;
- respetar consentimiento explícito, opt-out y cambios de teléfono;
- tolerar reentregas de eventos, reintentos y ejecuciones concurrentes sin duplicar mensajes;
- dejar una bitácora mínima de cada decisión, intento y estado de entrega;
- mantener el registro del pago independiente del éxito o fallo de WhatsApp.

El usuario operativo es el personal autorizado de Kronos que registra pagos, consulta adeudos o administra el consentimiento. El destinatario es un atleta registrado que aceptó recibir notificaciones en un número de WhatsApp vigente.

## Supuestos explícitos

1. La aplicación vigente continúa en app/ y usa Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database.
2. Los pagos canónicos continúan en v1/payments y v1/sales; no se creará una segunda fuente de verdad financiera.
3. La primera rebanada sólo contempla atletas registrados con un teléfono válido. Visitantes, clientes sin athleteId y ventas sin relación con un atleta quedan fuera.
4. Firebase Cloud Functions de segunda generación es la opción recomendada para el backend, porque puede observar Realtime Database, ejecutar horarios y mantener secretos fuera del navegador. Cloud Run u otro backend compatible sólo sustituirá esta opción mediante una decisión documentada.
5. El PDF enviado será un recibo interno o un aviso de pago basado en el lenguaje visual de Kronos. No será una factura fiscal ni un CFDI mientras no existan los datos fiscales, proveedor y requisitos correspondientes.
6. El consentimiento será específico para notificaciones de pagos por WhatsApp. Enviar manualmente un mensaje desde WhatsApp Web, registrar un pago o tener un teléfono capturado no equivale a consentimiento.
7. La cadencia quedó confirmada en E8-PROD-1. Retención, plantilla y parámetros
   operativos de reintentos deben confirmarse en sus respectivas fases antes de
   habilitar producción.

## Alcance

### Incluye

- Detectar pagos aplicados de mensualidad y tienda a partir de escrituras exitosas en Realtime Database.
- Enviar un mensaje transaccional con plantilla aprobada de Meta y un PDF de comprobante para el pago aplicado.
- Consolidar en un único mensaje los pagos que pertenecen a una misma operación combinada de mensualidad y adeudos de tienda.
- Programar una ejecución diaria de recordatorios en la zona horaria America/Mexico_City.
- Calcular en backend el adeudo vigente de mensualidad, el adeudo de tienda y el total a pagar a partir de datos canónicos.
- Enviar un aviso de pago con estado de cuenta PDF cuando la política de recordatorio determine que corresponde.
- Registrar consentimiento, número al que aplica, origen, fecha, opt-out y última actualización.
- Procesar un opt-out explícito recibido por webhook, además de permitir que un usuario autorizado lo registre desde la aplicación.
- Aplicar idempotencia por operación de negocio, bloqueo de concurrencia, reintentos controlados y estados terminales.
- Recibir webhooks de Meta para estados sent, delivered, read y failed, con validación de firma y deduplicación.
- Exponer a la aplicación sólo el estado operativo mínimo que necesite el personal autorizado; el cliente no podrá enviar mensajes ni cambiar estados de entrega.
- Mantener una bitácora auditable sin guardar tokens, cuerpos completos de mensajes ni PDFs.

### No incluye

- Campañas de marketing, promociones, difusión masiva, grupos, respuestas conversacionales o chatbot.
- Envíos a visitantes, prospectos, familiares no registrados o números que no estén vinculados a un atleta.
- Facturación fiscal, CFDI, timbrado, cancelación fiscal, RFC, régimen fiscal o integración con un proveedor de facturación.
- Reemplazar WhatsApp Web manual de la Fase C para fichas de inscripción o de la Fase D para credenciales QR.
- Enviar salud, lesiones, antecedentes, contacto de emergencia, kioskCode, contraseñas, permisos, tokens u otra información no necesaria para el pago.
- Cambiar el cálculo financiero, aplicar pagos, cancelar ventas o bloquear una escritura de pago por una falla de mensajería.
- Configurar una cuenta WABA, registrar un número, crear plantillas, generar tokens o publicar Functions como parte de esta propuesta.
- Crear una pantalla general de campañas o un editor libre de plantillas.
- Usar Firebase Storage público o enlaces permanentes para exponer comprobantes.

## Fuentes canónicas y eventos

### Mensualidad

La mensualidad se obtiene de:

- v1/payments/{athleteId}/{period};
- payment.installments cuando existe;
- payment.amount, payment.totalAmount, payment.balance y payment.status;
- athlete.membership.agreedAmount como fallback compatible con registros legacy;
- athlete.profile.name y athlete.profile.phone sólo después de validar el consentimiento.

Cada abono de una mensualidad debe poder identificarse por el id de installment. Para un registro legacy sin installments, sólo se emitirá un evento si el backend puede distinguir de forma segura una transición de no aplicado a aplicado; de lo contrario se registrará skipped-legacy-ambiguous y no se enviará un duplicado especulativo.

### Tienda

La tienda se obtiene de:

- v1/sales/{saleId};
- sale.payments/{paymentId};
- sale.athleteId, sale.status, sale.total y sale.items;
- salePayment.amountApplied, salePayment.method, salePayment.appliedAt y sus referencias de membresía o grupo.

Se consideran pagos de tienda:

- un pago inicial de una venta creada como paid;
- un abono posterior a una venta credit;
- un cobro conjunto identificado por groupPaymentId;
- un pago de tienda escrito junto con una mensualidad y vinculado por membershipPeriod y membershipInstallmentId.

Los saldos se calculan con los mismos contratos financieros existentes: la mensualidad usa el balance persistido y sus fallbacks compatibles; la tienda usa total menos la suma de payments, con mínimo cero. storeCredits no es un adeudo y no debe convertirse en una línea de cobranza.

### Correlación de una operación

La unidad de notificación es una operación de negocio, no cada escritura técnica que la compone.

Las claves propuestas son:

~~~text
membership:{athleteId}:{period}:{installmentId}
sale-initial:{saleId}
sale-payment:{saleId}:{paymentId}
sale-group:{groupPaymentId}
combined:{athleteId}:{period}:{membershipInstallmentId}
~~~

Reglas:

- una venta inicial con varios SalePayment se notifica una sola vez como operación de venta;
- un cobro conjunto se notifica una sola vez aunque escriba varios salePayment;
- un abono de mensualidad que liquide deudas de tienda se notifica una sola vez como combined;
- las fuentes que observen la misma escritura deben converger en la misma clave;
- no se enviará una notificación si no se puede asociar un athleteId, teléfono elegible y consentimiento válido;
- una omisión por elegibilidad debe quedar auditada y no se reintentará automáticamente como si fuera un error de transporte.

La detección de cambios debe comparar before y after del trigger. No se debe reenviar por una actualización posterior de updatedAt, por la reconstrucción de un store local ni por la reejecución de una Function.

## Notificaciones por pago aplicado

### Flujo propuesto

1. Un pago se persiste correctamente en la fuente financiera existente.
2. La Function de observación valida que exista una transición aplicable y construye un evento inmutable con su idempotencyKey.
3. Una transacción de backend crea o recupera el notificationJob correspondiente. Si ya existe, no crea otro.
4. El procesador carga de nuevo los datos financieros y de consentimiento; no confía sólo en el payload del trigger.
5. El procesador comprueba que el atleta siga activo, que el teléfono actual coincida con el teléfono que otorgó consentimiento y que la categoría esté autorizada.
6. Se genera el PDF en backend, se calcula su hash y se sube a Meta mediante el mecanismo privado que soporte la versión vigente de Cloud API.
7. Se envía una plantilla Utility aprobada con el documento PDF como encabezado y los parámetros estrictamente definidos por la plantilla.
8. El job guarda el identificador wamid y pasa a accepted o sent según la respuesta de Meta.
9. Los webhooks posteriores actualizan delivered, read o failed sin retroceder el estado.
10. Si cualquier paso falla, el pago permanece aplicado y el fallo se presenta como estado de notificación, no como error financiero.

### Contenido del comprobante

Para mensualidad se reutiliza el contrato de recibos existente, incluyendo:

- nombre del atleta;
- folio estable;
- fecha y hora de aplicación;
- concepto y periodo;
- líneas de mensualidad y, si corresponde, tienda liquidada en la misma operación;
- método;
- importe aplicado;
- saldo posterior.

Para tienda se utiliza el recibo de venta o de abono correspondiente, incluyendo sólo las líneas de la venta, el importe aplicado y el saldo posterior. Un cobro agrupado conserva su folio de grupo.

El PDF debe mostrar el lenguaje visual de Kronos ya aprobado para recibos: formato A5 vertical, encabezado, logo oficial, acento visual, folio y paginación. La representación backend debe ser determinista con los mismos datos de negocio y no debe leer athleteIntake.

### Resultado de un pago parcial

Un pago parcial genera comprobante del importe aplicado y del balance posterior. No debe describirse como liquidación. Un pago que liquida varias deudas incluye el desglose de mensualidad y tienda, sin sumar dos veces una misma línea.

## Recordatorios programados

### Ejecución

La primera liberación ejecutará la Function diariamente a las 09:00 de
America/Mexico_City. La creación y habilitación del scheduler administrado conserva
su autorización de infraestructura independiente.

La ejecución debe:

- tomar una instantánea consistente o una lectura suficientemente acotada de atletas activos, pagos y ventas credit;
- calcular la fecha de vencimiento mensual respetando paymentDay y ajustando el día 31 al último día del mes;
- seleccionar sólo adeudos positivos;
- agrupar mensualidad y tienda del mismo atleta en un único recordatorio;
- usar una clave diaria por atleta para que una ejecución repetida no duplique
  mensajes, conservando periodo y tipo en la referencia auditable;
- respetar opt-out, teléfono cambiado, atleta inactivo y template no disponible;
- procesar en lotes acotados y dejar cursor o estado para continuar sin perder trazabilidad.

### Cadencia autorizada para la primera liberación

- recordatorio previo: tres días calendario antes del vencimiento si la mensualidad del periodo sigue pendiente;
- recordatorio del día: el día de vencimiento si existe balance;
- recordatorio vencido: tres días después si persiste el balance;
- adeudo de tienda: miércoles y viernes mientras exista balance, combinado con el
  adeudo mensual cuando ambos coincidan;
- máximo un mensaje de cobranza por atleta y día local;
- no enviar recordatorios de mensualidad ya liquidada ni de ventas canceladas.

La continuación E8-PROD-1 fue autorizada el 2026-09-10. Cualquier cambio de estos
valores requiere volver a propuesta.

La clave propuesta para cada recordatorio es:

~~~text
reminder:{athleteId}:{localDate}:{reminderKind}:{period}
~~~

Si el job ya fue aceptado por Meta, la ejecución siguiente sólo actualiza el estado o deja constancia de que ya fue enviado. No crea una nueva notificación porque el scheduler volvió a procesar la misma fecha.

### Contenido del aviso y PDF

El mensaje debe comunicar, mediante plantilla aprobada:

- nombre del atleta;
- mensualidad pendiente, si existe;
- tienda pendiente, si existe;
- total pendiente;
- fecha o periodo al que corresponde;
- instrucción neutral para contactar al box o acudir a recepción.

El PDF de recordatorio se identifica como AVISO DE PAGO o ESTADO DE CUENTA y debe contener de forma visible:

Documento informativo - no es comprobante de pago

No debe incluir pagos futuros inventados, métodos de pago no aplicados, datos de salud ni contacto de emergencia. No debe usar el título RECIBO para un recordatorio.

## Consentimiento y opt-out

### Contrato propuesto

El registro se separará de athleteIntake y de los datos de pagos:

~~~text
type WhatsAppConsentStatus = 'unknown' | 'opted-in' | 'opted-out'

interface WhatsAppPaymentConsent {
  athleteId: string
  receiptStatus: WhatsAppConsentStatus
  reminderStatus: WhatsAppConsentStatus
  consentedPhoneE164: string | null
  consentedAt?: number | string | null
  consentSource?: 'athlete' | 'guardian' | 'staff' | null
  recordedBy?: string | null
  optedOutAt?: number | string | null
  optOutSource?: 'athlete' | 'guardian' | 'staff' | 'webhook' | null
  updatedAt: number | string
  updatedBy?: string | null
}
~~~

La ubicación propuesta es v1/notificationPreferences/whatsapp/{athleteId}. El nombre y la ubicación pueden cambiar durante el diseño de reglas, pero la separación debe mantenerse.

Reglas de elegibilidad:

- unknown no permite ningún envío;
- opted-in sólo es válido si consentedPhoneE164 coincide exactamente con el teléfono E.164 normalizado vigente;
- si cambia el teléfono del atleta, la Function trata el consentimiento anterior como no elegible y exige reconfirmación;
- opted-out gana frente a cualquier otra preferencia y bloquea jobs pendientes, reintentos y recordatorios;
- marcar opt-out no borra el historial de auditoría;
- un pago aplicado no concede ni renueva consentimiento;
- un envío manual desde WhatsApp Web no concede ni renueva consentimiento;
- la interfaz no podrá cambiar opted-out a opted-in sin una acción afirmativa y sin volver a registrar teléfono, origen y actor.

### Captura en la aplicación

La primera rebanada puede mostrar en Atletas el estado de WhatsApp y acciones de consentimiento para un usuario con acceso autorizado a la administración de atletas. Debe mostrar:

- estado de recibos y recordatorios;
- teléfono al que aplica el consentimiento, enmascarado;
- fecha y origen;
- advertencia si el teléfono actual requiere reconfirmación;
- acción clara para retirar el consentimiento.

No se autoriza una casilla preseleccionada. La activación debe requerir una confirmación deliberada y guardar el actor autenticado, fecha, origen y teléfono normalizado.

La aplicación no debe mostrar el token de Meta, el app secret, el webhook verify token ni información interna de Functions.

### Opt-out por mensaje

El webhook procesará coincidencias exactas, normalizadas y sin distinción de mayúsculas, como BAJA, STOP, CANCELAR y NO RECIBIR. La lista definitiva debe aprobarse antes de implementar.

Cuando un mensaje entrante coincide:

1. se deduplica el evento del webhook;
2. se localiza el atleta por el wa_id o la relación persistida, sin imprimir el número completo en logs;
3. se marcan ambos propósitos como opted-out;
4. se cancelan o suprimen jobs pendientes y reintentos no enviados;
5. se guarda el origen webhook y la hora;
6. no se vuelve a enviar un recordatorio para confirmar la baja, salvo que exista una plantilla aprobada y una decisión explícita para ello.

Un texto ambiguo no debe cambiar el consentimiento. La suscripción automática por responder ALTA queda fuera de esta primera propuesta.

## Plantillas de Meta

Se propone utilizar exclusivamente plantillas de categoría Utility, aprobadas y habilitadas para la misma cuenta WABA, número remitente, idioma y versión de API.

Nombres lógicos propuestos:

- payment_receipt_pdf_v1: pago aplicado con comprobante PDF;
- payment_reminder_pdf_v1: recordatorio de adeudo con aviso PDF;
- optout_confirmation_v1: fuera de alcance por defecto; sólo se añadirá con autorización.

Los nombres finales, categoría, locale, variables, botones, header de documento y límites de tamaño deben validarse en WhatsApp Manager y quedar versionados en configuración no secreta. La spec no fija una versión de Graph API.

Reglas:

- una plantilla no aprobada, pausada, rechazada, eliminada o con idioma diferente provoca suppressed-template, sin fallback a texto libre;
- el backend valida cantidad, orden y tipo de parámetros antes de invocar Meta;
- los parámetros no contienen salud, contacto de emergencia, kioskCode, credenciales ni datos de admisión;
- los importes se formatean como MXN con una función compartida y determinista;
- el documento PDF se envía como header mediante un mediaId, asset handle o enlace privado de vida corta sólo si la versión vigente lo admite;
- no se usa un enlace público permanente a Firebase Storage;
- el nombre de archivo no contiene teléfono, token ni información sensible;
- el mensaje no promete que el pago fue aplicado si la fuente financiera no lo confirma;
- cambios en una plantilla requieren una nueva versión lógica y pruebas antes de enrutar tráfico a ella.

La documentación preliminar de Meta confirma que los mensajes de plantilla requieren una plantilla creada/aprobada y que el envío devuelve un identificador de mensaje. La forma exacta de adjuntar un documento en el header y la versión vigente deben verificarse de nuevo al implementar:

- WhatsApp Cloud API, colección de Meta en Postman: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api

## Idempotencia, reintentos y prevención de duplicados

### Estados del job

El modelo lógico es:

~~~text
queued
processing
accepted
sent
delivered
read
retryable-failed
terminal-failed
suppressed
unknown
~~~

Transiciones válidas:

- queued → processing;
- processing → accepted, retryable-failed, terminal-failed, suppressed o unknown;
- accepted → sent, delivered o failed;
- sent → delivered, read o failed;
- delivered → read;
- retryable-failed → processing sólo si la política autoriza otro intento;
- unknown no se reenvía automáticamente sin reconciliación o decisión operativa;
- read, terminal-failed y suppressed son estados terminales.

### Claves y concurrencia

- notificationJobs se indexa por idempotencyKey determinista;
- la creación es create-if-absent mediante transacción de Admin SDK;
- una ejecución concurrente obtiene el job existente y respeta su lock;
- processing incluye leaseUntil y workerId; un lease vencido puede recuperarse sin crear otro job;
- el intento guarda attemptNumber, startedAt, finishedAt, outcome y wamid si existe;
- el webhook usa un webhookEventId deduplicado antes de mutar el job;
- el estado de proveedor sólo avanza; un webhook tardío no puede convertir read en sent;
- la actualización de la aplicación no debe volver a disparar la creación del job por cambios de auditoría.

### Política de reintentos

Se reintentan sólo fallos que el adaptador clasifique como no aceptados por Meta y temporalmente recuperables, como rate limit explícito, indisponibilidad transitoria o error de infraestructura antes de una aceptación conocida. El backoff propuesto es 1, 5, 30 y 180 minutos, con un máximo de cuatro reintentos y una ventana de 24 horas.

No se reintentan automáticamente:

- opt-out o consentimiento ausente;
- teléfono inválido, inexistente o no elegible;
- plantilla no disponible o parámetros inválidos;
- permisos de Meta insuficientes;
- error terminal reportado por el proveedor;
- resultado unknown donde la solicitud pudo haber sido aceptada sin respuesta.

Un timeout o error 5xx no se puede asumir inocuo. El adaptador debe distinguir not-submitted, rejected, accepted y unknown. Si no puede distinguirlos, marca unknown, conserva la evidencia mínima y requiere reconciliación o acción operativa antes de enviar de nuevo. La prevención de duplicados interna no permite prometer at-most-once frente a toda incertidumbre de red del proveedor; ese riesgo residual debe quedar visible en el reporte.

## Trazabilidad y manejo de errores

### Registro mínimo

Cada job debe conservar, sin guardar secretos ni el cuerpo completo del documento:

- jobId e idempotencyKey;
- tipo de evento o recordatorio;
- athleteId y referencias de pago/venta;
- folio de recibo o aviso;
- period, concepto e importe resumido;
- recipientHash y últimos cuatro dígitos, no el teléfono completo;
- templateName, locale y versión de configuración;
- documentSha256 y bytes del PDF;
- estado interno, estado Meta, wamid si existe;
- número de intento y timestamps;
- código/categoría de error sanitizados;
- actor sólo cuando hubo acción manual de consentimiento u opt-out.

El log no debe incluir access token, app secret, verify token, cookies, cuerpos completos de webhook, contenido completo de plantillas, PDF binario ni datos de salud.

### Errores visibles

- El registro de pago muestra éxito financiero aunque la notificación quede pendiente o fallida.
- La interfaz puede mostrar un estado compacto como Enviado, Entregado, Leído, Pendiente, Omitido o Error, según el permiso del usuario.
- Los mensajes al usuario son accionables y no exponen respuestas internas de Meta ni secretos.
- Los detalles técnicos quedan en logs estructurados de backend con redacción de PII.
- Una caída del scheduler o del webhook produce alerta operativa y no una escritura retroactiva de pagos.
- Una falla de PDF bloquea sólo el job de notificación; no reemplaza el PDF por un texto que prometa comprobante.

### Webhook

La entrada pública de webhook debe:

- responder el challenge de verificación sólo con el verify token configurado fuera de Git;
- validar X-Hub-Signature-256 usando el app secret almacenado en el gestor de secretos;
- rechazar payloads malformados o firmas inválidas;
- aceptar rápidamente y delegar el procesamiento pesado a una cola/job;
- deduplicar eventos;
- procesar sólo estados y mensajes necesarios;
- actualizar el job con estado monotónico;
- conservar el error de Meta en forma reducida y sanitizada.

## Backend, Cloud Functions y protección de secretos

### Arquitectura propuesta

~~~text
Firebase Realtime Database
  ├─ trigger de payments/sales
  ├─ trigger de notificationPreferences
  └─ scheduler diario
          ↓
     notificationJobs
          ↓
   worker de notificaciones
          ├─ lector de pagos/atletas
          ├─ generador PDF
          ├─ adaptador WhatsApp Cloud API
          └─ auditoría

Meta Webhook
          ↓
     endpoint HTTPS
          ↓
   estados y opt-out deduplicados
~~~

Las Functions usarán Admin SDK sólo en el backend y validarán explícitamente cada dato recibido. El navegador podrá leer o solicitar estados permitidos por reglas, pero nunca llamará directamente a graph.facebook.com.

Secretos propuestos en Secret Manager o configuración segura equivalente:

- WHATSAPP_ACCESS_TOKEN;
- WHATSAPP_APP_SECRET;
- WHATSAPP_WEBHOOK_VERIFY_TOKEN;
- WHATSAPP_PHONE_NUMBER_ID;
- WHATSAPP_BUSINESS_ACCOUNT_ID si una operación administrativa lo requiere;
- WHATSAPP_GRAPH_API_VERSION;
- identificadores y locales de plantillas, sólo si el sistema de configuración los trata como no sensibles;
- zona horaria y parámetros operativos no secretos.

Reglas de protección:

- ningún secreto se coloca en app/.env, Vite, código cliente, Realtime Database, logs, fixtures o documentación;
- .env.example sólo puede mostrar nombres de variables sin valores;
- los secrets no se imprimen aun cuando falle la inicialización;
- el backend aplica permisos mínimos y no usa un token temporal de desarrollo en producción;
- rotar un token no requiere editar el frontend;
- las pruebas usan un fake adapter o secretos efímeros de un entorno aislado, nunca credenciales del usuario;
- no se habilita el envío real hasta confirmar WABA, número, plantillas, límites, destinatario QA y política de retención.

### Firebase y esquema

La implementación probablemente requerirá:

- agregar Functions al firebase.json;
- crear functions/ con su package.json y lock autoritativo;
- añadir nodos de notificationPreferences, notificationJobs y webhookEvents;
- cambiar database.rules.json para que el cliente sólo pueda leer/escribir las preferencias expresamente permitidas y nunca jobs, intentos o estados de proveedor;
- añadir índices o consultas acotadas si la estrategia de Realtime Database lo necesita;
- decidir si se usa un scheduler administrado, Cloud Tasks o una cola equivalente.

Todo cambio de reglas, esquema, permisos, región, plan de facturación, Storage o despliegue es Ask first y queda fuera de esta propuesta autorizable.

## Permisos, privacidad y límites de acceso

### Permisos de aplicación propuestos

Para evitar ampliar el capability map sin necesidad, la primera propuesta reutiliza las superficies actuales:

- Admin puede administrar consentimiento, revisar trazabilidad financiera y operar la configuración aprobada.
- Un usuario con athletes y athletesManage puede registrar o retirar consentimiento del atleta, sin acceder a secretos ni jobs internos.
- Un usuario con payments puede consultar el estado compacto relacionado con un pago si la interfaz lo muestra.
- Sólo un usuario Admin podría solicitar una revisión o reintento manual, si esa acción se incluye después de aprobar la spec; el reintento seguiría sujeto a consentimiento y opt-out.
- Coach conserva su matriz de permisos vacía por defecto y no obtiene acceso implícito.
- Las Functions escriben jobs, intentos y estados de Meta con Admin SDK; ningún perfil cliente puede falsificar delivered, read, wamid o sent.

Si el usuario requiere una pantalla independiente de Notificaciones o permisos notifications/notificationsManage, la decisión cambia el capability map, el contrato de reglas y el alcance; la spec deberá volver a estado propuesta antes de implementarse.

### Datos que sí pueden enviarse

- nombre del atleta, preferiblemente nombre corto o nombre completo según plantilla aprobada;
- concepto, periodo, folio, monto aplicado, saldo y método cuando sean necesarios;
- líneas de productos de la venta o resumen de deuda de tienda;
- fechas de aplicación o vencimiento;
- PDF interno correspondiente.

### Datos prohibidos

- salud, lesiones, cuestionario de admisión y contacto de emergencia;
- teléfono de terceros, datos de guardianes no autorizados, RFC o datos fiscales no confirmados;
- kioskCode, QR, contraseñas, tokens, cookies, permisos o información de otros usuarios;
- historiales que no correspondan al atleta y periodo de la operación;
- texto libre introducido por un usuario sin saneamiento y sin necesidad de negocio.

La aplicación debe aplicar minimización también en los logs, errores, nombres de archivos, URLs temporales y parámetros de plantillas.

## Archivos probables

La lista es orientativa y no autoriza modificar todos los archivos:

~~~text
specs/SPEC-payment-notifications-whatsapp.md
tasks/plan.md
tasks/todo.md

app/firebase.json
app/database.rules.json
app/src/types/domain.ts
app/src/pages/atletas.vue
app/src/pages/pagos.vue
app/src/pages/tienda.vue
app/src/services/notification-preferences.service.ts
app/src/stores/notification-preferences.ts
app/src/components/kronos/WhatsAppConsentDialog.vue
app/src/utils/payment-notification.ts
app/src/utils/receipts.ts
app/tests/payment-notification.test.ts
app/tests/database.rules.test.mjs
app/e2e/responsive/payment-notifications-responsive.spec.ts

functions/package.json
functions/package-lock.json
functions/tsconfig.json
functions/src/index.ts
functions/src/notifications/payment-events.ts
functions/src/notifications/reminders.ts
functions/src/notifications/jobs.ts
functions/src/notifications/consent.ts
functions/src/whatsapp/client.ts
functions/src/whatsapp/templates.ts
functions/src/whatsapp/webhook.ts
functions/src/pdf/payment-receipts.ts
functions/tests/payment-notifications.test.ts
functions/tests/whatsapp-webhook.test.ts
functions/tests/pdf-receipts.test.ts

Docs/implementation-reports/YYYY-MM-DD-payment-notifications-whatsapp.md
~~~

El primer corte debe mantenerse en rebanadas pequeñas. No se autoriza crear la carpeta functions ni modificar firebase.json por el solo hecho de aprobar esta spec; ambas acciones requieren que el usuario autorice la fase y los cambios de infraestructura.

## Code Style

La frontera de proveedor debe ser un adaptador testeable. La lógica de negocio no debe construir URLs, leer variables de entorno directamente ni depender de la respuesta concreta de Meta:

~~~ts
type ProviderOutcome = 'not-submitted' | 'rejected' | 'accepted' | 'unknown'

interface WhatsAppProvider {
  sendTemplate(input: {
    to: string
    templateName: string
    locale: string
    parameters: ReadonlyArray<string>
    document: { bytes: Uint8Array; filename: string; sha256: string }
  }): Promise<{
    outcome: ProviderOutcome
    messageId?: string
    errorCode?: string
  }>
}

function paymentNotificationKey(event: PaymentAppliedEvent): string {
  return event.correlationKey
}
~~~

Convenciones:

- nombres de código en inglés y mensajes visibles en español;
- contratos puros para saldo, elegibilidad, cadencia, claves y transiciones;
- funciones pequeñas y deterministas con reloj, scheduler y proveedor inyectables;
- Firebase y Meta sólo en servicios de frontera;
- errores tipados por categoría, sin exponer payloads completos;
- ningún catch que convierta una falla de proveedor en éxito;
- valores monetarios redondeados a centavos para presentación y comparación definida;
- plantillas versionadas, sin concatenar texto libre para sustituirlas;
- no duplicar la lógica financiera vigente si puede compartirse como contrato probado.

## Commands propuestos

No se ejecutan como parte de la creación de esta spec. Después de la autorización y de la implementación, los comandos mínimos serán:

Desde app/:

~~~sh
npm run typecheck
npm run build
npm run test:rules
npm run test:payment-notifications
npx playwright test --project=responsive --grep "notificaciones de pagos"
~~~

Desde functions/:

~~~sh
npm run typecheck
npm test
firebase emulators:exec --only database,functions "npm test"
~~~

La instalación de cualquier dependencia, la descarga de emuladores o navegadores, el cambio de scripts y la creación de functions/ requieren autorización de la fase. Las fallas basales conocidas de Vite y test:finance deben permanecer separadas de los resultados de esta fase.

## Estrategia de pruebas

### Contratos puros

- calcular saldo mensual con pago completo, parcial, legacy y sin registro;
- calcular deuda de tienda con varios abonos, saldo cero y venta cancelada;
- agrupar mensualidad y tienda sin duplicar líneas;
- generar claves de idempotencia estables para mensualidad, venta inicial, abono, grupo y operación combinada;
- ignorar updatedAt sin cambio de negocio;
- resolver elegibilidad por consentimiento, teléfono coincidente, atleta inactivo y opt-out;
- calcular fechas de paymentDay 1, 28, 30 y 31 en meses de distinta longitud;
- producir las ventanas de recordatorio y el máximo de un mensaje por atleta/día;
- comprobar transiciones monotónicas de estado;
- clasificar not-submitted, rejected, accepted y unknown;
- demostrar que unknown no se reenvía sin reconciliación;
- sanitizar errores y conservar sólo los campos de auditoría autorizados;
- verificar que ningún contrato de mensaje/PDF contiene healthHistory, athleteIntake, emergencyContact, kioskCode o secretos.

### Integración de backend

- trigger repetido del mismo pago crea un solo job;
- dos workers concurrentes no envían dos veces el mismo job;
- venta inicial con varios pagos crea un solo comprobante;
- groupPaymentId produce un solo mensaje;
- mensualidad y tienda combinadas producen un solo PDF y un solo job;
- el scheduler repetido no reenvía el mismo recordatorio;
- un pago aplicado no falla aunque el proveedor esté caído;
- un retryable-failed reintenta con backoff y un terminal-failed no;
- un opt-out cancela jobs pendientes y bloquea reintentos;
- webhook duplicado no duplica auditoría ni retrocede estados;
- firma inválida, challenge inválido y payload incompleto son rechazados;
- Meta devuelve wamid y los estados sent/delivered/read/failed actualizan la bitácora correcta;
- PDF de recibo y aviso se generan con el layout esperado y el aviso se marca como no comprobante;
- el adaptador nunca recibe secretos desde el código cliente.

### Reglas y permisos

- un usuario autorizado puede registrar consentimiento sólo sobre el atleta permitido;
- un usuario no autorizado no puede modificar preferencias;
- el cliente no puede crear, editar ni borrar jobs, attempts, wamid o estados de proveedor;
- sólo Functions/Admin SDK puede escribir auditoría de entrega;
- Coach, sesión anónima y usuario deshabilitado no pueden administrar consentimiento;
- un cambio de rol o deshabilitación no concede acceso residual.

### QA web obligatorio en Chrome

La validación runtime final se realizará en:

https://kronos-training-fd5e5.web.app/

El flujo protegido requiere el gate de AGENTS.md. Antes de autenticarse, el agente debe detenerse y pedir:

Inicia sesión manualmente en el perfil de Chrome de pruebas. No compartas tus credenciales. Cuando termines, confirma que puedo continuar.

Después de la autorización separada de implementación, QA y cualquier escritura:

1. Abrir la entrada real de Atletas o Pagos.
2. Localizar un atleta sintético claramente identificado como QA y comprobar que su teléfono está enmascarado.
3. Registrar consentimiento deliberado en el QA, o verificar una preferencia ya autorizada, sin inspeccionar tokens/cookies/storage de autenticación.
4. Recorrer el flujo completo de aplicación de un pago de prueba y comprobar que el resultado financiero no depende del resultado de WhatsApp.
5. Verificar que la interfaz muestra el estado compacto correcto y que no expone secretos, salud, contacto de emergencia ni payloads de Meta.
6. Validar un recordatorio en modo dry-run o con el destinatario Meta de pruebas expresamente autorizado; no enviar a clientes reales.
7. Simular o verificar opt-out y confirmar que un job posterior queda suprimido.
8. Revisar consola sin errores o warnings nuevos, red sin llamadas de Meta desde el navegador, DOM/árbol de accesibilidad, permisos y evidencia visual.
9. Ejecutar el flujo en 320, 768, 1024 y 1440 px; comprobar que consentimiento, estado de envío, errores y acciones no se cortan ni generan overflow.
10. Confirmar en el reporte qué datos QA se escribieron, qué mensajes se enviaron, a qué destinatario de prueba y qué se limpió.

La validación en Chrome no se considera completa si sólo se abre el diálogo de consentimiento. Debe recorrer la entrada, captura o consulta, resultado final y salida segura del flujo. No se probarán ventas reales, pagos de clientes reales ni envíos a destinatarios no autorizados.

### Playwright complementario

- ejecutar sólo contra localhost, emuladores o QA aislado, nunca contra producción por defecto;
- cubrir 320, 768, 1024 y 1440 px;
- comprobar overflow, foco, labels, estados loading/error/empty y acciones alcanzables;
- usar fake provider o dry-run para no disparar mensajes reales;
- no automatizar login, leer storageState sensible ni versionar credenciales;
- capturar regresiones visuales sólo para consentimiento, estado de notificación y error de proveedor;
- no usar Playwright como sustituto de Chrome, reglas, tests de backend o pruebas puras.

## Límites

### Siempre

- Mantener Vue 3, TypeScript, Vuetify, Pinia y Firebase salvo autorización explícita.
- Enviar sólo desde backend/Cloud Functions y fallar cerrado cuando falte secreto, plantilla, consentimiento o teléfono válido.
- Observar pagos después de persistidos; nunca poner en riesgo la escritura financiera para enviar un mensaje.
- Usar una clave de idempotencia determinista y transacciones para jobs.
- Deduplicar triggers y webhooks, mantener estados monotónicos y tratar unknown como riesgo operativo.
- Generar el PDF en backend, sin leer athleteIntake, y distinguir recibo de aviso informativo.
- Enmascarar teléfonos y minimizar PII en logs y UI.
- Validar la versión de API, plantilla, WABA, número remitente y capacidad de documento antes del envío real.
- Ejecutar pruebas puras, reglas, backend, typecheck, build y QA Chrome del flujo completo afectado antes de cerrar.

### Preguntar antes

- Crear functions/, Cloud Run, Cloud Tasks, Scheduler, Storage o cualquier recurso de infraestructura.
- Añadir o actualizar dependencias, locks, scripts, runtime, región o plan de Firebase.
- Cambiar database.rules.json, esquema, índices, permisos o capability map.
- Crear o modificar una cuenta WABA, número remitente, plantilla, webhook, token o secreto.
- Definir cadencia definitiva, zona horaria, límite de recordatorios, ventana de reintentos o retención.
- Decidir si el PDF debe ser recibo interno o factura fiscal/CFDI.
- Permitir mensajes reales, writes de QA, pagos de prueba o pruebas de opt-out en la instancia publicada.
- Añadir un módulo/permisos nuevos de Notificaciones o una pantalla de reintentos manuales.

### Nunca

- Poner tokens, app secrets, cookies, verify tokens o números privados en el cliente, Git, logs o fixtures.
- Llamar a Graph API desde Vue o enviar secretos mediante una variable VITE_.
- Enviar sin consentimiento explícito, a un teléfono diferente del consentido o después de opt-out.
- Reemplazar una plantilla no aprobada por texto libre o asumir que un HTTP 200 significa entrega.
- Reintentar ciegamente un resultado unknown que pudo generar un wamid.
- Incluir salud, contacto de emergencia, kioskCode, credenciales, datos de terceros o historiales ajenos.
- Presentar un aviso de deuda como comprobante de pago o llamar factura a un PDF que no sea fiscal.
- Bloquear, revertir o duplicar un pago porque WhatsApp falló.
- Usar cuentas o teléfonos reales de clientes para probar, ni enviar mensajes reales sin autorización separada.
- Modificar AppKronos/kronos.html como sustituto de la aplicación Vue.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Token o app secret expuesto en el bundle | Crítico | Backend-only, Secret Manager, revisión de bundle/red y prohibición de variables VITE_ |
| Mensaje enviado sin consentimiento o después de baja | Crítico | unknown por defecto, comparación de teléfono, opt-out con precedencia y bloqueo en backend |
| Cambio de teléfono conserva consentimiento incorrectamente | Alto | Guardar consentedPhoneE164 y exigir reconfirmación |
| Trigger repetido duplica un cobro | Alto | idempotencyKey, create-if-absent, lock y pruebas concurrentes |
| Timeout después de que Meta aceptó | Alto | estado unknown, no reintento ciego, reconciliación y alerta operativa |
| Dos fuentes notifican una operación combinada | Alto | correlationKey común y agrupación por operación de negocio |
| Scheduler reenvía cobranza cada día | Alto | clave por fecha/tipo/periodo, máximo diario y prueba de ejecución repetida |
| PDF de recordatorio se confunde con recibo | Alto | título AVISO DE PAGO y leyenda visible de no comprobante |
| PDF contiene datos de admisión por reutilización amplia | Alto | contrato de proyección, generador backend dedicado y tests de ausencia |
| Plantilla rechazada o pausada | Alto | estado suppressed-template, sin fallback libre y versión lógica nueva |
| URL del PDF queda pública | Alto | subir a Meta desde backend o enlace privado de vida corta; no Storage público |
| Error de Meta bloquea la operación financiera | Alto | desacoplar job y pago, estado visible y retry/revisión independiente |
| Logs contienen PII o secretos | Alto | hash/últimos cuatro, redacción estructurada y tests de sanitización |
| Opt-out por texto ambiguo | Medio | lista exacta versionada, normalización limitada y no interpretar texto libre |
| Proveedor o API cambia su contrato | Alto | adaptador, versión configurable, contract tests y revisión de documentación antes de publicar |
| Reglas permiten falsificar estados | Crítico | cliente sin writes a jobs/attempts; reglas y pruebas de emulador |
| Costos o límites de Meta/Scheduler no controlados | Alto | lotes acotados, métricas, límites, aprobación de cuenta y monitoreo antes de habilitar |
| QA envía a una persona real | Crítico | dry-run, Meta test recipient, dataset sintético y gate de autorización separado |

## Criterios de aceptación

1. Un pago aplicado de mensualidad elegible crea exactamente un job determinista y un comprobante PDF con folio, importe aplicado y saldo posterior.
2. Una venta inicial, un abono posterior y un cobro conjunto de tienda generan el tipo de comprobante correcto y no se duplican por cada escritura técnica.
3. Una operación combinada de mensualidad y tienda produce un solo mensaje, un solo PDF consolidado y un solo registro de idempotencia.
4. El registro financiero queda aplicado aunque Meta, el generador PDF, el scheduler o el webhook fallen.
5. Un atleta sin consentimiento, con consentimiento unknown, con opt-out o con teléfono cambiado no recibe mensaje y queda una razón auditable de supresión.
6. El consentimiento sólo se activa por acción afirmativa, queda ligado al teléfono E.164, conserva actor/origen/fecha y no puede ser alterado por Coach o usuario deshabilitado.
7. Un opt-out válido por la aplicación o webhook bloquea los jobs pendientes, reintentos y recordatorios posteriores sin borrar el historial.
8. Los recordatorios usan exclusivamente saldos canónicos positivos de mensualidad y tienda, respetan la cadencia autorizada y una ejecución repetida no duplica el mensaje.
9. El aviso de pago incluye la leyenda visible de que no es comprobante y nunca se presenta como factura fiscal.
10. Sólo se envían plantillas Utility aprobadas, con locale, parámetros y header PDF compatibles; una plantilla inválida falla cerrado.
11. Ningún secreto aparece en cliente, bundle, Network del navegador, base de datos de negocio, errores, logs o pruebas.
12. Repetir el trigger, ejecutar workers concurrentes o recibir el mismo webhook no crea otro mensaje ni retrocede estados delivered/read.
13. Los reintentos se aplican sólo a fallos no aceptados y recuperables; unknown no se reenvía automáticamente.
14. La bitácora conserva job, evento, atleta, operación, folio, template, hash PDF, número de intento, wamid, estado y error sanitizado sin guardar PDF, token o cuerpo completo.
15. Las reglas impiden que el cliente escriba jobs, intentos o estados de proveedor, y los tests cubren Admin, usuarios autorizados, Coach, sesión anónima y usuario deshabilitado.
16. La generación de comprobantes no incluye healthHistory, athleteIntake, emergencyContact, kioskCode ni datos de terceros.
17. Pasan contratos puros, integración de Functions, reglas, typecheck, build y pruebas enfocadas sin ocultar fallas basales.
18. Chrome valida en https://kronos-training-fd5e5.web.app/ el flujo completo afectado con sesión manual, destinatario QA autorizado o dry-run, consola limpia, red sin secretos, accesibilidad y matriz 320/768/1024/1440.
19. El reporte de impacto lista árbol de archivos, flujos afectados y no afectados, diagrama, evidencia de backend/Chrome/Playwright, datos QA y riesgos residuales.

## Preguntas abiertas

1. ¿Se aprueba Firebase Cloud Functions de segunda generación como backend o se requiere Cloud Run/otro servicio?
2. ¿La primera versión debe enviar sólo recibos de atletas o también incluir visitantes con consentimiento separado?
3. ¿El PDF requerido es un comprobante interno Kronos o una factura fiscal/CFDI? Si es CFDI, se necesita una spec independiente.
4. Resuelta en E8-PROD-1: tres días antes, día de vencimiento y tres días después; tienda miércoles y viernes.
5. Resuelta parcialmente en E8-PROD-1: 09:00 America/Mexico_City y máximo de un recordatorio por atleta/fecha. La ventana de reintentos productivos se decidirá en su fase operativa.
6. ¿El consentimiento puede registrarlo Recepción con athletesManage o debe quedar restringido a Admin?
7. ¿Se requieren propósitos independientes de recibos y recordatorios, o un solo opt-in de pagos?
8. ¿Qué política de consentimiento aplica cuando el atleta es menor o la autorización la da un tutor?
9. ¿Debe existir una confirmación automática al recibir BAJA? ¿Qué palabras exactas activan el opt-out?
10. ¿Cuál WABA, número remitente, locale, versión Graph API y plantillas aprobadas se usarán? No se requieren ahora y no deben compartirse en esta revisión.
11. ¿Meta aceptará el PDF como media header mediante mediaId/asset handle en la versión elegida, o debe habilitarse una URL privada temporal?
12. ¿Cuál será la retención de jobs, logs, hashes y errores, y quién podrá consultarlos?
13. ¿Se requiere una pantalla independiente de historial/reintento o basta con un estado compacto en Pagos/Atletas?
14. ¿Cuál destinatario Meta de pruebas y qué writes de QA se autorizarán en la instancia publicada?

## Gate de autorización

La spec fue revisada y autorizada explícitamente el 2026-08-28 para iniciar la fase. La autorización cubre:

- el objetivo, alcance, límites y criterios de aceptación;
- el trabajo incremental y las tareas registradas en tasks/plan.md y tasks/todo.md;
- la implementación local de contratos y pruebas sin acceso a Meta ni escrituras en Firebase.

Antes de crear functions/, instalar dependencias, cambiar firebase.json, database.rules.json o el esquema, configurar un scheduler/webhook, usar credenciales o hacer un envío/escritura QA, se solicitará el gate específico correspondiente. No se probará contra Meta ni se desplegará sin esa autorización adicional.
