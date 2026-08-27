# Spec: Código aleatorio y credencial QR de quiosco

Estado: aprobada para implementación el 2026-08-26.
Módulo proveedor: `athletes-payments`.
Consumidor: `store-inventory`, exclusivamente en la identificación del flujo de Kiosco.
Capability map: `specs/CAPABILITY-MAP.md`, aprobado el 2026-08-26.
QA transversal: `specs/SPEC-quality-gates.md`.

## Objective

Conservar el código personal aleatorio de 6 dígitos y convertirlo en una credencial QR visual que el atleta pueda presentar en Kiosco. La tarjeta seguirá el lenguaje de la referencia entregada: formato vertical oscuro, QR de alto contraste, título `Kiosco Kronos`, nombre del atleta y `https://kronos-training.com/`.

El Admin podrá generar o regenerar el código tantas veces como lo requiera. Cada reemplazo será explícito y seguro: el código anterior continuará activo hasta guardar correctamente el nuevo; después del guardado, la credencial anterior dejará de identificar al atleta.

La fase conserva Vue 3, TypeScript, Vuetify, Pinia y Firebase Realtime Database. Reutiliza ZXing, ya instalado, para generar y leer QR sin servicios externos ni dependencias nuevas.

## User Stories

- Como Admin, quiero generar una credencial QR con un código aleatorio para entregarla al atleta sin derivar el identificador de sus datos personales.
- Como Admin, quiero regenerarla cuantas veces sea necesario y saber exactamente cuándo deja de funcionar la anterior.
- Como atleta, quiero presentar el QR o capturar manualmente los 6 dígitos si la cámara no está disponible.
- Como operador, quiero confirmar visualmente al atleta identificado antes de continuar con la compra.

## Alcance

### Incluye

- Mantener códigos aleatorios de exactamente 6 dígitos mediante `crypto.getRandomValues`.
- Evitar códigos ya asignados a otros atletas y limitar los reintentos internos ante colisiones.
- Permitir generación inicial y regeneración sin un límite funcional de veces para Admin.
- Exigir confirmación antes de preparar el reemplazo de un código persistido.
- Conservar el código anterior hasta que el nuevo se guarde correctamente.
- Generar localmente un QR cuyo payload sea únicamente el código de 6 dígitos.
- Mostrar una tarjeta vertical inspirada en la referencia con QR, `Kiosco Kronos`, nombre completo del atleta, código legible y `https://kronos-training.com/`.
- Descargar la credencial como PNG y conservar copia/WhatsApp manual sólo para el código persistido.
- Añadir lectura de QR en la etapa de identificación de Kiosco y conservar la entrada manual.
- Mantener reglas Firebase, esquema, permisos y códigos existentes sin migración.

### No incluye

- Códigos deterministas basados en teléfono, nacimiento u otra PII.
- Cambiar la longitud o formato persistido `^\d{6}$`.
- Usar una API externa para generar, almacenar o decodificar el QR.
- Guardar imágenes QR en Firebase o crear nuevas categorías de datos.
- Enviar automáticamente imágenes o mensajes por WhatsApp.
- Convertir el código en contraseña, segundo factor o autenticación fuerte.
- Cambiar productos, inventario, ventas, pagos o confirmar una venta real durante QA.

## Random Code Contract

1. El código es un string que cumple `^\d{6}$`; los ceros iniciales son válidos y se conservan.
2. La fuente aleatoria es `crypto.getRandomValues`; no se permite `Math.random`.
3. Cada candidato se compara con los códigos de los demás atletas cargados y con los candidatos descartados en la sesión actual.
4. Una colisión provoca un nuevo intento automático hasta un máximo técnico acotado. Si no se obtiene un valor, se informa el error y no se modifica el código persistido.
5. La generación inicial no escribe hasta que el Admin confirma `Guardar código`.
6. La regeneración puede repetirse cuantas veces requiera el Admin. Cada acción produce un candidato nuevo y no altera Firebase hasta guardar.
7. Si el atleta ya tiene código, entrar al modo de regeneración requiere confirmar el mensaje: `La credencial anterior seguirá activa hasta guardar el nuevo código. Después dejará de funcionar.`
8. Cerrar o cancelar el diálogo, o recibir un error de persistencia, conserva el código anterior.
9. Tras un guardado exitoso, únicamente el nuevo código identifica al atleta; el QR y el código anteriores dejan de funcionar inmediatamente.

## QR and Credential Contract

- El payload QR contiene exclusivamente los 6 dígitos. No incluye nombre, teléfono, nacimiento, ID de Firebase, URL ni parámetros de seguimiento.
- La generación ocurre íntegramente en el navegador mediante `QRCodeWriter` de ZXing, cuya matriz permite probar y renderizar el mismo payload sin servicios externos.
- El QR usa módulos negros sobre fondo blanco, zona silenciosa mínima de cuatro módulos y no contiene logos, texto ni decoraciones superpuestas.
- La tarjeta exportada será PNG vertical de `1080 × 1920` px, con una previsualización responsive equivalente.
- La composición visual se inspira en la referencia sin reutilizar su marca:
  - fondo grafito/negro con textura visual sutil generada por CSS/SVG;
  - marco cálido naranja/madera y esquinas redondeadas;
  - QR centrado con contraste alto;
  - `Kiosco Kronos` en lugar de `DESIGN PROP`;
  - nombre completo del atleta en lugar de `YOUR SLOGAN NERE`, adaptado hasta dos líneas sin perder legibilidad;
  - código de 6 dígitos visible como alternativa accesible a la cámara;
  - `https://kronos-training.com/` como texto visible, sin convertirlo en payload QR.
- La imagen no se habilita para descarga o compartir mientras el código sea sólo un candidato pendiente.
- La vista previa HTML expone título, atleta y código como texto accesible; no depende de que un lector de pantalla interprete el bitmap o el QR.

## Interaction Contract

### Atletas

- La acción continúa disponible sólo para Admin.
- Sin código persistido: `Generar código` prepara un candidato y su vista previa pendiente.
- Con código persistido: se muestra la credencial vigente y `Regenerar código` solicita confirmación antes de preparar otro candidato.
- Una vez confirmado el modo de regeneración, el Admin puede solicitar otro candidato tantas veces como requiera antes de guardar.
- La interfaz diferencia claramente `Credencial vigente` y `Pendiente de guardar` mediante texto e icono, no sólo color.
- `Guardar código` activa el candidato. Si falla, la credencial vigente permanece intacta y el candidato puede reintentarse o descartarse.
- Descargar PNG, copiar mensaje y abrir WhatsApp están disponibles sólo para la credencial vigente.
- El mensaje explica que la imagen debe adjuntarse y enviarse manualmente; la aplicación no afirma haberla enviado.

### Kiosco

- En `Identifica tu compra` se añade `Escanear QR` y se conserva el campo manual de 6 dígitos.
- El lector de esta etapa acepta únicamente QR y valida que el resultado cumpla `^\d{6}$` antes de buscar al atleta.
- Un QR con URL, texto adicional, producto u otro formato se rechaza con un mensaje accionable sin avanzar.
- La cámara se activa sólo por acción explícita y puede cerrarse, liberando sus recursos.
- La falta o denegación de permiso de cámara mantiene disponible la captura manual.
- Después de identificar, la confirmación existente muestra al atleta antes de finalizar la compra.

## Threat Model and Security Boundaries

### Activos y fronteras

- Activos: identidad asociada a compras, código vigente y nombre visible en la credencial.
- Entradas no confiables: QR/código presentado en Kiosco y acciones del Admin sobre candidatos.
- Fronteras: `Atletas` → store/servicio → Firebase; cámara/campo manual de `Kiosco` → búsqueda de atleta → flujo de compra; navegador → archivo PNG local.

### Riesgos de abuso

| Riesgo | Impacto | Mitigación en esta fase |
|---|---|---|
| Fotografiar o reenviar la credencial | Alto | Regeneración ilimitada y revocación efectiva al guardar un código nuevo; advertencia de compartir sólo con el atleta |
| Adivinar uno de un millón de códigos | Alto | Aleatoriedad criptográfica, dispositivo autorizado y confirmación visible del atleta; se documenta que no es autenticación fuerte |
| Colisión entre atletas | Alto | Comparación de candidatos, reintentos acotados y bloqueo del guardado ante duplicado detectado |
| Descargar una credencial todavía no activa | Alto | Acciones de exportación/compartir deshabilitadas hasta persistencia exitosa |
| QR malicioso o de producto en identificación | Medio | Lector QR-only y allowlist estricta `^\d{6}$` antes de cualquier búsqueda |
| Filtrar PII mediante el payload | Medio | QR con sólo 6 dígitos; nombre visible únicamente en la tarjeta solicitada y sin almacenamiento remoto nuevo |
| Una regeneración falla y revoca el código anterior | Alto | Persistencia previa a cambio de estado local; el valor anterior se conserva ante cancelación/error |

Riesgo residual para aceptación: un código de 6 dígitos y su QR pueden copiarse o adivinarse y no son autenticación fuerte. La fase evita derivarlos de PII y permite revocarlos, pero un mecanismo con rate limiting verificable o segundo factor requeriría otra spec y posiblemente backend.

## Commands

Ejecutar desde `app/`:

```sh
npm run test:kiosk-code
npm run test:rules
npm run typecheck
npm run lint -- --no-fix
npm run build
npx playwright test --project=responsive-public --project=responsive --grep "credencial QR de quiosco"
```

`test:rules` es una regresión y requiere Java 21; no se prevé modificar `database.rules.json`. Chrome sigue siendo el gate runtime obligatorio y Playwright sólo complementa responsive/regresión.

## Project Structure

```text
app/src/utils/kiosk-code.ts                       → generación aleatoria, unicidad y estados de reemplazo
app/tests/kiosk-code.test.ts                      → aleatoriedad inyectable, colisiones, cancelación y regeneración
app/src/components/kronos/KioskCredentialCard.vue → tarjeta accesible, QR local, vista previa y PNG
app/src/components/kronos/KioskCredentialDialog.vue → confirmación, candidatos y acciones de la credencial
app/src/components/kronos/BarcodeScanner.vue      → modo QR-only y mensajes reutilizables sin regresión de productos
app/src/pages/atletas.vue                         → diálogo Admin, confirmación, persistencia y acciones manuales
app/src/pages/kiosco.vue                          → escaneo QR y fallback manual en identificación
app/e2e/responsive/kiosk-credential-responsive.spec.ts → matriz responsive y estados de credencial/Kiosco
app/package.json                                  → script enfocado sin dependencias nuevas
Docs/implementation-reports/                      → reporte final de impacto y evidencia
```

La lista identifica archivos probables; después de aprobar la spec se dividirán en tareas de máximo aproximado de cinco archivos. No se prevén cambios en reglas, esquema, stores financieros ni dependencias.

## Code Style

La generación debe ser pura respecto de la aplicación e inyectar la fuente aleatoria para poder probar colisiones y ceros iniciales:

```ts
export function generateKioskCode(
  occupiedCodes: ReadonlySet<string>,
  randomUint32: () => number,
): { ok: true; code: string } | { ok: false; reason: 'generation-exhausted' } {
  // Generar exactamente 6 dígitos, preservar ceros y acotar reintentos.
}
```

El componente de tarjeta recibe datos presentacionales (`athleteName`, `code`, `status`) y no accede directamente a Pinia o Firebase. Usar nombres de código en inglés, mensajes visibles en español y tokens visuales del tema Kronos.

## Testing Strategy

### Pruebas enfocadas RED/GREEN

- Generar exactamente 6 dígitos y preservar valores como `000042`.
- Demostrar uso de una fuente inyectada compatible con `crypto.getRandomValues`, sin `Math.random`.
- Reintentar colisiones y fallar de forma acotada sin payload de actualización.
- Excluir códigos de otros atletas y el candidato anterior al regenerar varias veces.
- Conservar el código persistido al cancelar, cerrar o simular un error de guardado.
- Activar el código nuevo sólo después de persistencia exitosa e invalidar el anterior en la búsqueda.
- Verificar que cada regeneración permitida produce un candidato nuevo sin límite funcional de uso para Admin.
- Verificar que el payload QR es exactamente el código, sin nombre, URL u otra PII.
- Verificar textos de tarjeta: `Kiosco Kronos`, nombre, código y `https://kronos-training.com/`.
- Generar un PNG de `1080 × 1920` y decodificar su QR en prueba para recuperar los mismos 6 dígitos.

### Integración y regresión

- Mantener `^\d{6}$` en Firebase y ejecutar la suite completa con Java 21.
- Verificar que el modo QR-only no altera el escaneo multiformato de productos.
- Rechazar QR con URL/texto y aceptar entrada manual o QR con seis dígitos.
- Confirmar que copiar/WhatsApp/PNG usan sólo el valor persistido.
- Confirmar liberación de cámara al cerrar, cambiar de paso o desmontar el componente.

### Playwright complementario

- Ejecutar `320`, `768`, `1024` y `1440` px.
- Comprobar vista previa vigente/pendiente, confirmación de regeneración, acciones deshabilitadas y ausencia de overflow.
- Comprobar que nombre largo se adapta hasta dos líneas y QR conserva tamaño/contraste.
- Comprobar entrada manual, apertura/cierre del lector y fallback de permiso denegado en Kiosco.
- No automatizar credenciales, confirmar compras ni declarar la fase completa sólo con Playwright.

### QA web obligatorio en Chrome

Usar exclusivamente `https://kronos-training-fd5e5.web.app/` y la sesión iniciada manualmente. Tras autorización separada de publicación:

1. Crear o reutilizar el atleta sintético persistente definido en el capability map.
2. Generar y guardar una credencial; descargar el PNG y comprobar visualmente QR, `Kiosco Kronos`, nombre, código y URL.
3. Abrir Kiosco, agregar un producto al carrito sin confirmar la venta, escanear el QR desde una segunda pantalla/impresión y confirmar que identifica al atleta correcto.
4. Repetir con entrada manual para validar el fallback.
5. Regenerar varias veces antes de guardar; confirmar que la credencial vigente continúa disponible.
6. Guardar el nuevo código y verificar que el anterior falla y el nuevo funciona, sin completar una venta.
7. Revisar consola, red, DOM/accesibilidad, cámara y responsive. El atleta QA permanece para futuras validaciones.

No se inspeccionarán credenciales, cookies, tokens ni almacenamiento de autenticación. Si no hay cámara o segunda pantalla disponible, la decodificación del PNG debe demostrarse automáticamente y la limitación manual quedar explícita en el reporte; no se confirmará una venta para compensarla.

## Boundaries

### Always

- Trabajar en `app/`; `AppKronos/` permanece como referencia histórica.
- Usar `crypto.getRandomValues` y conservar exactamente 6 dígitos.
- Generar y decodificar QR localmente con ZXing existente; no enviar el código a terceros.
- Exigir confirmación antes de reemplazar una credencial vigente.
- Permitir regenerar tantas veces como requiera Admin sin revocar hasta guardar.
- Conservar el código anterior ante cancelación, cierre, colisión o fallo de persistencia.
- Mantener entrada manual, accesibilidad de la vista previa y QR escaneable de alto contraste.
- Reutilizar el atleta QA persistente antes de crear otro y validar el flujo completo en Chrome.

### Ask first

- Autorizar esta spec antes de implementar.
- Publicar Hosting en la instancia existente.
- Añadir dependencias, cambiar formato/longitud, reglas, esquema, autenticación o permisos.
- Codificar una URL/PII dentro del QR o almacenar las imágenes remotamente.
- Crear datos QA distintos del atleta persistente o confirmar una venta real.

### Never

- Derivar el código de teléfono, nacimiento u otra PII.
- Usar `Math.random`, servicios QR externos o telemetría con código/nombre.
- Descargar o compartir una credencial pendiente de guardar.
- Revocar el código vigente antes de confirmar una persistencia exitosa.
- Presentar el código o QR como autenticación fuerte.
- Automatizar credenciales o debilitar seguridad para facilitar QA.
- Modificar `AppKronos/kronos.html` como sustituto de la aplicación Vue.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| QR poco legible por decoración | Alto | QR negro/blanco, quiet zone de cuatro módulos y ninguna superposición |
| La imagen muestra el nombre del atleta | Medio | Uso explícito solicitado, descarga local/manual y sin persistencia remota nueva |
| La credencial anterior sigue circulando | Alto | Mensaje claro y revocación inmediata después de guardar la regeneración |
| El Admin pierde el código vigente por error | Alto | Modelo candidato → confirmar → persistir → activar; rollback al valor anterior |
| Colisión o agotamiento de reintentos | Medio | Set de ocupados, reintentos acotados y error sin escritura |
| Scanner de QR rompe productos | Alto | Modo QR-only configurable y regresión del modo multiformato existente |
| Cámara no disponible | Medio | Entrada manual siempre visible y error accionable |
| El QR se usa como supuesta autenticación | Alto | Lenguaje de identificador operativo y riesgo residual documentado |

## Success Criteria

- [x] La spec recibe autorización explícita antes de modificar comportamiento o tareas de implementación.
- [x] Todos los códigos nuevos conservan `^\d{6}$`, la generación usa `crypto.getRandomValues` y las reglas mantienen el formato de códigos existentes.
- [x] Admin puede generar y regenerar candidatos cuantas veces requiera.
- [x] El código anterior permanece activo hasta guardar y sólo se sustituye después de una persistencia exitosa.
- [x] Cancelación, colisión o fallo conserva íntegramente la credencial vigente.
- [x] El QR contiene sólo los 6 dígitos, su matriz se decodifica automáticamente y la credencial vigente fue leída por Kiosco en Chrome.
- [x] La tarjeta muestra `Kiosco Kronos`, nombre del atleta, código visible y `https://kronos-training.com/` con diseño validado visualmente en Chrome.
- [x] El PNG es vertical `1080 × 1920`, accesible desde una vista previa responsive y sólo descargable cuando está vigente.
- [x] Kiosco integra QR-only y entrada manual, rechaza el código revocado, identifica el vigente y libera la cámara al cerrar.
- [x] No cambian reglas, esquema, permisos, autenticación, datos financieros ni dependencias.
- [x] Pasan pruebas enfocadas, reglas con Java 21, typecheck, lint enfocado y build; la deuda previa del lint global queda documentada.
- [x] Chrome pasa `320/768/1024/1440` y valida generación, descarga, regeneración y lectura sin confirmar una venta; Playwright descubre los cuatro casos pero se omite por la restricción aprobada de dispositivo único.
- [x] El reporte final incluye árbol de archivos, flujos afectados/no afectados, diagrama, evidencia visual y riesgos residuales.

## Open Questions

No quedan preguntas funcionales abiertas.

## Authorization Gate

El usuario autorizó implementar esta versión el 2026-08-26 y posteriormente autorizó publicar sólo Hosting en `kronos-training-fd5e5`. El despliegue y el QA Chrome concluyeron sin publicar reglas Firebase ni confirmar una venta.
