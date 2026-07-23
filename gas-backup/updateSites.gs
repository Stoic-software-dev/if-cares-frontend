var folderId = '1X6_ELCTG6YGduz-eBiVtCoO3wfxlaMZA'; 

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
    sheet.getRange('D2').setValue(fileCount); // Update the cell with the new count
    updateMaster(); 
    updateAllMeals();
  }
}