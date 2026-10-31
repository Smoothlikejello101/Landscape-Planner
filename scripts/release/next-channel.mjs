// The build of main for Next, the preview copy at next.fullgrown.garden (docs/releasing.md), run by CI only:
//   node scripts/release/next-channel.mjs before   (in a CI checkout, before `npm run build`: its name and title)
//   node scripts/release/next-channel.mjs after    (on dist/, after the build: its address, and kept out of search)
// Never run it in a working copy you'll commit from: "before" rewrites public/manifest.webmanifest and index.html.
import { readFileSync, writeFileSync } from 'node:fs';

export const NEXT_HOST = 'next.fullgrown.garden';

/** The manifest as Next's: its own name on a phone's home screen, beside the real app's. */
export function nextManifest(m) {
  return { ...m, name: 'FullGrown Next (preview)', short_name: 'FG Next' };
}
/** index.html as Next's: its title, its name when added to a home screen, and not for search engines. */
export function nextIndex(html) {
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>FullGrown Next (preview)</title>')
    .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*"/, '$1FG Next"')
    .replace('</head>', '  <meta name="robots" content="noindex, nofollow" />\n</head>');
}

if (process.argv[1]?.endsWith('next-channel.mjs')) {
  const phase = process.argv[2];
  if (phase === 'before') {
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    writeFileSync('public/manifest.webmanifest', JSON.stringify(nextManifest(m), null, 2) + '\n');
    writeFileSync('index.html', nextIndex(readFileSync('index.html', 'utf8')));
  } else if (phase === 'after') {
    // (GitHub Pages serving a branch takes its custom address from CNAME; .nojekyll serves files as they are.)
    writeFileSync('dist/CNAME', NEXT_HOST + '\n');
    writeFileSync('dist/.nojekyll', '');
    writeFileSync('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
  } else {
    console.error('usage: node scripts/release/next-channel.mjs before|after');
    process.exit(1);
  }
}
