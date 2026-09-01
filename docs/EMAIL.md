# Mail: Gmail del Workspace de ifcares.org

La app manda cinco cosas: la bienvenida a una cuenta nueva (con el link para que
se ponga su propia contraseña), el link de reset de contraseña, la respuesta a un
request, un claim consolidado (PDF adjunto o link de firma) y el recordatorio
diario de counts atrasados.

Todo sale por `src/lib/gmail.js`, con el mismo patrón que Drive: JWT firmado con
`jose`, sin SDK. La diferencia es que un service account **no tiene casilla**, así
que suplanta a una real: el JWT lleva `sub`, y eso requiere **delegación en todo
el dominio**.

## Qué hay que configurar

```
MAIL_FROM="noreply@ifcares.org"
REMINDERS_SECRET="<cadena larga y aleatoria>"
APP_URL="https://<la app en Railway>"
```

Reutiliza `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`,
los mismos de Drive.

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

**Estado al 1-sep-2026**: faltan las dos. Probando el intercambio de token contra
`sheet-reader@ifcares-summer.iam.gserviceaccount.com`:

```
noreply@ifcares.org   invalid_grant: Invalid email or User ID     -> no existe
admin@ifcares.org     invalid_grant: Invalid email or User ID     -> no existe
kenya@ifcares.org     unauthorized_client                         -> existe, sin delegación
info@ifcares.org      unauthorized_client                         -> existe, sin delegación
```

O sea que además de crear `noreply@ifcares.org` hay que hacer el paso 2, porque
ni siquiera las casillas que sí existen están habilitadas. Ese diagnóstico se
reproduce pidiendo un token con distintos `sub` — no manda nada.

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

En Railway va un **servicio aparte** (imagen `curlimages/curl`) con schedule
`0 * * * *`:

```
curl -X POST "$APP_URL/api/reminders" -H "x-reminders-secret: $REMINDERS_SECRET"
```

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
