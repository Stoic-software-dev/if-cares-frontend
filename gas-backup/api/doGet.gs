function doGet(e) {
  if (e.parameter.type === "students") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Students");
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const jsonData = data.map(row => ({
      name: row[0],
      age: row[1],
      site: row[2],
      spreadsheetId: row[3],
      birthdate: row[4],
      id: row[5]
    }));

    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (e.parameter.type === "updateMaster") {
    updateMaster()
  }

  else if (e.parameter.type === "sites") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sites");
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const jsonData = data.map(row => ({
      name: row[0],
      spreadsheetId: row[1],
    }));

    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (e.parameter.type === "siteData") {
    const siteName = e.parameter.site;

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

    // Open the specific spreadsheet using the spreadsheetId
    const siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // Access the "Form" sheet in the opened spreadsheet
    const formSheet = siteSpreadsheet.getSheetByName("Form");

    // Get the data from the 4th row in the "Form" sheet
    const data = formSheet.getRange(4, 1, 1, formSheet.getLastColumn()).getValues()[0];

    // Format the data as needed and return it
    const formattedData = data.filter(value => value !== '');

    // Access the "Dates" sheet
    const datesSheet = siteSpreadsheet.getSheetByName("Dates");
    const lastRowDates = datesSheet.getLastRow();

    // Get the last time in and last time out from the last row
    // Assuming last time in is in column X (24) and last time out is in column Y (25)
    const lastTimeIn = datesSheet.getRange(lastRowDates, 2).getValue();
    const lastTimeOut = datesSheet.getRange(lastRowDates, 3).getValue();

    function prepareTimeForDatePicker(timeStr) {
      // Choose a default date
      const defaultDate = '1970-01-01'; // or any other date

      // Combine the default date with the time
      const dateTimeStr = `${defaultDate}T${timeStr}:00`;

      return dateTimeStr;
    }

    const formattedTimeIn = prepareTimeForDatePicker(lastTimeIn)
    const formattedTimeOut = prepareTimeForDatePicker(lastTimeOut)

    const jsonData = {
      name: formattedData[0] || null,
      ceId: formattedData[1] || null,
      siteName: formattedData[2] || null,
      siteNumber: formattedData[3] || null,
      date: formattedData[4] || null,
      lastTimeIn: formattedTimeIn || null,
      lastTimeOut: formattedTimeOut || null
    };

    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);

  }
  else if (e.parameter.type === "studentData") {
    const siteName = e.parameter.site;
    console.log(siteName)

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

    // Open the specific spreadsheet using the spreadsheetId
    const siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);

    // Access the "Roster" sheet in the opened spreadsheet
    const rosterSheet = siteSpreadsheet.getSheetByName("Roster");
    const lastRow = rosterSheet.getLastRow();
    const lastCol = rosterSheet.getLastColumn();
    const data = rosterSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const jsonData = data.map((row, i) => ({
      name: row[0],
      age: row[1],
      id: row[3],
      number: i + 1
    }));

    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);

  }
  // else if (e.parameter.type === "mealCountDays") {
  //   var jsonData = collectSiteDays()
  //   return ContentService
  //     .createTextOutput(JSON.stringify(jsonData))
  //     .setMimeType(ContentService.MimeType.JSON);
  // }
  // else if (e.parameter.type === "homeDates") {
  //   var jsonData = collectHomeDates()
  //   return ContentService
  //     .createTextOutput(JSON.stringify(jsonData))
  //     .setMimeType(ContentService.MimeType.JSON);
  // }
  else if (e.parameter.type === "allMeals") {
    var jsonData = getAllMeals()
    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (e.parameter.type === "request") {
    var requestType = e.parameter.requestType;
    var amount = e.parameter.amount;
    var time = e.parameter.time;
    var selectedSite = e.parameter.selectedSite;
    var requestDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MM/dd/yyyy");
    var todaysDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM dd, yyyy");

    var sitesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
    const lastRowMaster = sitesSheet.getLastRow();

    var sites = sitesSheet.getRange(2, 1, lastRowMaster - 1, 1).getValues();
    var ids = sitesSheet.getRange(2, 2, lastRowMaster - 1, 1).getValues();
    var spreadsheetId;
    for (var i = 0; i < sites.length; i++) {
      if (sites[i][0] == selectedSite) {
        spreadsheetId = ids[i][0];
        break;
      }
    }

    const siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const requestsSheet = siteSpreadsheet.getSheetByName("Requests");
    const lastRowRequests = requestsSheet.getLastRow();

    requestsSheet.getRange(lastRowRequests + 1, 1).setValue(requestDate);

    if (['Sporks', 'Meal Increase', 'Meal Decrease', 'Condiments', 'Special Meals', 'Dietary Restrictions', 'Amount of milk on hand'].includes(requestType)) {
      requestsSheet.getRange(lastRowRequests + 1, 2).setValue(requestType);
      requestsSheet.getRange(lastRowRequests + 1, 3).setValue(amount);

      var body = "The <strong>" + selectedSite + " Site</strong> has received a new request on <strong>" + todaysDate + "</strong><br><br>" +
        "<u>Details of the request:</u><br>" +
        "<strong>Type:</strong> " + requestType + "<br>" +
        "<strong>Value:</strong> " + amount;

    } else {
      requestsSheet.getRange(lastRowRequests + 1, 2).setValue(requestType);
      requestsSheet.getRange(lastRowRequests + 1, 3).setValue(time);
      var body = "The <strong>" + selectedSite + " Site</strong> has received a new request on <strong>" + todaysDate + "</strong><br><br>" +
        "<u>Details of the request:</u><br>" +
        "<strong>Type:</strong> " + requestType + "<br>" +
        "<strong>Value:</strong> " + time;

    }

    MailApp.sendEmail({
      to: "kenya@ifcares.org",
      cc: 'marisela@ifcares.org',
      subject: "New Request Received",
      htmlBody: body
    });

    return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "Request added successfully" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // else if (e.parameter.type === "downloadPdf") {
  //   var folderId = '1wagBWXeOi_8U5N7zvqUGhdv6AjH1yyki';
  //   var folder = DriveApp.getFolderById(folderId);
  //   var files = folder.getFiles();

  //   var latestFile;
  //   var latestDate = new Date(0);

  //   while (files.hasNext()) {
  //     var file = files.next();
  //     if (file.getDateCreated() > latestDate) {
  //       latestFile = file;
  //       latestDate = file.getDateCreated();
  //     }
  //   }

  //   if (latestFile) {
  //     var blob = latestFile.getBlob();
  //     var data = {
  //       "fileName": latestFile.getName(),
  //       "mimeType": blob.getContentType(),
  //       "bytes": Utilities.base64Encode(blob.getBytes())
  //     };

  //     return ContentService.createTextOutput(JSON.stringify(data))
  //       .setMimeType(ContentService.MimeType.JSON);
  //   }
  // }
  else if (e.parameter.type === "listFiles") {
    var folderId = '1wagBWXeOi_8U5N7zvqUGhdv6AjH1yyki';
    var folder = DriveApp.getFolderById(folderId);
    var files = folder.getFiles();

    var fileList = [];
    while (files.hasNext()) {
      var file = files.next();
      fileList.push({
        "id": file.getId(),
        "name": file.getName(),
        "mimeType": file.getMimeType(),
        "createdDate": file.getDateCreated().toISOString()
      });
    }

    return ContentService.createTextOutput(JSON.stringify(fileList))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (e.parameter.type === "downloadSelectedPdf" && e.parameter.fileId) {
    var fileId = e.parameter.fileId;
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var data = {
      "fileName": file.getName(),
      "mimeType": blob.getContentType(),
      "bytes": Utilities.base64Encode(blob.getBytes())
    };

    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (e.parameter.type === "deleteDateMeal") {
    var site = e.parameter.site;
    var date = e.parameter.date;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Meals');
    deleteDateMeal(sheet, site, date);
  }
  else if (e.parameter.type === "updateDateMeal") {
    var site = e.parameter.site;
    var date = e.parameter.date;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Meals');
    var brk = e.parameter.brk;
    var lunch = e.parameter.lunch;
    var snk = e.parameter.snk;
    var sup = e.parameter.sup;
    updateDateMeal(sheet, site, date, brk, lunch, snk, sup)
  }
  else if (e.parameter.type === "addDateMeal") {
    var site = e.parameter.site;
    var date = e.parameter.date;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('All Meals');
    var brk = e.parameter.brk;
    var lunch = e.parameter.lunch;
    var snk = e.parameter.snk;
    var sup = e.parameter.sup;
    sheet.appendRow([site, date, brk, lunch, snk, sup]);
  }
  else if (e.parameter.type === "refreshUser") {
    var email = e.parameter.email;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (data[i][3] == email) {
        return ContentService.createTextOutput(JSON.stringify({
          result: 'success',
          data: { role: data[i][5], assignedSite: data[i][6] }
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'error', message: 'User not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  if (e.parameter.type === "getConsolidatedReport") {
    try {
      // Get the report ID from parameters
      const reportId = e.parameter.reportId;

      if (!reportId) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Report ID is required'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Open the Reports tab
      const reportsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reports');

      if (!reportsSheet) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'Reports sheet not found'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Get the last row with data
      const lastRow = reportsSheet.getLastRow();

      if (lastRow < 2) {
        return ContentService
          .createTextOutput(JSON.stringify({
            success: false,
            error: 'No reports found'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Loop through column A from A2 to the last row to find the report
      for (let row = 2; row <= lastRow; row++) {
        const firstPartPdfUrl = reportsSheet.getRange(row, 1).getValue(); // Column A

        if (firstPartPdfUrl) {
          // Extract ID from the PDF URL
          const extractedId = extractPdfIdFromDriveUrl(firstPartPdfUrl);

          // Check if this is the report we're looking for
          if (extractedId === reportId) {
            // Found the report! Get both PDF URLs
            const secondPartPdfUrl = reportsSheet.getRange(row, 2).getValue(); // Column B

            return ContentService
              .createTextOutput(JSON.stringify({
                success: true,
                data: {
                  firstPartPdfUrl: firstPartPdfUrl,
                  secondPartPdfUrl: secondPartPdfUrl,
                  reportId: reportId
                }
              }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      // Report not found
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Report not found'
        }))
        .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
      console.error('Error in doGet getConsolidatedReport:', error);
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Internal server error: ' + error.message
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }


  else {
    return ContentService
      .createTextOutput('Invalid request')
      .setMimeType(ContentService.MimeType.TEXT);
  }
}



