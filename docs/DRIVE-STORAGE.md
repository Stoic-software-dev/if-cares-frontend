# Drive: el almacenamiento de todos los PDFs

Todo PDF de este producto vive en Google Drive, por un único camino:
`src/lib/google-drive.js`. No hay un segundo backend de archivos, ni bytes de
PDF en Postgres, ni dependencia del Apps Script.

Son dos flujos sobre el mismo módulo:

| Flujo | Dirección | Carpeta |
|---|---|---|
| Menús que publica la oficina | lectura | `GOOGLE_DRIVE_MENUS_FOLDER_ID` |
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
   - carpeta de **menús**: **Lector** alcanza, la app solo lee.
   - carpeta de **reportes**: **Editor**, porque ahí escribe.

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
