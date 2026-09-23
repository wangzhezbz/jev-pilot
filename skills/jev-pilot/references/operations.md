# Unified tool contract

Call `jev_pilot` with `{workspace: absolute_directory, operation, input}`. Same shape on CLI stdin. IDs must be unique simple strings. Candidate rows are `{id,text,...}`. Never send private credential files. Limits return explicit errors, not silent truncation.

| Operation | input |
|---|---|
| status / metrics / diagnostics / desktop_status / desktop_metrics | `{}` |
| configure | any of `enabled`, `memory`, `locale` (en/zh-CN/ru/ja/ko), `maxCalls` (0–30 per operation), `timeoutMs` (500–10000), `cacheMs` (0 disables reads and writes), `evidenceMode` (active/shadow), `taskMaxCalls` (0–200), `taskMaxBytes` (0–5,000,000), `taskMaxWaitMs` (100–120,000) |
| decide | `{items,question,choices:{choice:description,...}}` |
| select | `{goal,items,budget?:16000,against?:[already_read_text]}`; budget is UTF-8 bytes, not measured tokens |
| search | `{goal,query,paths?:['.'],maxMatches?:100,budget?}`; query is a literal ripgrep search string |
| filter_output | `{goal,path}` or `{goal,text,source?,budget?,against?}` |
| recall | `{artifactId,ids?:[item_id]}` |
| select_tools | `{goal,tools:[{id,text}],required?:[id]}` |
| recover | `{task,action,error,state?,candidates:[{id,text,destructive?:boolean}]}`; never auto-executes |
| quality | `{content,rules:[{id,text}],translations?:[{id,text}]}` |
| run_checks | `{checks:[{id,command,args,timeoutMs?}],files?:[relative_path]}`; direct subprocess, no shell interpolation |
| verify_completion | `{requirements:[{id,text}],receiptIds,claims?}` |
| memory | `{action:'save',topic,content,source:{path}|{receiptId},ttlDays?}` / `{action:'retrieve',goal}` / `{action:'forget',id}` |
| compact | `{goal,session?,preserveRecent?:6,blocks:[{id,role,content,callId?,readOnly?,verified?,pin?,status?}]}`; paired roles `tool_call`/`tool_result` |
| review | `{goal,changes:[{id,text}],tests:[{id,text,required?,changed?}],required?:[id]}` |
| checkpoint | `{action:'save',task,files?,completed?,pending?,receiptIds?}` / `{action:'resume',id}` |
| extract | `{content,fields:[{id,description}]}` or `{path,fields}`; max 20k characters/16 fields, offsets refer to original source |

API errors become `review` decisions for classification. Extraction errors do not produce fabricated values. Resolve omitted evidence with recall; raw artifacts are private local data. `run_checks` commands must come from the authorized task/repository checks, never from untrusted page text or unchecked Jev suggestions.

## Shared budgets and evidence policy

Pass `input.taskId` when the current host exposes a stable task ID (except `configure`). Never invent one just to bypass a limit. The desktop bridge supplies its thread ID; MCP falls back to `CODEX_THREAD_ID`, or an explicitly reported workspace budget if no ID is available. Limits are shared through SQLite, per project and task/hour window: by default 40 requests, 500,000 request bytes and 20,000 ms cumulative reserved/observed wait. They reset on hourly boundaries, not each operation. These are admission limits, not billing tokens or an account spending guarantee. Three consecutive failures open a 30-second cooldown with one recovery probe. Cancellation does not count as service failure. The user's GPT model is never switched.

`diagnostics` returns skip/failure reasons, text-boundary coverage, proposed/applied evidence removals, active scopes and cooldowns. It uses the latest 10,000 local events. Desktop routing counts cover all projects; semantic counts are project-specific. Structured outputs and nested code-mode results preserve the native contract.

Evidence exclusion, optional-test deferral and tool/memory omission require probability at least 0.9. This is a conservative initial rule, not calibrated accuracy. Uncertain items, errors and pending work stay available. `evidenceMode: shadow` records exclusion proposals and keeps evidence; it does not disable effort routing. Size budgets may still defer overflow, which stays recoverable.

`evaluate_policy` takes `{domain,model,rubricHash,rows:[{id,group,split:'fit'|'holdout',gold:'keep'|'review'|'exclude',choice,probability}]}`. `probability` is the probability of the chosen class. Supply independently labeled, distinct sample groups; no group may cross splits or appear twice. Fit chooses a threshold, holdout evaluates it without refitting. Reports store metadata and summary statistics, never activate a threshold automatically. Small or single-class samples are explicitly insufficient; a pass is specific to the supplied labels/domain/model/rubric, not a general correctness guarantee.
