# Mail: Gmail del Workspace de stoicsoftware.io

La app manda seis cosas: la bienvenida a una cuenta nueva (con el link para que
se ponga su propia contraseña), el link de reset de contraseña, el aviso de que
entró un request nuevo, la respuesta a un request, un claim consolidado (PDF
adjunto o link de firma) y el recordatorio diario de counts atrasados.

> **Salió por stoicsoftware.io, no por ifcares.org.** El plan original era el
> Workspace del cliente, pero la delegación en ifcares.org nunca se otorgó y
> stoicsoftware.io ya la tenía. Si algún día se mueve, lo único que cambia son las
> dos variables de abajo y el paso 2.

Todo sale por `src/lib/gmail.js`, con el mismo patrón que Drive: JWT firmado con
`jose`, sin SDK. La diferencia es que un service account **no tiene casilla**, así
que suplanta a una real: el JWT lleva `sub`, y eso requiere **delegación en todo
el dominio**.

## Qué hay que configurar

```
MAIL_FROM="IF Cares <noreply@stoicsoftware.io>"   # lo que ve quien recibe
MAIL_AS="<casilla real que se suplanta>"          # a quién suplanta el service account
MAIL_REDIRECT_TO="..."                            # desvío pre-lanzamiento, ver abajo
REMINDERS_SECRET="<cadena larga y aleatoria>"
APP_URL="https://<la app en Railway>"
```

## `MAIL_REDIRECT_TO`: nada llega a nadie real hasta el corte

Con esa variable cargada, **todo** mail que la app manda va a esas direcciones en
vez de a quien nombra, con el asunto prefijado `[redirected]` y un cartel arriba
que dice a quién le hubiera llegado. Se apaga borrando la variable, y ese es un
paso del runbook del corte.

Existe porque la base **ya tiene gente real**: Kenya, Marisela, el staff de los
sitios. Los destinatarios de una aprobación, de la respuesta a un request o de un
recordatorio **no salen de un setting** que uno pueda apuntar a un lugar seguro:
salen de las filas de usuarios. Desviar feature por feature cubre solo la que uno
se acordó — que es exactamente como el 3-sep les llegó a Kenya y a Marisela el
aviso de un request de prueba.

Por eso el desvío vive en `sendMail()`, que es el único lugar por donde pasan
todos, y no se puede saltear desde ninguna ruta. La pantalla de **Reminder
emails** lo muestra en un cartel mientras esté activo, para que nadie encienda
los recordatorios el día del corte y se pregunte por qué no llegó ninguno.

Reutiliza `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
los mismos de Drive.

**Por qué son dos variables y no una.** Un alias es un remitente perfectamente
válido pero **no se puede suplantar**: pedir un token con `sub` en un alias
devuelve "Invalid email or User ID". Así que `MAIL_FROM` es lo que se ve y
`MAIL_AS` es la casilla real detrás. Sin `MAIL_AS`, se asume que el From es una
casilla real y se usa para las dos cosas.

Y un detalle que cuesta una tarde: **Gmail reescribe el header From** si el alias
no está registrado como dirección *send-as* de esa casilla. El mail sale, pero
llega con el nombre de la persona en vez del alias. Se registra en Gmail →
Configuración → Cuentas → "Enviar como".

Con `MAIL_FROM` vacío la app **no manda nada y no rompe**: las pantallas avisan y
todo lo demás funciona igual. Es el mismo criterio que se usó con Drive.

## Pasos, en orden

1. **Google Cloud**, en el proyecto del service account: habilitar **Gmail API**.
2. **admin.google.com** → Seguridad → Control de APIs → **Delegación en todo el
   dominio** → Agregar. Va el **Client ID** del service account (el número largo
   del JSON, no el email) y el scope:
   `https://www.googleapis.com/auth/gmail.send`
   Hace falta ser super admin de ifcares.org.
3. Definir la casilla emisora y ponerla en `MAIL_FROM`. Conviene una dedicada
   (`noreply@ifcares.org`), no la cuenta personal de nadie: el día que esa persona
   se va, se cae el envío.

### Cómo leer el error de Google

Google contesta las dos fallas con jerga que manda a arreglar lo que no es. El
módulo las distingue y las traduce:

| Lo que dice Google | Qué significa | Qué falta |
|---|---|---|
| `invalid_grant: Invalid email or User ID` | La casilla de `MAIL_FROM` **no existe** en el Workspace | Crearla como usuario real y con licencia (paso 3) |
| `unauthorized_client: ...not authorized...` | La casilla existe, pero **este service account no tiene permiso** de mandar como ella | La delegación del paso 2 |

Ese diagnóstico se reproduce pidiendo un token con distintos `sub`, sin mandar
nada. Fue lo que mostró que en ifcares.org no había delegación para **ninguna**
casilla, ni siquiera para las que existen:

```
noreply@ifcares.org   invalid_grant: Invalid email or User ID     -> no existe
admin@ifcares.org     invalid_grant: Invalid email or User ID     -> no existe
kenya@ifcares.org     unauthorized_client                         -> existe, sin delegación
info@ifcares.org      unauthorized_client                         -> existe, sin delegación
```

**Estado al 2-sep-2026**: resuelto por stoicsoftware.io. `POST /api/mail/test`
contesta con lo que dice Google y manda a la casilla de quien lo pide, así que la
delegación se comprueba desde la app en vez de descubrirse el día que un
recordatorio no llegó.

## Seguridad

- El scope de Gmail **no viaja** en el token de Drive. La suplantación aplica a
  todo el token, así que mail pide el suyo, con su `sub` y su scope.
- **La delegación es amplia**: habilita mandar como *cualquier* usuario del
  dominio. Por eso conviene un service account propio del Regular Year y no el
  compartido con la Summer. Con cuentas separadas, rotar una no afecta a la otra
  y una clave filtrada no alcanza a las dos apps.
- El disparador de reminders (`POST /api/reminders`) no usa sesión, porque un cron
  no tiene ninguna. Usa `REMINDERS_SECRET` en el header `x-reminders-secret`. Sin
  el secreto configurado la ruta **se niega a correr**, en vez de quedar abierta.

## Los reminders

**Reminder emails** (en el menú de perfil, ruta `/admin/settings`) controla on/off,
horario, cuántos días atrás mirar y las copias fijas. Nada de eso requiere deploy.

- Cada persona recibe **solo sus sitios**.
- Un día feriado nunca cuenta como atrasado.
- Un count anulado deja el día como atrasado otra vez, que es lo correcto.
- **Preview** corre exactamente la misma búsqueda que el envío y muestra a cuánta
  gente se le escribiría, sin mandar nada.

El scheduler llama **cada hora** y la ruta decide: si la hora local en
`APP_TIMEZONE` no es la configurada, contesta `skipped: "not the hour"` y no manda
nada. Así el horario se cambia desde la pantalla y no desde la infraestructura, y
el cambio de horario de verano no corre el recordatorio una hora.

También se respeta la **ventana de recordatorio de cada sitio**: fuera de esas
fechas nadie de ese sitio recibe nada. Se edita en **Sites → abrir el sitio**, en
la misma sección que el ciclo del programa. Un sitio sin ventana entra siempre,
que es el default seguro: una fecha vacía es una forma demasiado silenciosa de
apagarle los avisos a un sitio al que tres días sin count le pausan la comida.

En Railway va un **servicio aparte** (imagen `curlimages/curl`) con schedule
`0 * * * *`:

```
curl -X POST "$APP_URL/api/reminders" -H "x-reminders-secret: $REMINDERS_SECRET"
```

Dos trampas de esa imagen: tiene `ENTRYPOINT ["curl"]`, así que el start command
se agrega como argumentos y termina siendo `curl curl ...`; y no hay shell, así
que `$APP_URL` no se expande. Van los valores literales.

**El servicio está creado pero todavía no ejecuta ningún tick.** Cómo se sabe sin
leer logs: cada llamada con el secreto correcto sella `AppSetting
reminders.lastPing`, **antes** de cualquier motivo por el que esa corrida no
mande nada, y la pantalla de recordatorios lo muestra. Un recordatorio que dejó de
salir se ve igual que uno sin nada que decir; el latido es la diferencia.

Para probar fuera de hora, `?force=1` saltea la comparación.

Cada sitio además trae del master su **ventana de recordatorio**
(`reminderStart` / `reminderEnd`): fuera de esa ventana no se le escribe a nadie
de ese sitio. Un sitio sin ventana cargada entra siempre — el legacy lo salteaba,
y una celda vacía en una planilla es una forma demasiado silenciosa de apagarle
los avisos a un sitio.

## Límites

Workspace permite 2.000 mensajes por día por casilla. El recordatorio manda un
mail por persona y por sitio atrasado, así que un día con todo atrasado multiplica.
Con la escala actual queda lejos del techo, pero es la métrica a mirar si alguna
vez se corta el envío.

## Verificación

`npm run smoke` cubre que la configuración de reminders se lea, que diga si el
mail está listo, y que el disparador del scheduler se niegue sin su secreto.
