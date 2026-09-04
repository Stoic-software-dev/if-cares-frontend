# Testeo exhaustivo de punta a punta

**Tolerancia cero a bugs.** Esta app reemplaza un sistema del que dependen 56 sitios para
reclamar el reembolso de las comidas que sirven. Un count que no se cuenta es plata que IF
Cares no cobra, y un mail que no llega es una persona que no puede entrar.

Este documento es la lista completa de lo que hay que romper antes de que salga a producción.

---

## 0. Cómo leer este documento

Tiene **tres formas de testear** y las tres son obligatorias. No se sustituyen.

| | Qué encuentra | Dónde está |
|---|---|---|
| **Barrido de cobertura** | Lo que se ve: botones que no andan, validaciones ausentes, estados rotos | §3–§7 |
| **Verificación de integraciones** | Lo que **miente con cara de éxito**: la UI dice OK y el sistema no hizo nada | §8 |
| **Charters exploratorios** | Lo que nadie pensó en poner en una lista | §10 |

Esa segunda fila es la que más caro salió históricamente. Los tres peores bugs del proyecto
—el claim consolidado imprimiendo sitios equivocados, el archivado de PDFs que nunca archivó
nada, y Gmail reescribiendo el remitente— **pasaron todos el barrido de cobertura sin
despeinarse**, porque la pantalla decía que todo estaba bien. §8 existe por ellos.

---

## 1. Antes de empezar

### 1.1 Dónde correrlo

Contra el **entorno de la 2.0** (`https://if-cares-frontend-production.up.railway.app`, que
deploya desde `v2-mock`). Es el único con las integraciones de verdad conectadas: Drive,
Gmail y la base de Supabase. Un bug de integración no aparece en local, y §8 es justamente eso.

**Ese nombre dice "production" y no lo es.** El sistema del que dependen los 56 sitios sigue
siendo la app de Google Sheets en `main`, porque el cutover no ocurrió. Testear acá no puede
frenar a un sitio ni tocar un reclamo real.

Lo que sí puede es costar días: **esa base de Supabase no tiene backup** — el proyecto está
en el tier gratis — y es la única copia de todo lo importado. El 3-sep-2026 se borró entera
y hubo que reconstruirla desde `migration-data/history` y las Sheets. Ver la regla 7 de §1.4.

Antes de empezar, anotá el commit desplegado. Un hallazgo sin commit no es reproducible.

### 1.2 Cuentas necesarias

| Rol | Cuenta | Para qué |
|---|---|---|
| Admin | `qa.admin@example.org` / `QaAdmin2026!Verify` | Todo lo administrativo |
| Staff 1 sitio | `qa.tester@example.org` / `QaTest2026!Training` | Alcance: solo ve *Training Only* |
| Staff sin sitios | crear uno | Un staff sin asignaciones no debe romper ninguna pantalla |
| Staff `allSites` | crear uno | Camino distinto al de admin, se olvida siempre |
| Desactivado | crear y desactivar | No debe poder entrar, y el mensaje no debe delatar por qué |
| Sin contraseña | crear sin mandar mail | Debe comportarse igual que una cuenta inexistente |

Creá las que falten desde `/admin/users` y **prefijalas con `ZZ `** para poder barrerlas
después. Ese prefijo ya se usa para alumnos dados de baja.

> Al 3-sep-2026 **ninguna de las dos primeras existe**: se perdieron cuando se borró la base
> y se volvieron a borrar al terminar esa ronda de testeo. Las contraseñas de la tabla son
> las que hay que ponerles al recrearlas, para que este documento siga siendo cierto.

### 1.3 Datos de prueba

- Un sitio con **calendario denso** y otro **sin service days**.
- Un sitio con **250 alumnos** (el roster real más grande) y uno con **cero**.
- Un día **con count enviado**, uno **aprobado**, uno **anulado**, uno **feriado**, uno vacío.
- Un mes **cerrado completo** para generar un claim consolidado de verdad.
- Requests en los tres estados, con y sin nota.

### 1.4 Reglas de seguridad del testeo

1. **No tocar datos de sitios reales.** Todo lo que crees va con `ZZ `.
2. **No aprobar counts de sitios reales**: la aprobación bloquea la corrección.
3. **No anular counts que no creaste vos.**
4. Los mails salen **de verdad**. Usá direcciones tuyas o `@example.org` (que no existe).
5. Antes de un test destructivo, anotá cómo revertirlo. Si no sabés, no lo hagas.
6. **Nada de datos personales reales** en capturas o reportes.
7. **Ningún comando de Prisma que no sea de lectura, contra la base de Supabase.** No hay
   backup. Dos formas concretas de perderla, las dos usadas el 3-sep-2026:
   - `--shadow-database-url` apuntando a esa base. Prisma **resetea** la shadow database
     antes de usarla: `migrate diff --from-migrations` con el `DIRECT_URL` real la dropeó
     entera. Para generar el SQL de una migración, escribilo a mano.
   - Borrar por query en vez de por id. Limpiar con `where: { siteId, date }` se llevó
     puestas filas anuladas de otro que compartían el día. Guardá el id que te devuelve la
     creación y borrá sólo por ése.
8. Si vas a limpiar lo que creaste, **contá primero y borrá después**: listá las filas, mirá
   quién las creó y cuándo, y recién entonces borrá.

---

## 2. Herramientas y trampas conocidas

Cosas que ya nos hicieron perder tiempo. Leelas antes de reportar un falso positivo:

- **Los screenshots no ven los portales de Radix.** Diálogos, dropdowns y selects no aparecen
  en la captura ni en `read_page`. Usá `find`. Dos "bugs" se reportaron así y ninguno existía.
- **Un screenshot con un diálogo Radix abierto puede colgar el renderer.** `find` sigue
  andando; no reintentes la captura.
- **La vista normal de Gmail miente sobre el remitente**, en las dos direcciones: resuelve
  contactos del directorio y pisa el nombre real. Para el remitente, **siempre "Mostrar
  original"** y leer el header `From:` crudo.
- **`capabilities.canAddChildren` de Drive miente sobre si se puede escribir.** Dice `true` en
  carpetas donde toda escritura falla. La única prueba es intentar la escritura.
- El listado de menús está **cacheado 10 minutos** del lado del server. Un cambio hecho a mano
  en Drive no se ve hasta que vence, o hasta usar **Refresh** / `?refresh=1`.
- `NEXT_REDIRECT` en la consola es **ruido conocido**, no es un bug.

---

## 3. Inventario — nada de esto queda sin tocar

### 3.1 Pantallas (18)

Públicas: `/login` · `/reset-password` · `/sign/[token]`

Staff: `/dashboard` · `/menus` · `/requests` · `/meal-count` · `/counts/[date]`

Admin: `/admin/sites` · `/admin/sites/detail` · `/admin/calendar` · `/admin/holidays` ·
`/admin/reports` · `/admin/reports/consolidated` · `/admin/requests` · `/admin/users` ·
`/admin/settings` · `/admin/monitoring`

### 3.2 API (39 rutas, 65 pares método+ruta)

```
auth        POST /login  POST /logout  GET /me  POST /forgot-password  POST /reset-password
health      GET  /api/health
holidays    GET,POST /holidays          PATCH,DELETE /holidays/[id]
mail        POST /mail/test
counts      POST /meal-counts           GET /meal-counts/all      GET /meal-counts/detail
            POST,PUT /meal-counts/approve   POST /meal-counts/correct
            GET /meal-counts/pdf        GET,POST,PUT /meal-counts/void
monitoring  POST,GET,PATCH /monitoring
reminders   GET,PATCH,POST /reminders
reports     POST,GET,DELETE /reports/consolidated   GET /reports/monthly
            GET /reports/generated      GET,POST,DELETE /reports/generated/[id]
            POST /reports/generated/[id]/send
menus       GET,POST,DELETE /reports/files          GET /reports/files/download
requests    POST,GET /requests          PATCH /requests/[id]
sign        GET,POST /sign/[token]
sites       GET,POST /sites             GET,PATCH,PUT /sites/[id]
            GET /sites/data   GET /sites/record
            GET,PUT /sites/service-days POST,PUT /sites/service-days/close
students    GET,POST /students          PATCH,DELETE /students/[id]   GET /students/roster
users       GET,POST /users             PATCH /users/[id]   POST /users/[id]/reset-link
```

**Ninguna ruta queda sin probar con los 5 métodos**, incluidos los que no implementa: un
método no soportado debe contestar 405, nunca 500.

---

## 4. Cómo se recorre cada pantalla

Para **cada** una, no solo la ruta feliz:

1. **Estados**: cargando (skeleton), vacío, error de red (cortar conexión y reintentar), sin
   permisos, y con volumen real (250 alumnos, un mes lleno).
2. **Cada control**: botón, link, select, checkbox, switch, tab, menú, diálogo. Incluidos los
   deshabilitados: ¿por qué lo están, y se habilitan cuando corresponde?
3. **Formularios**: vacío, solo espacios, máximo de caracteres, caracteres raros
   (`ñ á ' " < > &`, emojis), negativos y cero, fechas al revés, fechas de otro año, fechas
   imposibles (`2026-02-30`). **Doble click en submit: ¿duplica?**
4. **Navegación**: atrás del navegador, recargar a mitad de un formulario, pestaña nueva, deep
   link directo, y **entrar con la sesión vencida**.
5. **Responsive**: 375px, 768px (el tablet real de los sitios) y 1440px. En teléfono: barra
   inferior, hoja "More", que nada desborde horizontalmente.
6. **Tema**: claro y oscuro, y el toggle en cada pantalla.
7. **Teclado**: Tab sin perder foco, Enter y Escape en diálogos, `Ctrl+K` para la paleta.
8. **Consola**: `/admin/monitoring` al final de cada bloque. **Cero errores nuevos.**

---

## 5. Recorridos por rol

### 5.1 Anónimo

- `/login`: credenciales mal, mail inexistente, contraseña vacía, usuario desactivado, cuenta
  **sin contraseña**, doble submit, Enter en el campo.
- **Las cuatro respuestas de fallo tienen que ser idénticas** — mensaje, status y *tiempo*.
  Cualquier diferencia dice qué cuentas existen.
- **Forgot password**: dirección que existe y una que no. Misma respuesta, mismo tiempo
  (hay un piso de 400 ms deliberado). Medí 5 de cada una y compará promedios.
- `/reset-password`: token válido, vencido, ya usado, inventado, ausente, y **el mismo token
  dos veces**.
- `/sign/[token]`: igual, más firmar con un trazo mínimo y con la firma vacía.
- **Deep link a cada pantalla privada sin sesión** → debe mandar a login, no romper.

### 5.2 Staff

- **Alcance**: no puede ver ni tocar sitios que no son suyos. Probalo por **URL directa** y
  **por API**, no solo por la UI, que es donde el bug se esconde.
- Dashboard: cambio de sitio, mes, días abiertos/cerrados/feriados/aprobados.
- **Cargar un count**: roster completo, marcar comidas, tiempos, firma, enviar. Después:
  reabrir el día, ver si prefillea lo correcto, corregir, y ver que un día **aprobado no se
  puede corregir**.
- Menús: ver, descargar. **No debe ver Publish ni la papelera.**
- Requests: crear de cada tipo, con nota y sin, ver respuesta y quién respondió.

### 5.3 Admin

- Sitios: crear, editar, desactivar, reactivar, regenerar calendario, cambiar el template
  semanal, fechas de programa al revés.
- **Estado del sitio (TX/OK)**: ver §9, es donde vivió el peor bug del proyecto.
- Calendario: abrir/cerrar días, bulk edit, feriados (todos los sitios y algunos), rangos.
- Alumnos: agregar, editar, "remove" (que **desactiva**, no borra), y **volver a agregar el
  mismo nombre** → debe revivir la fila, no duplicarla.
- Counts: aprobar, desaprobar, anular, restaurar. Verificar a quién le llega el mail de
  aprobación: **solo staff del sitio**, no todos los admins.
- Reportes: mensual, consolidado por estado, cancelar un job a mitad, revocar el link de firma.
- Usuarios: crear con y sin mail, reenviar link, cambiar rol, desactivarse a sí mismo (no debe
  poder), paginación, filtros.
- Requests: responder, paginar, buscar por nota.
- Settings (Reminder emails) y Client errors desde el **menú de perfil**, no del navbar.

---

## 6. Chequeos a nivel API

Sin pasar por la UI. Con `fetch` y cookie de sesión.

1. **Matriz de autorización**: cada una de las 65 combinaciones, con las 4 sesiones (anónimo,
   staff, staff allSites, admin). Anónimo → 401. Staff en ruta de admin → 403. **Nunca 500.**
2. **IDOR**: agarrá un id de otro sitio/usuario/count y pedilo con sesión de staff. Todos los
   `[id]` y `[token]`.
3. **Método no soportado** → 405.
4. **Body basura**: vacío, no-JSON, JSON truncado, tipos equivocados, campos de más, strings de
   10.000 caracteres, `null` en cada campo. Nada de esto puede dar 500.
5. **Validación**: cada mensaje de error tiene que **nombrar el campo** y ser una frase, no la
   jerga de Zod.
6. **Idempotencia y concurrencia**: enviar el mismo count dos veces en paralelo; aprobar dos
   veces; anular y restaurar en carrera. **No puede quedar más de un count activo por sitio y
   día** — hay un índice único parcial que lo garantiza; comprobá que la API no lo esquive.
7. **Paginación**: página 0, negativa, gigante, tamaño 0.
8. **`/api/reminders`** sin el header del secreto → 503/401, nunca corre.

---

## 7. Regresión — los 32 hallazgos no vuelven

Cada uno tiene un test. La lista completa con su historia está en `TEST-RESULTS.md`; estos son
los que **más caro salieron** y por eso van explícitos:

- [ ] Claim consolidado agrupa por la **columna `Site.state`**, nunca por el nombre. Un sitio
      con "TX" en el nombre y la columna vacía **no debe aparecer** en el claim de TX — y por
      eso la columna tiene que estar cargada (§9).
- [ ] "OK" es seleccionable en el consolidado.
- [ ] Los links de reset apuntan al host público, **no a `localhost:8080`**.
- [ ] `2026-02-30` es rechazada.
- [ ] Los feriados se muestran en **todas** las fechas cubiertas, no solo donde hay service day.
- [ ] El mail de aprobación va **solo al staff asignado**, no a los 15 admins `allSites`.
- [ ] Un job de reporte cancelado **queda cancelado** (no se auto-completa después).
- [ ] La firma exige el mismo trazo mínimo en el pad y en `/sign/[token]`.
- [ ] Forgot-password: mismo tiempo de respuesta exista o no la cuenta.
- [ ] Login de cuenta sin contraseña: misma respuesta que cualquier fallo.
- [ ] "Remove" de alumno **desactiva**; re-agregar el mismo nombre **revive** la fila.
- [ ] Los requests tienen **nota**, buscable en el inbox.
- [ ] `/admin/requests` pagina, y muestra `respondedBy` / `respondedAt`.
- [ ] Reabrir un día **no prefillea "sin comidas"** por contar días que no sirven nada.
- [ ] `/admin/users` esconde el "desactivar" de la propia cuenta (el row trae `id`).
- [ ] Un count activo se busca por `{siteId, date, voidedAt: null}` — **no existe** compuesto
      `siteId_date`.
- [ ] Publicar y eliminar menús está **acotado a la carpeta de menús**: apuntarlo a la carpeta
      de reportes debe ser rechazado.

---

## 8. Integraciones — donde el sistema miente con cara de éxito

**Esta es la sección que el barrido de cobertura no cubre.** Todo lo de acá devolvió "OK"
alguna vez mientras no hacía nada. La regla: **no confiar en la pantalla, mirar el efecto
real del otro lado.**

### 8.1 Drive

- [ ] **Publicar un menú y abrirlo en Drive.** Que el listado lo muestre no prueba que se
      escribió: el listado sale de un cache.
- [ ] **Generar un reporte y confirmar que el PDF está en la carpeta de Drive.** Este es el que
      estuvo roto desde siempre: la app decía que generaba, y no archivaba nada.
- [ ] **La carpeta destino no puede ser "Mi unidad" salvo que `GOOGLE_DRIVE_AS` esté cargado.**
      Un service account no tiene cuota propia: toda escritura falla con `storageQuotaExceeded`
      por más permisos que tenga. Verificá contra qué escribe y a nombre de quién queda el
      archivo.
- [ ] Eliminar un menú → va a la **papelera** de Drive, no se borra.
- [ ] Cambiar algo a mano en Drive → **Refresh** lo refleja; sin Refresh, no.
- [ ] Cortar el permiso del service account y ver que el error **nombra el arreglo correcto**
      (permiso vs cuota son 403 distintos con soluciones opuestas).

### 8.2 Mail

- [ ] Un envío real, y **"Mostrar original"** en el destinatario. Leer el header `From:` crudo.
      La vista de Gmail no sirve como evidencia.
- [ ] El `From` tiene que ser el configurado. Si Gmail lo **reescribió** a la cuenta primaria,
      falta registrar el alias como *send-as* en esa cuenta — crear el alias no alcanza.
- [ ] `MAIL_AS` (a quién suplanta) y `MAIL_FROM` (lo que se ve) son **dos cosas distintas**.
      Un alias sirve de remitente y **no** se puede suplantar.
- [ ] Cambiar `MAIL_FROM` y comprobar que el siguiente envío usa el nuevo **sin reiniciar**
      (el token está cacheado por identidad; si no lo estuviera, seguiría el viejo una hora).
- [ ] **SPF, DKIM y DMARC** en los headers recibidos: los tres tienen que dar `pass`. Un
      `dmarc=fail` no rompe nada visible y manda los links de contraseña a spam.
- [ ] Los seis mails de la app, cada uno recibido de verdad: bienvenida, reset, respuesta de
      request, count atrasado, count aprobado (con PDF adjunto), claim consolidado.
- [ ] Con el mail caído, **la app sigue funcionando** y dice que no pudo avisar.

### 8.3 Base de datos

- [ ] Lo que muestra la UI **coincide con lo que hay en la tabla**. No alcanza con que la
      pantalla sea coherente consigo misma.
- [ ] Después de cada escritura, confirmá la fila: un count enviado, un alumno desactivado, un
      request respondido, un sitio editado.
- [ ] **Auditoría**: toda acción administrativa deja entrada en `AuditLog`.

### 8.4 Infraestructura

- [ ] `POST /api/reminders` con y sin secreto, dentro y fuera de la hora, con `?force=1`.
- [ ] El cron de Railway existe y **efectivamente dispara**.
- [ ] Todas las variables de entorno cargadas: `MAIL_FROM`, `MAIL_AS`, `GOOGLE_DRIVE_AS`,
      `REMINDERS_SECRET`, `APP_URL`, las de Google, las de Supabase.

---

## 9. Integridad de datos — lo que la pantalla no delata

Un dato mal cargado no se ve como bug hasta que sale en un reclamo de plata.

- [ ] **Todo sitio activo tiene `state` cargado en la columna.** El badge de la UI cae al
      nombre si la columna está vacía, así que **un sitio puede mostrar "TX" y quedar fuera del
      claim de TX**. Pasó con 7 sitios reales. Query: sitios activos con `state = ''`.
- [ ] Los totales del claim consolidado **cuadran con la suma de los counts** del mes. Sumalo
      aparte y compará.
- [ ] Un count **anulado no suma** en ningún reporte. Uno **aprobado sí** suma.
- [ ] Ningún count con fecha imposible o fuera del programa (apareció uno en 2029).
- [ ] Ningún alumno huérfano: `MealCountEntry` con `studentId` nulo por un borrado duro.
- [ ] Feriados cargados para el ciclo. **Cero feriados es un dato faltante, no un estado
      válido**: cada feriado sin cargar es un día que se reclama como atrasado.
- [ ] Sitios basura (`Copy of ...`) inactivos, no activos.

---

## 10. Charters exploratorios

Sin guion. Una hora cada uno, un tester, cuaderno abierto. **Anotá lo que te sorprenda,
aunque no sepas si es un bug** — la mitad de los hallazgos caros empiezan como "qué raro".

1. **Ser el staff de un sitio un día entero.** Entrar a la mañana, cargar el count, equivocarte,
   corregir, pedir algo. Sin mirar la lista de arriba.
2. **Romper el flujo de aprobación.** Aprobar, corregir, anular, restaurar, en todos los
   órdenes posibles. Buscá el estado que no debería existir.
3. **Dos personas, el mismo día, el mismo sitio.** Dos pestañas, dos sesiones, a la vez.
4. **La primera vez.** Sitio nuevo, usuario nuevo, sin datos: ¿la app explica qué hacer o
   muestra pantallas vacías?
5. **Fin de mes.** Cerrar un mes, generar el claim, mandarlo, firmarlo. El recorrido que solo
   pasa 12 veces al año y por eso nadie probó.
6. **El camino del que se equivoca.** Fecha mal, sitio mal, alumno mal. ¿Se puede deshacer todo?

---

## 11. Lo que ya se sabe que falta — no reportarlo

- **React #185 en `/counts/[date]`**: conocido, sin reproducción. Si lográs reproducirlo de
  forma estable, **eso sí es un hallazgo grande**.
- `NEXT_REDIRECT` en consola.
- El remitente sale de `stoicsoftware.io` y no de `ifcares.org`: es deliberado hasta que IF
  Cares cargue su delegación.
- La pestaña Holidays no tiene selector de sitio: es intencional.

---

## 12. Cómo repartirlo

Seis frentes paralelos. Cada uno con **su propio sitio y sus propios usuarios `ZZ `** — dos
agentes sobre el mismo sitio se pisan y generan hallazgos falsos, ya pasó.

| # | Frente | Secciones |
|---|---|---|
| 1 | Auth, anónimo, sesiones, alcance por rol | §5.1, §6.1, §6.2 |
| 2 | Counts: carga, corrección, anulación, aprobación | §5.2, §5.3, §7 |
| 3 | Sitios, calendario, feriados, alumnos | §5.3, §9 |
| 4 | Reportes, claims, firma, menús | §5.3, §8.1 |
| 5 | **Integraciones y datos** (el más importante) | §8, §9 |
| 6 | Responsive, teclado, tema, consola | §4.5–§4.8 |

Los charters de §10 van **después**, con la cabeza puesta en lo que los otros encontraron.

---

## 13. Cómo se reporta un hallazgo

```
### [Crítico|Alto|Medio|Bajo] Título de una línea

Dónde:     pantalla o ruta + commit desplegado
Rol:       con qué cuenta
Pasos:     1. 2. 3. — que otro pueda repetirlo sin preguntarte nada
Esperado:  qué debería pasar
Pasó:      qué pasó, textual (mensaje de error, status, captura)
Evidencia: response crudo, header, fila de la tabla, línea de consola
```

**Severidad por consecuencia, no por esfuerzo de arreglo:**

- **Crítico**: plata mal reclamada, datos perdidos, alguien ve datos de otro sitio, nadie puede
  entrar.
- **Alto**: una función central no se puede usar; hay workaround pero duele.
- **Medio**: molesta y se puede rodear.
- **Bajo**: cosmético.

Si dudás entre dos, **poné la más alta**. Bajar una severidad es barato; descubrir tarde que
era crítica, no.

---

## 14. Cuándo está terminado

Todo esto, junto:

1. Las 18 pantallas recorridas con las 8 dimensiones de §4.
2. Los 65 pares método+ruta probados con las 4 sesiones (§6.1).
3. **§8 entera verde, con evidencia del otro lado** — el archivo en Drive, el header del mail,
   la fila en la tabla. Un "OK" de la pantalla no cuenta.
4. **§9 entera verde**, con las queries corridas.
5. Los 6 charters de §10 corridos y sus notas volcadas.
6. La regresión de §7 completa.
7. **Cero errores nuevos en `/admin/monitoring`.**
8. Todo hallazgo Crítico y Alto **arreglado y re-verificado**, no solo anotado.

Los Medios y Bajos pueden quedar en la lista con dueño y fecha. Los Críticos y Altos, no:
tolerancia cero significa que ninguno viaja a producción.
