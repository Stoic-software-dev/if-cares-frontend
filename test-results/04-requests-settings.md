# Área 7 — Requests y Settings

Sitio de prueba: `Training Only`. Fecha de ejecución: 31-ago/01-sep-2026, contra producción
(`https://if-cares-frontend-production.up.railway.app`).

**Corrección importante al brief**: el brief asumía que la sesión compartida logueada era
`miqueasfreiberger@gmail.com`. Verificado vía `GET /api/auth/me`, la sesión real es:

```json
{"result":"success","data":{"name":"Miqueas","lastname":"Freiberger","email":"miqueas@stoicsoftware.io","role":3202,"assignedSite":"all","expiresAt":1788252205000}}
```

Es decir, la cuenta de **Desarrollo** (`miqueas@stoicsoftware.io`), la misma que
`src/lib/monitoring-access.js` trae hardcodeada por default en `ALLOWED`. El nombre mostrado en
el navbar ("Miqueas Freiberger") coincide con el dueño real de ambas casillas, lo que explica la
confusión, pero el email de sesión es el de desarrollo, no el admin común. Esto cambia el
resultado esperable del punto "Monitoring gate glance" (ver más abajo) y también implica que los
mails de respuesta a mis propios requests de prueba fueron a `miqueas@stoicsoftware.io` (el
`requestedByEmail` es quien *creó* el request, no un alias fijo del sitio) y no a
`training@ifcares.org` — sigue siendo una casilla interna seguro de tocar, solo que no la que el
brief daba por hecho.

## Lo que quedó sin probar (y por qué)

- **Filtro por sitio en `/admin/requests`**: el `<select>` de sitio solo se renderiza cuando hay
  2+ sitios distintos entre los requests existentes (`siteOptions.length > 1` en
  `src/app/admin/requests/page.jsx`). Antes de esta pasada, la tabla `Request` de producción solo
  tenía actividad de `Training Only`; no puedo crear un request en otro sitio real para forzar que
  aparezca el selector sin violar la regla de "solo Training Only". Confirmé por lectura de código
  que la lógica de filtrado (`request.site !== siteFilter`) es correcta; el control en sí quedó
  sin ejercitar en vivo.
- **Paginación con volumen real**: con 10 requests totales al cerrar, nunca se acerca a un límite.
  Ver hallazgo Bajo más abajo: no existe ningún mecanismo de paginación en el código, así que "sin
  probar" aquí es en realidad "no hay nada que probar todavía".
- **Preview con muestra no vacía**: en el momento de la prueba, `Training Only` tenía 0 días
  atrasados (`"0 overdue days since 2026-08-28, 0 people would be written to."`), así que solo vi
  el estado vacío del Preview. Revisé el código del bloque `preview.sample.map(...)` y es una
  lista simple sin lógica sospechosa, pero no lo vi renderizado con datos reales.
- **Bloqueo de monitoring para un admin común**: ver sección dedicada más abajo — la sesión
  compartida resultó ser la cuenta de Desarrollo, así que solo pude confirmar el caso positivo.
- **Anchos responsive (375/768/1440) y toggle de tema oscuro**: decisión deliberada de no tocarlos
  en esta pasada. `resize_window` cambia el tamaño de la ventana **completa**, compartida con las
  pestañas de otros agentes activos en paralelo en este mismo momento; y el tema
  (`src/components/shell/ThemeProvider.jsx`) se guarda en `localStorage` bajo `ifc.theme`, que
  también es compartido por origen entre todas las pestañas del mismo perfil — cambiarlo podría
  alterar silenciosamente el tema que ven las pestañas de otros agentes en su próxima navegación.
  Preferí no arriesgar el trabajo ajeno por un chequeo que no pedía el brief explícitamente.
- **Confirmación real de entrega de mail**: no tengo acceso a la casilla `miqueas@stoicsoftware.io`
  ni a `training@ifcares.org` para verificar la llegada física del mail. Ver hallazgo Alto: de
  hecho, la app tampoco tiene forma de confirmarlo.

---

## Hallazgos

### [Alto] Una falla al mandar el mail de respuesta a un request es invisible para cualquier rol
- **Dónde**: `PATCH /api/requests/[id]` (responder/resolver un request), `src/app/api/requests/[id]/route.js:55-61`. Probado desde `/admin/requests`, rol Admin/Desarrollo.
- **Pasos**:
  1. Leí el código del envío: `sendMail({ to: [existing.requestedByEmail], ...message }).catch((error) => { console.warn(...) })` — sin `await`, y el `catch` solo hace `console.warn` del lado del servidor.
  2. Comparé con el único mecanismo de alertas que sí existe en la app, `src/lib/alerts.js` (`notifyFailure`), cuyo propio comentario dice explícitamente que existe para que "a consolidated claim that died halfway or a reminder run that sent nothing" no quede "en un log que nadie lee". `src/app/api/reminders/route.js` sí lo usa para sus fallos de envío masivo.
  3. Confirmé con `grep -rn "sendMail(" src/app/api/ src/lib/` que el patrón sin `await`/sin alerta se repite en `src/app/api/requests/[id]/route.js:57` y en `src/app/api/auth/forgot-password/route.js:35` (fuera de mi área, lo anoto para quien consolide) — mientras que `meal-counts/approve`, `reports/generated/[id]/send` y el propio `alerts.js` sí usan `await sendMail(...)`.
  4. Resolví 3 requests reales desde la UI con contenidos de nota distintos (ver hallazgos de abajo) — en los 3 casos el PATCH devolvió `{"result":"success"}` y el toast confirmó éxito, sin que hubiera ninguna forma de saber, ni para mí ni para un futuro administrador, si el mail subyacente llegó.
- **Esperado**: si el mail al solicitante falla (cuota de Gmail, delegación revocada, dirección rechazada), alguien debería enterarse — es exactamente el mismo principio que ya se aplicó en `/api/reminders` y, según el reporte del Área 5 (`test-results/05-counts-admin.md`), en la aprobación de counts (que hoy sí avisa en el toast cuando el mail falla). Responder un request está listado en la propia tabla de "acciones que salen del sistema" de `TEST.md` §2.
- **Pasó**: el endpoint siempre contesta éxito sin esperar el resultado real del envío. No pude forzar una falla real de Gmail para verlo fallar en vivo (`mailReady: true`, así que lo más probable es que mis 3 mails de prueba sí hayan salido), pero el código deja confirmado, más allá de toda duda, que si fallara nadie se enteraría por ningún medio de la aplicación — ni toast, ni `/admin/monitoring` (que solo captura errores de *cliente* vía `POST /api/monitoring`, no warnings de servidor), ni ningún otro panel.
- **Evidencia**:
  ```js
  // src/app/api/requests/[id]/route.js:55-61
  if (answering && mailConfigured() && existing.requestedByEmail) {
    const message = requestAnswered({...});
    sendMail({ to: [existing.requestedByEmail], ...message }).catch((error) => {
      console.warn(`[mail] request answer to ${existing.requestedByEmail}: ${error.message}`);
    });
  }
  ```
  vs. el comentario de cabecera de `src/lib/alerts.js`: *"a console warning in a log nobody reads"* — el problema que ese archivo dice resolver, sin que esta ruta lo use.
- **Alcance**: aplica a **toda** respuesta a un request, en cualquier sitio — es un problema de código, no de datos de `Training Only`. Mismo patrón confirmado también en `forgot-password` (fuera de mi área).

### [Medio] La respuesta a un request nunca muestra quién ni cuándo respondió
- **Dónde**: `/admin/requests` (lista completa, incluida la pestaña "Resolved") y `/requests` (vista del solicitante), rol Admin.
- **Pasos**:
  1. Resolví 3 requests con notas distintas y confirmé por API que `respondedBy` y `respondedAt` se guardan correctamente, ej.: `"respondedBy": "miqueas@stoicsoftware.io", "respondedAt": "2026-09-01T02:20:34.531Z"` (request "Meal Increase").
  2. En `/admin/requests` → pestaña "Resolved": cada fila muestra tipo, detalle, sitio, fecha del pedido, badge de estado y el botón "Reopen" — ninguna columna, tooltip ni expansión muestra la nota de respuesta, quién la escribió ni cuándo. Confirmado en el código de `InboxScreen` (`src/app/admin/requests/page.jsx`): el render de la fila nunca referencia `responseComment`, `respondedBy` ni `respondedAt`.
  3. En `/requests`, mismo request, vista del solicitante: la nota aparece en un recuadro (`{request.responseComment}`, `src/app/requests/page.jsx`), pero sin autor ni fecha — solo el texto.
- **Esperado**: el propio brief de esta área pide confirmar que la respuesta se ve "con who/when", y ambos campos existen en `GET /api/requests` desde que se creó la funcionalidad.
- **Pasó**: ninguna de las dos pantallas los muestra nunca, para ningún request. Un administrador que quiera repasar "¿qué le contestamos a este sitio y cuándo?" no tiene forma de hacerlo salvo pegándole directo a la API.
- **Evidencia**: respuesta completa de `GET /api/requests` para el request "Meal Increase" (recortada):
  ```json
  {
    "type": "Meal Increase", "status": "RESOLVED",
    "responseComment": "Delivered ñ á 'quotes' \"double\" <script>alert(1)</script> & more — ¿todo bien? 😀",
    "respondedBy": "miqueas@stoicsoftware.io",
    "respondedAt": "2026-09-01T02:20:34.531Z"
  }
  ```
  y capturas de ambas pantallas mostrando la nota sin atribución.
- **Alcance**: mismo comportamiento en las 3 respuestas que dejé (nota corta con caracteres especiales, nota larga de 450 caracteres, nota vacía) y en las 2 preexistentes — 5 de 5 resueltos, sin excepción.

### [Medio] El campo "Amount" acepta decimales en el cliente que el servidor rechaza, con un mensaje que no explica el problema
- **Dónde**: `RequestForm` (usado en `/requests` y en el composer de `/admin/requests`), cualquiera de los 7 tipos de request que usan "Amount" (todos menos "Change approved meal service time"). Rol Admin, sitio Training Only.
- **Pasos**:
  1. Tipo "Special Meals", sitio Training Only, Amount = `2.5`.
  2. Click "Send request".
- **Esperado**: o el formulario bloquea el decimal antes de mandar (como sí bloquea correctamente `0` y negativos — ver "lo que funcionó" más abajo), o el servidor devuelve un mensaje que explique qué corregir.
- **Pasó**: el cliente solo valida `Number(amount) > 0` (`src/components/requests/RequestForm.jsx`), así que `2.5` pasa y dispara el `POST`. El servidor exige entero (`z.coerce.number().int().positive().optional()`, `src/lib/validation.js:83`) y lo rechaza con **"Invalid input (amount)"** — el sufijo `(amount)` es el nombre técnico del campo agregado automáticamente por el wrapper genérico de errores (`src/lib/http.js:59-65`), no una explicación. No se creó el request (sin pérdida de datos, confirmado: el contador de "New" no subió), pero el usuario se queda sin saber que el problema es "tiene que ser un número entero".
- **Evidencia**: toast capturado con el texto exacto "Invalid input (amount)"; contraste de código:
  ```js
  // RequestForm.jsx — valida solo:
  const valid = ... && amount !== '' && Number(amount) > 0;
  // validation.js — exige además entero:
  amount: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  ```
- **Alcance**: probado en "Special Meals"; aplica a los otros 6 tipos con Amount por compartir el mismo componente y el mismo schema. No probado en anchos/temas distintos.

### [Bajo] Ningún tipo de request tiene un campo de texto libre — "Dietary Restrictions" y "Special Meals" solo piden un número
- **Dónde**: `RequestForm`, tipos "Dietary Restrictions" y "Special Meals" (y, en menor medida, "Condiments"). `src/lib/requests.js` (`REQUEST_TYPES`).
- **Pasos**: 1. Elegir tipo "Dietary Restrictions". 2. El único campo que aparece es "Amount" (numérico, `min="1"`). 3. No hay ningún lugar del formulario para escribir de qué restricción se trata.
- **Esperado**: un tipo de pedido que por naturaleza es cualitativo (qué alumno, qué alergia, qué plato especial) debería poder llevar aunque sea una línea de texto libre.
- **Pasó**: el formulario obliga a poner un número mayor a cero sin ningún campo para el motivo; el equipo de IF Cares recibe, por ejemplo, "Dietary Restrictions, 1 units" sin ninguna pista de qué se trata, y tiene que contactar al sitio aparte para saber qué responder.
- **Evidencia**: `REQUEST_TYPES` en `src/lib/requests.js` — de los 8 tipos, 7 comparten exactamente el mismo campo "Amount" sin variación por tipo.
- **Alcance**: mismo comportamiento en ambos formularios (staff y admin), por ser el mismo componente `RequestForm`.

### [Bajo] No existe paginación en el inbox de `/admin/requests`
- **Dónde**: `/admin/requests`, cualquier pestaña. `src/app/admin/requests/page.jsx`.
- **Pasos**: revisión de código — `visible.map((request) => ...)` renderiza la lista filtrada completa; no hay `slice`, `limit`, cursor ni control de "cargar más" en ningún punto del componente ni de `GET /api/requests` (que tampoco acepta `page`/`limit`, solo `status`).
- **Esperado**: con volumen real (56 sitios activos, ciclo completo), una lista sin paginar puede volverse pesada y difícil de recorrer.
- **Pasó**: no existe ningún mecanismo de paginación, ni siquiera un placeholder. Con el volumen actual (10 requests al cerrar) esto es invisible — es una observación de diseño a futuro, no una falla reproducible hoy.
- **Evidencia**: código de `src/app/admin/requests/page.jsx` y `src/app/api/requests/route.js` (el `GET` no soporta ningún parámetro de paginación).
- **Alcance**: no reproducible con los datos actuales; ver "sin probar" arriba.

---

## Monitoring gate — lo que realmente se observó

Con la sesión real siendo `miqueas@stoicsoftware.io` (cuenta de Desarrollo, en la allowlist por
default de `src/lib/monitoring-access.js`), el comportamiento correcto es que **sí** pueda ver
Monitoring — y así fue:

- `/admin/monitoring` cargó normalmente: "Client errors", "4 problems, 4 occurrences" al momento
  de entrar (ninguno de los 4 pertenece a mis pantallas — 2 en `/counts/2026-08-18` y `/`
  atribuibles a otros agentes trabajando en paralelo sobre `Training Only`, 2 `NEXT_REDIRECT`
  ruido conocido).
- El menú "More" del navbar sí incluye la entrada "Client errors".
- `GET /api/monitoring` devolvió 200 con los datos, no 404.

Esto es el comportamiento **correcto** para esta cuenta — no es un hallazgo. Lo que quedó sin
poder confirmar es el caso que el brief pedía (un admin común, no-Desarrollo, bloqueado): la
sesión compartida por todos los agentes en paralelo en este momento es la misma cuenta de
Desarrollo, y la regla de seguridad prohíbe loguearse con una cuenta distinta. Leyendo el código
(`canSeeMonitoring` en `src/lib/monitoring-access.js`, gate por email exacto contra
`NEXT_PUBLIC_MONITORING_EMAILS`) el bloqueo para cualquier otro email debería funcionar
igual — pero **nadie en esta ronda de agentes paralelos pudo verificarlo en vivo**, porque todos
comparten la misma cuenta de Desarrollo. Vale la pena que quien consolide el reporte final lo
marque como pendiente real, no como "ya cubierto".

---

## Lo que se probó y funcionó correctamente (sin hallazgos)

- **Los 8 tipos de request**, creados uno por uno desde `/requests` (formulario de staff, accesible
  logueado como admin) con sitio `Training Only` en todos los casos: Sporks (25), Meal Increase
  (8), Meal Decrease (3), Change approved meal service time (2:30 PM), Condiments (12), Special
  Meals (4), Dietary Restrictions (1), Amount of milk on hand (2, con doble-click en "Send
  request" para probar duplicado — el botón se deshabilita correctamente vía `loading` y solo creó
  **un** request, confirmado por el contador subiendo de 9 a 10 y no a 11).
- **Validación del lado del cliente antes de tocar la API**: tipo vacío → "Pick what you need."
  (confirmé con `read_network_requests` que no salió ningún `POST /api/requests`); Amount = 0 →
  "Enter a number above zero."; Amount = -5 → mismo mensaje (el input permite escribir el signo
  negativo pero el JS lo bloquea); hora vacía en "Change approved meal service time" → "Pick the
  new time." — en los tres casos el contador de requests no se movió.
- **`/admin/requests`**: los 8 nuevos aparecieron de inmediato con `Training Only` como sitio.
  Buscador global probado con "milk" (matcheó por tipo), "stoicsoftware" (matcheó por
  `requestedBy`, los 8) — el conteo de las pestañas (New/In progress/Resolved/All) se mantuvo
  siempre exacto y no se vio afectado por el texto de búsqueda (se recalcula sobre la lista
  completa, no sobre la filtrada, como corresponde). Pestaña "In progress" vacía mostró el
  `EmptyState` correcto con botón "Clear filters". Botón "Start" (NEW→IN_PROGRESS) probado sobre
  "Meal Increase": toast "Meal Increase marked as in progress", contadores actualizados, fila
  desaparece de "New" tal como se espera del filtro por pestaña.
- **Reabrir limpia la respuesta de verdad, no solo la esconde**: reabrí "Meal Increase" (que tenía
  nota, `respondedBy` y `respondedAt` poblados) y una relectura fresca de `GET /api/requests`
  confirmó `status: "NEW"`, `responseComment: ""`, `respondedBy: ""`, `respondedAt: null` — el
  servidor de verdad borra el registro anterior, no lo oculta nomás en el cliente.
  ```json
  {"status":"NEW","responseComment":"","respondedBy":"","respondedAt":null}
  ```
- **Resolver con nota vacía es honesto sobre lo que hizo**: al resolver "Condiments" sin escribir
  nada en "Note for the site", el toast fue solo *"Condiments resolved"* (sin el subtítulo "The
  site sees your answer..." que sí aparece cuando hay nota) — y en `/requests` esa fila no muestra
  ningún recuadro de respuesta. La app no inventa una confirmación que no corresponde.
- **Caracteres especiales y HTML en la nota de respuesta**: probé
  `Delivered ñ á 'quotes' "double" <script>alert(1)</script> & more — ¿todo bien? 😀` como nota de
  "Meal Increase" — se guardó carácter por carácter (confirmado por API) y se mostró como texto
  literal en `/requests`, sin ejecutarse ni romper el layout (React escapa por defecto). Nota larga
  de 450 caracteres en "Sporks" (bajo el límite de 500 del `maxLength` del textarea) se guardó
  completa y se mostró completa, envuelta correctamente.
- **`/admin/settings`**: sin banner de "Email is not configured yet" — confirmado también por
  `GET /api/reminders` → `"mailReady": true`. Cambié hora (9→2:00 PM) y look back (1→3 days): cada
  cambio se guardó solo (sin botón "Save" propio) y persistió tras una relectura fresca de la API.
  "Always copy" con `training@ifcares.org, test@ifcares.org, not-an-email` → rechazado con
  **"Not an email address: not-an-email"**, y confirmé por API que **nada** quedó guardado (ni
  siquiera los 2 válidos) — el rechazo es atómico, tal como se esperaba. Con solo los 2 válidos,
  guardó correctamente. **Preview**: mostró *"0 overdue days since 2026-08-28, 0 people would be
  written to."* con el ícono de campana y "Nothing is overdue right now." — encabezado explícito
  como "Runs the same search the reminder does, without sending anything.", ninguna palabra que
  sugiera un envío real. Toggle "Send the daily reminder": lo prendí, confirmé por API
  (`"enabled": true`), y lo apagué de inmediato, confirmado de nuevo por API (`"enabled": false`) —
  cumplido el paso obligatorio de la regla de seguridad.
- **El pie de página ya tiene la redacción corregida** (el bug de copy que se arregló esta misma
  sesión sigue arreglado en producción): *"The scheduler calls every hour with a shared secret, so
  the reminder cannot be triggered from outside. Which of those hours actually sends is the hour
  above, decided here: daylight saving never moves it, and changing it takes no deploy. A site is
  only written to inside its own reminder window."* — coincide palabra por palabra con
  `src/app/admin/settings/page.jsx`, menciona que la app decide la hora y menciona la ventana por
  sitio. No quedó rastro de la redacción vieja.
- **Restauración completa**: al cerrar, `GET /api/reminders` mostró exactamente el estado con el
  que empecé: `{"enabled":false,"hour":9,"copyTo":[],"lookBackDays":1,"mailReady":true}`.
- **Chequeos de API adicionales** (fuera del foco explícito del brief, pero relevantes a esta
  área): `GET /api/requests`, `GET /api/reminders` y `POST /api/requests` sin cookie de sesión
  (`credentials: 'omit'`) → 401 "Not signed in." en los tres, nunca 200 ni stack trace.
  `POST /api/requests` con body vacío, tipos incorrectos, enum inválido → 422 "Invalid input
  (requestType)"; JSON roto → 400 "Invalid JSON body."; string de 100.000 caracteres como sitio →
  422 "Site not found." (manejado sin colgarse). `PATCH /api/reminders` con `hour: -1`, `hour: 24`,
  `hour: 9.5`, `lookBackDays: 0`, `lookBackDays: 15` → 422 con mensajes claros en los 5 casos, y
  ninguno alteró el estado guardado. `POST /api/reminders` sin el secreto y con un secreto
  incorrecto → 503 "Reminders are not configured to run." en ambos casos (confirma el gap ya
  conocido de `TEST.md` §7 — el secreto del cron no está configurado — no lo reporto como hallazgo
  nuevo). Ninguna de estas pruebas devolvió 500 en ningún momento.
- **`/admin/monitoring` al cierre**: sin ningún error nuevo atribuible a `/requests`,
  `/admin/requests` o `/admin/settings` — los únicos grupos presentes son de otras pantallas
  (`/counts/...`, `/`) que otros agentes estaban recorriendo en paralelo sobre el mismo
  `Training Only`, más un "sweep sanity check" que parece la prueba de otro agente al propio
  endpoint de monitoring. Consola del navegador de mi propia pestaña sin errores en toda la sesión.

---

## Resumen

Se cubrieron los 10 puntos del brief para `/requests` + `/admin/requests` (los 8 tipos creados,
búsqueda, filtros de estado, respuestas con distinto contenido, reapertura verificada a nivel de
datos) y los 5 de `/admin/settings` (banner de mail, hora/look-back/copyTo, Preview, toggle
on/off con reversión obligatoria confirmada, pie de página). El hallazgo más importante es de
severidad Alto: **responder un request dispara el mail de forma "fire-and-forget" — si Gmail
rechaza el envío, ni el admin que resolvió ni nadie más se entera nunca**, a diferencia del propio
mecanismo de alertas (`notifyFailure`) que la app ya usa para los reminders. Se encontraron además
2 hallazgos Medio (los campos `respondedBy`/`respondedAt` existen en la API pero no se muestran en
ninguna pantalla; el campo "Amount" acepta decimales en el cliente que el servidor rechaza con un
mensaje poco claro) y 2 Bajo (ningún tipo de request tiene texto libre, incluidos los que lo
necesitarían semánticamente; no hay paginación en el inbox). Todo lo demás — creación, búsqueda,
filtros, contadores, resolución, reapertura a nivel de datos, validaciones de formulario,
guardado atómico de "Always copy", Preview, toggle, copy del pie de página, y una batería extra de
chequeos de API (401/422/400/503, nunca 500) — funcionó exactamente como se esperaba. El estado de
`/admin/settings` quedó restaurado byte a byte al valor con el que empezó; los 10 requests de
prueba quedaron en `Training Only` (2 resueltos preexistentes + 2 resueltos por mí + 6 abiertos),
sin necesidad de reversión según las reglas del testeo. Se corrige además la premisa del brief
sobre qué cuenta está logueada (es la de Desarrollo, no un admin común), lo que deja sin poder
confirmarse en esta ronda el caso negativo del gate de Monitoring.

**Conteo de hallazgos**: 1 Alto, 2 Medio, 2 Bajo (5 en total).
