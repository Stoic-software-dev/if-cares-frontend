# IF Cares Regular Year 2.0 — Ruta de trabajo

> Orden de ejecución sobre las cards STOIC-2196..2207. Detalle técnico en **SPECS.md**.
> Estrategia: la app vieja (GAS + Sheets) opera en prod hasta un **único cutover al final**.
> Sin dual-write. Actualizado: 2026-08-28.
>
> Los ítems marcados **[S]** vienen del relevamiento de paridad con la app **Summer**
> (`if-cares-summer-frontend`, 28-ago-2026): funcionalidad que Summer ya tiene resuelta
> y que el Regular Year no tenía construida ni planificada, o que el plan mencionaba en
> una línea sin el detalle que Summer ya probó en producción. Inventario completo,
> equivalencias y lo que se descartó por ser propio del dominio Summer: **SPECS.md §11**.

## Etapa 0 — Ya hecho (branch `v2-backend`, jul-2026)

- [x] Schema Prisma completo + 2 migraciones versionadas (grueso de STOIC-2196).
- [x] Auth custom con shape legacy, bcrypt, cookie deslizante 8 h (grueso de STOIC-2197).
- [x] 18 rutas API con paridad legacy + mapeo de los 14 call sites (`docs/V2-BACKEND.md`).
- [x] Pipeline idempotente: `db:import`, `import-master` (users con sus passwords),
      `import-history` + export GAS, `db:parity` todo PASS (grueso de STOIC-2198).
- [x] Data real importada: 2.922 alumnos, 56 sitios, 566 service days.
- [x] Stack UI decidido: Tailwind + shadcn/ui, solo librerías headless (STOIC-2202).

## Etapa 1 — Desbloqueos inmediatos (en paralelo, esta semana)

- [ ] **Pushear `v2-backend`** (4 commits solo locales — riesgo de pérdida).
- [ ] **Crear proyecto Supabase** (runbook `docs/SUPABASE-SETUP.md`, ~15 min) →
      `migrate deploy`, seed, import completo. **Configurar backups ese mismo día.**
- [ ] Pegar `gas-backup/migration-export.gs` en Apps Script + `MIGRATION_EXPORT_KEY`
      + redeploy → correr `import-history` con data real de punta a punta.
- [ ] STOIC-2202: cerrar tokens + componentes base y **aprobación de las 5 pantallas
      clave con IF Cares** (dependencia externa más riesgosa — perseguirla).
- [ ] Decidir proveedor de **email** y **storage** de archivos (bloquean 2197/2199/2203/2204/2205).
- [ ] Mandar a IF Cares el listado de anomalías (19 alumnos, "ZZ ", emails duplicados,
      hojas "Copy of…") para que decidan caso por caso (cierre de STOIC-2196).
- [ ] Actualizar el timeline con el cliente: el artifact aún dice cutover en agosto;
      las cards lo ponen al final. Acordar fecha tentativa de corte.
- [ ] **[S] Definir con IF Cares si el 2.0 incorpora aprobación de counts** (Summer la
      tiene: el admin aprueba cada count, queda quién/cuándo, se bloquea la edición y
      salen PDF + mail al sitio). **No está en los requerimientos del Regular Year** y
      agrega un paso operativo diario por sitio → decidir **antes** de cerrar el schema
      de `MealCount` (toca counts, correcciones, PDFs y reportes).
- [ ] **[S] Confirmar si el formulario en papel del Regular Year lleva datos del sitio**
      (dirección / teléfono / supervisor). Summer los guarda por sitio y los imprime en
      el PDF; hoy el modelo `Site` no tiene esos campos. Bloquea 2200 y 2203.

## Etapa 2 — Cerrar la base (STOIC-2196 / 2197 / 2198)

- [ ] Deltas de schema pendientes: correcciones versionadas, firmas (storage),
      reportes generados, config de notificaciones, horarios por meal type.
- [ ] **[S] Deltas de schema de paridad Summer** (detalle en SPECS.md §4 y §11):
      - `Holiday` con nombre + rango de fechas + alcance (todos los sitios / selección)
        + alcance por comida — hoy solo existe `ServiceDay` suelto por fecha.
      - Plantilla semanal por sitio (qué comidas se sirven cada día de la semana) +
        `programStart` / `programEnd`, para **generar** el calendario en vez de cargarlo día a día.
      - Datos de contacto del sitio (`address`, `telephone`, `supervisor`) — condicionado
        a la confirmación de Etapa 1.
      - Anulación de un count: `voidedAt` / `voidedById` / `voidReason` (baja lógica; sale
        de dashboard y reportes, la historia no se borra).
      - Respuesta al request: `responseComment` + `respondedBy/At` (hoy solo hay estado).
      - Aprobación de counts (`approvalStatus`, `approvedAt`, `approvedById`) — **solo si
        IF Cares la confirma** en Etapa 1.
- [ ] STOIC-2197 restante: reset de password self-service **por email**, expiración
      de sesión por inactividad configurable, bloqueo de usuarios desactivados.
- [ ] STOIC-2198 restante: reporte de reconciliación formal (sitio × mes, Sheets vs
      base) + refresco programado de la copia para desarrollo.

## Etapa 3 — Camino crítico de UI (STOIC-2199)

- [ ] Meal count diario contra la base: roster por sitio/fecha, asistencia + meal types,
      horarios, firma + certificación, bloqueo post-submit y en días no operativos.
      Lógica **idéntica** al flujo actual; construcción con componentes de 2202.
- [ ] Dashboard mensual: mes × sitio en una pantalla, estado por color de cada día
      (submiteado / faltante / hoy / feriado / no operativo), click → count o formulario.
- [x] Mantener descargas de menú (ahora por Drive REST API con service account; el GAS solo
      actúa como fallback mientras falten las credenciales).
- [ ] Verificar ≤ 1 s en carga y submit.
- [ ] **[S] Guardia de cambios sin guardar** en el formulario: aviso antes de cerrar la
      pestaña (`beforeunload`) **y** al navegar dentro de la app (links del navbar). Sin
      esto, un roster de 250 alumnos marcado a mano se pierde con un toque al menú.
- [ ] **[S] Bloqueos en el cliente, no recién en el submit**: fecha futura, feriado, día
      no operativo y count ya enviado se avisan con mensaje claro al entrar al form
      (hoy el server devuelve 422/409 y el staff se entera después de cargar todo).
- [ ] **[S] Calendario: distinguir "feriado" de "sin servicio"** (estado propio + nombre
      del feriado en la celda). Hoy todo lo no operativo se pinta igual.
- [ ] **[S] Filtros del dashboard**: por estado (submitted / missing / upcoming) y
      selector libre de mes y año, además de las flechas de mes.
- [ ] **[S] UX del form**: indicador de pasos, scroll automático al primer campo que
      falta y prefetch/caché de meses adyacentes y del roster (ayuda al objetivo ≤ 1 s).
- Sugerencia: partir la card en dos entregables (carga diaria / dashboard).

## Etapa 4 — Admin (STOIC-2200 / 2201)

- [ ] Usuarios: alta/edición/desactivación, roles, multi-sitio, reset, búsqueda + filtros.
- [ ] Sitios: alta con formulario único (comidas, días de semana, fechas de programa),
      edición, desactivación; importación de roster con validación fila a fila.
- [ ] **[S] Pantallas de sitios como las de Summer** (`dashboard/sites` + `dashboard/site/[siteName]`):
      listado con buscador y toggle "mostrar inactivos" + contador de activos; ficha en
      modo lectura/edición con confirmación al cambiar el nombre (el nombre es la
      identidad que matchea `assignedSite` y los counts → el rename tiene que propagar);
      desactivar desde la ficha. Campos de contacto del sitio si Etapa 1 los confirma.
- [ ] Calendarios: días operativos/no operativos por sitio, comidas por día,
      feriado en todos los sitios en una acción (y quitar en uno solo).
- [ ] **[S] Holidays Manager completo** (blueprint: `components/holidayPicker/HolidayPicker.jsx`
      de Summer): feriado con **nombre + rango de fechas**, alcance "todos los sitios" o
      selección múltiple, "todas las comidas" o comidas específicas, detección de
      duplicados, edición y borrado respetando el alcance, tabs próximos/pasados con
      paginación. Regla dura: **un cambio de calendario nunca toca un día que ya tiene
      count** (el `PUT /api/sites/service-days` actual ya lo respeta — mantenerlo).
- [ ] **[S] Generador de calendario por sitio**: a partir de días de la semana + comidas
      por día + fechas de inicio/fin del programa se crean los `ServiceDay`, en vez de
      cargarlos uno por uno. Es lo que hace la tab `Meal Schedules` de Summer y lo que
      pide el requerimiento 3.5.
- [ ] Correcciones de counts: solo Admin, valor original intacto, quién/cuándo/antes,
      marca visible de "corregido"; reportes toman el valor corregido.
- [ ] **[S] Anular un count** (solo Admin, con modal de confirmación y motivo): hoy un
      count cargado en el sitio o la fecha equivocada no tiene salida — corregirlo no
      alcanza. Baja lógica + auditoría; el día vuelve a "faltante" y sale de los reportes.
- [ ] **[S] Aprobación de counts** — *solo si IF Cares la confirmó en Etapa 1*: acción de
      aprobar por count, badge visible en calendario y detalle, bloqueo de edición al
      aprobar (la anulación sigue disponible), y PDF + mail al staff del sitio como
      follow-up asíncrono (Summer: `appscript/post/approveMealCount.gs`).

## Etapa 5 — PDFs y consolidación (STOIC-2203 / 2204)

*(Puede solaparse con Etapa 4 si se suma otra persona; si no, va después.
2204 requiere las correcciones de 2201.)*

- [ ] Spike motor de PDF → réplica campo por campo del formulario en papel.
- [ ] PDF de count diario + PDF mensual por sitio (sin timeouts con roster completo).
- [ ] Envío por email desde la app.
- [ ] **[S] Diálogo de PDF con tres acciones** (Summer: `components/pdfModal/PdfModal.jsx`):
      **guardar** en storage · **enviar** por email a varios destinatarios (lista separada
      por comas, validada) · **guardar y enviar**. Con el link al archivo guardado en el
      resultado.
- [ ] Consolidados por mes × estado (TX/OK): los 2 reportes actuales, mismos totales,
      **sin tope de sitios**, paso de firma incluido, guardados y recuperables.
- [ ] **[S] Formulario del consolidado como el de Summer** (`ConsolidatedPdfModal.jsx`):
      estado + rango de fechas + **exclusión de sitios** con chips y atajos "excluir
      todos / incluir todos", validando que quede al menos un sitio.
- [ ] **[S] Jobs asíncronos con polling** para todo PDF largo (el consolidado de Summer
      tarda 1-3 min): el cliente genera el `jobId`, dispara, y consulta estado
      (`processing | completed | error`) con tiempo transcurrido y cancelación visible.
      Sin esto, el mensual y el consolidado mueren en el timeout del hosting.
- [ ] **[S] Página pública de firma del consolidado** (`/sign/[token]` → confirmación):
      preview del PDF + pad de firma + texto de certificación, **sin login** (link
      enviable a quien firma), y confirmación con el PDF ya firmado. Es el paso que hoy
      se hace a mano en la master spreadsheet (requerimiento 3.8). El token es opaco, de
      un solo uso y con vencimiento: no repetir el `/sign/<pdfId de Drive>` de Summer
      (ver SPECS.md §9).

## Etapa 6 — Requests y notificaciones (STOIC-2205)

- [ ] Inbox de requests con estados New / In Progress / Resolved + filtros combinados;
      mails a los destinatarios actuales.
- [ ] **[S] Responder el request, no solo cambiar el estado**: comentario del admin +
      email al solicitante al resolver/rechazar, con quién lo resolvió y cuándo (Summer:
      `dashboard/requests/page.jsx`). Hoy el staff ve el estado cambiar sin explicación.
- [ ] **[S] Inbox usable con volumen**: buscador que cruza todos los campos (sitio,
      solicitante, tipo, fechas, detalle), contador por pestaña, paginación, y filtros
      por **sitio y fecha** además de estado (el requerimiento 3.9 los pide).
- [ ] Reminders diarios de counts atrasados: mismo contenido/horario que hoy;
      destinatarios, horario y on/off configurables desde Admin (sin deploy). Cron en la infra nueva.
- [x] Resolver el destino de los archivos: **Drive API desde el backend** para
      **todos los PDFs**, no solo los menús (`src/lib/google-drive.js` para leer y
      escribir, `src/lib/pdf-archive.js` para archivar lo generado). La oficina sigue
      publicando menús arrastrándolos a la misma carpeta, y los PDFs que genera la app
      se archivan en `<reportes>/<YYYY-MM>/`. Pendiente operativo: cargar
      `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `_PRIVATE_KEY` y compartir las dos carpetas con
      el service account. Ver `docs/DRIVE-STORAGE.md`.

## Transversal — [S] se construye junto con las etapas, no al final

- [ ] **Monitoreo de errores del cliente**: reportar toda excepción del front con app,
      función, mensaje, stack y URL a un servicio central + alerta. Summer lo tiene
      (`utils/logErrorMonitoring` → `/api/monitoring` → monitoring-center) y el v1
      alertaba por mail; el 2.0 hoy no tiene **nada**. Incluye arreglar el import roto
      de `logErrorMonitoring` que quedó en la pantalla de login del v1.
- [ ] **Patrón de listados admin**: buscador + toggle de inactivos + contadores +
      paginación en todas las pantallas de administración (usuarios ya lo tiene; sitios,
      feriados, requests y reportes deben seguir el mismo patrón).
- [ ] **Confirmación explícita en acciones destructivas** (anular count, borrar feriado,
      desactivar sitio/usuario): modal con estados confirmar → procesando → resultado,
      y el aviso de qué se lleva puesto la acción.

## Etapa 7 — Testing con staff real (STOIC-2206)

- [ ] Staging público con copia fresca de data real.
- [ ] Guion de prueba completo (login, count completo, día no operativo, corrección,
      PDFs, consolidación, alta de sitio) con staff y admins reales en **sus** dispositivos.
- [ ] Medir tiempos reales (incl. conexiones lentas); corregir bloqueantes y alto impacto.

## Etapa 8 — Cutover (STOIC-2207)

- [ ] Plan de corte acordado con IF Cares: fecha/hora (fin de semana o día no operativo),
      counts en vuelo, comunicación a los sitios, **rollback por escrito**.
- [ ] Ejecutar: bloquear escrituras en la app vieja, Sheets a solo lectura, apagar
      triggers (`updateAllMeals`, `sendReminderEmail`, `deleteOldDates`, `checkAndUpdate`),
      migración final, reconciliación validada por IF Cares, switch de usuarios.
- [ ] Post: smoke en prod (login legacy, count, dashboard, PDFs, consolidación,
      notificaciones), probar una restauración de backup, soporte activo el primer
      día de servicio, guía corta de administración para IF Cares.

## Dependencias externas (disparar temprano, todas tienen latencia)

- Aprobación de pantallas clave (2202) — bloquea todo el desarrollo de UI.
- Decisiones sobre anomalías de data (2196).
- Formato campo por campo del PDF en papel (2203).
- Grupo de staff para testing (2206) y fecha de corte (2207).
- **[S] ¿Va el flujo de aprobación de counts?** — bloquea el schema de `MealCount` (Etapa 2).
- **[S] ¿El PDF lleva datos de contacto del sitio?** — bloquea el schema de `Site` y el
  formulario de alta de sitios (Etapas 2 y 4).
- **[S] Destinatarios y textos de los mails** (aprobación si aplica, respuesta de
  requests, reminders, envío de PDFs): quién recibe cada uno hoy y qué debe decir.
- **[S] Nombres oficiales de los feriados del ciclo** para cargar el calendario del año
  de una sola vez en el Holidays Manager.
