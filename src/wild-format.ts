// The wild-record files' format (public/wild/<format>/, scripts/catalog/wild.mjs FORMAT): a new format gets a
// new folder and a new cache on the device, so an app always reads the format it was made for. Its own module
// so the service worker can use it without the app's code.
export const WILD_FORMAT = 1;
