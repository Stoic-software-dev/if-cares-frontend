# STOIC-2826: migración desde el 1-oct y preparación del lanzamiento

Lanzamiento optimista: lunes 2-nov-2026. Kenya verifica el viernes 30-oct.

## Hecho el 27-oct

Decisiones del dev: conteos desde el 1-oct (no agosto ni septiembre), rosters
actualizados, calendario armado por nosotros hasta el 18-dic, y los sitios sin
actividad quedan activos hasta que Kenya diga.

- Rosters desde las Sheets: 2.655 alumnos, 242 dados de baja por no figurar más en
  su roster (se conservan con su historia).
- Conteos del 1 al 26-oct: 280 días de 19 sitios, 8.797 filas, igual que las Sheets.
  El 98,8% de las filas quedó vinculado a la ficha del alumno.
- Calendario del 27-oct al 18-dic en los 19 sitios, con el patrón de días y comidas
  de sus counts de este ciclo. Sin feriados: Thanksgiving y lo demás lo marca IF Cares.
- Copia previa de alumnos, sitios, días y counts de octubre: scratchpad de la sesión,
  `backup-before-2826.json` (fuera del repo).

## Hecho el 28-oct

- Recorrido con `qa.admin` y `qa.tester` sobre el build de producción en local. Apareció
  que todo día importado mostraba sus comidas como "no se sirvió" (el export no trae
  las comidas del día). El import ahora las deduce de las filas, y se completaron los
  7.998 días ya importados. Lista de ids tocados (para revertir, volver las cuatro a
  false): scratchpad, `backfill-day-meals-ids.json`.
- Import desde el 27-oct corrido de prueba, igual que el lunes.

## Ronda de testeo completa del 28-oct (octava, sobre 9e2ec36, local con build de producción)

Sin agentes, con scripts en el scratchpad y Playwright. Verde: matriz de permisos (44 rutas x 5
métodos x anónimo/staff/admin, cero 500), login y reset sin enumeración (los tiempos de
"forgot" se midieron en la publicada: 917 ms los dos), ciclo del count completo con
concurrencia, pedidos, alumnos, sitios, calendario, feriados, usuarios, auditoría, PDFs,
claim con firma pública y revocación, menú publicado y a la papelera de Drive, recordatorios
de verdad (27 enviados, desviados, apagados después), 225 cargas de pantalla (3 roles x
360/768/1440 x claro/oscuro) sin desborde ni error, teclado y modo offline.

Arreglado: fecha de nacimiento imposible aceptada (alumno y import de roster); el import de
usuarios salteaba las cuentas con el rol vacío (`eloiselundy@` y `bgcc@`, Eloise Lundy quedaba
sin nadie que cargue) y no traía una contraseña cambiada en las Sheets después del 3-sep.

Rastro, todo para la limpieza del lunes: sitio `ZZ QA R8 Site` (desactivado), usuarios
`zz.qa.r8.*` (desactivados), alumnos `ZZ QA R8 *` en Training Only, requests `ZZ QA R8`,
counts de Training Only del 27 (uno anulado y otro activo) y del 28 (el de la ronda anulado con
motivo `ZZ QA R9`, y uno nuevo aprobado, cargado en la publicada a 360 px), dos claims TX 2026-06
(uno firmado por "ZZ QA R8 Signer") con sus PDFs en Drive, `Consolidated Reports/2026-06`.

## Producción aparte (decidido por el dev el 28-oct)

La producción de hoy (servicio `ifcares` de Railway, rama `main`,
`ifcares-regularyear-prod.up.railway.app`) es la app vieja y los sitios la usan. La 2.0
va a un servicio nuevo con su propia base de Supabase:

- Base: el plan gratis de Supabase no dejó crear otro proyecto, y el dev decidió un
  schema aparte en el mismo, `regular_year_prod` (ver CLAUDE.md). Hecho el 28-oct:
  migraciones con `migrate deploy` (estructura igual a la de prueba), copia de los datos
  de `regular_year` (las 19 tablas con las mismas filas) y la limpieza de STOIC-2691
  **sobre la copia**: 26 counts de la 2.0, 14 cuentas, 4 sitios de prueba, 15 alumnos,
  20 pedidos de Training Only, 2 guardados y los 10 claims, con sus PDFs a la papelera
  de Drive (en la de prueba esos 10 claims ya no abren). Quedaron los 8.006 counts
  importados. Manifiesto en el scratchpad, `prod-cleanup-manifest.json`. La de prueba
  quedó como estaba. **El lunes los imports corren contra producción**, con
  `.env.prod.local`, y la limpieza no hace falta.
- Servicio: `ifcares-v2-prod` en el proyecto `if-cares`, entorno production, rama
  `main` (el dev sube v2-mock a main). Variables por referencia a `if-cares-frontend`,
  salvo `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` y `REMINDERS_SECRET`, propias.
- Mails desviados (`MAIL_REDIRECT_TO`) hasta el lunes; mismas carpetas de Drive.
- El lunes la 2.0 toma la dirección de la producción de hoy; la vieja queda apagada
  sin borrar (es el rollback).
- Creado el 28-oct, vacío y sin fuente: `ifcares-v2-prod`
  (id 3a8aab2c-2b63-4be0-9ed4-43d822bc6992), con healthcheck `/api/health` y las
  variables por referencia a `if-cares-frontend` (mails desviados incluidos). Faltan, las
  pone el dev en el panel: `DATABASE_URL` y `DIRECT_URL` (las de `.env.prod.local`),
  `AUTH_SECRET` y `REMINDERS_SECRET` nuevos (cargadas el 28-oct). Publicado en
  `ifcares-v2-prod-production.up.railway.app`, **fijado al commit 21afb11** de v2-mock:
  el dev pidió que la app vieja quede intacta hasta el lunes, y `main` todavía es la
  vieja (el servicio `ifcares` la sigue, así que subir la 2.0 a `main` antes del lunes
  la reemplaza sin configuración). Health 200 con base. Sin cuentas de prueba en
  producción: lo verifica el dev con su admin real.
- **Lunes, después de los imports**: el dev sube v2-mock a `main` (main tiene 3 commits de
  STOIC-2470 que v2-mock no), se conecta `ifcares-v2-prod` a la rama `main` sin commit
  fijo, se le pasa el dominio `ifcares-regularyear-prod.up.railway.app` y se apaga
  `ifcares` sin borrarlo. Ese día también: `APP_URL` a la dirección final (hoy es
  `https://${{RAILWAY_PUBLIC_DOMAIN}}`, que con dos dominios es ambiguo), sacar
  `MAIL_REDIRECT_TO`, y prender en Settings los recordatorios y el aviso de pedidos
  (en producción están apagados, como quedaron en la de prueba).
- Prueba de producción del 28-oct, sin sesión (las cuentas de prueba no van a
  producción): 45 rutas x 5 métodos sin un 500 y todo lo privado en 401; login y
  "olvidé" con una cuenta inexistente responden igual que siempre, en ~0,9 s; páginas
  públicas, encabezados de seguridad, service worker y 360 px sin desborde; base
  solo leyendo: schema `regular_year_prod`, 17 migraciones, 0 cuentas/sitios/alumnos
  de prueba, 8.006 counts importados, la reconciliación da igual salvo octubre (que el
  snapshot completo no tiene), 36 sitios sin días por delante (los 35 de la lista y BGC
  Cooke). Encontrado: faltaba `APP_URL` y el envío automático de recordatorios no
  arrancaba; cargada en producción. **La de prueba tampoco la tiene** (sus recordatorios
  automáticos nunca salieron); cargarla lo decide el dev.
- Prueba con sesión del 28-oct, con el admin del dev en su Chrome (el dev pidió probar
  todo y que no importaba crear cosas): 81 verificaciones en verde (pedidos, alumnos,
  sitio y calendario con cierre y deshacer, feriados, el ciclo del count con 6 envíos y
  3 aprobaciones simultáneas, corrección, anulación, PDFs del día y mensual, claim con
  cancelación, link de firma, envío, firma pública y revocación, menú a Drive y a la
  papelera, recordatorios prendidos y apagados) y 20 pantallas a 360 y 1440 px sin
  desborde ni error. Sin probar: lo de staff (no se crean cuentas en producción), el
  guardado para después (la llamada no respondió 5xx pero no se verificó que guardara),
  el envío forzado de recordatorios. Limpieza corrida de nuevo sobre producción después.
  Quedan en Drive el PDF del día y el mensual de Training Only de esa prueba.
- Después, con una cuenta de staff que creó el dev (Training Only y Anita Martinez):
  34 verificaciones en verde (no ve ni toca otros sitios ni lo de admin, pedido y
  alumno en su sitio, guardado para después que vuelve, count con 4 envíos simultáneos,
  PDF bloqueado hasta aprobar, no aprueba/corrige/anula) y el count cargado desde la
  pantalla con firma. Modo sin señal: se instala y guarda pantallas, código y menús;
  cargar sin señal no se pudo simular desde la extensión. Limpieza corrida otra vez; la
  cuenta de staff queda a cargo del dev. Queda una cuenta de staff
  activa sin contraseña (b***@ifcares.org), que necesita link.
- Ojo: el cron `if-cares-reminders-cron` pega a `if-cares-frontend-production.up.railway.app`,
  que no es la dirección de ningún servicio. Revisar antes del lunes.

## Plan del 29-oct (decidido por el dev)

Producción queda lista primero, el equipo de Kenya la prueba del viernes al domingo
en `ifcares-v2-prod-production.up.railway.app`, y recién el 2-nov, sin feedback
pendiente, la usan de verdad.

- Prueban **también en sitios reales**. Un count cargado en la app le gana al de la
  planilla del mismo día, así que el lunes, antes de traer las planillas, se lista lo
  que crearon en la app desde que se les pasó (counts con `source` distinto de
  `GAS_IMPORT`, pedidos, alumnos) y se borra con el ok del dev.
- Mails **reales** desde el 29-oct (`MAIL_REDIRECT_TO` vacío en `ifcares-v2-prod`);
  recordatorios y aviso de pedidos siguen apagados en Settings.
- Los feriados los carga Kenya como parte de su prueba.
- `if-cares-reminders-cron` apagado el 29-oct: sin horario (`cronSchedule` vacío), no
  borrado. Los recordatorios salen del propio servidor.
- Antes de pasársela: los imports contra producción con la master del 28-oct 12:15
  (usuarios, rosters, counts desde el 1-oct, calendario). Corridos el 29-oct; el import
  de usuarios volvió a crear activas `test@123.com`, `julio@julio.com`,
  `juanchosperoni@hotmail.comm` y `123@123.com`, desactivadas otra vez.
- La cuenta de staff de prueba del dev (dominio `.arr`) y la de b***@ifcares.org sin
  contraseña quedan como están; se revisan el lunes. El mensaje a Kenya lo manda Julio.

## Falta

- **Lunes 2-nov, antes de abrir**: la limpieza de STOIC-2691 y después repetir el
  import y el calendario, como dice `docs/CUTOVER.md` (sección de noviembre). Trae lo
  que los sitios cargaron en las Sheets desde el 27-oct. **Necesita una exportación
  nueva de la master** en `migration-data/master.xlsx` (la baja el dev: tiene contraseñas).
- **Para Kenya, además**: cero feriados cargados (Thanksgiving y el receso); 7 cuentas de
  staff activas sin sitio (brenda, drexel, kipphigh, sanmiguel, christsfoundry, casahope y
  lhteens @ifcares.org); `BGC Cooke` entra a la lista de sitios sin días por delante.
- Hecho por decisión del dev el 28-oct: se sacaron los 622 días de agosto y septiembre
  sin ningún count (no se importan esos meses, y se veían como "Missing") y el día suelto
  de BGC Cooke del 12-feb-2029; copia de las filas en el scratchpad,
  `removed-service-days-2826.json`. Se desactivaron `julio@julio.com`, `123@123.com`,
  `test@123.com`, `email@useremail.com` y `juanchosperoni@hotmail.comm`.
- **Para Kenya el viernes**: estos 35 sitios siguen activos sin un día por delante y
  sin counts en las Sheets en octubre. Confirmar cuáles se desactivan:
  - `2025/2026 TX BGC COOKE`: cargó en las Sheets hasta el 30-sep y paró. ¿Cerró?
  - Sin actividad este ciclo: `2025/2026 TX COD JUANITA J. CRAFT REC CENTER`,
    `2025/2026 TX COD PLEASANT OAKS REC CENTER`, `2025/2026 TX PTNT-Owenwood SB2026`,
    `2025/2026 TX VOICE OF HOPE-UPLIFT GRAND`, `Advantage-Intrinsic Foundation`.
  - Del ciclo anterior (sin prefijo de año): Casa del Lago, COD Churchill, COD JJ
    Craft, COD Lake Highlands North, COD Lake Highlands Teens, COD Pleasant Oaks, COD
    Reverchon, Harry Stone, PTNT Christ's Foundry, PTNT Owenwood, Readers2Leaders,
    Reed Foundation, San Miguel School, TWU Clubhouse, VOH Uplift Grand, Voice of
    Hope Ministries.
  - Oklahoma: los 7 Drexel Academy, OK-Reed Foundation, TT KIPP HS, TT KIPP MS, TT
    The Zone, Tulsa Dream Center North y West. Ninguno tiene datos en las Sheets desde
    agosto: ¿Oklahoma arranca más tarde o no corre este año?
- Hojas con la fila de totales distinta a la suma de sus alumnos (el import guardó lo
  de cada alumno): Martin Weiss 1, 2, 14 y 15-oct; PTNT-Owenwood 1, 5, 6, 7 y 8-oct.
- `Test Site` y `Training Only` recibieron días por delante con el patrón de sus
  pruebas. Los limpia STOIC-2691.
