# Spec: Estado de cuenta PDF de adeudos de tienda

Estado: implementada, validada y desplegada el 2026-09-24; sin migración ni modificación manual de datos reales.
Módulo: `store-debt-statement`.
Dependencia: `store-payment-corrections`.

## Objetivo

Permitir generar desde Tienda un estado de cuenta PDF exclusivamente de adeudos de tienda para una venta, varias ventas seleccionadas o todos los adeudos abiertos de un atleta, sin incluir mensualidad ni visitas.

## Alcance

- Selección por atleta y por ventas abiertas.
- Seleccionar una, varias o todas las ventas del atleta.
- Vista previa, descarga, impresión y compartición manual por WhatsApp.
- Mostrar folio, fecha, artículos, cantidades, importe original, abonos efectivos, ajustes y saldo por venta.
- Mostrar total original, total abonado y total pendiente.
- Deshabilitar la acción si no hay saldo efectivo.
- Reutilizar las primitivas visuales de recibos y PDF existentes.

## Fuera de alcance

- Añadir mensualidad, visitas o datos de salud/admisión.
- Aplicar pagos desde el PDF.
- Enviar automáticamente por WhatsApp Business.

## Contrato funcional

```ts
interface StoreDebtStatementInput {
  athlete: Athlete
  sales: Sale[]
  issuedAt: number
}
```

El constructor sólo acepta ventas del mismo atleta, no canceladas y con saldo efectivo mayor a cero. Los totales deben reconciliar con Tienda a centavos.

## Criterios de aceptación

1. Una venta produce un PDF sólo con sus partidas y saldo.
2. N ventas producen un documento único con subtotal por venta y total global.
3. `Seleccionar todos` incluye únicamente adeudos efectivos del atleta.
4. Mensualidad y visitas no aparecen en concepto, líneas ni total.
5. Correcciones y reversos autorizados se reflejan en abonos y saldos.
6. El total del PDF coincide con el panel de adeudos con tolerancia máxima de $0.01.
7. El documento no contiene teléfono salvo en la acción explícita de compartir ya utilizada por recibos.
8. Vista previa, teclado, descarga e impresión funcionan en los cuatro viewports.

## Tech stack, archivos y estilo

- Reutilizar Vue, Vuetify, jsPDF y utilidades existentes; sin dependencias.
- `app/src/utils/store-debt-statement.ts`
- `app/src/utils/receipts.ts`
- `app/src/components/kronos/StoreDebtStatementDialog.vue`
- `app/src/pages/tienda.vue`
- `app/tests/store-debt-statement.test.ts`
- `app/e2e/responsive/store-debt-statement-responsive.spec.ts`

```ts
const statement = buildStoreDebtStatement({ athlete, sales: selectedSales, issuedAt })
```

## Comandos y pruebas

- `npx tsx --test tests/store-debt-statement.test.ts`
- `npm run typecheck`
- `npm run build`
- Chrome: adeudos → seleccionar uno/varios/todos → vista previa → PDF → compartir sin envío.
- Playwright: `320/768/1024/1440`.

## Límites y riesgos

- Siempre: usar saldos efectivos y probar reconciliación.
- Preguntar antes: cambiar renderer compartido si altera recibos existentes.
- Nunca: incluir mensualidad o datos sensibles.
- Riesgo principal: regresión visual o de totales en recibos existentes; se cubre con pruebas de ambos documentos.

## Preguntas abiertas

Ninguna para planificación.
