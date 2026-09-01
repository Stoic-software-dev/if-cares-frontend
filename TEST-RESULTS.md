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
