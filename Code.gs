/**
 * Vinyl Vault Backend
 * Handles secure reading and writing of collection rows.
 *
 * IMPORTANT: After deploying, change the PASSCODE below to something personal.
 * Then in your Google Sheet, change sharing to "Restricted".
 * Paste this into Extensions -> Apps Script in your Google Sheet.
 */

var PASSCODE = "vinylvault2024"; // <-- CHANGE THIS to a personal passcode

// ============================================================
// testAuthorization — RUN THIS ONCE FROM THE APPS SCRIPT EDITOR
// to grant the script permission to access your Google Sheet.
// Click the ▶ Run button with this function selected.
// ============================================================
function testAuthorization() {
  try {
    var sheetId = "1IpetK_EynQ5HLbjcEoQi_ewlkRnEi9UX__JIvw_ugZM";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName("Collection_Master");
    var lastRow = sheet.getLastRow();
    Logger.log("✅ Authorization OK. Sheet found: " + sheet.getName() + " | Rows: " + lastRow);
    Logger.log("✅ Passcode is set to: " + PASSCODE);
  } catch(err) {
    Logger.log("❌ Authorization FAILED: " + err.toString());
    Logger.log("   → If you see a permissions error, click 'Review Permissions' and allow access.");
  }
}

// ============================================================
// doGet — Authenticated sheet read (replaces public CSV export)
// ============================================================
function doGet(e) {
  try {
    var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : "";
    if (token !== PASSCODE) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    var sheetId = "1IpetK_EynQ5HLbjcEoQi_ewlkRnEi9UX__JIvw_ugZM";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName("Collection_Master");

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 1) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, headers: [], records: [] }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    var searchRows = Math.min(10, lastRow);
    var searchCols = Math.max(15, lastCol);
    var rangeValues = sheet.getRange(1, 1, searchRows, searchCols).getValues();

    // Locate header row dynamically
    var headerRowIndex = -1;
    var headers = [];
    for (var r = 0; r < searchRows; r++) {
      var rowLower = rangeValues[r].map(function(v) { return String(v).trim().toLowerCase(); });
      if (rowLower.indexOf("artist") !== -1 && rowLower.indexOf("album") !== -1 && rowLower.indexOf("status") !== -1) {
        headerRowIndex = r + 1; // 1-based
        headers = rangeValues[r].map(function(v) { return String(v).trim(); });
        break;
      }
    }

    if (headerRowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Header row not found." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    // Read all data rows
    var dataStartRow = headerRowIndex + 1;
    var dataRowCount = lastRow - headerRowIndex;
    if (dataRowCount < 1) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, headers: headers, records: [] }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    var dataValues = sheet.getRange(dataStartRow, 1, dataRowCount, lastCol).getValues();

    // Convert to array of objects, skipping blank rows
    var records = [];
    for (var i = 0; i < dataValues.length; i++) {
      var row = dataValues[i];
      var hasData = row.some(function(cell) { return String(cell).trim() !== ""; });
      if (!hasData) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        if (h) {
          var val = row[c];
          // Format dates as locale strings
          obj[h] = (val instanceof Date) ? val.toLocaleDateString() : String(val === null || val === undefined ? "" : val).trim();
        }
      }
      records.push(obj);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, records: records }))
                         .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// doPost — Authenticated add / update
// ============================================================
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // --- Passcode check ---
    if (!data.token || data.token !== PASSCODE) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    var sheetId = "1IpetK_EynQ5HLbjcEoQi_ewlkRnEi9UX__JIvw_ugZM";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName("Collection_Master");

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var searchRows = Math.min(10, lastRow || 10);
    var searchCols = Math.max(15, lastCol || 15);
    var rangeValues = sheet.getRange(1, 1, searchRows, searchCols).getValues();

    var headerRowIndex = -1;
    var headers = [];

    for (var r = 0; r < searchRows; r++) {
      var rowVals = rangeValues[r].map(function(v) { return String(v).trim().toLowerCase(); });
      if (rowVals.indexOf("artist") !== -1 && rowVals.indexOf("album") !== -1 && rowVals.indexOf("status") !== -1) {
        headerRowIndex = r + 1;
        headers = rangeValues[r].map(function(v) { return String(v).trim(); });
        break;
      }
    }

    if (headerRowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Header row not found." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }

    // Auto-create "For" column if missing
    var forIndex = headers.map(function(h) { return h.toLowerCase(); }).indexOf("for");
    if (forIndex === -1) {
      var lastHeaderCol = 0;
      for (var i = 0; i < headers.length; i++) {
        if (headers[i]) lastHeaderCol = i + 1;
      }
      var nextColIndex = lastHeaderCol + 1;
      sheet.getRange(headerRowIndex, nextColIndex).setValue("For");
      headers[nextColIndex - 1] = "For";
      forIndex = nextColIndex - 1;
    }

    // Map header names to 1-based column indices
    var headerMap = {};
    for (var c = 0; c < headers.length; c++) {
      var hName = headers[c];
      if (hName) {
        headerMap[hName.toLowerCase()] = c + 1;
      }
    }

    if (data.action === "add") {
      var newRowIdx = sheet.getLastRow() + 1;
      var record = data;

      if (!record.Artist || !record.Album) {
        throw new Error("Artist and Album fields are required.");
      }

      var properties = ["Artist", "Album", "Status", "Genre", "Notes", "Source List", "For", "Image URL"];
      properties.forEach(function(prop) {
        var colIdx = headerMap[prop.toLowerCase()];
        if (colIdx) {
          sheet.getRange(newRowIdx, colIdx).setValue(record[prop] || "");
        }
      });

      var dateColIdx = headerMap["date added"];
      if (dateColIdx) {
        sheet.getRange(newRowIdx, dateColIdx).setValue(new Date());
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, action: "add" }))
                           .setMimeType(ContentService.MimeType.JSON);

    } else if (data.action === "update") {
      var key = data.key;
      var record = data.record;
      if (!key || !key.Artist || !key.Album || !record) {
        throw new Error("Missing update key or record data.");
      }

      var artistColIdx = headerMap["artist"];
      var albumColIdx = headerMap["album"];
      if (!artistColIdx || !albumColIdx) {
        throw new Error("Required sheet columns (Artist/Album) are missing.");
      }

      var dataRange = sheet.getRange(headerRowIndex + 1, 1, sheet.getLastRow() - headerRowIndex, sheet.getLastColumn());
      var dataValues = dataRange.getValues();
      var matchRowOffset = -1;

      var targetArtist = key.Artist.trim().toLowerCase();
      var targetAlbum = key.Album.trim().toLowerCase();

      for (var r = 0; r < dataValues.length; r++) {
        var rowArtist = String(dataValues[r][artistColIdx - 1]).trim().toLowerCase();
        var rowAlbum = String(dataValues[r][albumColIdx - 1]).trim().toLowerCase();
        if (rowArtist === targetArtist && rowAlbum === targetAlbum) {
          matchRowOffset = r;
          break;
        }
      }

      if (matchRowOffset === -1) {
        throw new Error("Record matching artist '" + key.Artist + "' and album '" + key.Album + "' not found.");
      }

      var rowToUpdate = headerRowIndex + 1 + matchRowOffset;
      var properties = ["Artist", "Album", "Status", "Genre", "Notes", "Source List", "For", "Image URL"];
      properties.forEach(function(prop) {
        var colIdx = headerMap[prop.toLowerCase()];
        if (colIdx) {
          var val = record[prop];
          if (val !== undefined) {
            sheet.getRange(rowToUpdate, colIdx).setValue(val);
          }
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ success: true, action: "update" }))
                           .setMimeType(ContentService.MimeType.JSON);
    } else {
      throw new Error("Invalid action: " + data.action);
    }
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
