# Spec: Seguimiento de cumpleaños y tarjeta de felicitación

Estado: implementada, validada y desplegada el 2026-09-24 con marca oficial; sin migración ni modificación manual de datos reales.
Módulo: `birthday-outreach-card`.
Dependencia: `athlete-lifecycle-statuses`.

## Objetivo

Mantener visible cada cumpleaños anual hasta confirmar que el atleta fue felicitado y generar una tarjeta PNG personalizada, consistente con Kronos, descargable y compartible manualmente por WhatsApp.

## Hallazgos actuales

- Comunidad muestra los siguientes 60 días.
- Después de la fecha, calcula el cumpleaños del año siguiente y oculta el pendiente.
- No existe persistencia anual ni generador de tarjeta.

## Alcance

- Guardar un registro por atleta y año con estado `pending` o `greeted`.
- Mostrar próximos 60 días y una sección prioritaria de vencidos no felicitados.
- Mantener pendientes vencidos hasta confirmación explícita.
- Incluir atletas activos y pausados; excluir bajas.
- Registrar fecha y actor de felicitación.
- Generar PNG cuadrado 1080 × 1080 con nombre, mensaje, marca y diseño aprobado.
- Descargar, usar Web Share cuando esté disponible y abrir WhatsApp manual sin envío automático.
- Registrar versión de plantilla y momento de descarga/compartición como telemetría funcional mínima.

## Fuera de alcance

- Envío automático, programación de mensajes o WhatsApp Business.
- Mostrar edad, teléfono o fecha de nacimiento completa en la imagen.
- Generar una composición de IA distinta por atleta.

## Contrato funcional

```ts
interface BirthdayGreeting {
  athleteId: string
  year: number
  status: 'pending' | 'greeted'
  greetedAt?: ISOTimestamp | null
  greetedBy?: string | null
  cardVersion?: string | null
  downloadedAt?: ISOTimestamp | null
}
```

La plantilla será un asset raster original y el nombre se compondrá localmente en canvas. El nodo se identifica por atleta+año para impedir que la felicitación de un año cierre la del siguiente.

## Criterios de aceptación

1. Un cumpleaños de ayer no felicitado sigue visible como pendiente.
2. Marcarlo felicitado registra actor y fecha y lo retira de pendientes.
3. Desmarcar requiere confirmación y conserva trazabilidad mediante actualización auditada o evento.
4. El año siguiente crea un ciclo independiente.
5. Pausados aparecen; bajas no.
6. La tarjeta muestra nombre y mensaje sin edad, teléfono ni fecha completa.
7. PNG mide 1080 × 1080 y descarga con nombre de archivo seguro.
8. Compartir no envía automáticamente ni requiere guardar credenciales.
9. El tablero, diálogo y tarjeta funcionan con teclado y en los cuatro viewports.
10. Reglas permiten lectura según Comunidad y escritura sólo con permiso administrativo autorizado.

## Diseño autorizado

- Estilo deportivo, cálido y celebratorio.
- Paleta oficial Kronos: `#1B1D1A`, `#FF401B`, `#98D6DF`, `#44797F` y `#ECECEC`.
- Logo oficial extraído del arte vectorial proporcionado, sin reconstrucción tipográfica.
- Composición legible y área segura para nombres largos.
- Copy aprobado: `¡Feliz Cumple!`, mensaje de fuerza, constancia y disciplina, y cierre `Con cariño, tu Kronos Family`.
- Plantilla maestra generada con `imagegen` sólo durante la implementación aprobada.
- Render local determinista para evitar costo, latencia e inconsistencia por atleta.

## Tech stack y archivos probables

- Canvas del navegador, Vue/Vuetify y RTDB existentes; sin dependencias.
- `app/src/types/domain.ts`
- `app/src/utils/birthday-greetings.ts`
- `app/src/services/birthday-greetings.service.ts`
- `app/src/stores/birthday-greetings.ts`
- `app/src/components/kronos/BirthdayCardDialog.vue`
- `app/src/pages/comunidad.vue`
- `app/src/assets/images/birthday-card-template.png`
- `app/database.rules.json`
- `app/tests/birthday-outreach.test.ts`

## Estilo

```ts
const greetingKey = `${athlete.id}:${year}`
const queue = buildBirthdayQueue(athletes, greetings, today)
```

Fechas y orden serán puros e inyectarán `today` en pruebas.

## Comandos y pruebas

- `npx tsx --test tests/birthday-outreach.test.ts`
- `npm run test:rules`; `npm run typecheck`; `npm run build`.
- Chrome: próximo → vencido pendiente → tarjeta → descarga → marcar felicitado.
- Playwright `320/768/1024/1440` y verificación visual del PNG.

## Límites y riesgos

- Siempre: privacidad mínima, asset versionado y fallback de descarga.
- Preguntar antes: cambios de reglas, uso de sesión autenticada o envío externo.
- Nunca: incluir edad/teléfono o automatizar WhatsApp.
- Riesgos: nombres largos, 29 de febrero, zona horaria y permisos de compartir del navegador.

## Preguntas abiertas

Ninguna para planificación. El diseño final se presentará visualmente antes de integrarlo.
