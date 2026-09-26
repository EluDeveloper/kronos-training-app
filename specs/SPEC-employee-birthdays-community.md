# Spec: Fecha de nacimiento y cumpleaños de empleados

Estado: autorizada por el usuario el 2026-09-25 para implementación local; visibilidad inicial Admin-only confirmada.
Módulo: `employee-birthdays-community`.
Dependencias: `workforce-payroll`, `birthday-outreach-card`.

## Objetivo

Solicitar fecha de nacimiento al crear o editar un empleado y usarla para completar el tablero de Comunidad con cumpleaños del personal, sin mezclar empleados con atletas ni exponer datos innecesarios.

## Alcance

- Añadir `birthDate` al contrato de empleado y hacerlo obligatorio para altas nuevas.
- Validar fecha ISO real, no futura y razonable; edición de empleados legados permite completar el dato faltante.
- Mostrar en Comunidad una sección separada `Cumpleaños del equipo`, con activos vencidos/hoy/próximos 60 días.
- Reutilizar reglas de ocurrencia anual, incluido 29 de febrero.
- Mostrar sólo nombre, rol y fecha de cumpleaños; no teléfono, notas, tarifa ni fecha de ingreso.
- Mantener la cola de atletas sin cambios semánticos.

## Fuera de alcance

- Migración o backfill automático de empleados existentes.
- Compartir tarjeta, registrar felicitación anual o WhatsApp para empleados en esta primera fase.
- Exponer cumpleaños de empleados a roles que hoy no pueden leer personal sin una decisión de permisos separada.

## Contrato propuesto

```ts
interface Employee {
  birthDate?: ISODate | null
}
```

Para altas nuevas la UI/servicio exige valor; el campo sigue nullable en lectura para compatibilidad con registros legados.

## Criterios de aceptación

1. No se puede crear un empleado nuevo sin fecha de nacimiento válida.
2. Empleados legados sin fecha siguen siendo legibles y muestran una indicación para completar el dato al editar.
3. Comunidad muestra activos con cumpleaños vencido, de hoy o próximos 60 días en una sección separada.
4. Empleados inactivos se excluyen.
5. El 29 de febrero se presenta el 28 en años no bisiestos, igual que atletas.
6. La vista no expone teléfono, tarifa, notas, UID ni otra información laboral.
7. Roles sin permiso de personal no reciben esa colección ni ven la sección; cualquier ampliación requiere autorización.
8. Pruebas, reglas si aplican, build y Chrome cubren alta → Comunidad → edición/inactivación.

## Archivos, comandos y límites

- `app/src/types/workforce.ts`, `app/src/pages/empleados.vue`, servicio/store de workforce, `app/src/pages/comunidad.vue`, utilidad compartida de cumpleaños, reglas/pruebas si cambia lectura.
- `npx tsx --test tests/employee-birthdays-community.test.ts`; `npm run test:rules` si aplica; `npm run typecheck`; `npm run build`.
- Chrome y Playwright 320/768/1024/1440.
- Siempre: mínimo privilegio, compatibilidad legada y minimización de PII.
- Preguntar antes: reglas/permisos, esquema obligatorio en persistencia, migración o datos reales.
- Nunca: copiar fecha de nacimiento a reportes financieros o egresos.

## Riesgos y decisión pendiente

Comunidad no debe ampliar por accidente la lectura de `employees`. La estrategia preferida es mantener la sección Admin-only con los permisos actuales. Si se desea que otros roles vean cumpleaños del equipo, se requerirá una proyección allowlisted y una nueva autorización de reglas.
