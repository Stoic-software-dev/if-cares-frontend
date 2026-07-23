// Function to create a copy of the form sheet with the date as its name
function createCopy(formSheet, formattedDate) {
  // Step 1: Copy the sheet
  var copiedSheet = formSheet.copyTo(formSheet.getParent()).setName(formattedDate);

  // Step 2: Clear specific contents of the copied sheet
  // clear students
  copiedSheet.getRange('B7:B106').clearContent();
  copiedSheet.getRange('L7:L106').clearContent();

  // clear age
  copiedSheet.getRange('C7:C106').clearContent();
  copiedSheet.getRange('M7:M106').clearContent();

  // // Clear date
  // copiedSheet.getRange(4, 18, 1, 3).clearContent();
  // copiedSheet.getRange(61, 16, 3, 5).clearContent();

  // // Clear times (both timeIn and timeOut for both columns)
  // copiedSheet.getRange(7, 5, 50, 2).clearContent();  // E and F columns
  // copiedSheet.getRange(7, 15, 50, 2).clearContent();  // O and P columns

  // // Clear checkboxes (Presence, Breakfast, Lunch, Snack, Supper for both columns)
  // copiedSheet.getRange(7, 4, 50, 7).clearContent();  // Columns D to J
  // copiedSheet.getRange(7, 14, 50, 7).clearContent();  // Columns N to T

  // Step 3: Copy values only from the specific ranges of the original sheet
  function copyValuesToCopiedSheet(originalRange, copiedRange) {
    var originalValues = originalRange.getValues();
    copiedRange.setValues(originalValues);
  }

  // copy student values instead of formulas
  copyValuesToCopiedSheet(formSheet.getRange('B7:B106'), copiedSheet.getRange('B7:B106'));
  copyValuesToCopiedSheet(formSheet.getRange('L7:L106'), copiedSheet.getRange('L7:L106'));

  copyValuesToCopiedSheet(formSheet.getRange('C7:C106'), copiedSheet.getRange('C7:C106'));
  copyValuesToCopiedSheet(formSheet.getRange('M7:M106'), copiedSheet.getRange('M7:M106'));

  // // Apply this function to each range you want to copy
  // copyValuesToCopiedSheet(formSheet.getRange(4, 18, 1, 3), copiedSheet.getRange(4, 18, 1, 3));
  // copyValuesToCopiedSheet(formSheet.getRange(61, 16, 3, 5), copiedSheet.getRange(61, 16, 3, 5));
  // copyValuesToCopiedSheet(formSheet.getRange(7, 5, 50, 2), copiedSheet.getRange(7, 5, 50, 2));
  // copyValuesToCopiedSheet(formSheet.getRange(7, 15, 50, 2), copiedSheet.getRange(7, 15, 50, 2));
  // copyValuesToCopiedSheet(formSheet.getRange(7, 4, 50, 7), copiedSheet.getRange(7, 4, 50, 7));
  // copyValuesToCopiedSheet(formSheet.getRange(7, 14, 50, 7), copiedSheet.getRange(7, 14, 50, 7));

}



// Function to clear all recently inserted values
function clearForm(formSheet, lastFormRow) {
  var rowCount = lastFormRow ? (lastFormRow - 7 + 1) : 100;
  var signRow = (lastFormRow && lastFormRow > 106) ? 161 : 111;

  formSheet.getRange(4, 18, 1, 3).clearContent();
  formSheet.getRange(signRow, 16, 3, 5).clearContent();
  formSheet.getRange(7, 5, rowCount, 2).clearContent();
  formSheet.getRange(7, 15, rowCount, 2).clearContent();
  formSheet.getRange(7, 4, rowCount, 7).clearContent();
  formSheet.getRange(7, 14, rowCount, 7).clearContent();
  formSheet.getRange(signRow, 10, 3, 5).clearContent();
}

function rangeToObjects(range) {

  var headers = range[0];
  var values = range;
  var rowObjects = [];

  for (var i = 1; i < values.length; ++i) {
    var row = new Object();
    row.rowNum = i + 1;
    for (var j in headers) {
      row[camelString(headers[j])] = values[i][j];
    }
    rowObjects.push(row);
  }

  return rowObjects;

}

function camelString(header) {

  var key = "";

  var upperCase = false;

  for (var i = 0; i < header.length; ++i) {

    var letter = header[i];

    if (letter == " " && key.length > 0) {

      upperCase = true;

      continue;

    }

    if (!isAlnum_(letter)) {

      continue;

    }

    if (key.length == 0 && isDigit_(letter)) {

      continue; // first character must be a letter

    }

    if (upperCase) {

      upperCase = false;

      key += letter.toUpperCase();

    } else {

      key += letter.toLowerCase();

    }

  }

  return key;

}

function isCellEmpty_(cellData) {

  return typeof (cellData) == "string" && cellData == "";

}

function isAlnum_(char) {

  return char >= 'A' && char <= 'Z' ||

    char >= 'a' && char <= 'z' ||

    isDigit_(char);

}

function isDigit_(char) {

  return char >= '0' && char <= '9';

}

/**
 * Extract PDF ID from Google Drive URL
 * @param {string} url - Google Drive URL
 * @returns {string|null} - Extracted ID or null if not found
 */
function extractPdfIdFromDriveUrl(url) {
  try {
    // Handle different Google Drive URL formats
    // Format 1: https://drive.google.com/file/d/[ID]/view
    // Format 2: https://drive.google.com/file/d/[ID]/view?usp=drivesdk
    const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting PDF ID from URL:', error);
    return null;
  }
}
