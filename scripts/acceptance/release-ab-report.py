"""Summarize the frozen release A/B; never mixes repetitions or discards failures."""
import csv, json, pathlib, sys, hashlib, collections
out=pathlib.Path(sys.argv[1]); rows=list(csv.DictReader((out/'runs.csv').open()))
for r in rows:
 for k,v in list(r.items()):
  if k in ['id','model','task','arm','status']:continue
  if v in ['True','False']:r[k]=v=='True'
  elif v=='':r[k]=None
  else:
   try:r[k]=float(v) if '.' in v else int(v)
   except ValueError:pass
s=json.loads((out/'summary.json').read_text());p=json.loads((out/'protocol.json').read_text())
assert len(rows)==p['runs']==12 and all(r['model']=='gpt-6-astra' for r in rows)
assert len(s['pairs'])==6
A=s['arms']['bare'];B=s['arms']['combined'];names={'cross_file':'跨文件修复','incident':'日志排障','semantic':'180 条记录筛选'}
metrics=['wallMs','totalTokens','uncachedInputTokens','knownAllModelTokens']
def delta(a,b):return 100*(b/a-1) if a else None
def n(v):return f'{v:,.0f}'
def pct(v):return f'{v:+.2f}%'
def describe(k):
 d=delta(A[k],B[k]);return ('减少' if d<0 else '增加')+f' {abs(d):.2f}%'
paired=[]
for task in names:
 for repeat in [0,1]:
  a=next(r for r in rows if r['task']==task and r['repeat']==repeat and r['arm']=='bare')
  b=next(r for r in rows if r['task']==task and r['repeat']==repeat and r['arm']=='combined')
  paired.append({'task':task,'repeat':repeat,'bothPassed':a['passed'] and b['passed'],**{k+'ChangePercent':delta(a[k],b[k]) for k in metrics},'bareId':a['id'],'combinedId':b['id']})
bytask={}
for task in names:
 bytask[task]={arm:{k:sum(r[k] for r in rows if r['task']==task and r['arm']==arm) for k in metrics} for arm in ['bare','combined']}
quality=all(r['passed'] for r in rows)
result={'allQualityPassed':quality,'pairedRuns':paired,'byTask':bytask,'totalChangePercent':{k:delta(A[k],B[k]) for k in metrics},'pairsBetter':{k:sum(r[k+'ChangePercent']<0 for r in paired) for k in metrics},'inferenceBoundary':'Six matched pairs across three fixed synthetic tasks; descriptive only, no stable/general or subscription-debit claim.'}
(out/'paired-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
text=f'''# 重启后正式 A/B：JevPilot v16 是否省时、省 token

本轮固定 GPT‑6 Astra、初始 high，三类任务，每类裸 Codex / JevPilot 各两次，共 12 次。先后顺序在每类任务内交换；单并发、冻结当前安装版本。没有强制使用 Jev、没有修改产品策略、没有为获取好结果重跑失败样本。

**本轮观察：耗时{describe('wallMs')}；GPT 总 token {describe('totalTokens')}；计入 Jev 的已知总 token {describe('knownAllModelTokens')}；GPT 未缓存输入{describe('uncachedInputTokens')}。** 独立功能验收 {s['passed']}/{s['attempted']} 通过。{'两组均通过，下面可比较同样完成任务的消耗。' if quality else '存在未通过任务，不能把少做工作造成的低消耗宣传为节省。'}

## 总体实测

| 指标（每组 6 次任务合计） | 裸 Codex | JevPilot | 变化 |
|---|---:|---:|---:|
| 任务耗时 | {A['wallMs']/1000:.2f} 秒 | {B['wallMs']/1000:.2f} 秒 | {pct(delta(A['wallMs'],B['wallMs']))} |
| 每次平均任务耗时 | {A['wallMs']/6000:.2f} 秒 | {B['wallMs']/6000:.2f} 秒 | 同上 |
| GPT 总 token（含缓存输入） | {n(A['totalTokens'])} | {n(B['totalTokens'])} | {pct(delta(A['totalTokens'],B['totalTokens']))} |
| GPT 未缓存输入 token | {n(A['uncachedInputTokens'])} | {n(B['uncachedInputTokens'])} | {pct(delta(A['uncachedInputTokens'],B['uncachedInputTokens']))} |
| GPT 缓存输入 token | {n(A['cachedInputTokens'])} | {n(B['cachedInputTokens'])} | {pct(delta(A['cachedInputTokens'],B['cachedInputTokens']))} |
| GPT 输出 token | {n(A['outputTokens'])} | {n(B['outputTokens'])} | {pct(delta(A['outputTokens'],B['outputTokens']))} |
| Jev 输入 / 输出 token | 0 / 0 | {n(B['jevInputTokens'])} / {n(B['jevOutputTokens'])} | 额外开销 |
| GPT + Jev 已知总 token | {n(A['knownAllModelTokens'])} | {n(B['knownAllModelTokens'])} | {pct(delta(A['knownAllModelTokens'],B['knownAllModelTokens']))} |
| 功能验收通过 | {A['passed']}/6 | {B['passed']}/6 | — |

总 token 是模型报告的 token 数量相加，**不同模型的 token 不等价于相同费用**。Jev {B['jevCalls']} 次请求，其中失败 {B['jevFailures']} 次，用量未知 {B['jevUnknownUsage']} 次；未知用量不当作零。已知 Jev 输入按测试日 [官方单价](https://docs.typesafe.ai/models) $0.042 / 百万输入 token、输出免费估算为 ${B['knownJevInputUsdEstimate']:.8f}，不是对账扣费金额。没有测量 Codex 订阅额度的实际扣减。

## 分任务结果

每行合计两次重复；正号表示 JevPilot 更多或更慢。

| 任务 | 裸平均秒 | JevPilot 平均秒 | 时间变化 | GPT 总 token 变化 | 加上 Jev 的总 token 变化 | 未缓存输入变化 |
|---|---:|---:|---:|---:|---:|---:|
'''
for task,vals in bytask.items():
 a,b=vals['bare'],vals['combined'];text+=f"| {names[task]} | {a['wallMs']/2000:.2f} | {b['wallMs']/2000:.2f} | {pct(delta(a['wallMs'],b['wallMs']))} | {pct(delta(a['totalTokens'],b['totalTokens']))} | {pct(delta(a['knownAllModelTokens'],b['knownAllModelTokens']))} | {pct(delta(a['uncachedInputTokens'],b['uncachedInputTokens']))} |\n"
text+='\n### 六组逐对比较\n\n| 任务 / 重复 | 时间变化 | GPT 总 token 变化 | 加上 Jev 的总 token 变化 | 双方验收 |\n|---|---:|---:|---:|---|\n'
for r in paired:text+=f"| {names[r['task']]} / {r['repeat']+1} | {pct(r['wallMsChangePercent'])} | {pct(r['totalTokensChangePercent'])} | {pct(r['knownAllModelTokensChangePercent'])} | {'通过' if r['bothPassed'] else '未全部通过'} |\n"
text+=f'''
六对中，JevPilot 耗时更少 {result['pairsBetter']['wallMs']}/6 对，GPT 总 token 更少 {result['pairsBetter']['totalTokens']}/6 对，计入 Jev 后总 token 更少 {result['pairsBetter']['knownAllModelTokens']}/6 对。样本量小，任务只有三种；这里报告本轮观察，不提供保证性节省或统计显著性结论。

## Jev 实际做了什么

- 真实路由判断 {B['routerDecisions']} 次；建议改变 {B['recommendedChanges']} 次。
- 首步改变参数 {B['startChanges']} 次；中途原生 `applied` 改档 {B['nativeAppliedChanges']} 次；预算恢复基准 {B['nativeRestores']} 次；预算阻止建议 {B['budgetHeldDecisions']} 次。
- 证据相关操作 {B['evidenceOperations']} 次；返回缩减正文的 `prepared` {B['preparedOutputs']} 次；原文回读 {B['recalls']} 次。

操作调用、真实 Jev 请求、建议和实际应用分别记录；没有改档的任务不能将表现差异解释为降档收益。返回缩减正文也不自动等于整个任务节省。具体工具调用、错误、成果和用量见 [原始轨迹](runs.json)。

## 用例与验收

- **跨文件修复**：修复租户键冲突、相同请求共享同一 pending Promise、同步异常、拒绝后重试、零值/负金额及币种；独立隐藏断言检查实际实现，禁止修改原规格和原 smoke 测试。
- **日志排障**：540 行合成日志中寻找分散事实、时间与因果证据，排除被证据否定的解释，结果与固定答案核对。
- **记录筛选**：180 条合成记录中识别重试导致且尚未归还的多付款项，排除冻结款、不同订单和已退还记录；8 个目标 ID 必须完全一致，源文件必须不变。

两组提示完全一致，同一原生二进制、同一模型目录、各自空白合成工作区和独立会话。JevPilot 组加载已安装插件 `{p['expectedPluginVersion']}` 及已验证的 v16 适配层；裸组不加载插件、MCP 或 Jev hook。判档和筛选按普通工作流自然发生。测试脚本仅负责采集和验收，不帮任一组解题。

## 计时、记账与边界

- 任务时间从 `turn/start` 发出到 `turn/completed`，包含 Jev 等待和工具执行；不是原生桌面 UI 点击延迟。
- 隔离环境启动、插件安装和 MCP 就绪时间另记 `startupMs`，不假装它们在普通桌面的每条消息中都发生。含启动的 `totalMs` 也保留在 CSV。
- 单并发按预先冻结顺序运行，退出上一原生子进程后开始下一项。测试过程没有调整产品策略、增加权限或重启桌面。
- 使用原生每步与累计用量核对；重复通知只计一次。推理 token 属于输出 token，不再额外相加。Jev 同时采集独立运行存储和插件默认存储中的本合成项目事件，路由回执不重复计为 API 调用。
- HTTP 请求耗时之和可能与工具跨度重叠，不能再次加到已包含它的总时间。缓存、服务端调度及模型生成仍有波动，AB/BA 只能减少部分顺序影响。
- 当前主对话的开发、测试编排、报告整理消耗不在这 12 个隔离任务内；实际平台账单和订阅扣额不在本次测量内。

## 数据与复现

[逐次 CSV](runs.csv) · [逐生成用量](generations.csv) · [配对汇总](paired-summary.json) · [冻结协议与源文件哈希](protocol.json) · [原始轨迹](runs.json) · [token 差额分解](token-decomposition.csv)

测试入口（会产生真实 API 消耗）：`node scripts/acceptance/factorial-run.mjs --run --release-ab --out=<new-directory>`。分析：`python3 scripts/acceptance/factorial-analyze.py <source-directory> <report-directory>`，然后 `python3 scripts/acceptance/release-ab-report.py <report-directory>`。不得复用已有输出目录覆盖记录。
'''
details=json.loads((out/'runs.json').read_text())
events=[e for r in details for e in r['jevEvents']]
fallbacks=collections.Counter(e.get('reason') for e in events if e['kind']=='prepared_output' and e.get('status')=='original')
admissions=collections.Counter(e.get('reason') for e in events if e['kind']=='automatic_output_admission')
diagnosis=f'''## 为什么没有稳定兑现收益

这轮衡量的是用户正常使用时的整个安装版本。它不是“强制指定 Jev 去做某一步”的组件演示。自动化是否自然选中有效操作，本身就是测试对象。

1. **判档开销没有换来切档收益。** {B['recommendedChanges']} 次改变建议中，预算保护拦下 {B['budgetHeldDecisions']} 次，实际首步改变 {B['startChanges']} 次、中途应用 {B['nativeAppliedChanges']} 次。源码规定最多 6 次判断、预留 2 次；第 4 次及以后的判断不允许再开启新的降档。本轮后段出现的 low 建议触发了该保护。不能把它写成“自动降档省了 token”。
2. **排障先调用了筛选工具，最后仍读原文。** `filter_unavailable` 回退 {fallbacks['filter_unavailable']} 次；对应事件是需要 3 批判断，但 `prepare` 只允许 2 批，预检直接返回原文。没有支付筛选用的 Jev 请求，但仍增加 GPT 工具调用、结果阅读和后续生成的负担。两轮排障 GPT 生成次数从 5 次分别增为 7 次、6 次。
3. **记录筛选被过宽的保护范围挡住。** `no_exclusions` 回退 {fallbacks['no_exclusions']} 次；每次按 30 行切成 18 块，块内含 `failed` / `pending` 等词便整块保留，18 块全部受保护，真正交给 Jev 分类的候选为 0。模型自然选择了 `prepare`，没有使用按独立记录筛选的 `select`。因此“结构化筛选组件可用”没有转化为本轮普通使用的收益。
4. **多一轮生成会重复输入上下文。** 下表展示实际轮数和初始输入差额；日志与筛选的额外轮次会再次带入既有上下文。插件与适配配置还增加约 900 个首轮输入 token，并在后续轮次重复出现。CSV 中给出逐项恒等分解，不能将这项代数分解误读为每个功能的独立因果效果。
5. **Jev 的等待只是部分耗时。** Jev API 记录的请求耗时合计 {B['jevRequestMs']/1000:.2f} 秒，已包含在任务计时里，不能再叠加。其余时间包含 GPT 服务等待、生成、工具执行等；没有逐请求网络跟踪，不能把剩余时间一概归因于 Jev 或网络。

| 任务 / 重复 | 裸 GPT 生成次数 | JevPilot GPT 生成次数 | 首轮输入增加 token |
|---|---:|---:|---:|
'''
for pair in paired:
 a=next(r for r in rows if r['id']==pair['bareId']);b=next(r for r in rows if r['id']==pair['combinedId'])
 diagnosis+=f"| {names[pair['task']]} / {pair['repeat']+1} | {a['generations']} | {b['generations']} | {b['firstInputTokens']-a['firstInputTokens']} |\n"
diagnosis+=f'''
自动输出处理还记录了 {admissions['nested_native_result']} 次 `nested_native_result` 跳过：当前原生 code-mode 内层工具结果不能可靠地由该 hook 替换。跳过保护避免宣称没有到达模型的“压缩”，也意味着这条路径未提供自动减小上下文的收益。

**下一步应修复的是普通工作流中的无效筛选入口和路由预算策略，而不是扩大宣传。** 在保持原文可回读、错误证据不丢失的前提下，先让工具在调用前判断是否能缩减、按记录边界保护证据，并避免付费判断后必然拦截的路由。修复后须另开冻结版本重测；本报告保留当前版本的结果，不以修改后样本替换。本轮只新增测试与报告，没有修改、关闭或重新部署正常功能。

'''
if delta(A['wallMs'],B['wallMs'])>=0 and delta(A['knownAllModelTokens'],B['knownAllModelTokens'])>=0:
 text=text.replace('## 总体实测','**发布判断：当前版本未通过本轮省时、省 token 验收，不能作为“开启即可节省”的版本宣传。** 跨文件修复的正向结果保留，但不足以抵消另外两类任务的回退，也不证明稳定收益。\n\n## 总体实测')
text=text.replace('## 用例与验收',diagnosis+'## 用例与验收')
(out/'README.zh-CN.md').write_text(text)
(out/'README.md').write_text(f'''# Frozen JevPilot v16 A/B after restart

[Full Chinese report](README.zh-CN.md) · [Runs CSV](runs.csv) · [Raw evidence](runs.json)

GPT-6 Astra, initially high. Three tasks × two repeats × bare/combined = 12 real tasks, AB/BA balanced by task, sequential. Quality: {s['passed']}/{s['attempted']} accepted.

Observed combined-versus-bare change: task time {pct(delta(A['wallMs'],B['wallMs']))}; GPT total tokens {pct(delta(A['totalTokens'],B['totalTokens']))}; known GPT+Jev tokens {pct(delta(A['knownAllModelTokens'],B['knownAllModelTokens']))}; uncached GPT input {pct(delta(A['uncachedInputTokens'],B['uncachedInputTokens']))}. These are small-sample backend observations, not desktop UI latency, billed quota or guaranteed savings.

Jev calls: {B['jevCalls']}; input/output: {B['jevInputTokens']}/{B['jevOutputTokens']}; unknown-usage calls: {B['jevUnknownUsage']}. Real changes: {B['startChanges']} at turn start, {B['nativeAppliedChanges']} native mid-turn applied. All individual outcomes, including regressions, are retained.
''')
manifest=json.loads((out/'manifest.json').read_text());manifest['reportFiles']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.iterdir()) if f.is_file() and f.name!='manifest.json'};(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
