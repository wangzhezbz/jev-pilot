# Release version guard

Windows rejected the progress candidate `0.2.0+codex.20260926164432` because an installed candidate already had `0.2.0+codex.20260926190000`. Do not repair distributable packages with personal cache labels. The next source candidate has base version 0.2.1; Windows activation still needs real-device verification.

Prepare a release from the repository root:

```sh
node scripts/bump-release-version.mjs
node scripts/package-release.mjs --check-version
```

Use `--base=0.2.1` on the bump command when intentionally increasing the semantic base. Both plugin manifests and package.json are updated together. UTC stamps advance past both current manifests and `release-state.json`, even if the local clock is behind. Local cache labels and invalid dates are rejected.

After checks and launcher builds, package to a new output directory:

```sh
node scripts/package-release.mjs --out=dist/next-candidate
```

Packaging rejects inconsistent manifests, a mismatched package base, a version no newer than the last packaged version, and existing target ZIPs. Only after all six archives and checksums are written does it advance `release-state.json`. Commit the updated ledger with the release preparation before another checkout is used to prepare a later release. A discarded ledger, stale checkout, or external package is outside this local guard; it does not query every user's installed version. Failed partial outputs should be inspected, and the next attempt should use a new directory.

This does not install the candidate, publish GitHub assets, prove Windows activation, or change runtime routing. The existing public release remains separate from integration-branch candidates.
