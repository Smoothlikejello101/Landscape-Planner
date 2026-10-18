// The catalog audit's fetcher rules (docs/catalog-sources.md, "How terms are
// read"): robots.txt as RFC 9309 reads it, applied strictly for every group
// that could mean us, and the pace for each host.

/** What the fetcher sends: who we are, and how to reach us. */
export const USER_AGENT = 'FullGrownCatalog/1.0 (mailto:hello@fullgrown.garden)';
/** Every robots.txt group that applies to the audit. */
export const OUR_AGENTS = ['fullgrowncatalog', 'claudebot', 'claude-user', 'claude-searchbot', 'claude-web', 'anthropic-ai'];
/** Never faster than this, whatever a site allows (seconds). */
export const MIN_PACE = 2;

/**
 * robots.txt as groups: { agents: [...lowercase], rules: [{ allow, path }], delay }.
 * Consecutive user-agent lines share a group; rules before any user-agent are ignored.
 */
export function parseRobots(text) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); }
      cur.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value) cur.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) cur.delay = Math.max(cur.delay, n);
    }
  }
  return groups;
}

/** Whether a robots.txt path pattern matches a path (`*` any run, `$` the end). */
export function patternMatches(pattern, path) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '.*';
    else if (c === '$' && i === pattern.length - 1) re += '$';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp('^' + re).test(path); } catch { return false; }
}
/** One group's answer: the longest matching rule wins, and allow wins a tie. */
function groupAllows(group, path) {
  let best = null;
  for (const r of group.rules) {
    if (!patternMatches(r.path, path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}
/** The groups that could mean us: `*` and any naming one of our agents. */
export function ourGroups(groups) {
  return groups.filter((g) => g.agents.some((a) => a === '*' || OUR_AGENTS.includes(a)));
}
/** Strict: allowed only if every group that could mean us allows it. */
export function allowedBy(groups, path) {
  return ourGroups(groups).every((g) => groupAllows(g, path));
}
/** The longest crawl delay among the groups that could mean us (seconds). */
export function crawlDelay(groups) {
  return Math.max(0, ...ourGroups(groups).map((g) => g.delay));
}
/** Whether a group naming one of our agents (not `*`) keeps us off the whole host. */
export function blocksUsEverywhere(groups) {
  return groups.some((g) => g.agents.some((a) => OUR_AGENTS.includes(a)) && !groupAllows(g, '/'));
}

/**
 * What a robots.txt response means. 404 or 410: there is none (allow all).
 * A text file: its rules. Anything else (other errors, a network failure, an
 * HTML page in its place, such as a bot challenge): disallow everything.
 */
export function robotsFromResponse(status, contentType, body) {
  if (status === 404 || status === 410) return { kind: 'none', groups: [] };
  const html = /html/i.test(contentType ?? '') || /^\s*<(!doctype|html|\?xml)/i.test(body ?? '');
  if (status >= 200 && status < 300 && !html) return { kind: 'rules', groups: parseRobots(body ?? '') };
  return { kind: 'closed', groups: [], why: status ? `robots.txt answered ${status}${html ? ' with a page' : ''}` : 'robots.txt unreachable' };
}

/**
 * The hosts above this one whose whole-host block of a Claude agent also
 * closes it ("closed to bots, and so are its subdomains"): each parent with
 * at least three labels, and its www. form. a.extension.iastate.edu →
 * extension.iastate.edu, www.extension.iastate.edu.
 */
export function parentHosts(host) {
  const labels = host.toLowerCase().split('.');
  const out = [];
  for (let i = 1; labels.length - i >= 3; i++) {
    const p = labels.slice(i).join('.');
    out.push(p, `www.${p}`);
  }
  return out.filter((h) => h !== host.toLowerCase());
}

/** Seconds to wait between requests to one host. */
export function paceFor(sourcePace, delay) {
  return Math.max(MIN_PACE, sourcePace ?? 0, delay ?? 0);
}

/** A file name for a fetched URL: readable, and the same every time. */
export function cacheName(url) {
  const u = new URL(url);
  const base = (u.hostname + u.pathname + (u.search ? '_' + u.search.slice(1) : ''))
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+$/, '').slice(0, 180);
  return base || 'index';
}
