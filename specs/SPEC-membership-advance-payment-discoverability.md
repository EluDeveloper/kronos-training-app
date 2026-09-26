# Spec: Acceso visible a abonos anticipados de mensualidad

Estado: autorizada por el usuario el 2026-09-25 para implementación local.
Módulo: `membership-advance-payment-discoverability`.
Dependencia: `membership-advance-payments`.

## Objetivo

Hacer evidente dónde aplicar un abono anticipado a la cuenta de un atleta y conservar el recibo inmediato, reutilizando el contrato de adelantos ya implementado.

## Alcance

- Añadir acción `Abonar mensualidad` en el contexto del atleta y un CTA visible en Pagos.
- Abrir el diálogo con atleta preseleccionado cuando la acción nace desde su fila/ficha.
- Presentar periodos con etiquetas humanas: vigente, futuro y fecha de corte; mantener límite actual de 12 meses.
- Permitir parcial o liquidación completa de un solo periodo por operación.
- Mostrar saldo antes/después y etiqueta `Adelanto` cuando corresponda.
- Abrir recibo al guardar y mantener `Ver recibo` en historial.
- Conservar snapshots de plan, importe y día de corte ya definidos.

## Fuera de alcance

- Cambiar el cálculo financiero vigente, pagar varios meses en una operación o crear una billetera genérica.
- Descuentos por prepago; éstos pertenecen a `plan-promotions`.
- Revertir pagos de mensualidad.

## Criterios de aceptación

1. Desde Atletas se llega al formulario de abono en una acción y el atleta correcto queda preseleccionado.
2. Desde Pagos existe una acción primaria claramente rotulada para iniciar el mismo flujo.
3. El selector no exige escribir `YYYY-MM`; muestra periodo y fecha de corte comprensibles.
4. Un parcial futuro queda `Adelantado`, conserva saldo y no aparece vencido antes del corte.
5. El recibo se abre al guardar y muestra atleta, periodo, corte, importe, método y saldo.
6. Recargar o volver desde historial no duplica el pago.
7. Navegación por teclado, móvil y lector de pantalla permite completar el flujo.
8. Chrome cubre atleta → abono anticipado parcial → recibo → historial y liquidación total posterior.

## Archivos, comandos y límites

- `app/src/pages/atletas.vue`, `app/src/pages/pagos.vue`, `app/src/components/kronos/MembershipPaymentDialog.vue`, `app/src/utils/membership-periods.ts`, pruebas de adelantos/UI.
- `npx tsx --test tests/membership-advance-payments.test.ts`
- `npm run test:finance`; `npm run typecheck`; lint focalizado; `npm run build`; Chrome y Playwright responsive.
- Siempre: una sola implementación de dominio y recibo inmediato.
- Preguntar antes: rutas/permissions, writes QA o cambio al límite de 12 meses.
- Nunca: tratar un adelanto como vencido antes del corte o duplicar lógica de cobro.

## Riesgos

La capacidad financiera ya está implementada; el cambio debe probar descubribilidad y navegación sin alterar snapshots, recordatorios ni reportes.
