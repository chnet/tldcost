// dependabot-exemption.mjs — the one narrow exception to the CHnet commit identity rule (owner
// decision 2026-11-15, docs/decisions.md): commits that Dependabot itself made on its own branch,
// signed by GitHub, that only bump dependency versions or action pins. ALL of these must hold:
//
//   1. branch dependabot/** and dependabot[bot] is the PR author AND the actor of the event
//      (Validate) or the pusher (branch push), so a human push onto a Dependabot PR gets no exception;
//   2. EVERY commit of the range is a Dependabot commit: author dependabot[bot], committer GitHub
//      (web-flow), as Dependabot really commits. A range with any other commit gets no exception;
//   3. the GitHub API confirms each commit: verification.verified true, author login dependabot[bot],
//      committer login web-flow (the e-mails alone could be set by anyone);
//   4. each commit only modifies (status M) these files, judged against its parent:
//      - a package.json (root, or a workspace of the PARENT's root package.json): only the version
//        value of a dependency that already exists in dependencies/devDependencies/
//        optionalDependencies/overrides, and only to a plain version (no file:, git, URL or alias);
//        every other field unchanged;
//      - the root package-lock.json: every added or changed package entry has a key of the shape
//        node_modules/<name>(/node_modules/<name>)* at the root or in a workspace directory,
//        `resolved` exactly the registry tarball of the name in its key and its version
//        (https://registry.npmjs.org/<name>/-/<base>-<version>.tgz), a sha512 `integrity` and no
//        alias; an added or changed bundled entry (`"inBundle": true`, shipped inside the tarball
//        of a package that bundles it) instead has no `resolved`, `integrity`, `link` or `name`, a
//        strict version, and its nearest ancestor package that is not itself bundled (the anchor)
//        passes the same tarball and sha512 check; the anchor's tarball is then downloaded from
//        exactly that `resolved` URL, its sha512 must equal the lock's `integrity` before anything
//        in it is read, and it must hold package/<path below the anchor>/package.json with the
//        entry's name and version (a bundled entry that is not in the tarball would be fetched by
//        npm from the registry without the lock's integrity); when the anchor itself is added or
//        changed, every bundled entry under it, changed or not, is checked that way against the
//        new tarball; download, size, time and hash errors fail closed (BUNDLE_LIMITS), each
//        tarball once per run; other entries without
//        `resolved` (links) only unchanged; the root and workspace
//        entries change only like package.json; other top-level fields unchanged. Without a
//        package.json change in the same commit (lock-only resolution updates within the declared
//        ranges, direct and transitive; owner decision 2026-11-19) the root entry, every workspace
//        entry and every link entry must stay byte-identical;
//      - the package.json and package-lock.json of a directory in STANDALONE_LOCK_DIRS (outside the
//        workspaces, owner decision 2026-11-19): exactly those two paths, with the same checks as
//        the root files; a lock change without a change to that directory's package.json only
//        under the same byte-identical rule;
//      - .github/workflows/*.yml: removed and added lines paired 1:1, each a `uses: owner/repo@<sha>`
//        line that differs only in the 40-hex sha and its `# version` comment.
//
// No token, file content or e-mail is printed; findings name the commit and the failed condition.

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const DEPENDABOT = {
  login: 'dependabot[bot]',
  email: '49699333+dependabot[bot]@users.noreply.github.com',
};
/** GitHub's web-flow identity: committer (and signer) of Dependabot's commits. */
export const WEB_FLOW = { login: 'web-flow', email: 'noreply@github.com' };
export const BRANCH_PREFIX = 'dependabot/';

/** One workflow line that is nothing but an action pin, e.g. `- uses: a/b@<sha> # v1`. */
export const PIN_LINE =
  /^\s*(?:-\s+)?uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}(?:\s+#[^\n]*)?$/;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;

/** A plain npm version or range as Dependabot writes it: 1.2.3, ^1.2.3, ~1.2, >=1.2.3, 1.2.3-rc.1. */
export const VERSION_SPEC =
  /^(?:[~^]|>=)?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const DEP_SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'overrides',
]);
const REGISTRY = 'https://registry.npmjs.org/';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (a, b) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => Object.hasOwn(b, k));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Directories outside the npm workspaces with their own package.json and package-lock.json that the
 * exception covers (owner decision 2026-11-19). Only these exact paths, no pattern.
 */
export const STANDALONE_LOCK_DIRS = ['tools/lhci'];

/** Directory of a lockfile the exception covers: '' for the root lock, a standalone dir, else null. */
export function lockDir(path) {
  if (path === 'package-lock.json') return '';
  return STANDALONE_LOCK_DIRS.find((d) => path === `${d}/package-lock.json`) ?? null;
}

/** Directory of a standalone package.json (STANDALONE_LOCK_DIRS), else null. */
export function standaloneManifestDir(path) {
  return STANDALONE_LOCK_DIRS.find((d) => path === `${d}/package.json`) ?? null;
}

/** Regex source of a workspace directory: npm workspace entries are a directory or use `*` segments. */
const workspaceDirSource = (w) =>
  w
    .replace(/\/+$/, '')
    .split('/')
    .map((part) => (part === '*' ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');

/** Paths of package.json files Dependabot may change: root and workspace package.json. */
export function manifestMatcher(workspaces) {
  const res = [
    /^package\.json$/,
    ...workspaces.map((w) => new RegExp(`^${workspaceDirSource(w)}/package\\.json$`)),
  ];
  return (path) => res.some((re) => re.test(path));
}

/** Workspace patterns of a root package.json text ('' or invalid -> none). */
export function workspacesOf(text) {
  try {
    const pkg = JSON.parse(text);
    return Array.isArray(pkg.workspaces) ? pkg.workspaces.filter((w) => typeof w === 'string') : [];
  } catch {
    return [];
  }
}

/** Context condition 1: Dependabot's branch, opened or pushed by Dependabot. */
export function contextAllows({ branch = '', actor = '' } = {}) {
  return branch.startsWith(BRANCH_PREFIX) && actor === DEPENDABOT.login;
}

/** Condition 2 (local part): author and committer e-mail as Dependabot commits. */
export function isDependabotCommit(c) {
  return c.author === DEPENDABOT.email && c.committer === WEB_FLOW.email;
}

/** Dependency section (or a nested override): same keys, only plain version strings changed. */
function depsChangeOk(before, after) {
  if (!isPlainObject(before) || !isPlainObject(after) || !sameKeys(before, after)) return false;
  return Object.keys(before).every((k) => {
    const [b, a] = [before[k], after[k]];
    if (isPlainObject(b)) return depsChangeOk(b, a); // nested overrides
    if (typeof b !== 'string' || typeof a !== 'string') return false;
    return a === b || (VERSION_SPEC.test(b) && VERSION_SPEC.test(a));
  });
}

/**
 * A package.json-shaped object (package.json, or a root/workspace entry of the lockfile): same
 * fields; only the version value of an existing dependency changed. Reason or ''.
 */
function manifestObjectFinding(before, after, label) {
  if (!isPlainObject(before) || !isPlainObject(after) || !sameKeys(before, after)) {
    return `${label}: a top-level field was added or removed`;
  }
  for (const k of Object.keys(before)) {
    if (DEP_SECTIONS.has(k)) {
      if (!depsChangeOk(before[k], after[k])) {
        return `${label}: ${k} changed beyond the version of an existing dependency`;
      }
    } else if (!sameJson(before[k], after[k])) {
      return `${label}: a field other than a dependency version changed`;
    }
  }
  return '';
}

/** package.json: only the version value of an existing dependency changed. Reason or ''. */
export function packageJsonFinding(beforeText, afterText) {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return 'package.json is not valid JSON';
  }
  return manifestObjectFinding(before, after, 'package.json');
}

/**
 * The only tarball URL npm's registry serves for a package version:
 * https://registry.npmjs.org/<name>/-/<base>-<version>.tgz (scoped: @s/p -> base p).
 */
export function registryTarball(name, version) {
  const base = name.startsWith('@') ? name.split('/')[1] : name;
  return `${REGISTRY}${name}/-/${base}-${version}.tgz`;
}

/** Package name of a lockfile entry, from its path: the key after the last node_modules/. */
const lockName = (key) => key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
/** sha512 integrity of an added or changed lockfile entry (no sha1). */
const SHA512 = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
/** Strict semver of a lockfile entry (no '/', no empty or '..' segments). */
export const LOCK_VERSION =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
/** npm package name: optional scope; segments never start with '.' or '_'. */
export const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;
/**
 * Package keys of a lockfile: node_modules/<name>(/node_modules/<name>)*, at the lock's root or in a
 * workspace directory of the given workspace patterns (none for a standalone lock); every <name> a
 * PACKAGE_NAME. Any other key with node_modules/ (xnode_modules/a, docs/node_modules/a) is not one.
 */
export function packageKeyMatcher(workspaces = []) {
  const dirs = workspaces.map((w) => new RegExp(`^${workspaceDirSource(w)}/$`));
  const NM = 'node_modules/';
  return (key) => {
    const at = key.indexOf(NM);
    if (at < 0) return false;
    const dir = key.slice(0, at);
    if (dir !== '' && !dirs.some((re) => re.test(dir))) return false;
    return key
      .slice(at + NM.length)
      .split(`/${NM}`)
      .every((name) => PACKAGE_NAME.test(name));
  };
}

/** Own property only (a JSON key "__proto__" must not read Object.prototype). */
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

/** true if the URL is already in normal form (no '..', '.', '%2e' tricks that resolve elsewhere). */
const normalUrl = (u) => {
  try {
    return new URL(u).href === u;
  } catch {
    return false;
  }
};

/** An added or changed package entry: its own registry tarball, sha512 integrity, no alias. */
function registryEntryOk(key, entry) {
  const name = lockName(key);
  return (
    typeof entry.resolved === 'string' &&
    entry.name === undefined &&
    typeof entry.version === 'string' &&
    LOCK_VERSION.test(entry.version) &&
    PACKAGE_NAME.test(name) &&
    typeof entry.integrity === 'string' &&
    SHA512.test(entry.integrity) &&
    entry.resolved === registryTarball(name, entry.version) &&
    normalUrl(entry.resolved)
  );
}

/**
 * An added or changed bundled entry (`"inBundle": true`): npm writes no resolved/integrity for it,
 * its files come from the tarball of the package that bundles it. Allowed only with no resolved,
 * integrity, link or name and a strict version, and only if its nearest ancestor package that is not
 * itself bundled (the anchor) passes registryEntryOk. Ancestors in between must be bundled entries of
 * the same lock. A bundled entry at the top level of the lock or of a workspace has no such ancestor
 * and is refused. Returns the anchor's key, or null. That the anchor's tarball really holds the entry
 * is checked afterwards by bundleFindings.
 */
function bundleAnchor(key, entry, pkgs, isPackageKey) {
  if (
    entry.inBundle !== true ||
    ['resolved', 'integrity', 'link', 'name'].some((f) => Object.hasOwn(entry, f)) ||
    typeof entry.version !== 'string' ||
    !LOCK_VERSION.test(entry.version) ||
    !PACKAGE_NAME.test(lockName(key))
  ) {
    return null;
  }
  const NM = '/node_modules/';
  let k = key;
  for (;;) {
    const at = k.lastIndexOf(NM);
    if (at < 0) return null;
    k = k.slice(0, at);
    if (!isPackageKey(k)) return null;
    const parent = own(pkgs, k);
    if (!isPlainObject(parent)) return null;
    // a bundled ancestor: its own entry is judged by the same rule when it changes
    if (parent.inBundle === true) continue;
    return !Object.hasOwn(parent, 'inBundle') && registryEntryOk(k, parent) ? k : null;
  }
}

/**
 * package-lock.json: every added or changed package has a package key (packageKeyMatcher) and its
 * resolved URL is exactly the registry tarball of the entry's own name and version (a foreign
 * tarball under a known name would be installed in its place), or it is a bundled entry under such a
 * package (bundleAnchor); workspace links unchanged.
 * `workspaces`: the workspace patterns of the PARENT's root package.json (none for a standalone lock).
 * `bundles`: an array that receives one tarball check per added or changed bundled entry and per
 * bundled entry under an added or changed anchor (for bundleFindings); without it a bundled entry
 * cannot be checked and is refused (fail closed).
 */
export function packageLockFinding(beforeText, afterText, workspaces = [], bundles = null) {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return 'package-lock.json is not valid JSON';
  }
  if (!isPlainObject(before) || !isPlainObject(after) || !sameKeys(before, after)) {
    return 'package-lock.json: a top-level field was added or removed';
  }
  for (const k of Object.keys(after)) {
    if (k !== 'packages' && !sameJson(before[k], after[k])) {
      return 'package-lock.json: a top-level field other than packages changed';
    }
  }
  if (!isPlainObject(after.packages)) return 'package-lock.json has no packages map';
  const beforePkgs = isPlainObject(before.packages) ? before.packages : {};
  const isPackageKey = packageKeyMatcher(workspaces);
  const changedPackages = new Set(); // added or changed packages with their own registry tarball
  const checked = new Set(); // bundled entries with a tarball check
  const bundleCheck = (key, entry, anchor) => {
    const { resolved, integrity } = own(after.packages, anchor);
    checked.add(key);
    bundles.push({
      key,
      resolved,
      integrity,
      path: `package/${key.slice(anchor.length + 1)}/package.json`,
      name: lockName(key),
      version: entry.version,
    });
  };
  for (const [key, entry] of Object.entries(after.packages)) {
    if (!isPlainObject(entry)) return 'package-lock.json: an entry is not an object';
    const prev = own(beforePkgs, key);
    // unchanged entries are not judged again (old ones may still carry e.g. a sha1 integrity)
    if (prev !== undefined && sameJson(entry, prev)) continue;
    if (entry.link === true || prev?.link === true) {
      return 'package-lock.json: a workspace link changed';
    }
    if (!key.includes('node_modules/')) {
      // the root entry ("") and workspace entries mirror package.json files
      if (!isPlainObject(prev)) return 'package-lock.json: a root or workspace entry was added';
      const r = manifestObjectFinding(prev, entry, 'package-lock.json root/workspace entry');
      if (r) return r;
      continue;
    }
    if (!isPackageKey(key)) {
      return 'package-lock.json: an added or changed key that is not node_modules/<name> at the root or in a workspace';
    }
    // an added or changed package: its own registry tarball, sha512 integrity, no alias; a bundled
    // one only without them, under an ancestor package that has them
    if (entry.inBundle !== true) {
      if (registryEntryOk(key, entry)) {
        changedPackages.add(key);
        continue;
      }
      return 'package-lock.json: an added or changed package without its own registry.npmjs.org tarball and sha512 integrity';
    }
    const anchor = bundleAnchor(key, entry, after.packages, isPackageKey);
    if (anchor === null) {
      return 'package-lock.json: an added or changed package without its own registry.npmjs.org tarball and sha512 integrity';
    }
    if (!Array.isArray(bundles)) {
      return 'package-lock.json: a bundled package that cannot be checked against its tarball here';
    }
    bundleCheck(key, entry, anchor);
  }
  // an added or changed anchor: every bundled entry under it, changed or not, is checked against
  // the new tarball (the same download)
  for (const [key, entry] of Object.entries(after.packages)) {
    if (checked.has(key) || !isPlainObject(entry) || entry.inBundle !== true) continue;
    const prefixes = [...changedPackages].filter((p) => key.startsWith(`${p}/node_modules/`));
    if (prefixes.length === 0) continue;
    const anchor = bundleAnchor(key, entry, after.packages, isPackageKey);
    if (anchor === null) {
      return 'package-lock.json: a bundled package under an added or changed package that cannot be checked against its tarball';
    }
    // bundled by a nearer package that did not change: not part of the new tarball's check
    if (!changedPackages.has(anchor)) continue;
    if (!Array.isArray(bundles)) {
      return 'package-lock.json: a bundled package that cannot be checked against its tarball here';
    }
    bundleCheck(key, entry, anchor);
  }
  return '';
}

/**
 * A lockfile change without a package.json change (lock-only resolution updates within the declared
 * ranges, direct and transitive; owner decision 2026-11-19): the root entry (""), every workspace
 * entry, every link entry and every other key that is not a package key (packageKeyMatcher) must be
 * byte-identical before and after, and none may be added or removed. The declared ranges stay as
 * they are; npm ci refuses a lock outside them. Reason or ''.
 */
export function lockOnlyFinding(beforeText, afterText, workspaces = []) {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return 'package-lock.json is not valid JSON';
  }
  const b = isPlainObject(before?.packages) ? before.packages : {};
  const a = isPlainObject(after?.packages) ? after.packages : {};
  const isPackageKey = packageKeyMatcher(workspaces);
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const direct = !isPackageKey(key) || own(b, key)?.link === true || own(a, key)?.link === true;
    if (!direct) continue;
    if (!Object.hasOwn(b, key) || !Object.hasOwn(a, key) || !sameJson(b[key], a[key])) {
      return 'package-lock.json changed without a package.json change, and a root, workspace or link entry changed';
    }
  }
  return '';
}

/** Hunks of a unified diff as {removed, added} line lists (content only, after each @@). */
export function diffHunks(diff) {
  const hunks = [];
  let cur = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      cur = { removed: [], added: [] };
      hunks.push(cur);
    } else if (cur && line.startsWith('-')) {
      cur.removed.push(line.slice(1));
    } else if (cur && line.startsWith('+')) {
      cur.added.push(line.slice(1));
    } // headers before the first @@ and "\ No newline" lines are not content
  }
  return hunks;
}

const unpinned = (line) => line.replace(/@[0-9a-f]{40}(?:\s+#[^\n]*)?$/, '@');

/** Workflow diff: removed/added paired 1:1, each a pin line differing only in sha and comment. */
export function pinOnlyDiff(diff) {
  const hunks = diffHunks(diff);
  return (
    hunks.length > 0 &&
    hunks.every(
      (h) =>
        h.removed.length > 0 &&
        h.removed.length === h.added.length &&
        h.removed.every(
          (r, i) =>
            PIN_LINE.test(r) && PIN_LINE.test(h.added[i]) && unpinned(r) === unpinned(h.added[i]),
        ),
    )
  );
}

/**
 * Condition 4: reasons why a commit's changes are outside the exemption (empty = allowed), judged
 * against its parent. `run` is the git runner of the caller (argv array -> stdout). `bundles` receives
 * the tarball checks of bundled lock entries (packageLockFinding), to run with bundleFindings.
 */
export function changeFindings(sha, run, bundles = null) {
  const id = sha.slice(0, 10);
  const parents = run(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/).length - 1;
  if (parents !== 1) return [`${id}: dependabot exemption: not a single-parent commit`];
  const show = (rev, path) => {
    try {
      return run(['show', `${rev}:${path}`]);
    } catch {
      return '';
    }
  };
  // workspaces of the PARENT: a commit cannot widen its own exception
  const workspaces = workspacesOf(show(`${sha}^`, 'package.json'));
  const isManifest = manifestMatcher(workspaces);
  const status = run(['diff-tree', '--no-commit-id', '-r', '--no-renames', '--name-status', sha]);
  const files = status
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [st, ...rest] = l.split('\t');
      return { st, path: rest.join('\t') };
    });
  const out = [];
  const reason = (r) => out.push(`${id}: dependabot exemption: ${r}`);
  if (files.length === 0) reason('commit changes no file');
  const modified = new Set(files.filter((f) => f.st === 'M').map((f) => f.path));
  // the root lock pairs with any root or workspace package.json, a standalone lock with its own
  const rootManifestChanged = [...modified].some(isManifest);
  for (const { st, path } of files) {
    if (st !== 'M') {
      reason(`only modified files allowed (status ${st})`);
    } else if (isManifest(path)) {
      const r = packageJsonFinding(show(`${sha}^`, path), show(sha, path));
      if (r) reason(r);
    } else if (standaloneManifestDir(path) !== null) {
      const r = packageJsonFinding(show(`${sha}^`, path), show(sha, path));
      if (r) reason(`${standaloneManifestDir(path)}/${r}`);
    } else if (lockDir(path) !== null) {
      const dir = lockDir(path);
      const prefix = dir ? `${dir}/` : '';
      const [before, after] = [show(`${sha}^`, path), show(sha, path)];
      const manifestChanged = dir ? modified.has(`${dir}/package.json`) : rootManifestChanged;
      // a standalone lock has no workspaces
      const ws = dir ? [] : workspaces;
      if (!manifestChanged) {
        const r = lockOnlyFinding(before, after, ws);
        if (r) reason(prefix + r);
      }
      const r = packageLockFinding(before, after, ws, bundles);
      if (r) reason(prefix + r);
    } else if (WORKFLOW.test(path)) {
      const diff = run([
        'diff-tree',
        '--no-commit-id',
        '-p',
        '-U0',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        sha,
        '--',
        path,
      ]);
      if (!pinOnlyDiff(diff)) {
        reason('a workflow change other than a sha update of an existing uses: pin');
      }
    } else {
      reason('a file outside the manifests and workflow pins');
    }
  }
  return out;
}

/**
 * API base: always https://api.github.com. Only the tests point it at their loopback stub, with
 * TLDCOST_GITHUB_API=http://127.0.0.1:<port> (nothing else is accepted: no other host, no https,
 * no localhost name that a hosts file could redirect).
 */
export function apiBase(env = process.env) {
  const override = env.TLDCOST_GITHUB_API;
  if (typeof override === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(override)) {
    return override;
  }
  return 'https://api.github.com';
}

/**
 * Condition 3: the GitHub API confirms the commit as Dependabot's, signed by GitHub. Returns the
 * reasons it does not (empty = confirmed). Never prints the token or the response body.
 */
export async function apiFindings(sha, { repo, token, env = process.env, fetchFn = fetch } = {}) {
  const id = sha.slice(0, 10);
  if (!repo || !token) {
    return [`${id}: dependabot exemption: GITHUB_REPOSITORY/GITHUB_TOKEN not set`];
  }
  let res;
  try {
    res = await fetchFn(`${apiBase(env)}/repos/${repo}/commits/${sha}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    });
  } catch {
    return [`${id}: dependabot exemption: GitHub API not reachable`];
  }
  if (!res.ok) return [`${id}: dependabot exemption: GitHub API status ${res.status}`];
  let body;
  try {
    body = await res.json();
  } catch {
    return [`${id}: dependabot exemption: GitHub API answer is not JSON`];
  }
  const out = [];
  if (body?.sha !== sha) {
    out.push(`${id}: dependabot exemption: GitHub API answered another commit`);
  }
  if (body?.commit?.verification?.verified !== true) {
    out.push(`${id}: dependabot exemption: signature not verified by GitHub`);
  }
  if (
    body?.author?.login !== DEPENDABOT.login ||
    body?.commit?.author?.email !== DEPENDABOT.email
  ) {
    out.push(`${id}: dependabot exemption: GitHub does not name dependabot[bot] as author`);
  }
  if (
    body?.committer?.login !== WEB_FLOW.login ||
    body?.commit?.committer?.email !== WEB_FLOW.email
  ) {
    out.push(`${id}: dependabot exemption: GitHub does not name web-flow as committer`);
  }
  return out;
}

/**
 * Limits of the anchor tarball check (bundleFindings): download size, unpacked size (a gzip bomb),
 * time for download and read, size of one bundled package.json. Beyond them the check fails closed.
 */
export const BUNDLE_LIMITS = {
  maxBytes: 200 * 1024 * 1024,
  maxUnpackedBytes: 1024 * 1024 * 1024,
  timeoutMs: 120_000,
  maxManifestBytes: 1024 * 1024,
};

/**
 * Base of anchor tarball downloads: always the registry of the lock's `resolved`. Only the tests
 * point it at their loopback stub, with TLDCOST_NPM_REGISTRY=http://127.0.0.1:<port> (nothing else),
 * and never in CI: with GITHUB_ACTIONS=true or any non-empty CI the override is ignored.
 */
export function registryBase(env = process.env) {
  const ci = env.GITHUB_ACTIONS === 'true' || (typeof env.CI === 'string' && env.CI !== '');
  const override = env.TLDCOST_NPM_REGISTRY;
  if (!ci && typeof override === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(override)) {
    return `${override}/`;
  }
  return REGISTRY;
}

/** NUL-terminated string field of a tar header. */
const tarString = (buf, at, len) => {
  const field = buf.subarray(at, at + len);
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? len : end).toString('utf8');
};

/** Numeric field of a tar header: octal, or base-256 when the high bit of the first byte is set. */
function tarNumber(buf, at, len) {
  if (buf[at] & 0x80) {
    let n = buf[at] & 0x7f;
    for (let i = at + 1; i < at + len; i++) n = n * 256 + buf[i];
    return n;
  }
  const s = tarString(buf, at, len).trim();
  return /^[0-7]+$/.test(s) ? parseInt(s, 8) : NaN;
}

/** Records of a PAX extended header ("<len> <key>=<value>\n"); throws on a malformed one. */
function paxRecords(data) {
  const out = {};
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    const len = Number(data.subarray(at, space).toString('ascii'));
    if (space < 0 || !Number.isSafeInteger(len) || len <= 0 || at + len > data.length) {
      throw new Error('malformed PAX header');
    }
    const record = data.subarray(space + 1, at + len - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq < 0 || data[at + len - 1] !== 0x0a) throw new Error('malformed PAX header');
    out[record.slice(0, eq)] = record.slice(eq + 1);
    at += len;
  }
  return out;
}

/**
 * Regular files of a tar archive whose path `keep` selects: path -> content (null when larger than
 * maxFileBytes). Reads ustar names with prefix, PAX `x` headers (path, size) and GNU `L` long names.
 * Fails closed (throws) on a bad header checksum, an entry beyond the archive, a PAX global header
 * that sets path or size, a kept path that occurs twice (tar extraction would let the last win) and
 * a zero block that is not the end of the archive (node-tar ends only on two zero blocks or EOF).
 */
export function tarFiles(tar, keep, maxFileBytes = BUNDLE_LIMITS.maxManifestBytes) {
  const out = new Map();
  const seen = new Set();
  let off = 0;
  let longName = null;
  let pax = null;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) {
      // end of archive as node-tar reads it: two zero blocks, or one zero block at the very end;
      // a zero block followed by more data would hide entries from this reader, not from npm
      const next = tar.subarray(off + 512, off + 1024);
      if (next.length === 0 || (next.length === 512 && next.every((b) => b === 0))) return out;
      throw new Error('tar zero block inside the archive');
    }
    let unsigned = 0;
    let signed = 0;
    for (let i = 0; i < 512; i++) {
      const b = i >= 148 && i < 156 ? 0x20 : h[i];
      unsigned += b;
      signed += b > 127 ? b - 256 : b;
    }
    const sum = tarNumber(h, 148, 8);
    if (sum !== unsigned && sum !== signed) throw new Error('tar header checksum');
    const type = String.fromCharCode(h[156]);
    // PAX and GNU long-name values apply to the next real entry, never to another meta entry
    const meta = type === 'x' || type === 'g' || type === 'L' || type === 'K';
    let name = tarString(h, 0, 100);
    if (tarString(h, 257, 6) === 'ustar' && tarString(h, 263, 2) === '00') {
      const prefix = tarString(h, 345, 155);
      if (prefix) name = `${prefix}/${name}`;
    }
    let size = tarNumber(h, 124, 12);
    if (!meta) {
      if (pax && Object.hasOwn(pax, 'size')) size = /^\d+$/.test(pax.size) ? Number(pax.size) : NaN;
      if (pax && Object.hasOwn(pax, 'path')) name = pax.path;
      if (longName !== null) name = longName;
    }
    const start = off + 512;
    if (!Number.isSafeInteger(size) || size < 0 || start + size > tar.length) {
      throw new Error('tar entry beyond the archive');
    }
    const data = tar.subarray(start, start + size);
    off = start + Math.ceil(size / 512) * 512;
    if (type === 'x') {
      pax = paxRecords(data);
      continue;
    }
    if (type === 'g') {
      const g = paxRecords(data);
      if (Object.hasOwn(g, 'path') || Object.hasOwn(g, 'size')) {
        throw new Error('PAX global header with path or size');
      }
      continue;
    }
    if (type === 'L') {
      longName = tarString(data, 0, data.length);
      continue;
    }
    if (type === 'K') continue; // GNU long link name: links are not read
    longName = null;
    pax = null;
    if (!keep(name)) continue;
    if (seen.has(name)) throw new Error('tar path occurs twice');
    seen.add(name);
    if (type === '0' || type === '\0' || type === '7') {
      out.set(name, size > maxFileBytes ? null : Buffer.from(data));
    }
  }
  if (off !== tar.length) throw new Error('tar archive ends inside a block');
  return out;
}

/**
 * Downloads one anchor tarball (no redirects) within the limits, checks its sha512 against the lock
 * BEFORE reading it, then returns its bundled package.json files (tarFiles), or {error}.
 */
async function anchorManifests(resolved, integrity, { env, fetchFn, limits }) {
  if (!resolved.startsWith(REGISTRY) || !SHA512.test(integrity)) {
    return { error: 'anchor without a registry tarball and sha512 integrity' };
  }
  const url = registryBase(env) + resolved.slice(REGISTRY.length);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), limits.timeoutMs);
  // the time limit also ends a body that stalls, whatever the fetch implementation does on abort
  const aborted = new Promise((_, reject) =>
    ctl.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }),
  );
  aborted.catch(() => {});
  let buf;
  try {
    const res = await Promise.race([
      fetchFn(url, { redirect: 'error', signal: ctl.signal }),
      aborted,
    ]);
    if (!res.ok) return { error: `anchor tarball download failed (status ${res.status})` };
    if (Number(res.headers.get('content-length')) > limits.maxBytes) {
      ctl.abort();
      return { error: 'anchor tarball larger than the limit' };
    }
    const chunks = [];
    let n = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value: chunk } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      n += chunk.length;
      if (n > limits.maxBytes) {
        ctl.abort();
        return { error: 'anchor tarball larger than the limit' };
      }
      chunks.push(chunk);
    }
    buf = Buffer.concat(chunks);
  } catch {
    return {
      error: ctl.signal.aborted
        ? 'anchor tarball download timed out'
        : 'anchor tarball download failed',
    };
  } finally {
    clearTimeout(timer);
  }
  if (`sha512-${createHash('sha512').update(buf).digest('base64')}` !== integrity) {
    return { error: 'anchor tarball sha512 does not match the lock integrity' };
  }
  try {
    const tar = gunzipSync(buf, { maxOutputLength: limits.maxUnpackedBytes });
    const keep = (p) => p.startsWith('package/node_modules/') && p.endsWith('/package.json');
    return { manifests: tarFiles(tar, keep, limits.maxManifestBytes) };
  } catch {
    return { error: 'anchor tarball is not a readable gzip tar within the limits' };
  }
}

/**
 * The tarball half of the bundled-entry rule: for each check collected by changeFindings, the
 * anchor's tarball (downloaded once per run via `cache`) holds package/<path>/package.json with the
 * entry's name and version. Any download, size, time, hash or archive error fails closed.
 */
export async function bundleFindings(
  sha,
  bundles,
  { env = process.env, fetchFn = fetch, cache = new Map(), limits = BUNDLE_LIMITS } = {},
) {
  const id = sha.slice(0, 10);
  const out = [];
  for (const b of bundles) {
    const anchorKey = `${b.resolved} ${b.integrity}`;
    if (!cache.has(anchorKey)) {
      cache.set(anchorKey, anchorManifests(b.resolved, b.integrity, { env, fetchFn, limits }));
    }
    const { error, manifests } = await cache.get(anchorKey);
    const reason = (r) => out.push(`${id}: dependabot exemption: bundled ${b.key}: ${r}`);
    if (error) {
      reason(error);
      continue;
    }
    const content = manifests.get(b.path);
    if (content === undefined) {
      reason('not in the tarball of the package that bundles it');
      continue;
    }
    let pkg;
    try {
      pkg = content === null ? null : JSON.parse(content.toString('utf8'));
    } catch {
      pkg = null;
    }
    if (!isPlainObject(pkg)) {
      reason('its package.json in the bundling tarball is not readable');
    } else if (pkg.name !== b.name || pkg.version !== b.version) {
      reason('name or version in the bundling tarball differs from the lock');
    }
  }
  return out;
}

/**
 * The whole exemption for one range. Returns null when it does not apply at all (context or a
 * non-Dependabot commit in the range), else the findings over all commits (empty = exempt).
 * Bundled lock entries are checked against their anchor's tarball only for a commit that passed
 * everything else (no download for a refused commit).
 */
export async function rangeExemption(commits, ctx, { run, repo, token, env, fetchFn }) {
  if (!contextAllows(ctx) || commits.length === 0 || !commits.every(isDependabotCommit)) {
    return null;
  }
  const out = [];
  const tarballs = new Map(); // anchor tarballs, once per run
  for (const c of commits) {
    const bundles = [];
    const change = changeFindings(c.sha, run, bundles);
    const api = await apiFindings(c.sha, { repo, token, env, fetchFn });
    out.push(...change, ...api);
    if (change.length === 0 && api.length === 0 && bundles.length > 0) {
      out.push(...(await bundleFindings(c.sha, bundles, { env, fetchFn, cache: tarballs })));
    }
  }
  return out;
}
