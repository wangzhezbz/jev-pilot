# Windows native host baseline review — 2026-09-27

Evidence: user-supplied WINDOWS_HOST_BASELINE_RESULTS.md and WINDOWS_HOST_BASELINE_EVIDENCE.json. These are remote Windows observations, not locally reproduced results.

## Confirmed observations

- The official calculator calls returned successfully for 7, plus, 2 and Return. Fresh AX values were 7, 7, 2 and 2. An independent final read also showed 2. The test bypassed Jev selection and JevPilot's progress guard.
- Therefore merely allowing unchanged intermediate AX does not fix this observed sequence. Neither plus nor Return is individually proven ineffective. The switch from 7 to 2 is insufficient to infer the internal operator state.
- The focused AX element in the observations was the result text. This motivates a comparison with no intermediate AX reads, but does not establish that observation changes focus or input semantics.
- Chrome's selected profile blank window opened and static extension/native-host checks passed. The only tabs.list attempt ended with node_repl_call_timeout at approximately 15 seconds. The evidence does not contain a separately returned inner transport error or an explicit outer timeout parameter.
- Active test Jev calls: 0. A background route was separately observed: 1 call, 1518 input and 106 output tokens, unchanged. No installation or configuration changes were reported.

## Action

Keep production guards and key bindings unchanged. Use WINDOWS-HOST-ISOLATION.md to compare digit concatenation and intermediate observations, and to distinguish an outer execution deadline from a browser operation error. Do not claim Windows computer-use or Chrome acceptance, root-cause resolution, or performance savings from these findings.

The diagnostic helper takes an existing official browser handle, issues tabs.list once, exposes only counts/timing/coarse error classes, and reports a 45-second pending state without claiming cancellation. Its caller sets an explicit longer outer execution timeout if the current tool supports it. This is a diagnostic budget, not a global runtime change.

Local validation: 424 tests passed, including five new diagnostic tests for metadata redaction, returned errors, pending requests and late rejection, response shape, and invalid arguments. Syntax/JSON/secret checks passed. These checks do not substitute for the requested Windows run.
