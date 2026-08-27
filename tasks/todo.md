# Task List: Adopción de SDD en Kronos

## Mantenimiento técnico

- [x] Declarar npm y `app/package-lock.json` como fuente autoritativa.
- [x] Corregir las vulnerabilidades alcanzables sin aplicar `npm audit fix --force`; producción queda en cero y el tooling conserva 5 moderadas documentadas.
- [x] Instalar/habilitar JDK 21 para el emulador de reglas.
- [x] Ejecutar `npm run test:rules` con Java 21 y documentar el resultado (26/26).

## Roadmap funcional aprobado para planificación

- [x] Revisar y autorizar `specs/SPEC-athlete-form-tabs.md` antes de implementar Fase B.
- [x] Revisar y autorizar `specs/SPEC-quality-gates.md` antes de integrar Playwright.
- [x] Fase B: dividir el formulario de atleta en pestañas.
- [x] Fase C: generar ficha de inscripción reutilizando el diseño de recibos.
- [x] Revisar y autorizar `specs/SPEC-kiosk-code.md` antes de implementar Fase D.
- [x] Fase D: mantener el código aleatorio y añadir credencial QR regenerable para Kiosco.
- [ ] Fase E: implementar notificaciones de pagos con WhatsApp Business.
- [ ] Fase F: evaluar notificaciones push como alternativa.

## Foundation

- [x] Revisar y aprobar el capability map.
- [x] Elegir la fuente de verdad para las skills.
- [x] Configurar el flujo de QA con Chrome DevTools MCP.
- [x] Documentar como regla global la validación del flujo completo afectado en Chrome.
- [x] Documentar Playwright como complemento de responsive, no como sustituto de Chrome o `frontend-ui-engineering`.

## Pilot

- [x] Elegir el primer flujo vertical: alta y edición de atletas.
- [x] Crear `specs/SPEC-athletes-payments.md`.
- [x] Descomponer la spec en tareas ejecutables.
- [x] Aprobar la spec del piloto.
- [x] Confirmar el modelo de acceso y privacidad para datos de salud: nodo `athleteIntake` separado y permisos `athletesIntake`/`athletesIntakeManage` con mínimo privilegio.
- [x] Implementar el modelo backward-compatible y validación determinista.
- [x] Añadir pruebas enfocadas de contacto de emergencia y cuestionario de salud.
- [x] Integrar errores por campo y estados de formulario.
- [x] Integrar secciones accesibles y campos condicionales.
- [x] Mejorar estados de carga, error y resultados vacíos.
- [x] Implementar la primera tarea sin mezclar módulos.
- [x] Ejecutar pruebas de reglas con Java 21; typecheck, lint, build, pruebas enfocadas y QA Chrome de producción ya pasan.
- [x] Entregar el reporte de impacto.

## Checkpoint: Foundation

- [x] Las reglas del agente están documentadas.
- [x] El mapa de capacidades está aprobado.
- [x] Los fallos previos del entorno están separados de los fallos nuevos.

## Checkpoint: Pilot

- [x] La rebanada funciona de extremo a extremo.
- [x] La spec coincide con el comportamiento implementado.
- [x] El reporte identifica archivos y flujos afectados.

## Checkpoint: Antes de Fase B

- [x] Las specs propuestas están disponibles para revisión.
- [x] El usuario autoriza `specs/SPEC-athlete-form-tabs.md`.
- [x] El usuario autoriza `specs/SPEC-quality-gates.md` y la dependencia `@playwright/test`.
- [x] Se define autenticación manual local y no versionada para pruebas Playwright protegidas; no se automatizan credenciales ni escrituras.

## Fase B: Formulario por pestañas

- [x] B1 — Integrar Playwright Test, Chromium, ignores y configuración responsive segura.
  - Aceptación: cuatro viewports configurados; producción no es el destino predeterminado; estado autenticado excluido de Git.
  - Verificación: `npx playwright test --project=responsive-public` y auditoría npm.
- [x] B2 — Probar y añadir el contrato de errores por pestaña.
  - Aceptación: conteos y primer error siguen el orden Personal → Membresía → Admisión.
  - Verificación: `npm run test:athlete-intake` con evidencia RED/GREEN.
- [x] B3 — Implementar tabs accesibles en alta/edición.
  - Aceptación: no se pierden datos, el primer tab inválido se activa/enfoca y permisos/carga se conservan.
  - Verificación: test enfocado, typecheck, lint y build.
- [x] B4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Playwright pasa a 320/768/1024/1440 y Chrome valida alta/edición completa sin errores nuevos.
  - Verificación: Playwright, Chrome DevTools y reporte de impacto.

## Checkpoint: Fase B

- [x] B1–B3 pasan pruebas automatizadas, typecheck y build.
- [x] B4 completa Playwright y Chrome con login manual autorizado.
- [x] Reporte, commits y push quedan sincronizados en `develop` y `main`.

## Fase C: Ficha de inscripción

- [x] C0 — Revisar y autorizar `specs/SPEC-enrollment-sheet.md`.
  - Aceptación: fecha recurrente, contacto de emergencia, permisos, privacidad y QA quedan definidos.
  - Verificación: spec en estado `aprobada para implementación`.
- [x] C1 — Probar y construir el contrato puro de ficha.
  - Aceptación: mapea atleta, día recurrente y sólo la proyección del contacto; datos ausentes muestran `Sin capturar` y no entra historial/salud.
  - Verificación: prueba RED/GREEN con `npm run test:enrollment-sheet`.
  - Dependencias: C0.
  - Archivos probables: `app/tests/enrollment-sheet.test.ts`, `app/src/utils/enrollment-sheet.ts`, `app/package.json`.
- [x] C2 — Reutilizar el lenguaje visual de recibos y generar el PDF.
  - Aceptación: PDF A5 con header Kronos, folio estable, descarga/impresión/WhatsApp manual y recibos sin regresión.
  - Verificación: prueba enfocada de ambos documentos, typecheck y build.
  - Dependencias: C1.
  - Archivos probables: `app/src/utils/kronos-pdf.ts`, `app/src/utils/receipts.ts`, `app/src/utils/enrollment-sheet.ts`, `app/tests/enrollment-sheet.test.ts`.
- [x] C3 — Integrar vista previa accesible en `Atletas`.
  - Aceptación: acción visible con lectura de admisión, estados de carga/error/datos ausentes y datos sensibles limitados al contacto solicitado.
  - Verificación: test enfocado, lint, typecheck y revisión de teclado/DOM.
  - Dependencias: C2.
  - Archivos probables: `app/src/components/kronos/EnrollmentSheetDialog.vue`, `app/src/pages/atletas.vue`.
- [x] C4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Playwright pasa a `320/768/1024/1440`; Chrome valida vista previa, PDF, impresión y WhatsApp sin envío ni errores nuevos.
  - Verificación: Playwright, Chrome DevTools y reporte de impacto.
  - Dependencias: C3.
  - Archivos probables: `app/e2e/responsive/enrollment-sheet-responsive.spec.ts`, `Docs/implementation-reports/2026-08-26-enrollment-sheet.md`.

## Checkpoint: Fase C

- [x] C1–C3 pasan pruebas automatizadas, lint, typecheck y build.
- [x] C4 completa Playwright y Chrome con login manual autorizado.
- [x] La spec coincide con el comportamiento y el reporte documenta privacidad, archivos, flujos y riesgos.

## Fase D: Código aleatorio y credencial QR

- [x] D1 — Probar y extraer el contrato de código aleatorio y QR.
  - Aceptación: genera exactamente 6 dígitos con fuente criptográfica, reintenta colisiones de forma acotada y el QR decodifica el mismo código sin PII.
  - Verificación: evidencia RED/GREEN con `npm run test:kiosk-code`.
  - Dependencias: spec aprobada.
  - Archivos probables: `app/tests/kiosk-code.test.ts`, `app/src/utils/kiosk-code.ts`, `app/package.json`.
- [x] D2 — Integrar credencial visual y regeneración ilimitada en Atletas.
  - Aceptación: tarjeta PNG con textos autorizados; candidato pendiente no se comparte; el código anterior permanece hasta guardar exitosamente.
  - Verificación: prueba enfocada, typecheck y revisión de accesibilidad/DOM.
  - Dependencias: D1.
  - Archivos probables: `app/src/components/kronos/KioskCredentialCard.vue`, `app/src/components/kronos/KioskCredentialDialog.vue`, `app/src/pages/atletas.vue`, `app/components.d.ts`.
- [x] D3 — Integrar lectura QR segura en Kiosco.
  - Aceptación: lector QR-only acepta seis dígitos, rechaza otros payloads, libera la cámara y conserva captura manual/productos.
  - Verificación: prueba enfocada, typecheck, lint y build.
  - Dependencias: D2.
  - Archivos probables: `app/src/components/kronos/BarcodeScanner.vue`, `app/src/pages/kiosco.vue`, `app/tests/kiosk-code.test.ts`.
- [x] D4 — Ejecutar QA responsive y flujo completo afectado.
  - Aceptación: Chrome pasa en `320/768/1024/1440`; valida PNG, regeneración, código anterior/nuevo, QR y fallback sin completar venta. Playwright se descubre y omite por la restricción aprobada de dispositivo único.
  - Verificación: Chrome en producción, cobertura Playwright descubierta y reporte de impacto.
  - Dependencias: D3 y autorización separada de despliegue para validar la versión publicada.
  - Archivos probables: `app/e2e/responsive/kiosk-credential-responsive.spec.ts`, `app/playwright.config.ts`, `Docs/implementation-reports/2026-08-26-kiosk-credential.md`.

## Checkpoint: Fase D

- [x] D1–D3 pasan pruebas automatizadas, reglas, lint enfocado, typecheck y build; el lint global conserva deuda previa documentada en el reporte.
- [x] D4 completa Chrome en la instancia autorizada y documenta la omisión de Playwright por seguridad de dispositivo.
- [x] La spec coincide con el comportamiento y el reporte documenta seguridad, archivos, flujos y riesgos residuales.

## Mejora Punto de Venta y Kiosco

- [x] PK0 — Autorizar la spec, registrar el plan y modelar amenazas.
  - Aceptación: alcance cerrado, Coach sin permisos implícitos, política fail-closed y despliegue/escrituras reales fuera de la autorización local.
  - Verificación: `specs/SPEC-store-kiosk-improvements.md` aprobada y plan actualizado.
  - Dependencias: Fase D.
  - Archivos: spec, `tasks/plan.md`, `tasks/todo.md`.
- [x] PK1 — Probar e implementar contratos puros de acceso, catálogo, ganancia y política.
  - Aceptación: Coach no es Admin y empieza vacío; sólo stock activo mayor a cero se ofrece; ganancia usa snapshots y excluye canceladas; política inválida niega acceso.
  - Verificación: prueba RED/GREEN enfocada.
  - Dependencias: PK0.
  - Archivos probables: `app/tests/store-kiosk-improvements.test.ts`, `app/src/types/access.ts`, `app/src/types/domain.ts`, `app/src/utils/store-kiosk.ts`, `app/package.json`.
- [ ] PK2 — Integrar Coach y configuración de Kiosco para Admin.
  - Aceptación: se puede guardar Coach sin permisos; Admin asigna permisos después; configuración valida modos y sólo UIDs de Admin habilitados.
  - Verificación: pruebas de reglas y flujo de formulario sin escribir datos reales.
  - Dependencias: PK1.
  - Archivos probables: `app/src/pages/usuarios.vue`, servicio/store de configuración, `app/database.rules.json`, pruebas de reglas.
- [ ] PK3 — Corregir y completar Punto de Venta.
  - Aceptación: `Cobro` permanece visible y reiniciado al vaciar carrito; selector omite stock cero; Admin ve ganancia bruta de toda venta no cancelada.
  - Verificación: prueba enfocada, DOM/responsive y consola limpia.
  - Dependencias: PK1.
  - Archivos probables: `app/src/pages/tienda.vue`, utilidad y prueba enfocada.
- [ ] PK4 — Actualizar identificación y cierre del Kiosco.
  - Aceptación: QR inicia al continuar, código manual es secundario, `Pagar ahora` respeta la política tras verificar Admin y éxito vuelve al inicio en 5 segundos.
  - Verificación: prueba enfocada, flujo local y liberación de cámara.
  - Dependencias: PK1 y PK2.
  - Archivos probables: `app/src/pages/kiosco.vue`, store/utilidad de política y prueba enfocada.
- [ ] PK5 — Ejecutar gates y entregar evidencia.
  - Aceptación: reglas, pruebas, typecheck, lint enfocado y build pasan; Chrome cubre el flujo publicado cuando se autorice despliegue; reporte incluye árbol, diagrama, flujos y riesgos.
  - Verificación: comandos del repositorio, revisión de cinco ejes y reporte de impacto.
  - Dependencias: PK2–PK4.
  - Archivos probables: `app/e2e/responsive/store-kiosk-improvements.spec.ts`, `Docs/implementation-reports/`.

## Checkpoint: Mejora Punto de Venta y Kiosco

- [ ] PK1–PK4 cumplen los 13 criterios de aceptación sin dependencias nuevas.
- [ ] Reglas y controles de cliente niegan por defecto configuraciones ausentes o inválidas.
- [ ] PK5 documenta QA ejecutado y cualquier validación publicada pendiente de autorización.
