function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Create menu
  ui.createMenu('Menu')
    .addItem('Update Master Sheet', 'updateMaster')
    .addItem('Consolidated Form', 'openConsolidatedForm')
    .addToUi();
}

function openConsolidatedForm() {
  const html = HtmlService.createHtmlOutputFromFile('report/form')
    .setWidth(600)
    .setHeight(550);
  SpreadsheetApp.getUi().showModalDialog(html, 'Generate Consolidated Report');
}

function updateMaster() {
  const masterSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const studentsSheet = masterSpreadsheet.getSheetByName("Students");
  const sitesSheet = masterSpreadsheet.getSheetByName("Sites");
  const remindersSheet = masterSpreadsheet.getSheetByName("Reminders");

  const folder = DriveApp.getFolderById("1X6_ELCTG6YGduz-eBiVtCoO3wfxlaMZA");
  const spreadsheets = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

  let allData = [];
  let sitesData = [];
  let remindersData = remindersSheet.getRange(2, 1, remindersSheet.getLastRow() - 1, 3).getValues();

  // Read existing Sites data to preserve the state column
  let existingSitesData = [];
  if (sitesSheet.getLastRow() > 1) {
    existingSitesData = sitesSheet.getRange(2, 1, sitesSheet.getLastRow() - 1, 3).getValues();
  }
  
  // Create a map of existing site names to their states
  const existingStatesMap = new Map();
  existingSitesData.forEach(row => {
    existingStatesMap.set(row[0], row[2]); // site name -> state
  });

  let currentSiteNames = [];

  while (spreadsheets.hasNext()) {
    const spreadsheet = spreadsheets.next();
    const siteName = spreadsheet.getName();
    const spreadsheetId = spreadsheet.getId();
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const rosterSheet = ss.getSheetByName("Roster");

    if (!rosterSheet) continue;

    const data = rosterSheet.getDataRange().getValues();

    // Store the current site names
    currentSiteNames.push(siteName);

    // checkeamos que haya al menos un alumno
    if (data.length > 1) {
      // allData array
      for (let i = 1; i < data.length; i++) {
        const name = data[i][0];
        const age = data[i][1];
        const birthdate = data[i][2]; // Fetching the birthdate from column C
        const studentId = data[i][3]; // Fetching the student ID from column D

        // Check if the name is not null or empty
        if (name !== null && name.trim() !== '') {
          allData.push([name, age, siteName, spreadsheetId, birthdate, studentId]);
        }
      }
    }

    // siteData array - preserve existing state or use empty string for new sites
    const existingState = existingStatesMap.get(siteName) || '';
    sitesData.push([siteName, spreadsheetId, existingState]);

    // Check if the site already exists in Reminders, if not, append it with empty dates
    let siteExistsInReminders = remindersData.some(row => row[0] === siteName);
    if (!siteExistsInReminders) {
      remindersData.push([siteName, '', '']);
    }
  }

  // sacamos los sitios de reminders que ya no estan activos
  remindersData = remindersData.filter(row => currentSiteNames.includes(row[0]));

  // Sort data by name
  allData.sort((a, b) => a[0].localeCompare(b[0]));

  // Write the data to master
  studentsSheet.getRange(2, 1, studentsSheet.getLastRow(), 6).clearContent(); // 6 columns
  studentsSheet.getRange(2, 1, allData.length, 6).setValues(allData); // 6 columns

  // Sort the sitesData array alphabetically based on the site name
  sitesData.sort((a, b) => a[0].localeCompare(b[0]));

  // Clear existing data in the sitesSheet (now 3 columns including state)
  sitesSheet.getRange(2, 1, sitesSheet.getLastRow(), 3).clearContent();
  sitesSheet.getRange(2, 1, sitesData.length, 3).setValues(sitesData);

  // Sort the remindersData array alphabetically by site name
  remindersData.sort((a, b) => a[0].localeCompare(b[0]));

  // Write sorted reminders data back to the Reminders sheet
  remindersSheet.getRange(2, 1, remindersSheet.getLastRow(), 3).clearContent();
  remindersSheet.getRange(2, 1, remindersData.length, 3).setValues(remindersData);
}

function showDayPickerModal() {
  const template = HtmlService.createTemplateFromFile("views/modal/dayPicker")

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName("Sites")
  const sites = sheet.getRange("A2:B").getValues().filter( row => row[0] != "")
  
  template.sites = sites

  const html = template
    .evaluate()
    .setWidth(400)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, "Holidays picker")
}

function deleteHolidays(isForAllSheets, sheetsId, selectedDay, dateEnd ) {
  let ids = sheetsId
  const dateRange = getTimeRange(startDate=new Date(selectedDay), new Date(dateEnd))

  if (isForAllSheets) {
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const sheet = ss.getSheetByName("Sites")
    ids = sheet.getRange("B2:B").getValues().filter( row => row[0] != "").map( row => row[0])
  }

  ids.forEach( id => {
    const ss = SpreadsheetApp.openById(id)
    const sheet = ss.getSheetByName('PastMeals')
    let data = sheet.getDataRange().getValues()
    data = rangeToObjects(data)
    data = data.filter( row => dateRange.includes(row.date.getTime()) )
    console.log("searching sheet: ", id);
    data.reverse().forEach( row => {
      console.log("deleting row: ", row.rowNum);
      sheet.deleteRow(row.rowNum)
    })
  })

  if (isForAllSheets) { updateAllMeals() }
  else { ids.forEach(id => updateOneSite(id)) }
  
  return ids
}

function getTimeRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timeArray = [];
  let currentDate = new Date(start);
  
  if (start > end) {
    timeArray.push(currentDate.getTime());
    return timeArray
  }
  
  
  while (currentDate <= end) {
    timeArray.push(currentDate.getTime());
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return timeArray;
}

function updateOneSite(siteId) {
  const masterSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sitesSheet = masterSpreadsheet.getSheetByName('Sites');
  const allMealsSheet = masterSpreadsheet.getSheetByName('All Meals');
  
  const sitesRange = sitesSheet.getDataRange()
  const allMealsRange = allMealsSheet.getDataRange()
  
  const sitesValues = rangeToObjects(sitesRange.getValues())
  const allMealsValues = rangeToObjects(allMealsRange.getValues())

  const site = sitesValues.find( s => s.spreadsheetId === siteId)

  if (site) {
    const allMealsRowsToDelete = allMealsValues.filter( row => row.siteName == site.siteName)

    const siteSpreadsheet = SpreadsheetApp.openById(siteId);
    const pastMealsSheet = siteSpreadsheet.getSheetByName('PastMeals');
    
    if (!pastMealsSheet) return;
    
    const lastRow = pastMealsSheet.getLastRow();
    if (lastRow < 2) return; 

    let pastMealsData = pastMealsSheet.getRange(2, 1, lastRow - 1, 5).getValues(); 

    pastMealsData = pastMealsData.map( row => {
      row.unshift(site.siteName)
      return row
    })
    
    allMealsSheet.getRange(allMealsSheet.getLastRow()+1, 1, pastMealsData.length, pastMealsData[0].length).setValues(pastMealsData)

    allMealsRowsToDelete.reverse().forEach( toDelete => allMealsSheet.deleteRow(toDelete.rowNum))
    
  }
  SpreadsheetApp.flush()
}
