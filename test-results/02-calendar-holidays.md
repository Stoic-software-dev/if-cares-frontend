# Área 4 — Calendario y Feriados (`/admin/calendar`, `/admin/holidays`)

Sitio usado para toda escritura: **Training Only**. Ningún otro sitio fue modificado (verificado
antes de cada escritura que el selector mostrara "Training Only" y, en los cierres/feriados
masivos, que el picker de sitios tuviera únicamente "Training Only" tildado antes de confirmar).

## No probado / dejado afuera, y por qué

- **Anchos 768px y 1440px**: `resize_window` reportó éxito en cada llamada pero el viewport
  capturado por `screenshot`/`zoom` se mantuvo en ~867×1400 durante toda la sesión pase lo que
  pase (probado en dos pestañas distintas, con esperas de hasta 2s entre el resize y la captura).
  Es una limitación del entorno de herramientas, no algo observable de la app. Sí hubo una
  ventana accidental de ~238px (efecto secundario de una llamada a `zoom` que aparentemente
  redimensionó la ventana real en vez de solo recortar la captura) donde se confirmó que la app
  cambia a una barra de navegación inferior tipo móvil — o sea el layout responsive existe y
  reacciona, pero no pude fijar el ancho exacto de 768px pedido para inspeccionarlo a fondo.
- **Tema oscuro**: no se tocó el toggle de tema en esta pasada (no estaba en la lista específica
  del brief de esta área; queda para quien recorra §4.6 general de TEST.md).
- **Paginación real de Holidays**: la lista nunca tuvo más de 2 feriados a la vez durante mi
  paso, así que no se pudo ejercitar la paginación con >15 filas.
- **Recorrido exhaustivo de Tab por cada control**: se verificó el patrón general (nav superior →
  header → tabs de sección → selector de sitio → grilla) y los tres puntos puntuales pedidos
  (Escape cierra el popover, Space/Enter togglea el switch enfocado, Enter abre el dropdown de
  Bulk edit), pero no se mapeó cada parada de foco celda por celda de los 30+ días del mes.
- Un detalle menor sin confirmar: la herramienta `find` devolvió dos botones "Clear search" en el
  estado vacío de búsqueda de Holidays; no pude establecer si es una duplicación real en el DOM o
  un artefacto de la herramienta, así que no lo reporto como hallazgo.

## Datos residuales dejados en Training Only

- **Agosto 2026**: sin cambios míos — los 4 días bloqueados (4, 10, 17, 18) y hoy (31, Lun) están
  intactos, tal cual estaban al empezar. *No es mío*: el día 20 (Lun, sin candado) apareció
  durante la sesión — es de otro agente corriendo en paralelo sobre el mismo sitio (coincide con
  las URLs `/counts/2026-08-*` y `/meal-count?...correct=1` que se vieron pasar por pestañas
  ajenas). Aviso para quien coordine la limpieza, no lo toqué.
- **Septiembre 2026**: quedaron abiertos 9 días por mí, vía "Apply a weekly pattern" (todos los
  lunes y miércoles del mes, con Almuerzo): 2, 7, 9, 14, 16, 21, 23, 28, 30. *No es mío*: el día
  15 (martes, Lun) — mismo caso, otro agente concurrente.
- **Octubre 2026**: quedaron abiertos 4 días por mí, resultado final de probar la opción
  "replace" de "Apply a weekly pattern" (todos los lunes, con Desayuno): 5, 12, 19, 26. Un patrón
  intermedio (martes/jueves, Desayuno) fue reemplazado por este y no dejó rastro.
- **Feriados**: no quedó ninguno cargado en el sistema — los dos que creé para probar
  (`QA Holiday é ñ ' " < > &` y `QA Locked Day Check`) fueron borrados y se confirmó que el
  calendario volvió exactamente al estado previo en ambos casos.
- Los 4 días con count real (Aug 4, 10, 17, 18) nunca cambiaron de estado — verificado repetidas
  veces a lo largo de la sesión.
- **Pestaña de navegador**: quedó abierta una pestaña (no la mía activa, una que usé al principio
  y que un bug de la herramienta `zoom` dejó con la ventana achicada a ~238px) que no pude cerrar
  — `tabs_close_mcp` se colgó repetidas veces sobre ella. No tiene riesgo de datos: los cambios
  sin guardar que quedaron en su estado local (día 5 de agosto marcado "abierto, sin comidas")
  nunca se guardaron contra el servidor. Puede requerir cierre manual.

---

### [Alto] El feriado no aparece en el calendario (ni admin ni dashboard) en los días que no tenían ya un día de servicio programado

- **Dónde**: `/admin/calendar` (Service days) y `/dashboard`, rol admin, sitio Training Only
- **Pasos**:
  1. En Training Only, octubre 2026 solo tenía lunes abiertos (5, 12, 19, 26 con Desayuno); el resto del mes no tenía fila de día de servicio (cerrado por ausencia, no por acción explícita).
  2. Ir a Holidays → Add holiday. Nombre "QA Holiday", From 10/20/2026, To 10/22/2026, Applies to → Only the sites I pick → Training Only únicamente, Closes → The whole day. Guardar.
  3. La lista de Holidays confirma correctamente "Oct 20, 2026 to Oct 22, 2026 · 1 site · Training Only".
  4. Volver a `/admin/calendar?site=Training Only`, octubre 2026: los días 20, 21 y 22 se ven completamente en blanco, iguales a cualquier otro día cerrado sin feriado — sin el nombre del feriado, sin ningún indicio.
  5. Editar el mismo feriado y cambiar From a 10/19/2026 (que sí tenía una fila de día de servicio, Desayuno). Guardar. Ahora el día 19 sí muestra el nombre del feriado — los días 20-22 (parte del mismo rango, sin fila previa) siguen en blanco.
  6. Repetir la comprobación en `/dashboard?site=Training Only`, octubre 2026: mismo patrón — el 19 muestra estado "Holiday" correctamente, los días 20-22 aparecen como celdas vacías/deshabilitadas, sin ningún estado.
- **Esperado**: la ficha del feriado dice que cubre "Oct 19 a Oct 22" — las 4 fechas deberían mostrar el feriado en el calendario, tal como promete el texto de la pantalla ("A holiday closes the days it covers... and the calendar shows its name" / "el calendario también lo muestra").
- **Pasó**: solo se muestra en las fechas que ya tenían una fila de `ServiceDay` cargada de antes. Las fechas del mismo feriado que no tenían fila previa (cerradas "por ausencia") quedan sin ningún indicio visual del feriado, tanto en el calendario admin como en el dashboard de staff.
- **Evidencia**: capturas de `/admin/calendar?site=Training Only` (oct.) y `/dashboard?site=Training Only` (oct.) tomadas en la sesión, día 19 con badge "QA Holiday é ñ ' \" < ..." + "Holiday"/"Brk" según pantalla, días 20-22 en blanco en ambas pantallas. Confirmado además con un segundo feriado (`QA Locked Day Check`, Aug 3-5): en el calendario admin, Aug 3 y Aug 5 (sin fila de servicio) tampoco muestran ningún indicio del feriado, solo Aug 4 (que tiene count real) se ve — y ese se ve sin cambios porque además está bloqueado (ver alcance).
- **Alcance**: se reprodujo igual en dos feriados distintos, con alcance "whole day" y "only some meals" (Breakfast), y en ambas pantallas (admin calendar y dashboard). No se probó en otros anchos/temas. Es plausible que en sitios reales, donde casi todos los días del mes tienen fila de servicio, el problema se note menos — pero cualquier feriado que incluya un fin de semana, un mes sin patrón aplicado aún, o días recién agregados al programa, va a "desaparecer" parcialmente igual que acá.

---

### [Medio] En el calendario admin, un día con feriado de "todo el día" sigue mostrándose tildado/abierto con la comida original, mezclando dos estados contradictorios

- **Dónde**: `/admin/calendar` (Service days), rol admin, sitio Training Only
- **Pasos**:
  1. Con el feriado "QA Holiday..." (whole day) cubriendo Oct 19 (día que tenía Desayuno programado), abrir `/admin/calendar?site=Training Only`, octubre 2026.
  2. Mirar la celda del día 19.
- **Esperado**: un feriado de "todo el día" cierra el día — la celda debería verse como un día cerrado (sin el tinte que indica "sirve comidas"), con el nombre del feriado como única marca. Así es exactamente como se ve en el `/dashboard` (staff): el día 19 ahí muestra solo el estado "Holiday", sin chip de comida.
- **Pasó**: en el calendario admin la celda del día 19 se ve **tildada/con el mismo fondo verde que cualquier día abierto normal**, con el chip "Brk" (Desayuno) Y el badge del nombre del feriado al mismo tiempo. El texto de ayuda de la pantalla dice "A tinted day serves meals" — este día está tintado pero, según el propio feriado, no debería servir nada.
- **Evidencia**: captura de `/admin/calendar?site=Training Only`, octubre 2026, celda del día 19 — fondo verde igual a los días 5/12/26 (que sí sirven), con "QA Holiday é ñ ' \" < ..." y "Brk" en el mismo recuadro. Comparado lado a lado con la misma fecha en `/dashboard`, que sí resuelve bien el estado (solo "Holiday").
- **Alcance**: la causa parece ser que el calendario admin arma las comidas de la celda desde `/api/sites/service-days` (datos crudos, sin descontar feriados) y solo superpone el nombre del feriado por separado, mientras que el dashboard usa `/api/meal-counts/all` (que sí resta el feriado antes de decidir el estado). No se probó con "only some meals" donde queden comidas remanentes (ej. feriado cierra solo Almuerzo en un día que sirve Desayuno+Almuerzo) — ahí probablemente el chip mostraría comidas que sí siguen sirviéndose, lo cual sería correcto; el problema es específicamente cuando el feriado cierra todas las comidas del día y el chip las sigue mostrando igual.

---

### [Medio] Al abrir un día cerrado (toggle individual o "Apply a weekly pattern"), el relleno automático de comidas más frecuentes no siempre aplica — el día queda "abierto" sin ninguna comida marcada

- **Dónde**: `/admin/calendar` (Service days), popover de día y diálogo "Apply a weekly pattern", rol admin, sitio Training Only
- **Pasos**:
  1. Con los datos originales de Training Only (agosto: día 4, 17, 18 = Snk+Sup; día 10 = sin comidas [bloqueado]; día 31 = Almuerzo — o sea Snk+Sup es la combinación más común, 3 de 5 días), abrir el calendario de agosto.
  2. Click en el día 5 (cerrado) → togglear el switch "Service day" a ON.
  3. Repetir con el día 6 y con el día 20, cada uno desde un estado limpio ("Saved").
  4. Abrir Bulk edit → "Apply a weekly pattern" sin tocar nada más.
- **Esperado**: según el propio diseño de la función (el badge de comidas por defecto es "la combinación más común del sitio, para que se edite la excepción en vez de armar cada día"), el día nuevo debería abrir con Snack+Supper ya tildados.
- **Pasó**: en los tres casos (día 5, día 6, día 20) el día se abrió con **las 4 comidas destildadas**, mostrando "No meal" en rojo en la celda — a pesar de que la celda queda tintada/abierta igual. Lo mismo pasó como preselección inicial del diálogo "Apply a weekly pattern" recién abierto. Nota: más adelante en la sesión, después de que mis propias pruebas cambiaron la mezcla de datos del sitio (quedó una mayoría clara de Almuerzo), el mismo mecanismo sí preseleccionó Almuerzo correctamente — o sea la función no está rota siempre, pero falló de forma reproducible (3/3) con los datos originales del sitio.
- **Evidencia**: capturas del popover del día 6 mostrando switch ON con Breakfast/Lunch/Snack/Supper los 4 destildados y el badge "6 service days this month" ya incrementado; texto de página confirmando "6 No meal" / "20 No meal" en cada repetición.
- **Alcance**: no se verificó en otros sitios (con datasets distintos podría no reproducirse igual). El riesgo real es que un admin apurado no note el "No meal" en rojo y guarde un día "de servicio" que en los hechos no sirve nada — hasta que lo note en el dashboard o en el conteo.

---

### [Medio] "Apply a weekly pattern" no explica por qué el botón queda deshabilitado cuando el rango de fechas está invertido

- **Dónde**: `/admin/calendar` → Bulk edit → "Apply a weekly pattern", rol admin
- **Pasos**:
  1. Abrir el diálogo, poner From = 10/15/2026 y dejar To = 09/30/2026 (From > To).
  2. Tildar cualquier comida para que sea el único campo inválido.
  3. Mirar el diálogo — no hay ningún mensaje de error visible cerca de los campos de fecha.
  4. Click en "Apply pattern": no pasa nada (correcto, no debería aplicar), pero tampoco aparece ningún texto explicando el motivo.
- **Esperado**: un mensaje como el que sí tiene el formulario de feriados en el mismo escenario ("It ends before it starts.").
- **Pasó**: el botón simplemente se ve deshabilitado (más claro/gris), sin ningún texto de ayuda. Comparar con "Add/Edit holiday", que en el mismo caso (From > To) sí muestra "It ends before it starts." en rojo bajo el campo "To".
- **Evidencia**: captura del diálogo "Apply a weekly pattern" con From 10/15/2026 y To 09/30/2026, sin mensaje de error visible; captura equivalente del diálogo de feriados mostrando el mensaje que sí aparece ahí.
- **Alcance**: solo probado en escritorio (~867px). Es un caso menor porque el usuario igual puede notar que puso las fechas al revés mirando los propios campos, pero no hay ninguna pista en pantalla.

---

### [Bajo] La pestaña "Holidays" ya no comparte selector de sitio ni navegación de mes con "Service days"

- **Dónde**: `/admin/holidays` vs `/admin/calendar`, rol admin
- **Pasos**: Ir a `/admin/calendar`, elegir Training Only y octubre 2026. Click en la pestaña "Holidays".
- **Esperado** (según el brief de esta ronda de testeo): que el cambio de pestaña mantenga sincronizados el selector de sitio y el mes.
- **Pasó**: `/admin/holidays` es una pantalla completamente distinta — lista plana con buscador, Upcoming/Past y paginación, **sin selector de sitio ni navegador de mes en absoluto**. No hay nada que "desincronizar" porque esos controles no existen ahí; los feriados se filtran solo por nombre/sitio vía texto libre. Puede ser un cambio de diseño intencional (un feriado normalmente no es "de un sitio a la vez"), pero contradice la premisa de que ambas pestañas comparten ese estado.
- **Evidencia**: captura de `/admin/holidays` mostrando el layout sin selector de sitio.
- **Alcance**: cosmético/de expectativas, no bloquea ningún flujo — el buscador cubre el caso de uso de encontrar feriados de un sitio puntual, solo que por texto en vez de por selector.

---

## Lo que sí funcionó bien (para que no se retestee de cero)

- Toggle individual de día (switch + 4 checkboxes de comida) actualiza en vivo el badge de "N service days this month" y el tinte de la celda, antes de guardar.
- Los 4 días bloqueados (Aug 4, 10, 17, 18) se ven correctamente con candado, deshabilitados — el click no hace nada, no abre popover, no cambia el badge.
- Guardar → recargar (`navigate` completo, no solo cliente) → los cambios persisten correctamente, confirmado varias veces.
- Guardia de cambios sin guardar: el diálogo propio de la app ("Leave the calendar without saving?") aparece al clickear un link interno con cambios pendientes; "Stay on this page" mantiene el estado sin guardar; "Leave anyway" navega (con un pequeño delay, ~1-2s, antes de completarse — no es instantáneo pero sí funciona). El navegador nativo ("Leave site?") también se dispara correctamente al intentar recargar o ir "atrás" con cambios sin guardar.
- Bulk edit → "Apply a weekly pattern": el rango de fechas, los días de la semana y las comidas se aplican correctamente; la opción "replace" (cerrar los días del rango que no matchean el patrón) funciona como se espera — se probó reemplazando un patrón martes/jueves por uno de lunes y los martes/jueves anteriores quedaron cerrados.
- Bulk edit → "Close a range of days" → "Several sites at once": el picker de sitios con buscador funciona bien, el conteo ("N sites selected" / "Close at N site(s)") es preciso, el diálogo de confirmación reafirma el número de sitios antes de escribir. El cierre se escribe de inmediato (no espera al botón Save general) y el toast con "Undo" restaura exactamente los días cerrados — confirmado con recarga completa después del undo.
- Feriados: detección de duplicados (mismo nombre + mismas fechas) devuelve 409 con mensaje claro sin crear una segunda fila. Editar y borrar feriados funciona correctamente, y borrar devuelve el calendario exactamente al estado previo (confirmado con recarga). El formulario acepta y muestra bien caracteres especiales (`é ñ ' " < > &`) y emoji en el nombre; un nombre de >120 caracteres es rechazado por el servidor con un mensaje legible ("Invalid input (name)"), sin 500. Un día con count real (Aug 4) queda completamente sin cambios cuando cae dentro de un rango de feriado.
- Teclado: Tab recorre nav superior → header → tabs de sección → selector de sitio → grilla de días en orden razonable; Escape cierra el popover de un día; Space/Enter togglea el switch "Service day" cuando está enfocado; Enter abre el menú "Bulk edit" cuando está enfocado.

## Monitoreo

`/admin/monitoring` al cierre: 20 problemas listados, todos ajenos a esta área (rate-limit
probes y "API contract test"/"sweep sanity check" de la ronda de chequeos de API, más un
`Minified React error #185` en `/counts/2026-08-18`). Búsqueda por "calendar" y "holiday" no
devolvió ningún resultado — cero errores nuevos originados en `/admin/calendar` o
`/admin/holidays` durante esta pasada.
