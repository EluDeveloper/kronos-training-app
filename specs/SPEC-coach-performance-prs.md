# Spec: PRs de coaches en Rendimiento

Estado: autorizada el 2026-09-26, incluidos sujetos, permisos, directorio mínimo, acción UI «Crear skill» y carga inicial única de coaches existentes en producción. Despliegue sujeto a QA final.
Módulo propuesto: `coach-performance-prs`.
Dependencias: `workforce-payroll`, `athletes-payments`, `foundation`.

## Objetivo

Permitir registrar marcas personales (PRs) de coaches y consultarlas en el mismo apartado de Rendimiento que las de atletas, sin mezclarlas con cobros, membresías ni la ficha de atleta.

## Decisiones confirmadas

1. «Coach» como sujeto de la marca significa empleado con `kind: 'coach'`, no usuario con rol `coach` sin ficha de empleado.
2. Un usuario con rol Coach podrá registrar PRs de atletas y coaches sólo si Admin le concede los permisos existentes `performance` y `performanceManage`; no se abrirá ese permiso automáticamente a todos los usuarios Coach.
3. Admin conservará la capacidad de registrar, editar y eliminar PRs. Los coaches autorizados podrán hacerlo para cualquier atleta o coach visible, no sólo para sí mismos.
4. Empleados inactivos conservarán su historial, pero no aparecerán para nuevas marcas.

## Alcance y criterios de aceptación

- Rendimiento permite escoger tipo de persona (Atleta/Coach) al crear una marca y al filtrar el comparativo/historial.
- Los coaches empleados activos aparecen por nombre en el selector; no se duplican como atletas ni se crea una mensualidad.
- Las marcas existentes de atletas se siguen leyendo, editando y mostrando sin migración destructiva.
- Para cada coach, la gráfica, mejor marca, última marca, conteo de PRs y tabla aplican las mismas reglas que para atletas.
- La identidad persistida distingue de forma inequívoca `athleteId` de `employeeId`; la regla de Firebase valida que el coach exista y sea de tipo `coach`.
- Una proyección `coachDirectory/{employeeId}` contiene exclusivamente ID, nombre y estado; usuarios con acceso a Rendimiento pueden leerla sin acceso a nómina, teléfono, cumpleaños ni demás campos de empleado. Sólo Admin puede modificarla al guardar una ficha Coach.
- Sólo Admin o usuarios con los permisos de Rendimiento existentes pueden escribir; usuarios sin permisos no pueden leer por acceso directo ni registrar marcas.
- Crear, editar y eliminar muestran estados de carga/error y funcionan con teclado, móvil y escritorio.
- Si no existe un skill activo, un usuario con `performanceManage` puede crear uno desde Rendimiento con nombre válido, usando servicio y reglas existentes; el skill queda disponible para atletas y coaches.
- Pruebas cubren tipos, lectura legada, permiso negativo, persistencia y comparativo; Chrome recorre alta de coach → Rendimiento → registro de PR → histórico/comparativo → edición.

## Fuera de alcance

- Convertir coaches en atletas, sincronizar sus PRs con nómina o mostrar sus datos laborales en Rendimiento.
- Conceder permisos de Rendimiento automáticamente por rol.
- Un perfil «Mis PRs» restringido a marcas propias, aprobación de PRs o nuevas categorías de métricas.

## Implementación y verificación propuestas

Stack existente Vue 3, TypeScript, Pinia y Firebase; sin dependencias nuevas. Archivos probables: `app/src/types/domain.ts`, `app/src/services/performance.service.ts`, `app/src/stores/performance.ts`, `app/src/pages/rendimiento.vue`, `app/database.rules.json`, pruebas de reglas/rendimiento y reporte. Rebanadas pequeñas: contrato/reglas, servicio, UI y QA.

Comandos: `npx tsx --test tests/performance-coaches.test.ts`; `npm run test:rules`; `npm run typecheck`; `npm run build`; lint focalizado. Chrome manual en QA aislado; Playwright complementario a 320/768/1024/1440 px.

## Riesgos y límites

- El árbol actual `performance/{athleteId}/{skillId}/{recordId}` no distingue coaches; cambiarlo exige contrato compatible y reglas estrictas. No se escribirá en datos reales ni se migrarán históricos sin autorización adicional.
- `linkedUserId` de empleado es opcional: identificar al coach por su rol sin ficha puede vincular una marca a la persona equivocada. Se propone usar la ficha del empleado y los permisos existentes.
- La tabla `employees` es Admin-only y contiene nómina. Abrir su lectura a coaches o a usuarios de Rendimiento filtraría datos sensibles. Se usa un directorio mínimo separado; la carga inicial de coaches existentes debe ser idempotente, comparar conteos y no sobrescribir entradas válidas ajenas a la migración.
- Los cambios de esquema/reglas y permisos están sujetos a este gate de aprobación; despliegue y datos reales conservan su autorización separada.

## Autorización

El usuario confirmó los cuatro supuestos y autorizó el directorio mínimo el 2026-09-26. Autorizó expresamente una carga inicial única sobre producción que copie exclusivamente ID, nombre y estado de empleados Coach, con conteo verificado y reversión restringida a entradas creadas por esa operación. El despliegue sigue sujeto a QA final.

La acción «Crear skill» en UI fue autorizada por el usuario el 2026-09-26 tras detectar el prerrequisito en Chrome QA. No cambia el esquema ni abre permisos nuevos.
