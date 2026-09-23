// Exact versions accepted only after the native protocol suite passes.
// A desktop update still falls back until it is explicitly validated.
export const VERIFIED_CODEX_VERSIONS=Object.freeze([
  'codex-cli 0.155.0-alpha.9.2',
  'codex-cli 0.155.0-alpha.16.3',
]);
export const verifiedRuntime=version=>VERIFIED_CODEX_VERSIONS.includes(version);
