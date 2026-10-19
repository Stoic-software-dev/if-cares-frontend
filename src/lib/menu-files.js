// Where a published menu is opened or downloaded. Shared by the Menus screen
// and the offline warm-up, which keeps these files on a site user's phone.
export const menuFileId = (file) => file.id ?? file.fileId ?? '';

export const menuFileUrl = (file, { attachment } = {}) =>
  `/api/reports/files/download?fileId=${encodeURIComponent(menuFileId(file))}${attachment ? '&download=1' : ''}`;
