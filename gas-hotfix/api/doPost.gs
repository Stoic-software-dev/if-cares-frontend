function createCORSResponse(output, mimeType) {
  return ContentService.createTextOutput(output)
    .setMimeType(mimeType)
}

// =====================================================================
// HOTFIX 2026-08-12: concurrency + performance
//
// 1. All roster mutations (add/edit/delete) now run under a script lock.
//    Before this, two simultaneous requests would each read the full
//    roster/Students range, then clear + rewrite it, silently dropping
//    the other request's change ("roster updates not saving").
// 2. Per-row getValue()/setFormula()/setValue() loops replaced with
//    single batched setValues() calls. A roster edit went from
//    ~200-300 sequential Sheets calls (30-60s) to 2-3 calls (~2s).
//    Long executions were stacking up against the 30-simultaneous-
//    executions quota, which is what made logins queue for minutes.
// 3. handleMealCount now VALIDATES the duplicate date BEFORE mutating
//    the master sheet (it used to delete the All Meals row and append
//    to Sent Meals first, corrupting state on duplicates), and computes
//    the date up front (it used to append `undefined` to Sent Meals
//    when All Meals was empty, which poisoned getAllMeals for everyone).
// =====================================================================

var HOTFIX_LOCK_TIMEOUT_MS = 30000;

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    acquired = lock.tryLock(HOTFIX_LOCK_TIMEOUT_MS);
    if (!acquired) {
      return createCORSResponse(JSON.stringify({
        result: "error",
        message: "The system is busy processing other updates. Please try again in a moment."
      }), ContentService.MimeType.JSON);
    }
    return fn();
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
  }
}

// Writes roster rows [name, age, birthdate, id] sorted by name in ONE
// setValues call. Age cells that have a birthdate get the DATEDIF formula
// (setValues interprets strings starting with "=" as formulas).
function writeRosterSorted_(rosterSheet, rows, prevDataRowCount) {
  rows.sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]));
  });

  var values = rows.map(function (row, idx) {
    var sheetRow = 2 + idx;
    var age = row[2] ? '=DATEDIF(C' + sheetRow + ', TODAY(), "Y")' : row[1];
    return [row[0], age, row[2], row[3]];
  });

  if (prevDataRowCount > 0) {
    rosterSheet.getRange(2, 1, prevDataRowCount, 4).clearContent();
  }
  if (values.length > 0) {
    rosterSheet.getRange(2, 1, values.length, 4).setValues(values);
  }
}

// Rewrites the master Students tab sorted by name in ONE setValues call.
function writeMasterStudentsSorted_(studentsSheet, studentData, prevDataRowCount) {
  studentData.sort(function (a, b) {
    return String(a[0]).localeCompare(String(b[0]));
  });
  if (prevDataRowCount > 0) {
    studentsSheet.getRange(2, 1, prevDataRowCount, 6).clearContent();
  }
  if (studentData.length > 0) {
    studentsSheet.getRange(2, 1, studentData.length, 6).setValues(studentData);
  }
}

function findSpreadsheetIdBySite_(siteName) {
  var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  var lastRowMaster = masterSheet.getLastRow();
  if (lastRowMaster < 2) return null;

  var data = masterSheet.getRange(2, 1, lastRowMaster - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] == siteName) {
      return data[i][1];
    }
  }
  return null;
}

function doPost(e) {

  var data = JSON.parse(e.postData.contents);
  var actionType = data.actionType;

  switch (actionType) {
    case 'delete':
      return withScriptLock_(function () { return handleDelete(data); });
    case 'add':
      return withScriptLock_(function () { return handleAdd(data); });
    case 'edit':
      return withScriptLock_(function () { return handleEdit(data); });
    case 'mealCount':
      return handleMealCount(data);
    case 'login':
      return handleLogin(data);
    case 'signReport':
      return handleSignConsolidatedReport(data)
    default:
      return createCORSResponse(JSON.stringify({ result: "error", message: "Invalid action type" }), ContentService.MimeType.JSON);
  }
}

// function to handle the delete request
function handleDelete(data) {
  var formResponses = data.values;
  var siteName = formResponses[1];
  var id = formResponses[2];

  var spreadsheetId = findSpreadsheetIdBySite_(siteName);
  if (!spreadsheetId) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Site not found: " + siteName }), ContentService.MimeType.JSON);
  }

  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var rosterSheet = siteSpreadsheet.getSheetByName('Roster');

  var lastRow = rosterSheet.getLastRow();
  var prevRowCount = lastRow > 1 ? lastRow - 1 : 0;
  var existingData = prevRowCount > 0
    ? rosterSheet.getRange(2, 1, prevRowCount, 4).getValues()
    : [];

  // Find the student by ID and delete their row from the array
  existingData = existingData.filter(function (row) { return row[3] !== id; });

  writeRosterSorted_(rosterSheet, existingData, prevRowCount);

  // look for the student in the master Students sheet and delete him
  var studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
  if (studentsSheet.getLastRow() > 1) {
    var studentIds = studentsSheet.getRange(2, 6, studentsSheet.getLastRow() - 1).getValues().flat();
    var rowIndex = studentIds.indexOf(id);
    if (rowIndex !== -1) {
      studentsSheet.deleteRow(rowIndex + 2); // account for the header row
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Data deleted successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// function to handle the add a student
function handleAdd(data) {
  var formResponses = data.values;
  var studentName = formResponses[0];
  var studentAge = formResponses[1] || "";
  var siteName = formResponses[2];
  var birthDate = formResponses[3] || "";

  studentAge = birthDate === "" ? studentAge : ""

  var spreadsheetId = findSpreadsheetIdBySite_(siteName);
  if (!spreadsheetId) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Site not found: " + siteName }), ContentService.MimeType.JSON);
  }

  // Go to the site's spreadsheet and get existing student data
  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var rosterSheet = siteSpreadsheet.getSheetByName('Roster');

  var lastRow = rosterSheet.getLastRow();
  var prevRowCount = lastRow > 1 ? lastRow - 1 : 0;
  var existingData = prevRowCount > 0
    ? rosterSheet.getRange(2, 1, prevRowCount, 4).getValues()
    : [];

  // Check if the student already exists
  for (var i = 0; i < existingData.length; i++) {
    if (existingData[i][0] === studentName) {
      return createCORSResponse(JSON.stringify({ result: "error", message: "Student already exists" }), ContentService.MimeType.JSON);
    }
  }

  // Generate id based on name and timestamp
  var id = generateStudentID(studentName)

  // Add the new student's data to the existing data and rewrite sorted
  existingData.push([studentName, studentAge, birthDate, id]);
  writeRosterSorted_(rosterSheet, existingData, prevRowCount);

  // Now add the student to the master sheet
  var studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
  var lastRowStudents = studentsSheet.getLastRow();
  var prevStudentsRowCount = lastRowStudents > 1 ? lastRowStudents - 1 : 0;
  var studentData = prevStudentsRowCount > 0
    ? studentsSheet.getRange(2, 1, prevStudentsRowCount, 6).getValues()
    : [];

  // check if birthdate and calculate the age
  if (birthDate !== "") {
    var today = new Date();
    var birth = new Date(birthDate);
    var age = today.getFullYear() - birth.getFullYear();
    var monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    studentAge = age;
  }

  studentData.push([studentName, studentAge, siteName, spreadsheetId, birthDate, id]);
  writeMasterStudentsSorted_(studentsSheet, studentData, prevStudentsRowCount);

  return createCORSResponse(JSON.stringify({ result: "success", message: "Data added successfully" }), ContentService.MimeType.JSON);
}

// function to handle the edit request

function handleEdit(data) {
  var formResponses = data.values;
  var oldStudentName = formResponses[0];
  var oldSiteName = formResponses[1];
  var studentId = formResponses[2];
  var newStudentName = formResponses[3];
  var newStudentAge = formResponses[4];
  var newSiteName = formResponses[5];

  var newSpreadsheetId = findSpreadsheetIdBySite_(newSiteName);
  if (!newSpreadsheetId) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Site not found: " + newSiteName }), ContentService.MimeType.JSON);
  }

  // Go to the site's spreadsheet and get existing student data
  var newSiteSpreadsheet = SpreadsheetApp.openById(newSpreadsheetId);
  var newRosterSheet = newSiteSpreadsheet.getSheetByName('Roster');

  var newLastRow = newRosterSheet.getLastRow();
  var newPrevRowCount = newLastRow > 1 ? newLastRow - 1 : 0;
  var newExistingData = newPrevRowCount > 0
    ? newRosterSheet.getRange(2, 1, newPrevRowCount, 4).getValues()
    : [];

  // Check for an existing student with the new name (excluding the student being edited)
  var isStudentExists = newExistingData.some(function (row) {
    return row[0] === newStudentName && row[3] !== studentId;
  });

  if (isStudentExists) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Student already exists" }), ContentService.MimeType.JSON);
  }

  var studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
  var lastRowStudents = studentsSheet.getLastRow();
  var prevStudentsRowCount = lastRowStudents > 1 ? lastRowStudents - 1 : 0;

  if (oldSiteName === newSiteName) {
    // if the sites are the same, then just update the student
    for (var i = 0; i < newExistingData.length; i++) {
      if (newExistingData[i][3] == studentId) {
        newExistingData[i][0] = newStudentName; // Update name
        newExistingData[i][1] = newStudentAge;  // Update age
        break;
      }
    }
    writeRosterSorted_(newRosterSheet, newExistingData, newPrevRowCount);
  } else {
    // Remove the student from the old site's roster
    var oldSpreadsheetId = findSpreadsheetIdBySite_(oldSiteName);
    if (!oldSpreadsheetId) {
      return createCORSResponse(JSON.stringify({ result: "error", message: "Site not found: " + oldSiteName }), ContentService.MimeType.JSON);
    }

    var oldSiteSpreadsheet = SpreadsheetApp.openById(oldSpreadsheetId);
    var oldRosterSheet = oldSiteSpreadsheet.getSheetByName('Roster');

    var oldLastRow = oldRosterSheet.getLastRow();
    var oldPrevRowCount = oldLastRow > 1 ? oldLastRow - 1 : 0;
    var oldExistingData = oldPrevRowCount > 0
      ? oldRosterSheet.getRange(2, 1, oldPrevRowCount, 4).getValues()
      : [];

    var studentBirthDate = "";
    for (var j = 0; j < oldExistingData.length; j++) {
      if (oldExistingData[j][3] === studentId) {
        studentBirthDate = oldExistingData[j][2]; // grab the birthdate before removing
        oldExistingData.splice(j, 1);
        break;
      }
    }
    writeRosterSorted_(oldRosterSheet, oldExistingData, oldPrevRowCount);

    // Add the student to the new site's roster
    newExistingData.push([newStudentName, newStudentAge, studentBirthDate, studentId]);
    writeRosterSorted_(newRosterSheet, newExistingData, newPrevRowCount);
  }

  // Update the student in the master Students sheet
  if (prevStudentsRowCount > 0) {
    var studentData = studentsSheet.getRange(2, 1, prevStudentsRowCount, 6).getValues();
    for (var k = 0; k < studentData.length; k++) {
      if (studentData[k][5] === studentId) {
        studentData[k][0] = newStudentName;
        studentData[k][1] = newStudentAge;
        studentData[k][2] = newSiteName;
        studentData[k][3] = newSpreadsheetId;
        // Keep birthdate (col E) and studentId (col F) unchanged
        break;
      }
    }
    writeMasterStudentsSorted_(studentsSheet, studentData, prevStudentsRowCount);
  }

  return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Data added successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleMealCount(data) {

  var values = data.values;
  var formattedData = values.data;
  var mealFormDate = values.date;
  var formattedTime1 = values.timeIn;
  var formattedTime2 = values.timeOut;
  var signData = values.signature;
  var siteName = values.site;

  // Compute the date ONCE, up front. The old code computed this inside the
  // All Meals loop, so an empty All Meals tab meant `undefined` got appended
  // to Sent Meals, which then broke getAllMeals for every site.
  var formattedDateForMaster = Utilities.formatDate(new Date(mealFormDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var spreadsheetId = findSpreadsheetIdBySite_(siteName);
  if (!spreadsheetId) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Site not found: " + siteName }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);

  // Validate the duplicate BEFORE touching the master sheet
  var datesSheet = siteSpreadsheet.getSheetByName('Dates');
  var lastRowDates = datesSheet.getLastRow();
  if (lastRowDates > 1) {
    var submittedMeals = datesSheet.getRange(2, 1, lastRowDates - 1, 1).getValues();
    var formattedMealFormDate = Utilities.formatDate(new Date(mealFormDate), Session.getScriptTimeZone(), "MM/dd/yyyy");
    for (var i = 0; i < submittedMeals.length; i++) {
      var cellDate = submittedMeals[i][0];
      if (!cellDate) continue;
      var formatDate = Utilities.formatDate(new Date(cellDate), Session.getScriptTimeZone(), "MM/dd/yyyy");
      if (formatDate == formattedMealFormDate) {
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Meal count already sent" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // Remove the date from the site's PastMeals
  var pastMealsSheet = siteSpreadsheet.getSheetByName('PastMeals');
  var lastRowPastMeals = pastMealsSheet.getLastRow();
  if (lastRowPastMeals > 1) {
    var pastMealsData = pastMealsSheet.getRange(2, 1, lastRowPastMeals - 1, 1).getValues();
    for (var j = 0; j < pastMealsData.length; j++) {
      if (!pastMealsData[j][0]) continue;
      var pastMealDate = Utilities.formatDate(new Date(pastMealsData[j][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (pastMealDate === formattedDateForMaster) {
        pastMealsSheet.deleteRow(j + 2);
        break;
      }
    }
  }

  // Master sheet mutations under the shared lock (short critical section):
  // remove the date from All Meals and log it in Sent Meals
  var lock = LockService.getScriptLock();
  var masterLockAcquired = lock.tryLock(HOTFIX_LOCK_TIMEOUT_MS);
  try {
    var allMealsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Meals');
    var sentMealsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sent Meals');

    var allMealsData = allMealsSheet.getDataRange().getValues();
    for (var m = 1; m < allMealsData.length; m++) {
      if (!allMealsData[m][1]) continue;
      var currentSite = allMealsData[m][0];
      var currentDate = Utilities.formatDate(new Date(allMealsData[m][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (currentSite === siteName && currentDate === formattedDateForMaster) {
        allMealsSheet.deleteRow(m + 1);
        break;
      }
    }

    sentMealsSheet.appendRow([siteName, formattedDateForMaster]);
  } finally {
    if (masterLockAcquired) {
      try { lock.releaseLock(); } catch (e) { /* ignore */ }
    }
  }

  var formSheet = siteSpreadsheet.getSheetByName('Form');

  // ===== DETERMINAR MÁXIMO DE FILAS SEGÚN EL SITIO =====
  var MAX_ROWS_PER_COLUMN = 100; // default: filas 7 a 106
  var LAST_FORM_ROW = 106;       // default

  if (siteSpreadsheet.getName() === '2025/2026 TX BGC COOKE') {
    MAX_ROWS_PER_COLUMN = 150;
    LAST_FORM_ROW = 156;
  }
  // ===== FIN CONFIGURACIÓN =====

  const isoDateString = mealFormDate;
  const dateObj = new Date(isoDateString);
  const formattedDate = (dateObj.getMonth() + 1).toString().padStart(2, '0') + '/' + dateObj.getDate().toString().padStart(2, '0') + '/' + dateObj.getFullYear();

  formSheet.getRange(4, 18, 1, 3).setValue(formattedDate)
  if (siteSpreadsheet.getName() === '2025/2026 TX BGC COOKE') {
    formSheet.getRange(161, 16, 3, 5).setValue(formattedDate);
  } else {
    formSheet.getRange(111, 16, 3, 5).setValue(formattedDate);
  }

  var lastRowDatesForAppend = datesSheet.getLastRow();
  var nextRow = lastRowDatesForAppend > 1 ? lastRowDatesForAppend + 1 : 2;
  datesSheet.getRange(nextRow, 1).setValue(formattedDate);

  uploadSignatureToDrive(signData, siteName, formattedDate);
  Utilities.sleep(1000)
  var signRow = (siteSpreadsheet.getName() === '2025/2026 TX BGC COOKE') ? 161 : 111;
  insertSignatureToCell(siteName, formattedDate, formSheet, signRow)

  function adjustTimeFormat(timeStr) {
    return timeStr.replace(/:00 (?=AM|PM)/, ' ');
  }

  var adjustedTime1 = adjustTimeFormat(formattedTime1);
  var adjustedTime2 = adjustTimeFormat(formattedTime2);

  datesSheet.getRange(nextRow, 2).setValue(adjustedTime1);
  datesSheet.getRange(nextRow, 3).setValue(adjustedTime2);

  function extractValuesFromData(index) {
    return formattedData.map(function (student) {
      return student[index];
    });
  }

  var presenceArray = extractValuesFromData(3);
  var breakfastArray = extractValuesFromData(4);
  var lunchArray = extractValuesFromData(5);
  var snackArray = extractValuesFromData(6);
  var supperArray = extractValuesFromData(7);

  function splitArrayAlternating(dataArray) {
    var leftColumn = [];
    var rightColumn = [];

    for (var i = 0; i < dataArray.length; i++) {
      if (i % 2 === 0) {
        leftColumn.push(dataArray[i]);
      } else {
        rightColumn.push(dataArray[i]);
      }
    }

    return {
      firstColumnData: leftColumn,
      secondColumnData: rightColumn
    };
  }

  // Batched write: one setValues per column instead of one setValue per cell.
  // A 100-student submission went from ~250 sequential Sheets calls to ~12.
  function setColumnValues_(sheet, columnIndex, startRow, dataArray) {
    if (!dataArray.length) return;
    var values = dataArray.map(function (v) { return [v]; });
    sheet.getRange(startRow, columnIndex, values.length, 1).setValues(values);
  }

  // Times: two-column ranges (in/out), blank for absent students
  function setTimeValuesAlternating_(sheet, timeIn, timeOut, presenceData) {
    var left = [];
    var right = [];
    for (var i = 0; i < presenceData.length; i++) {
      var pair = presenceData[i] ? [timeIn, timeOut] : ['', ''];
      if (i % 2 === 0) left.push(pair);
      else right.push(pair);
    }
    if (left.length) sheet.getRange(7, 5, left.length, 2).setValues(left);
    if (right.length) sheet.getRange(7, 15, right.length, 2).setValues(right);
  }

  setTimeValuesAlternating_(formSheet, adjustedTime1, adjustedTime2, presenceArray);

  var split = splitArrayAlternating(presenceArray);
  setColumnValues_(formSheet, 4, 7, split.firstColumnData);
  setColumnValues_(formSheet, 14, 7, split.secondColumnData);

  split = splitArrayAlternating(breakfastArray);
  setColumnValues_(formSheet, 7, 7, split.firstColumnData);
  setColumnValues_(formSheet, 17, 7, split.secondColumnData);

  split = splitArrayAlternating(lunchArray);
  setColumnValues_(formSheet, 8, 7, split.firstColumnData);
  setColumnValues_(formSheet, 18, 7, split.secondColumnData);

  split = splitArrayAlternating(snackArray);
  setColumnValues_(formSheet, 9, 7, split.firstColumnData);
  setColumnValues_(formSheet, 19, 7, split.secondColumnData);

  split = splitArrayAlternating(supperArray);
  setColumnValues_(formSheet, 10, 7, split.firstColumnData);
  setColumnValues_(formSheet, 20, 7, split.secondColumnData);

  var copiedSheet = createCopyAndHideRows(formSheet, formattedDate, formattedData.length, LAST_FORM_ROW);

  clearForm(formSheet, LAST_FORM_ROW);

  return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Meal count sent successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleLogin({ email, password }) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Sheet not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][3] == email && data[i][4] == password) {
      const user = {
        id: data[i][0],
        name: data[i][1],
        lastname: data[i][2],
        email: data[i][3],
        role: data[i][5],
        assignedSite: data[i][6]
      };

      return ContentService.createTextOutput(JSON.stringify({ result: 'success', data: user }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User not found or incorrect password" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function createCopyAndHideRows(formSheet, formattedDate, totalStudents, lastFormRow) {
  lastFormRow = lastFormRow || 106; // fallback al valor original

  var copiedSheet = formSheet.copyTo(formSheet.getParent()).setName(formattedDate);

  copiedSheet.getRange('B7:B' + lastFormRow).clearContent();
  copiedSheet.getRange('L7:L' + lastFormRow).clearContent();
  copiedSheet.getRange('C7:C' + lastFormRow).clearContent();
  copiedSheet.getRange('M7:M' + lastFormRow).clearContent();

  function copyValuesToCopiedSheet(originalRange, copiedRange) {
    var originalValues = originalRange.getValues();
    copiedRange.setValues(originalValues);
  }

  copyValuesToCopiedSheet(formSheet.getRange('B7:B' + lastFormRow), copiedSheet.getRange('B7:B' + lastFormRow));
  copyValuesToCopiedSheet(formSheet.getRange('L7:L' + lastFormRow), copiedSheet.getRange('L7:L' + lastFormRow));
  copyValuesToCopiedSheet(formSheet.getRange('C7:C' + lastFormRow), copiedSheet.getRange('C7:C' + lastFormRow));
  copyValuesToCopiedSheet(formSheet.getRange('M7:M' + lastFormRow), copiedSheet.getRange('M7:M' + lastFormRow));

  var firstEmptyRow = 7 + Math.ceil(totalStudents / 2);

  if (firstEmptyRow <= lastFormRow) {
    copiedSheet.hideRows(firstEmptyRow, lastFormRow - firstEmptyRow + 1);
  }

  return copiedSheet;
}
