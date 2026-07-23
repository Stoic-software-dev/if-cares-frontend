function getAllMeals() {
  var sheetAllMeals = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("All Meals");
  var sheetSentMeals = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sent Meals");
  
  var allMealsData = sheetAllMeals.getDataRange().getValues();
  var sentMealsData = sheetSentMeals.getDataRange().getValues();
  
  var result = {};

  // First, process the "All Meals" tab for valid dates
  for (var i = 1; i < allMealsData.length; i++) {
    var siteName = allMealsData[i][0];  
    var date = new Date(allMealsData[i][1]);  
    var formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var brk = allMealsData[i][2];      
    var lunch = allMealsData[i][3];     
    var snk = allMealsData[i][4];       
    var sup = allMealsData[i][5];      
    
    // Initialize the siteName object if it doesn't exist
    if (!result[siteName]) {
      result[siteName] = { validDates: {}, excludedDates: [] };
    }
    
    // Add the meal data to validDates
    result[siteName].validDates[formattedDate] = {
      brk: brk,
      lunch: lunch,
      snk: snk,
      sup: sup
    };
  }
  
  // Now process the "Sent Meals" tab for excluded dates
  for (var j = 1; j < sentMealsData.length; j++) {
    var sentSiteName = sentMealsData[j][0];  // Site name
    var sentDate = new Date(sentMealsData[j][1]);  // Date in the "Sent Meals" tab
    var formattedSentDate = Utilities.formatDate(sentDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    // Initialize the siteName object if it doesn't exist, with an empty excludedDates array
    if (!result[sentSiteName]) {
      result[sentSiteName] = { validDates: {}, excludedDates: [] };
    }
    
    // Add the date to the excludedDates array
    result[sentSiteName].excludedDates.push(formattedSentDate);
  }

  console.log(result);
  
  return result;
}
