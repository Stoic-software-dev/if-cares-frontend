# Pasada adversarial — 3-sep-2026

> Contra el código de `v2-mock` (`bcd7f7d`), corriendo local contra la **misma base de
> Supabase que producción**. Mail apagado en local (`MAIL_FROM` vacío), así que ningún
> mensaje salió a nadie. ~120 requests de API, barridos responsive de 320 a 1440 px sobre
> 15 pantallas, y lectura de las 42 rutas de API y de los 39 módulos de `src/lib`.

## Estado de los arreglos (3-sep-2026)

**Los 23 hallazgos están cerrados.** Verificados contra la app corriendo, salvo donde se
indica. La tabla remite a la sección que describe cada uno.

| § | Hallazgo | Cómo quedó |
|---|---|---|
| 1 | Claim no reproducible | `GeneratedReport` guarda `excludeSites` y `title`; `rebuildReport` los usa. Un claim de 1 fila vuelve a bajarse como 1 fila (2.064 bytes donde antes daba 9.926), y el firmante ve el mismo documento |
| 1 | Desactivar un sitio lo borra del pasado | El claim incluye los sitios activos **más** los que cargaron un count ese mes (`claimSites`) |
| 2 | Comidas que ese día no se sirven | La regla vive en `mealsOrAll`/`mealsNotServed` (`lib/calendar.js`) y la leen la pantalla y la API. Reclamar breakfast en un día snk+sup → 422 |
| 3 | Estado de sitio como texto libre | `z.enum(['TX','OK'])` con normalización: `"tx"` se guarda `TX`; `"Texas"`, `"xx"` → 422. El `""` sigue siendo legal sólo al editar |
| 4 | Counts con fecha futura | 422 en el servidor, igual que en la pantalla |
| 5 | Feriado con año 0000 | El rango de años vive en `YMD_RE`; `0000-01-01` y `2026-02-31` → 422 en POST y en PATCH. Además `datesBetween` se expande una vez y no una por sitio |
| 6.1 | `?status` basura → 500 | 400 con mensaje |
| 6.2 | Fecha irreal en PATCH → 500 | 422 |
| 6.3 | Sin techo de tamaño | 1.000 filas y 400 KB de firma, en submit y en corrección |
| 6.4 | Login sin rate limit | 10 intentos por cuenta y 30 por IP cada 5 min; un login bueno perdona los previos |
| 6.5 | forgot-password sin límite | 5 cada 15 min, y **un solo token vivo** por cuenta. Sigue contestando 200 siempre |
| 6.6 | Auto-degradación de admin | Bloqueada, y el último admin activo no se puede degradar ni desactivar |
| 6.7 | Corregir no podía agregar una comida | El detalle devuelve `dayMeals`; las columnas son lo servido ∪ lo que el calendario abre |
| 6.8 | Borrador descartado en silencio | Se conservan las marcas cuyo alumno sigue, y el aviso dice cuántos nombres entraron o salieron |
| 6.9 | Mail a destinatarios arbitrarios | Máximo 10 destinatarios y 30 envíos por hora y usuario |
| 6.10 | Monitoring sin techo de filas | Tope global de 60 fingerprints nuevos por minuto; volver a ver uno conocido nunca se limita |
| 7 | `consolidated` a 320px | `grid-cols-1` como base. `scrollWidth` 310 = viewport |
| 7 | `users` a 320px | La paginación envuelve. Sin scroll horizontal |
| 7 | Target de "Back to dashboard" | 44px de alto sin mover el texto |
| 8 | timeOut ≤ timeIn | 422 |
| 8 | Número y edad negativos | Rechazados, con el mensaje correcto |
| 8 | `Invalid Date` como título | `dateLabel` devuelve `''` para una fecha que no lo es |
| 8 | Reset con link muerto | La pantalla pregunta antes de dibujar el formulario (`GET /api/auth/reset-password`) |
| 8 | `PATCH /api/monitoring` → 500 | 404 |

Un falso positivo del barrido, anotado para la próxima: los checkboxes de 20 px del
checklist de sitios van dentro de un `<label>` con padding, así que el target real es la
fila entera.

---

## Veredicto

El perímetro está sólido: **cero fugas entre sitios, cero bypass de rol, cero 500 por
cuerpo malformado, cero JWT falsificable, y la concurrencia del count aguanta**. Lo que
falla está adentro: **casi todas las reglas de negocio del meal count viven sólo en el
navegador**, y el claim consolidado no se puede reproducir.

**Si se arregla una sola cosa:** un claim firmado no es el claim que se generó. Ver §1.

---

## 1. CRÍTICO — El claim consolidado no se puede reproducir

`GeneratedReport` no guarda `excludeSites` ni `title`, y `rebuildReport()`
(`src/lib/report-rebuild.js:20`) fuerza `excludeSites: []`. La lista de exclusión se
destruye en el momento en que termina el job.

Toda lectura que no sea la copia de Drive reconstruye desde datos vivos y **sin las
exclusiones**: la descarga del admin cuando Drive no está o el archivo no está, el envío
por mail en modo `copy`, la vista pública `GET /api/sign/[token]?pdf=1`, y —lo peor— la
firma misma: `POST /api/sign/[token]` reconstruye y después **pisa `storageKey`** con ese
documento nuevo.

**Reproducción.** Claim TX de agosto 2026 excluyendo 40 de 41 sitios:

| | filas | att |
|---|---|---|
| como se generó (respuesta del job) | 1 | 289 |
| el mismo claim, vuelto a bajar | 41 | 2090 |

Los dos PDFs pesan 9926 bytes: el guardado ES el de 41 filas. El de 1 fila no existe en
ninguna parte que la app pueda leer.

**Consecuencia.** Quien firma ve y firma un documento con sitios que el administrador
excluyó a propósito, y la copia archivada queda reemplazada por ese documento. El claim
revisado no es recuperable.

**Dos corolarios del mismo mecanismo:**

- Un count corregido, anulado o agregado después cambia el claim ya firmado al releerlo.
- `consolidatedBySite` / `consolidatedByDay` filtran `active: true`: **desactivar un sitio
  lo borra retroactivamente de todos los claims pasados**. Training Only tiene 5 counts en
  agosto; desactivarlo hoy los saca del claim de agosto.

**Arreglo.** Guardar `excludeSites` y `title` en `GeneratedReport` y que `rebuildReport`
los use. Para el histórico, dejar de filtrar por `active` o guardar el conjunto de sitios
del claim.

---

## 2. ALTO — La API acepta comidas que ese día no se sirven

`POST /api/meal-counts` sólo rechaza el día cuando **todas** las comidas están cerradas
(`if (!openMeals)`). Nunca compara lo que la fila reclama contra los flags del `ServiceDay`.

**Reproducción.** Training Only, 2026-09-02, calendario `{brk:false, lunch:true, snk:false,
sup:false}`. Submit con las cuatro comidas en `true` para cada alumno:

```
serviceDay open meals: { brk: false, lunch: true, snk: false, sup: false }
totales que se van a reclamar: { att: 3, brk: 3, lun: 3, snk: 3, sup: 3 }
```

`addEntries()` en `report-data.js` suma todo flag en `true` sin mirar el calendario, así que
esos tres desayunos, tres snacks y tres cenas entran al reporte mensual y al consolidado.

La pantalla sí lo hace bien: `mealsOrAll()` muestra sólo la columna de lunch. **El único
guard es el navegador.**

---

## 3. ALTO — Vuelve el bug de los estados, por otra puerta

El checklist de sitios normaliza (`src/app/admin/reports/consolidated/page.jsx:78,86`):

```js
(row.state ?? '').trim().toUpperCase() === state
```

El backend hace match exacto sobre la columna: `where: { active: true, state }`.

Un sitio guardado como `'tx'` **aparece como TX en el checklist y no sale en el PDF**.
Medido con datos reales: checklist TX = 42 sitios, PDF TX = 41.

`state` es texto libre en las dos puntas. Aceptados sin quejarse: `"tx"` en **create**, y
en update `"Texas"`, `"xx"`, `"TX;DROP"` y `""`. El contador de "sitios sin estado" de la
pantalla sólo detecta el string vacío.

Es el mismo fallo que se cerró el 1-sep. Entonces la causa fue que el front parseaba el
nombre; ahora los dos leen la columna, pero uno normaliza y el otro no.

**Arreglo.** `z.enum(['TX','OK'])` en create y update, y normalizar a mayúsculas al escribir.

---

## 4. ALTO — La API acepta counts con fecha futura

Hoy 2026-09-03, submit para 2026-10-26 → `200 success`. La pantalla lo bloquea
("This day has not happened yet"); el servidor no tiene la comprobación.

Un meal count es una declaración tomada en el punto de servicio. Así se puede reclamar
reembolso por comidas que todavía no se sirvieron, para todo el año generado del calendario.

---

## 5. ALTO — Un feriado mal tipeado tumba el dashboard de todos

`PATCH /api/holidays/[id]` aceptó `startDate: "0000-01-01"`. `/api/meal-counts/all` hace
`datesBetween(holiday.startDate, holiday.endDate)` **por cada sitio y cada feriado**, y
materializa el array completo.

| dashboard admin | antes | con ese feriado |
|---|---|---|
| tamaño | 110 KB | **21,6 MB** |
| tiempo | 3,4 s | **40,2 s** |

Con **un** feriado alcanzado a **un** sitio. Con `allSites: true` serían 56 veces eso.
Ya lo borré; la base quedó como estaba.

**Arreglo.** Rango de años válido en el schema, y acotar `datesBetween` al período pedido.

---

## 6. MEDIO

| # | Qué | Dónde |
|---|---|---|
| 6.1 | `GET /api/requests?status=BOGUS` → **500**. El query param entra crudo al filtro del enum de Prisma | `api/requests/route.js:57` |
| 6.2 | `PATCH /api/holidays/[id]` con `"2026-02-31"` o `"2026-13-01"` → **500**. `ymdToUtcDate` devuelve null y falta el null-check que POST sí tiene | `api/holidays/[id]/route.js:19` |
| 6.3 | Sin techo de tamaño en el count: **3 MB de firma + 3000 filas** aceptados en un sitio de 13 alumnos (6,6 s). `signature` no tiene `.max()`; la firma pública del claim sí (400 KB) | `validation.js:66` |
| 6.4 | Sin rate limit ni bloqueo en el login: 15 contraseñas mal en 11 s, todas contestadas, la correcta sigue andando. `/api/monitoring` sí tiene rate limit; el login no | `api/auth/login` |
| 6.5 | Sin rate limit en forgot-password: 5 tokens válidos y simultáneos para la misma cuenta | `api/auth/forgot-password` |
| 6.6 | Un admin **puede auto-degradarse** a USER y pierde admin en la llamada siguiente. Auto-desactivarse sí está bloqueado. No hay protección del último admin | `api/users/[id]/route.js:29` |
| 6.7 | Corregir un count **no puede agregar** un tipo de comida que nadie tenía marcado: las columnas se derivan de `entries.some(...)` | `meal-count/page.jsx:174` |
| 6.8 | El borrador se descarta **en silencio** si el roster cambió entre que se guardó y se volvió: se pierden las marcas sin aviso | `meal-count/page.jsx:229` |
| 6.9 | `/api/reports/email` deja a cualquier usuario autenticado mandar mail desde ifcares.org a destinatarios arbitrarios, con nota y adjunto | `api/reports/email` |
| 6.10 | `/api/monitoring` POST (público): el rate limit va por `x-forwarded-for`, que el cliente elige, y cada mensaje distinto crea una fila nueva → tabla sin techo | `api/monitoring/route.js:29` |

---

## 7. Responsive

Barrido a 320 / 375 / 768 / 1024 / 1440 px sobre 15 pantallas, midiendo `scrollWidth`
contra el viewport y el tamaño de los targets táctiles.

**Dos pantallas con scroll horizontal**, contra lo que promete el README:

- **`/admin/reports/consolidated` a 320 px**: `scrollWidth` 514 vs viewport 310 — la
  pantalla entra al 60%. Causa exacta: `grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]`
  (`page.jsx:226`) no define columna por debajo de `lg`, así que la columna implícita queda
  en `auto` y se estira al `max-content` (498 px). Es el **único** grid del repo con ese
  patrón. Arreglo: agregar `grid-cols-1`.
- **`/admin/users` a 320 px**: la fila de paginación mide 304 px desde x=16 y empuja la
  página a 320 sobre un viewport de 310.

Limpias en todos los anchos: dashboard, meal-count, counts/[date], menus, requests, login,
admin/sites, admin/calendar, admin/holidays, admin/reports, admin/settings.

Menor: el link "Back to dashboard" mide 136×20 px — por debajo del target táctil cómodo en
una app pensada para tablets.

---

## 8. BAJO

- `timeIn 23:00` con `timeOut 01:00` aceptado: el count dice que el servicio terminó antes
  de empezar, y así se imprime.
- Nombres de alumno inventados y `number` / `age` **negativos** aceptados en el count
  (`-5`, `-3`). El import de roster sí valida 0–120.
- `/counts/not-a-date` muestra `Invalid Date` como título de la pantalla.
- `/reset-password?token=basura` muestra el formulario completo; recién al enviar avisa que
  el link no sirve.
- `PATCH /api/monitoring` con un id inexistente → 500. Sólo alcanzable por el email de
  monitoreo.

---

## 9. Lo que aguantó

- **Autenticación y roles**: 21 endpoints sin sesión → 401 en los 21. 16 endpoints admin
  con sesión de staff → 403 en los 16.
- **JWT**: `alg=none`, payload cambiado a ADMIN, firma basura, cookie vacía → 401 en los cuatro.
- **Scoping por sitio**: roster, siteData, detail, pdf, monthly y email de otro sitio como
  staff → 403 en los seis.
- **Cuerpos malformados**: `null`, `[]`, basura y vacío contra 11 endpoints → 4xx siempre,
  **cero 500**.
- **Concurrencia**: 6 submits simultáneos del mismo site+date → 1 éxito y 5 conflictos
  limpios. El índice único parcial cumple.
- **Sesión**: desactivar un usuario mata su cookie viva al instante (401 en el request
  siguiente).
- **Superficies públicas**: 404, `/sign/` con token inválido y forgot-password no filtran
  nada ni distinguen cuentas existentes.
- **Drive**: `downloadMenu` está scopeado a la carpeta de menús; no hay IDOR.

---

## 10. Datos de prueba

Todo lo que creé quedó borrado: counts, feriado, sitio `ZZ QA Break Site`, usuario
descartable y 3 claims generados. Quedan 5 sitios `ZZ` y 6 usuarios `zz.` de pasadas
anteriores, ninguno mío.

**Dos filas que borré de más**, las dos artefactos anulados de pruebas previas en Training
Only, las dos con su auditoría intacta:

- `cmtljk99t…` — count del 2026-09-02, anulado hoy 13:09 con motivo *"ZZ recorrido de punta
  a punta, deshecho"*.
- `cmtkiops9…` — count del 2026-10-26, anulado el 2-sep con motivo *"ZZ medicion de tiempos,
  count de prueba"*.

Mi filtro de limpieza buscó por sitio y fecha en vez de por el id que yo había creado, y se
llevó las filas anuladas que compartían el día.
