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

## Conteos importados

Los conteos con `source = GAS_IMPORT` vienen del sistema anterior, que no tenía
aprobación: ninguno está aprobado y no pasan por la cola de Approvals ni tienen
el PDF bloqueado.
