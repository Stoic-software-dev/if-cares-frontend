Tablero: STOIC-8

## La base de la 2.0

- La app 2.0 vive en la rama `v2-mock` y se publica sola en
  `after-school-program-test.up.railway.app` con cada push. Su base es la de
  Supabase que usa `.env`: la misma para local y para la publicada.
- **Esa base no lleva el registro de migraciones de Prisma**: `prisma migrate
  status` marca las 15 como no aplicadas aunque las tablas existen. No correr
  `prisma migrate deploy` ni `migrate dev` contra ella, que intentarían crearlo
  todo de nuevo. Una migración nueva se aplica corriendo su SQL a mano, y el
  archivo en `prisma/migrations/` queda como registro.
- Una columna nueva tiene que existir en la base **antes** de publicar el código
  que la usa: el cliente de Prisma la pide en cada lectura de esa tabla y, si no
  está, esa lectura falla.
- El SQL de una migración se corre con `$executeRawUnsafe` desde un script de
  Node: así toma el schema `regular_year` de la URL. Las tablas viven ahí, no
  en `public`.
- **Nada de `$executeRaw`/`$queryRaw` con tablas sin calificar en el código de
  la app**: detrás del pooler de Supabase, una consulta a mano a veces cae en
  una conexión sin `regular_year` en el search path y falla con "relation does
  not exist", de forma intermitente. Las consultas de Prisma no tienen el
  problema porque califican el schema.
- **Producción de la 2.0 vive en la misma base, en el schema `regular_year_prod`**
  (desde el 28-oct-2026; el plan gratis de Supabase no deja crear otro proyecto).
  `regular_year` es la de prueba. Las direcciones de producción están en
  `.env.prod.local` (no se commitea): un script corre contra producción con
  `set -a && . ./.env.prod.local && set +a && node scripts/...`, y sin eso va a la de
  prueba. Una consulta a mano en un script toma el schema de la URL
  (`src/lib/db-schema.mjs`), nunca lo escribe. `regular_year_prod` sí lleva el
  registro de migraciones: ahí una migración nueva va con `prisma migrate deploy`.
- Tests: `npm test` (node --test sobre `tests/*.test.mjs`). Lo que se testea
  vive en módulos `.mjs` sin imports con `@/`, para que node los cargue solo.

## Antes del go-live

- Limpieza de datos de prueba (STOIC-2691), con copia de la base antes:
  `node scripts/cleanup-test-data.mjs` arma la lista y el manifiesto,
  `--rehearse <manifiesto>` hace todo y lo deshace, `--apply <manifiesto>`
  borra exactamente lo listado. Correrlo el día del corte, no antes: las
  pruebas que siguen ensucian la base de nuevo.

## Conteos importados

Los conteos con `source = GAS_IMPORT` vienen del sistema anterior, que no tenía
aprobación: ninguno está aprobado y no pasan por la cola de Approvals ni tienen
el PDF bloqueado.

## Modo offline (STOIC-2771)

- Solo para site users. Sus datos quedan en el celular (`src/lib/offline.js`,
  bajo el id de la cuenta) y el service worker (`public/sw.js`, solo en el build
  de producción) guarda las páginas y su código. Para probarlo en local hace
  falta `next build` + `next start`, no `next dev`.
- La sesión dura 14 días para site users y 8 horas para admins
  (`src/lib/session-policy.mjs`). Un `403` de la API quiere decir cuenta dada de
  baja: el celular borra lo que guardaba de esa cuenta.
- **Un celular puede tener la versión anterior de la app durante días**: lo que
  recibe un conteo o un guardado (`/api/meal-counts`, `/api/meal-count-drafts`)
  tiene que seguir aceptando lo que manda la versión anterior. Un campo nuevo
  es opcional.
- Una pantalla nueva de site users que tenga que andar sin señal lee con
  `offlineGet`/`cachedGet` y suma su lectura a `keptOffline` en
  `src/lib/data-cache.js`, y su ruta a `OFFLINE_PAGES` en
  `src/components/offline/OfflineLayer.jsx`.
