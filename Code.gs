/**
 * Vinyl Vault Backend
 * Handles adding and updating collection rows dynamically.
 * Paste this into Extensions -> Apps Script in your Google Sheet.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheetId = "1IpetK_EynQ5HLbjcEoQi_ewlkRnEi9UX__JIvw_ugZM";
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName("Collection_Master");
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    // Read first 10 rows and up to 20 columns to locate header row dynamically
    var searchRows = Math.min(10, lastRow || 10);
    var searchCols = Math.max(15, lastCol || 15);
    var rangeValues = sheet.getRange(1, 1, searchRows, searchCols).getValues();
    
    var headerRowIndex = -1;
    var headers = [];
    
    for (var r = 0; r < searchRows; r++) {
      var rowVals = rangeValues[r].map(function(v) { return String(v).trim().toLowerCase(); });
      // Identify headers by looking for "artist", "album", and "status"
      if (rowVals.indexOf("artist") !== -1 && rowVals.indexOf("album") !== -1 && rowVals.indexOf("status") !== -1) {
        headerRowIndex = r + 1; // 1-based row index
        headers = rangeValues[r].map(function(v) { return String(v).trim(); });
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Header row containing Artist, Album, and Status not found in first 10 rows." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Auto-create "For" column if it doesn't exist (Pending Feature 2)
    var forIndex = headers.map(function(h) { return h.toLowerCase(); }).indexOf("for");
    if (forIndex === -1) {
      // Find the last actual column header in the header row
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
      var record = data; // The add payload is flat (...record)
      
      if (!record.Artist || !record.Album) {
        throw new Error("Artist and Album fields are required.");
      }
      
      // Write to mapped columns
      var properties = ["Artist", "Album", "Status", "Genre", "Notes", "Source List", "For", "Image URL"];
      properties.forEach(function(prop) {
        var colIdx = headerMap[prop.toLowerCase()];
        if (colIdx) {
          sheet.getRange(newRowIdx, colIdx).setValue(record[prop] || "");
        }
      });
      
      // Date Added auto-timestamp
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
      
      // Look up rows below the header row
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
      
      // Write updated properties to mapped columns (Priority is naturally preserved since we don't modify it)
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
