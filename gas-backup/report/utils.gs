/**
 * Get sites filtered by state from the 'sites' tab
 * @param {string} selectedState - The state to filter by (TX or OK)
 * @returns {Array} Array of site objects with siteName and spreadsheetId
 */
function getSitesByState(selectedState) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sitesSheet = spreadsheet.getSheetByName('sites');

    if (!sitesSheet) {
      throw new Error('Sheet "sites" not found');
    }

    const lastRow = sitesSheet.getLastRow();

    if (lastRow <= 1) {
      return [];
    }

    const dataRange = sitesSheet.getRange(2, 1, lastRow - 1, 3);
    const data = dataRange.getValues();

    const filteredSites = [];

    data.forEach((row, index) => {
      const siteName = row[0];
      const spreadsheetId = row[1];
      const state = row[2];

      if (state && state.toString().toUpperCase() === selectedState.toUpperCase()) {
        filteredSites.push({
          siteName: siteName,
          spreadsheetId: spreadsheetId,
          state: state
        });
      }
    });

    return filteredSites;

  } catch (error) {
    console.error('Error in getSitesByState:', error);
    throw new Error(`Failed to get sites: ${error.message}`);
  }
}

/**
 * Generate both first and second part report arrays by processing each included site
 * @param {Array} includedSites - Array of site objects with siteName and spreadsheetId
 * @param {Date} startDate - Start date of the report period
 * @param {Date} endDate - End date of the report period
 * @returns {Object} Object containing both firstPartReportArray and secondPartReportArray
 */
function generateReportArrays(includedSites, startDate, endDate) {
  const firstPartReportArray = [];
  const totalDaysInMonth = endDate.getDate();
  const secondPartReportArray = [];

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayData = {};
    dayData[day] = {
      breakfastCount: 0,
      lunchCount: 0,
      supperCount: 0,
      snackCount: 0
    };
    secondPartReportArray.push(dayData);
  }

  includedSites.forEach((site, index) => {
    try {
      const siteSpreadsheet = SpreadsheetApp.openById(site.spreadsheetId);
      const formSheet = siteSpreadsheet.getSheetByName('Form');

      if (!formSheet) {
        console.log('No Form sheet found for site: ' + site.siteName);
        return;
      }

      const siteId = formSheet.getRange('P4').getValue();

      let attendanceCount = 0;
      let breakfastCount = 0;
      let lunchCount = 0;
      let supperCount = 0;
      let snackCount = 0;

      const allSheets = siteSpreadsheet.getSheets();

      allSheets.forEach(sheet => {
        const sheetName = sheet.getName().trim();


        console.log('Raw sheet name: [' + sheetName + '] | length: ' + sheetName.length);

        if (isValidDateSheetName(sheetName)) {
          const sheetDate = parseDateFromSheetName(sheetName);
          console.log('Found date sheet: ' + sheetName + ' | parsed date: ' + sheetDate);

          if (sheetDate && sheetDate >= startDate && sheetDate <= endDate) {
            console.log('Processing sheet: ' + sheetName + ' for site: ' + site.siteName);
            try {
              // Determinar las filas de totales según el sitio y la fecha
              var totalsRow1, totalsRow2;
              var isCooke300 = siteSpreadsheet.getName() === '2025/2026 TX BGC COOKE'
                && sheetDate >= new Date(2026, 1, 3);

              if (isCooke300) {
                totalsRow1 = 158;
                totalsRow2 = 159;
              } else {
                totalsRow1 = 108;
                totalsRow2 = 109;
              }

              const attendance = sheet.getRange('M' + totalsRow2).getValue() || 0;
              const breakfast = sheet.getRange('C' + totalsRow1).getValue() || 0;
              const lunch = sheet.getRange('C' + totalsRow2).getValue() || 0;
              const snackH = sheet.getRange('H' + totalsRow1).getValue() || 0;
              const snackI = sheet.getRange('I' + totalsRow1).getValue() || 0;
              const supperH = sheet.getRange('H' + totalsRow2).getValue() || 0;
              const supperI = sheet.getRange('I' + totalsRow2).getValue() || 0;

              const totalSnack = Number(snackH) + Number(snackI);
              const totalSupper = Number(supperH) + Number(supperI);

              console.log('Sheet: ' + sheetName + ' | attendance: ' + attendance + ' | breakfast: ' + breakfast + ' | lunch: ' + lunch + ' | snack: ' + totalSnack + ' | supper: ' + totalSupper);

              attendanceCount += Number(attendance);
              breakfastCount += Number(breakfast);
              lunchCount += Number(lunch);
              snackCount += totalSnack;
              supperCount += totalSupper;

              const dayOfMonth = sheetDate.getDate();
              const dayIndex = dayOfMonth - 1;

              if (dayIndex >= 0 && dayIndex < secondPartReportArray.length) {
                secondPartReportArray[dayIndex][dayOfMonth].breakfastCount += Number(breakfast);
                secondPartReportArray[dayIndex][dayOfMonth].lunchCount += Number(lunch);
                secondPartReportArray[dayIndex][dayOfMonth].supperCount += totalSupper;
                secondPartReportArray[dayIndex][dayOfMonth].snackCount += totalSnack;
              }

            } catch (cellError) {
              console.error('Error reading sheet: ' + sheetName + ' in site: ' + site.siteName + ' - ' + cellError.message);
            }
          }
        }
      });

      const siteData = {};
      siteData[site.siteName] = {
        siteId: siteId,
        attendanceCount: attendanceCount,
        breakfastCount: breakfastCount,
        lunchCount: lunchCount,
        supperCount: supperCount,
        snackCount: snackCount
      };

      firstPartReportArray.push(siteData);

    } catch (siteError) {
      console.error('Error processing site: ' + site.siteName + ' - ' + siteError.message);
    }
  });

  return {
    firstPartReportArray: firstPartReportArray,
    secondPartReportArray: secondPartReportArray
  };
}

/**
 * Get foundation ID based on the selected state from the master spreadsheet
 * @param {string} selectedState - The selected state (TX or OK)
 * @returns {string} The foundation ID for the state
 */
function getFoundationIdByState(selectedState) {
  try {
    const masterSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sitesSheet = masterSpreadsheet.getSheetByName('Sites');

    if (!sitesSheet) {
      throw new Error('Sites sheet not found in master spreadsheet');
    }

    let foundationId;

    if (selectedState.toUpperCase() === 'OK') {
      foundationId = sitesSheet.getRange('G2').getValue();
    } else if (selectedState.toUpperCase() === 'TX') {
      foundationId = sitesSheet.getRange('G3').getValue();
    } else {
      throw new Error(`Unsupported state: ${selectedState}. Only TX and OK are supported.`);
    }

    if (!foundationId) {
      throw new Error(`Foundation ID not found for state ${selectedState}`);
    }

    return foundationId;

  } catch (error) {
    console.error('Error getting foundation ID:', error);
    throw new Error(`Failed to get foundation ID: ${error.message}`);
  }
}

/**
 * Save report data to the Reports tab in the master spreadsheet
 * @param {string} firstPartPdfUrl - URL of the first part PDF
 * @param {string} secondPartPdfUrl - URL of the second part PDF
 * @param {number} selectedMonth - Selected month (1-12)
 * @param {number} selectedYear - Selected year
 * @param {string} foundationId - Foundation ID
 * @param {Array} firstPartReportArray - First part report data
 * @param {Array} secondPartReportArray - Second part report data
 */
function saveReportToMasterSheet(firstPartPdfUrl, secondPartPdfUrl, selectedMonth, selectedYear, foundationId, selectedState, firstPartReportArray, secondPartReportArray) {
  try {
    // Get the active (master) spreadsheet
    const masterSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    // Get the Reports sheet
    const reportsSheet = masterSpreadsheet.getSheetByName('Reports');

    if (!reportsSheet) {
      throw new Error('Reports sheet not found in master spreadsheet');
    }

    // Find the next empty row (first row after headers)
    const lastRow = reportsSheet.getLastRow();
    const nextRow = lastRow + 1;

    // Convert arrays to JSON strings for storage
    const firstPartArrayString = JSON.stringify(firstPartReportArray);
    const secondPartArrayString = JSON.stringify(secondPartReportArray);

    // Set data in the appropriate columns
    // A: First part PDF URL
    reportsSheet.getRange(nextRow, 1).setValue(firstPartPdfUrl);

    // B: Second part PDF URL
    reportsSheet.getRange(nextRow, 2).setValue(secondPartPdfUrl);

    // C: Selected Month
    reportsSheet.getRange(nextRow, 3).setValue(selectedMonth);

    // D: Selected Year
    reportsSheet.getRange(nextRow, 4).setValue(selectedYear);

    // E: Foundation ID
    reportsSheet.getRange(nextRow, 5).setValue(foundationId);

    // F: First part report array (as JSON string)
    reportsSheet.getRange(nextRow, 6).setValue(firstPartArrayString);

    // G: Second part report array (as JSON string)
    reportsSheet.getRange(nextRow, 7).setValue(secondPartArrayString);

    // H: Selected State
    reportsSheet.getRange(nextRow, 8).setValue(selectedState);

    console.log(`Report data saved to Reports sheet at row ${nextRow}`);

  } catch (error) {
    console.error('Error saving report to master sheet:', error);
    throw new Error(`Failed to save report to master sheet: ${error.message}`);
  }
}

/**
 * Check if a sheet name represents a valid date
 * @param {string} sheetName - The name of the sheet to check
 * @returns {boolean} True if the sheet name is a valid date format
 */
function isValidDateSheetName(sheetName) {
  const datePattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  return datePattern.test(sheetName);
}

/**
 * Parse a date from a sheet name
 * @param {string} sheetName - The sheet name in MM/DD/YYYY format
 * @returns {Date|null} Date object or null if invalid
 */
function parseDateFromSheetName(sheetName) {
  try {
    const parts = sheetName.split('/');
    if (parts.length !== 3) return null;

    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);

    const date = new Date(year, month, day);

    if (date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day) {
      return date;
    }

    return null;
  } catch (error) {
    return null;
  }
}
