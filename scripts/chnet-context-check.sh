#!/usr/bin/env bash
# chnet-context-check.sh — refuse to act outside the CHnet context (project rule: only CHnet accounts,
# remotes and commit identities). Scripts call it FIRST; exit 3 = abort.
#
# Usage:
#   scripts/chnet-context-check.sh [--gh] [--repo] [--email] [--aws <profile>] [--dir <path>]
#   (no check flag = --gh --repo --email)
#
#   --gh            gh must act as coins4me: GH_TOKEN (non-empty) or GH_CONFIG_DIR must be set, and
#                   `gh api user` must answer `coins4me`. Never relies on the active gh account.
#   --repo          the git repo at --dir (default: cwd): fetch AND push URL of `origin` owned by
#                   coins4me or chnet (GitHub org). Only github.com URLs are recognised
#                   (git@github.com:, ssh://git@github.com/, https://github.com/); an SSH host alias
#                   such as git@<alias>:… is refused on purpose.
#   --email         `git config user.email` of that repo is on config/chnet-commit-emails.txt.
#   --aws <profile> `aws sts get-caller-identity --profile <profile>` is an account listed in
#                   config/chnet-aws-accounts.txt. An explicit profile is required (no default chain).
#
# Safe token form for scripts (a failing `export GH_TOKEN=$(...)` would leave GH_TOKEN empty and gh
# would silently fall back to the active — possibly foreign — account):
#   T=$(gh auth token --user coins4me) && [ -n "$T" ] || exit 1
#   export GH_TOKEN="$T"
#   scripts/chnet-context-check.sh --gh || exit 3
#
# Lists: config/chnet-aws-accounts.txt (local, not in this repo: without it --aws fails, exit 3),
# config/chnet-commit-emails.txt (override for tests:
# CHNET_ACCOUNTS_FILE, CHNET_EMAILS_FILE). Shared by CHnet repos — keep identical to the reference copy.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
ACCOUNTS_FILE="${CHNET_ACCOUNTS_FILE:-$HERE/../config/chnet-aws-accounts.txt}"
EMAILS_FILE="${CHNET_EMAILS_FILE:-$HERE/../config/chnet-commit-emails.txt}"
CHNET_OWNERS="coins4me chnet"
CHNET_GH_LOGIN="coins4me"

do_gh=0
do_repo=0
do_email=0
aws_profile=""
dir="."
any=0

while [ $# -gt 0 ]; do
  case "$1" in
    --gh) do_gh=1; any=1 ;;
    --repo) do_repo=1; any=1 ;;
    --email) do_email=1; any=1 ;;
    --aws)
      [ $# -ge 2 ] || { echo "CHnet context: --aws needs a profile" >&2; exit 2; }
      aws_profile="$2"; any=1; shift ;;
    --dir)
      [ $# -ge 2 ] || { echo "CHnet context: --dir needs a path" >&2; exit 2; }
      dir="$2"; shift ;;
    -h | --help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "CHnet context: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
if [ "$any" -eq 0 ]; then do_gh=1; do_repo=1; do_email=1; fi

fail() {
  echo "CHnet context ERROR: $*" >&2
  echo "Abort (exit 3). CHnet only: gh as coins4me, remotes coins4me/* or chnet/*, CHnet AWS accounts." >&2
  exit 3
}

# Non-comment, non-empty first words of a list file.
list_entries() {
  [ -r "$1" ] || fail "list $1 not readable"
  sed -e 's/#.*$//' "$1" | awk 'NF { print $1 }'
}

# GitHub owner of a remote URL (git@github.com:o/r, ssh://git@github.com/o/r, https://github.com/o/r).
remote_owner() {
  printf '%s\n' "$1" | sed -nE \
    -e 's#^git@github\.com:([^/]+)/.*#\1#p' \
    -e 's#^ssh://git@github\.com/([^/]+)/.*#\1#p' \
    -e 's#^https://([^@/]+@)?github\.com/([^/]+)/.*#\2#p'
}

is_chnet_owner() {
  local o
  for o in $CHNET_OWNERS; do [ "$1" = "$o" ] && return 0; done
  return 1
}

# Allowlist pattern -> anchored ERE with the semantics of globMatch() in scripts/lib/chnet-context.mjs:
# `*` = a run of characters without `@` or whitespace, everything else literal (a shell `case` glob
# would let `*` span `@` and read `[bot]` as a bracket class).
glob_ere() {
  local p=$1 out='^' part
  while :; do
    part=${p%%\**}
    out="$out$(printf '%s' "$part" | sed 's/[[\.^$*+?(){|]/\\&/g')"
    [ "$part" = "$p" ] && break
    out="${out}[^@[:space:]]*"
    p=${p#*\*}
  done
  printf '%s$' "$out"
}

email_allowed() {
  local pattern re
  # printable ASCII only (stricter than the Node side; GitHub/CHnet addresses are ASCII)
  local LC_ALL=C
  [[ $1 =~ ^[!-~]+$ ]] || return 1
  while IFS= read -r pattern; do
    re=$(glob_ere "$pattern")
    [[ $1 =~ $re ]] && return 0
  done <<EOF
$(list_entries "$EMAILS_FILE")
EOF
  return 1
}

summary=""

if [ "$do_gh" -eq 1 ]; then
  command -v gh >/dev/null 2>&1 || fail "gh not in PATH"
  if [ -z "${GH_TOKEN:-}" ] && [ -z "${GH_CONFIG_DIR:-}" ]; then
    fail "neither GH_TOKEN nor GH_CONFIG_DIR is set — gh would use the active account"
  fi
  login="$(gh api user --jq .login </dev/null 2>/dev/null || true)"
  [ "$login" = "$CHNET_GH_LOGIN" ] || fail "gh acts as '${login:-<none>}', expected $CHNET_GH_LOGIN"
  summary="$summary gh=$login"
fi

if [ "$do_repo" -eq 1 ] || [ "$do_email" -eq 1 ]; then
  git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || fail "$dir is not a git repository"
fi

if [ "$do_repo" -eq 1 ]; then
  fetch_url="$(git -C "$dir" remote get-url origin 2>/dev/null || true)"
  push_url="$(git -C "$dir" remote get-url --push origin 2>/dev/null || true)"
  [ -n "$fetch_url" ] || fail "no remote 'origin' in $dir"
  for url in "$fetch_url" "$push_url"; do
    owner="$(remote_owner "$url")"
    is_chnet_owner "$owner" || fail "remote origin of $dir points to owner '${owner:-<not github>}'"
  done
  summary="$summary repo=$(remote_owner "$fetch_url")"
fi

if [ "$do_email" -eq 1 ]; then
  [ -r "$EMAILS_FILE" ] || fail "list $EMAILS_FILE not readable"
  email="$(git -C "$dir" config user.email 2>/dev/null || true)"
  [ -n "$email" ] || fail "no git user.email in $dir"
  email_allowed "$email" || fail "git user.email of $dir is not on the CHnet allowlist"
  summary="$summary email=ok"
fi

if [ -n "$aws_profile" ]; then
  [ -r "$ACCOUNTS_FILE" ] || fail "list $ACCOUNTS_FILE not readable"
  command -v aws >/dev/null 2>&1 || fail "aws not in PATH"
  account="$(aws sts get-caller-identity --profile "$aws_profile" --query Account --output text \
    </dev/null 2>/dev/null || true)"
  [ -n "$account" ] || fail "no credentials for AWS profile $aws_profile"
  list_entries "$ACCOUNTS_FILE" | grep -qx "$account" ||
    fail "AWS profile $aws_profile is account $account, not a CHnet account"
  summary="$summary aws=$account"
fi

echo "CHnet context ok:$summary"
