# Spec: Estados Activo, Pausa y Baja de atletas

Estado: implementada y validada localmente el 2026-09-24; sin datos reales ni despliegue.
Módulo: `athlete-lifecycle-statuses`.
Dependencia: `athletes-payments`.

## Objetivo

Separar una pausa temporal de una baja y conservar un historial inmutable de transiciones para seguimiento, acceso, cobranza y reportes confiables.

## Alcance

- Crear `AthleteStatus = 'active' | 'paused' | 'inactive'` sin ampliar el `ActiveStatus` compartido por otros dominios.
- Capturar motivo, fecha efectiva y, para pausa, fecha esperada de regreso.
- Registrar eventos `created`, `paused`, `reactivated` e `inactive` con actor y fecha de servidor.
- Permitir Activo → Pausa/Baja, Pausa → Activo/Baja y Baja → Activo.
- Mantener la reactivación explícita; la fecha esperada sólo genera seguimiento.
- Bloquear Kiosco para pausados y bajas.
- Excluir pausados y bajas de obligación automática; mantener historial y adeudos existentes.
- Incluir activos y pausados en Comunidad; excluir bajas.
- Marcar el histórico previo como parcial, sin inventar eventos.

## Fuera de alcance

- Borrar atletas.
- Reactivación automática.
- Migración retrospectiva de pausas no registradas.

## Contrato funcional

```ts
type AthleteStatus = 'active' | 'paused' | 'inactive'

interface AthleteLifecycleEvent {
  id: string
  athleteId: string
  fromStatus: AthleteStatus | null
  toStatus: AthleteStatus
  effectiveDate: ISODate
  expectedReturnDate?: ISODate | null
  reason: string
  notes?: string | null
  createdBy: string
  createdAt: ISOTimestamp
}
```

El evento y el estado vigente se escriben atómicamente. Los eventos no se editan ni eliminan desde el cliente.

## Criterios de aceptación

1. Pausar exige motivo y permite fecha esperada posterior o igual a la efectiva.
2. Dar de baja exige motivo y no se presenta como pausa.
3. Reactivar no elimina el evento anterior.
4. Dos reintentos no crean transiciones duplicadas.
5. Un atleta pausado no entra por Kiosco ni aparece como obligación nueva, pero conserva datos y adeudos.
6. Comunidad incluye pausados y excluye bajas.
7. Las altas/bajas/reactivaciones se pueden contar por día, mes y año desde eventos nuevos.
8. Atletas heredados muestran `Histórico parcial` hasta su primer evento auditado.
9. Sólo `athletesManage` puede cambiar el estado; lectura respeta permisos actuales.
10. Reglas, pruebas, build y Chrome validan todas las transiciones.

## Tech stack y archivos probables

- Stack existente, sin dependencias.
- `app/src/types/domain.ts`
- `app/src/utils/athlete-lifecycle.ts`
- `app/src/services/athletes.service.ts`
- `app/src/services/athlete-lifecycle.service.ts`
- `app/src/stores/athletes.ts`
- `app/src/pages/atletas.vue`
- `app/src/pages/kiosco.vue`
- `app/database.rules.json`
- `app/tests/athlete-lifecycle.test.ts`
- `app/tests/database.rules.test.mjs`

## Estilo

```ts
const transition = buildAthleteTransition(currentStatus, command, actor, now)
```

El contrato valida la transición antes de construir la actualización multipath.

## Comandos y pruebas

- `npx tsx --test tests/athlete-lifecycle.test.ts`
- `npm run test:rules`
- Regresiones de atleta, Kiosco, pagos y Comunidad.
- `npm run typecheck`; `npm run build`.
- Chrome completo y Playwright `320/768/1024/1440`.

## Límites y riesgos

- Siempre: transición atómica, historia append-only y etiquetas explícitas.
- Preguntar antes: esquema, reglas, migración o datos reales.
- Nunca: inferir pausas históricas ni borrar adeudos por cambiar estado.
- Riesgo: consumidores que actualmente filtran sólo `status === 'active'` requieren revisión sistemática.

## Preguntas abiertas

Ninguna para planificación.
