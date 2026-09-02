# Corte a producción: runbook y rollback (STOIC-2207)

Hasta el momento del corte, la app vieja sigue siendo la de verdad y el staff sigue
cargando counts en las Sheets todos los días de servicio. Este documento es lo que se
ejecuta el día del switch, y lo que se hace si sale mal.

El pipeline de migración ya está construido y corrido muchas veces (STOIC-2198). La última
reconciliación completa no encontró diferencias: **56 sitios, 7.718 días, 368.996 filas,
0 diferencias**. Lo que falta es la corrida autoritativa con la data hasta el último minuto.

---

## Antes de ejecutar: lo que tiene que estar acordado con IF Cares

Nada de esto lo decidimos nosotros. Sin las cuatro respuestas, no se corta.

1. **Fecha y hora exactas.** Conviene arrancar un fin de semana o un día no operativo:
   cuanto menos counts en vuelo, menos casos raros. El calendario del programa está en
   `America/Chicago` y el corte se agenda en esa hora, no en la nuestra.
2. **Qué pasa con un count a medio cargar** en el momento del switch. Recomendación: la
   ventana empieza después del último servicio del día, así no hay ninguno.
3. **A quién y cuándo se le avisa.** Cada sitio tiene que saber, antes del día, cuándo deja
   de usar la app vieja y con qué entra a la nueva.
4. **Las respuestas a la carta de anomalías** (`docs/data-anomalies-for-ifcares.md`).
   Son decisiones sobre datos reales: alumnos duplicados, cuentas repetidas, registros que
   se descartan. Migrar sin esas respuestas es elegir por el cliente.

### Lo que bloquea el corte y es nuestro

**El calendario de servicio está vacío hacia adelante.** Medido contra producción el
2-sep: **53 de los 56 sitios activos no tienen un solo día por delante**, 36 días en todo
el programa, y ningún sitio trae ciclo ni plantilla semanal. Cargar un count exige que el
día exista (`ServiceDay`); sin él la API contesta "This date is not available for meal
counts". O sea: **la mañana siguiente al freeze, casi nadie puede trabajar.**

No es un descuido de la migración, es cómo era el sistema viejo: publicaba los días de a
uno, a las 7:45 de cada mañana, desde la pestaña `All Meals` del master. El import solo
podía capturar los dos o tres días que esa pestaña tuviera en ese momento, y **la corrida
final tampoco va a traer más**. El calendario del ciclo hay que construirlo en la app.

```
npm run db:calendar
```

Reporta qué sitios están vacíos y **propone la plantilla semanal de cada uno leída de sus
propios counts** — no de las banderas de `ServiceDay`, que no sirven acá: el 89% de los
días importados trae las cuatro comidas en `false`, no sobrevivieron al export. Sale
limpio: BGC Cooke `Mon LS` y de martes a viernes `SP`, Churchill `Mon..Fri S`, y así. Sale
con código 1 mientras quede un sitio sin días, así que sirve de compuerta.

Cinco sitios no tienen historia reciente de la que deducir nada; esos se preguntan.

En la app se ve sin correr nada: la pantalla **Sites** avisa cuántos sitios no tienen días
por delante y marca cada uno. Antes no se notaba, porque un sitio con el calendario vacío
tampoco muestra counts atrasados: leía como sano.

### El resto, antes del día

- [ ] Las pruebas con staff real (STOIC-2206) cerradas, sin hallazgos bloqueantes abiertos.
- [x] El scheduler de recordatorios. **Resuelto el 2-sep**: lo agenda el propio servidor
      (`src/lib/reminder-scheduler.js`), no un servicio aparte corriendo `curl`. El que
      había ejecutó exactamente dos veces y después quedó horas sin un tick, con el
      deployment marcado sano. Ahora chequea cada 5 minutos y manda una vez por día, a
      partir de la hora configurada, contra una fecha guardada en la base para que un
      reinicio no mande todo dos veces. La pantalla distingue **cuándo chequeó** de
      **cuándo mandó**. Falta solo **encenderlos**: hoy están en off, que es lo correcto
      hasta el corte.
- [ ] Los feriados del ciclo cargados. Hoy hay cero filas. Menos urgente de lo que parecía:
      hoy solo Labor Day cae en un día de servicio, y en 2 sitios. Pero cuando se construya
      el calendario del ciclo, los feriados hay que marcarlos junto con él, o cada uno se
      reclama como día atrasado.
- [ ] **Borrar las cuentas de prueba**: `qa.admin@example.org` (ADMIN, contraseña conocida),
      `qa.tester@example.org`, `qa.apitest@example.org`.
- [ ] **Borrar los 5 sitios de prueba**. Están todos inactivos y sin un solo count vivo,
      pero ensucian cualquier auditoría con 803 días de servicio fantasma: `ZZ Concurrency
      Site 1788295032152`, `ZZ Concurrency Site2 1788295058032`, `ZZ Concurrency Site3
      1788295102065`, `ZZ Deploy Probe No State`, `ZZ QA TEST SITE 20260831 RENAMED`. La app
      no borra sitios a propósito — desactiva — así que va por el editor SQL de Supabase,
      borrando primero entries, correcciones, counts, requests, días y alumnos.
- [ ] Backups automáticos de Supabase verificados **con una restauración de verdad**, no
      con la pantalla que dice que están activos.

---

## Ejecución

Se hace en este orden. Cada paso deja algo escrito antes de pasar al siguiente.

### 1. Congelar las Sheets

Quitar permiso de escritura a todos los que no sean el dueño y dejar los archivos como
archivo histórico. Desde ese momento nadie puede cargar en el sistema viejo, que es lo que
hace que la corrida final sea autoritativa: si alguien puede seguir escribiendo, la
reconciliación mide contra un blanco que se mueve.

Anotar la hora exacta del freeze. Es la línea contra la que se compara todo después.

### 2. Correr la migración final

```
npm run db:import:master     # sitios, usuarios, calendarios, rosters
npm run db:import:history    # counts históricos
npm run db:reconcile         # sitio x mes, Sheets contra base
npm run db:calendar          # que todo sitio pueda cargar mañana
```

`db:reconcile` compara días, filas y totales por comida, sitio por sitio y mes por mes,
separando lo cargado por la app de lo anulado. **Sale con código 1 si hay una sola
diferencia.** No se sigue con diferencias sin explicar.

`db:calendar` es la otra compuerta, y la que más fácil se olvida: la reconciliación puede
dar perfecta con un calendario vacío, porque mide lo que ya pasó. Esta mide si mañana se
puede trabajar.

### 3. Validar con IF Cares antes de habilitar a nadie

El reporte de reconciliación va al cliente y **espera respuesta**. Habilitar usuarios antes
de eso convierte una diferencia de datos en counts nuevos encima de datos dudosos.

### 4. Habilitar la app nueva

Recién acá se dirige a todos los usuarios a la app nueva.

---

## Verificación post corte

En producción, con la data final, antes de irse:

- [ ] Login de un usuario **existente** de cada rol (no de una cuenta creada para probar).
- [ ] Carga de un count completo en un sitio real.
- [ ] Dashboard mensual de ese sitio, con el día recién cargado en verde.
- [ ] PDF del count y PDF mensual.
- [ ] Un consolidado por estado, con firma.
- [ ] Que el aviso de request nuevo llegue a quien tiene que llegar
      (`kenya@ifcares.org`, copia a `marisela@ifcares.org`).
- [ ] Encender los recordatorios y confirmar en la pantalla que el scheduler **chequeó**
      hace minutos y que **mandó** el día que corresponde. Son dos líneas distintas, y solo
      la segunda dice que alguien recibió algo.
- [ ] `npm run smoke` y `npm run db:calendar` contra producción.

Y después del día del corte:

- [ ] Acompañar el **primer día de servicio completo** con soporte activo. No es una
      formalidad: es el primer día en que sesenta personas usan la app a la misma hora.

---

## Rollback

Se decide rápido y se ejecuta sin discusión. El criterio para volver atrás: **los sitios no
pueden cargar counts** y no hay arreglo a la vista en el día. Cualquier otra cosa se corrige
hacia adelante.

1. **Descongelar las Sheets**: devolver permiso de escritura. Es el paso que importa y es
   inmediato, porque las Sheets quedaron intactas — la migración lee, nunca escribe en ellas.
2. **Avisar a los sitios** que vuelven a cargar donde cargaban antes. Mismo canal que el
   aviso del corte.
3. **La app nueva queda como estaba**, sin borrar nada. Los counts que entraron durante la
   ventana quedan en la base y se reconcilian a mano después; son pocos, porque la ventana
   se eligió corta.
4. **Anotar por qué se volvió.** Sin eso, el segundo intento repite el primero.

Lo que hace barato el rollback es que las Sheets nunca se tocan: el freeze es un cambio de
permisos, y deshacerlo es otro cambio de permisos. No hay que restaurar nada.

---

## Estado al 2-sep-2026

Lo que ya está probado contra producción: mail (envíos reales), Drive (los PDFs se archivan),
consolidados con firma, correcciones que llegan a los totales del claim, import de rosters,
aviso de request nuevo, y la reconciliación completa sin diferencias.

Lo que falta y **no es código**: la fecha con el cliente, las respuestas a la carta de
anomalías, las pruebas con staff real y la restauración de backup probada.

Lo que falta y **sí es trabajo, aunque no sea código**: construir el calendario del ciclo.
Es lo único que hoy haría fracasar el corte por sí solo, y es lo que menos parecía un
problema, porque un sitio sin días no muestra nada raro en ninguna pantalla. Ahora sí las
muestra.
