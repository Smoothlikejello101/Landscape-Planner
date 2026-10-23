// The catalog build's arguments (scripts/catalog/build.mjs, docs/catalog-build.md).

export const USAGE = 'usage: npm run catalog:build [-- --fetch --date YYYY-MM-DD | --date YYYY-MM-DD]   (docs/catalog-build.md)';

/** Whether a string is a real day ("2026-02-30" isn't). */
export function isDay(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * { fetch, date } from the command line, or { error }. `env`: the environment, where npm leaves a flag given
 * without `--` ("npm run catalog:build --fetch" sets npm_config_fetch and passes nothing on). --fetch needs
 * --date: the writer dates every audited record by it, and new pages have a new day.
 */
export function parseBuildArgs(argv, env = {}) {
  if (env.npm_config_fetch != null || env.npm_config_date != null) return { error: `npm took the flag for itself: put \`--\` before it.\n${USAGE}` };
  let fetch = false, date;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fetch') fetch = true;
    else if (argv[i] === '--date' && i + 1 < argv.length) date = argv[++i];
    else return { error: `${argv[i]}: not an option.\n${USAGE}` };
  }
  if (date != null && !isDay(date)) return { error: `--date ${date}: not a day (YYYY-MM-DD)` };
  if (fetch && date == null) return { error: `--fetch needs --date: the day the pages are read, which the writer puts on every audited record.\n${USAGE}` };
  return { fetch, date };
}
