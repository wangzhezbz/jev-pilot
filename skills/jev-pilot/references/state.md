# State operations

All calls: `{workspace:absolute_directory,operation,input}`. Persistent memory is opt-in; never save it without user authorization. Keep secrets out of stored sources.

| operation | input |
|---|---|
| memory | `{action:'save',topic,content,source:{path}\|{receiptId},ttlDays?}`, `{action:'retrieve',goal}`, or `{action:'forget',id}` |
| compact | `{goal,session?,preserveRecent?:6,blocks:[{id,role,content,callId?,readOnly?,verified?,pin?,status?}]}` |
| checkpoint | `{action:'save',task,files?,completed?,pending?,receiptIds?}`, `{action:'resume',id}`, or `{action:'latest',taskId?:real_thread_id}` |

Store evidence/expiry with memory; conflicts and stale entries remain unresolved. Compact only complete verified read-only exchanges, preserving paired tool calls/results, constraints, errors, open work, side effects and recent turns. It creates a recoverable handoff, never rewrites native host history or proves token savings.

At meaningful milestones, checkpoint remaining work and file hashes. Automatic checkpoints record observed progress/tool receipts, not verified completion. On resume, use the real task ID, inspect coverage and revalidate files/current state. Never replay edits, publication, purchases or messages blindly.
