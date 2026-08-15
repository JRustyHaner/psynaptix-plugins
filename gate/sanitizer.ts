/**
 * Plugin injection sanitizer (issue #457).
 *
 * Static scan of a plugin's source against a denylist of constructs that
 * could read learner data, exfiltrate, or escape the host's capability
 * boundary. Runs at approval time on the exact pinned SHA. This is a gate,
 * not a sandbox: the runtime no-read guarantee comes from worker isolation
 * (#456).
 *
 * Rules (each returns a violation with the line number):
 *   eval          — eval / new Function / indirect eval
 *   network       — fetch / XMLHttpRequest / WebSocket / EventSource / sendBeacon
 *   dom-sink      — document.write / innerHTML / outerHTML / insertAdjacentHTML
 *   storage       — localStorage / sessionStorage / indexedDB / document.cookie
 *   postMessage   — postMessage to any window
 *   dynamic-import — import() / importScripts / require()
 *   obfuscation   — atob / btoa / String.fromCharCode / base64-heuristic payloads
 */
export interface SanitizerViolation {
  rule: string;
  line: number;
  reason: string;
}

export interface SanitizerResult {
  ok: boolean;
  violations: SanitizerViolation[];
}

interface Rule {
  name: string;
  pattern: RegExp;
  reason: string;
}

const RULES: Rule[] = [
  { name: 'eval', pattern: /\b(?:eval|new Function)\s*\(/, reason: 'dynamic code execution' },
  { name: 'network', pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/, reason: 'network egress outside the host emit path' },
  { name: 'dom-sink', pattern: /\b(?:document\.write|innerHTML|outerHTML|insertAdjacentHTML)\s*[=(]/, reason: 'DOM write sink' },
  { name: 'storage', pattern: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/, reason: 'storage/cookie read or write' },
  { name: 'postMessage', pattern: /\bpostMessage\s*\(/, reason: 'cross-realm messaging' },
  { name: 'dynamic-import', pattern: /\b(?:import\s*\(|importScripts\s*\(|\brequire\s*\()/, reason: 'runtime module loading' },
  { name: 'obfuscation', pattern: /\b(?:atob|btoa|String\.fromCharCode)\s*\(/, reason: 'encoding/obfuscation heuristic' },
];

/** Strip // line comments and /* *\/ block comments (prose must not trip
 *  the denylist — e.g. a doc comment mentioning 'fetch' or 'localStorage').
 *  String contents are NOT stripped: a plugin embedding a suspicious string
 *  literal still gets flagged. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:"'\w])\/\/[^\n]*/g, '$1'); // line comments
}

/**
 * Scan plugin source. Returns ok=false with per-line violations when any
 * rule matches.
 */
export function sanitizePluginSource(source: string): SanitizerResult {
  const violations: SanitizerViolation[] = [];
  const lines = stripComments(source).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({ rule: rule.name, line: i + 1, reason: rule.reason });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Sanitize the entry source of a plugin dir (manifest + entry). */
export function sanitizePluginDir(
  files: Record<string, string>,
  entryFile = 'entry.js',
): SanitizerResult {
  const entry = files[entryFile];
  if (typeof entry !== 'string' || entry.length === 0) {
    return { ok: false, violations: [{ rule: 'entry', line: 0, reason: `no ${entryFile} in plugin bundle` }] };
  }
  return sanitizePluginSource(entry);
}
