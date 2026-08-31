# IF Cares — Regular Year App

Aplicación de conteo de comidas (meal counts) para los sitios del programa **Regular Year**
de IF Cares. El staff de cada sitio registra día a día la asistencia y las comidas servidas
por estudiante; los administradores gestionan sitios, usuarios, calendarios y correcciones,
y generan los reportes consolidados mensuales que se presentan por estado (TX / OK).

Sistema de registro: **PostgreSQL** propio. Las Google Sheets del sistema anterior quedaron
congeladas como archivo histórico en el cutover; ningún proceso las lee ni las escribe.

> 📄 Especificación técnica completa: [SPECS.md](SPECS.md) · Ruta de trabajo: [ROADMAP.md](ROADMAP.md)

---

## Funcionalidades

> Esta sección describe el **producto completo**, que es el alcance acordado. Lo que
> todavía no está construido va marcado con **(pendiente)** y su fase en
> [ROADMAP.md](ROADMAP.md) → *Plan de ejecución*.

**Para Site Staff**

- Login con sesión autenticada; cada usuario ve únicamente sus sitios asignados.
- **Meal count diario**: roster del sitio para la fecha, asistencia y meal type por
  estudiante (breakfast / lunch / snack / supper), horarios de servicio, firma en
  pantalla y texto de certificación. Un count submiteado queda bloqueado — solo un
  Administrator puede corregirlo.
  Los días que no corresponden (no operativos, feriados, ya cargados) se avisan **al
  entrar**, no al enviar; y el formulario avisa antes de cerrar la pestaña o navegar a
  otra pantalla si hay marcas sin enviar.
- **Dashboard mensual**: el mes completo del sitio en una pantalla, con código de color
  por día (submiteado / faltante / feriado / no operativo). Filtros por estado y
  selector de mes y año. Click en un día → abre el count o el formulario de carga.
- Descarga de menús del programa.
- Envío de requests (8 tipos) al equipo administrador, con el estado y la **respuesta
  del administrador** visibles.

**Para Administrators**

- Todo lo anterior, sobre **todos** los sitios.
- **Usuarios**: altas, edición, desactivación, roles, asignación multi-sitio, reset de
  contraseña; búsqueda y filtros combinados.
- **Sitios**: listado con buscador, filtro por estado y paginado; importación de roster
  con validación fila a fila y edición de estudiantes. **Alta y edición del sitio** desde
  un formulario único: las fechas del ciclo y las comidas por día de semana **generan el
  calendario** al crearlo, y se pueden completar después si el programa se extiende.
- **Calendarios**: días operativos/no operativos por sitio, comidas por día, patrón
  semanal, y cierre de un rango de fechas en varios sitios en una sola operación, con
  deshacer. Un cambio de calendario nunca toca un día que ya tiene count cargado.
  **Feriados con nombre y rango**, aplicables a todos los sitios o a una selección, a todo
  el día o solo a algunas comidas, y removibles: quitarlos devuelve los días tal como
  estaban, porque nunca se borraron.
- **Correcciones**: edición de counts submiteados con historial completo — el valor
  original nunca se pisa; queda quién, cuándo y qué había antes, y el count se marca
  visiblemente como corregido.
- **Anulación**: un count cargado en el sitio o la fecha equivocada se anula con motivo;
  el día vuelve a quedar pendiente y sale de los reportes, sin borrar la historia.
  Un administrador que anula por error ve el aviso al abrir ese día y puede restaurarla.
- **Reportes**: PDF de cualquier count diario, réplica del formulario en papel, que
  además queda archivado en Drive automáticamente. El **PDF mensual por sitio**, los
  **consolidados por mes y estado** con exclusión de sitios y el **paso de firma** con
  link público, sin login, están construidos. Falta el **envío por email** (pendiente,
  fase F).
- **Inbox de requests** con estados (New / In Progress / Resolved), filtros por estado y
  sitio, buscador, y alta de un request desde el propio inbox. La **respuesta al
  solicitante** se guarda con autor y fecha, y el sitio la ve. El **envío por email** es
  (pendiente, fase F).
- **Notificaciones**: recordatorios diarios de counts atrasados, con destinatarios,
  horario y activación configurables desde Admin, sin deploy, con vista previa de a quién
  se le escribiría antes de activarlos.

**Transversal**

- Reset de contraseña self-service por email.
- Sesión con expiración por inactividad (período configurable).
- Pensada para los dispositivos reales de los sitios: celulares y tablets, targets
  táctiles grandes, sin zoom ni scroll horizontal. Cargas y submits en ≤ 1 segundo.
- Auditoría: toda escritura queda registrada (actor, acción, entidad, payload). Un
  cierre masivo de días guarda además las filas que borró, así que es reversible.
- Monitoreo: los errores del navegador se reportan con contexto (pantalla, función,
  stack) para detectarlos sin depender de que el sitio los avise, agrupados por problema
  en una pantalla de administración. Falta la alerta por mail (pendiente, fase F).
- Las operaciones largas (PDF mensual, consolidado) corren como trabajo en segundo plano
  con estado consultable, nunca dejan la pantalla colgada esperando.

> Pendiente de definición con IF Cares: un **flujo de aprobación de counts** (el
> administrador aprueba cada count, se bloquea la edición y se notifica al sitio), que la
> app Summer ya tiene y el Regular Year no pide hoy. Ver [SPECS.md §11](SPECS.md) y
> [ROADMAP.md](ROADMAP.md).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js (App Router) — frontend y API en el mismo repo |
| Base de datos | PostgreSQL en Supabase, acceso vía Prisma 6 (migraciones versionadas) |
| Auth | Sesiones propias: bcrypt + JWT (jose) en cookie httpOnly, expiración deslizante |
| UI | Tailwind CSS + shadcn/ui; librerías headless (react-hook-form + zod, TanStack Table, react-day-picker, Sonner, Vaul, lucide, motion). Estética por tokens (CSS vars) |
| Archivos | Google Drive vía service account: menús y todos los PDFs generados (`docs/DRIVE-STORAGE.md`) |
| Email | Gmail del Workspace de ifcares.org (reset de contraseña, requests, reminders, envío de reportes) |
| Hosting | Railway — prod deploya desde `main` |

## Desarrollo local

Requisitos: Node 18+, acceso al proyecto de Supabase (o un Postgres local).

```bash
git clone <repo> && cd if-cares-frontend
cp .env.example .env        # completar credenciales (ver abajo)
npx prisma migrate dev
npm run db:seed             # crea el admin inicial desde SEED_ADMIN_*
npm run dev                 # http://localhost:3000
```

Variables principales de `.env` (nunca commitear valores):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres vía pooler (puerto 6543 en Supabase) |
| `DIRECT_URL` | Conexión directa (5432) para migraciones |
| `AUTH_SECRET` | Firma de los JWT de sesión |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Admin inicial del seed |
| `MAIL_FROM` | Casilla desde la que se manda (Gmail, ver `docs/EMAIL.md`) |
| `REMINDERS_SECRET` | Secreto compartido con el cron que dispara los recordatorios |
| `APP_URL` | URL absoluta de la app, para los links dentro de los mails |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `_PRIVATE_KEY` | Service account de Drive, el almacenamiento de todos los PDFs (`docs/DRIVE-STORAGE.md`) |
| `GOOGLE_DRIVE_MENUS_FOLDER_ID` | Carpeta donde la oficina publica los menús (lectura) |
| `GOOGLE_DRIVE_REPORTS_FOLDER_ID` | Carpeta donde la app archiva lo que genera (escritura) |
| `GAS_BASE_URL` | Apps Script legacy. Solo se usa como fallback de menús y por los scripts de import |

En Railway los nombres son **exactamente estos**, sin prefijo ni renombre: se cargan
en Variables del servicio. `NODE_ENV` y `PORT` los inyecta Railway, no hay que
declararlos. Las que solo usan los scripts locales (`SEED_ADMIN_*`, `GAS_EXPORT_KEY`,
`IMPORT_ACTIVE_SY`, `PARITY_API_URL`, `BASE_URL`, `SMOKE_*`) no hacen falta en el
servicio, salvo que se corra el seed o el smoke desde ahí.

`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` va en **una sola línea**, tal como viene en el
JSON del service account, con los `\n` literales. Si queda con las comillas del JSON
alrededor, el código las quita igual.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run build` | Desarrollo / build de producción |
| `npm run db:seed` | Admin inicial |
| `npm run drive:selftest` | Cliente de Drive contra un fetch simulado, sin tocar Drive |
| `npm run drive:doctor` | Diagnóstico de Drive con las credenciales reales; dice qué contesta Google |
| `npm run smoke` | 26 chequeos de contrato contra la app corriendo |
| `npx prisma migrate dev` | Aplica/crea migraciones en desarrollo |
| `npx prisma studio` | Explorador visual de la base |

Los scripts de la migración desde Sheets (`db:import`, `db:parity`, `import-master`,
`import-history`) quedan como referencia histórica — ver [SPECS.md §6](SPECS.md).

## Estructura

```
src/
  app/            # rutas (App Router): pantallas + API en app/api/
  components/     # librería de componentes (shadcn/ui + propios)
  lib/            # db (Prisma client), auth, dates, email, storage
prisma/           # schema.prisma + migraciones versionadas
docs/             # V2-BACKEND.md (API), SUPABASE-SETUP.md (infra)
gas-backup/       # snapshot del Apps Script legacy (solo referencia)
```

## Convenciones

- Commits con id de ticket: `STOIC-####`.
- Ramas: `dev` (trabajo) → `main` (producción). Railway deploya `main`.
- Fechas de calendario: `@db.Date` con convención UTC-midnight; toda conversión pasa
  por `src/lib/dates.js`. Nunca tratar una fecha de calendario como instante.
- Nombres de sitio contienen `/` → siempre por query param, nunca en el path.
- `migration-data/` y cualquier dump con PII están gitignoreados. **Jamás commitearlos.**

## Documentación

- [SPECS.md](SPECS.md) — especificación técnica (modelo de datos, API, migración, seguridad).
  Su **§11** es el relevamiento de paridad con la app Summer: qué se trae, de dónde, y
  qué se descartó por ser propio de ese programa.
- [ROADMAP.md](ROADMAP.md) — ruta de trabajo del proyecto 2.0 (cards STOIC-2196..2207);
  los ítems `[S]` son los que salieron de esa comparación.
- `docs/V2-BACKEND.md` — convenciones de la API y mapeo desde el sistema legacy.
- `docs/SUPABASE-SETUP.md` — runbook de infraestructura y base de datos.
