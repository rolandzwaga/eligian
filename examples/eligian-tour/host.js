// Eligian Tour — host module (the extensions import in tour.eligian).
// Eligius resource registrations: the exported objects carry the names the
// extensions block declares (operation stampTime, function shout). esbuild
// bundles this file for --bundle, dev, smoke and the preview.
export const operations = {
  stampTime(operationData) {
    const el = document.querySelector(operationData.selector);
    if (el) el.textContent = new Date().toLocaleTimeString();
    return operationData;
  },
};
export const controllers = {};
export const functions = { shout: (s) => String(s).toUpperCase() };
