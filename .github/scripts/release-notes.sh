#!/usr/bin/env bash
# Prints the CHANGELOG.md section for a version, such as "1.2.3" for the
# heading "## 1.2.3 - 2026-11-20". Exits with status 1 when the section is
# missing or empty. Used by .github/workflows/release.yml.
set -euo pipefail

version=${1:?Usage: release-notes.sh <version>}
changelog=${CHANGELOG:-CHANGELOG.md}

notes=$(awk -v version="$version" '
    /^## / {
        if (found) exit
        heading = $0
        sub(/^## +\[?v?/, "", heading)
        sub(/[] ].*$/, "", heading)
        if (heading == version) { found = 1; next }
    }
    found { print }
' "$changelog")

# Drop leading and trailing blank lines.
notes=$(printf '%s\n' "$notes" | sed -e '/./,$!d')
if [[ -z "${notes//[[:space:]]/}" ]]; then
    printf 'CHANGELOG.md has no entry for %s. Add a "## %s - YYYY-MM-DD" section first.\n' "$version" "$version" >&2
    exit 1
fi
printf '%s\n' "$notes"
