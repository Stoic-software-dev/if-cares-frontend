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
