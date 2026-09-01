# Drive: el almacenamiento de todos los PDFs

Todo PDF de este producto vive en Google Drive, por un único camino:
`src/lib/google-drive.js`. No hay un segundo backend de archivos, ni bytes de
PDF en Postgres, ni dependencia del Apps Script.

Son dos flujos sobre el mismo módulo:

| Flujo | Dirección | Carpeta |
|---|---|---|
| Menús que publica la oficina | lectura, y escritura desde que se publican con el botón de la app | `GOOGLE_DRIVE_MENUS_FOLDER_ID` |
| PDFs que genera la app (counts diarios hoy; reportes mensuales y consolidados cuando salgan) | escritura | `GOOGLE_DRIVE_REPORTS_FOLDER_ID` |

## Por qué se fue el Apps Script

| | Antes (Apps Script) | Ahora (Drive API) |
|---|---|---|
| Listar menús | 3 a 26 s, 502 intermitentes | ~300 ms, cacheado 10 min |
| Descargar | JSON con el PDF en base64, decodificado en el cliente | El archivo streameado con su content type |
| Ver un menú | fetch, decodificar, crear Blob, abrir tab | Link directo, lo abre el visor del navegador |
| Archivar lo generado | No existía | Automático, en la carpeta que la oficina ya mira |

`src/lib/google-drive.js` firma un JWT con `jose` (ya era dependencia, no hace
falta el SDK de Google), lo canjea por un access token y lo reusa mientras vive.

## Cómo se guarda lo que genera la app

`src/lib/pdf-archive.js` es el único punto de entrada de escritura:

```
<carpeta de reportes>/<YYYY-MM>/<nombre>.pdf
```

Reglas que valen para todos los PDFs, presentes y futuros:

- **Una copia por documento.** Si ya hay un archivo con ese nombre en la carpeta
  del período, se actualiza en su lugar. Drive guarda el historial de versiones,
  así que no se pierde nada y la carpeta no se llena de duplicados.
- **No se re-sube lo que no cambió.** Un count sin correcciones nuevas no
  vuelve a subirse cada vez que alguien lo descarga.
- **Archivar nunca bloquea al usuario.** La subida corre al costado de la
  respuesta. Si Drive está caído o sin configurar, el PDF igual se entrega y el
  archivado se reintenta en la próxima descarga.
- **Los nombres se sanitizan**: las barras se reemplazan, porque varios clientes
  de Drive las muestran como separador de ruta y los nombres de sitio las tienen.

Cuando salgan los reportes mensuales y consolidados (Etapa 5), usan
`archivePdf({ name, bytes, period })` y guardan el id de Drive que devuelve en
`GeneratedReport.storageKey`. No hay que inventar otro almacenamiento.

## Qué hay que configurar

```
GOOGLE_SERVICE_ACCOUNT_EMAIL="algo@algo.iam.gserviceaccount.com"
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_MENUS_FOLDER_ID="1wagBWXeOi_8U5N7zvqUGhdv6AjH1yyki"
GOOGLE_DRIVE_REPORTS_FOLDER_ID="1m5PsksV1W_7barLhBuNwTuGNiAgd0mZ_"
```

Los dos IDs de carpeta ya están puestos: salieron del backup del Apps Script
(`gas-backup/api/doGet.gs` para menús, `gas-backup/report/generateReports.gs`
para reportes), así que son las mismas carpetas que la oficina usa hoy.

Los saltos de línea de la clave pueden ir escapados como `\n`, que es como
vienen en el JSON del service account; el código acepta las dos formas.

### En Railway

Los mismos nombres, sin prefijo, en Variables del servicio. Lo único que tiene
truco es la clave privada: va en **una sola línea**, con los `\n` literales tal
como viene en el JSON, no con saltos de línea reales. El módulo acepta las dos
formas y además saca las comillas si quedaron pegadas, que es el error más común
al copiar del JSON.

## Pasos para crear el service account

1. En Google Cloud Console, proyecto de IF Cares, **APIs y servicios →
   Biblioteca**: habilitar **Google Drive API**.
2. **IAM y administración → Cuentas de servicio → Crear**. Nombre sugerido:
   `ifcares-regular-year`. No necesita ningún rol de IAM: el permiso sale de
   compartirle las carpetas, no del proyecto.
3. En la cuenta creada, **Claves → Agregar clave → Crear clave nueva → JSON**.
4. Del JSON, copiar `client_email` a `GOOGLE_SERVICE_ACCOUNT_EMAIL` y
   `private_key` a `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
5. En Drive, compartir las dos carpetas con ese `client_email`:
   - carpeta de **menús**: lectura para listarlos, escritura desde que se
     publica un menú con **Menus → Publish menu**.
   - carpeta de **reportes**: escritura, ahí archiva los PDFs.

### Las dos carpetas TIENEN que estar en una unidad compartida

Compartirlas como Editor **no alcanza y nunca alcanzó**. Un service account no
tiene almacenamiento propio, así que no puede crear un archivo que quedaría a su
nombre — que es todo archivo en una carpeta de "Mi unidad", la comparta quien la
comparta. Drive igual contesta `canAddChildren: true` (el permiso ACL sí está);
la cuota pega después, con:

```
403 storageQuotaExceeded
"Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation instead."
```

**Estado al 1-sep-2026**: las tres carpetas (`Menu` `1wagBW...`, `Consolidated
Reports` `1m5Psk...`, y la `IfCares` que las contiene) están en Mi unidad. O sea
que **ningún PDF generado se archivó nunca** — el síntoma del `[pdf-archive]` en
el log de más abajo es esto, no un permiso.

**El arreglo**: crear una **unidad compartida**, mover `Menu` y `Consolidated
Reports` adentro, y agregar al service account como **Administrador de
contenido**. Los archivos de una unidad compartida pertenecen a la unidad y no a
quien los escribe, así que la cuota deja de aplicar. No requiere cambios de
código. La alternativa es darle a Drive la misma delegación de dominio que a
Gmail y suplantar a una persona real, pero eso ata el archivo de la organización
a la cuenta de alguien.

## Verificación

```
npm run drive:selftest   # el cliente contra un fetch simulado, sin tocar Drive
npm run smoke            # el listado y la descarga real de un menú
```

`drive:selftest` genera una clave RSA descartable y verifica lo que el módulo
*enviaría*: el scope del listado, el rechazo de archivos fuera de la carpeta, el
escapado de apóstrofes, la creación de la carpeta del período, el armado del
multipart y que un archivo existente se actualice en vez de duplicarse. Es lo
que permite confiar en el camino de escritura antes de que existan credenciales.

Con las credenciales cargadas, la app no vuelve a llamar al Apps Script. Sin
ellas, cae al GAS viejo para menús y se saltea el archivado, así que se puede
configurar sin downtime.

## Si algo falla

`npm run drive:doctor` usa las credenciales reales del `.env` y muestra lo que
Google contesta de verdad: a qué cuenta pertenece el token, si la carpeta existe,
si se puede escribir en la de reportes (`canAddChildren`) y qué hay compartido
con la cuenta. Nunca imprime la clave privada. Para correrlo contra el entorno de
Railway: `railway run node scripts/drive-doctor.mjs`.

Los tres errores que se ven en la práctica:

| Síntoma | Causa |
|---|---|
| "The Drive API is not enabled in the Google Cloud project" | Falta habilitar **Google Drive API** en el proyecto del service account. Es el paso 1 y es fácil de saltear cuando la cuenta se creó para otra API |
| "cannot reach that folder" | La carpeta no está compartida con el `client_email`, o se compartió otra |
| Los menús cargan pero no se archiva ningún PDF | La carpeta de menús está compartida como Lector, pero la de reportes necesita **Editor**. El archivado no rompe nada de cara al usuario: solo deja un `[pdf-archive]` en el log |

## Seguridad

- La ruta de descarga exige sesión (`requireUser`) y verifica que el archivo
  pedido sea hijo de la carpeta que corresponde. Sin esa verificación el
  endpoint sería un proxy abierto a cualquier archivo que el service account
  pueda ver.
- El alcance real lo definen las carpetas compartidas, no el scope OAuth: la
  cuenta no ve nada más del Drive de la organización.
- La clave privada nunca sale del servidor: no hay ninguna variable
  `NEXT_PUBLIC_` involucrada.

## Si se reusa el service account de la Summer

Funciona, pero `GOOGLE_DRIVE_MENUS_FOLDER_ID` pasa a ser obligatorio: sin ese ID
el listado devolvería todo lo compartido con la cuenta, incluidos los menús de
la Summer. Ya está seteado, así que el riesgo está cubierto, pero conviene
tenerlo presente si alguien lo vacía. Con cuentas separadas cada app rota su
clave sin afectar a la otra.
