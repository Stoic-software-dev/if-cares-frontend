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

## Falta

- **Lunes 2-nov, antes de abrir**: la limpieza de STOIC-2691 y después repetir el
  import y el calendario, como dice `docs/CUTOVER.md` (sección de noviembre). Trae lo
  que los sitios cargaron en las Sheets desde el 27-oct.
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
