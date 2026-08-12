var folderId = '1X6_ELCTG6YGduz-eBiVtCoO3wfxlaMZA';

// HOTFIX 2026-08-12:
// - updateMaster/updateAllMeals rebuilds now run under the same script lock
//   as the roster handlers, so a rebuild can never interleave with a user's
//   add/edit/delete and silently overwrite the Students tab with stale data.
// - tryLock(0): if anything else is running, we simply skip this cycle and
//   let the next trigger run pick it up (a rebuild is never urgent).
//
// RECOMMENDED (see gas-hotfix/README): change this trigger from every
// 5 minutes to every hour. The 5-minute Drive folder scan alone consumes
// ~20 min/day of trigger quota, and a mid-day rebuild empties "All Meals"
// for several minutes, which blanks out the app's date pickers.
function checkAndUpdate() {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var fileCount = 0;

  while (files.hasNext()) {
    files.next();
    fileCount++;
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites')
  var lastCount = sheet.getRange('D2').getValue();

  if (fileCount !== lastCount) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(0)) {
      // Something else (user write or another rebuild) is running — skip
      // this cycle; the next trigger run will retry while the count still
      // differs from D2.
      console.log('checkAndUpdate: lock busy, skipping this cycle.');
      return;
    }
    try {
      sheet.getRange('D2').setValue(fileCount); // Update the cell with the new count
      updateMaster();
    } finally {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
    // updateAllMeals acquires the same lock itself, so it runs AFTER we
    // release it (it waits up to 60s), never concurrently with updateMaster.
    updateAllMeals();
  }
}
