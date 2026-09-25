# Spec: Contratos del módulo de reportes

Estado: aprobada y lista para implementar desde el 2026-09-24; la iniciativa de control administrativo y trazabilidad quedó validada localmente.
Módulo: `reports` / `reporting-contracts`.
Dependencias: contratos locales cumplidos por `store-payment-corrections`, `membership-advance-payments`, `athlete-lifecycle-statuses`, `inventory-reconciliation` y `workforce-payroll`.

## Objetivo

Crear la base semántica del módulo de reportes para navegar de indicadores ejecutivos a dominios y transacciones, sin confundir venta, cobro, saldo, flujo, utilidad bruta o resultado operativo.

## Alcance

- Rangos día/semana/mes/trimestre/año/personalizado y comparación anterior/interanual.
- Filtros multi-producto; sin selección representa toda la tienda.
- Diccionario único de métricas, redondeo, zona `America/Mexico_City` y calidad del dato.
- Niveles: resumen ejecutivo → Tienda/Finanzas/Atletas/Operación → indicador → detalle.
- Etiquetas `Exacto`, `Asignación proporcional`, `Histórico parcial` y `No disponible`.
- Permiso independiente de reportes; finanzas inicialmente Admin-only.
- Adaptador de datos desacoplado para sustituir lecturas canónicas por agregados sin rehacer la UI.

## Métricas mínimas

- Tienda: unidades, venta bruta, costo histórico, utilidad/margen bruto, cobrado, recuperado proporcional, saldo y cancelaciones.
- Atletas: activos, altas, pausas, bajas, reactivaciones, crecimiento, retención y cohortes.
- Finanzas: cargos, cobros, cartera, egresos, flujo y conciliación.
- Operación: visitas, atletas únicos, inventario, diferencias y resoluciones.
- Personal: devengado, pagado y pendiente sin exponer contacto.

## Criterios de aceptación

1. La suma del detalle coincide con su KPI a $0.01.
2. Venta, cobro, saldo, costo y utilidad nunca se presentan como sinónimos.
3. Uno o varios productos consolidan sólo sus partidas; vacío consolida toda la tienda.
4. Cobros parciales multi-producto se etiquetan como asignación proporcional.
5. Estados de atleta provienen de eventos auditables y legado se marca parcial.
6. Pérdidas, recuperaciones y nómina respetan sus contratos finales.
7. Filtros son compartibles/restaurables y cada KPI permite drill-down.
8. No se incluyen datos de salud, admisión, teléfono ni secretos.
9. Estados de carga/error/vacío y cuatro viewports cumplen el gate web.

## Tech stack, estructura y estilo

- Vue 3, TypeScript, Vuetify, Pinia, Firebase y ApexCharts existentes; sin dependencias iniciales.
- `app/src/types/reporting.ts`, `app/src/utils/reporting/*`, `app/src/services/reporting.service.ts`.
- `app/src/pages/reportes.vue`, `app/src/components/kronos/reports/*`.
- `app/tests/reporting-*.test.ts`, `app/e2e/responsive/reporting-responsive.spec.ts`.

```ts
const result = calculateMetric(dataset, filters, comparison)
```

Los cálculos serán puros y el origen de datos quedará detrás de un adaptador.

## Comandos y pruebas

- Pruebas enfocadas `npx tsx --test tests/reporting-*.test.ts`.
- `npm run test:finance`, `npm run typecheck`, `npm run build`.
- Reglas si se añade proyección persistida.
- Chrome completo y Playwright `320/768/1024/1440`.

## Límites

- Siempre: definiciones visibles, conciliación a centavos y calidad de dato explícita.
- Preguntar antes: agregados backend, reglas, migraciones, dependencias, datos reales o despliegue.
- Nunca: llamar utilidad neta a una cifra incompleta ni ocultar estimaciones.

## Preguntas abiertas

Ninguna de alcance. El plan se actualizará con los contratos finales al cerrar el gate precedente.
