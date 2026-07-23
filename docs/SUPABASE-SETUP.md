# Runbook — Supabase + migración completa (Fase 2, parte de datos)

Todo el código y las migraciones SQL ya están en el repo (branch `v2-backend`).
Esta guía es la secuencia exacta para dejar la base productiva cargada. Tiempo
estimado: **~30 minutos**, la mayoría esperando imports.

## 0. Prerrequisitos (una sola vez)

- [ ] `migration-data/master.xlsx` existe (ya descargado el 23-jul-2026; si hace
      falta refrescarlo: Drive → Master → File → Download → .xlsx).
- [ ] Pegar el export de histórico en el Apps Script:
  1. Abrí el proyecto "Master" en script.google.com.
  2. Creá un archivo nuevo y pegá el contenido de `gas-backup/migration-export.gs`.
  3. En `MIGRATION_EXPORT_KEY` poné un string largo aleatorio (generá uno:
     `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`).
  4. En `api/doGet.gs`, antes del `else` final, agregá:
     ```js
     else if (e.parameter.type === "exportHistory") {
       return handleExportHistory(e);
     }
     ```
  5. Deploy → Manage deployments → ✏️ Edit → Version: **New version** → Deploy
     (la URL `/exec` no cambia).

## 1. Crear el proyecto Supabase (3 min)

1. supabase.com → New project → nombre `ifcares`, región **East US**, generá y
   guardá el Database password.
2. Project Settings → Database → Connection string:
   - **Transaction pooler** (puerto 6543) → va a `DATABASE_URL`, agregándole
     `?pgbouncer=true&connection_limit=1`
   - **Direct connection** (puerto 5432) → va a `DIRECT_URL`

## 2. Configurar `.env`

```env
DATABASE_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<PASSWORD>@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
AUTH_SECRET="<node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\">"
AUTH_COOKIE_NAME="ifc_session"
SESSION_TTL_HOURS="8"
APP_TIMEZONE="America/Chicago"
GAS_BASE_URL="<la URL /exec actual — está en src/constants/index.js>"
GAS_EXPORT_KEY="<el mismo string que pusiste en MIGRATION_EXPORT_KEY>"
IMPORT_ACTIVE_SY="2025/2026"
SEED_ADMIN_EMAIL="..."
SEED_ADMIN_NAME="..."
SEED_ADMIN_LASTNAME="..."
SEED_ADMIN_PASSWORD="<mínimo 8 caracteres>"
```

## 3. Secuencia de comandos (en orden)

```bash
# 1. Esquema: corre las DOS migraciones SQL (init + site_state_and_settings)
npx prisma migrate deploy

# 2. Admin de emergencia (por si la hoja de Users trae sorpresas)
npm run db:seed

# 3. Sitios + estudiantes + calendario de servicio, desde la API GAS (read-only)
npm run db:import -- --snapshot

# 4. Usuarios (con sus contraseñas actuales hasheadas), estados TX/OK,
#    foundation IDs y ventanas de recordatorio, desde master.xlsx
npm run db:import:master -- --dry-run   # primero mirar el resumen
npm run db:import:master

# 5. Histórico por estudiante (tabs por fecha de cada sitio, via exportHistory)
npm run db:import:history -- --parse-only --site="2025/2026 TX BGC COOKE"  # prueba con 1 sitio
npm run db:import:history                # todos los sitios activos (~10-20 min)
#   → guarda snapshots en migration-data/history/*.json
#   → si se corta, re-correr: es idempotente; o usar --from-snapshots

# 6. Verificación de paridad contra el GAS vivo (con `npm run dev` corriendo)
npm run dev          # en otra terminal
npm run db:parity
```

## 4. Verificación final

- `curl http://localhost:3000/api/health` → `{"ok":true,"db":true}`
- Login con tu usuario real de la hoja Users (la contraseña de siempre) →
  debe devolver tu rol y sitios.
- `GET /api/meal-counts/all` → fechas enviadas del histórico aparecen como
  `excludedDates`.
- En Supabase → Table Editor: `MealCount` con miles de filas, `MealCountEntry`
  poblada, `User` ~57 filas.

## Notas

- **Todo re-ejecutable**: los tres imports son idempotentes (upsert por claves
  naturales). GAS sigue siendo la fuente de verdad hasta el cutover — re-correr
  pisa cambios locales, por diseño.
- Un conteo creado por la app v2 (`source = APP`) **nunca** es pisado por el
  import de histórico.
- Nombres históricos tipo "Apellido, Nombre" no van a linkear con el roster
  actual ("Nombre Apellido") — quedan como snapshot con `studentId = null`; es
  el comportamiento esperado (el legacy tampoco los vinculaba).
- Firmas históricas (PNGs en Drive/Signatures) quedan como pendiente opcional;
  las nuevas se guardan en la DB desde el día uno.
- `migration-data/` está en `.gitignore` (PII + contraseñas): no commitear nunca.
- Cuando el cutover esté hecho y verificado, borrar `migration-export.gs` del
  Apps Script (o cambiar la key) y rotar las contraseñas de la hoja si se desea.
