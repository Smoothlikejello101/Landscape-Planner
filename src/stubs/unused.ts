// jsPDF can load html2canvas, DOMPurify and canvg for its HTML and SVG import
// features. The app doesn't use those, so the build points them here instead
// of shipping (and caching offline) ~400 KB of unused code.
export default {};
