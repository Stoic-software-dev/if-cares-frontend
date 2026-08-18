/**
 * ONE-TIME MIGRATION EXPORT — paste this file into the "Master" Apps Script
 * project (script.google.com) as a new file, then wire it into api/doGet.gs by
 * adding this branch BEFORE the final `else`:
 *
 *     else if (e.parameter.type === "exportHistory") {
 *       return handleExportHistory(e);
 *     }
 *
 * Then: Deploy → Manage deployments → Edit (pencil) → Version: New version →
 * Deploy. The /exec URL stays the same.
 *
 * Security: set MIGRATION_EXPORT_KEY to a long random string and put the SAME
 * value in the app's .env as GAS_EXPORT_KEY. Requests without the key are
 * rejected. Read-only: this never writes to any sheet.
 *
 * Usage from the importer:
 *   ?type=exportHistory&key=...&site=<site name>&list=1      → dated tab names only (fast)
 *   ?type=exportHistory&key=...&site=<site name>&month=M/YYYY → data for that month's tabs
 *   ?type=exportHistory&key=...&site=<site name>              → data for ALL tabs (small sites only:
 *                                                               a full-year site exceeds the ~6 min
 *                                                               Apps Script execution limit)
 */

var MIGRATION_EXPORT_KEY = 'CHANGE-ME-to-a-long-random-string';

function handleExportHistory(e) {
  function json(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!MIGRATION_EXPORT_KEY || MIGRATION_EXPORT_KEY.indexOf('CHANGE-ME') === 0 ||
      e.parameter.key !== MIGRATION_EXPORT_KEY) {
    return json({ result: 'error', message: 'unauthorized' });
  }

  var siteName = e.parameter.site;
  if (!siteName) return json({ result: 'error', message: 'missing site' });

  // Resolve the site spreadsheet from the master Sites tab
  var sitesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  var lastRowMaster = sitesSheet.getLastRow();
  var names = sitesSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues();
  var ids = sitesSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues();
  var spreadsheetId = null;
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] == siteName) { spreadsheetId = ids[i][0]; break; }
  }
  if (!spreadsheetId) return json({ result: 'error', message: 'site not found: ' + siteName });

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var tz = Session.getScriptTimeZone();
  // Both "M/D/YYYY" (current) and "MMDDYYYY" (some older tabs / renames)
  var datePattern = /^(\d{1,2}\/\d{1,2}\/\d{4}|\d{8})$/;

  // Listing mode: tab names only, so the importer can batch big sites by month.
  if (e.parameter.list === '1') {
    var tabs = [];
    ss.getSheets().forEach(function (sheet) {
      var n = sheet.getName().trim();
      if (datePattern.test(n)) tabs.push(n);
    });
    return json({ result: 'success', site: siteName, spreadsheetId: spreadsheetId, tabs: tabs });
  }

  var monthFilter = e.parameter.month || ''; // "M/YYYY"

  // Submission log: Dates tab rows are [date, timeIn, timeOut]
  var datesLog = {};
  var datesSheet = ss.getSheetByName('Dates');
  if (datesSheet && datesSheet.getLastRow() > 1) {
    var rows = datesSheet.getRange(2, 1, datesSheet.getLastRow() - 1, 3).getValues();
    rows.forEach(function (row) {
      if (!row[0]) return;
      var key = Utilities.formatDate(new Date(row[0]), tz, 'M/d/yyyy');
      datesLog[key] = { timeIn: formatTimeCell_(row[1], tz), timeOut: formatTimeCell_(row[2], tz) };
    });
  }

  var out = { result: 'success', site: siteName, spreadsheetId: spreadsheetId, dates: {} };
  var MAX_ROW = 156; // covers the 150-row BGC COOKE layout; extra rows are empty elsewhere

  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName().trim();
    if (!datePattern.test(name)) return;
    if (monthFilter && tabMonthKey_(name) !== monthFilter) return;

    // Single read B7:T{MAX_ROW}. Left block: B name, C age, D att, E/F times,
    // G brk, H lunch, I snk, J sup. Right block: L,M,N,O/P,Q,R,S,T.
    var vals = sheet.getRange(7, 2, MAX_ROW - 7 + 1, 19).getValues();
    var students = [];
    var tabTimeIn = '', tabTimeOut = '';

    function pushStudent(row, offset) {
      var sName = row[offset];
      if (sName === '' || sName === null) return;
      students.push({
        name: String(sName),
        age: row[offset + 1] === '' ? null : row[offset + 1],
        att: row[offset + 2] === true,
        brk: row[offset + 5] === true,
        lu: row[offset + 6] === true,
        snk: row[offset + 7] === true,
        sup: row[offset + 8] === true
      });
      if (!tabTimeIn && row[offset + 3]) tabTimeIn = formatTimeCell_(row[offset + 3], tz);
      if (!tabTimeOut && row[offset + 4]) tabTimeOut = formatTimeCell_(row[offset + 4], tz);
    }

    // Original submission order alternated left/right per index
    for (var r = 0; r < vals.length; r++) {
      pushStudent(vals[r], 0);   // left block (B..J → offsets 0..8)
      pushStudent(vals[r], 10);  // right block (L..T → offsets 10..18)
    }

    // Totals as computed by the form template (both layout variants)
    function num(a1) { var v = sheet.getRange(a1).getValue(); return typeof v === 'number' ? v : 0; }
    var totalsStandard = {
      brk: num('C108'), lunch: num('C109'),
      snk: num('H108') + num('I108'), sup: num('H109') + num('I109'),
      att: num('M109')
    };
    var totalsCooke = {
      brk: num('C158'), lunch: num('C159'),
      snk: num('H158') + num('I158'), sup: num('H159') + num('I159'),
      att: num('M159')
    };

    var log = datesLog[name] || {};
    out.dates[name] = {
      timeIn: log.timeIn || tabTimeIn || '',
      timeOut: log.timeOut || tabTimeOut || '',
      students: students,
      totalsStandard: totalsStandard,
      totalsCooke: totalsCooke
    };
  });

  return json(out);
}

function tabMonthKey_(name) {
  var slashed = name.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})$/);
  if (slashed) return Number(slashed[1]) + '/' + slashed[2];
  if (/^\d{8}$/.test(name)) return Number(name.slice(0, 2)) + '/' + name.slice(4);
  return '';
}

function formatTimeCell_(value, tz) {
  if (value === '' || value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, tz, 'HH:mm:ss');
  }
  return String(value);
}
