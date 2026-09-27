# Windows low-level calculator acceptance

User-supplied WINDOWS_OBSERVATION_RESULTS.md and WINDOWS_OBSERVATION_EVIDENCE.json report one successful run using candidate 0.2.1+codex.20260927022653. The archive SHA-256 is c7c6f4a92ce6043e56f37e0b1c413a9c7edbc80d78fd39ca46496973754fbce0.

The fixed diagnostic pressed 7, Numpad_Add, 2, Return exactly once each. Total probe time was 1281 ms. Addition's first read at 145 ms did not yet show the expression; a second at 313 ms showed 7 +. Equals first read at 160 ms still showed 2; a second at 332 ms showed 9. Both independent final reads returned 9.

This demonstrates delayed observable state in this run and that the bounded read-only settling path can complete the low-level task. It does not establish every prior failure's root cause, a speed improvement, full Jev automation, candidate installation, or Chrome recovery. The probe made zero active Jev requests and zero session.run calls; background routing usage was unmeasured. Existing configuration was preserved.

Next: one actual Jev-driven session using this same candidate, without a preselected answer sequence, installation, quota reset or Chrome retry. The separate acceptance harness uses the existing session and default transport with a four-request/action cap; local mocked tests must never be reported as live Windows acceptance.
