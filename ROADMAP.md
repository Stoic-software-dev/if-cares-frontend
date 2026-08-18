# IF Cares Regular Year 2.0 — Ruta de trabajo

> Orden de ejecución sobre las cards STOIC-2196..2207. Detalle técnico en **SPECS.md**.
> Estrategia: la app vieja (GAS + Sheets) opera en prod hasta un **único cutover al final**.
> Sin dual-write. Actualizado: 2026-08-18.

## Etapa 0 — Ya hecho (branch `v2-backend`, jul-2026)

- [x] Schema Prisma completo + 2 migraciones versionadas (grueso de STOIC-2196).
- [x] Auth custom con shape legacy, bcrypt, cookie deslizante 8 h (grueso de STOIC-2197).
- [x] 18 rutas API con paridad legacy + mapeo de los 14 call sites (`docs/V2-BACKEND.md`).
- [x] Pipeline idempotente: `db:import`, `import-master` (users con sus passwords),
      `import-history` + export GAS, `db:parity` todo PASS (grueso de STOIC-2198).
- [x] Data real importada: 2.922 alumnos, 56 sitios, 566 service days.
- [x] Stack UI decidido: Tailwind + shadcn/ui, solo librerías headless (STOIC-2202).

## Etapa 1 — Desbloqueos inmediatos (en paralelo, esta semana)

- [ ] **Pushear `v2-backend`** (4 commits solo locales — riesgo de pérdida).
- [ ] **Crear proyecto Supabase** (runbook `docs/SUPABASE-SETUP.md`, ~15 min) →
      `migrate deploy`, seed, import completo. **Configurar backups ese mismo día.**
- [ ] Pegar `gas-backup/migration-export.gs` en Apps Script + `MIGRATION_EXPORT_KEY`
      + redeploy → correr `import-history` con data real de punta a punta.
- [ ] STOIC-2202: cerrar tokens + componentes base y **aprobación de las 5 pantallas
      clave con IF Cares** (dependencia externa más riesgosa — perseguirla).
- [ ] Decidir proveedor de **email** y **storage** de archivos (bloquean 2197/2199/2203/2204/2205).
- [ ] Mandar a IF Cares el listado de anomalías (19 alumnos, "ZZ ", emails duplicados,
      hojas "Copy of…") para que decidan caso por caso (cierre de STOIC-2196).
- [ ] Actualizar el timeline con el cliente: el artifact aún dice cutover en agosto;
      las cards lo ponen al final. Acordar fecha tentativa de corte.

## Etapa 2 — Cerrar la base (STOIC-2196 / 2197 / 2198)

- [ ] Deltas de schema pendientes: correcciones versionadas, firmas (storage),
      reportes generados, config de notificaciones, horarios por meal type.
- [ ] STOIC-2197 restante: reset de password self-service **por email**, expiración
      de sesión por inactividad configurable, bloqueo de usuarios desactivados.
- [ ] STOIC-2198 restante: reporte de reconciliación formal (sitio × mes, Sheets vs
      base) + refresco programado de la copia para desarrollo.

## Etapa 3 — Camino crítico de UI (STOIC-2199)

- [ ] Meal count diario contra la base: roster por sitio/fecha, asistencia + meal types,
      horarios, firma + certificación, bloqueo post-submit y en días no operativos.
      Lógica **idéntica** al flujo actual; construcción con componentes de 2202.
- [ ] Dashboard mensual: mes × sitio en una pantalla, 3 estados por color,
      click → count o formulario.
- [ ] Mantener descargas de menú (vía proxy GAS por ahora; destino final en Etapa 6).
- [ ] Verificar ≤ 1 s en carga y submit.
- Sugerencia: partir la card en dos entregables (carga diaria / dashboard).

## Etapa 4 — Admin (STOIC-2200 / 2201)

- [ ] Usuarios: alta/edición/desactivación, roles, multi-sitio, reset, búsqueda + filtros.
- [ ] Sitios: alta con formulario único (comidas, días de semana, fechas de programa),
      edición, desactivación; importación de roster con validación fila a fila.
- [ ] Calendarios: días operativos/no operativos por sitio, comidas por día,
      feriado en todos los sitios en una acción (y quitar en uno solo).
- [ ] Correcciones de counts: solo Admin, valor original intacto, quién/cuándo/antes,
      marca visible de "corregido"; reportes toman el valor corregido.

## Etapa 5 — PDFs y consolidación (STOIC-2203 / 2204)

*(Puede solaparse con Etapa 4 si se suma otra persona; si no, va después.
2204 requiere las correcciones de 2201.)*

- [ ] Spike motor de PDF → réplica campo por campo del formulario en papel.
- [ ] PDF de count diario + PDF mensual por sitio (sin timeouts con roster completo).
- [ ] Envío por email desde la app.
- [ ] Consolidados por mes × estado (TX/OK): los 2 reportes actuales, mismos totales,
      **sin tope de sitios**, paso de firma incluido, guardados y recuperables.

## Etapa 6 — Requests y notificaciones (STOIC-2205)

- [ ] Inbox de requests con estados New / In Progress / Resolved + filtros combinados;
      mails a los destinatarios actuales.
- [ ] Reminders diarios de counts atrasados: mismo contenido/horario que hoy;
      destinatarios, horario y on/off configurables desde Admin (sin deploy). Cron en la infra nueva.
- [ ] Resolver el destino de los **menús** (Drive API desde el backend o migración a
      Storage) para no depender del GAS después del corte.

## Etapa 7 — Testing con staff real (STOIC-2206)

- [ ] Staging público con copia fresca de data real.
- [ ] Guion de prueba completo (login, count completo, día no operativo, corrección,
      PDFs, consolidación, alta de sitio) con staff y admins reales en **sus** dispositivos.
- [ ] Medir tiempos reales (incl. conexiones lentas); corregir bloqueantes y alto impacto.

## Etapa 8 — Cutover (STOIC-2207)

- [ ] Plan de corte acordado con IF Cares: fecha/hora (fin de semana o día no operativo),
      counts en vuelo, comunicación a los sitios, **rollback por escrito**.
- [ ] Ejecutar: bloquear escrituras en la app vieja, Sheets a solo lectura, apagar
      triggers (`updateAllMeals`, `sendReminderEmail`, `deleteOldDates`, `checkAndUpdate`),
      migración final, reconciliación validada por IF Cares, switch de usuarios.
- [ ] Post: smoke en prod (login legacy, count, dashboard, PDFs, consolidación,
      notificaciones), probar una restauración de backup, soporte activo el primer
      día de servicio, guía corta de administración para IF Cares.

## Dependencias externas (disparar temprano, todas tienen latencia)

- Aprobación de pantallas clave (2202) — bloquea todo el desarrollo de UI.
- Decisiones sobre anomalías de data (2196).
- Formato campo por campo del PDF en papel (2203).
- Grupo de staff para testing (2206) y fecha de corte (2207).
