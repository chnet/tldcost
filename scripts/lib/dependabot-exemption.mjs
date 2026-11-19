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
//      - the root package-lock.json: every added or changed package entry has `resolved` exactly
//        the registry tarball of the name in its path and its version
//        (https://registry.npmjs.org/<name>/-/<base>-<version>.tgz), a sha512 `integrity` and no
//        alias; entries without `resolved` (links, bundled) only unchanged; the root and workspace
//        entries change only like package.json; other top-level fields unchanged. Without a
//        package.json change in the same commit (a transitive update, owner decision 2026-11-19)
//        the root entry, every workspace entry and every link entry must stay byte-identical;
//      - the package.json and package-lock.json of a directory in STANDALONE_LOCK_DIRS (outside the
//        workspaces, owner decision 2026-11-19): exactly those two paths, with the same checks as
//        the root files; a lock change without a change to that directory's package.json only
//        under the same byte-identical rule;
//      - .github/workflows/*.yml: removed and added lines paired 1:1, each a `uses: owner/repo@<sha>`
//        line that differs only in the 40-hex sha and its `# version` comment.
//
// No token, file content or e-mail is printed; findings name the commit and the failed condition.

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

/** Paths of package.json files Dependabot may change: root and workspace package.json. */
export function manifestMatcher(workspaces) {
  const res = [/^package\.json$/];
  for (const w of workspaces) {
    // npm workspace entries: a directory or a single `*` segment (packages/*)
    const dir = w
      .replace(/\/+$/, '')
      .split('/')
      .map((part) => (part === '*' ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    res.push(new RegExp(`^${dir}/package\\.json$`));
  }
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
/** true if the URL is already in normal form (no '..', '.', '%2e' tricks that resolve elsewhere). */
const normalUrl = (u) => {
  try {
    return new URL(u).href === u;
  } catch {
    return false;
  }
};

/**
 * package-lock.json: every resolved URL is exactly the registry tarball of the entry's own name and
 * version (a foreign tarball under a known name would be installed in its place); workspace links
 * unchanged.
 */
export function packageLockFinding(beforeText, afterText) {
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
  for (const [key, entry] of Object.entries(after.packages)) {
    if (!isPlainObject(entry)) return 'package-lock.json: an entry is not an object';
    const prev = beforePkgs[key];
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
    // an added or changed package: its own registry tarball, sha512 integrity, no alias
    const name = lockName(key);
    const ok =
      typeof entry.resolved === 'string' &&
      entry.name === undefined &&
      typeof entry.version === 'string' &&
      LOCK_VERSION.test(entry.version) &&
      PACKAGE_NAME.test(name) &&
      typeof entry.integrity === 'string' &&
      SHA512.test(entry.integrity) &&
      entry.resolved === registryTarball(name, entry.version) &&
      normalUrl(entry.resolved);
    if (!ok) {
      return 'package-lock.json: an added or changed package without its own registry.npmjs.org tarball and sha512 integrity';
    }
  }
  return '';
}

/**
 * A lockfile change without a package.json change (a transitive update, owner decision 2026-11-19):
 * the root entry (""), every workspace entry (a key without node_modules/) and every link entry
 * must be byte-identical before and after, and none may be added or removed. Reason or ''.
 */
export function lockOnlyFinding(beforeText, afterText) {
  let before, after;
  try {
    before = JSON.parse(beforeText);
    after = JSON.parse(afterText);
  } catch {
    return 'package-lock.json is not valid JSON';
  }
  const b = isPlainObject(before?.packages) ? before.packages : {};
  const a = isPlainObject(after?.packages) ? after.packages : {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const direct = !key.includes('node_modules/') || b[key]?.link === true || a[key]?.link === true;
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
 * against its parent. `run` is the git runner of the caller (argv array -> stdout).
 */
export function changeFindings(sha, run) {
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
  const isManifest = manifestMatcher(workspacesOf(show(`${sha}^`, 'package.json')));
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
      if (!manifestChanged) {
        const r = lockOnlyFinding(before, after);
        if (r) reason(prefix + r);
      }
      const r = packageLockFinding(before, after);
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
 * The whole exemption for one range. Returns null when it does not apply at all (context or a
 * non-Dependabot commit in the range), else the findings over all commits (empty = exempt).
 */
export async function rangeExemption(commits, ctx, { run, repo, token, env, fetchFn }) {
  if (!contextAllows(ctx) || commits.length === 0 || !commits.every(isDependabotCommit)) {
    return null;
  }
  const out = [];
  for (const c of commits) {
    out.push(...changeFindings(c.sha, run));
    out.push(...(await apiFindings(c.sha, { repo, token, env, fetchFn })));
  }
  return out;
}
