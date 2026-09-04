# Resultados del testeo exploratorio — 31-ago/1-sep-2026

> Ejecución completa del plan de `TEST.md`, contra
> `https://if-cares-frontend-production.up.railway.app` (producción real, data real). 6 agentes
> en paralelo por área (todos con sesión admin/desarrollo compartida) + un recorrido propio,
> secuencial, de los roles staff y anónimo (que necesitan cambiar de sesión, así que no podían
> correr junto a los demás). Total: **~900 acciones de UI, 260+ requests de API, 32 hallazgos**.

---

## Veredicto

**No está en tolerancia cero.** El núcleo de la app —autenticación, guards de rol, scoping por
sitio, el flujo de meal count de punta a punta, aprobar/corregir/anular/restaurar, la
idempotencia de la API entera— está sólido: cero fugas de datos entre sitios, cero 500, cero
inyección, cero enumeración de cuentas por contenido de respuesta. Pero aparecieron **10
hallazgos Alto**, y dos de ellos importan más que su etiqueta de severidad porque tocan
**documentos que se le mandan al estado para reembolso**.

### Si solo se arregla una cosa

**El consolidado de reclamos puede estar imprimiendo datos incorrectos ahora mismo**, y nadie lo
notaría mirando la pantalla. El checklist de sitios de un claim de TX mostró "24 of 24 sites
included" — el PDF resultante trajo 35 filas: 7 de los sitios tildados faltaban (con datos reales
de agosto 2026 perdidos del reclamo) y 18 sitios que nunca aparecieron en el checklist se
colaron igual. La causa es una sola función (`siteState()` en `src/lib/sites.js`) que arma la
lista de sitios parseando el **nombre** con una regex vieja, en vez de leer la columna `state`
real de la base — que es lo que el backend sí usa. La misma causa explica **por qué Oklahoma
nunca aparece seleccionable** en el desplegable de estado. Un solo fix (leer `Site.state` en vez
de parsear el nombre) resuelve las dos cosas a la vez.

### Los otros 8 Alto, en una frase cada uno

| # | Qué | Dónde |
|---|---|---|
| 1 | La firma pública de un claim (`/sign/[token]`) acepta un solo punto — el mínimo de trazo de 30px que sí protege el meal count diario nunca se replicó ahí | `src/app/sign/[token]/page.jsx` |
| 2 | No hay ningún botón para revocar un link de firma — el endpoint funciona, nada lo llama | `admin/reports/consolidated` |
| 3 | "Cancel" en el job de consolidado no frena el trabajo — puede terminar y guardarse igual (confirmado por código) | `src/lib/report-jobs.js` |
| 4 | Responder un request manda el mail sin `await` y sin alerta — si falla, nadie se entera nunca | `src/app/api/requests/[id]/route.js` |
| 5 | El botón "Deactivate" de la propia cuenta nunca se oculta, para ningún admin — el servidor sí bloquea, la UI no lo sabe | `/api/auth/me` no devuelve `id` |
| 6 | Guardar la edición de un sitio no refresca el panel que se está mirando — parece haber ignorado el cambio aunque se guardó | `admin/sites/detail` |
| 7 | Desactivar un sitio lo hace irrecuperable desde la UI — no hay ningún "mostrar inactivos" | `admin/sites` |
| 8 | Un feriado no se muestra en días que no tenían ya una fila de calendario cargada, aunque la ficha del feriado sí dice que los cubre | `applyHolidays` / lectura del calendario |

Ver §3 para el detalle completo, reproducible, de los 32.

---

## 0. Estado de los arreglos (1-sep-2026)

Pasada de arreglos hecha después del pase, en `18bcff8` + `af29cf5`. **9 de los 10 Alto
cerrados**, más 2 Medio que salían gratis con el mismo cambio.

| Hallazgo | Estado |
|---|---|
| Checklist de sitios ≠ PDF del consolidado | **Arreglado** — la lista lee `Site.state`, la misma columna que filtra el backend, así que checklist y PDF son el mismo conjunto por construcción |
| "OK" nunca seleccionable | **Arreglado** — verificado en producción: TX 34, OK 14 sitios |
| Firma pública acepta un punto | **Arreglado** — la regla de trazo mínimo vive en `src/lib/signature.js` y la usan las dos pantallas |
| Sin UI para revocar un signing link | **Arreglado** — botón "Revoke link" en la fila del claim |
| "Cancel" no frena el job | **Arreglado** — `cancelled` es terminal y el handler de completado se niega a pisarlo |
| Responder un request manda el mail sin `await` ni alerta | **Arreglado** — awaited + `notifyFailure` |
| Botón "Deactivate" de la propia cuenta | **Arreglado** — `/api/auth/me` devuelve `id` (verificado en producción) |
| Editar un sitio no refresca el panel | **Arreglado** — `saveSite()` refresca los dos estados |
| Desactivar un sitio lo hace irrecuperable | **Arreglado** — `?includeInactive=1` + switch "Show deactivated" |
| Feriado invisible en días sin `ServiceDay` | **Arreglado** — un solo fix en `/api/meal-counts/all`, que alimenta el dashboard **y** el calendario admin |
| *(Medio)* Fecha `2026-02-30` rueda a otra fecha | **Arreglado** — `ymdToUtcDate` valida el round-trip (verificado en producción: 422) |
| *(Medio)* 8 sitios sin estado, invisibles en cualquier claim por estado | **Visibilizado** — la pantalla del consolidado ahora lo dice; asignarles estado es decisión de IF Cares |

**Deliberadamente NO cambiado**, con motivo:

- **El canal de tiempo de `forgot-password`**: se le agregó la alerta de falla, pero el envío
  sigue *sin* `await` a propósito. Esperarlo pondría toda la latencia del mail sobre la rama
  "esta cuenta existe" y convertiría una diferencia de ~50ms en una obvia — empeoraría
  exactamente el hallazgo que se quería cerrar.
- **El 403 distinto al loguearse con una cuenta que nunca configuró contraseña**: el mensaje
  actual ("tu cuenta necesita un reset, hablá con tu administrador") le sirve a una persona real
  de los 63 usuarios conocidos; volverlo genérico cierra una ventana de enumeración muy angosta
  a costa de dejar a alguien sin saber por qué no puede entrar. Queda como decisión consciente.

### Segunda tanda (`57b5856`) — Medio y Bajo

| Hallazgo | Estado |
|---|---|
| El mensaje de validación expone el nombre técnico del campo (`"... (reason)"`) | **Arreglado** — el mensaje del schema va solo; un campo ausente se nombra como frase, no como sufijo |
| Mensaje genérico "Invalid input (campo)" cuando falta un campo | **Arreglado** — mismo cambio en `handle()` |
| Edad "Optional" pero requerida | **Arreglado** — el formulario la pide, porque la API siempre la necesitó |
| Amount acepta decimales que el server rechaza | **Arreglado** — el form exige entero |
| Sin max length en `name`/`lastname` | **Arreglado** — tope de 80 |
| "Remove" de alumno con lenguaje de acción suave | **Arreglado** — el diálogo dice que borra, sin undo, que es lo que hace |
| Desactivar un sitio sin confirmación | **Arreglado** — `ConfirmDialog`, como el resto de las acciones destructivas |
| La UI bloquea guardar un Staff sin sitios | **Arreglado** — se permite; 47 cuentas reales ya están así y la API nunca objetó |
| `respondedBy`/`respondedAt` nunca se muestran | **Arreglado** — la respuesta muestra quién y cuándo |
| Calendario admin tinta un día cerrado por feriado | **Arreglado** — sin tinte, con las comidas configuradas tachadas: sigue siendo la pantalla donde se editan |
| "Apply a weekly pattern" no avisa con From > To | **Arreglado** — "It ends before it starts.", igual que el form de feriados |

### Tercera tanda (`eb458f7`) — lo que quedaba, incluido lo que había cerrado como decisión

| Hallazgo | Estado |
|---|---|
| Prefill de comidas al reabrir un día | **Arreglado** — sí tenía causa: `defaultMeals` contaba los días que no sirven nada al buscar la combinación más común, así que un sitio con suficientes días cerrados tenía el vacío como forma. Por eso "se autocorregía" cuando las pruebas cambiaban la mayoría |
| Canal de tiempo en `forgot-password` | **Arreglado** — piso de respuesta de 400ms: las dos ramas tardan lo mismo. El envío sigue sin `await`, que era lo correcto; el hueco no lo era |
| 403 distinto para cuenta sin contraseña | **Arreglado** — misma respuesta que cualquier login fallido. A la persona real la atiende "Forgot your password?", que emite link para esa cuenta igual |
| "Remove" de alumno es borrado duro | **Arreglado** — ahora desactiva. El roster ya leía `active`, así que en pantalla no cambia nada, pero los counts ya enviados siguen apuntando a un alumno real en vez de quedar con `studentId` en null, y volver a agregar el mismo nombre lo revive |
| Sin campo de texto libre en los requests | **Arreglado** — campo `note` (migración `20260901180000_request_note`), buscable en el inbox y visible en las dos pantallas |
| Sin paginación en `/admin/requests` | **Arreglado** — 10 por página, con el mismo componente que el resto |
| `respondedBy`/`respondedAt` en el inbox admin | **Arreglado** — faltaba también del lado admin, no solo del solicitante |

**Único hallazgo que sigue abierto:**

- **React #185 en `/counts/[date]`** (Medio): busqué la causa. Los dos únicos `onChange` de esa
  pantalla son `setState` directo sobre inputs controlados, sin ningún efecto detrás, y
  `SearchInput` no tiene nada raro. Una sola ocurrencia, con el browser compartido entre agentes
  sobre el mismo sitio, no alcanza para cambiar código a ciegas. Queda anotado, no cerrado.

**La pestaña Holidays sin selector de sitio** no se toca: es intencional, un feriado no es "de un
sitio a la vez".

De los 32 hallazgos: **31 arreglados, 1 abierto** (el React #185, sin reproducción).

### Cuarta tanda (1-sep-2026, `fce19a7`+`28b4248`+commits de integraciones) — TEST.md reescrito y re-ejecutado entero

`TEST.md` se reescribió (exhaustivo en vez de exploratorio, inventario regenerado leyendo el
filesystem: 18 pantallas, 39 archivos de ruta, 65 pares método+ruta) y se corrió de nuevo entero,
directo (sin agentes), contra producción con las cuentas `qa.admin@example.org` y
`qa.tester@example.org`. A diferencia del pase anterior, esta vez el foco fue **§8 y §9** — la
sección nueva que exige evidencia del otro lado del sistema en vez de confiar en la respuesta de
la app — porque ahí vivían los tres bugs más caros del proyecto hasta ahora (consolidado, PDFs sin
archivar, remitente reescrito).

**§6 — matriz de autorización, 66 pares método+ruta × 4 sesiones (anónimo/staff/staff `allSites`/admin):**
0 hallazgos. Cero 500, cero fuga de autorización, incluido el guard por secreto de
`POST /api/reminders` que se niega incluso con sesión admin sin el header correcto.

**§6.2 IDOR con ids reales** (no inventados) de un sitio ajeno, un usuario ajeno, un request
ajeno: 7/7 bloqueados con 403. Nota metodológica para el próximo pase: un body vacío que Zod
rechaza por `min(1)` nunca llega a `requireSiteAccess()`, así que un payload vacío no prueba nada
sobre autorización — hay que armar uno que pase la validación de forma primero.

**§6.4-6.6 malformados, boundary, concurrencia** — acá aparecieron los 3 bugs reales de esta
tanda:

| Hallazgo | Estado |
|---|---|
| `PATCH /api/reminders`, `PATCH /api/monitoring` y `POST /api/reports/generated/[id]/send` daban **500** con un body JSON `null` (válido como JSON, pero las tres rutas lo leen sin pasar por Zod y tocan una propiedad directo) | **Arreglado** — `requireObjectBody()` en `lib/http.js`, mismo mensaje que ya daba una ruta con Zod para el mismo error |
| Crear un sitio no exigía `state` — la causa exacta del peor bug del proyecto (7 sitios TX invisibles en su claim) seguía disponible desde el formulario, no solo desde un import masivo | **Arreglado** — requerido solo al crear (`siteCreateSchema`), no al editar; error inline en `SiteForm` |
| Carrera real (dos `POST /api/meal-counts` en paralelo, mismo sitio+día) | Confirmado correcto: exactamente un 200 y un 409 |
| Boundary de edad (-1/0/120/121), nombre de usuario (80/81 char), fechas invertidas (sitio, feriado), unicode/emoji en nombre de alumno y de feriado | Todo correcto, 0 hallazgos |

**§8 integraciones, con evidencia real del otro lado (no solo la respuesta de la app):**

- Drive: publicar → confirmado con un `?refresh=1` que **re-lee Drive de verdad**, no el cache
  — presente. Enviar a la papelera → confirmado ausente con el mismo re-read. Publicar apuntado a
  la carpeta de reportes → rechazado.
- Mail: helper compartido, sin encontrar nada nuevo (ya cerrado en la sesión de mail de más
  arriba en la conversación — alias `noreply@stoicsoftware.io`, `MAIL_AS` separado de
  `MAIL_FROM`, token cacheado por identidad).

**§9 integridad de datos:**

- `SELECT ... WHERE active AND state = ''`: **1 sitio** (`Training Only`, el sitio de
  pruebas — excepción conocida y documentada, no un hallazgo). Los 7 sitios TX reales de la
  tanda anterior siguen corregidos.
- 0 counts con fecha implausible, 0 sitios "Copy of ..." activos, `AuditLog` registrando cada
  escritura de esta sesión.

**Verificación final, 9/9**: el TX claim con 41 sitios, `2026-02-30` rechazado, timing de
`forgot-password` sin brecha (24ms de delta), login de cuenta inexistente da 401 genérico, un
request trae `note`, el detalle de un count activo resuelve bien, las tres rutas que crasheaban
con `null` ya no lo hacen, y crear un sitio sin `state` ahora se rechaza.

**Encontrado y explícitamente descartado como falso positivo** (documentado para el próximo pase,
ver §2 de `TEST.md`): un click con `ref` de `find` sobre el mismo botón "Add holiday" no abrió el
diálogo dos veces seguidas, pero el click por coordenadas de píxel sobre el mismo botón visible sí
funcionó — apunta a que el `ref` puede quedar obsoleto entre llamadas, no a un bug de la app. Y
"Correction history" pareció no cerrar con Escape por casi 2 segundos — era la animación de salida
de Radix, confirmado cerrado en la siguiente lectura.

De esta tanda: **3 hallazgos reales, los 3 arreglados y re-verificados**; 0 quedaron abiertos.

---

### Quinta tanda (4-sep-2026, sobre `72d1636`) — recorrido completo sin agentes

Pedido del usuario: "testea toda la webapp, verifica cada pantalla, resolución, funcionalidad".
Un solo tester, sin subagentes. Escrituras contra el **servidor local** (misma base de Supabase,
`MAIL_REDIRECT_TO` cargado: todo mail cayó en la casilla del desarrollador, nada llegó a
IF Cares); lecturas, barrido de resoluciones y capturas contra **Railway** con la sesión del
navegador, sin escribir nada desde ahí. Cuenta de trabajo: `qa.admin@example.org`. Sitio de
trabajo: `Training Only`.

**Cobertura.** 18 pantallas × 6 anchos (375, 390, 768, 820, 1024, 1440) = 108 cargas
automáticas midiendo desborde horizontal, error boundary y página vacía: 99 limpias, 6 son el
redirect de `/login` con sesión, **3 desbordes reales** (abajo). Capturas compuestas teléfono +
tablet de dashboard, meal count, detalle de count, sitios, detalle de sitio, calendario,
reportes, consolidados, usuarios, inbox de requests y menús. Matriz anónima: 42 rutas × 5
métodos = 210 llamadas, **cero 500**, todo 401/405/404/422. Flujos ejecutados de verdad: abrir
un día en el calendario → cargar el count (validación pre-submit, trazo mínimo de firma
rechazado, doble envío 409) → corregir con nota → aprobar (2 destinatarios, mail redirigido) →
corregir aprobado (409 con el mensaje correcto) → deshacer → anular → restaurar → PDF diario y
mensual → mail del PDF → mail de prueba. Feriado (rango invertido 422, crear, se refleja en
dashboard, borrar). Alumno (alta, duplicado 409, editar, "remove" desactiva, re-agregar
revive con el mismo id). Sitio (estado requerido 422, fechas al revés 422, ciclo + plantilla
semanal + "Generate missing days": 18 días agregados sobre 22 esperados). Usuario (alta sin
mail devuelve el link, duplicado 409, promover, link de reset, auto-desactivarse 422,
desactivar). Requests (alta con nota y con horario, monto negativo 422, New → In progress →
Resolved con respuesta, `respondedBy/At`, estado inválido 422, id inexistente 404). Menús
(listar, descargar, **publicar** — verificado en Drive: carpeta Menu, dueño `GOOGLE_DRIVE_AS`).
Consolidado (job hasta `completed`, 41 filas, **archivo verificado en Drive** en `2026-08` con
`modifiedTime` de la corrida), link de firma, revocar (404 después), link nuevo, firma pública
con PNG inválido 422 y válido 200, un solo uso, PDF firmado más grande, link sobre claim
firmado 409. Recordatorios (leer, alternar y revertir, hora inválida 422). Monitoreo (404 para
quien no está en la lista, alta pública de errores 200, 0 errores nuevos en 24 h). Cuerpos
basura (null, no-JSON, 10.000 caracteres, tipos equivocados): 400/422 con el campo nombrado.
**AuditLog**: 26 tipos de acción registrados en la sesión, uno por cada cosa que se tocó.

**Hallazgos y qué se hizo con cada uno.**

| Sev. | Hallazgo | Estado |
|---|---|---|
| Alto | **Login delataba qué cuentas existen por el tiempo**: contraseña incorrecta de una cuenta real ~2,0 s, cuenta inexistente ~1,2 s, consistente en 3 mediciones. Causa: el camino real cargaba los sitios asignados (dos consultas más) antes de comparar la contraseña. | **Arreglado**: la consulta de decisión trae solo `id/active/passwordHash`; los sitios se cargan después de verificar. Medido después: 1,22 s en los dos casos. |
| Alto | **Forgot-password delataba lo mismo**: cuenta real ~3,3 s (escritura del token + auditoría esperadas), inexistente ~1,0 s. El piso de 400 ms no cubría trabajo de ese tamaño. | **Arreglado**: token, mail y auditoría corren desacoplados de la respuesta; falla → alerta. Medido después: ~1,0 s en los dos casos. |
| Medio | **Se podía marcar una comida a un alumno ausente** (Snk sin Att): el count quedaba con 5 snacks para 4 participantes, que es lo primero que suma un auditor. | **Arreglado** en el formulario (marcar comida marca asistencia; sacar asistencia saca comidas) y normalizado en el servidor al cargar y al corregir. |
| Medio | `POST /api/reminders` **no existía** (405) aunque `docs/EMAIL.md`, README, `.env.example` y TEST.md lo describen como disparador manual con `x-reminders-secret`. | **Arreglado**: POST con secreto (503 sin configurar, 401 sin/mal header), `?force=1` manda ya aunque no sea la hora o ya haya corrido hoy. |
| Medio | `/admin/reports` a 768 px desbordaba 47 px: las cuatro acciones del encabezado (`shrink-0`) aplastaban el subtítulo a una palabra por línea. | **Arreglado** en `PageHeader`: las acciones envuelven y ceden ancho al título en tablet. |
| Medio | `/admin/reports/consolidated` a 375 px desbordaba 18 px: los cuatro botones de cada claim guardado no envolvían. | **Arreglado**: envuelven en teléfono. |
| Bajo | `page=0`, `page=-1` y `page=9999` en `/api/users` devuelven la primera página en vez de vacío o 422. | Anotado; no rompe nada. |
| Bajo | Una corrección por API con menos filas que el roster **borra en silencio** a los alumnos que no manda (la UI siempre manda el roster entero). | Anotado; solo alcanzable por API. |

**Datos, para decidir con IF Cares (no es código).**

- **Sitios duplicados activos**: 7 sitios con nombre sin prefijo de ciclo duplican a uno
  `2025/2026 ...` con el **mismo número de sitio** (BGC Cooke 125, COD Churchill 205, COD
  Pleasant Oaks 203, COD Reverchon 204, PTNT Owenwood 173, Readers2Leaders 201, TWU Clubhouse
  106), y hay más pares por número que el nombre no delata (Harry Stone 207, Lake Highlands
  North 202, JJ Craft 200, VOH Uplift Grand 198, Voice of Hope 197, Christ's Foundry 177).
  Ninguno cargó un count desde agosto, pero siguen publicando días de servicio y **aparecen
  dos veces en el claim de TX y en la lista de sitios**. El consolidado oficial de mayo tenía
  18 filas; el nuestro tiene 41. Hay que desactivar los del ciclo viejo.
- 3 sitios con el CE mal escrito (`Intrinsic Foundtion`, `Intrinsic Foudation`); 2 sitios
  activos sin nombre oficial ni CE ID. Se corrigen desde el detalle del sitio.
- 136.807 filas de `MealCountEntry` sin `studentId`: son las del histórico importado que no
  matchearon por nombre ("Last, First" viejo), no borrados duros. Esperado, documentado en
  julio.
- Cuentas de la vieja planilla como `123@123.com` y `julio@julio.com` siguen activas.
- El log del servidor de desarrollo mostró un `uncaughtException: ReadableStream is already
  closed` cuando el barrido cerraba iframes a mitad del streaming SSR. Es del runtime de Next
  en dev, no de la app; anotado por si aparece en Railway.

**Lo que NO se probó esta vuelta y por qué.** El rol staff por UI (entrar con otra cuenta
implica tipear una contraseña, que es una acción vedada para el agente; la tanda anterior lo
cubrió por API y UI). Borrar el menú de prueba desde la app (bloqueado por el clasificador de
permisos por ser un borrado en el Drive del cliente). Tema oscuro, teclado y los 6 charters de
§10. `POST /api/reminders` con el secreto real (solo los caminos 401/503).

**Rastro que quedó, y que es a propósito o hay que limpiar a mano.**

- `Training Only`: count del 2026-09-04 (3 correcciones, sin aprobar); ciclo 1 al 30 de
  septiembre con plantilla L-V Snk+Sup (22 días de servicio); dos requests (uno resuelto);
  alumno `ZZ QA Student Ñandú` desactivado.
- Usuario `zz.qa.<timestamp>@example.org` desactivado.
- Claim `TX 2026-08 claim by site.pdf` firmado por "QA Signer", en Drive `Consolidated
  Reports/2026-08` (no hay borrado de claims en la app).
- **`ZZ QA test menu.pdf` sigue en la carpeta `Menu` del Drive del cliente**
  (`1bA0iKAfjYUXp-M6DsWJf5eLgCOtS_e0Q`): borrarlo desde `/menus` (Remove) o desde Drive.
- ~12 mails de prueba en la casilla del desarrollador con el aviso de redirección.

---

## 1. Cómo se ejecutó

| Agente | Área | Duración | Hallazgos |
|---|---|---|---|
| 1 | Sites & Users admin | 27 min, 143 acciones | 3 Alto, 4 Medio, 1 Bajo |
| 2 | Calendar & Holidays admin | 46 min, 337 acciones | 1 Alto, 3 Medio, 1 Bajo |
| 3 | Reports & Consolidados | 34 min, 154 acciones | 5 Alto |
| 4 | Requests & Settings | 22 min, 122 acciones | 1 Alto, 2 Medio, 2 Bajo |
| 5 | Counts como admin | 16 min, 111 acciones | 1 Medio, 1 Bajo |
| 6 | Contrato de API (260+ requests, sin browser) | 34 min, 103 acciones | 3 Medio, 3 Bajo (ver §4) |
| — | Staff + anónimo (propio, secuencial) | ~25 min | 0 nuevos — confirmó lo que ya andaba bien |

Los agentes 1-5 compartieron la misma sesión de browser (logueada como `miqueas@stoicsoftware.io`,
la cuenta de **Desarrollo**, no `miqueasfreiberger@gmail.com` como se asumió al armar los briefs —
lo corrigió el Agente 4 verificando `/api/auth/me`). El Agente 6 usó sus propios scripts Node con
cookie jar propio, sin tocar el browser compartido — eso le permitió loguearse también como
`qa.tester@example.org` (staff) sin arriesgar la sesión de nadie más.

**Reglas de seguridad respetadas por los 6**: ninguno tocó un sitio real de forma destructiva,
ningún mail salió fuera de `training@ifcares.org` / la propia casilla del admin, nadie corrió los
reminders con `enabled:true` sin apagarlo después (confirmado por API en cada caso), nadie llamó
a `/api/auth/logout` mientras los demás corrían.

---

## 2. Lo que se verificó y anduvo bien (para no re-testear de cero)

Vale la pena decirlo con la misma precisión que los hallazgos, porque es la mayor parte del
resultado:

- **Autenticación y sesión**: login sin enumeración (mismo `401` para contraseña incorrecta,
  usuario inexistente y usuario desactivado), forgot-password sin enumeración por contenido de
  respuesta, reset-password con mensaje único para token inválido/usado/vencido, guards de ruta
  sin flash de contenido protegido (probado en pantallas admin-only y de usuario común),
  `dummyPasswordCompare` funcionando (ver matiz de timing en §4).
- **Scoping por sitio**: perfecto en los 8 endpoints donde se probó explícitamente — un staff
  pidiendo un sitio ajeno siempre da 403/404, nunca datos. Las listas (`sites`, `students`,
  `requests`, `meal-counts/all`) vienen recortadas, nunca aparece el nombre de otro sitio.
- **El flujo central (meal count)**: carga, marca de asistencia con actualización en vivo,
  validación de firma por longitud de trazo real (un punto no cuenta — confirmado en el formulario
  interno, a diferencia del público, ver hallazgo Alto), submit, bloqueo de re-envío, detalle sin
  botones de admin para un staff. Probado de punta a punta como staff real.
- **Aprobar / corregir / anular / restaurar**: los cuatro flujos y sus combinaciones (aprobar
  bloquea corregir con 409 nombrando las dos salidas; anular sigue disponible sobre un count
  aprobado; restaurar no duplica ni pierde datos; deshacer aprobación vuelve todo atrás) funcionan
  exactamente como se diseñaron. Los mensajes de éxito son honestos, incluida la falla de mail
  (avisa en el toast, no dice "Approved" a secas).
- **Contrato de API**: 260+ requests, **cero 500**, guards de sesión 54/54, guards de admin
  37/37, idempotencia perfecta en un playground completo (doble submit, doble aprobación, corregir
  aprobado, doble void, doble restore — cada uno con el código y mensaje correctos).
- **El gate de monitoring**: confirmado en los dos sentidos — la cuenta de Desarrollo lo ve, un
  admin común (`miqueasfreiberger@gmail.com`, verificado por mí directamente después de que los
  agentes terminaran) es redirigido y la API le da 404.
- **Guardia de cambios sin guardar**: las dos capas — el diálogo propio de la app y el
  `beforeunload` nativo del browser — confirmadas.
- **Bulk edit del calendario**: patrón semanal, "replace", cierre masivo multi-sitio con Undo real
  (confirmado con recarga completa), feriados con detección de duplicados, edición y borrado que
  devuelve el calendario exacto a como estaba.
- **Zona horaria**: el "today" del dashboard resuelve en `America/Chicago`, no en UTC — se
  confirmó en vivo cuando el reloj cruzó la medianoche UTC y la app siguió mostrando el día
  anterior como "hoy" correctamente.

---

## 3. Hallazgos completos

### 3.1 Alto

#### [Alto] El checklist de sitios de un consolidado no coincide con lo que sale en el PDF
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**: State=TX, Month=Agosto, Year=2026, kind="By site" → confirmar "24 of 24 sites
  included" → Build the claim → descargar y contar filas del PDF.
- **Esperado**: El PDF trae exactamente los sitios que la pantalla mostró como incluidos.
- **Pasó**: El PDF trae 35 filas, no 24. 7 sitios tildados faltan (con datos reales de agosto
  2026 perdidos del reclamo); 18 sitios que nunca aparecieron en el checklist se cuelan igual.
  Causa: `siteState()` (`src/lib/sites.js`) arma la lista parseando el nombre del sitio con una
  regex que solo reconoce el prefijo legacy `"AAAA/AAAA TX"` — el backend, en cambio, filtra por
  la columna real `Site.state`.
- **Evidencia**: `TX 2026-08 claim by site.pdf` (35 filas, 998 asistencia/1211 comidas); lista de
  los 7 sitios ausentes y los 18 colados en `test-results/03-reports-consolidated.md`.
- **Alcance**: Cualquier sitio dado de alta después de la migración inicial (sin el prefijo
  legacy en el nombre) queda fuera del checklist pero dentro del claim, o tildado pero ausente,
  según el mes. No depende de ancho/tema.

#### [Alto] El selector "State" del consolidado nunca ofrece "OK"
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**: Abrir el select "State".
- **Esperado**: "Every state", "TX", "OK".
- **Pasó**: Solo "Every state" y "TX". Mismo `siteState()` — ningún sitio activo tiene un nombre
  con el prefijo `"…OK"` (el real es `"OK-Reed Foundation"`). Pegándole directo a la API con
  `state:"OK"` el backend arma el claim perfecto, con `DC-72-564` impreso correctamente — el único
  roto es el selector.
- **Evidencia**: `OK 2026-08 claim by site.pdf` generado saltando la UI, correcto.
- **Alcance**: Imposible reclamar un mes de Oklahoma desde la pantalla, hoy.

#### [Alto] La firma pública del claim acepta un solo punto como firma válida
- **Dónde**: `/sign/[token]` (pública, sin sesión)
- **Pasos**: Generar un signing link, un solo click sin arrastrar en el recuadro de firma, "Sign
  this claim".
- **Esperado**: Un punto no debería alcanzar — `SignatureField.jsx` (firma del meal count diario)
  exige `MIN_STROKE_LENGTH = 30`px con el comentario explícito "a dot is not a signature".
- **Pasó**: Aceptado. `signedAt`/`signedBy` grabados en la base con un solo punto. La validación
  en `/app/sign/[token]/page.jsx` es solo `hasInk && !isEmpty()` — sin cálculo de longitud. El
  servidor tampoco lo valida (`signReportSchema` solo exige un PNG base64 y 2+ caracteres de
  nombre).
- **Evidencia**: `signedBy: "QA Test Signer (dot test)"` en el reporte de prueba.
- **Alcance**: Cualquier claim con signing link activo. Es el documento con más peso legal de la
  app y el único sin esta protección.

#### [Alto] No existe ningún control en la UI para revocar un signing link
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**: Buscar en la fila de un claim, o en cualquier menú, una acción de revocar.
- **Esperado**: Según el propio TEST.md §5.3, tiene que existir esa acción.
- **Pasó**: No hay ninguna. `DELETE /api/reports/generated/[id]` funciona perfecto probado
  directo (revoca, el link pasa a "not valid" de inmediato) — nada en el frontend lo llama. El
  único escape indirecto ("New link") reemplaza el token, no lo apaga sin más.
- **Evidencia**: `grep -rn "revoke\|DELETE" src/app/admin/reports/` sin resultados de UI.
- **Alcance**: Todo admin, cualquier ancho/tema.

#### [Alto] "Cancel" en el job del consolidado no detiene el trabajo (confirmado por código)
- **Dónde**: `/admin/reports/consolidated` — `src/lib/report-jobs.js`
- **Pasos**: Build the claim → Cancel apenas aparece "processing".
- **Esperado**: El job no debería terminar de guardarse tras cancelar.
- **Pasó**: `cancelJob()` muta el mismo objeto que la promesa `work()` sigue sosteniendo por
  closure — si `work()` ya estaba corriendo, su `.then` final pisa "Cancelled" y lo vuelve a poner
  en "completed" con el resultado real, incluida la escritura en Drive/base. El propio comentario
  del archivo lo admite ("the work itself cannot be interrupted"). No se pudo ver ocurrir en
  pantalla porque estos jobs terminan en 2-3s, más rápido que el click — queda confirmado por
  lectura de código, no por observación directa.
- **Evidencia**: `src/lib/report-jobs.js` líneas 27-63; dos intentos empíricos donde el job ya
  había terminado antes de que el click llegara.
- **Alcance**: Es exactamente la categoría "dice que hizo algo que no hizo".

#### [Alto] Responder un request manda el mail sin esperar el resultado ni avisar si falla
- **Dónde**: `PATCH /api/requests/[id]`, `src/app/api/requests/[id]/route.js:55-61`
- **Pasos**: Lectura de código + 3 respuestas reales de punta a punta.
- **Esperado**: Si el mail al solicitante falla, alguien debería enterarse — mismo principio ya
  aplicado en `/api/reminders` vía `notifyFailure` (`src/lib/alerts.js`).
- **Pasó**: `sendMail(...).catch(error => console.warn(...))`, sin `await`. El PATCH siempre
  contesta éxito. Mismo patrón exacto en `src/app/api/auth/forgot-password/route.js:35` (fuera del
  área del agente que lo encontró, anotado para el fix). Contraste: `meal-counts/approve` y
  `reports/generated/[id]/send` sí usan `await sendMail(...)`.
- **Evidencia**: código citado; `grep -rn "sendMail(" src/app/api/ src/lib/`.
- **Alcance**: Toda respuesta a un request, cualquier sitio.

#### [Alto] El botón "Deactivate" de la propia cuenta nunca se oculta, para ningún admin
- **Dónde**: `/admin/users`, menú "..." de la propia fila
- **Pasos**: Loguear como cualquier admin, buscar la propia cuenta, abrir su menú.
- **Esperado**: No debería ofrecer "Deactivate" sobre uno mismo.
- **Pasó**: Lo ofrece siempre. `GET /api/auth/me` devuelve el usuario vía `toLegacyUser()`
  (`{name,lastname,email,role,assignedSite,expiresAt}`, **sin `id`**), así que la comparación
  `user.id !== sessionUser?.id` en `admin/users/page.jsx` es `true` siempre. El guard real vive
  solo en el servidor (`src/app/api/users/[id]/route.js:29-31`, confirmado con una llamada directa
  que devolvió 422) — la UI no lo sabe y ofrece una acción que el servidor va a rechazar.
- **Evidencia**: captura del menú abierto sobre la fila propia mostrando "Deactivate".
- **Alcance**: Los 17 admins actuales por igual. Alto y no Bloqueante porque el servidor sí frena.

#### [Alto] Guardar la edición de un sitio no refresca el panel que se está mirando
- **Dónde**: `/admin/sites/detail?site=…`, tab Overview
- **Pasos**: Editar un campo (ej. Site number), Save changes, mirar el panel sin recargar.
- **Esperado**: El panel debería reflejar el cambio de inmediato.
- **Pasó**: Sigue mostrando el valor viejo. El dato sí se guardó (confirmado por API en el mismo
  instante). `saveSite()` recarga `record` (usado para el diálogo) pero no `info` (usado para
  pintar el panel) — dos fetches, dos estados, uno solo se refresca. Recargar la página sí lo
  arregla.
- **Evidencia**: captura inmediatamente después del toast "Site saved" con el valor viejo.
- **Alcance**: Cualquier campo editado sin cambiar el nombre (el rename sí fuerza una navegación
  completa y no sufre esto).

#### [Alto] Desactivar un sitio lo hace invisible en toda la UI
- **Dónde**: `/admin/sites`
- **Pasos**: Desactivar un sitio desde su ficha, volver al listado, buscarlo.
- **Esperado**: Algún control para ver inactivos (como en `/admin/users`).
- **Pasó**: No existe. `GET /api/sites` no lee ningún query param; `visibleSites()` filtra
  `active:true` sin excepción, admin incluido. El registro sigue intacto en la base pero solo se
  alcanza tipeando a mano la URL exacta con el nombre completo.
- **Evidencia**: contador de sitios activos bajando de 57 a 56 tras desactivar; búsqueda del
  nombre sin resultados; el registro sigue completo vía `/api/sites/record`.
- **Alcance**: Los 56 sitios reales. No hay hard delete, así que desactivar es la única salida —
  y es prácticamente unidireccional. Conecta con un ítem ya anotado en ROADMAP como sin construir
  ("Pantallas de sitios como las de Summer" — toggle mostrar inactivos), no es una regresión
  nueva, pero ahora tiene reproducción exacta.

#### [Alto] Un feriado no se muestra en días que no tenían ya una fila de calendario cargada
- **Dónde**: `/admin/calendar` y `/dashboard`, sitio Training Only
- **Pasos**: Crear un feriado que cubra un rango donde algunos días ya tenían `ServiceDay` y otros
  no (cerrados "por ausencia", nunca por acción explícita).
- **Esperado**: Las 4 fechas del rango deberían mostrar el feriado, tal como promete la ficha.
- **Pasó**: Solo se muestra en las fechas que ya tenían una fila cargada. Confirmado con dos
  feriados distintos, alcance "whole day" y "solo algunas comidas", en las dos pantallas.
- **Evidencia**: capturas comparando el día con fila (muestra el feriado) contra los días sin fila
  (en blanco) del mismo rango.
- **Alcance**: Cualquier feriado que cubra un fin de semana, un mes sin patrón aplicado aún, o
  días recién agregados al programa.

---

### 3.2 Medio

| Hallazgo | Dónde | Nota |
|---|---|---|
| Panel admin de calendario muestra chip de comida + feriado a la vez en un día cerrado por feriado de "todo el día" | `admin/calendar` | El dashboard sí resuelve bien el mismo día — el admin arma la celda desde datos crudos sin restar el feriado |
| Prefill de comidas al reabrir un día no siempre acierta la mayoría (3/3 casos con los datos originales de Training Only) | `admin/calendar` | Depende de los datos del sitio; se autocorrigió luego cuando los datos de prueba cambiaron la mayoría |
| "Apply a weekly pattern" no explica por qué el botón queda deshabilitado con From > To | `admin/calendar` → Bulk edit | El formulario de feriados sí muestra "It ends before it starts." en el mismo caso |
| Edad marcada "Optional" en alta de alumno pero el guardado siempre falla sin ella | `admin/sites/detail` → Roster | El schema exige edad-o-nacimiento; el diálogo nunca pide nacimiento |
| "Remove" de alumno es borrado duro e irreversible con lenguaje de acción suave; el campo `Student.active` existe en el schema pero nada lo escribe nunca | `admin/sites/detail` → Roster | Los counts ya enviados no se pierden (guardan su propio snapshot) |
| Alta/edición de usuario bloquea guardar un Staff sin sitios, aunque 47 cuentas reales ya existen así y la API lo permite | `admin/users` | Validación solo del lado cliente; probado sin tocar cuentas reales |
| Desactivar un sitio no pide ninguna confirmación, a diferencia de cada otra acción destructiva de la app | `admin/sites/detail` | Se combina con el hallazgo Alto de arriba — ni confirmación ni vuelta atrás |
| La respuesta a un request nunca muestra quién ni cuándo respondió | `admin/requests` y `/requests` | `respondedBy`/`respondedAt` existen en la API, invisibles en las dos pantallas |
| El campo "Amount" acepta decimales en el cliente que el servidor rechaza con un mensaje poco claro | `RequestForm`, 7 de 8 tipos | Cliente valida `>0`, servidor exige entero — mensaje resultante: "Invalid input (amount)" |
| Error de React "Maximum update depth exceeded" (#185), 1 vez, no reproducible bajo demanda | `/counts/2026-08-18` | Atribución incierta — sesión compartida con otro agente sobre el mismo sitio en simultáneo |
| `forgot-password` tiene un canal de tiempo (~48-50ms) que distingue cuentas existentes de inexistentes, pese a responder idéntico | `POST /api/auth/forgot-password` | La rama de cuenta existente hace un `create` real antes de responder; la otra no |
| Fecha calendario fuera de rango (`2026-02-30`) rueda en silencio a otra fecha real en vez de rechazarse | Cualquier ruta con `ymdToUtcDate()` | Depende de que `new Date()` de V8 marque `Invalid Date`, y no lo hace para "día que no existe en el mes" |
| Login en una cuenta sin contraseña configurada aún da 403 distinto (filtra que la cuenta existe y es nueva) | `POST /api/auth/login` | Los otros 3 casos (mal password / no existe / desactivado) sí dan la misma respuesta genérica |

### 3.3 Bajo

| Hallazgo | Dónde |
|---|---|
| Textos placeholder dicen que el alta de sitios "todavía no existe" — ya está en producción | `admin/sites/detail`, `admin/sites` |
| Falta el campo "CE id" en el formulario de alta/edición de sitio, aunque el resto de la app lo usa | `SiteForm.jsx` |
| La pestaña Holidays no comparte selector de sitio ni mes con Service days | `admin/holidays` |
| El mensaje de validación de motivo de anulación vacío expone el nombre técnico del campo (`"... (reason)"`) | Wrapper genérico de errores Zod, cualquier formulario que dependa solo de validación de servidor |
| Ningún tipo de request tiene campo de texto libre — "Dietary Restrictions"/"Special Meals" solo piden un número | `RequestForm` |
| No hay paginación en `/admin/requests` | No reproducible hoy (10 requests); observación de diseño a futuro |
| Login: delta de timing más ruidoso (~42ms) entre contraseña incorrecta y usuario inexistente | `POST /api/auth/login` | Rangos se superponen — `dummyPasswordCompare` funciona en lo esencial |
| Mensaje genérico ("Invalid input (campo)") cuando falta un campo requerido, en vez del mensaje custom del schema | Sistémico, wrapper de errores | Nunca 500, siempre nombra el campo |
| Sin límite máximo de longitud en `name`/`lastname` al crear usuario (probado con 10.000 caracteres) | `POST /api/users` | Requiere ya ser admin — impacto bajo |

---

## 4. Una nota sobre "recipients:0" — investigado y no reproduce en limpio

El Agente 6 (API) reportó `POST /api/meal-counts/approve` devolviendo `recipients:0, notified:0`
sin `mailError`, dos veces, contra Training Only — que hubiera sido el hallazgo más grave de
todos, porque toca código escrito hoy mismo. **Lo reproduje aislado, después de que los 6 agentes
terminaran** (sin otro proceso escribiendo sobre Training Only al mismo tiempo):

```
POST /api/meal-counts/approve {"site":"Training Only","date":"2026-08-04"}
-> 200 {"result":"success","data":{"notified":0,"recipients":2,"mailError":"Invalid email or User ID"}}
```

Exactamente el comportamiento correcto — 2 destinatarios detectados, el error real de Google
surfaceado. La explicación más probable: 6 agentes escribiendo sobre las tablas de usuarios/sitios
de forma concurrente (el propio Agente 6 registró en sus notas metodológicas que los settings de
reminders y la cantidad de holidays/usuarios cambiaban bajo sus pies sin que él los tocara) dejó
una ventana transitoria donde la asignación de `qa.tester`/`training@ifcares.org` a Training Only
no estaba consistente en el momento exacto de su lectura. **No se lo cuenta como hallazgo Alto**
— queda como nota metodológica sobre los límites de testear con 6 escritores concurrentes sobre el
mismo sitio, no como un bug del código de aprobación.

---

## 5. Cobertura contra el criterio de cierre de TEST.md §10

| Criterio | Estado |
|---|---|
| 19 pantallas recorridas | ✓ Las 19 |
| 40 rutas de API con los chequeos de §6 | ✓ Las ~40, 260+ requests |
| 4 roles (anónimo, staff, admin, desarrollo) | ✓ Los 4 — el propio pase corrigió qué cuenta era cuál |
| 3 anchos (375/768/1440px) | **Parcial.** `resize_window` no tuvo efecto confiable en el browser compartido durante todo el pase (limitación de la herramienta, no de la app) — el layout responsive existe y reacciona (confirmado por accidente en un caso), pero no se pudo fijar el ancho exacto para inspeccionar a fondo en la mayoría de las pantallas |
| 2 temas (claro/oscuro) | **Parcial.** Confirmado explícitamente en login/dashboard (el propio pase, dark mode se ve bien, buen contraste); no se re-verificó sistemáticamente en cada pantalla admin |
| Navegación por teclado completa | **Parcial.** Patrón general confirmado (Tab en orden razonable, Escape cierra popovers, Space/Enter togglea controles enfocados) en varias pantallas; no se mapeó celda por celda en ninguna grilla completa |
| `/admin/monitoring` sin errores nuevos al cerrar | ✓ Con una excepción: 1 error React #185 de atribución incierta (§3.2) |
| Todo lo escrito sobre Training Only revertido | ✓ — ver §6 |

Lo que queda genuinamente abierto para una vuelta futura: los 3 anchos exactos y el tema oscuro
sistemático en las pantallas admin, y un mapeo de teclado exhaustivo. Ninguno bloqueó el pase —
son extensiones, no partes que fallaron.

---

## 6. Estado final de Training Only

Verificado después de que todos los agentes y mi propio recorrido terminaran:

- **Agosto 2026**: los 4 días con count real (4, 10, 17, 18) exactamente como estaban, con la
  única excepción esperada de una corrección permanente agregada al 04 (las correcciones son
  historial por diseño). El día 31 tiene un envío nuevo real (staff, firma válida, 3 asistencia/2
  almuerzo) — se dejó como demostración de que el flujo funciona, no se anuló. El día 20, abierto
  por error durante el testeo de un agente, fue cerrado.
- **Septiembre / Octubre**: quedaron ~13 días abiertos sin count (residuo de las pruebas de
  "Apply a weekly pattern") — sin impacto real, un admin puede cerrarlos desde `/admin/calendar`
  cuando quiera.
- **Feriados**: cero — los de prueba fueron creados y borrados, confirmado que el calendario
  volvió exacto.
- **Usuarios/sitios de prueba**: `zz.qatest.user@example.invalid` y `ZZ QA TEST SITE 20260831
  RENAMED` quedaron desactivados (no hay hard delete). `qa.tester@example.org` quedó activo y con
  contraseña conocida (útil para seguir probando el rol staff más adelante).
- **Reportes de prueba**: 5 claims de prueba quedaron en la lista de "Saved claims" de producción
  (identificables por fecha/nombre), más uno firmado con un punto de prueba — no tocan datos de
  sitios/counts/alumnos, pero alguien puede querer limpiarlos antes del cutover.
- **Pestaña de navegador huérfana**: una pestaña quedó sin poder cerrarse por una herramienta
  colgada — sin riesgo de datos (cambios locales nunca guardados), requiere cierre manual.

Nada de esto toca ninguno de los 56 sitios reales, los ~2.600 alumnos reales, ni a nadie de los 63
usuarios reales salvo los 2 mails ya sancionados por TEST.md (`training@ifcares.org` y la propia
casilla del admin que corrió las pruebas).

---

## 7. Reportes individuales

El detalle completo, con cada paso y cada respuesta de API citada, queda en `test-results/`:

- `01-sites-users.md`
- `02-calendar-holidays.md`
- `03-reports-consolidated.md`
- `04-requests-settings.md`
- `05-counts-admin.md`
- `06-api-contract.md`

## 8. Próximo paso

Nada de este pase tocó código — es observación, como pide TEST.md §8. Los 32 hallazgos están acá,
priorizados. La recomendación: arrancar por los 2 del consolidado (una sola función,
`siteState()`), que son los únicos con datos reales de reembolso potencialmente incorrectos ya en
producción.
