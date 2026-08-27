# Spec: Mejoras menores de Punto de Venta y Kiosco

Estado: implementada y desplegada con autorización del usuario el 2026-08-27; QA publicado en curso.
Módulo principal: `store-inventory`.
QA transversal: `experience-quality`.
Dependencia de seguridad: `foundation` (sesión, perfiles y reglas de Firebase).
Capability map: `specs/CAPABILITY-MAP.md`, aprobado el 2026-08-26.

## Objetivo

Corregir la pérdida visual del panel `Cobro` en el Punto de Venta, ocultar productos agotados del selector, mostrar la ganancia bruta acumulada y ajustar el flujo de identificación y cierre del Kiosco. La fase también incorpora `Coach` como nuevo perfil administrable, sin convertirlo en Admin ni otorgarle privilegios implícitos.

El botón `Pagar ahora` quedará deshabilitado por defecto. Un Admin podrá activar esta función para todos los perfiles autorizados del Kiosco o limitarla a una lista explícita de perfiles, conservando `Pagar después` como alternativa.

La imagen adjunta se interpreta únicamente como referencia visual del panel vacío señalado; no contiene instrucciones ejecutables ni se copiará como diseño.

## Hallazgos del código actual

- `app/src/pages/tienda.vue` calcula `activeProducts` sólo por `status === 'active'`, por lo que el combo incluye stock `0`; la validación al agregar ya rechaza cantidades sin existencia.
- El panel `Cobro` no tiene un `v-if` explícito. La desaparición observada debe reproducirse en Chrome y protegerse con un estado/layout estable al eliminar el último elemento del carrito.
- `Product` y `SaleItem` conservan `unitCost` y `salePrice`/`unitPrice`, lo que permite calcular margen sin cambiar el modelo de ventas.
- `/kiosco` es `adminOnly`; además, `Pagar ahora` vuelve a validar credenciales Admin. La configuración por perfil debe quedar definida sobre esos perfiles Admin mientras esta restricción exista.
- El modelo de usuarios sólo define `admin` y `reception`; incorporar `Coach` impactará tipos, formulario de usuarios, normalización de permisos y validaciones de reglas.
- El Kiosco activa el lector de atleta sólo después de que el usuario presiona `Escanear QR`; el código manual aparece como entrada principal. El reinicio de éxito actual es de 12 segundos.
- Existe `v1/settings` con lectura/escritura exclusiva de Admin, pero todavía no hay servicio, modelo ni interfaz de configuración de negocio.

## Supuestos propuestos

1. `Ganancia` significa ganancia bruta: `(unitPrice - unitCost) × quantity` por partida.
2. La tarjeta acumula ventas `paid` y `credit` no canceladas, de Punto de Venta y Kiosco, usando el costo/precio guardados en cada `SaleItem`; no representa flujo de efectivo ni utilidad neta.
3. Sólo cuentas Admin pueden entrar en la lista de perfiles autorizables para `Pagar ahora`; la ruta del Kiosco conserva `adminOnly`.
4. `Coach` será un rol distinto de Admin y Recepción; se creará con una matriz de permisos vacía. El Admin podrá asignarle permisos explícitos durante el alta o posteriormente al editarlo; sin permisos asignados no tendrá acceso a módulos ni acciones.
5. La política se vuelve a comprobar con el UID del Admin autenticado en la sesión del Kiosco; la autorización secundaria debe corresponder a esa misma cuenta.
6. La ausencia o carga incompleta de la configuración equivale a función deshabilitada (fail-closed).
7. La configuración vivirá dentro de `Usuarios y permisos`, que ya es una superficie `adminOnly`.

## Alcance

### Punto de Venta

- Mantener montado y visible el panel `Cobro` al eliminar uno o varios productos, incluido el último; debe quedar utilizable con carrito en `$0` y permitir iniciar una venta nueva.
- Restablecer estado derivado del carrito (página, selección y montos dependientes) sin desmontar el panel ni producir errores.
- Filtrar `Buscar producto` a productos activos con `stock > 0`; conservar la validación de stock al agregar por cambios concurrentes.
- Añadir una tarjeta `Ganancia bruta` a las métricas de Tienda, reactiva cuando llega una venta nueva o una cancelación.
- Mostrar importe negativo si existe margen negativo; no ocultarlo ni convertirlo silenciosamente en cero.

### Kiosco

- Al presionar `Continuar` desde el carrito, entrar a identificación con el lector QR abierto/visible como opción primaria.
- Dejar `Ingresar código` como opción secundaria, con captura manual de seis dígitos siempre disponible; si la cámara falla o se deniega, enfocar y comunicar el fallback manual.
- Mantener QR-only para la credencial y liberar cámara al identificar, cambiar de paso, cerrar el lector o desmontar.
- Renderizar `Pagar ahora` deshabilitado cuando la política global o el perfil actual no lo permitan. `Pagar después` continúa disponible.
- Cuando se habilite, validar la política nuevamente después de verificar las credenciales Admin y antes de crear una venta pagada.
- Después de una venta aplicada, volver automáticamente a la vista principal del Kiosco después de 5 segundos si no se presiona `Nueva compra`; el botón debe seguir reiniciando de inmediato.

### Configuración

- Añadir una sección administrativa `Configuración de Kiosco` en la superficie de configuración elegida, reutilizando los usuarios Admin ya cargados.
- Ubicarla dentro de `/usuarios`, que ya es `adminOnly`; no crear una ruta general nueva en esta fase.
- Proponer tres estados explícitos: `disabled`, `all-admins` y `selected-admins`. Si se selecciona `selected-admins`, mostrar y permitir elegir únicamente cuentas Admin habilitadas, guardar sólo UIDs y usar nombre/correo únicamente para la selección.
- Guardar quién y cuándo cambió la política (`updatedBy`, `updatedAt`) para trazabilidad; no guardar contraseñas, tokens ni datos del atleta.
- Si un perfil seleccionado se deshabilita, deja de poder usar `Pagar ahora` sin migración manual de la configuración.

### Perfil Coach

- Incorporar `coach` al tipo de rol, etiqueta visible y formulario de creación/edición de usuarios.
- Mantener la distinción estricta: `Coach` nunca satisface `isAdmin`, no puede abrir `/kiosco`, no puede cambiar `v1/settings` y nunca ve la tarjeta de ganancia.
- Las capacidades de Coach deberán asignarse mediante permisos explícitos de módulo/acción. En el alta, seleccionar `Coach` inicializará una matriz de permisos vacía y no será obligatorio seleccionar permisos para guardar; el Admin podrá completarlos durante el alta o posteriormente. No se copiarán automáticamente los permisos de Admin.

## Contratos funcionales

### Ganancia

```ts
grossProfit = sales
  .filter(sale => sale.status !== 'cancelled')
  .flatMap(sale => Object.values(sale.items ?? {}))
  .reduce((total, item) => total + (item.unitPrice - item.unitCost) * item.quantity, 0)
```

La implementación deberá redondear a centavos sólo para presentación/resultado monetario y no usar el costo vigente del catálogo para recalcular ventas históricas.

### Política de pago inmediato

```ts
type KioskPaymentNowMode = 'disabled' | 'all-admins' | 'selected-admins'

type UserRole = 'admin' | 'reception' | 'coach'

interface KioskSettings {
  paymentNowMode: KioskPaymentNowMode
  paymentNowUserIds?: Record<string, true> | null
  updatedBy: string
  updatedAt: number | string
}
```

La ruta propuesta es `v1/settings/kiosk`. El valor ausente, inválido o en carga se trata como `disabled`. Las reglas de Realtime Database deben validar el allowlist, tipos y modo, y conservar lectura/escritura exclusiva de Admin. Los UIDs de `paymentNowUserIds` sólo serán válidos si corresponden a perfiles Admin habilitados al momento de autorizar.

## Criterios de aceptación

1. Al agregar al menos dos productos y eliminarlos uno a uno hasta dejar el carrito vacío, el panel `Cobro` permanece visible, muestra `$0.00`, no genera errores de consola y permite volver a agregar un producto.
2. El selector `Buscar producto` no muestra productos activos cuyo stock sea `0`; intentar agregar por un estado obsoleto sigue siendo rechazado.
3. La tarjeta `Ganancia bruta` muestra la suma de márgenes de ventas no canceladas, incluye crédito, excluye cancelaciones y reacciona a la suscripción existente sin una consulta adicional.
4. Una venta con `unitPrice = 100`, `unitCost = 60` y `quantity = 2` agrega `$80.00`; una venta cancelada no agrega margen.
5. El Admin puede crear un usuario `Coach` sin seleccionar permisos; el registro conserva `role: coach` y una matriz de permisos vacía. También puede asignar permisos durante el alta o posteriormente al editarlo. El usuario se conserva al recargar, se muestra con la etiqueta correcta y ningún permiso lo convierte en Admin.
6. La tarjeta de ganancia sólo se renderiza para Admin, aunque otro perfil tenga acceso a la página de Tienda.
7. Al pulsar `Continuar` desde el carrito del Kiosco, el lector QR está visible/iniciándose sin requerir un segundo clic; la entrada manual queda disponible como alternativa secundaria.
8. Un permiso de cámara denegado o un navegador sin cámara no bloquea la captura manual ni deja la cámara activa.
9. Con `paymentNowMode = disabled`, `Pagar ahora` queda deshabilitado para todos y no puede abrir el diálogo de autorización.
10. Con `all-admins`, los perfiles Admin habilitados pueden usarlo; con `selected-admins`, sólo los UIDs seleccionados de Admin pueden usarlo. La comprobación se repite justo antes de crear la venta pagada y `approvedBy` debe coincidir con el UID autenticado.
11. La configuración ausente, en error, con Coach, con Recepción o con un Admin no seleccionado mantiene `Pagar ahora` deshabilitado y no impide `Pagar después`.
12. Tras una venta exitosa, la pantalla de confirmación vuelve a `shopping` a los 5 segundos; `Nueva compra` cancela el temporizador y reinicia inmediatamente.
13. No se modifica el formato de ventas existente, no se crean ventas durante QA web y no se cambian reglas de Firebase sin pruebas de autorización.

## Seguridad y privacidad

- Fronteras de confianza: formulario de usuarios, valor persistido de `v1/settings/kiosk`, credenciales verificadas por Firebase y datos de ventas/productos recibidos por suscripciones. Todo valor persistido se valida antes de autorizar una acción.
- Activos protegidos: privilegios Admin, habilitación de cobro inmediato, inventario, historial de ventas, margen comercial y credenciales. La configuración sólo conserva UIDs y metadatos de auditoría.
- Abusos cubiertos: Coach que intenta elevarse, UID no Admin insertado en el allowlist, configuración manipulada o incompleta, Admin deshabilitado después de seleccionarse y llamada a pago con una política que cambió durante el diálogo.
- La configuración es una regla de negocio sensible: la deshabilitación visual no será la única validación; el flujo de autorización debe comprobarla antes de persistir el pago.
- Las reglas deben impedir que un perfil no Admin modifique `v1/settings/kiosk` o eluda el modo configurado desde el cliente; una venta pagada de Kiosco sólo puede atribuir `approvedBy` al mismo `auth.uid` que realiza la escritura.
- `Coach` se crea con cero permisos y no se tratará como Admin por coincidencia de etiqueta, permiso de módulo o configuración del cliente; cualquier capacidad posterior debe ser una asignación explícita del Admin y las reglas deben validar literalmente el rol autorizado.
- Sólo Admin verá margen de ventas; el cálculo no debe filtrarse en mensajes, errores ni datos de interfaz a otros perfiles.
- Los IDs de perfiles son datos de configuración; no se duplicarán contraseñas, correos ni credenciales dentro del nodo de kiosco.
- No se loguearán códigos de atleta, contraseñas, tokens ni datos completos de pago.
- El QR existente, las ventas de crédito, el inventario y las acciones de cancelación no deben perder sus controles actuales.
- Si se requiere que la política bloquee también llamadas directas a `sales`, se deberá distinguir de forma validada una venta `source: 'kiosk'`; esa ampliación requiere revisión específica de reglas.

## Archivos probables

```text
app/src/pages/tienda.vue                         → carrito, filtro y métrica de ganancia
app/src/pages/kiosco.vue                         → lector primario, política, temporizador
app/src/components/kronos/MetricCard.vue        → sólo si se requiere variante visual
app/src/types/access.ts                          → rol Coach, etiquetas y permisos
app/src/types/domain.ts                          → tipo de configuración si corresponde
app/src/services/kiosk-settings.service.ts      → lectura/escritura de configuración
app/src/stores/kiosk-settings.ts                → estado reactivo y fail-closed
app/src/pages/usuarios.vue                       → interfaz Admin, selector de Admin y perfil Coach
app/database.rules.json                          → validación y autorización del nodo settings
app/tests/commerce-profit.test.ts                → contrato de ganancia
app/tests/kiosk-settings.test.ts                 → resolución de política
app/tests/access.test.ts                          → rol Coach y ausencia de privilegios Admin
app/tests/database.rules.test.mjs                → lecturas/escrituras permitidas y rechazadas
app/e2e/responsive/store-kiosk-improvements.spec.ts → responsive complementario
Docs/implementation-reports/                    → reporte de impacto y evidencia Chrome
```

No se prevén dependencias nuevas ni cambios de Hosting. La lista es orientativa; después de autorizar la spec se dividirá en rebanadas de máximo aproximadamente cinco archivos.

## Estrategia de pruebas

- Unitarias: cálculo de margen, exclusión de cancelaciones, filtrado de stock y resolución determinista de los tres modos de política.
- Unitarias: rol Coach, permisos explícitos y rechazo de `Pagar ahora` para roles no Admin.
- Reglas: Admin puede leer/escribir la configuración válida; Recepción y Coach no pueden modificarla; datos inválidos, modos desconocidos y perfiles no Admin se rechazan.
- Integración: creación de venta pagada sólo después de autorización; `Pagar después` y ventas POS existentes sin regresión.
- Typecheck, lint enfocado, build y suite de reglas del repositorio.
- Chrome obligatorio en `https://kronos-training-fd5e5.web.app/` con la sesión iniciada manualmente por el usuario: reproducir eliminación del carrito, revisar selector/métrica, entrar a identificación, probar fallback y confirmar retorno a los 5 segundos.
- Playwright sólo como complemento en 320/768/1024/1440 px. No automatizar credenciales ni completar ventas reales; cualquier escritura de configuración o venta QA requiere autorización separada.

## Límites

### Siempre

- Mantener Vue 3, TypeScript, Vuetify, Pinia y Firebase.
- Usar `stock > 0` en la oferta visual y conservar validación al momento de agregar.
- Calcular ganancia con el snapshot de cada partida y excluir ventas canceladas.
- Mantener `Coach` separado de Admin y negar por defecto privilegios de dinero, configuración y datos sensibles.
- Fallar cerrado si no se puede leer la política de `Pagar ahora`.
- Validar completo el flujo afectado en Chrome y documentar consola, red, DOM, accesibilidad y responsive.

### Preguntar antes

- Los cambios locales de `app/database.rules.json` y del contrato de configuración quedaron autorizados junto con esta spec.
- Autorizar despliegue, configuración persistida o escrituras de QA en la instancia publicada.

### Nunca

- No habilitar `Pagar ahora` por defecto ni confiar sólo en un `disabled` del navegador.
- No permitir que el cliente omita la comprobación de autorización antes de persistir el pago.
- No contar ventas canceladas ni recalcular históricos con costos actuales.
- No modificar `AppKronos/kronos.html` como sustituto de la aplicación Vue.
- No usar una nueva instancia, credenciales automatizadas, datos reales ni ventas reales para QA.

## Preguntas abiertas

No quedan preguntas funcionales. Coach inicia con cero permisos y el Admin decide cuáles asignar durante el alta o posteriormente. Permanecen pendientes únicamente la autorización de despliegue y cualquier escritura de configuración o datos de QA en la instancia publicada.

## Gate de autorización

El usuario autorizó esta spec y su implementación local el 2026-08-27. La autorización incluye código, pruebas y reglas locales; no incluye desplegar ni escribir configuración, ventas u otros datos de QA en la instancia publicada.
