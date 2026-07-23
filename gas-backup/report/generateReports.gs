/**
 * Generate the first part of the consolidated report as PDF
 * @param {string} foundationId - The foundation ID
 * @param {number} selectedMonth - Selected month (1-12)
 * @param {number} selectedYear - Selected year
 * @param {Array} firstPartReportArray - Array of site data objects
 * @param {string} signatureImage - Base64 signature image (optional, default null)
 * @param {string} authorizedRepresentative - Name of authorized representative (optional, default null)
 * @param {string} title - Report title (optional, default null)
 * @returns {string} URL of the generated PDF
 */
function generateFirstPartReportPDF(foundationId, selectedMonth, selectedYear, selectedState, firstPartReportArray, signatureImage = null, authorizedRepresentative = null, title = null) {
  try {
    // Template spreadsheet ID
    const templateId = '1sKx2bMMGpjr68sJXYUBz6Lq8b55DQAtwTKNq2mecaJ0';
    
    // Duplicate the template spreadsheet
    const templateFile = DriveApp.getFileById(templateId);
    const duplicatedFile = templateFile.makeCopy(`Consolidated Report Part 1 - ${selectedMonth}/${selectedYear} - ${selectedState}`);
    const duplicatedSpreadsheet = SpreadsheetApp.openById(duplicatedFile.getId());
    
    // Get Sheet1
    const sheet = duplicatedSpreadsheet.getSheetByName('Sheet1');
    if (!sheet) {
      throw new Error('Sheet1 not found in template');
    }
    
    // Set foundation ID in P5:Q5
    sheet.getRange('P5:Q5').merge().setValue(foundationId);
    
    // Set month and year in R5:T5
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthYear = `${monthNames[selectedMonth - 1]} ${selectedYear}`;
    sheet.getRange('R5:T5').merge().setValue(monthYear);
    
    // Sort sites alphabetically by site name
    const sortedSites = firstPartReportArray.sort((a, b) => {
      const siteNameA = Object.keys(a)[0].toLowerCase();
      const siteNameB = Object.keys(b)[0].toLowerCase();
      return siteNameA.localeCompare(siteNameB);
    });
    
    // Start inserting data from row 9
    let currentRow = 9;
    
    sortedSites.forEach((siteObj, index) => {
      const siteName = Object.keys(siteObj)[0];
      const siteData = siteObj[siteName];
      
      // If this is not the first site, insert a new row
      if (index > 0) {
        sheet.insertRowBefore(currentRow);
      }
      
      // Set site data in the current row
      // B9:I9 → Site name
      sheet.getRange(currentRow, 2, 1, 8).merge().setValue(siteName);
      
      // J9:K9 → Site ID
      sheet.getRange(currentRow, 10, 1, 2).merge().setValue(siteData.siteId);
      
      // L9 → Attendance count
      sheet.getRange(currentRow, 12).setValue(siteData.attendanceCount);
      
      // M9 → Breakfast count
      sheet.getRange(currentRow, 13).setValue(siteData.breakfastCount);
      
      // N9:O9 → Lunch count
      sheet.getRange(currentRow, 14, 1, 2).merge().setValue(siteData.lunchCount);
      
      // P9 → Supper count
      sheet.getRange(currentRow, 16).setValue(siteData.supperCount);
      
      // Q9:R9 → Snack count
      sheet.getRange(currentRow, 17, 1, 2).merge().setValue(siteData.snackCount);
      
      // Apply borders to all cells in this row (B to T) - but skip row 9
      if (currentRow !== 9) {
        // Merge S:T columns first
        sheet.getRange(currentRow, 19, 1, 2).merge(); // S:T
        
        const rowRange = sheet.getRange(currentRow, 2, 1, 19); // B to T (columns 2 to 20)
        rowRange.setBorder(true, true, true, true, true, true);
      }
      
      // Move to next row for next site
      currentRow++;
    });
    
    // Add totals row after all sites
    if (sortedSites.length > 0) {
      // Insert a new row for totals
      sheet.insertRowBefore(currentRow);
      
      // Merge B to K columns for "Totals:" label
      const totalsLabelRange = sheet.getRange(currentRow, 2, 1, 10); // B to K
      totalsLabelRange.merge();
      totalsLabelRange.setValue('Totals:');
      totalsLabelRange.setFontWeight('bold');
      totalsLabelRange.setHorizontalAlignment('right');
      
      // Calculate the range for SUM formulas (from row 9 to the row above totals)
      const dataStartRow = 9;
      const dataEndRow = currentRow - 1;
      
      // L column → Attendance total
      sheet.getRange(currentRow, 12).setFormula(`=SUM(L${dataStartRow}:L${dataEndRow})`);
      
      // M column → Breakfast total
      sheet.getRange(currentRow, 13).setFormula(`=SUM(M${dataStartRow}:M${dataEndRow})`);
      
      // N:O columns → Lunch total (merged)
      const lunchTotalRange = sheet.getRange(currentRow, 14, 1, 2);
      lunchTotalRange.merge();
      lunchTotalRange.setFormula(`=SUM(N${dataStartRow}:O${dataEndRow})`);
      
      // P column → Supper total
      sheet.getRange(currentRow, 16).setFormula(`=SUM(P${dataStartRow}:P${dataEndRow})`);
      
      // Q:R columns → Snack total (merged)
      const snackTotalRange = sheet.getRange(currentRow, 17, 1, 2);
      snackTotalRange.merge();
      snackTotalRange.setFormula(`=SUM(Q${dataStartRow}:R${dataEndRow})`);
      
      // Merge S:T columns before applying borders
      sheet.getRange(currentRow, 19, 1, 2).merge(); // S:T
      
      // Apply borders to totals row (B to T)
      const totalsRowRange = sheet.getRange(currentRow, 2, 1, 19); // B to T (columns 2 to 20)
      totalsRowRange.setBorder(true, true, true, true, true, true);
    }
    
    // If signature data is provided, add signature information
    if (signatureImage || authorizedRepresentative || title) {
      try {
        // Calculate the correct row for signature data (originally row 12, but adjusted for inserted rows)
        // We started with sites at row 9, inserted (sortedSites.length - 1) additional site rows, plus 1 totals row
        const numberOfInsertedRows = (sortedSites.length - 1) + 1; // Additional site rows + totals row
        const signatureRowNumber = 12 + numberOfInsertedRows;
        
        // Insert signature image in C12:D12 (adjusted row)
        if (signatureImage) {
          // Convert base64 to blob
          const base64Data = signatureImage.split(',')[1]; // Remove data:image/png;base64, part
          const binaryString = Utilities.base64Decode(base64Data);
          const imageBlob = Utilities.newBlob(binaryString, 'image/png', 'signature.png');
          
          // Merge cells C:D first, then insert image
          sheet.getRange(signatureRowNumber, 3, 1, 2).merge(); // C:D
          const insertedImage = sheet.insertImage(imageBlob, 3, signatureRowNumber); // Column C at calculated row
          
          // Resize the image to fit within the merged cells (approximate width for 2 cells)
          insertedImage.setWidth(120); // Width for approximately 2 cells combined
          insertedImage.setHeight(60); // Proportional height to maintain aspect ratio
        }
        
        // Add authorized representative in F12:G12 (adjusted row)
        if (authorizedRepresentative) {
          const authRepRange = sheet.getRange(signatureRowNumber, 6, 1, 2); // F:G
          authRepRange.merge();
          authRepRange.setValue(authorizedRepresentative);
        }
        
        // Add today's date in I12:J12 (adjusted row) format MM/DD/YYYY
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const year = today.getFullYear();
        const todayString = `${month}/${day}/${year}`;
        
        const dateRange = sheet.getRange(signatureRowNumber, 9, 1, 2); // I:J
        dateRange.merge();
        dateRange.setValue(todayString);
        
        // Add title in L12:N12 (adjusted row)
        if (title) {
          const titleRange = sheet.getRange(signatureRowNumber, 12, 1, 3); // L:N
          titleRange.merge();
          titleRange.setValue(title);
        }
        
      } catch (signatureError) {
        console.error('Error adding signature data:', signatureError);
      }
    }
    
    // Save the spreadsheet
    SpreadsheetApp.flush();
    
    // Generate PDF with custom margins (smaller margins for more content)
    const spreadsheetId = duplicatedSpreadsheet.getId();
    const sheetId = sheet.getSheetId();
    
    // Build export URL with custom margin parameters
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?` +
      `format=pdf&` +
      `gid=${sheetId}&` +
      `portrait=true&` +
      `fitw=true&` +
      `top_margin=0.3&` +      // Reduced from default ~0.75
      `bottom_margin=0.3&` +   // Reduced from default ~0.75  
      `left_margin=0.3&` +     // Reduced from default ~0.7
      `right_margin=0.3&` +    // Reduced from default ~0.7
      `horizontal_alignment=CENTER&` +
      `vertical_alignment=TOP`;
    
    // Get the PDF blob with custom settings
    const response = UrlFetchApp.fetch(exportUrl, {
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
      }
    });
    
    const pdfBlob = response.getBlob();
    pdfBlob.setName(`(${selectedState}) ${selectedMonth}/${selectedYear} - Documentation of Meals Claimed.pdf`);
    
    // Upload PDF to specified folder
    const targetFolderId = '1m5PsksV1W_7barLhBuNwTuGNiAgd0mZ_';
    const targetFolder = DriveApp.getFolderById(targetFolderId);
    const pdfFile = targetFolder.createFile(pdfBlob);
    
    // Clean up - delete the temporary spreadsheet
    DriveApp.getFileById(duplicatedFile.getId()).setTrashed(true);
    
    // Return the PDF URL
    return pdfFile.getUrl();
    
  } catch (error) {
    console.error('Error generating first part report PDF:', error);
    throw new Error(`Failed to generate first part report PDF: ${error.message}`);
  }
}

/**
 * Generate the second part of the consolidated report as PDF
 * @param {string} foundationId - The foundation ID
 * @param {number} selectedMonth - Selected month (1-12)
 * @param {number} selectedYear - Selected year
 * @param {Array} secondPartReportArray - Array of daily data objects
 * @param {string} signatureImage - Base64 signature image (optional, default null)
 * @param {string} authorizedRepresentative - Name of authorized representative (optional, default null)
 * @param {string} title - Report title (optional, default null)
 * @returns {string} URL of the generated PDF
 */
function generateSecondPartReportPDF(foundationId, selectedMonth, selectedYear, selectedState, secondPartReportArray, signatureImage = null, authorizedRepresentative = null, title = null) {
  try {
    // Template spreadsheet ID for second part
    const templateId = '1GgiCjWSdzbAW73uNtrA91LTJEV-Myk_JgDqInEjYvSA';
    
    // Duplicate the template spreadsheet
    const templateFile = DriveApp.getFileById(templateId);
    const duplicatedFile = templateFile.makeCopy(`Consolidated Report Part 2 - ${selectedMonth}/${selectedYear} - ${selectedState}`);
    const duplicatedSpreadsheet = SpreadsheetApp.openById(duplicatedFile.getId());
    
    // Get Sheet1
    const sheet = duplicatedSpreadsheet.getSheetByName('Sheet1');
    if (!sheet) {
      throw new Error('Sheet1 not found in template');
    }
    
    // Set foundation info in E2:G2
    const foundationText = `Intrinsic Foundation ${foundationId}`;
    sheet.getRange('E2:G2').merge().setValue(foundationText);
    
    // Set claim period in E3:G3
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const claimPeriodText = `Claim Period: ${monthNames[selectedMonth - 1]} ${selectedYear}`;
    sheet.getRange('E3:G3').merge().setValue(claimPeriodText);
    
    // Get total days in the month
    const totalDaysInMonth = secondPartReportArray.length;
    
    // If month has more than 28 days, add additional rows
    if (totalDaysInMonth > 28) {
      const rowsToAdd = totalDaysInMonth - 28;
      // Insert rows after B33 (which contains day 28)
      for (let i = 0; i < rowsToAdd; i++) {
        sheet.insertRowAfter(33 + i);
        const newRowNumber = 34 + i;
        const dayNumber = 29 + i;
        
        // Set day number in column B
        sheet.getRange(newRowNumber, 2).setValue(dayNumber);
        
        // Merge cells for each meal type
        sheet.getRange(newRowNumber, 3, 1, 2).merge(); // C:D for breakfast
        sheet.getRange(newRowNumber, 5, 1, 2).merge(); // E:F for lunch
        sheet.getRange(newRowNumber, 7, 1, 2).merge(); // G:H for snack
        sheet.getRange(newRowNumber, 9, 1, 2).merge(); // I:J for supper
        
        // Apply styling to the new row
        applyRowStyling(sheet, newRowNumber);
      }
    }
    
    // Fill in the daily data - only apply styling to newly added rows
    secondPartReportArray.forEach((dayObj, index) => {
      const dayNumber = Object.keys(dayObj)[0];
      const dayData = dayObj[dayNumber];
      const rowNumber = 6 + index; // Starting from row 6
      
      // C6:D6 → Breakfast
      sheet.getRange(rowNumber, 3, 1, 2).setValue(dayData.breakfastCount);
      
      // E6:F6 → Lunch
      sheet.getRange(rowNumber, 5, 1, 2).setValue(dayData.lunchCount);
      
      // G6:H6 → Snack
      sheet.getRange(rowNumber, 7, 1, 2).setValue(dayData.snackCount);
      
      // I6:J6 → Supper
      sheet.getRange(rowNumber, 9, 1, 2).setValue(dayData.supperCount);
      
      // Apply styling only to newly added rows (after the template's 28 days, which is row 33)
      if (rowNumber > 33) {
        applyRowStyling(sheet, rowNumber);
      }
    });
    
    // Add totals row at the end
    const totalsRowNumber = 6 + totalDaysInMonth;
    
    // Insert a new row for totals if needed
    sheet.insertRowAfter(totalsRowNumber - 1);
    
    // Set "Totals" in column B
    sheet.getRange(totalsRowNumber, 2).setValue('Totals');
    sheet.getRange(totalsRowNumber, 2).setFontWeight('bold').setHorizontalAlignment('right');
    
    // Calculate data range for formulas (from row 6 to the row above totals)
    const dataStartRow = 6;
    const dataEndRow = totalsRowNumber - 1;
    
    // C:D → Breakfast total
    const breakfastTotalRange = sheet.getRange(totalsRowNumber, 3, 1, 2);
    breakfastTotalRange.merge();
    breakfastTotalRange.setFormula(`=SUM(C${dataStartRow}:D${dataEndRow})`);
    breakfastTotalRange.setFontWeight('bold');
    
    // E:F → Lunch total
    const lunchTotalRange = sheet.getRange(totalsRowNumber, 5, 1, 2);
    lunchTotalRange.merge();
    lunchTotalRange.setFormula(`=SUM(E${dataStartRow}:F${dataEndRow})`);
    lunchTotalRange.setFontWeight('bold');
    
    // G:H → Snack total
    const snackTotalRange = sheet.getRange(totalsRowNumber, 7, 1, 2);
    snackTotalRange.merge();
    snackTotalRange.setFormula(`=SUM(G${dataStartRow}:H${dataEndRow})`);
    snackTotalRange.setFontWeight('bold');
    
    // I:J → Supper total
    const supperTotalRange = sheet.getRange(totalsRowNumber, 9, 1, 2);
    supperTotalRange.merge();
    supperTotalRange.setFormula(`=SUM(I${dataStartRow}:J${dataEndRow})`);
    supperTotalRange.setFontWeight('bold');
    
    // Apply special styling to totals row
    applyTotalsRowStyling(sheet, totalsRowNumber);    
    // Save the spreadsheet
    SpreadsheetApp.flush();
    
    // Generate PDF (standard margins for this template)
    const pdfBlob = duplicatedSpreadsheet.getAs('application/pdf');
    pdfBlob.setName(`(${selectedState}) ${selectedMonth}/${selectedYear} - Documentation of Daily Meals.pdf`);
    
    // Upload PDF to specified folder
    const targetFolderId = '1m5PsksV1W_7barLhBuNwTuGNiAgd0mZ_';
    const targetFolder = DriveApp.getFolderById(targetFolderId);
    const pdfFile = targetFolder.createFile(pdfBlob);
    
    // Clean up - delete the temporary spreadsheet
    DriveApp.getFileById(duplicatedFile.getId()).setTrashed(true);
    
    // Return the PDF URL
    return pdfFile.getUrl();
    
  } catch (error) {
    console.error('Error generating second part report PDF:', error);
    throw new Error(`Failed to generate second part report PDF: ${error.message}`);
  }
}

/**
 * Apply styling to a regular data row in the second part report
 * @param {Sheet} sheet - The sheet object
 * @param {number} rowNumber - The row number to style
 */
function applyRowStyling(sheet, rowNumber) {
  // Light gray color for regular borders (#D9D9D9)
  const lightGray = '#D9D9D9';
  
  // Apply light gray borders to all cells B to J
  const allCellsRange = sheet.getRange(rowNumber, 2, 1, 9); // B to J
  allCellsRange.setBorder(true, true, true, true, true, true, lightGray, SpreadsheetApp.BorderStyle.SOLID);
  
  // Apply black border with stroke medium to left side of column B
  const columnBRange = sheet.getRange(rowNumber, 2);
  columnBRange.setBorder(null, true, null, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  
  // Apply black border with stroke medium to right side of the merged I:J range (supper column)
  const supperRange = sheet.getRange(rowNumber, 9, 1, 2); // I:J merged range
  supperRange.setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/**
 * Apply special styling to the totals row in the second part report
 * @param {Sheet} sheet - The sheet object
 * @param {number} rowNumber - The totals row number
 */
function applyTotalsRowStyling(sheet, rowNumber) {
  // Set background color for totals row (light grey 3 - #F3F3F3)
  const totalsRowRange = sheet.getRange(rowNumber, 2, 1, 9); // B to J
  totalsRowRange.setBackground('#F3F3F3');
  
  // Column B - top, left and bottom borders (stroke medium, black)
  const columnBRange = sheet.getRange(rowNumber, 2);
  columnBRange.setBorder(true, true, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  
  // Columns C to H - top and bottom borders (stroke medium, black)
  for (let col = 3; col <= 8; col++) {
    const cellRange = sheet.getRange(rowNumber, col);
    cellRange.setBorder(true, null, true, null, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  
  // Columns I:J (merged supper column) - top, bottom, and right borders (stroke medium, black)
  const supperTotalRange = sheet.getRange(rowNumber, 9, 1, 2); // I:J merged
  supperTotalRange.setBorder(true, null, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}



/**
 * Handle signing of consolidated report
 * @param {Object} data - Object containing reportId, authorizedRepresentative, signatureDataUrl, and title
 * @returns {Object} Result object with success status and PDF URL
 */
function handleSignConsolidatedReport(data) {
  try {    
    const { reportId, authorizedRepresentative, signatureDataUrl, title } = data;
    
    // Validate required fields
    if (!reportId) {
      throw new Error('Report ID is required');
    }
    
    // Get the Reports sheet from master spreadsheet
    const masterSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const reportsSheet = masterSpreadsheet.getSheetByName('Reports');
    
    if (!reportsSheet) {
      throw new Error('Reports sheet not found in master spreadsheet');
    }
    
    // Find the report by searching for the reportId in column A
    const lastRow = reportsSheet.getLastRow();
    let reportRowData = null;
    let reportRowIndex = -1;
    
    for (let row = 2; row <= lastRow; row++) {
      const firstPartPdfUrl = reportsSheet.getRange(row, 1).getValue(); // Column A
      
      if (firstPartPdfUrl) {
        // Extract ID from the PDF URL
        const extractedId = extractPdfIdFromDriveUrl(firstPartPdfUrl);
        
        if (extractedId === reportId) {
          // Found the report! Get all data from this row
          reportRowIndex = row;
          const rowRange = reportsSheet.getRange(row, 1, 1, 8); // A to G
          const rowValues = rowRange.getValues()[0];
          
          reportRowData = {
            firstPartPdfUrl: rowValues[0],    // Column A
            secondPartPdfUrl: rowValues[1],   // Column B  
            selectedMonth: rowValues[2],      // Column C
            selectedYear: rowValues[3],       // Column D
            foundationId: rowValues[4],       // Column E
            firstPartReportArray: JSON.parse(rowValues[5]), // Column F
            secondPartReportArray: JSON.parse(rowValues[6]), // Column G
            selectedState: rowValues[7],    // Column H
          };
          break;
        }
      }
    }
    
    if (!reportRowData) {
      throw new Error(`Report with ID ${reportId} not found`);
    }
    
    // Generate the signed PDF using existing function but with signature data
    const signedPdfUrl = generateFirstPartReportPDF(
      reportRowData.foundationId,
      reportRowData.selectedMonth,
      reportRowData.selectedYear,
      reportRowData.selectedState,
      reportRowData.firstPartReportArray,
      signatureDataUrl,
      authorizedRepresentative,
      title
    );
    
    // Set the old first part PDF as trash
    try {
      const oldPdfId = extractPdfIdFromDriveUrl(reportRowData.firstPartPdfUrl);
      if (oldPdfId) {
        const file = DriveApp.getFileById(oldPdfId);
    
        // Remover de todas las carpetas padre
        const parents = file.getParents();
        while (parents.hasNext()) {
          const parent = parents.next();
          parent.removeFile(file);
        }
        
        // Remover del root de mi Drive
        DriveApp.removeFile(file);
      }
    } catch (trashError) {
      // Don't throw error here, continue with the response
    }

    // Here remove the data for the row
     try {
      if (reportRowIndex > 0) {
        reportsSheet.deleteRow(reportRowIndex);
      }
    } catch (deleteError) {
      // Don't throw error here, continue with the response
    }
    
    const jsonData = {
      success: true,
      message: 'Signed consolidated report generated successfully',
      data: {
        signedPdfUrl: signedPdfUrl,
        secondPartPdfUrl: reportRowData.secondPartPdfUrl,
        reportId: reportId
      }
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(jsonData))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    
    const errorData = {
      success: false,
      error: error.message
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorData))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

