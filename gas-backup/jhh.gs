function addTodayRowPerSite() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getActiveSheet(); // or ss.getSheetByName('YourSheetName')

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // only header

  const timeZone = ss.getSpreadsheetTimeZone();
  const today = new Date();
  const todayStr = Utilities.formatDate(today, timeZone, 'yyyy-MM-dd');

  // Collect last row info per site
  const siteInfo = {}; // {site: {rowIndex, rowValues}}
  for (let r = 1; r < data.length; r++) { // start at 1 to skip header
    const site = data[r][0];
    if (!site) continue;
    siteInfo[site] = { rowIndex: r + 1, rowValues: data[r] }; // +1 = sheet row
  }

  // Sort sites by last row index descending so inserts don't shift remaining rows
  const sites = Object.values(siteInfo).sort((a, b) => b.rowIndex - a.rowIndex);

  sites.forEach(info => {
    const lastRowValues = info.rowValues;
    const lastDate = lastRowValues[1]; // column B
    const lastDateStr = normalizeDate(lastDate, timeZone);

    // Skip if last row for this site is already today
    if (lastDateStr === todayStr) return;

    // Insert new row after the last row for this site
    sheet.insertRowAfter(info.rowIndex);

    // Copy entire row, then update date to today
    const newRowValues = lastRowValues.slice(); // shallow copy
    newRowValues[1] = today; // column B = today's date

    sheet.getRange(info.rowIndex + 1, 1, 1, newRowValues.length).setValues([newRowValues]);
  });
}

// Helper: normalize a cell value to 'yyyy-MM-dd' string
function normalizeDate(value, timeZone) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  }
  if (typeof value === 'string') {
    return value.substring(0, 10);
  }
  return '';
}
