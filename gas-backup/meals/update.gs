function updateDateMeal(sheet, site, date, brk, lunch, snk, sup) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var currentSite = data[i][0];  // Site name in column A
    var currentDate = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), 'yyyy-MM-dd'); // Date in column B
    if (currentSite === site && currentDate === date) {
      sheet.getRange(i + 1, 3).setValue(brk);   // Column C for breakfast
      sheet.getRange(i + 1, 4).setValue(lunch); // Column D for lunch
      sheet.getRange(i + 1, 5).setValue(snk);   // Column E for snack
      sheet.getRange(i + 1, 6).setValue(sup);   // Column F for supper
      break;
    }
  }
}

