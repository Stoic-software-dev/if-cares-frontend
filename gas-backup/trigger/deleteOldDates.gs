function deleteOldDates() {
  var today = new Date();
  var sentMealsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sent Meals');
  
  var lastRow = sentMealsSheet.getLastRow();
  
  if (lastRow < 2) {
    return;
  }
  
  var dateRange = sentMealsSheet.getRange(2, 2, lastRow - 1, 1).getValues();

  for (var i = dateRange.length - 1; i >= 0; i--) {
    var dateCell = dateRange[i][0];
    var dateFromSheet = new Date(dateCell);
    
    var diffInTime = today.getTime() - dateFromSheet.getTime();
    var diffInDays = diffInTime / (1000 * 3600 * 24);
    
    if (diffInDays > 8) {
      sentMealsSheet.deleteRow(i + 2);
    }
  }
}

