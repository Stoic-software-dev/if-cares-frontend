function deleteDateMeal(sheet, site, date) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var currentSite = data[i][0];  // Site name in column A
    var currentDate = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd'); // Date in column B
    if (currentSite === site && currentDate === date) {
      sheet.deleteRow(i + 1);  // Delete the row (i + 1 because data is 0-based, rows are 1-based)
      break;
    }
  }
}

