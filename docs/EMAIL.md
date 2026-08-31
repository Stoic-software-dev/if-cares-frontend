# Mail: Gmail del Workspace de ifcares.org

La app manda cuatro cosas: el link de reset de contraseña, la respuesta a un
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

Si el token falla con `unauthorized_client`, falta el paso 2. El módulo detecta
ese caso y lo dice con esas palabras en vez de devolver un error genérico.

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

`/admin/reminders` controla on/off, horario, cuántos días atrás mirar y las copias
fijas. Nada de eso requiere deploy.

- Cada persona recibe **solo sus sitios**.
- Un día feriado nunca cuenta como atrasado.
- Un count anulado deja el día como atrasado otra vez, que es lo correcto.
- **Preview** corre exactamente la misma búsqueda que el envío y muestra a cuánta
  gente se le escribiría, sin mandar nada.

El horario lo hace cumplir el scheduler de la infraestructura, no la app. En
Railway se configura un cron que haga:

```
curl -X POST "$APP_URL/api/reminders" -H "x-reminders-secret: $REMINDERS_SECRET"
```

## Límites

Workspace permite 2.000 mensajes por día por casilla. El recordatorio manda un
mail por persona y por sitio atrasado, así que un día con todo atrasado multiplica.
Con la escala actual queda lejos del techo, pero es la métrica a mirar si alguna
vez se corta el envío.

## Verificación

`npm run smoke` cubre que la configuración de reminders se lea, que diga si el
mail está listo, y que el disparador del scheduler se niegue sin su secreto.
