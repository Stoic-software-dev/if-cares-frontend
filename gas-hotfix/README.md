# Hotfix GAS — incidente 12-ago-2026 (login lento / roster no guarda / logouts / fechas)

Archivos listos para **pegar en el editor de Apps Script** del proyecto "Master"
(https://script.google.com/u/0/home/projects/1X-7_0r-VITEj7vABSWkPOe6in7MOksaC7yvSG3bmlxokIGrf-HUAwenD/edit).

## Qué corrige cada archivo

### `api/doPost.gs` (reemplaza el archivo `api/doPost` completo)
1. **Lock global en add/edit/delete de roster.** Antes, dos operaciones simultáneas
   (cualquier par de sitios) leían el tab Students completo, lo limpiaban y lo
   reescribían — la que terminaba última pisaba a la otra. Es la causa de
   "roster updates not saving". Ahora se serializan; si el sistema está ocupado
   devuelve un error claro y el usuario reintenta.
2. **Escrituras en lote.** Los loops de `getValue()`/`setFormula()` fila por fila
   (hasta ~300 llamadas por operación de roster, ~30-60 s) se reemplazaron por
   1-3 `setValues()`. Con esto cada operación tarda ~2-3 s y deja de acumular
   ejecuciones simultáneas (cuota GAS = 30), que era lo que encolaba los logins.
3. **`handleMealCount` reordenado:**
   - valida "meal count already sent" ANTES de mutar la master (antes borraba
     la fila de All Meals y agregaba a Sent Meals incluso en duplicados);
   - calcula la fecha al inicio (antes, con All Meals vacío —p.ej. durante un
     rebuild— se agregaba `undefined` a Sent Meals y eso **rompía getAllMeals
     para todos los sitios**: calendarios en blanco app-wide);
   - checkboxes/horarios en lote: de ~250 `setValue()` a ~12 `setValues()` por envío;
   - mutaciones de la master bajo el mismo lock (sección crítica corta).
4. Guards para tabs vacíos (Dates/PastMeals/Students con solo header ya no tiran 500).

### `updateSites.gs` (reemplaza el archivo completo)
- `checkAndUpdate` (trigger) ahora toma el mismo lock antes de correr
  `updateMaster`, así un rebuild no puede pisar una edición de roster en curso.
  Si hay algo corriendo, saltea el ciclo (el próximo trigger lo retoma).

## Pasos de deploy (≈15 min)

1. Abrir el editor de Apps Script → pegar el contenido de `api/doPost.gs` sobre
   `api/doPost.gs` y el de `updateSites.gs` sobre `updateSites.gs`. Guardar.
2. **Redeploy**: Deploy → Manage deployments → editar el deployment activo →
   New version → Deploy. ⚠️ El deployment pertenece a otra cuenta ("Other user",
   probablemente la de Juan/ifcares) — con miqueas@stoicsoftware.io el diálogo dio
   error. Si no se puede editar: entrar con la cuenta owner, o crear un deployment
   nuevo y actualizar `API_BASE_URL` en `src/constants/index.js` + redeploy de Railway.
3. **Triggers** (pestaña Triggers, con la cuenta owner):
   - Borrar el trigger **duplicado** de `sendReminderEmail` (hay 2 activos: corre
     dos veces por día, 8:28 y 8:30 → mails dobles a los sitios).
   - Borrar los 3 triggers *Disabled* (basura).
   - Cambiar `checkAndUpdate` de **cada 5 min → cada 1 hora**.
4. Smoke test: login en la app, agregar/borrar un alumno de prueba en
   "Training Only", enviar un meal count de prueba, verificar el calendario.

## Operacional urgente (sin esto el calendario muere HOY)

- **Los días de servicio cargados terminan el 12-ago-2026.** 45 sitios tienen
  exactamente 1 día futuro (hoy) y los 7 de Drexel + Lake Highlands ya no tienen
  ninguno. Desde el 13-ago **ningún sitio podrá seleccionar fecha**.
  → Pedir YA a Kenya las ventanas del año 2026/27 y el patrón semanal de comidas
  por sitio, y cargar PastMeals de cada sitio (wizard de onboarding existente o
  seeding por script).
- **Limpiar el folder Sites en Drive**: mover fuera del folder las hojas
  "Copy of 2024/2025 COD JAYCEE...", "Copy of 2025/2026 TX BGC COOKE - ...",
  "Copy of Drexel Academy 2nd Grade" (updateMaster convierte en "sitio" cualquier
  sheet del folder). Después correr Menu → Update Master Sheet una vez.
- **Duplicados de sitios reales** (viejo año vs nuevo): p.ej. "BGC Cooke" y
  "2025/2026 TX BGC COOKE", "COD Churchill Rec Center" y "2025/2026 TX COD
  CHURCHILL REC CENTER", "2024/2025 COD JAYCEE Z REC CENTER" y "2025/2026 TX COD
  JAYCEE ZARAGOZA REC CENTER", etc. Confirmar con Kenya cuál usa cada sitio este
  año y archivar (mover del folder) las hojas viejas.

## Qué NO toca este hotfix

- Passwords en texto plano, endpoints sin auth, GETs que editan datos
  (addDateMeal/updateDateMeal/deleteDateMeal): se resuelven con el cutover v2
  (Postgres, branch `v2-backend`), que este incidente justifica acelerar.
