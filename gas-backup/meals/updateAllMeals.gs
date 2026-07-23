const UPDATE_ALL_MEALS_CONFIG = {
  // Reintentos por site (lectura individual)
  MAX_RETRIES_PER_SITE: 3,
  RETRY_DELAY_MS: 2000,                  // backoff lineal por intento

  // Reintentos sobre el master (operaciones críticas)
  MAX_RETRIES_MASTER: 5,
  BASE_DELAY_MASTER_MS: 1500,            // base del backoff exponencial
  MAX_DELAY_MASTER_MS: 30000,            // techo por intento

  // Lock para evitar concurrencia (trigger diario + retry agendado + manual)
  MASTER_LOCK_TIMEOUT_MS: 60000,         // 60s esperando el lock

  // Validación y alertas
  MIN_SUCCESS_RATIO: 0.9,                // si menos del 90% OK, no sobrescribe
  ALERT_EMAIL: 'miqueas@stoicsoftware.io',
  RETRY_TRIGGER_DELAY_MIN: 15,

  // Chunking del setValues final (evita 503 por request demasiado grande)
  SET_VALUES_CHUNK_ROWS: 2000,
};

// =====================================================================
// HELPERS DE RETRY
// =====================================================================

/**
 * Determina si un error de Apps Script / Sheets es retryable.
 * - Retryable: errores transitorios del backend (5xx, timeouts, "service failed").
 * - No retryable: permisos, doc no encontrado, argumentos inválidos.
 */
function isRetryableSpreadsheetError_(err) {
  if (!err) return false;
  const msg = (err && (err.message || err.toString())) || '';

  const nonRetryable = [
    /permission/i,
    /not found/i,
    /no se encontró/i,
    /no se encontro/i,
    /does not have permission/i,
    /requested entity was not found/i,
    /invalid argument/i,
    /authoriz/i,
  ];
  for (const p of nonRetryable) {
    if (p.test(msg)) return false;
  }

  const retryable = [
    /Service Spreadsheets failed/i,
    /Service unavailable/i,
    /currently unavailable/i,
    /internal error/i,
    /server error/i,
    /try again/i,
    /timed? ?out/i,
    /deadline/i,
    /rate limit/i,
    /quota.*short/i,
    /backend error/i,
    /unavailable/i,
    /\b50[0234]\b/,                      // 500, 502, 503, 504
  ];
  for (const p of retryable) {
    if (p.test(msg)) return true;
  }

  // Default: errores desconocidos los tratamos como retryables acotados
  // (más seguro que abortar la corrida diaria por ruido raro).
  return true;
}

/**
 * Wrapper genérico de reintentos con backoff exponencial + jitter
 * para operaciones críticas sobre el spreadsheet master.
 */
function runMasterOpWithRetry_(opName, fn) {
  let lastErr = null;
  const cfg = UPDATE_ALL_MEALS_CONFIG;

  for (let attempt = 1; attempt <= cfg.MAX_RETRIES_MASTER; attempt++) {
    try {
      const result = fn();
      if (attempt > 1) {
        console.log('[runMasterOpWithRetry_] "' + opName + '" OK en intento ' + attempt + '.');
      }
      return result;
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableSpreadsheetError_(err);
      console.warn(
        '[runMasterOpWithRetry_] "' + opName + '" falló intento ' + attempt + '/' +
        cfg.MAX_RETRIES_MASTER + '. Retryable=' + retryable +
        '. Error: ' + (err && err.message)
      );

      if (!retryable) throw err;
      if (attempt === cfg.MAX_RETRIES_MASTER) break;

      // Backoff exponencial con techo y jitter ±25%
      const exp = cfg.BASE_DELAY_MASTER_MS * Math.pow(2, attempt - 1);
      const capped = Math.min(exp, cfg.MAX_DELAY_MASTER_MS);
      const jitter = capped * (0.75 + Math.random() * 0.5);
      const delay = Math.floor(jitter);
      console.log('[runMasterOpWithRetry_] Reintentando "' + opName + '" en ' + delay + ' ms…');
      Utilities.sleep(delay);
    }
  }

  throw new Error(
    'Operación "' + opName + '" falló tras ' + cfg.MAX_RETRIES_MASTER +
    ' intentos. Último error: ' + (lastErr && lastErr.message)
  );
}

// =====================================================================
// FUNCIÓN PRINCIPAL
// =====================================================================

function updateAllMeals() {
  const cfg = UPDATE_ALL_MEALS_CONFIG;
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lockAcquired = lock.tryLock(cfg.MASTER_LOCK_TIMEOUT_MS);
    if (!lockAcquired) {
      throw new Error(
        'No se pudo adquirir el lock en ' + cfg.MASTER_LOCK_TIMEOUT_MS +
        ' ms. Probablemente otra ejecución de updateAllMeals está corriendo.'
      );
    }

    // -----------------------------------------------------------------
    // 1) Abrir master + leer la lista de Sites (con retry)
    // -----------------------------------------------------------------
    const masterSpreadsheet = runMasterOpWithRetry_('openMaster', () => {
      return SpreadsheetApp.getActiveSpreadsheet();
    });

    const sitesSheet = runMasterOpWithRetry_('getSitesSheet', () => {
      const sh = masterSpreadsheet.getSheetByName('Sites');
      if (!sh) throw new Error('No existe la hoja "Sites" en el master.');
      return sh;
    });

    const sitesData = runMasterOpWithRetry_('readSitesData', () => {
      const lastRow = sitesSheet.getLastRow();
      if (lastRow < 2) return [];
      return sitesSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    });

    const totalSites = sitesData.length;

    // -----------------------------------------------------------------
    // 2) Leer cada site con su propio retry (lógica original conservada)
    // -----------------------------------------------------------------
    const allData = [];
    const failedSites = [];

    for (let i = 0; i < sitesData.length; i++) {
      const siteName = sitesData[i][0];
      const spreadsheetId = sitesData[i][1];
      try {
        const siteRows = readSiteWithRetry(siteName, spreadsheetId);
        console.log(siteName + ' - OK (' + siteRows.length + ' rows)');
        siteRows.forEach(row => allData.push([siteName].concat(row)));
      } catch (error) {
        console.error('Failed site after retries: ' + siteName + ' - ' + error);
        failedSites.push({ siteName: siteName, error: String(error) });
      }
    }

    // -----------------------------------------------------------------
    // 3) Validar ratio de éxito antes de tocar el master
    // -----------------------------------------------------------------
    const successRatio = totalSites > 0
      ? (totalSites - failedSites.length) / totalSites
      : 0;

    if (successRatio < cfg.MIN_SUCCESS_RATIO) {
      const reason = 'ABORTADO: solo ' + (successRatio * 100).toFixed(1) +
        '% de sites exitosos (' + failedSites.length + '/' + totalSites +
        ' fallaron). "All Meals" NO se modificó.';
      console.error(reason);
      sendFailureAlert(reason, failedSites);
      scheduleRetry();
      return;
    }

    // -----------------------------------------------------------------
    // 4) Operaciones de escritura sobre el master (todas con retry)
    // -----------------------------------------------------------------
    const allMealsSheet = runMasterOpWithRetry_('getAllMealsSheet', () => {
      const sh = masterSpreadsheet.getSheetByName('All Meals');
      if (!sh) throw new Error('No existe la hoja "All Meals" en el master.');
      return sh;
    });

    // 4.a) Limpiar contenido previo (preservando headers en fila 1)
    runMasterOpWithRetry_('clearAllMeals', () => {
      const allMealsLastRow = allMealsSheet.getLastRow();
      if (allMealsLastRow > 1) {
        allMealsSheet
          .getRange(2, 1, allMealsLastRow - 1, allMealsSheet.getLastColumn())
          .clearContent();
      }
      // Forzamos commit del clear antes de empezar a escribir
      SpreadsheetApp.flush();
      return true;
    });

    // 4.b) Escribir en chunks (evita 503 por request demasiado grande)
    if (allData.length > 0) {
      const numCols = allData[0].length;
      let writtenRows = 0;
      const chunkSize = cfg.SET_VALUES_CHUNK_ROWS;

      while (writtenRows < allData.length) {
        const startIdx = writtenRows;
        const endIdx = Math.min(startIdx + chunkSize, allData.length);
        const chunk = allData.slice(startIdx, endIdx);

        runMasterOpWithRetry_(
          'setValuesChunk[' + startIdx + '-' + (endIdx - 1) + ']',
          () => {
            // Equivalente a la antigua línea 50, pero envuelta en retry
            allMealsSheet
              .getRange(2 + startIdx, 1, chunk.length, numCols)
              .setValues(chunk);
            // Commit del chunk: si después falla algo, no quedamos en buffer
            SpreadsheetApp.flush();
            return true;
          }
        );

        writtenRows = endIdx;
      }
    }

    // 4.c) Flush final defensivo antes de soltar el lock
    runMasterOpWithRetry_('finalFlush', () => {
      SpreadsheetApp.flush();
      return true;
    });

    console.log(
      'updateAllMeals OK. Sites totales=' + totalSites +
      ', ok=' + (totalSites - failedSites.length) +
      ', fallidos=' + failedSites.length +
      ', filas escritas=' + allData.length + '.'
    );

    if (failedSites.length > 0) {
      sendPartialFailureAlert(failedSites, totalSites);
    }

  } catch (err) {
    // Cualquier error que se haya escapado del retry (no retryable o agotó intentos)
    console.error('updateAllMeals abortó: ' + ((err && err.stack) || err));
    try {
      sendFailureAlert(
        'updateAllMeals abortó por error no recuperable: ' + (err && err.message),
        []
      );
    } catch (alertErr) {
      console.error('No se pudo enviar alerta de fallo: ' + alertErr);
    }
    try {
      scheduleRetry();
    } catch (schedErr) {
      console.error('No se pudo agendar retry: ' + schedErr);
    }
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
  }
}

// =====================================================================
// LECTURA DE SITES (con retry, con clasificación de errores agregada)
// =====================================================================

function readSiteWithRetry(siteName, spreadsheetId) {
  const cfg = UPDATE_ALL_MEALS_CONFIG;
  let lastError;
  for (let attempt = 1; attempt <= cfg.MAX_RETRIES_PER_SITE; attempt++) {
    try {
      const siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const pastMealsSheet = siteSpreadsheet.getSheetByName('PastMeals');
      if (!pastMealsSheet) return [];
      const lastRow = pastMealsSheet.getLastRow();
      if (lastRow < 2) return [];
      return pastMealsSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    } catch (error) {
      lastError = error;
      console.warn(
        'Intento ' + attempt + '/' + cfg.MAX_RETRIES_PER_SITE +
        ' falló para ' + siteName + ': ' + error
      );
      // Si el error claramente NO es retryable (permisos, not found),
      // cortamos rápido en lugar de gastar 3 intentos al pedo.
      if (!isRetryableSpreadsheetError_(error)) {
        throw error;
      }
      if (attempt < cfg.MAX_RETRIES_PER_SITE) {
        Utilities.sleep(cfg.RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

// =====================================================================
// ALERTAS Y RETRY AGENDADO (sin cambios funcionales)
// =====================================================================

function sendFailureAlert(reason, failedSites) {
  try {
    MailApp.sendEmail(
      UPDATE_ALL_MEALS_CONFIG.ALERT_EMAIL,
      '[IF CARES] updateAllMeals ABORTADO - datos no actualizados',
      reason + '\n\nSites con error:\n'
        + failedSites.map(f => '- ' + f.siteName + ': ' + f.error).join('\n')
        + '\n\nRe-intento automático en ' + UPDATE_ALL_MEALS_CONFIG.RETRY_TRIGGER_DELAY_MIN + ' min.'
    );
  } catch (e) { console.error('No se pudo enviar alerta: ' + e); }
}

function sendPartialFailureAlert(failedSites, totalSites) {
  try {
    MailApp.sendEmail(
      UPDATE_ALL_MEALS_CONFIG.ALERT_EMAIL,
      '[IF CARES] updateAllMeals completó con fallas (' + failedSites.length + '/' + totalSites + ')',
      'Se actualizó "All Meals" (superó umbral) pero estos sites fallaron:\n\n'
        + failedSites.map(f => '- ' + f.siteName + ': ' + f.error).join('\n')
    );
  } catch (e) { console.error('No se pudo enviar alerta parcial: ' + e); }
}

function scheduleRetry() {
  try {
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === 'updateAllMealsRetry')
      .forEach(t => ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('updateAllMealsRetry')
      .timeBased()
      .after(UPDATE_ALL_MEALS_CONFIG.RETRY_TRIGGER_DELAY_MIN * 60 * 1000)
      .create();
    console.log('Re-intento programado en ' + UPDATE_ALL_MEALS_CONFIG.RETRY_TRIGGER_DELAY_MIN + ' min');
  } catch (e) { console.error('No se pudo programar retry: ' + e); }
}

function updateAllMealsRetry() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'updateAllMealsRetry')
    .forEach(t => ScriptApp.deleteTrigger(t));
  updateAllMeals();
}