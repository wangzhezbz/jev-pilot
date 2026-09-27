# Windows AX evidence correction

Input: WINDOWS_DOCUMENTED_KEYS_EVIDENCE.json and corresponding user-supplied report, 2026-09-27. Candidate 0.2.1+codex.20260926190003 was extracted, not installed.

| Step | Display in raw AX | History in raw AX |
| --- | --- | --- |
| 7 | 7 | no value |
| Numpad_Add | 7 | 7 + |
| 2 | 7 | 7 + |
| Return | 2 | 7 + |

The report's null expression fields were incorrect: control ID 404 exposes `Value: 7 +` after addition. The same expression persists in subsequent before/after snapshots. Thus the operator did produce observable state. The digit/display delay is a hypothesis to test, not proof of a particular host bug. The independent final result was still 2, so arithmetic did not pass.

Changes: extract result ID 150 and expression ID 404 without confusing focused-element duplication; reject ambiguous fields. Explicit calculator mode now uses up to four sequential read-only probes within a one-second waiting budget and the existing session budget when AX is unchanged. It never repeats a key, accepts raw-only out-of-scope changes, or spends another Jev request during waiting. Cancellation and identity checks remain. Normal changed observations and other driver paths are unaffected.

The new fixed calculator diagnostic waits for each explicitly expected visible state before sending the next key; if 2 never becomes visible, it stops before Return. Its observations are produced from raw AX by the same parser rather than manually entered report fields. This fixed diagnostic is not a Jev decision or complete session acceptance.

Chrome made no request this round. Official logs did not expose a correlated underlying error. No new Chrome root cause, repair, or performance claim is supported. Repeating an unchanged request is not part of this handoff.
