# 06 — Contrato de API (pase adversarial, sin UI)

Ejecutado 31-ago/1-sep-2026 contra `https://if-cares-frontend-production.up.railway.app`
(producción real, data real). Sesiones propias vía `fetch` + cookie jar en Node
(scripts en `C:\Users\mique\AppData\Local\Temp\claude\...\scratchpad\t1..t9*.mjs`),
sin tocar el navegador compartido. Contraste hecho contra el código fuente real de cada
ruta (`src/app/api/**/route.js`, `src/lib/http.js`, `src/lib/auth.js`, `src/lib/validation.js`,
`src/lib/dates.js`) antes de cada request, para saber exactamente qué esperar y no adivinar.

Más de 260 requests HTTP disparados. **Cero 500 en toda la corrida** (dos 502 y tres 503 sí
aparecieron, pero son `ApiError` deliberados del código — Drive/GAS caído y `REMINDERS_SECRET`
no configurado respectivamente — nunca un stack trace ni un crash sin manejar).

---

## Tabla resumen

`✓` = pasó. `✗` = ver hallazgo. `n/a` = no aplica a esa ruta. `—` = no ejercido en este pase
(cubierto por otro agente, o evitado a propósito por seguridad).

### Sesión / guardas (aplicado a las ~40 rutas de §3.2 — barrido completo, ver detalle debajo)

| Chequeo | Resultado |
|---|---|
| Sin sesión → 401 en las 54 combinaciones método+ruta gateadas | ✓ 54/54 |
| Sesión de staff sobre las 37 rutas admin-only → 403 | ✓ 37/37 |
| Sesión de staff sobre rutas de usuario normal → nunca 401/403 | ✓ 17/17 |
| `POST /api/monitoring` sin sesión → 200 (única excepción abierta) | ✓ |
| `GET /api/health` sin sesión → 200 | ✓ |

### Por ruta (grupo funcional)

| Ruta | Método | Sin sesión | Staff/admin | Scoping por sitio | Body inválido | Idempotencia | Nota |
|---|---|---|---|---|---|---|---|
| `/api/auth/login` | POST | n/a (pública) | n/a | n/a | ✓ 422/400 | n/a | Enumeración: shape idéntico ✓, timing con delta chico, ver #5 |
| `/api/auth/logout` | POST | n/a (pública, idempotente) | n/a | n/a | n/a | ✓ llamable 2 veces sin sesión | |
| `/api/auth/me` | GET | ✓ 401 | ✓ 200 staff | n/a | n/a | n/a | |
| `/api/auth/forgot-password` | POST | n/a (pública) | n/a | n/a | ✓ 422 | n/a | Shape idéntico ✓, **timing separable, ver #2** |
| `/api/auth/reset-password` | POST | n/a (pública) | n/a | n/a | ✓ 422/400 | ✓ token de un solo uso confirmado | Mensaje genérico igual para garbage/expirado/usado (bueno, no enumera) |
| `/api/meal-counts` (submit) | POST | ✓ 401 | ✓ 422 staff sin body | ✓ 403 en sitio ajeno | ✓ 422/400 | ✓ 409 doble envío | Confirmado en playground real |
| `/api/meal-counts/all` | GET | ✓ 401 | ✓ 200, **solo Training Only** | ✓ scoping perfecto | n/a | n/a | shape validDates/excludedDates/holidays/approvedDates presente |
| `/api/meal-counts/detail` | GET | ✓ 401 | ✓ 404 propio / **403 ajeno** | ✓ | n/a | n/a | |
| `/api/meal-counts/correct` | POST | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ 409 si aprobado | Historial de cambios (diff) verificado preciso |
| `/api/meal-counts/void` | GET/POST/PUT | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ 404 doble void, 404 doble restore | Playground completo, ver detalle |
| `/api/meal-counts/approve` | POST/PUT | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ 409 doble aprobación, 409 undo sin aprobar | **Ver hallazgo #1 (recipients:0)** |
| `/api/meal-counts/pdf` | GET | ✓ 401 | ✓ 200 propio / **403 ajeno** | ✓ | n/a | n/a | |
| `/api/sites` | GET/POST | ✓ 401 | ✓ 200 GET (scoped) / 403 POST | ✓ lista solo Training Only | ✓ 422/409 | ✓ 409 nombre duplicado | |
| `/api/sites/[id]` | GET/PATCH/PUT | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422/409 | ✓ 409 rename a nombre existente, Training Only intacto | |
| `/api/sites/data` | GET | ✓ 401 | ✓ 200 propio / **403 ajeno** | ✓ | n/a | n/a | |
| `/api/sites/record` | GET | ✓ 401 | ✓ 403 staff | — (admin-only) | n/a | n/a | |
| `/api/sites/service-days` | GET/PUT | ✓ 401 | ✓ 403 staff (admin-only, incl. Training Only) | ✓ | ✓ 422 | ✓ full-replace no pisa días con count | |
| `/api/sites/service-days/close` | POST/PUT | ✓ 401 | ✓ 403 staff | — (admin-only) | — (no ejercido, fuera de foco de este agente) | — | |
| `/api/students` | GET/POST | ✓ 401 | ✓ 200 GET (scoped) / 422 POST | ✓ **403 ajeno** | ✓ 422 | — | |
| `/api/students/[id]` | PATCH/DELETE | ✓ 401 | ✓ 404 (id falso) | — | — | — | no ejercido a fondo, fuera de foco |
| `/api/students/roster` | GET | ✓ 401 | ✓ 200 propio / **403 ajeno** | ✓ | n/a | n/a | |
| `/api/users` | GET/POST | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ 409 email duplicado | **Ver #7 (sin max length en name)** |
| `/api/users/[id]` | PATCH | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ **auto-desactivación bloqueada (422)** | |
| `/api/users/[id]/reset-link` | POST | ✓ 401 | ✓ 403 staff | — (admin-only) | n/a | ✓ 422 en cuenta desactivada | |
| `/api/reports/monthly` | GET | ✓ 401 | ✓ 403 en sitio ajeno | ✓ | ✓ 400 params faltantes | n/a | |
| `/api/reports/consolidated` | GET/POST/DELETE | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 (nunca arrancó un job real) | n/a | |
| `/api/reports/generated` | GET | ✓ 401 | ✓ 403 staff | — (admin-only) | n/a | n/a | |
| `/api/reports/generated/[id]` | GET/POST/DELETE | ✓ 401 | ✓ 403 staff | — (admin-only) | n/a | ✓ round-trip issue→read→reissue-invalida-viejo→revoke, reversible | |
| `/api/reports/generated/[id]/send` | POST | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 (nunca mandó mail real) | n/a | |
| `/api/reports/files` | GET | ✓ 401 | ✓ 200 staff | n/a | n/a | n/a | |
| `/api/reports/files/download` | GET | ✓ 401 | ✓ 400/502 según caso | n/a | ✓ 400 sin fileId | n/a | |
| `/api/holidays` | GET/POST | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 | ✓ 409 duplicado exacto | Alta/duplicado/borrado en Training Only, 0 remanentes |
| `/api/holidays/[id]` | PATCH/DELETE | ✓ 401 | ✓ 403 staff | — (admin-only) | — | ✓ delete devuelve el/los día(s), verificado | |
| `/api/requests` | GET/POST | ✓ 401 | ✓ 200 GET (scoped) / 422 POST | ✓ **403 ajeno** | ✓ 422 (negativos, cero, enum) | n/a | lista scoped a Training Only confirmada |
| `/api/requests/[id]` | PATCH | ✓ 401 | ✓ 403 staff | — (admin-only) | ✓ 422 (id falso no ejercido a fondo) | — | responder/reabrir no ejercido end-to-end (foco de otro agente) |
| `/api/reminders` | GET/PATCH | ✓ 401 | ✓ 403 staff | n/a | — (PATCH no ejercido a propósito, ver nota) | n/a | |
| `/api/reminders` (cron) | POST | n/a (secreto, no sesión) | n/a | n/a | n/a | n/a | **503 siempre — secreto no configurado en este entorno, ver nota metodológica** |
| `/api/monitoring` | POST | n/a (abierta a propósito) | n/a | n/a | ✓ 422/400 | ✓ rate limit exacto: request #21 acumulada → 429 | |
| `/api/monitoring` | GET/PATCH | ✓ 401 | ✓ 403 staff / **404 admin no-allowlist** | n/a | n/a | n/a | Confirmado: `miqueasfreiberger@gmail.com` no está en el allowlist |
| `/api/mail/test` | POST | ✓ 401 | ✓ 403 staff | n/a | n/a | n/a | Manda solo al propio admin, error diagnóstico claro |
| `/api/sign/[token]` | GET/POST | n/a (pública) | n/a | n/a | n/a | ✓ token de un solo uso, expira, se puede revocar | |
| `/api/health` | GET | n/a (pública) | n/a | n/a | n/a | n/a | ✓ 200 siempre |

---

## Hallazgos

### [Alto] Aprobar un count en Training Only no notifica a los usuarios asignados, sin ningún error visible
- **Dónde**: `POST /api/meal-counts/approve`, sesión admin (`SEED_ADMIN_EMAIL`)
- **Pasos**:
  1. Confirmar que `Training Only` tiene 2 usuarios activos, no-`allSites`, asignados: `qa.tester@example.org` y `training@ifcares.org` (`GET /api/users`, filtrado por `sites` incluye `"Training Only"`).
  2. Enviar un meal count en `Training Only` para una fecha abierta (`POST /api/meal-counts`).
  3. `POST /api/meal-counts/approve {site:"Training Only", date:"2026-09-15"}`.
  4. Repetir el mismo ciclo (submit + approve) una segunda vez en una fecha distinta, para confirmar que no es un evento aislado.
- **Esperado**: `notified`/`recipients` deberían reflejar los 2 usuarios elegibles (o, si el envío de mail falla, `mailError` debería traer un mensaje explicando por qué — el código de `src/app/api/meal-counts/approve/route.js` construye `recipients` con `prisma.user.findMany({where:{active:true, email:{not:''}, sites:{some:{siteId: site.id}}}})`, que con esos 2 usuarios debería devolver `recipients:2`).
- **Pasó**: Las dos veces, **`recipients:0`, `notified:0`, y la clave `mailError` ni siquiera aparece en el JSON** (no es `""`, está ausente — lo que en el código leído solo pasa si `delivery.error` es `undefined`, un valor que ninguna rama de `deliverApproval()` debería producir según el código actual en el repo). El sobre externo dice `result:"success"` sin ninguna señal de que algo no se intentó.
- **Evidencia**:
  ```
  POST /api/meal-counts/approve {"site":"Training Only","date":"2026-09-15"}
  -> 200 {"result":"success","data":{"at":"2026-09-01T02:38:26.769Z","by":"miqueasfreiberger@gmail.com","notified":0,"recipients":0}}

  (repetido en corrida separada con otro count)
  -> 200 {"result":"success","data":{"at":"2026-09-01T02:40:15.182Z","by":"miqueasfreiberger@gmail.com","notified":0,"recipients":0}}

  GET /api/users (mismo momento) confirma 2 elegibles:
    qa.tester@example.org (active=true, sites=["Training Only"])
    training@ifcares.org (active=true, sites=["Training Only"])
  ```
- **Alcance**: Reproducido 2 veces de forma independiente, mismo resultado exacto. No se pudo contrastar contra un sitio real (la regla de seguridad de este pase prohíbe aprobar counts fuera de Training Only), así que no puedo confirmar si el mismo patrón ocurre en producción con los 63 usuarios reales. La forma exacta de la respuesta (`{at,by,notified,recipients}`, sin `mailError`) no coincide con lo que predice el código fuente actual del repo (`v2-mock`) para `deliverApproval()`, que siempre debería incluir `mailError` como string (aunque sea `""`) y que con estos 2 usuarios debería intentar el envío — sugiere que el código desplegado en Railway podría no ser exactamente el mismo que está en el working tree local, o que hay una rama de error no visible desde afuera. Cualquiera sea la causa, el efecto observable es exactamente la categoría de bug que este plan de testeo señala como la más importante: la aprobación contesta éxito y no avisa que, de los 2 destinatarios que debería haber avisado, avisó a cero. Recomiendo que alguien con acceso a los logs del server confirme qué rama de código corre en producción para esta ruta.

---

### [Medio] `POST /api/auth/forgot-password` tiene un canal de tiempo que distingue cuentas existentes de inexistentes, pese a responder el mismo cuerpo
- **Dónde**: `POST /api/auth/forgot-password`, sin sesión
- **Pasos**:
  1. Medir el tiempo de respuesta de 15 llamadas con el email real del admin (`SEED_ADMIN_EMAIL`), intercaladas con
  2. 15 llamadas con un email inventado distinto cada vez (`nobody-<random>@example.org`).
  3. Comparar promedios, medianas y rangos.
- **Esperado**: Cuerpo y status idénticos (así es, ver más abajo) **y** un tiempo de respuesta que no permita distinguir un caso del otro, para que la única fuga posible sea nula.
- **Pasó**: Cuerpo y status **sí** son byte-idénticos (`200 {"result":"success"}` en ambos casos — esa parte del contrato está bien). Pero el tiempo no: cuenta existente promedia **~281 ms** (mediana 256 ms, 14 de 15 muestras entre 254–259 ms) contra **~231 ms** para una cuenta inexistente (mediana 208 ms, 14 de 15 muestras entre 205–214 ms) — un delta de **~48–50 ms** consistente en dos corridas independientes (8 muestras y 15 muestras), con los rangos "de régimen estable" (excluyendo el primer request de warm-up de cada tanda) prácticamente sin superposición. La causa es visible en el código: la rama de cuenta existente hace un `await prisma.passwordResetToken.create(...)` real (con `crypto.randomBytes`) antes de responder; la rama de cuenta inexistente no hace ningún trabajo extra.
- **Evidencia**:
  ```
  Corrida 1 (8+8, intercalado por endpoint):
  avg ms existing email:    252.5  samples=252,254,241,253,243,254,268,255
  avg ms nonexistent email: 200.8  samples=195,208,197,206,195,206,193,206
  delta: 51.8 ms

  Corrida 2 (15+15, intercalado real request-by-request):
  existing:    avg=281.1ms  median=256ms  samples de régimen estable=254-259ms (14/15)
  nonexistent: avg=230.9ms  median=208ms  samples de régimen estable=205-214ms (14/15, 1 outlier en 236)
  delta (mediana): 48ms
  ```
- **Alcance**: Solo probado contra este endpoint (no contra `/api/auth/login`, que sí tiene protección de timing explícita vía `dummyPasswordCompare` y donde el delta medido fue más chico y con más superposición — ver hallazgo Bajo aparte). Un atacante con capacidad de medir latencia de red de forma repetida podría usar esto para enumerar qué direcciones tienen cuenta en el sistema, aun sin ver nunca una diferencia en el cuerpo de la respuesta.

---

### [Medio] Una fecha calendario inválida (día fuera de rango del mes) se reinterpreta en silencio como otra fecha real, en vez de rechazarse
- **Dónde**: cualquier ruta que reciba una fecha `YYYY-MM-DD` y la resuelva con `ymdToUtcDate()` (`src/lib/dates.js`) — confirmado en `POST /api/meal-counts/approve`, aplica igual a `void`, `correct`, `sites/service-days`, `sites/service-days/close`, `holidays` por compartir la misma función.
- **Pasos**:
  1. `POST /api/meal-counts/approve {site:"Training Only", date:"2026-02-30"}` (30 de febrero no existe; febrero 2026 tiene 28 días).
  2. Comparar contra `date:"2026-13-45"` (mes y día directamente fuera de rango).
- **Esperado**: Ambas deberían rechazarse igual (422 "Invalid date."), ya que ninguna es una fecha real.
- **Pasó**: `2026-13-45` sí se rechaza (`422 {"message":"Invalid date."}`), pero **`2026-02-30` no** — pasa la validación y el sistema sigue de largo actuando sobre **2026-03-02** (confirmado con Node puro: `new Date('2026-02-30T00:00:00.000Z')` da `2026-03-02T00:00:00.000Z`, no `Invalid Date`). En el caso puntual probado, terminó en `404 "No active meal count for this date."` porque no había nada que aprobar el 2 de marzo — pero si hubiera habido un count real en esa fecha, la acción se habría ejecutado ahí sin avisar que la fecha pedida ("30 de febrero") no era la fecha real usada.
- **Evidencia**:
  ```
  node -e "console.log(new Date('2026-02-30T00:00:00.000Z').toISOString())"
  -> 2026-03-02T00:00:00.000Z          (día de más en un mes corto: rueda hacia adelante)
  node -e "console.log(new Date('2026-04-31T00:00:00.000Z').toISOString())"
  -> 2026-05-01T00:00:00.000Z          (abril no tiene día 31: también rueda)
  node -e "console.log(new Date('2026-13-01T00:00:00.000Z').toISOString())"
  -> Invalid Date                       (mes fuera de 01-12: sí se rechaza)
  node -e "console.log(new Date('2026-01-00T00:00:00.000Z').toISOString())"
  -> Invalid Date                       (día 0: sí se rechaza)

  POST /api/meal-counts/approve {"site":"Training Only","date":"2026-02-30"}
  -> 404 {"result":"error","message":"No active meal count for this date."}   (no 422 "Invalid date.")
  ```
- **Alcance**: El regex `^\d{4}-\d{2}-\d{2}$` usado en los schemas (`ymd` en `validation.js`) solo valida forma, no rango calendario real; la validación de rango real depende enteramente de que `new Date(...)` de V8 devuelva `Invalid Date`, y V8 solo lo hace cuando mes o día están fuera del rango absoluto (mes >12, día 0), no cuando el día excede los días del mes indicado — ahí "desborda" al mes siguiente en silencio. Bajo uso normal de la UI (datepicker) esto es difícilmente alcanzable, pero cualquier llamada directa a la API (o un bug futuro en el front que arme la fecha a mano) puede terminar actuando sobre una fecha distinta a la pedida sin ningún aviso.

---

### [Medio] Iniciar sesión en una cuenta recién creada que nunca configuró contraseña filtra que la cuenta existe
- **Dónde**: `POST /api/auth/login`, sin sesión
- **Pasos**:
  1. Crear un usuario de prueba (`qa.apitest@example.org`, scoped a `Training Only`) vía `POST /api/users` — queda con `passwordHash` nulo (`needsPassword:true`) hasta que use su link de reset.
  2. Intentar login con ese email, antes de usar el link, con cualquier contraseña.
  3. Comparar contra login con un email que directamente no existe.
- **Esperado**: Misma respuesta genérica en los dos casos (`401 "Incorrect email or password."`), igual que ya pasa correctamente para "contraseña incorrecta" vs "usuario no existe" vs "usuario desactivado" (los tres SÍ dan la misma respuesta, confirmado).
- **Pasó**: La cuenta sin contraseña todavía configurada devuelve **`403 {"message":"Your account needs a password reset. Contact your administrator."}`** — status y cuerpo distintos del caso genérico. Cualquiera que intente este email sabe, sin adivinar nada más, que la cuenta existe y que es nueva/nunca activada.
- **Evidencia**:
  ```
  login con email inexistente:
  -> 401 {"result":"error","message":"Incorrect email or password."}

  login con qa.apitest@example.org (recién creado, sin usar el reset-link todavía):
  -> 403 {"result":"error","message":"Your account needs a password reset. Contact your administrator."}
  ```
  (Código: `src/app/api/auth/login/route.js` línea 25-27, rama separada para `!user.passwordHash` que corre después de haber confirmado que el usuario existe y está activo.)
- **Alcance**: Solo aplica a la ventana entre "un admin crea la cuenta" y "la persona usa su link de reset por primera vez" — no aplica a cuentas ya activadas ni a cuentas desactivadas (esos dos casos sí dan la respuesta genérica, confirmado). Con 63 personas reales en el master, cualquier cuenta que IF Cares cargue y todavía no haya sido activada por su dueño queda expuesta a esta distinción mientras dure esa ventana.

---

### [Bajo] Login: diferencia de tiempo entre "contraseña incorrecta" y "usuario inexistente", más ruidosa que en forgot-password
- **Dónde**: `POST /api/auth/login`, sin sesión
- **Pasos**: mismas 8 muestras intercaladas para cada caso (contraseña incorrecta contra el admin real vs. email inventado).
- **Esperado**: Cuerpo y tiempo indistinguibles — el código ya usa `dummyPasswordCompare()` (un bcrypt real contra un hash dummy) precisamente para igualar el costo cuando el usuario no existe.
- **Pasó**: El cuerpo es idéntico (bien). El tiempo tiene un delta de **~42 ms** (474.6 ms promedio contra 433.0 ms), con algo de superposición entre las muestras (a diferencia del hallazgo de forgot-password, que no se superpone). Dado que ambas ramas hacen un bcrypt real de costo 12, el delta observado probablemente sea ruido de red hacia producción más que un canal de tiempo estructural — pero quedó medible en esta muestra.
- **Evidencia**:
  ```
  avg ms wrong-password(real user): 474.6  samples=470,552,462,444,477,440,460,492
  avg ms nonexistent-email:         433.0  samples=455,424,430,436,432,426,440,421
  delta: 41.6 ms
  ```
- **Alcance**: Mucho menos explotable que el hallazgo de forgot-password (rangos se superponen, la protección de `dummyPasswordCompare` está funcionando en lo esencial). Se registra por completitud ya que el brief pide explícitamente esta comparación.

---

### [Bajo] Mensaje de error genérico cuando falta un campo requerido, en vez del mensaje específico del schema
- **Dónde**: sistémico — cualquier ruta que valide con Zod vía `handle()` (`src/lib/http.js`), confirmado en `/api/auth/login`, `/api/meal-counts/approve`, `/api/meal-counts/void`, `/api/users`
- **Pasos**: Omitir por completo un campo requerido (no enviarlo, no mandarlo vacío) y comparar contra enviarlo con un valor inválido pero presente.
- **Esperado**: Un mensaje legible que ayude a corregir el request (la barra del plan es "422 con mensaje legible", que técnicamente se cumple, pero los schemas sí definen mensajes más útiles que no se están usando en este caso).
- **Pasó**: Campo **ausente** → `"Invalid input (campo)"` (genérico, cae al fallback de `handle()`). Campo **presente pero inválido** (muy corto, formato incorrecto) → el mensaje custom del schema, ej. `"Password must be at least 8 characters. (newPassword)"`, `"Say why in a few words. (reason)"`, `"Pick a site. (site)"`. La causa: el issue de Zod para un campo `undefined` es un error de tipo con mensaje vacío por defecto, y `handle()` solo tiene el mensaje custom disponible cuando el refinamiento (`.min()`, etc.) realmente corre sobre un valor presente.
- **Evidencia**:
  ```
  POST /api/auth/login {"email":"...","password":undefined-omitido}
  -> 422 {"message":"Invalid input (password)"}

  POST /api/meal-counts/approve {"date":"2026-09-15"}  (sin "site")
  -> 422 {"message":"Invalid input (site)"}             (el schema define "Pick a site." para este campo)

  POST /api/meal-counts/void {"site":"...","date":"...","reason":"ab"}  (presente, 2 caracteres)
  -> 422 {"message":"Say why in a few words. (reason)"}  (mensaje custom sí aparece cuando el campo está presente)
  ```
- **Alcance**: Cosmético/UX — nunca es un 500, siempre nombra el campo entre paréntesis, así que sigue siendo accionable. No cambia ningún comportamiento de seguridad.

---

### [Bajo] Sin límite máximo de longitud en `name`/`lastname` al crear un usuario
- **Dónde**: `POST /api/users`, sesión admin
- **Pasos**: Crear un usuario con `name` de 10.000 caracteres.
- **Esperado**: Un tope razonable (la mayoría de los demás campos de texto en `src/lib/validation.js` sí tienen `.max(...)` — ej. `holidayFields.name` tope 120, `voidCountSchema.reason` tope 300).
- **Pasó**: Se creó exitosamente con el nombre completo de 10.000 caracteres almacenado (`200`, `stored_length:10000`). El schema (`createUserSchema` en `src/app/api/users/route.js`) define `name: z.string().trim().min(1)` y `lastname` igual — sin `.max()`.
- **Evidencia**:
  ```
  POST /api/users {"name":"NNNN...(10000 N's)...","lastname":"HugeNameTest","email":"qa.hugename.test@example.org","role":"USER","sites":["Training Only"]}
  -> 200, data.user.name.length === 10000
  ```
  (Usuario desactivado inmediatamente después como limpieza — ver Alcance.)
- **Alcance**: Requiere ya ser admin para explotarlo (no es un bypass de autorización), así que el radio de impacto es bajo — pero un nombre así de largo puede romper layouts del panel de administración o inflar la base sin ninguna razón legítima. El usuario de prueba (`qa.hugename.test@example.org`) quedó **desactivado** en la base como registro de esta prueba; no se pudo borrar porque la API no tiene `DELETE /api/users/[id]`.

---

## Notas metodológicas (no son hallazgos contra la app)

- **`REMINDERS_SECRET` no está configurado en este entorno.** No está en `.env` local (pese a que el brief lo daba por hecho) y, más importante, lo confirmé empíricamente: tanto sin header como con un header inventado, `POST /api/reminders` devuelve **503 "Reminders are not configured to run."** de forma consistente (si el secreto existiera pero yo no lo supiera, un valor incorrecto habría dado 401, no 503 — el código chequea `if (!secret) throw 503` antes de comparar). Esto coincide con lo ya documentado en `TEST.md §7` ("el cron de reminders no está creado"). Como consecuencia, **no pude ejercer los caminos "secreto correcto + enabled:false → skipped:'disabled'" ni "secreto correcto + force=1 fuera de hora → skipped:'not the hour'"** — no porque no sepa cómo probarlos, sino porque no existe ningún secreto válido en este deploy contra el cual probarlos. Sí confirmé que `force=1` **no** saltea el chequeo del secreto (sigue dando 503), y que `preview=1` funciona por sesión de admin en vez del secreto, exactamente como está en el código.
- **Recursos globales compartidos cambiaron durante la sesión, por otros agentes en paralelo.** Los settings de reminders (`hour`, `copyTo`, `lookBackDays`) mostraban `14`, `["training@ifcares.org","test@ifcares.org"]`, `3` al principio de mi sesión, y **`9`, `[]`, `1`** (los valores por default del código) más tarde — sin que yo haya llamado nunca a `PATCH /api/reminders`. De la misma forma, la cantidad de holidays fluctuó entre 0 y 1 entre dos lecturas mías separadas por segundos, y la cantidad total de usuarios subió en más de los 2 que yo creé. Nada de esto rompió ninguna invariante de seguridad (`enabled` se mantuvo `false` todo el tiempo, que es lo que importa), pero vale que quien coordine el pase sepa que otros agentes están tocando configuración global (`/admin/settings`, holidays, usuarios) al mismo tiempo — así que el estado final de esos valores no es atribuible solo a mi corrida.
- **No se disparó ningún mail fuera de lo explícitamente autorizado.** El único mail real intentado fue la aprobación en `Training Only` (autorizado por `TEST.md §2`), que igual no salió por el problema conocido de `MAIL_FROM` (y, según el hallazgo #1, tampoco llegó a intentar mandarse). `POST /api/mail/test` se llamó una sola vez, como admin, y solo pega contra la propia casilla del admin logueado.

---

## Confirmaciones relevantes (sin hallazgo, pero vale dejarlas escritas)

- **Cero enumeración por cuerpo/status** en login (contraseña incorrecta / usuario inexistente / usuario desactivado dan exactamente el mismo `401` con el mismo mensaje) y en forgot-password (mismo `200 {"result":"success"}` sin importar si la cuenta existe). El SQL-injection-shaped input en el campo email (`' OR 1=1--`) es rechazado limpiamente por la validación de formato antes de tocar la base (`422`), y una password con forma de SQLi contra un email real simplemente falla como credencial incorrecta (`401`) — ningún indicio de que el ORM parametrizado sea vulnerable.
- **Idempotencia perfecta** en el playground completo de `2026-09-15` en `Training Only`: doble submit → `409`; doble aprobación → `409`; corregir un count aprobado → `409` con el mensaje exacto de quién lo aprobó; deshacer una aprobación que no existe → `409`; doble void → `404`; doble restore → `404`. Cada mensaje de error nombra exactamente el motivo, nunca un genérico.
- **El scoping por sitio para staff es sólido** en los 8 endpoints donde se probó explícitamente pedir un sitio real que no es el suyo (`meal-counts/detail`, `meal-counts/pdf`, `sites/data`, `students/roster`, `reports/monthly`, y los POST de `requests`/`students`/`meal-counts` contra ese sitio) — siempre `403 "You do not have access to this site."`, nunca datos, nunca un 200. Las listas (`GET /api/sites`, `/api/students`, `/api/requests`) también vienen recortadas a solo `Training Only`, nunca aparece un nombre de otro sitio.
- **El rate limit de `POST /api/monitoring` funciona exactamente como está escrito**: ventana de 60s por IP, tope 20, la petición acumulada #21 (contando también las que fallan validación) recibe `429 "Too many reports."` de ahí en adelante — confirmado con conteo exacto dos veces.
- **`GET`/`PATCH /api/monitoring` como admin (`miqueasfreiberger@gmail.com`, no está en el allowlist) da `404`, no `403`**, tal como está diseñado ("no advertisar que la pantalla existe"). Como staff da `403` (el gate de admin corta antes de llegar al allowlist). Confirmado con el cuerpo completo de cada respuesta.
- **El ciclo de link de firma es completamente reversible sin comprometer datos reales**: emitir un link, leerlo público, emitir uno nuevo (invalida el viejo automáticamente), revocar — el reporte real usado para esta prueba (`TX 2026-08 claim by day.pdf`) quedó exactamente en su estado original (`hasSignLink:false, signedAt:null`), nunca se completó una firma real.
- **Ninguna ruta devolvió 500** en ninguna de las variantes probadas (JSON roto, tipos equivocados, campos faltantes, strings de 10.000 caracteres, fechas absurdas, ids inventados) — todo lo que no era un `2xx` esperado fue un `4xx`/`503` con mensaje legible en JSON, salvo un único caso de un token con forma rarísima (`/api/sign/%20`, un espacio) que devolvió la página 404 HTML nativa de Next en vez del JSON de la app — sigue siendo un `404` correcto, solo con otro `Content-Type`, así que no se lo trata como hallazgo.
