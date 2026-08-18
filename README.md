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
- **Dashboard mensual**: el mes completo del sitio en una pantalla, con código de color
  por día (submiteado / faltante / no operativo). Click en un día → abre el count o el
  formulario de carga.
- Descarga de menús del programa.
- Envío de requests (8 tipos) al equipo administrador.

**Para Administrators**

- Todo lo anterior, sobre **todos** los sitios.
- **Usuarios**: altas, edición, desactivación, roles, asignación multi-sitio, reset de
  contraseña; búsqueda y filtros combinados.
- **Sitios**: alta completa desde un formulario (comidas, días de servicio, fechas del
  programa), importación de roster con validación fila a fila, edición de estudiantes.
- **Calendarios**: días operativos/no operativos por sitio; feriados aplicables a todos
  los sitios en una sola acción.
- **Correcciones**: edición de counts submiteados con historial completo — el valor
  original nunca se pisa; queda quién, cuándo y qué había antes, y el count se marca
  visiblemente como corregido.
- **Reportes**: PDF de cualquier count diario (réplica exacta del formulario en papel),
  PDF mensual por sitio, y los reportes consolidados por mes y estado con paso de firma —
  todos guardados en la app, recuperables y enviables por email.
- **Inbox de requests** con estados (New / In Progress / Resolved) y filtros.
- **Notificaciones**: recordatorios diarios de counts atrasados, con destinatarios,
  horario y activación configurables desde Admin, sin deploy.

**Transversal**

- Reset de contraseña self-service por email.
- Sesión con expiración por inactividad (período configurable).
- Pensada para los dispositivos reales de los sitios: celulares y tablets, targets
  táctiles grandes, sin zoom ni scroll horizontal. Cargas y submits en ≤ 1 segundo.
- Auditoría: toda escritura queda registrada (actor, acción, entidad, payload).

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

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `npm run build` | Desarrollo / build de producción |
| `npm run db:seed` | Admin inicial |
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
- [ROADMAP.md](ROADMAP.md) — ruta de trabajo del proyecto 2.0 (cards STOIC-2196..2207).
- `docs/V2-BACKEND.md` — convenciones de la API y mapeo desde el sistema legacy.
- `docs/SUPABASE-SETUP.md` — runbook de infraestructura y base de datos.
