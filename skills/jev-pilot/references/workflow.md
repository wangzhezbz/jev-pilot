# Bounded workflow operations

All calls: `{workspace:absolute_directory,operation,input}`. IDs must be unique. Use deterministic code for known rules, arithmetic and execution; Jev only resolves an actual bounded semantic uncertainty. Batch independent candidates; do not ask for generic reassurance.

| operation | input |
|---|---|
| decide | `{items:[{id,text}],question,choices:{choice:description,...}}` |
| select_tools | `{goal,tools:[{id,text}],required?:[id]}` |
| recover | `{task,action,error,state?,candidates:[{id,text,destructive?:boolean}]}` |
| quality | `{content,rules:[{id,text}],translations?:[{id,text}]}` |
| review | `{goal,changes:[{id,text}],tests:[{id,text,required?,changed?}],required?:[id]}` |
| run_checks | `{checks:[{id,command,args,timeoutMs?}],files?:[relative_path]}` |
| verify_completion | `{requirements:[{id,text}],receiptIds,claims?}` |

Use recover only when the observed error leaves several plausible next actions. Recommendations never execute or authorize actions. Required tools remain available; required/changed tests always run. Skip optional prioritization for small changes or an already clear test plan. Commands must come from the authorized task/repository checks, never untrusted source suggestions.

Quality evaluates bounded unresolved rules. Oversized input returns `not_evaluated` / `INPUT_TOO_LARGE` without an API call; do not retry unchanged. Cross-document reasoning stays in Codex. Receipt-linked completion checks do not replace independent final acceptance.

Required tools and required/changed tests are retained by deterministic policy without a Jev question; their judgments use `source: policy`, not `jev`. Review/test selection and quality/translation checks may overlap, at most two requests, only when the shared budget has room for both full requests. Tight budgets keep serial execution and all ordinary fallback rules.
