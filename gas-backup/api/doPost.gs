function createCORSResponse(output, mimeType) {
  return ContentService.createTextOutput(output)
    .setMimeType(mimeType)
}

function doPost(e) {

  // if (e && e.parameter && e.parameter.httpMethod && e.parameter.httpMethod === 'OPTIONS') {
  //     return handlePreflight();
  // }

  var data = JSON.parse(e.postData.contents);
  var actionType = data.actionType;

  switch (actionType) {
    case 'delete':
      return handleDelete(data);
    case 'add':
      return handleAdd(data);
    case 'edit':
      return handleEdit(data);
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

function handlePreflight() {
  var output = ContentService.createTextOutput(JSON.stringify({ message: "Preflight response" }));
  output.setMimeType(ContentService.MimeType.JSON);
  output.setAllowCrossDomainRequest(true)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    });
  return output;
}

// function to handle the delete request
function handleDelete(data) {
  var formResponses = data.values;
  var siteName = formResponses[1];
  var id = formResponses[2];

  // Get the Spreadsheet ID based on the site
  var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  const lastRowMaster = masterSheet.getLastRow();
  const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');

  var sites = masterSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues(); // Column A for site names
  var ids = masterSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues(); // Column B for Spreadsheet IDs
  var spreadsheetId;
  for (var i = 0; i < sites.length; i++) {
    if (sites[i][0] == siteName) {
      spreadsheetId = ids[i][0];
      break;
    }
  }

  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var rosterSheet = siteSpreadsheet.getSheetByName('Roster');

  var lastRow = rosterSheet.getLastRow();
  var existingData = rosterSheet.getRange(2, 1, lastRow - 1, 4).getValues(); // 4 columns

  // Find the student by ID and delete their row from the array
  existingData = existingData.filter(row => row[3] !== id);

  // Sort and write back the data
  existingData.sort(function (a, b) {
    return a[0].localeCompare(b[0]);
  });
  rosterSheet.getRange(2, 1, lastRow - 1, 4).clearContent(); // 4 columns
  rosterSheet.getRange(2, 1, existingData.length, 4).setValues(existingData); // 4 columns

  // Now let's loop through column C to check for birthdates and insert age formula
  const updatedLastRow = rosterSheet.getLastRow();
  for (var k = 2; k <= updatedLastRow; k++) {
    // Check if the birthdate cell is not empty
    var birthdateCell = rosterSheet.getRange(k, 3).getValue();
    if (birthdateCell) {
      var ageFormula = '=DATEDIF(C' + k + ', TODAY(), "Y")';
      rosterSheet.getRange(k, 2).setFormula(ageFormula);
    }
  }

  // look for the student in the student sheet and delete him
  var studentIds = studentsSheet.getRange(2, 6, studentsSheet.getLastRow() - 1).getValues().flat(); // Get all student IDs in column F
  var rowIndex = studentIds.indexOf(id); // Find the index of the student ID

  if (rowIndex !== -1) {
    studentsSheet.deleteRow(rowIndex + 2); // Delete the corresponding row, account for the header row
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

  // Get the Spreadsheet ID based on the site
  var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  const lastRowMaster = masterSheet.getLastRow();

  var sites = masterSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues(); // Column A for site names
  var ids = masterSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues(); // Column B for Spreadsheet IDs
  var spreadsheetId;
  for (var i = 0; i < sites.length; i++) {
    if (sites[i][0] == siteName) {
      spreadsheetId = ids[i][0];
      break;
    }
  }

  // Go to the site's spreadsheet and get existing student data
  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var rosterSheet = siteSpreadsheet.getSheetByName('Roster');

  var lastRow = rosterSheet.getLastRow();

  Logger.log(lastRow)
  console.log(lastRow)

  var existingData = [];
  if (lastRow > 1) {
    existingData = rosterSheet.getRange(2, 1, lastRow - 1, 4).getValues(); // 4 columns: name, age, birthdate & id
  }

  // Check if the student already exists
  for (var i = 0; i < existingData.length; i++) {
    if (existingData[i][0] === studentName) {
      // Student already exists, return an error
      return createCORSResponse(JSON.stringify({ result: "error", message: "Student already exists" }), ContentService.MimeType.JSON);
    }
  }

  // Generate id based on name and timestamp
  var id = generateStudentID(studentName)

  // Add the new student's data to the existing data
  existingData.push([studentName, studentAge, birthDate, id]);

  // Sort the combined data alphabetically by student name
  existingData.sort(function (a, b) {
    return a[0].localeCompare(b[0]);
  });

  // Clear the existing data and write back the sorted data
  if (lastRow > 1) {
    rosterSheet.getRange(2, 1, lastRow - 1, 4).clearContent(); // 4 columns
  }
  rosterSheet.getRange(2, 1, existingData.length, 4).setValues(existingData);

  // Loop through column C to check for birthdates and insert age formula
  const updatedLastRow = rosterSheet.getLastRow();
  for (var k = 2; k <= updatedLastRow; k++) {
    // Check if the birthdate cell is not empty
    var birthdateCell = rosterSheet.getRange(k, 3).getValue();
    if (birthdateCell) {
      var ageFormula = '=DATEDIF(C' + k + ', TODAY(), "Y")';
      rosterSheet.getRange(k, 2).setFormula(ageFormula);
    }
  }

  // Now add the student to the master sheet
  const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
  const lastRowStudents = studentsSheet.getLastRow();

  // Retrieve the entire student data set at once
  const studentData = studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).getValues(); // Get all data from columns A to F

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

  // Add the new student to the master data
  studentData.push([studentName, studentAge, siteName, spreadsheetId, birthDate, id]);

  // Sort the combined data alphabetically by student name
  studentData.sort(function (a, b) {
    return a[0].localeCompare(b[0]);
  });

  // Clear the existing data and write back the sorted data in the master sheet
  studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).clearContent(); // Clear old data
  studentsSheet.getRange(2, 1, studentData.length, 6).setValues(studentData);

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

  var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  const lastRowMaster = masterSheet.getLastRow();

  var sites = masterSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues(); // Column A for site names
  var ids = masterSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues(); // Column B for Spreadsheet IDs

  var newSpreadsheetId;
  for (var i = 0; i < sites.length; i++) {
    if (sites[i][0] == newSiteName) {
      newSpreadsheetId = ids[i][0];
      break;
    }
  }

  // Go to the site's spreadsheet and get existing student data
  var newSiteSpreadsheet = SpreadsheetApp.openById(newSpreadsheetId);
  var newRosterSheet = newSiteSpreadsheet.getSheetByName('Roster');

  var newLastRow = newRosterSheet.getLastRow();
  var newExistingData = newRosterSheet.getRange(2, 1, newLastRow - 1, 4).getValues(); // get the 4 columns

  var isUpdate = (oldStudentName === newStudentName);

  var isStudentExists = newExistingData.some(function (row) {
    // If it's an update, ignore the current student's name
    return isUpdate ? (row[0] === newStudentName && row[0] !== oldStudentName) : (row[0] === newStudentName);
  });

  if (isStudentExists) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Student already exists" }), ContentService.MimeType.JSON);
  }

  // Check for existing student in the new site (excluding the current student if already in the new site)
  var isStudentExistsInNewSite = newExistingData.some(function (row) {
    return row[0] === newStudentName && (oldSiteName !== newSiteName || row[3] !== studentId); // studentId
  });

  if (isStudentExistsInNewSite) {
    return createCORSResponse(JSON.stringify({ result: "error", message: "Student already exists" }), ContentService.MimeType.JSON);
  }

  // if the sites are the same, then just update the student

  if (oldSiteName === newSiteName) {
    for (var i = 0; i < newExistingData.length; i++) {
      if (newExistingData[i][3] == studentId) { // student ID
        newExistingData[i][0] = newStudentName; // Update name
        newExistingData[i][1] = newStudentAge;  // Update age
        break;
      }
    }
    newExistingData.sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });
    // Clear the existing data and write back the sorted data
    newRosterSheet.getRange(2, 1, newLastRow - 1, 4).clearContent();
    newRosterSheet.getRange(2, 1, newExistingData.length, 4).setValues(newExistingData);

    const updatedNewLastRow = newRosterSheet.getLastRow();
    for (var k = 2; k <= updatedNewLastRow; k++) {
      // Check if the birthdate cell is not empty
      var birthdateCell = newRosterSheet.getRange(k, 3).getValue();
      if (birthdateCell) {
        // Calculate age based on birthdate
        var ageFormula = '=DATEDIF(C' + k + ', TODAY(), "Y")';
        newRosterSheet.getRange(k, 2).setFormula(ageFormula);
      }
    }

    // actualizar el alumno en la master
    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
    const lastRowStudents = studentsSheet.getLastRow();

    // Get all student IDs from column F (studentId column)
    var studentIds = studentsSheet.getRange(2, 6, lastRowStudents - 1).getValues().flat(); // Get all student IDs in column F

    // Find the index of the student ID
    var rowIndex = studentIds.indexOf(studentId);

    if (rowIndex !== -1) {
      // Update the corresponding row with the new name and age
      studentsSheet.getRange(rowIndex + 2, 1, 1, 2).setValues([[newStudentName, newStudentAge]]); // Update name (col A) and age (col B)
    }

    // Sort the entire sheet by student name (column A) after updating the row
    const studentData = studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).getValues();
    studentData.sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });

    // Clear the existing data and write back the sorted data in the master sheet
    studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).clearContent(); // Clear old data
    studentsSheet.getRange(2, 1, studentData.length, 6).setValues(studentData);


    return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Data added successfully" }))
      .setMimeType(ContentService.MimeType.JSON);

  } else {

    var oldSpreadsheetId;
    for (var i = 0; i < sites.length; i++) {
      if (sites[i][0] == oldSiteName) {
        oldSpreadsheetId = ids[i][0];
        break;
      }
    }

    var oldSiteSpreadsheet = SpreadsheetApp.openById(oldSpreadsheetId);
    var oldRosterSheet = oldSiteSpreadsheet.getSheetByName('Roster');

    var oldLastRow = oldRosterSheet.getLastRow();
    var oldExistingData = oldRosterSheet.getRange(2, 1, oldLastRow - 1, 4).getValues(); // get the 4 columns

    var studentBirthDate

    for (var j = 0; j < oldExistingData.length; j++) {
      if (oldExistingData[j][3] === studentId) {
        // grab the students birthdate before removing
        studentBirthDate = oldExistingData[j][2];
        oldExistingData.splice(j, 1); // remove the matching student data
        break;
      }
    }

    // Sort and write back the data
    oldExistingData.sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });
    oldRosterSheet.getRange(2, 1, oldLastRow - 1, 4).clearContent();
    oldRosterSheet.getRange(2, 1, oldExistingData.length, 4).setValues(oldExistingData);

    const updatedOldLastRow = oldRosterSheet.getLastRow();
    for (var k = 2; k <= updatedOldLastRow; k++) {
      // Check if the birthdate cell is not empty
      var birthdateCell = oldRosterSheet.getRange(k, 3).getValue();
      if (birthdateCell) {
        // Calculate age based on birthdate
        var ageFormula = '=DATEDIF(C' + k + ', TODAY(), "Y")';
        oldRosterSheet.getRange(k, 2).setFormula(ageFormula);
      }
    }

    // updateMaster()

    // Finished removing the student

    // here we need to start again, newSpreadsheetId is already defined
    for (var i = 0; i < sites.length; i++) {
      if (sites[i][0] == newSiteName) {
        newSpreadsheetId = ids[i][0];
        break;
      }
    }

    // Add the new student's data to the existing data
    // Also add the brithdate
    newExistingData.push([newStudentName, newStudentAge, studentBirthDate, studentId]);

    // Sort the combined data alphabetically by student name
    newExistingData.sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });

    // Clear the existing data and write back the sorted data
    newRosterSheet.getRange(2, 1, newLastRow - 1, 4).clearContent();
    newRosterSheet.getRange(2, 1, newExistingData.length, 4).setValues(newExistingData);

    const updatedNewLastRow = newRosterSheet.getLastRow();
    for (var k = 2; k <= updatedNewLastRow; k++) {
      // Check if the birthdate cell is not empty
      var birthdateCell = newRosterSheet.getRange(k, 3).getValue();
      if (birthdateCell) {
        // Calculate age based on birthdate
        var ageFormula = '=DATEDIF(C' + k + ', TODAY(), "Y")';
        newRosterSheet.getRange(k, 2).setFormula(ageFormula);
      }
    }

    // updateMaster()
    // hay que actualizar toda la informacion sobre el alumno
    // Update the student in the master sheet
    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Students');
    const lastRowStudents = studentsSheet.getLastRow();

    // Get all student IDs from column F (studentId column)
    var studentIds = studentsSheet.getRange(2, 6, lastRowStudents - 1).getValues().flat(); // Get all student IDs in column F

    // Find the index of the student ID
    var rowIndex = studentIds.indexOf(studentId);

    if (rowIndex !== -1) {
      // Get the current student row data to preserve birthdate and studentId
      var studentRowData = studentsSheet.getRange(rowIndex + 2, 1, 1, 6).getValues()[0]; // Get the entire row for the student

      // Update the corresponding row with the new name, age, site name, and spreadsheet id
      studentRowData[0] = newStudentName; // Update name (column A)
      studentRowData[1] = newStudentAge;  // Update age (column B)
      studentRowData[2] = newSiteName;    // Update site name (column C)
      studentRowData[3] = newSpreadsheetId; // Update spreadsheet id (column D)
      // Keep birthdate (column E) and studentId (column F) unchanged

      // Write back the updated data to the sheet
      studentsSheet.getRange(rowIndex + 2, 1, 1, 6).setValues([studentRowData]);
    }

    // Sort the entire sheet by student name (column A) after updating the row
    const studentData = studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).getValues();
    studentData.sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    });

    // Clear the existing data and write back the sorted data in the master sheet
    studentsSheet.getRange(2, 1, lastRowStudents - 1, 6).clearContent(); // Clear old data
    studentsSheet.getRange(2, 1, studentData.length, 6).setValues(studentData);

    return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Data added successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

}

function handleMealCount(data) {

  var values = data.values;
  var formattedData = values.data;
  var mealFormDate = values.date;
  var formattedTime1 = values.timeIn;
  var formattedTime2 = values.timeOut;
  var signData = values.signature;
  var siteName = values.site;

  var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  var allMealsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Meals');
  var sentMealsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sent Meals');

  var allMealsData = allMealsSheet.getDataRange().getValues();

  for (var i = 1; i < allMealsData.length; i++) {
    var currentSite = allMealsData[i][0];
    var currentDate = Utilities.formatDate(new Date(allMealsData[i][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var formattedDateForMaster = Utilities.formatDate(new Date(mealFormDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (currentSite === siteName && currentDate === formattedDateForMaster) {
      allMealsSheet.deleteRow(i + 1);
      break;
    }
  }

  sentMealsSheet.appendRow([siteName, formattedDateForMaster]);

  const lastRowMaster = masterSheet.getLastRow();

  var sites = masterSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues();
  var ids = masterSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues();
  var spreadsheetId;
  for (var i = 0; i < sites.length; i++) {
    if (sites[i][0] == siteName) {
      spreadsheetId = ids[i][0];
      break;
    }
  }

  var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);

  // validate if the form has already been sent
  var datesSheet = siteSpreadsheet.getSheetByName('Dates');
  const submittedMeals = datesSheet.getRange(2, 1, datesSheet.getLastRow() - 1, 1).getValues()

  const formattedSubmittedMeals = submittedMeals.map(dateRow => {
    const date = dateRow[0];
    const formatDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");
    return [formatDate]
  });

  for (let i = 0; i < formattedSubmittedMeals.length; i++) {
    const formattedMealFormDate = Utilities.formatDate(new Date(mealFormDate), Session.getScriptTimeZone(), "MM/dd/yyyy")
    if (formattedSubmittedMeals[i][0] == formattedMealFormDate) {
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Meal count already sent" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  var pastMealsSheet = siteSpreadsheet.getSheetByName('PastMeals');
  var formattedDateForPastMeals = Utilities.formatDate(new Date(mealFormDate), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var pastMealsData = pastMealsSheet.getRange(2, 1, pastMealsSheet.getLastRow() - 1, 1).getValues();

  for (var j = 0; j < pastMealsData.length; j++) {
    var pastMealDate = Utilities.formatDate(new Date(pastMealsData[j][0]), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (pastMealDate === formattedDateForPastMeals) {
      pastMealsSheet.deleteRow(j + 2);
      break;
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

  var dateCell1 = formSheet.getRange(4, 18, 1, 3).setValue(formattedDate)
  if (siteSpreadsheet.getName() === '2025/2026 TX BGC COOKE') {
    var dateCell2 = formSheet.getRange(161, 16, 3, 5).setValue(formattedDate);
  } else {
    var dateCell2 = formSheet.getRange(111, 16, 3, 5).setValue(formattedDate);
  }

  var lastRowDates = datesSheet.getLastRow();
  var nextRow = lastRowDates > 1 ? lastRowDates + 1 : 2;
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

  var numStudents = formattedData.length;
  var startRowE = 7;

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

  function setTimeValuesAlternating(sheet, timeIn, timeOut, presenceData) {
    for (var i = 0; i < presenceData.length; i++) {
      if (presenceData[i]) {
        var rowIndex = Math.floor(i / 2);
        var targetRow = 7 + rowIndex;

        if (i % 2 === 0) {
          sheet.getRange(targetRow, 5).setValue(timeIn);
          sheet.getRange(targetRow, 6).setValue(timeOut);
        } else {
          sheet.getRange(targetRow, 15).setValue(timeIn);
          sheet.getRange(targetRow, 16).setValue(timeOut);
        }
      }
    }
  }

  function setCheckboxValues(sheet, leftColumn, rightColumn, rowStart, leftData, rightData) {
    for (var i = 0; i < leftData.length; i++) {
      var cell = sheet.getRange(rowStart + i, leftColumn);
      cell.setValue(leftData[i]);
    }
    for (var i = 0; i < rightData.length; i++) {
      var cell = sheet.getRange(rowStart + i, rightColumn);
      cell.setValue(rightData[i]);
    }
  }

  setTimeValuesAlternating(formSheet, adjustedTime1, adjustedTime2, presenceArray);

  var { firstColumnData, secondColumnData } = splitArrayAlternating(presenceArray);
  setCheckboxValues(formSheet, 4, 14, 7, firstColumnData, secondColumnData);

  var { firstColumnData, secondColumnData } = splitArrayAlternating(breakfastArray);
  setCheckboxValues(formSheet, 7, 17, 7, firstColumnData, secondColumnData);

  var { firstColumnData, secondColumnData } = splitArrayAlternating(lunchArray);
  setCheckboxValues(formSheet, 8, 18, 7, firstColumnData, secondColumnData);

  var { firstColumnData, secondColumnData } = splitArrayAlternating(snackArray);
  setCheckboxValues(formSheet, 9, 19, 7, firstColumnData, secondColumnData);

  var { firstColumnData, secondColumnData } = splitArrayAlternating(supperArray);
  setCheckboxValues(formSheet, 10, 20, 7, firstColumnData, secondColumnData);

  var copiedSheet = createCopyAndHideRows(formSheet, formattedDate, formattedData.length, LAST_FORM_ROW);

  clearForm(formSheet, LAST_FORM_ROW);

  return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Meal count sent successfully" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------
// // esta funcion habria que eliminarla (ya fue deshabilitada en el front)
// function handleDates(data) {
//     var values = data.values;

//     // Get the individual values from the values object
//     var siteName = values.site;
//     var dateSelected = values.date;

//     var masterSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
//     const lastRowMaster = masterSheet.getLastRow();

//     var sites = masterSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues(); // Column A for site names
//     var ids = masterSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues(); // Column B for Spreadsheet IDs
//     var spreadsheetId;
//     for (var i = 0; i < sites.length; i++) {
//         if (sites[i][0] == siteName) {
//             spreadsheetId = ids[i][0];
//             break;
//         }
//     }

//     var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
//     var datesSheet = siteSpreadsheet.getSheetByName('Dates');

//     const isoDateString = dateSelected;
//     const dateObj = new Date(isoDateString);
//     // Format the date as "MM/DD/YYYY" (e.g., "05/12/2023")
//     const formattedDate = (dateObj.getMonth() + 1).toString().padStart(2, '0') + '/' + dateObj.getDate().toString().padStart(2, '0') + '/' + dateObj.getFullYear();

//     // Retrieve all dates from the 'Dates' sheet
//     const lastRowDates = datesSheet.getLastRow();
//     var datesRange = datesSheet.getRange(2, 1, lastRowDates - 1, 1); // Assuming dates start from row 2
//     var datesArray = datesRange.getValues();

//     // Convert each date from the 'Dates' sheet into "MM/DD/YYYY" format for comparison
//     var sheetDatesFormatted = datesArray.map(function (row) {
//         var sheetDate = new Date(row[0]);
//         return (sheetDate.getMonth() + 1).toString().padStart(2, '0') + '/' +
//             sheetDate.getDate().toString().padStart(2, '0') + '/' +
//             sheetDate.getFullYear();
//     });

//     // Check if formattedDate exists in the converted dates array
//     if (sheetDatesFormatted.indexOf(formattedDate) !== -1) {
//         // Date exists, return error message
//         return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Date Unavailable: Meal count already submitted" }))
//             .setMimeType(ContentService.MimeType.JSON);
//     }

//     // Date does not exist, return success message
//     return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Valid date" }))
//         .setMimeType(ContentService.MimeType.JSON);
// }
// ------------------

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