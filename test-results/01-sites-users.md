# Sites & Users admin — hallazgos (Agente 3)

Corrido contra `https://if-cares-frontend-production.up.railway.app`, sesión compartida
logueada como `miqueas@stoicsoftware.io` (rol desarrollo/admin). Sitio de prueba creado:
`ZZ QA TEST SITE 20260831` (renombrado a `ZZ QA TEST SITE 20260831 RENAMED` durante el
pase, desactivado al final). Usuario de prueba: `zz.qatest.user@example.invalid`
(desactivado al final). Ningún sitio ni usuario real fue modificado.

## No testeado deliberadamente

- **Responsive 768px**: `resize_window` no tuvo efecto real en este navegador compartido
  — `window.innerWidth` quedó en 1080 tanto antes como después de pedir 768×900 y 768×1024
  dos veces. Marcado como no verificado, tal como permite la consigna cuando el resize no
  está disponible.
- **Tema oscuro / claro**: no se tocó el toggle de tema; no estaba en el listado explícito
  de mi consigna y prioricé el resto del checklist.
- **Navegación por teclado (Tab/Escape/Ctrl+K)** en estas pantallas: no cubierto por tiempo.
- **Llamada real `PATCH /api/users/{miPropioId}` con `active:false`**: deliberadamente NO
  se ejecutó contra la sesión compartida real, aunque el hallazgo Alto #1 de abajo hace que
  el botón esté disponible en la UI. Se verificó en cambio por lectura de código
  (`src/app/api/users/[id]/route.js` líneas 29-31: el guard server-side es incondicional,
  usa `session.user.id` real —no el objeto recortado del cliente— y corre antes de
  cualquier `prisma.user.update`) más la ausencia del control en la fila propia de OTRO
  admin de prueba (no se puede probar "no soy yo" sin arriesgar la sesión compartida de
  siete agentes más). Esto es una decisión de seguridad explícita, no un olvido.
- **Import de roster por archivo/paste**: no existe ningún mecanismo de este tipo en el
  código (`grep` sobre `src/app` no encuentra ninguna ruta ni componente de import/bulk/csv
  para alumnos). Las pruebas de "filas inválidas" se hicieron en cambio contra el único
  mecanismo real, el diálogo "Add student" uno por uno.
- **Propagación de un rename sobre un sitio real con usuarios/roster reales asignados**: no
  se tocó ningún sitio real. El mecanismo de rename se verificó exhaustivamente sobre mi
  propio sitio de prueba (roster de 1 alumno + 26 `ServiceDay` sobrevivieron intactos al
  rename, confirmado por API).
- Duplicado de **nombre de sitio** (crear un sitio con el mismo nombre que uno real
  existente): confirmado por lectura de código que devuelve 409
  (`src/app/api/sites/route.js`), no ejecutado en vivo porque no estaba pedido
  explícitamente y para no arriesgar ninguna confusión con datos reales.
- Paginación completa de `/admin/users` (páginas 2-5) y el selector "Sort by missing
  counts" de Sites: solo verificados superficialmente, no cada página.

---

### [Alto] El control "Deactivate" de la propia cuenta logueada no se oculta — la auto-protección del cliente está rota para todos los admins

- **Dónde**: `/admin/users`, menú "..." de cualquier fila, rol Admin
- **Pasos**:
  1. Loguear como cualquier admin (probado con la cuenta compartida `miqueas@stoicsoftware.io`).
  2. Ir a `/admin/users`, buscar la propia cuenta (coincide con el nombre/mail que devuelve `/api/auth/me`).
  3. Abrir el menú "..." de esa misma fila.
- **Esperado**: Igual que en el código (`src/app/admin/users/page.jsx`), la fila del usuario
  logueado no debería mostrar "Deactivate"/"Reactivate" — solo "Edit user" y "Password link"
  — exactamente como sí ocurre correctamente en las filas de cualquier otro usuario.
- **Pasó**: El menú muestra "Deactivate" también en la fila propia. Causa raíz confirmada
  por código: `GET /api/auth/me` (`src/app/api/auth/me/route.js`) devuelve el usuario vía
  `toLegacyUser()` (`src/lib/legacy.js` líneas 20-29), cuya forma es
  `{name, lastname, email, role, assignedSite, expiresAt}` — **sin campo `id`**.
  `AuthProvider` (`src/components/auth/AuthProvider.jsx`) guarda ese objeto tal cual como
  `sessionUser`. La página de usuarios oculta el bloque de deactivate con
  `{user.id !== sessionUser?.id && (...)}` (línea ~549) — como `sessionUser?.id` es
  `undefined` siempre, la comparación es `true` siempre, para cualquier admin, en cualquier
  fila, incluida la propia. No es un bug de esta cuenta en particular: es estructural y
  afecta a los 17 administradores actuales por igual.
- **Evidencia**: captura con el menú abierto sobre la fila "Miqueas Freiberger /
  miqueas@stoicsoftware.io" mostrando "Edit user / Password link / Deactivate" — esa fila
  es la cuenta con la que está logueada la sesión que tomó la captura (confirmado contra
  `/api/auth/me`, mismo email). Código citado arriba.
- **Alcance**: No depende de ancho ni tema (es lógica de React, no CSS). Afecta a **todas**
  las cuentas Admin, no solo a la de desarrollo. La mutación en sí (`PATCH` con
  `active:false`) tiene un segundo guard, independiente, en el servidor
  (`src/app/api/users/[id]/route.js` líneas 29-31) que sí usa el id real de sesión y que no
  comparte este bug — por eso se clasifica Alto y no Bloqueante — pero la app le está
  mostrando y dejando clickear a cualquier admin una acción que nunca debería ofrecerle, y
  la única red de seguridad real vive del lado del servidor sin que la UI lo sepa.

---

### [Alto] Guardar la edición de un sitio no refresca el panel "Program details" — la pantalla parece haber ignorado el cambio aunque se guardó

- **Dónde**: `/admin/sites/detail?site=…`, tab Overview, rol Admin
- **Pasos**:
  1. Abrir un sitio, tab Overview, ver el panel "Program details" (Site number: `9999-QA`).
  2. Menú "..." → Edit site → cambiar Site number a `9999-QA-EDITED` → Save changes.
  3. Toast "Site saved". Sin recargar ni navegar, mirar de nuevo el panel "Program details".
- **Esperado**: El panel debería mostrar `9999-QA-EDITED` inmediatamente.
- **Pasó**: El panel sigue mostrando `9999-QA` (el valor viejo). Se confirmó por API que el
  dato SÍ se guardó correctamente en la base (`GET /api/sites/data?site=…` ya devolvía
  `9999-QA-EDITED` en el mismo instante). Al recargar la página (F5 / renavegar la misma
  URL) el panel sí muestra el valor correcto. Causa raíz: `saveSite()` en
  `src/app/admin/sites/detail/page.jsx` llama a `loadRecord()` (recarga `record`, usado
  para precargar el diálogo de edición) pero no a `load()` (que es quien puebla `info`, el
  estado que efectivamente pinta el panel "Program details"). Son dos fetches y dos estados
  distintos y solo uno se refresca.
- **Evidencia**: captura inmediatamente después de "Site saved" mostrando "SITE NUMBER:
  9999-QA" (viejo); respuesta de `/api/sites/record` en el mismo momento devolviendo
  `"siteNumber":"9999-QA-EDITED"`; captura después de recargar mostrando el valor correcto.
- **Alcance**: Se reproduce con cualquier campo editado desde este mismo diálogo sin
  cambiar el nombre (ceName, siteNumber, state, siteName, fechas del programa) — el rename
  no sufre esto porque fuerza una navegación completa (`window.location.replace`). Es
  exactamente el patrón "dice que hizo algo que no hizo" que pide priorizar la consigna: el
  toast dice éxito (y es cierto), pero la pantalla que el admin está mirando no lo refleja.

---

### [Alto] Desactivar un sitio lo hace invisible en toda la UI — no hay forma de encontrarlo ni reactivarlo salvo escribiendo la URL exacta de memoria

- **Dónde**: `/admin/sites`, rol Admin
- **Pasos**:
  1. Crear un sitio de prueba, confirmar que aparece en `/admin/sites` (57 activos).
  2. Desde la ficha del sitio, menú "..." → "Deactivate site".
  3. Volver a `/admin/sites` y buscar el sitio por nombre.
- **Esperado**: Mi propia consigna (y la sección 5.3 del plan general) asume que existe un
  toggle "show inactive" en el listado de sitios, igual que en `/admin/users`.
- **Pasó**: No existe ningún control de este tipo en `/admin/sites` — solo hay buscador y
  "Sort by name/missing". Confirmado por código: `GET /api/sites`
  (`src/app/api/sites/route.js`) no lee ningún query param, y `visibleSites()`
  (`src/lib/auth.js` líneas 113-121) filtra `active: true` sin excepción, para admin
  incluido. Tras desactivar mi sitio de prueba, buscar "ZZ QA" en `/admin/sites` devuelve
  "No site matches" y el contador vuelve a 56. El registro sigue existiendo intacto en la
  base (`active:false`, roster y los 26 `ServiceDay` completos, mismo id) pero es
  inalcanzable desde la UI salvo tipeando a mano
  `/admin/sites/detail?site=<nombre completo exacto>`. No hay ningún listado, filtro, ni
  siquiera un parámetro de query soportado que lo traiga de vuelta.
- **Evidencia**: contador "56 active sites" tras desactivar (era 57); búsqueda "ZZ QA" →
  "No site matches"; respuesta de `/api/sites/record?site=…` mostrando
  `"active":false,"students":1,"serviceDays":26` (el dato sigue ahí) junto con
  `appearsInSitesList:false` contra `GET /api/sites`.
- **Alcance**: Afecta a cualquiera de los 56 sitios reales — como no existe un hard delete
  para sitios, desactivar es la única acción "de salida", y en la práctica es
  prácticamente unidireccional salvo que el admin recuerde el nombre completo exacto
  (muchos son largos y hay pares muy parecidos, ej. "COD Churchill Rec Center" vs
  "COD CHURCHILL REC CENTER"). No depende de ancho ni tema.

---

### [Medio] El campo "Age" del alta de alumno dice "Optional" pero el guardado siempre falla si se deja vacío

- **Dónde**: `/admin/sites/detail?site=…` → tab Roster → "Add student", rol Admin
- **Pasos**:
  1. Abrir "Add student", cargar solo el nombre, dejar "Age" vacío (el hint dice
     "Optional.").
  2. Click "Add to roster".
- **Esperado**: Debería guardarse sin edad, tal como promete el hint del campo.
- **Pasó**: Falla siempre con un toast rojo: "Please enter either an age or a birthdate.
  (age)" — un campo (`birthdate`) que no existe en ningún lugar de este diálogo. Causa
  raíz: la validación del lado cliente en `StudentDialog`
  (`src/app/admin/sites/detail/page.jsx`) sí trata la edad como opcional
  (`ageValid = age === '' || (...)`), pero `addStudentSchema`
  (`src/lib/validation.js`) exige `age !== undefined || birthdate` — y este diálogo nunca
  recolecta `birthdate`, así que la combinación "sin edad" es matemáticamente imposible de
  guardar desde acá, pese a que el propio formulario dice que el campo es opcional.
- **Evidencia**: captura del toast de error tras enviar solo el nombre.
- **Alcance**: Se repite siempre, cualquier ancho/tema. Rodeo existente: cargar cualquier
  edad (el problema es solo cuando se deja realmente vacío, que es el caso que el propio
  hint invita a hacer).

---

### [Medio] "Remove" en el roster es un borrado permanente e irreversible presentado con lenguaje de acción reversible, y el "deactivate" que el schema sugiere no existe en ningún lado

- **Dónde**: `/admin/sites/detail?site=…` → tab Roster → menú "..." de un alumno, rol Admin
- **Pasos**:
  1. Abrir el menú de un alumno del roster — las únicas opciones son "Edit" y "Remove".
  2. Click "Remove" → confirmar.
- **Esperado**: La consigna original pide poder "desactivar" un alumno (acción reversible,
  en paralelo a cómo se maneja todo lo demás en esta misma pantalla: sitios y usuarios sí
  tienen desactivar/reactivar).
- **Pasó**: No existe ninguna acción de desactivar para alumnos. "Remove" es un hard delete
  real: `DELETE /api/students/[id]` (`src/app/api/students/[id]/route.js`) ejecuta
  `prisma.student.delete(...)` — sin posibilidad de deshacer desde la UI (habría que
  recrear el alumno a mano, con un id nuevo). El propio schema de Prisma tiene
  `Student.active Boolean @default(true)` (indexado, y efectivamente LEÍDO por
  `/api/students/roster` con `where: { active: true }`), pero un `grep` completo del
  código no encuentra ningún endpoint ni control de UI que alguna vez escriba
  `active: false` sobre un Student — el campo existe en la base pero el camino para
  apagarlo nunca se conectó a nada. Encima, el diálogo de confirmación usa un lenguaje que
  suena reversible/suave ("The student stops appearing on new meal counts for this site...
  Counts already submitted keep this student exactly as they were filed.") sin decir en
  ningún momento que la fila del alumno se borra para siempre.
- **Evidencia**: menú del roster mostrando solo "Edit"/"Remove"; texto del diálogo de
  confirmación citado arriba; `prisma/schema.prisma` líneas 61-79 (`Student.active`,
  `@@index([siteId, active])`) vs. ausencia total de escrituras a ese campo en
  `src/app/api/students/**`.
- **Alcance**: Los datos de counts ya enviados no se pierden (`MealCountEntry` guarda
  name/age como snapshot propio, `studentId` solo queda en null) — confirmado en
  `prisma/schema.prisma` líneas 139-158 — así que el impacto es acotado a la ficha del
  alumno en sí, no al historial de comidas servidas.

---

### [Medio] El alta/edición de usuario bloquea guardar un Staff sin sitios, aunque ~47 cuentas reales ya existen en ese estado exacto y la API lo permite sin problema

- **Dónde**: `/admin/users` → "Add user" / "Edit user", rol Admin
- **Pasos**:
  1. Add user (o editar un usuario existente): rol "Site staff", "All sites" apagado, 0
     sitios seleccionados.
  2. Click "Create user" / "Save changes".
- **Esperado**: Sin opinión previa fuerte, pero el estado "Staff sin ningún sitio" es
  válido y ya existe masivamente en producción (documentado: 47 de 63 usuarios reales
  parten así), y ni `createUserSchema` ni `updateUserSchema`
  (`src/app/api/users/route.js`, `src/app/api/users/[id]/route.js`) imponen un mínimo de
  sitios — la API lo acepta sin quejarse.
- **Pasó**: El diálogo bloquea el envío del lado del cliente
  (`sitesValid = form.allSites || form.role === 'ADMIN' || form.sites.length > 0`
  en `src/app/admin/users/page.jsx`) — el conteo "0 selected" se pone en rojo, no sale
  ningún toast explicando por qué, y no se dispara ningún request. Probado de punta a
  punta de forma segura sobre mi propio usuario de prueba (crear con 0 sitios → bloqueado;
  asignar Training Only para poder crear; luego editar y sacarle el sitio de nuevo →
  bloqueado otra vez, mismo comportamiento). Efecto práctico: si un admin abre cualquiera
  de las ~47 cuentas reales sin sitio para corregir, por ejemplo, un apellido mal escrito,
  y hace click en Save sin tocar la sección de sitios, el guardado queda bloqueado por esta
  misma validación — se ve forzado a asignarle un sitio o "All sites" que no pidió, solo
  para poder guardar un cambio no relacionado.
- **Evidencia**: dos capturas — alta con "0 selected" en rojo tras intentar guardar; edición
  del mismo usuario, sacando el único sitio asignado y reintentando guardar, mismo bloqueo.
- **Alcance**: Reproducido únicamente sobre mi propio usuario de prueba, nunca sobre una
  cuenta real (ver "No testeado" — no se guardó ningún cambio real para verificar esto en
  vivo sobre las 47 cuentas reales, pero el código de validación es el mismo en ambos
  diálogos, alta y edición).

---

### [Medio] Desactivar un sitio no pide ninguna confirmación, a diferencia de cada otra acción destructiva equivalente en la misma app

- **Dónde**: `/admin/sites/detail?site=…`, menú "...", rol Admin
- **Pasos**: Menú "..." → "Deactivate site".
- **Esperado**: Coherencia con el resto de la app: desactivar un usuario tiene un
  `ConfirmDialog` con lista de consecuencias; borrar un alumno del roster tiene un
  `ConfirmDialog` con lista de consecuencias. Desactivar un sitio —una acción sobre una
  entidad potencialmente mucho más grande, con roster y calendario propios— debería tener
  al menos el mismo nivel de fricción.
- **Pasó**: El click dispara el `PATCH` inmediatamente (toast "Site deactivated" aparece
  sin ningún diálogo intermedio). Un solo click accidental en ese item del menú desactiva
  el sitio sin posibilidad de arrepentirse antes de que ocurra.
- **Evidencia**: secuencia de capturas mostrando el click sobre "Deactivate site" seguido
  inmediatamente del toast de éxito, sin ningún paso intermedio.
- **Alcance**: Se combina directamente con el hallazgo Alto de arriba ("no hay forma de
  encontrarlo después") — la falta de confirmación más la falta de un camino de vuelta
  hacen que esta acción sea más riesgosa que el resto de las acciones "destructivas" de la
  app.

---

### [Bajo] Textos placeholder desactualizados en la ficha de sitio, y falta el campo CE id en el formulario de alta/edición

- **Dónde**: `/admin/sites/detail?site=…`, tabs Overview y Roster; `/admin/sites` (alta) y
  edición, rol Admin
- **Pasos**: Abrir cualquier ficha de sitio; abrir el roster vacío; abrir "Add site" / "Edit
  site".
- **Esperado**: El texto de la pantalla debería reflejar que el módulo de alta de sitios ya
  está funcionando (se usó de punta a punta en este mismo pase).
- **Pasó**: Dos textos leen como si el alta de sitios todavía no existiera: en Overview,
  "Site contact details and the alta of new sites arrive with the sites module (SPECS.md
  11.2)"; en el roster vacío, "Add students one by one, or import the roster when the
  sites module ships." Ninguno de los dos es cierto — el alta ya ships. Además, el
  formulario de alta/edición de sitio (`SiteForm.jsx`) no tiene ningún campo para CE id,
  aunque la ficha del sitio sí lo muestra ("CE ID: Not on file") y el resto de la app usa
  ese dato (el "foundation id" impreso en los consolidados, por ejemplo). Todo sitio nuevo
  creado desde la UI queda con CE id vacío sin ninguna forma de completarlo salvo tocando
  la API directamente.
- **Evidencia**: capturas de ambos textos; `src/components/sites/SiteForm.jsx` completo —
  no hay ningún `<Field label="CE id"...>` en ningún lado del archivo.
- **Alcance**: Cosmético/de contenido, no bloquea ningún flujo.

---

## Resumen de severidades

| Severidad | Cantidad |
|---|---|
| Bloqueante | 0 |
| Alto | 3 |
| Medio | 4 |
| Bajo | 1 |
| **Total** | **8** |

`/admin/monitoring` al cierre: 5 entradas, todas ya marcadas "Handled" por otros agentes en
paralelo (sesión compartida). Ninguna corresponde a pantallas de mi área (`/admin/sites*`,
`/admin/users`) — dos son `NEXT_REDIRECT` (ruido conocido), una es "sweep sanity check" en
"Unknown screen" (parece un test deliberado del endpoint abierto `POST /api/monitoring`,
no un error orgánico), y dos son errores React #185/#419 en `/counts/2026-08-18`,
claramente de otro agente trabajando el área de counts bajo la misma sesión compartida. No
se detectó ningún error nuevo atribuible a mis propias acciones sobre Sites o Users.
