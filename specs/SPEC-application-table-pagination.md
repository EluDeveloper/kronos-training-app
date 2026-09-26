# Spec: Paginación transversal de tablas

Estado: autorizada por el usuario el 2026-09-25 para implementación local.
Módulo: `application-table-pagination`.
Dependencia: `experience-quality`.

## Objetivo

Eliminar patrones de scroll infinito o crecimiento ilimitado en las tablas operativas y ofrecer navegación paginada, predecible y accesible, sin perder filtros, orden ni acciones por fila.

## Alcance

- Inventariar todas las tablas funcionales en `app/src/pages` y `app/src/components/kronos`; excluir demos del template y tablas internas de recibos/gráficas que no representan listados navegables.
- Usar paginación visible cuando el resultado filtrado exceda el tamaño de página.
- Estándar inicial: 15 filas, opciones 15/30/50, indicador de rango/total y controles anterior/siguiente/página.
- Restablecer a página 1 al cambiar filtros; ajustar automáticamente una página inválida después de borrar o filtrar.
- Paginar el conjunto filtrado y ordenado, nunca cada fuente antes de aplicar filtros.
- Mantener acciones, selección y foco correctos al cambiar de página.
- No introducir scroll infinito, carga automática por viewport ni virtualización como sustituto del paginador.

## Fuera de alcance

- Cambiar Firebase a consultas cursor-based en esta fase.
- Paginar tarjetas, KPIs, recibos, formularios o listas menores no tabulares.
- Rediseñar los módulos funcionales.

## Criterios de aceptación

1. Cada tabla operativa inventariada tiene paginador cuando supera 15 resultados; ninguna depende de scroll infinito.
2. El usuario puede elegir 15, 30 o 50 filas y conoce rango y total.
3. Buscar, filtrar u ordenar produce el mismo conjunto lógico y vuelve a una página válida.
4. Estados vacío, carga y error no muestran paginadores engañosos.
5. Teclado, lector de pantalla y foco permiten navegar y entender los controles.
6. No hay overflow horizontal nuevo en 320/768/1024/1440; cuando la tabla ya requiere desplazamiento horizontal, éste queda dentro de su contenedor y no sustituye la paginación vertical.
7. Typecheck, pruebas focalizadas, build y Chrome cubren al menos una tabla simple, una filtrada y una con acciones.

## Tech stack, estructura y estilo

- Vue 3, TypeScript y Vuetify existentes, sin dependencias nuevas.
- Archivos probables: `app/src/composables/useTablePagination.ts`, componentes/páginas con tablas, `app/tests/table-pagination.test.ts`, `app/e2e/responsive/*`.

```ts
const { page, pageSize, pageCount, visibleItems } = useTablePagination(filteredItems)
```

La utilidad compartida sólo controla paginación; cada módulo conserva sus filtros y orden de dominio.

## Comandos y pruebas

- `npx tsx --test tests/table-pagination.test.ts`
- Pruebas funcionales ya existentes de cada página modificada.
- `npm run typecheck`; lint focalizado; `npm run build`.
- Chrome: filtro → página intermedia → acción → cambio de filtro → página válida; consola/red/DOM/accesibilidad.
- Playwright complementario: `npm run test:e2e:responsive` en 320/768/1024/1440.

## Límites y riesgos

- Siempre: inventario documentado, estado accesible y rebanadas de máximo cinco archivos.
- Preguntar antes: consultas Firebase, dependencias o persistencia de preferencias.
- Nunca: ocultar filas sin indicar total o usar scroll infinito.
- Riesgos: tablas duplicadas, selecciones que atraviesen páginas y colecciones grandes cargadas completas. La paginación cliente mejora navegación, no volumen de lectura; paginación de servidor requerirá una spec posterior.

## Archivos probables de la fase

El inventario inicial incluye `atletas.vue`, `pagos.vue`, `tienda.vue`, `empleados.vue`, `planes.vue`, `visitas.vue`, `egresos.vue`, `cierres.vue`, `rendimiento.vue`, `usuarios.vue`, `dashboard.vue` y tablas de `components/kronos/reports`. El task de auditoría confirmará cuáles necesitan cambio y dividirá la implementación por dominio.
