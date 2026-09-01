# Testeo exploratorio de punta a punta

> Plan para recorrer **toda** la app: cada pantalla, cada botón, cada estado, cada rol.
> No es una lista de casos felices — es un barrido con la intención de romper cosas antes
> de que las rompa un site en su tablet.
>
> Escrito el 31-ago-2026 contra el commit desplegado en producción. Antes de ejecutarlo,
> revisá que el inventario de §3 siga coincidiendo con `find src/app -name page.jsx`.

---

## 1. Antes de empezar

### 1.1 Dónde correrlo

| | |
|---|---|
| **App** | `https://if-cares-frontend-production.up.railway.app` |
| **Base** | Supabase `vcixfuaqxnkwihzbqetq`, schema `regular_year` |
| **Zona horaria** | `America/Chicago`. Todo lo que diga "hoy" se resuelve ahí, no en la máquina del tester |

**Esta base tiene data real importada de Sheets** — 56 sitios activos, ~2.600 alumnos, más
de 2.000 counts históricos, y 63 usuarios con los nombres y mails reales del master. No hay
staging todavía (Etapa 7 del ROADMAP). Eso condiciona todo el plan: ver §2.

### 1.2 Cuentas necesarias

| Rol | Cuenta | Para qué | Estado |
|---|---|---|---|
| **Admin** | `SEED_ADMIN_EMAIL` del `.env` | Todo el panel de administración | Existe |
| **Desarrollo** | `miqueas@stoicsoftware.io` | Único que ve `/admin/monitoring` | Existe, hay que saber su contraseña o generarse un link de reset |
| **Staff (no admin)** | **hay que crearlo** | La mitad de la app que un admin nunca ve | **Falta** — crearlo desde `/admin/users` asignado solo a `Training Only` |
| **Anónimo** | sin sesión | Guards, login, reset, firma pública | — |

Hoy hay 16 admins con todos los sitios y 47 usuarios sin ninguno; **crear el staff de
prueba es el primer paso del plan**, porque sin él no se puede probar el recorte por sitio,
que es la regla de seguridad más importante de la app.

### 1.3 Datos de prueba

- **Sitio de prueba: `Training Only`.** Es el único que se puede tocar sin consecuencias.
  Tiene `training@ifcares.org` como único usuario activo asignado, así que los mails que
  dispare el testeo caen ahí.
- **Cualquier otro sitio es data real de un programa en curso.** Sobre esos: mirar, filtrar,
  abrir, descargar. Nunca anular, corregir, cerrar días ni desactivar.
- Fechas seguras para crear: días del mes en curso en `Training Only`.

---

## 2. Reglas de seguridad del testeo

Esta app **manda mails reales, escribe en el Drive del cliente y tiene data de producción**.
El testeo no puede ser inocente sobre eso.

**Acciones que salen del sistema — solo sobre `Training Only`, y anotando qué se disparó:**

| Acción | Qué manda hacia afuera |
|---|---|
| Aprobar un count | Mail con PDF adjunto a cada usuario **asignado a ese sitio** |
| Responder un request | Mail al solicitante |
| Enviar un claim | Mail con el PDF, o el link de firma, a los destinatarios que se carguen |
| Forgot password | Mail a la dirección que se escriba (si existe la cuenta) |
| Generar cualquier PDF | Escribe el archivo en la carpeta de Drive de IF Cares |
| `POST /api/mail/test` | Mail a la propia dirección del admin logueado |

**Nunca:** correr los reminders con `?force=1` sin apagarlos antes en `/admin/settings`
(escribe a decenas de personas reales), desactivar usuarios o sitios reales, ni borrar
feriados que haya cargado la oficina.

**Al terminar cada bloque destructivo, restaurar**: deshacer la aprobación, restaurar el
count anulado, borrar el feriado de prueba, reabrir los días cerrados.

---

## 3. Inventario — nada de esto queda sin tocar

### 3.1 Pantallas (19)

```
/                        (redirige)          /admin/calendar
/login                                       /admin/holidays
/reset-password                              /admin/sites
/dashboard                                   /admin/sites/detail
/meal-count                                  /admin/users
/counts/[date]                               /admin/requests
/menus                                       /admin/reports
/requests                                    /admin/reports/consolidated
/sign/[token]            (pública)           /admin/settings
                                             /admin/monitoring  (solo desarrollo)
```

### 3.2 API (40 rutas)

```
auth/       login · logout · me · forgot-password · reset-password
meal-counts/  (POST) · all · detail · correct · void · approve · pdf
sites/      (GET/POST) · [id] · data · record · service-days · service-days/close
students/   (GET/POST) · [id] · roster
users/      (GET/POST) · [id] · [id]/reset-link
reports/    monthly · consolidated · generated · generated/[id] · generated/[id]/send
            files · files/download
holidays/   (GET/POST) · [id]
requests/   (GET/POST) · [id]
otros/      health · reminders · monitoring · sign/[token] · mail/test
```

---

## 4. Cómo se recorre cada pantalla

Para **cada** una, no solo la ruta feliz:

1. **Estados**: cargando (skeleton), vacío, error de red (cortar la conexión y reintentar),
   sin permisos, y con volumen real (un sitio de 250 alumnos, un mes lleno).
2. **Cada control**: cada botón, link, select, checkbox, switch, tab, menú, diálogo. Incluye
   los que están deshabilitados: ¿por qué lo están y se habilitan cuando corresponde?
3. **Formularios**: enviar vacío, con espacios, con el máximo de caracteres, con caracteres
   raros (`ñ á ' " < > &`, emojis), números negativos y cero, fechas al revés (desde > hasta),
   fechas de otro año. Doble click en submit (¿duplica?).
4. **Navegación**: atrás del navegador, recargar a mitad de un formulario, abrir en pestaña
   nueva, entrar por deep link directo a la URL, y **entrar con la sesión vencida**.
5. **Responsive**: 375px (teléfono), 768px (tablet — es el dispositivo real de los sitios) y
   1440px. En teléfono: barra inferior, hoja "More", que nada desborde en horizontal.
6. **Tema**: claro y oscuro, y el toggle en cada pantalla.
7. **Teclado**: Tab por toda la pantalla sin perder el foco, Enter y Escape en los diálogos,
   `Ctrl+K` para la paleta de comandos.
8. **Consola**: `/admin/monitoring` al final de cada bloque. **Cero errores nuevos** es el
   criterio; los `NEXT_REDIRECT` son ruido conocido (§7).

---

## 5. Recorridos por rol

### 5.1 Anónimo

- `/login`: credenciales mal, mail inexistente, contraseña vacía, usuario **desactivado**
  (crear uno y probar), doble submit, Enter en el campo.
- **Forgot password**: abrir el diálogo, mandar una dirección que existe y una que no —
  **tiene que contestar lo mismo en los dos casos**; si la respuesta difiere, es una fuga
  de qué cuentas existen y es un bug de seguridad, no de UX.
- `/reset-password?token=…`: token válido, token ya usado, token vencido, token inventado,
  sin token. Contraseña corta, contraseñas que no coinciden.
- **Guards**: entrar directo a `/dashboard`, `/admin/users`, `/admin/calendar`, `/counts/…`
  sin sesión → tiene que mandar a `/login`, no mostrar un flash del contenido.
- `/sign/[token]`: token válido (generar uno desde claims), **usarlo dos veces** (es de un
  solo uso), vencido, inventado. Firmar sin trazo, con un solo punto, sin nombre.

### 5.2 Staff (usuario de un sitio)

- **Solo ve sus sitios.** Probar el selector de sitio, y además pedir por URL un sitio ajeno
  (`/counts/2026-08-04?site=<otro sitio>`) y por API (`/api/meal-counts/detail?site=…`).
  Tiene que negar, no mostrar.
- **Dashboard**: mes con días enviados, faltantes, hoy, feriados, sin servicio. Filtros por
  estado, cambio de mes y de año, ir a meses sin data.
- **Meal count**: el flujo central.
  - Cargar un día completo: horarios, asistencia, comidas por alumno, firma, certificación.
  - **Firma**: un punto no vale (el trazo tiene que superar los 30px). Borrar y rehacer.
  - **Borrador local**: marcar medio roster, cerrar la pestaña, volver → tiene que estar.
  - **Guardia de cambios sin guardar**: navegar con cambios pendientes, cerrar la pestaña.
  - Bloqueos: día futuro, día no operativo, feriado, día ya enviado. Tienen que avisar **al
    entrar**, no al mandar.
  - Roster grande: buscar, marcar todos, rendimiento al tildar.
  - **Doble submit** y submit con la conexión cortada a mitad.
- **Detalle** (`/counts/[date]`): totales, buscador del roster, descargar el PDF, badge de
  importado, y que **no aparezcan** los botones de admin.
- **Menus**: listar, ver, descargar. Con y sin conexión.
- **Requests**: crear uno de cada uno de los 8 tipos, ver los propios, ver la respuesta del
  admin cuando llega.

### 5.3 Admin

- **Users**: alta (con y sin sitios, admin y no admin), edición, activar/desactivar,
  **no poder desactivarse a sí mismo**, link de reset (copiarlo y usarlo), buscador,
  filtros combinados, paginación, mail duplicado.
- **Sites**: listado con buscador e inactivos, alta con plantilla semanal y fechas del
  programa, **generar días faltantes** (correrlo dos veces: la segunda no hace nada),
  edición, **renombrar** (verificar que counts, roster y asignaciones sigan enganchados),
  desactivar. Ficha de sitio: roster, import de roster con filas inválidas, alta y edición
  de alumnos.
- **Calendar**: pestañas Service days / Holidays. Abrir y cerrar días, comidas por día,
  días bloqueados por tener count, **Bulk edit** → patrón semanal y cierre de rango,
  **cierre masivo en varios sitios y su deshacer**, guardar y salir sin guardar.
- **Holidays**: alta con rango y alcance (todos los sitios / selección), todo el día o
  comidas puntuales, duplicados, edición, borrado, pestañas próximos/pasados, paginación.
  Verificar que el nombre aparezca en la celda del calendario y del dashboard, y que
  **borrarlo devuelva los días exactos**.
- **Counts**: corregir (nota, prefilled, historial de qué cambió), **aprobar** (bloquea la
  corrección con 409, manda el PDF al sitio, marca el check en el calendario), **deshacer la
  aprobación**, **anular** (con motivo, el día vuelve a estar abierto) y **restaurar**.
- **Requests**: inbox con estados, buscador global, filtros por sitio, responder (mail),
  reabrir (limpia la respuesta), alta desde el inbox, paginación.
- **Reports**: PDF diario, mensual por sitio, listado de claims guardados, descarga,
  reconstrucción cuando Drive no tiene el archivo, envío por mail y link de firma —
  **nunca los dos juntos**, y revocar un token de firma.
- **Consolidados**: por mes y estado, excluir sitios con buscador y atajos, validar que
  quede al menos uno, el job con su polling y su cancelar, y **el foundation id impreso**
  (`CEID 1707` para TX, `DC-72-564` para OK).
- **Settings**: reminders on/off, hora, días atrás, copias fijas, **preview** (no manda
  nada), y que la hora se respete.

### 5.4 Desarrollo (`miqueas@stoicsoftware.io`)

- `/admin/monitoring`: listado agrupado, stack, buscador, paginación, marcar resuelto,
  reaparición al volver a ocurrir.
- Con un admin común: la entrada **no está** en el navbar y `/api/monitoring` contesta 404.

---

## 6. Chequeos a nivel API

Aparte de la UI, cada ruta de §3.2 con:

- **Sin sesión** → 401 (nunca 200, nunca un stack trace).
- **Con sesión de staff sobre recursos de admin** → 403/404.
- **Staff pidiendo un sitio que no es suyo** → negado.
- **Body inválido**: campos faltantes, tipos equivocados, strings enormes, JSON roto → 422
  con mensaje legible, nunca 500.
- **Idempotencia**: mandar dos veces el mismo count, aprobar dos veces, anular dos veces.
- `POST /api/reminders` sin el secreto → 401/503. Con el secreto pero fuera de hora →
  `skipped: "not the hour"`.
- `POST /api/monitoring` sin sesión → tiene que aceptar (es la única escritura abierta), con
  esquema estricto y límite por IP: probar el límite.

Un pasador rápido de todo esto es `BASE_URL=https://… npm run smoke` (28 chequeos), pero el
smoke es contrato, no exploración: **no reemplaza este plan**.

---

## 7. Lo que ya se sabe que falta — no reportarlo como bug

| | |
|---|---|
| `MAIL_FROM=noreply@ifcares.org` no existe como usuario del Workspace | Google contesta `Invalid email or User ID`. **Ningún mail sale** hasta que se cree esa casilla o se apunte a una real. Verificable con `POST /api/mail/test` |
| El cron de reminders no está creado | Los recordatorios no se disparan solos |
| `NEXT_REDIRECT` en el monitor de errores | Falso positivo: Next implementa `redirect()` lanzando una excepción |
| Maquetación del consolidado | El contenido está campo por campo; la plantilla oficial del formulario no está replicada |
| Datos de contacto del sitio | `Site` no tiene dirección/teléfono/supervisor — falta que IF Cares confirme si el formulario los lleva |
| Import histórico incompleto | ~24 de 56 sitios. Un sitio sin historia no es un bug de la app |
| Feriados vacíos | 0 filas hasta que IF Cares mande los nombres del ciclo |

---

## 8. Cómo repartirlo entre agentes

El recorrido completo no entra en una sesión. Se reparte por **área**, no por pantalla, para
que cada agente tenga contexto suficiente y no se pisen entre ellos:

| Agente | Área | Pantallas |
|---|---|---|
| 1 | Autenticación y acceso público | login, forgot, reset, guards, `/sign/[token]` |
| 2 | Recorrido del staff | dashboard, meal-count, detalle, menus, requests |
| 3 | Admin de personas y sitios | users, sites, ficha de sitio, roster |
| 4 | Calendario | calendar, holidays, cierres masivos, generación |
| 5 | Counts como admin | corregir, aprobar, anular, restaurar, historial |
| 6 | Reportes | diario, mensual, consolidados, jobs, envío, firma |
| 7 | Requests y settings | inbox, respuestas, reminders, preview |
| 8 | API | los chequeos de §6, sin UI |

**Reglas para los agentes:**

- Cada uno **solo escribe sobre `Training Only`** y deshace lo que hizo.
- Los agentes 5 y 6 disparan mails: coordinar para que no corran a la vez.
- Ninguno cambia código. Este es un pase de observación; los arreglos van después, con la
  lista completa en la mano.
- Cada uno entrega su parte con el formato de §9 y **no resume**: un hallazgo sin pasos
  para reproducirlo no sirve.

Para conducir el navegador, las herramientas de Chrome (`mcp__claude-in-chrome__*`) — cargar
todas en **una sola** llamada a ToolSearch. Ojo con los diálogos nativos (`confirm`,
`alert`): bloquean la extensión. La app usa sus propios diálogos, pero el `beforeunload` de
la guardia de cambios sin guardar **sí es nativo** — probarlo al final del bloque.

---

## 9. Cómo se reporta un hallazgo

```markdown
### [severidad] Título de una línea

- **Dónde**: pantalla o endpoint + rol
- **Pasos**: 1. … 2. … 3. …
- **Esperado**:
- **Pasó**:
- **Evidencia**: captura, respuesta de la API, o la fila de /admin/monitoring
- **Alcance**: ¿pasa en los 3 anchos? ¿en los dos temas? ¿con otro rol?
```

**Severidad:**

| | |
|---|---|
| **Bloqueante** | Pierde datos, deja pasar a quien no debe, o impide cargar un count |
| **Alto** | Una función central no anda, o dice que hizo algo que no hizo |
| **Medio** | Rodeo posible, o un estado de error que no explica nada |
| **Bajo** | Cosmético, texto, alineación |

La categoría **"dice que hizo algo que no hizo"** es la que más importa en esta app: ya
aparecieron tres (la hora del reminder que no se aplicaba, la ventana por sitio ignorada, y
la aprobación contestando éxito sin mandar el mail). Cualquier pantalla que confirme una
acción merece que se verifique el efecto, no el cartel.

---

## 10. Cuándo está terminado

- Las 19 pantallas recorridas con los 8 puntos de §4, en los 3 anchos y los 2 temas.
- Las 40 rutas de API con los chequeos de §6.
- Los 4 roles de §5.
- `/admin/monitoring` sin errores nuevos al cerrar (descontando `NEXT_REDIRECT`).
- Todo lo escrito sobre `Training Only` revertido.
- Un único documento con todos los hallazgos ordenados por severidad, sin duplicados.

Lo que salga de acá alimenta la **Etapa 7 del ROADMAP** (testeo con staff real), que es
distinta: esa es gente de IF Cares en sus propios dispositivos. Esta pasada es para que esa
no se choque con nada evitable.
