function sendReminderEmail() {
  var remindersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reminders');
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all the data from the "Reminders" tab (A2:C)
  var remindersData = remindersSheet.getRange(2, 1, remindersSheet.getLastRow() - 1, 3).getValues();

  // Create an array to store sites that are in range
  var sitesInRange = [];

  // Loop through the reminders data and check if today is in the range for each site
  remindersData.forEach(function (row) {
    var siteName = row[0];
    var startDate = row[1];
    var endDate = row[2];

    if (startDate && endDate) {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);

      if (today >= startDate && today <= endDate) {
        sitesInRange.push(siteName);
      }
    }
  });

  console.log(sitesInRange)

  // If there are no sites in range, exit the function
  if (sitesInRange.length === 0) {
    Logger.log('No sites are within the reminder date range.');
    return;
  }

  // Calculate the date one day before today
  var oneDayBefore = new Date();
  oneDayBefore.setDate(today.getDate() - 1); // 1 days before
  oneDayBefore.setHours(0, 0, 0, 0);

  // If three days before is a weekend, exit the function
  var dayOfWeek = oneDayBefore.getDay();
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    Logger.log('One day before is a weekend. Returning.');
    return;
  }

  var formattedOneDayBefore = Utilities.formatDate(oneDayBefore, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var sitesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sites');
  var sitesData = sitesSheet.getRange(2, 1, sitesSheet.getLastRow() - 1, 2).getValues();

  // Loop through each site
  sitesData.forEach(function (siteRow) {
    var siteName = siteRow[0];
    var spreadsheetId = siteRow[1];

    console.log(siteName)

    // Check if the site is in the list of sites within range
    if (!sitesInRange.includes(siteName)) {
      Logger.log('Site ' + siteName + ' is not in range. Skipping.');
      return;
    }

    try {
      var siteSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
      var pastMealsSheet = siteSpreadsheet.getSheetByName('PastMeals');

      if (pastMealsSheet) {
        var pastMealDates = pastMealsSheet.getRange('A2:A' + pastMealsSheet.getLastRow()).getValues().flat();

        var pastMealDateStrings = pastMealDates.map(function (date) {
          return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        });

        if (pastMealDateStrings.includes(formattedOneDayBefore)) {
          Logger.log('Date ' + formattedOneDayBefore + ' found for site: ' + siteName);

          sendEmailToSiteUsers(siteName, formattedOneDayBefore);
        } else {
          Logger.log('Date ' + formattedOneDayBefore + ' not found for site: ' + siteName);
        }
      } else {
        Logger.log('PastMeals sheet not found for site: ' + siteName);
      }

    } catch (e) {
      Logger.log('Error opening spreadsheet for site: ' + siteName + ' - ' + e.message);
      // Continue to the next site
    }
  });
}

// Function to send emails to all users associated with a site
function sendEmailToSiteUsers(siteName, formattedOneDayBefore) {
  var usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');

  var usersData = usersSheet.getRange(2, 2, usersSheet.getLastRow() - 1, 6).getValues();

  // Filter users for the current site
  var siteUsers = usersData.filter(function (userRow) {
    var assigned = String(userRow[5]).split(',').map(function (s) { return s.trim(); });
    return assigned.includes(siteName) || assigned.includes('all');
  });

  // Send email to each user associated with the site
  if (siteUsers.length > 0) {
    siteUsers.forEach(function (u) {
      var name = u[0];
      var surname = u[1];
      var email = u[2];

      var subject = 'Daily Meal Count and Attendance Overdue';
      var body = 'Hello ' + name + ' ' + surname + '. The <b>' + formattedOneDayBefore + '</b> Daily Meal Count and Attendance for ' + siteName + ' is <b>overdue</b>.<br><br>' +
        'Please remember 3 consecutive days missing will result in pause of meal delivery. Head over to the App linked below to Submit the missing days now.<br><br>' +
        'https://ifcares.vercel.app/';

      MailApp.sendEmail({
        to: email,
        cc: 'marisela@ifcares.org',
        subject: subject,
        htmlBody: body
      });
    });
  } else {
    Logger.log('No users found for site: ' + siteName);
  }
}

// Function that create the trigger with the button

function createTriggerForMailReminder() {
  // First, delete any existing triggers for this function to avoid duplicates
  deleteTriggerIfExists('sendReminderEmail');

  // Create a new time-based trigger that runs daily between 8 AM and 9 AM
  ScriptApp.newTrigger('sendReminderEmail')
    .timeBased()
    .everyDays(1) // Run every day
    .atHour(8)    // Runs at 8 AM
    .create();

  Logger.log('Trigger created to run sendReminderEmail daily between 8 AM and 9 AM.');
}

// Helper function to delete existing trigger for the function
function deleteTriggerIfExists(functionName) {
  var triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}