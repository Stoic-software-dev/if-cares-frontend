# Área 6 — Reportes: diario, mensual, consolidados, jobs, envío, firma

Probado contra producción (`https://if-cares-frontend-production.up.railway.app`), sesión admin/desarrollo
ya activa (`miqueas@stoicsoftware.io`, role 3202, `assignedSite: "all"`). Pantallas cubiertas:
`/admin/reports`, `/admin/reports/consolidated`, `/sign/[token]` (pública). Fecha del pase: 31-ago-2026.

## No probado (y por qué)

- **Token de firma vencido ("artificialmente viejo")**: `signTokenSetAt` se compara contra un TTL de 14
  días en el server (`src/app/api/sign/[token]/route.js`); no hay forma de adelantar esa fecha desde la UI
  ni tengo acceso de escritura a la base para simular un token de hace 15 días. Sin acceso a la DB, este
  caso queda sin probar.
- **Paginación / buscador en "Saved claims"**: el componente (`consolidated/page.jsx`) no tiene ni
  paginador ni buscador — `GET /api/reports/generated` trae hasta 200 filas sin `offset`. No hay nada que
  probar ahí; lo señalo como dato para cuando la lista crezca (ver nota al final), no como bug.
- **Cancelar el job de consolidado — confirmación 100% empírica**: lo intenté dos veces contra un job
  real (24 sitios y 57 sitios) tratando de clickear "Cancel" en el instante en que aparece. Las dos veces
  el job ya había terminado (en 2–3s) antes de que mi click llegara — la segunda vez lo confirmé mirando
  la red: nunca salió el `DELETE`. La finding de abajo sobre Cancel está confirmada por lectura de código
  (inequívoca), no por haber visto el bug ocurrir en pantalla. Lo marco explícito en el hallazgo.
- **Reconstrucción "Drive no tiene el archivo"**: no hizo falta forzarlo — en este ambiente los 5 reportes
  que generé (TX por sitio, TX por día, "Every state" nov-2025, OK, y el original) quedaron con
  `stored:false` en `/api/reports/generated` (Drive no guardó ninguno). Cada descarga pasó real y
  naturalmente por `rebuildReport()`, y las 5 veces el PDF resultante fue correcto — así que este punto sí
  quedó probado, sin necesidad de forzar nada. Ver nota al final sobre por qué Drive no está guardando.

---

### [Alto] El selector "State" del consolidado nunca ofrece "OK" — no se puede armar un claim de Oklahoma desde la UI
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**:
  1. Ir a `/admin/reports/consolidated`.
  2. Abrir el select "State".
  3. Leer las opciones disponibles.
- **Esperado**: Debería listar "Every state", "TX" y "OK" (el propio doc de pruebas espera poder armar un
  claim de OK y ver `DC-72-564` impreso — ver SPECS/TEST.md §5.3).
- **Pasó**: El select sólo tiene dos opciones: `"Every state"` y `"TX"`. `"OK"` no aparece nunca, así que es
  imposible seleccionar Oklahoma desde la pantalla — el botón "Build the claim" nunca puede generar un
  claim rotulado "OK" por esta vía.
  Causa (confirmada leyendo código): el front arma la lista de estados parseando el **nombre** de cada
  sitio con una regex (`src/lib/sites.js`, `siteState()`): sólo reconoce nombres que empiezan literalmente
  con `"AAAA/AAAA TX"` o `"AAAA/AAAA OK"`. Ningún sitio activo tiene un nombre con el prefijo `"…OK"` (el
  real es `"OK-Reed Foundation"`, que no matchea la regex), así que `states` nunca contiene `"OK"`.
  Verifiqué que el problema es puramente del front: pegándole directo a la API
  (`POST /api/reports/consolidated` con `{state:"OK", year:2026, month:8, kind:"claim-part1"}`, sin pasar
  por el selector) el backend arma el claim perfecto — 14 filas, incluye `OK-Reed Foundation` con datos
  reales de agosto 2026, y el PDF imprime `Intrinsic Foundation DC-72-564 - OK, August 2026` exactamente
  como se espera (ver `src/lib/report-data.js` `foundationIdFor()`, que sí lee la columna real `state` del
  sitio en la tabla `Site`, no el nombre). O sea: el dato, el `AppSetting foundationId.OK` y el render del
  PDF están perfectos — el único roto es el selector de la pantalla.
- **Evidencia**:
  - `read_page` sobre el combobox "State": `option "Every state" (selected)"`, `option "TX"` — sin `"OK"`.
  - PDF generado saltando la UI: `C:\Users\mique\Downloads\OK 2026-08 claim by site.pdf` (14 filas, incluye
    `OK-Reed Foundation` con 1 día / 1 asistencia / 1 desayuno / 1 cena reales, totales `1,1,0,1`, subtítulo
    `Intrinsic Foundation DC-72-564 - OK, August 2026`).
  - Sitio real activo con datos reales y sin badge de estado: `/admin/sites` página 2, fila
    "OK-Reed Foundation" — "1 submitted / 0 missing / 1 service days this month", sin badge `OK` (a
    diferencia de, p. ej., "Anita Martinez Recreation Center TX").
  - `src/lib/sites.js` líneas 6–14 (`PREFIX` regex y `siteState()`).
- **Alcance**: No depende de ancho ni tema (es un select nativo con datos derivados mal). Pasa con
  cualquier admin. Bloquea por completo la vía normal de reclamar reembolso de un mes de OK.

---

### [Alto] "Sites in this claim" no refleja lo que termina en el PDF: sitios tildados desaparecen del claim y sitios que nunca aparecen en la lista se cuelan igual
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**:
  1. State = `TX`, Month = August, Year = 2026, kind = "By site".
  2. Confirmar en la lista de checkboxes: 24 sitios, los 24 tildados, "24 of 24 sites included".
  3. Build the claim → descargar el PDF resultante (`TX 2026-08 claim by site.pdf`).
  4. Contar y comparar filas del PDF contra los 24 nombres que aparecían tildados en la pantalla.
- **Esperado**: El PDF debería tener exactamente las filas de los sitios que la pantalla mostró como
  incluidos (24), ni más ni menos — es la única forma en que "excluir sitios" significa algo.
- **Pasó**: El PDF trae **35 filas**, no 24. Y no es sólo que sobren filas — pasan las dos cosas a la vez:
  - **Sitios tildados que faltan en el PDF (7)**: Anita Martinez Recreation Center, Eloise Lundy Recreation
    Center, Fireside Recreation Center, Fretz Recreation Center, Martin Weiss Recreation Center, MLK Jr.
    Recreation Center, Wille B. Johnson Recreation Center. Todos están activos, con badge `TX` en
    `/admin/sites` y con counts reales de agosto 2026 (p. ej. Eloise Lundy: 10 submitted este mes) — esos
    datos reales simplemente no aparecen en ningún renglón del claim, a pesar de estar tildados.
  - **Sitios que nunca se mostraron en la lista de checkboxes y aun así aparecen en el PDF (18)**:
    Advantage-Intrinsic Foundation (con datos reales: 1 día, 5 asistencia), BGC Cooke, Casa del Lago, COD
    Churchill Rec Center, COD JJ Craft Recreation Center, COD Lake Highlands North Recreation Center, COD
    Lake Highlands Teens, COD Pleasant Oaks Rec Center, COD Reverchon Rec Center, Harry Stone Rec Center,
    PTNT Christ's Foundry, PTNT Owenwood, Readers2Leaders, Tulsa Dream Center West Campus, TWU Clubhouse,
    VOH Uplift Grand, Voice of Hope Ministries, ZZ QA TEST SITE 20260831 RENAMED. El admin nunca tuvo la
    chance de verlos ni de excluirlos porque el checklist (para `state=TX`) sólo muestra los sitios cuyo
    **nombre** empieza con el prefijo legacy `"2025/2026 TX "` — la misma regex `siteState()` del hallazgo
    anterior. El backend, en cambio, filtra por la columna real `state` de cada sitio, así que cualquier
    sitio con `state` real "TX" (u otro valor que matchee) entra al claim exista o no exista en la lista
    que vio el admin.
  - Total: 17 sitios con prefijo legacy sí coinciden entre pantalla y PDF; 7 tildados-pero-ausentes + 18
    nunca-mostrados-pero-presentes = 35 filas reales. La cuenta "24 of 24 sites included" que ve el admin
    antes de construir el claim no tiene relación real con lo que termina impreso.
- **Evidencia**:
  - Captura de la lista "Sites in this claim" con `state=TX`: "24 of 24 sites included".
  - `C:\Users\mique\Downloads\TX 2026-08 claim by site.pdf` — 35 filas, totales 998 asistencia / 1211
    comidas (coincide con lo que reportó el toast: "35 rows, 998 attendance and 1211 meals claimed").
  - `/admin/sites` (paginado, 57 sitios) mostrando el badge `TX` y counts reales de agosto 2026 para los 7
    sitios "tildados pero ausentes".
  - Causa: `src/lib/sites.js` `siteState()` (regex sobre el nombre) usado en el front para armar `states` e
    `inScope`, contra `src/lib/report-data.js` `consolidatedBySite()` que filtra por la columna `state` real
    de `Site` en la base. Mismo mecanismo raíz que el hallazgo de "OK" de arriba, pero con un síntoma
    distinto y más grave: acá el problema no es "no se puede armar el claim", es "el claim que sí se arma
    no es el que el admin cree que está armando", con datos reales de asistencia/comidas de por medio.
- **Alcance**: Reproducido con `state=TX`, agosto 2026. Por el mismo mecanismo, es esperable en cualquier
  mes/estado con sitios que no tengan el prefijo legacy en el nombre — es decir, en cualquier sitio dado de
  alta después de la migración inicial. No depende de ancho ni tema.

---

### [Alto] La firma pública del claim (`/sign/[token]`) acepta un solo punto como firma válida — no hay mínimo de trazo, a diferencia del resto de la app
- **Dónde**: `/sign/[token]` (pública, sin sesión)
- **Pasos**:
  1. Desde `/admin/reports/consolidated`, generar un signing link para un claim (`POST
     /api/reports/generated/{id}`) y abrirlo en una pestaña nueva.
  2. Completar "Your name" y "Title".
  3. En el recuadro de firma, hacer un solo click (sin arrastrar) — deja un punto.
  4. Click en "Sign this claim".
  5. Repetir el link (mismo token) para confirmar que ya no abre.
- **Esperado**: Un punto no debería alcanzar. En el resto de la app hay una regla explícita para esto —
  `src/components/meal-count/SignatureField.jsx` (la firma del meal count diario) mide la longitud real del
  trazo y exige `MIN_STROKE_LENGTH = 30`px, con el comentario textual: *"A tap leaves a dot, and a dot is
  not a signature: ink only counts once the stroke has real length, which is what the paper form means by
  signing."* Es razonable esperar la misma regla en la firma pública de un claim de reembolso, que es un
  documento con más peso legal que el meal count diario.
- **Pasó**: El punto fue aceptado. La pantalla pasó a "Signed" ("`{fileName}` now carries your signature…
  The link will not open again") y quedó grabado en la base:
  `signedAt: "2026-09-01T02:29:09.499Z", signedBy: "QA Test Signer (dot test)"`.
  Revisando el código (`src/app/sign/[token]/page.jsx`): la validación de tinta es sólo
  `hasInk && !padRef.current?.isEmpty()`, y `hasInk` se pone en `true` en el `onEnd` del canvas — que
  dispara con cualquier trazo, incluido un click sin arrastre. No hay ningún cálculo de longitud de trazo
  acá (a diferencia de `SignatureField.jsx`). Tampoco lo valida el server:
  `signReportSchema` (`src/lib/validation.js`) sólo exige que la firma sea un PNG en base64
  (`data:image/png;base64,...`, máx. 400.000 caracteres) y que el nombre tenga 2+ caracteres — nada sobre
  el contenido real del trazo.
- **Evidencia**: Capturas de pantalla del punto dibujado y de la pantalla "Signed"; respuesta de
  `GET /api/reports/generated` mostrando `signedBy: "QA Test Signer (dot test)"` en el reporte
  `cmti1mp8x005jmp0xzdob2ujf`; comparación de código entre
  `src/app/sign/[token]/page.jsx` (sin mínimo) y `src/components/meal-count/SignatureField.jsx` (con
  `MIN_STROKE_LENGTH = 30`, línea 10).
- **Alcance**: No depende de ancho ni tema — es lógica de validación, no de layout. Reproducible con
  cualquier claim con signing link activo.

---

### [Alto] No existe ningún control en la UI para revocar un signing link — el endpoint existe y funciona, pero es inalcanzable
- **Dónde**: `/admin/reports/consolidated`, rol admin
- **Pasos**:
  1. Generar un signing link para un claim ("Signing link" en la fila del claim).
  2. Buscar en la pantalla (fila del claim, menús, cualquier lugar) una acción de "revocar" / "revoke" /
     "withdraw" el link.
- **Esperado**: Según el propio plan de pruebas (TEST.md §5.3: "…y revocar un token de firma"), tiene que
  existir una forma de invalidar un link ya emitido — por ejemplo, si se mandó a la persona equivocada.
- **Pasó**: No hay ningún botón, ícono ni menú para esto. Revisé el componente completo
  (`src/app/admin/reports/consolidated/page.jsx`): la fila de cada claim sólo tiene tres acciones posibles
  — Download, Send, y (Signing link / New link). Confirmé además, buscando en todo `src/`, que no hay
  **ningún** lugar del frontend que llame a `DELETE /api/reports/generated/[id]` (el único `DELETE` que
  dispara esa pantalla es para cancelar el job de construcción, algo completamente distinto). El endpoint
  de revocación sí existe y funciona perfectamente en el backend — lo probé pegándole directo:
  `DELETE /api/reports/generated/{id}` devolvió `{result:"success"}`, y el link (que abría bien un segundo
  antes) pasó a mostrar "This link cannot be opened / This link is not valid, or it has already been used."
  El único "escape hatch" indirecto que tiene el admin hoy es clickear "New link", que sí pisa el token
  viejo como efecto secundario — pero no revoca sin reemplazar: automáticamente dispara *otro* link activo
  que hay que mandar a alguien, no apaga el acceso sin más.
- **Evidencia**:
  - Lectura completa de `src/app/admin/reports/consolidated/page.jsx` (las tres acciones de la fila,
    líneas ~388–418) y búsqueda `grep -rn "revoke\|DELETE" src/app/admin/reports/` sin resultados de UI.
  - Llamado directo `DELETE /api/reports/generated/cmti1phlu0066mp0xwb3xjd6z` → `200 {"result":"success"}`.
  - Reapertura del mismo link tras el DELETE → "This link cannot be opened / This link is not valid, or it
    has already been used." (confirma que el revoke del backend sí funciona).
- **Alcance**: Afecta a todo admin, cualquier ancho/tema (falta un control, no es un problema de layout).

---

### [Alto] "Cancel" en el job del consolidado no detiene el trabajo — puede terminar y guardarse igual después de cancelado (confirmado por código, no lo pude ver ocurrir en pantalla)
- **Dónde**: `/admin/reports/consolidated`, rol admin — `POST/GET/DELETE /api/reports/consolidated`
- **Pasos** (los que haría un admin): 1. Build the claim. 2. Click en el ícono "Cancel" (X) apenas aparece,
  mientras el status todavía dice "processing". 3. Esperar y revisar si el claim aparece igual en "Saved
  claims" minutos después.
- **Esperado**: Cancelar tendría que impedir que el job termine y que se cree el `GeneratedReport` — o al
  menos, que si el trabajo ya no se puede interrumpir a mitad de camino, su resultado se descarte y nunca
  aparezca en la lista.
- **Pasó**: Leyendo `src/lib/report-jobs.js` el comportamiento es este — y es inequívoco:
  ```js
  export function cancelJob(id) {
    const job = jobs.get(id);
    if (job && job.status === 'processing') {
      job.status = 'error';
      job.error = 'Cancelled.';
      job.finishedAt = Date.now();
      return true;
    }
    return false;
  }
  ```
  `cancelJob` muta el mismo objeto `job` que ya está guardado en el `Map`, pero **no cancela ni interrumpe
  la promesa `work(report)`** que sigue corriendo en el `then` original de `startJob`:
  ```js
  Promise.resolve().then(() => work(report)).then((result) => {
    job.status = 'completed';   // pisa lo que haya dejado cancelJob
    job.result = result ?? null;
    job.finishedAt = Date.now();
  })
  ```
  Como `job` es el mismo objeto por referencia, si `work()` sigue corriendo cuando se cancela, en cuanto
  termina este segundo `.then` **pisa el estado "Cancelled" y lo vuelve a poner en "completed"** con el
  resultado real — incluyendo el intento de guardarlo en Drive y la creación real de la fila
  `GeneratedReport` en la base. El propio comentario del archivo lo admite: *"The work itself cannot be
  interrupted, but a cancelled job stops being waited on and stops occupying the screen"* — es decir, lo
  único que hace Cancel es que la pantalla deje de mirarlo, no que el trabajo se frene. Encima, el propio
  `DELETE` de la ruta ignora el valor de retorno de `cancelJob()` y siempre contesta
  `{result:"success"}` (`src/app/api/reports/consolidated/route.js`), así que ni el llamador puede saber si
  el cancel realmente alcanzó a un job todavía "processing" o si llegó tarde.
  **Intento empírico**: probé cancelar dos veces contra jobs reales (TX/24 sitios y TX-por-día/24 sitios),
  clickeando "Cancel" apenas se veía "processing"/"Starting". Las dos veces el job ya había terminado
  (arma el PDF, lo intenta subir a Drive y graba en la base en 2–3 segundos) antes de que mi click llegara
  a impactar — en el segundo intento lo confirmé mirando la red del navegador: nunca salió el `DELETE`. No
  pude forzar la ventana de carrera a mano porque estos jobs, en este dataset, corren más rápido que el
  round-trip de mis herramientas de browser. El hallazgo queda confirmado por lectura de código (clara y
  no ambigua), no por haberlo visto ocurrir en pantalla — lo marco así de manera explícita.
- **Evidencia**: `src/lib/report-jobs.js` líneas 27–63 (`startJob` y `cancelJob`);
  `src/app/api/reports/consolidated/route.js` handler `DELETE`; capturas de los dos intentos de cancelación
  mostrando el job ya "Claim ready" inmediatamente después del click en X;
  `read_network_requests` del segundo intento sin ningún `DELETE` a `/api/reports/consolidated`.
- **Alcance**: No depende de ancho/tema. Esta es exactamente la categoría que TEST.md marca como la más
  importante de la app — "dice que hizo algo que no hizo": la pantalla borra el job y el admin cree que lo
  frenó, pero el archivo puede terminar guardado en Drive y en la lista de claims igual.

---

## Lo que sí anduvo bien (para que quede registrado, no todo fue hallazgo)

- **PDF diario** (Training Only, 2026-08-04): descargado y abierto — roster completo, horarios, totales por
  columna (10/0/0/9/10) y firma correctos. `C:\Users\mique\Downloads\MealCount_Training_Only_2026-08-04 (1).pdf`.
- **PDF mensual** (Training Only, agosto 2026): descargado y abierto — 4 días filados, totales por día y
  fila de totales correctos, coincide con el diario. `C:\Users\mique\Downloads\Training Only 2026-08 monthly.pdf`.
- **Foundation id de TX**: correcto (`Intrinsic Foundation CEID 1707 - TX, …`) en los dos tipos de claim
  ("by site" y "by day"), con matemática interna consistente entre ambos (998 asistencia, 1211 comidas en
  los dos).
- **Búsqueda de sitios + atajos "Exclude all"/"Include all"**: funcionan bien dentro del universo de sitios
  que sí se muestran (ver hallazgo de arriba sobre cuáles se muestran).
- **Bloqueo de "0 sitios incluidos"**: confirmado — con 0 de 24 incluidos, "Build the claim" queda
  deshabilitado de verdad (clickearlo no dispara nada).
- **Reconstrucción cuando Drive no tiene el archivo**: funcionó de punta a punta, sin forzar nada — los 5
  claims que generé quedaron con `stored:false` (Drive no guardó ninguno en este ambiente — ver nota
  abajo) y las 5 descargas pasaron por `rebuildReport()` con contenido correcto cada vez.
- **Link de un solo uso**: confirmado — reabrir el mismo link de firma después de usado da
  "This link is not valid, or it has already been used." Un token inventado da exactamente el mismo
  mensaje (sin fuga de información sobre si existió, ya se usó, o nunca existió).
- **"Nunca los dos juntos" (mail vs. signing link)**: el diálogo de "Send" fuerza un modo exclusivo
  (Segmented de un solo valor: "The document" o "A signing link"), y el modo "A signing link" queda
  deshabilitado con aviso si el claim no tiene link generado todavía. No hay forma de mandar ambos en la
  misma acción.
- **Envío por mail**: probado una vez, sólo a `training@ifcares.org`. Falló con `"Invalid email or User ID"`
  — esto es el problema **ya conocido** de TEST.md §7 (`MAIL_FROM=noreply@ifcares.org` no existe como
  usuario del Workspace), no lo reporto como bug nuevo. Lo importante: la pantalla mostró un toast de error
  de verdad, no un falso "enviado con éxito" — no cae en la categoría "dice que hizo algo que no hizo".

## Nota aparte (no es hallazgo, es contexto para IF Cares/dev)

Los 5 reportes que generé durante esta pasada (`TX 2026-08 claim by site.pdf`,
`TX 2026-08 claim by day.pdf`, `All 2025-11 claim by site.pdf`, `OK 2026-08 claim by site.pdf`, y el
primero de la sesión) quedaron con `stored:false` — Drive no guardó ninguno. La app lo tolera bien (por
eso pude confirmar la reconstrucción tan a fondo), pero si la intención es que estos claims sí queden
archivados en el Drive de IF Cares, vale la pena que alguien con acceso al server revise si
`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` están cargadas en este ambiente — no
tengo forma de verlo desde acá (el error se traga con `console.warn` del lado del servidor, no llega al
monitor de errores de cliente). Quedan 4 reportes de prueba (más uno ya firmado con un punto) en la lista
de "Saved claims" de producción — identificables por su nombre/fecha, no tocan datos de sitios/counts/
alumnos, pero alguien puede querer limpiarlos antes del cutover.

## `/admin/monitoring` al cierre

Un solo hallazgo activo, y **no es mío**: `Minified React error #185` en `/counts/2026-08-18`, 1 vez, hace
~22 min al momento de este chequeo, del mismo usuario compartido (`miqueas@stoicsoftware.io`). No es
`NEXT_REDIRECT` así que no es el ruido ya conocido, pero tampoco es una pantalla de mi área (`/counts/…` es
de los agentes 2/5) ni lo generó nada de lo que hice acá — lo dejo anotado para que no se pierda, no lo
sumo a mis hallazgos. Mi propia navegación (`/admin/reports`, `/admin/reports/consolidated`, `/sign/…`) no
agregó ninguna fila nueva.

---

## Resumen

- **Bloqueante**: 0
- **Alto**: 5
- **Medio**: 0
- **Bajo**: 0

Recorrí a fondo `/admin/reports` (PDF diario y mensual) y `/admin/reports/consolidated` (construcción de
claims, job asíncrono con su polling y cancelación, foundation id, link de firma pública, envío,
revocación), más la pantalla pública `/sign/[token]`. El hallazgo más importante — y el que el propio brief
marcó como el más importante de toda el área — es que **el estado "OK" no se puede seleccionar nunca** en
el constructor de consolidados, aunque el backend, el `AppSetting` del foundation id (`DC-72-564`) y el
render del PDF funcionan perfecto cuando se les pasa `state:"OK"` por fuera de la UI: el problema es
exclusivamente que la pantalla deriva "qué estados existen" y "qué sitios son de tal estado" parseando el
*nombre* del sitio con una regex vieja, en vez de usar la columna real `state` de la base. Ese mismo defecto
tiene una segunda cara, más grave en la práctica: al construir un claim de TX real, el checklist mostró
"24 of 24 sites included" pero el PDF resultante trajo 35 filas — con 7 sitios tildados que directamente no
aparecen (perdiendo sus datos reales de agosto 2026 del claim) y 18 sitios que nunca se mostraron en pantalla
coláandose igual. A esto se suman tres hallazgos más: la firma pública del claim acepta un solo punto como
firma válida (a diferencia de la firma del meal count diario, que sí exige un trazo real de 30px+); no existe
ningún botón en toda la pantalla para revocar un signing link ya emitido (el endpoint funciona perfecto,
sólo que nada lo llama); y "Cancel" en el job del consolidado no frena el trabajo de verdad — por código
queda confirmado que el job puede terminar y guardarse en Drive/base igual después de cancelado, aunque no
pude forzar el timing exacto para verlo ocurrir en pantalla porque estos jobs corren más rápido (2–3s) que
el round-trip de mis herramientas. Todo lo demás — PDF diario, PDF mensual, reconstrucción sin Drive,
bloqueo de "0 sitios", atajos de inclusión/exclusión, un solo uso del link de firma, rechazo de token
inventado, y el "nunca los dos juntos" de mail vs. link — funcionó como se esperaba. `/admin/monitoring`
no sumó ninguna fila nueva por mi testeo.