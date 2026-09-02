# IF Cares Regular Year 2.0 — Ruta de trabajo

> Orden de ejecución sobre las cards STOIC-2196..2207. Detalle técnico en **SPECS.md**.
> Estrategia: la app vieja (GAS + Sheets) opera en prod hasta un **único cutover al final**.
> Sin dual-write. Actualizado: **2026-09-02**, sincronizado contra el código, el schema y
> la base de producción (varios ítems figuraban pendientes estando hechos).
>
> Leyenda: `[x]` construido y verificado · `[~]` parcial, con el detalle de qué falta ·
> `[ ]` sin construir. Los `[~]` y `[ ]` de las Etapas 2 a 6 están agrupados abajo en
> **Plan de ejecución**, en el orden en que se van a atacar.
>
> Los ítems marcados **[S]** vienen del relevamiento de paridad con la app **Summer**
> (`if-cares-summer-frontend`, 28-ago-2026): funcionalidad que Summer ya tiene resuelta
> y que el Regular Year no tenía construida ni planificada, o que el plan mencionaba en
> una línea sin el detalle que Summer ya probó en producción. Inventario completo,
> equivalencias y lo que se descartó por ser propio del dominio Summer: **SPECS.md §11**.

## Repaso contra las cards de Jira (2-sep)

Las 6 cards de IfCares que están en **Testing** se leyeron criterio por criterio contra el
código, no contra este archivo. Salieron **5 huecos reales** que ningún doc registraba:

| Card | Hueco | Estado |
|---|---|---|
| 2201 / 2203 | El count corregido solo se distinguía en el detalle. La card pide "a simple vista **en el dashboard**", y el PDF pide "la marca de corregido" | **Arreglado** (`9256f86`). El mensual además tenía `corrected` hardcodeado en `false` |
| 2200 | "Importar o cargar el roster" no existía: solo se podía agregar de a un alumno | **Arreglado** (`d41fdaa`), verificado 9/9 en producción |
| 2199 | "Se capturan los horarios de servicio **por meal type**" — hoy hay un solo `timeIn`/`timeOut` | **Cerrado como está, por decisión del 2-sep**: se mantiene un único submit con un `timeIn`/`timeOut`, y el alumno marca a qué comida asistió. Es como funciona la web original. Si más adelante hace falta separarlos, se revisa |
| 2203 | "Poder mandar por email **cualquier PDF** exportado" — solo el consolidado se podía mandar | **Arreglado** (`d305d34`), 6/6 verificado en producción con envíos reales |
| 2198 | "El log de registros rechazados revisado y cada caso con decisión de IF Cares" | **Log construido** (`57fd660`, `npm run db:anomalies`) y la carta actualizada contra la data viva. Falta solo la respuesta de IF Cares |

Lección para la próxima: este archivo describía un estado mucho más avanzado que el real en
unas cosas y mucho más atrasado en otras. **Las cards son la fuente de verdad**, no el
resumen de fases de acá abajo.

## Plan de ejecución — lo que falta, en orden de dificultad

De menor a mayor. Cada fase se testea antes de pasar a la siguiente.

| Fase | Qué entra | Estado |
|---|---|---|
| **A** | Anulación de counts y respuesta a requests. | **hecha** |
| **B** | Monitoreo de errores del cliente. | **hecha** |
| **C** | Alta y edición de sitios con generación de calendario. | **hecha** |
| **D** | Feriados con nombre, rango y alcance. | **hecha** |
| **E** | PDF mensual, consolidados, jobs asíncronos y firma pública. | **hecha**, menos el envío por email, que es de la fase F |
| **F** | Envío de mails y reminders diarios. | **construida**, operativa cuando exista la delegación de dominio |
| **G** | Huecos del Apps Script + aprobación de counts (31-ago). | **hecha** |

Las seis fases están **construidas y verificadas**. Después de la última se hizo un
recorrido exploratorio sobre el build de producción: las 12 pantallas responden 200,
contraste WCAG AA sin fallos en claro y en oscuro sobre todas las pantallas nuevas,
88 controles enfocables sin ninguno sin nombre accesible y sin `tabindex` positivo, y
**cero excepciones capturadas** por el monitor de errores durante todo el recorrido.
`npm run lint` limpio, `npm run build` compila, `npm run smoke` 26/26 y
`npm run drive:selftest` 25/25.

**Fase G (31-ago)**, de leer `gas-backup` entero contra el código:

- El **foundation id** volvió al consolidado. `getFoundationIdByState` se negaba a armar un
  claim sin él; estaba importado como `AppSetting foundationId.TX/.OK` desde julio y no lo
  leía nadie, así que todos los claims que generó el 2.0 salieron sin él.
- La **ventana de recordatorio por sitio** se respeta (25 de 64 sitios traen una del
  master). Un sitio sin ventana entra igual: el legacy lo salteaba, y una celda vacía es
  una forma demasiado silenciosa de apagar el aviso que evita que le pausen la entrega.
- La **hora del recordatorio** se aplica, resuelta en `APP_TIMEZONE`. Era un setting que se
  guardaba y nunca se comparaba con nada.
- Las **fallas del servidor llegan a una persona** (`ALERT_EMAILS`), que es lo que hacían
  `sendFailureAlert` y `sendPartialFailureAlert`.
- **Aprobación de counts** — ver Etapa 4.

**Al 2-sep**, después de reescribir `TEST.md` y correrlo entero (matriz de autorización
de 66 pares método+ruta, IDOR con ids reales, concurrencia, integraciones con evidencia
del otro lado del sistema y una pasada de integridad de datos), quedan **3 hallazgos
arreglados** —tres rutas que respondían 500 ante un body JSON `null`, y el alta de sitios
que no exigía el estado, que era la causa exacta del peor bug del proyecto— y **1 abierto**:
un React #185 en `/counts/[date]` sin reproducción. Detalle en `TEST-RESULTS.md`.

El **import histórico terminó** y está **reconciliado contra las planillas**: 56 sitios,
7.718 días, 368.996 filas, cero diferencias incluidos los totales por tipo de comida
(`npm run db:reconcile`).

Lo que quedó pendiente y **no depende de código**:

- El **servicio de cron** en Railway existe y está bien configurado, pero **no ejecuta**;
  ver Etapa 1.
- La **maquetación exacta** del formulario oficial del consolidado: el contenido está
  campo por campo, falta la plantilla o un PDF de muestra para calcarla.
- Las decisiones de IF Cares: datos de contacto del sitio, destinatarios y textos de los
  mails, nombres de los feriados del ciclo. **La aprobación de counts ya está decidida
  (va) y construida.**

Fuera de este plan quedan las Etapas 7 (testing con staff real) y 8 (cutover), que son
trabajo con el cliente.

## Etapa 0 — Ya hecho (branch `v2-backend`, jul-2026)

- [x] Schema Prisma completo + 2 migraciones versionadas (grueso de STOIC-2196).
- [x] Auth custom con shape legacy, bcrypt, cookie deslizante 8 h (grueso de STOIC-2197).
- [x] 18 rutas API con paridad legacy + mapeo de los 14 call sites (`docs/V2-BACKEND.md`).
- [x] Pipeline idempotente: `db:import`, `import-master` (users con sus passwords),
      `import-history` + export GAS, `db:parity` todo PASS (grueso de STOIC-2198).
- [x] Data real importada: 2.922 alumnos, 56 sitios, 566 service days.
- [x] Stack UI decidido: Tailwind + shadcn/ui, solo librerías headless (STOIC-2202).

## Etapa 1 — Desbloqueos inmediatos (en paralelo, esta semana)

- [x] **Pushear `v2-backend`** (18-ago).
- [x] **Crear proyecto Supabase**: `vcixfuaqxnkwihzbqetq`, schema `regular_year`, 12
      migraciones aplicadas y sin drift (verificado 31-ago). **Backups: pendiente.**
- [x] Pegar `gas-backup/migration-export.gs` en Apps Script + `MIGRATION_EXPORT_KEY`
      + redeploy → correr `import-history` con data real de punta a punta. **Corrido
      completo el 2-sep**: 56 sitios, 7.718 días, 368.996 filas de alumno, de ago-2024
      a sep-2026. Reconciliado contra las planillas con `npm run db:reconcile`: cero
      diferencias, incluidos los totales por tipo de comida.
- [ ] STOIC-2202: cerrar tokens + componentes base y **aprobación de las 5 pantallas
      clave con IF Cares** (dependencia externa más riesgosa — perseguirla).
- [x] Decidir proveedor de **email** y **storage** de archivos: **Gmail** del Workspace de
      ifcares.org y **Google Drive** vía service account (`docs/DRIVE-STORAGE.md`). Drive ya
      está funcionando; Gmail necesita la delegación de dominio para poder enviar.
- [ ] Mandar a IF Cares el listado de anomalías (19 alumnos, "ZZ ", emails duplicados,
      hojas "Copy of…") para que decidan caso por caso (cierre de STOIC-2196).
- [ ] Actualizar el timeline con el cliente: el artifact aún dice cutover en agosto;
      las cards lo ponen al final. Acordar fecha tentativa de corte.
- [~] **Servicio de cron** en Railway (`curlimages/curl`, `0 * * * *`) que postea a
      `/api/reminders`. **Creado el 2-sep** (`if-cares-reminders-cron`) con la imagen, el
      horario, el comando y las variables cargadas y verificadas por API. **No está
      ejecutando**: el contenedor no corre en ningún tick. La única vez que corrió fue con
      un comando mal armado (la imagen trae `ENTRYPOINT ["curl"]` y Railway agrega el start
      command como argumentos, así que quedaba `curl curl …`); eso ya está corregido, pero
      desde entonces no se ejecutó más. Falta mirar el dashboard, que muestra estado que la
      API no expone.
      Mientras tanto la app ya delata el problema sola: ver el latido del scheduler abajo.
- [x] **[S] Aprobación de counts: DECIDIDA el 31-ago — va.** Construida el mismo día;
      el detalle de qué bloquea y qué no está en la Etapa 4.
- [ ] **[S] Confirmar si el formulario en papel del Regular Year lleva datos del sitio**
      (dirección / teléfono / supervisor). Summer los guarda por sitio y los imprime en
      el PDF; hoy el modelo `Site` no tiene esos campos. Bloquea 2200 y 2203.

## Etapa 2 — Cerrar la base (STOIC-2196 / 2197 / 2198)

- [~] Deltas de schema: **construidos todos menos uno** (verificado contra
      `prisma/schema.prisma` el 2-sep). `MealCountCorrection` guarda el valor anterior y
      quién corrigió; `GeneratedReport` guarda los consolidados con su firma;
      `AppSetting` lleva la config de notificaciones; la firma se guarda como imagen en la
      base, que es lo que hace que un claim firmado se reproduzca aunque falte el archivo
      en Drive. Los **horarios por tipo de comida** quedaron **cerrados como están** por
      decisión del 2-sep: un `timeIn`/`timeOut` por count, con el alumno marcando a qué
      comida asistió, igual que la web original.
- [~] **[S] Deltas de schema de paridad Summer** (detalle en SPECS.md §4 y §11):
      **todos construidos salvo los datos de contacto del sitio**, que siguen esperando la
      confirmación de la Etapa 1.
      - [x] `Holiday` + `HolidaySite` con nombre, rango de fechas, alcance por sitios y
        alcance por comida.
      - [x] Plantilla semanal por sitio + `programStart` / `programEnd`, que **generan** el
        calendario en vez de cargarlo día a día.
      - [ ] Datos de contacto del sitio (`address`, `telephone`, `supervisor`) — **lo único
        que falta de este bloque**, condicionado a la confirmación de Etapa 1.
      - [x] Anulación de un count: `voidedAt` / `voidedById` / `voidReason` (baja lógica;
        sale de dashboard y reportes, la historia no se borra).
      - [x] Respuesta al request: `responseComment` + `respondedBy/At`, más el campo `note`
        libre del solicitante (migración `20260901180000_request_note`).
      - [x] Aprobación de counts (`approvedAt`, `approvedById`, `approvedByEmail`),
        migración `20260901120000_meal_count_approval`.
- [x] STOIC-2197 restante: **hecho**. Reset self-service por email (`/api/auth/forgot-password`
      → link firmado de 1 h, con piso de respuesta de 400 ms para que la rama "esta cuenta
      existe" no se delate por tiempo), expiración de sesión configurable por
      `SESSION_TTL_HOURS` (cookie deslizante, 8 h por defecto), y bloqueo de usuarios
      desactivados: `getSession()` releé el usuario de la base en cada request, así que
      desactivar a alguien lo saca en el acto y no cuando venza su token.
- [~] STOIC-2198 restante: **reconciliación hecha** (`npm run db:reconcile`,
      `scripts/reconcile-history.mjs`): sitio × mes, planillas vs base, comparando días,
      filas y los totales de cada tipo de comida — que son los números con los que se arma
      un claim. Corrido el 2-sep sobre los 56 sitios: **cero diferencias**. Separa aparte
      los counts cargados por la app después del import y los anulados, para que no
      ensucien la señal. Sale con código 1 si algo no cuadra, así que sirve de compuerta
      antes del cutover. **Falta**: el refresco programado de la copia para desarrollo.

## Etapa 3 — Camino crítico de UI (STOIC-2199)

- [x] Meal count diario contra la base: roster por sitio/fecha, asistencia + meal types,
      horarios, firma + certificación, bloqueo post-submit y en días no operativos.
      Incluye borrador local del roster marcado, que sobrevive a un cierre de pestaña.
- [x] Dashboard mensual: mes × sitio en una pantalla, estado por color de cada día,
      click → count o formulario. Con caché stale-while-revalidate compartido entre
      pantallas (`lib/data-cache.js`), que es lo que bajó la navegación a ~1 s.
- [x] Mantener descargas de menú (ahora por Drive REST API con service account; el GAS solo
      actúa como fallback mientras falten las credenciales).
- [~] Verificar ≤ 1 s en carga y submit. Medido en desarrollo: navegación entre
      secciones ~1 s con caché tibio, toggle de un roster de 250 alumnos 3 a 7 ms. Falta
      medirlo en el hosting real y con conexiones lentas (va con la Etapa 7).
- [x] **[S] Guardia de cambios sin guardar** (`components/common/UnsavedGuard.jsx`):
      `beforeunload` para cerrar la pestaña y captura de los links de la app, con el
      diálogo del producto en vez del `confirm` nativo.
- [x] **[S] Bloqueos en el cliente, no recién en el submit**: fecha futura, día no
      operativo y count ya enviado se avisan al entrar al formulario.
- [x] **[S] Calendario: distinguir "feriado" de "sin servicio"**: el día lleva su propio
      estado y el **nombre del feriado en la celda**, tanto en el dashboard como en el
      calendario de administración.
- [x] **[S] Filtros del dashboard**: por estado y selector libre de mes y año.
- [x] **[S] UX del form**: scroll al primer campo que falta, prefetch de los datos
      compartidos al montar el shell, y paleta de comandos con Ctrl K.
- Sugerencia: partir la card en dos entregables (carga diaria / dashboard).

## Etapa 4 — Admin (STOIC-2200 / 2201)

- [x] Usuarios: alta/edición/desactivación, roles, multi-sitio, link de reset,
      búsqueda + filtros combinados.
- [x] Sitios: alta con formulario único, edición, renombrado y desactivación
      (`POST /api/sites`, `PATCH/PUT /api/sites/[id]`, `GET /api/sites/record?site=`),
      más la importación de roster con validación fila a fila y la edición de alumnos.
      Renombrar es seguro: counts, roster y asignaciones apuntan al sitio, no a su nombre.
- [~] **[S] Pantallas de sitios como las de Summer**: **hechas** en `/admin/sites` y
      `/admin/sites/detail` — listado con buscador, filtro por estado, toggle de inactivos
      y paginado; ficha con pestañas Overview y Roster, edición en diálogo, generación de
      días faltantes y desactivación con confirmación. El rename propaga solo, porque
      counts, roster y asignaciones apuntan al id del sitio y no a su nombre.
      **Falta** únicamente lo que depende del cliente: los campos de contacto del sitio.
- [x] Calendarios: días operativos/no operativos por sitio, comidas por día, patrón
      semanal, y cierre de un rango en varios sitios en una sola operación
      (`POST /api/sites/service-days/close`: 1,9 s para los 56 sitios contra los ~6 min
      del ciclo por sitio que había antes) **con deshacer**.
- [x] **[S] Holidays Manager completo**: nombre, rango de fechas, alcance "todos los
      sitios" o selección múltiple, "todo el día" o comidas específicas, detección de
      duplicados, edición y borrado, tabs próximos/pasados con buscador y paginado
      (`/admin/holidays`), que es la pestaña **Holidays** del calendario: no es un hermano
      del calendario de servicio, es la otra mitad de la misma pregunta.

      Decisión de diseño: los feriados son **declarativos**. No borran `ServiceDay`, se
      restan al leer el calendario (`src/lib/holidays.js`). Por eso la celda puede decir
      "Thanksgiving" en vez de quedar vacía, quitar un feriado devuelve los días exactos,
      y un feriado parcial deja el día abierto para las comidas que no cubre. Un día que
      ya tiene count no se ve afectado nunca.
- [x] **[S] Generador de calendario por sitio**: `programStart`, `programEnd` y una
      plantilla semanal por comida generan los `ServiceDay` al crear el sitio, y
      "Generate missing days" rellena lo que falte después de extender el ciclo. Solo
      **agrega**: nunca borra ni reescribe un día, así que correrlo dos veces no hace
      nada la segunda vez.
- [x] Correcciones de counts: solo Admin, snapshot completo del estado anterior en
      `MealCountCorrection.previous`, marca visible de "corregido" y un historial que
      muestra **qué cambió** en cada corrección, no solo quién y cuándo.
- [x] **[S] Anular un count**: baja lógica con motivo y auditoría. El día vuelve a
      quedar abierto y sale de `meal-counts/all`, del detalle, del PDF y de los tiempos
      recordados del sitio. La fila **no se borra**: un índice único parcial permite una
      sola cuenta *activa* por sitio y fecha, así que el día puede guardar la que se
      descartó junto a la que la reemplazó. Al abrir ese día, un admin ve quién la anuló,
      cuándo y por qué, y puede **restaurarla**.
- [x] **[S] Aprobación de counts**: `POST /api/meal-counts/approve` aprueba, `PUT` deshace,
      las dos con auditoría. **Aprobar bloquea la corrección** — lo aprobado es lo que se
      reclamó, y un número que todavía puede cambiar no es una aprobación; corregir un
      count aprobado contesta 409 diciendo cuál de las dos salidas tomar. **Anular sigue
      disponible**: un count cargado en el día equivocado está mal lo haya aprobado alguien
      o no.

      **La aprobación no condiciona los reportes.** Todo count no anulado entra al claim,
      aprobado o no. Al revés, un día que nadie llegó a aprobar desaparecería del claim sin
      que nadie se entere.

      Al aprobar sale el PDF de lo aprobado por mail al staff **de ese sitio** — no a los
      admins con todos los sitios, que son quienes aprueban — y la misma copia se archiva
      en Drive. Corre antes de responder, no después: un request que termina es lo único
      que el runtime garantiza ejecutar. Una falla ahí se alerta y nunca deshace la
      aprobación. En el calendario el día aprobado lleva un **check**, no un quinto color:
      un día aprobado sigue siendo un día enviado.

## Etapa 5 — PDFs y consolidación (STOIC-2203 / 2204)

*(Puede solaparse con Etapa 4 si se suma otra persona; si no, va después.
2204 requiere las correcciones de 2201.)*

- [~] Motor de PDF: `pdf-lib` en el servidor, sin dependencias nuevas. El **contenido** de los consolidados sale campo por campo del generador viejo (`gas-backup/report/generateReports.gs`). La **maquetación exacta** del formulario oficial no está replicada: el legacy llenaba una plantilla de Google Sheets que no está en el repo. Hace falta esa plantilla o un PDF de muestra para calcarla.
- [x] PDF de count diario + **PDF mensual por sitio** (`GET /api/reports/monthly?site=&year=&month=`), los dos archivados en Drive.
- [x] Envío por email desde la app: un claim se manda con el PDF adjunto, o se manda el **link de firma** en vez del archivo. Nunca los dos juntos, para que un documento que se manda a leer no termine firmado por quien no corresponde.
- [x] **[S] Guardar y recuperar**: todo consolidado que se construye queda guardado en
      `GeneratedReport` y archivado en Drive, y se descarga después desde la pantalla de
      claims. Si Drive no lo tiene, se **reconstruye desde los counts**, así que un claim
      nunca queda inaccesible. El envío por email ya está (fase F) y se verificó con un
      envío real el 1-sep.
- [x] Consolidados por mes × estado: los 2 reportes (`claim-part1` por sitio,
      `claim-part2` por día), sin tope de sitios, guardados y recuperables, con el paso
      de firma. Medido: 34 sitios de TX en 3,4 s.
- [x] **[S] Formulario del consolidado**: estado, mes y año, exclusión de sitios con
      buscador y atajos de incluir o excluir todos, validando que quede al menos uno
      (`/admin/reports/consolidated`).
- [x] **[S] Jobs asíncronos con polling** (`src/lib/report-jobs.js`): el POST arranca el
      trabajo y devuelve un id, la pantalla consulta cada 1,5 s y muestra en qué paso va,
      el tiempo transcurrido y un botón de cancelar. El registro vive en el proceso; lo
      que tiene que sobrevivir (el PDF en Drive y la fila en `GeneratedReport`) se
      persiste, así que un reinicio pierde el trabajo, no el documento.
- [x] **[S] Página pública de firma** `/sign/[token]`: el documento se abre para leerlo
      (link o preview embebido a pedido, porque el visor inline falla en las tablets de
      los sitios), pad de firma, nombre, cargo y texto de certificación, sin login. El
      token son 32 bytes aleatorios, **de un solo uso**, con vencimiento de 14 días y sin
      relación con el id del documento; se puede revocar desde la pantalla de claims. La
      firma se guarda como imagen en la base, así que el claim firmado se reproduce
      aunque el archivo no esté en Drive.

## Etapa 6 — Requests y notificaciones (STOIC-2205)

- [x] Inbox de requests con estados y filtros combinados, alta desde el propio inbox, y
      **mail al solicitante** cuando se responde.
- [x] **[S] Responder el request**: el comentario se guarda con quién y cuándo, el sitio
      lo ve en su pantalla y le llega por mail. Reabrir un request limpia la respuesta,
      para que no quede una resolución vieja sobre algo otra vez abierto.
- [x] **[S] Inbox usable con volumen**: buscador que cruza todos los campos, contador
      por pestaña y filtros por sitio además de estado.
- [x] Reminders diarios de counts atrasados: on/off, horario, cuántos días atrás mirar y
      copias fijas se configuran en `/admin/settings`, **sin deploy**. Cada persona recibe
      solo sus sitios, un feriado nunca cuenta como atrasado, y hay un **preview** que
      corre la misma búsqueda sin mandar nada. El cron llama **cada hora** con un secreto
      compartido y **la ruta decide**: compara la hora local en `APP_TIMEZONE` contra el
      setting, así el horario vive en la pantalla y el cambio de horario de verano no lo
      corre. Se respeta además la **ventana de recordatorio de cada sitio**
      (`reminderStart/End`, 25 de 64 la traen del master); un sitio sin ventana entra
      igual, porque una celda vacía es una forma demasiado silenciosa de apagarle los
      avisos a un sitio. Si algún envío falla, sale una alerta a `ALERT_EMAILS`.
- [x] Resolver el destino de los archivos: **Drive API desde el backend** para
      **todos los PDFs**, no solo los menús (`src/lib/google-drive.js` para leer y
      escribir, `src/lib/pdf-archive.js` para archivar lo generado). La oficina sigue
      publicando menús arrastrándolos a la misma carpeta, y los PDFs que genera la app
      se archivan en `<reportes>/<YYYY-MM>/`. Pendiente operativo: cargar
      `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `_PRIVATE_KEY` y compartir las dos carpetas con
      el service account. Ver `docs/DRIVE-STORAGE.md`.

## Transversal — [S] se construye junto con las etapas, no al final

- [x] **Monitoreo de errores del cliente**: `POST /api/monitoring` recibe mensaje, stack,
      pantalla y origen; el error boundary lo reporta y un handler global cubre lo que
      nunca llega a React (listeners, timers, promesas rechazadas). Se agrupan por huella
      (mensaje + primer frame + pantalla) con contador, así que la misma pantalla rota en
      cuarenta sitios es **una** fila. Pantalla `/admin/monitoring` para verlos, con
      stack, buscador, paginado y marcar como resuelto; volver a verse lo reabre. El
      endpoint acepta reportes sin sesión, porque el login también puede romperse, y por
      eso tiene esquema estricto y límite por IP.

      Es una **herramienta de desarrollo**: la entrada del navbar, la pantalla y el lado de
      lectura de la API responden solo a `NEXT_PUBLIC_MONITORING_EMAILS`, y la API contesta
      **404 en vez de 403** para no anunciarle la pantalla a los admins que no tienen por
      qué saber que existe. Un admin mirando stack traces no aprende nada y se preocupa al
      pedo. Las **fallas del servidor** van por mail aparte (`src/lib/alerts.js`), que es lo
      que hacían `sendFailureAlert`/`sendPartialFailureAlert` en el legacy.
- [x] **Patrón de listados admin**: usuarios, sitios, requests, feriados y errores del
      cliente comparten `ui/pagination.jsx` y el mismo buscador.
- [x] **Confirmación explícita en acciones destructivas** (`ui/confirm-dialog.jsx`):
      estados confirmar → procesando → resultado y el aviso de qué se lleva puesto la
      acción. Aplica a anular, desactivar, cerrar días en varios sitios y salir con
      cambios sin guardar.
- [x] **Latido del scheduler** (2-sep): cada llamada al endpoint de reminders que trae el
      secreto correcto sella `AppSetting reminders.lastPing`, **antes** de cualquiera de
      los motivos por los que esa corrida podría no hacer nada, y la pantalla de Reminder
      emails dice cuándo llamó por última vez (en amarillo si pasaron más de dos horas).
      Un recordatorio que deja de llegar se ve igual que uno que no tenía nada que decir, y
      la diferencia importa: tres días sin count pausan la entrega de comida de un sitio.
      Salió de no poder verificar el cron desde afuera — los logs de la plataforma llegan
      con ~25 minutos de retraso y el estado del deploy no refleja el exit code del
      contenedor. La respuesta a eso es que lo diga la propia app.

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
- ~~¿Va el flujo de aprobación de counts?~~ — **decidido el 31-ago: va, y está construido.**
- **[S] ¿El PDF lleva datos de contacto del sitio?** — bloquea el schema de `Site` y el
  formulario de alta de sitios (Etapas 2 y 4).
- **[S] Destinatarios y textos de los mails** (aprobación si aplica, respuesta de
  requests, reminders, envío de PDFs): quién recibe cada uno hoy y qué debe decir.
- **[S] Nombres oficiales de los feriados del ciclo** para cargar el calendario del año
  de una sola vez en el Holidays Manager.
