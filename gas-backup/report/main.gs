/**
 * Process the consolidated report with the form data
 * @param {Object} formData - Object containing state, claimedPeriod, includedSites, and excludedSites
 * @returns {Object} Result object with success status
 */
function processConsolidatedReport(formData) {
  try {
    const selectedMonth = formData.claimedPeriod.month;
    const selectedYear = formData.claimedPeriod.year;
    const selectedState = formData.state;
    
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}/${day}/${year}`;
    };
    
    const startDateString = formatDate(startDate);
    const endDateString = formatDate(endDate);
    
    const foundationId = getFoundationIdByState(selectedState);
    const reportData = generateReportArrays(formData.includedSites, startDate, endDate);
    
    console.log('startDate:', startDateString);
    console.log('endDate:', endDateString);
    console.log('firstPartReportArray:', reportData.firstPartReportArray);
    console.log('secondPartReportArray:', reportData.secondPartReportArray);
    console.log('foundationId:', foundationId);
    console.log('selectedState:', selectedState);
    
    // Generate first part report PDF
    const firstPartPdfUrl = generateFirstPartReportPDF(
      foundationId,
      selectedMonth,
      selectedYear,
      selectedState,
      reportData.firstPartReportArray
    );
    
    // Generate second part report PDF
    const secondPartPdfUrl = generateSecondPartReportPDF(
      foundationId,
      selectedMonth,
      selectedYear,
      selectedState,
      reportData.secondPartReportArray
    );
    
    // Save report data to Reports tab
    saveReportToMasterSheet(
      firstPartPdfUrl,
      secondPartPdfUrl,
      selectedMonth,
      selectedYear,
      foundationId,
      selectedState,
      reportData.firstPartReportArray,
      reportData.secondPartReportArray
    );
    
    return {
      success: true,
      message: 'Consolidated report data processed successfully',
      processedSites: formData.includedSites.length,
      excludedSites: formData.excludedSites.length,
      state: formData.state,
      foundationId: foundationId,
      period: `${formData.claimedPeriod.monthName} ${formData.claimedPeriod.year}`,
      dateRange: {
        startDate: startDateString,
        endDate: endDateString,
        totalDays: endDate.getDate()
      },
      reportData: {
        firstPartReportArray: reportData.firstPartReportArray,
        secondPartReportArray: reportData.secondPartReportArray
      },
      pdfUrls: {
        firstPartPdfUrl: firstPartPdfUrl,
        secondPartPdfUrl: secondPartPdfUrl
      }
    };
    
  } catch (error) {
    console.error('Error in processConsolidatedReport:', error);
    throw new Error(`Failed to process consolidated report: ${error.message}`);
  }
}
