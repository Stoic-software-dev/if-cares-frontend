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
- **Sitios**: listado con buscador y filtro de inactivos; alta completa desde un
  formulario (datos de contacto, comidas, días de servicio, fechas del programa) que
  **genera el calendario del ciclo**; edición, desactivación, e importación de roster con
  validación fila a fila y edición de estudiantes.
- **Calendarios**: días operativos/no operativos por sitio y comidas por día; **feriados
  con nombre y rango de fechas**, aplicables a todos los sitios o a una selección, a
  todas las comidas o solo a algunas, y removibles con el mismo alcance. Un cambio de
  calendario nunca toca un día que ya tiene count cargado.
- **Correcciones**: edición de counts submiteados con historial completo — el valor
  original nunca se pisa; queda quién, cuándo y qué había antes, y el count se marca
  visiblemente como corregido.
- **Anulación**: un count cargado en el sitio o la fecha equivocada se anula con motivo;
  el día vuelve a quedar pendiente y sale de los reportes, sin borrar la historia.
- **Reportes**: PDF de cualquier count diario (réplica exacta del formulario en papel),
  PDF mensual por sitio, y los reportes consolidados por mes y estado (con exclusión de
  sitios) — se pueden guardar, enviar por email a varios destinatarios y quedan
  recuperables. Los consolidados incluyen el **paso de firma**: un link enviable donde
  quien firma ve el PDF y firma en pantalla, sin necesidad de tener cuenta.
- **Inbox de requests** con estados (New / In Progress / Resolved), filtros por estado,
  sitio y fecha, buscador y **respuesta al solicitante** por email.
- **Notificaciones**: recordatorios diarios de counts atrasados, con destinatarios,
  horario y activación configurables desde Admin, sin deploy.

**Transversal**

- Reset de contraseña self-service por email.
- Sesión con expiración por inactividad (período configurable).
- Pensada para los dispositivos reales de los sitios: celulares y tablets, targets
  táctiles grandes, sin zoom ni scroll horizontal. Cargas y submits en ≤ 1 segundo.
- Auditoría: toda escritura queda registrada (actor, acción, entidad, payload).
- Monitoreo: los errores del navegador se reportan a un servicio central con contexto
  (pantalla, función, stack) para detectarlos sin depender de que el sitio los avise.
- Las operaciones largas (PDF mensual, consolidado) corren como trabajo en segundo plano
  con estado consultable — nunca dejan la pantalla colgada esperando.

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
| Archivos | Storage para firmas, PDFs generados y menús |
| Email | Proveedor transaccional (reset de contraseña, requests, reminders, envío de reportes) |
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
| `EMAIL_*` | Credenciales del proveedor de email |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `_PRIVATE_KEY` | Service account de Drive, el almacenamiento de todos los PDFs (`docs/DRIVE-STORAGE.md`) |
| `GOOGLE_DRIVE_MENUS_FOLDER_ID` | Carpeta donde la oficina publica los menús (lectura) |
| `GOOGLE_DRIVE_REPORTS_FOLDER_ID` | Carpeta donde la app archiva lo que genera (escritura) |
| `GAS_BASE_URL` | Apps Script legacy. Solo se usa como fallback de menús y por los scripts de import |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run build` | Desarrollo / build de producción |
| `npm run db:seed` | Admin inicial |
| `npm run drive:selftest` | Cliente de Drive contra un fetch simulado, sin tocar Drive |
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
