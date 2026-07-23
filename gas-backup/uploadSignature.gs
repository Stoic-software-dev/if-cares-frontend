// Function to find or create a folder
function findOrCreateFolder(parentFolder, folderName) {
    var folders = parentFolder.getFolders();
    while (folders.hasNext()) {
        var folder = folders.next();
        if (folder.getName() === folderName) {
            return folder;
        }
    }
    // Folder not found, so create it
    return parentFolder.createFolder(folderName);
}

function uploadSignatureToDrive(signData, siteName, formattedDate) {
    // Convert the base64-encoded data to a Blob
    var imageBase64 = signData.split(",")[1];
    var imageBlob = Utilities.newBlob(Utilities.base64Decode(imageBase64), 'image/png', formattedDate + '.png');

    // Get the parent folder by ID
    var parentFolder = DriveApp.getFolderById("1-KzYQjNWNIaH38oLASaJSi0hMrBk6gYX");

    // Find or create the folder named as siteName
    var siteFolder = findOrCreateFolder(parentFolder, siteName);

    // Create file in the Drive folder
    siteFolder.createFile(imageBlob);
}

function insertSignatureToCell(siteName, formattedDate, formSheet, signRow) {
    var parentFolderId = "1-KzYQjNWNIaH38oLASaJSi0hMrBk6gYX";
    var parentFolder = DriveApp.getFolderById(parentFolderId);
    var siteFolder = null;
    var folders = parentFolder.getFolders();

    signRow = signRow || 111; // fallback para los demás sitios

    while (folders.hasNext()) {
        var folder = folders.next();
        if (folder.getName() === siteName) {
            siteFolder = folder;
            break;
        }
    }

    if (siteFolder) {
        var files = siteFolder.getFiles();
        while (files.hasNext()) {
            var file = files.next();
            if (file.getName() === formattedDate + '.png') {
                var fileId = file.getId();
                var imageUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
                formSheet.getRange(signRow, 10, 3, 5).setFormula(`=Image("${imageUrl}",4,60,150)`);
                return;
            }
        }
    }
}
