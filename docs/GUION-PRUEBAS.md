# Guion de pruebas con staff real (STOIC-2206)

Se prueba con gente de los sitios, en los celulares y tablets que usan todos los días.
No en el navegador de desarrollo, no en una máquina nuestra. Eso es la mitad del punto:
la app ya funciona en una laptop con fibra, lo que no sabemos es cómo se siente en una
tablet de seis años con el wifi del rec center.

Las consignas para el staff van **en inglés**, porque es el idioma en el que trabajan.
Todo lo demás es para quien corre la sesión.

---

## Qué hace falta antes de sentarse con alguien

- Una cuenta por persona, con su rol real. Nadie prueba con la cuenta de otro: el bug
  más común de permisos es "yo veo sitios que no son míos", y con cuentas prestadas no
  aparece nunca.
- El sitio asignado tiene que ser **el suyo**, con su roster de verdad.
- Un día de servicio abierto en el calendario del sitio, y un feriado cargado en ese
  mismo mes. Sin el feriado, el flujo 3 no se puede probar.
- Que cada uno traiga **su** dispositivo, con **su** conexión. Si el sitio tiene wifi
  malo, esa es la condición que interesa, no la excepción a evitar.

## Qué se anota de cada hallazgo

Pantalla, qué esperaba la persona, qué pasó, y si pudo seguir o quedó trabada.
Lo que queda trabado es bloqueante aunque haya una vuelta: la vuelta la sabe quien
programó, no quien carga el count a las 12:15 con cuarenta chicos esperando.

---

## Línea de base del servidor, medida el 2-sep

Contra producción, mediana de cinco corridas, desde una conexión buena. Sirve para
separar las dos mitades: si en la tablet una pantalla tarda cuatro segundos y acá el
servidor contestó en 300 ms, el problema está en el dispositivo o en la red, no en la app.

| Llamada | Mediana |
|---|---|
| Login | 628 ms |
| Dashboard mensual, 56 sitios | 562 ms |
| Roster del sitio | 270 ms |
| **Submit de un count** | **627 ms** |
| Leer un count cargado | 319 ms |
| PDF del count diario | 477 ms |
| PDF mensual del sitio | 384 ms |
| Inbox de requests | 273 ms |
| Cualquier pantalla (HTML) | 185 ms |

Ninguna pasa el segundo. El criterio de la card ("carga y submit en un segundo o menos
en condiciones normales") está cumplido **del lado del servidor**; lo que falta medir es
el dispositivo, y eso solo se mide con el dispositivo.

Cómo medir en la sesión, sin herramientas: cronómetro desde que la persona toca el botón
hasta que ve el resultado. Tres veces cada flujo, se anota la peor.

---

## Flujo 1 — Entrar

> **Sign in.** Open the app, sign in with your email and password. Then sign out and sign
> back in.

Qué se mira: que la contraseña se pueda escribir sin pelearse con el teclado del celular,
que el error de contraseña equivocada se entienda, y que **Forgot password** llegue al mail
y el link funcione en el mismo dispositivo.

Lo que suele aparecer acá: el autocompletado del navegador metiendo la cuenta vieja de las
Sheets, y el link del mail abriendo en un navegador distinto al que tenía la sesión.

## Flujo 2 — Cargar un count completo

> **File today's count.** Go to today's date, mark attendance for every student, tick the
> meals each one had, set time in and time out, sign, and submit.

Qué se mira: que se llegue al final con el roster entero sin perder lo marcado al scrollear,
que la firma se pueda hacer con el dedo, y **cuánto tarda el submit**.

Dos cosas para forzar a propósito:

- Cortar el wifi a mitad de carga y volver a ponerlo. Lo cargado tiene que seguir ahí.
- Intentar cargar el mismo día dos veces. La app tiene que decir que ya está cargado, no
  aceptar dos counts del mismo día.

## Flujo 3 — Día no operativo

> **A day with no service.** Open a holiday on the calendar and try to file a count for it.

Qué se mira: que la app explique **por qué** no se puede, con el nombre del feriado, y no
un error genérico. Si el feriado cierra solo algunas comidas, las otras tienen que seguir
abiertas.

## Flujo 4 — Un admin corrige un count ya enviado

Con un administrador, sobre un count que un sitio cargó de verdad en el flujo 2.

> **Fix a count that was already submitted.** Open the count, change what is wrong, add a
> note saying why, and save.

Qué se mira: que quede registrado quién corrigió, cuándo y qué cambió; que el día siga
apareciendo como enviado en el calendario, con su marca de corregido; y que el sitio pueda
ver la corrección.

Verificado el 2-sep contra producción: una corrección mueve los totales del claim
consolidado. En la sesión hay que confirmar que **la persona lo entiende sin que se lo
expliquen**, que es otra cosa.

## Flujo 5 — PDFs y envío

> **Get the paperwork.** Download the PDF of a day's count. Then download the month for
> your site. Then email one of them.

Qué se mira: que el PDF se abra en el dispositivo (no todas las tablets abren PDF inline,
por eso hay link además de preview), que se pueda mandar por mail, y que el archivo diga
lo que la persona esperaba ver.

## Flujo 6 — Consolidación mensual

Con un administrador.

> **Build the monthly claim.** Pick a month and a state, exclude any site that should not
> be in it, build the claim, and send it for signature.

Qué se mira: que la pantalla muestre en qué paso va y no parezca colgada (el trabajo tarda
segundos, no milisegundos: 34 sitios de TX en 3,4 s medido), que el claim quede guardado y
se pueda bajar después, y que el **link de firma** funcione en el dispositivo de quien firma,
que normalmente no es el mismo que lo generó.

## Flujo 7 — Alta de un sitio nuevo

Con un administrador.

> **Add a new site.** Create a site, set its state, add its calendar for the month, and
> import its student roster from a file.

Qué se mira: que el import acepte el archivo tal como lo tienen (CSV o TSV, columnas en
cualquier orden, fechas US o ISO), que el **preview** muestre qué va a entrar antes de
confirmar, y que las filas con problemas se expliquen fila por fila en vez de fallar entero.

---

## Cierre de la sesión

1. Todo hallazgo bloqueante se corrige dentro de esta card, no después.
2. Lo que no se corrige se lista con prioridad y queda escrito acá abajo, no en la memoria
   de nadie.
3. Los tiempos medidos en dispositivo van a la tabla de arriba, en una columna aparte de la
   línea de base del servidor.

### Hallazgos

_(se completa durante las sesiones)_

| # | Flujo | Dispositivo | Qué pasó | Prioridad | Estado |
|---|---|---|---|---|---|
| | | | | | |
