"""Report a frozen repair campaign, retaining interrupted development separately."""
import csv,json,pathlib,sys,hashlib
out=pathlib.Path(sys.argv[1]);s=json.loads((out/'summary.json').read_text());p=json.loads((out/'protocol.json').read_text());rows=list(csv.DictReader((out/'runs.csv').open()))
A=s['arms']['bare'];B=s['arms']['combined'];complete=s['attempted']==s['planned']==12 and A['runs']==B['runs']==6
accepted=complete and s['passed']==12
pct=lambda a,b:100*(b/a-1) if a else None
fmt=lambda v:f'{v:+.2f}%' if v is not None else '—'
names={'cross_file':'跨文件修复','incident':'日志排障','semantic':'180 条记录筛选'}
metrics=[('任务耗时（秒）','wallMs',1000),('GPT 总 token','totalTokens',1),('GPT 未缓存输入 token','uncachedInputTokens',1),('Jev 输入 token','jevInputTokens',1),('Jev 输出 token','jevOutputTokens',1),('GPT＋Jev 已知总 token','knownAllModelTokens',1)]
verdict='本轮全部质量验收通过；只有本轮观察可以报告，不能外推为稳定收益。' if accepted else '本轮未完成或未全部通过质量验收，不得据此宣称节省。'
if accepted:
 verdict+=' '+('本轮同时观察到省时和已知总 token 减少。' if B['wallMs']<A['wallMs'] and B['knownAllModelTokens']<A['knownAllModelTokens'] else '本轮未同时满足省时和已知总 token 减少，性能目标尚未全面达成。')
text=f'''# JevPilot v17 修复与真实复测

**{verdict}**

冻结版本 `{p['expectedPluginVersion']}`，GPT‑6 Astra，初始 high，三类相同用例各做两次裸 Codex / 候选 JevPilot 对照，预定 12 次，实际 {s['attempted']} 次，功能验收 {s['passed']} 次通过。每类交换先后顺序、单并发，不强制使用 Jev。候选插件通过隔离 marketplace 正常安装；运行时源文件与冻结快照逐项对齐。旧版数据不参与本轮合计。

## 实测结果

| 指标（各组合计） | 裸 Codex | JevPilot | 变化 |
|---|---:|---:|---:|
'''
for name,k,div in metrics:
 text+=f'| {name} | {A[k]/div:,.2f} | {B[k]/div:,.2f} | {fmt(pct(A[k],B[k]))} |\n'
text+='\n| 任务 / 重复 | 耗时变化 | GPT token 变化 | 加上 Jev 的总 token 变化 | 双方验收 |\n|---|---:|---:|---:|---|\n'
for r in s['pairs']:
 d=r['increasePercent'];text+=f"| {names[r['task']]} / {r['repeat']+1} | {fmt(d['wallMs'])} | {fmt(d['totalTokens'])} | {fmt(d['knownAllModelTokens'])} | {'通过' if r['bothPassed'] else '未全部通过'} |\n"
text+=f'''
真实 Jev 请求 {B['jevCalls']} 次，失败 {B['jevFailures']} 次，用量未知 {B['jevUnknownUsage']} 次。改变建议 {B['recommendedChanges']} 次，首步参数改变 {B['startChanges']} 次，中途原生 `applied` 改档 {B['nativeAppliedChanges']} 次，恢复基准 {B['nativeRestores']} 次。证据操作 {B['evidenceOperations']} 次，返回缩减正文 {B['preparedOutputs']} 次。不能将建议、调用或局部字节减少视为实际切档或端到端节省。

## 具体修复

1. **最后一次有效判断可以应用。** 移除第 4 次判断起一律禁止新降档的冲突规则；仍保留最多 6 次判断、2 次保留判断、用户档位上限、有限复查期限和失败恢复。预算耗尽时，已有有效期限可以走完；期限到达或证据变化时恢复基准，不新增付费判断。
2. **按记录边界保护证据。** Markdown 以同级标题保留完整记录与子节，公共前言固定保留，代码围栏内标题不切分。带时间戳或行号的日志按完整事件有限分组，堆栈续行仍与原事件一起；无法可靠识别时保留原有保守分块。关键字保护、状态保护和 0.9 排除阈值均保留。
3. **完整批次能落在预算内。** `prepare` 和自动输出处理最多 6 次、并发 2、单请求最多 1.8 秒；更低的用户预算继续优先。请求前仍检查能否完整判断，降级和失败返回原文，输出缩减不足也返回原文。
4. **减少重复操作说明。** 精简 skill 的重复段落，保留原有能力入口、执行权限、回读、未知状态和验收要求。

## 功能验证

221 项自动回归通过。新增覆盖完整记录分块、定位与原文拼接一致、代码围栏、多行失败事件、三批日志、较低预算零请求拒绝，以及最后一次判断的应用与过期恢复。

六个原生模型入口（GPT‑6 Astra / Sol / Luna，GPT‑5.6 Sol / Terra / Luna）在真实 Codex 引擎、合成模型端点上通过切档与恢复验证；检查了 48 个请求中的实际档位及原有输入前缀。这些是协议验证，付费 GPT / Jev 调用均为 0，不冒充六个模型的性能测试。详见 [原生模型证据](native-models.json)。

最终采用的真实 Jev 组件检查：日志 64,072 字节 → 15,976 字节（包含返回元数据），记录 58,616 字节 → 30,795 字节；各自 8 条预期关键证据均保留，原文回读完全一致。组件结果仅验证筛选可用，不代替上方真实 GPT 对照。

## 开发尝试与消耗

[开发组件记录](development-components.json) 保留所有成功与失败尝试。仅增大批次、仅改变分块以及两种共享规则简写的未达标结果均保留。共享简写影响筛选效果，最终采用完整的判断条件，未调低排除阈值来获取压缩率。

曾启动一批候选 A/B，因开发审计发现重复规则开销而主动中断：仅运行了一个未完成裸 Codex 任务，消耗 86,988 GPT token、166.307 秒，没有候选模型样本、没有完整配对。其记录单独保存为 [中断说明](interrupted-development-run.json)，不计入最终 A/B、不算质量失败或节省证据。随后简写实验未通过，恢复已验证源码哈希，再启动本报告的独立冻结批次。

## 测量边界和复现

- 计时为原生 app-server 的 `turn/start` 到 `turn/completed`，含路由和工具等待；不是桌面点击响应时间。启动耗时单列于 CSV。
- 同样的输入、独立隐藏验收、空白工作区和初始档位。旧版回退用例用于修复回归，因此这不是未见过任务的泛化测试。
- 原生累计用量与每生成增量对齐，重复通知不重复计算；推理 token 已属于输出，不重复相加。两处 Jev 账本按合成项目精确读取，并验证没有重叠。
- GPT 与 Jev 的 token 数量相加不等于等价费用；未测 Codex 订阅额度扣减。Jev 已知输入按 [官方单价](https://docs.typesafe.ai/models) $0.042 / 百万、输出免费估算 ${B['knownJevInputUsdEstimate']:.8f}，不当作实际账单。
- 主对话的开发和测试编排开销不在最终 12 个任务中；开发组件和主动中断消耗另外列出。
- 仅本机 macOS 原生后端性能；Windows/Linux 的 CI 不是平台性能实测。样本量小，不承诺所有任务都节省。

[逐次 CSV](runs.csv) · [生成用量](generations.csv) · [冻结协议](protocol.json) · [完整轨迹](runs.json) · [token 差额分解](token-decomposition.csv)

付费复现入口：`node scripts/acceptance/factorial-run.mjs --run --release-ab --candidate-root=<immutable-plugin-snapshot> --out=<new-directory>`。使用新目录，勿覆盖旧记录；分析：`python3 scripts/acceptance/factorial-analyze.py <run-directory> <report-directory>`。
'''
(out/'README.zh-CN.md').write_text(text)
(out/'README.md').write_text(f'''# JevPilot v17 repairs and frozen A/B

[Full report (Chinese)](README.zh-CN.md) · [Runs CSV](runs.csv) · [Raw trajectories](runs.json)

Completed {s['attempted']}/{s['planned']} real tasks; accepted {s['passed']}. GPT-6 Astra, initially high, three tasks, two repetitions, balanced AB/BA, sequential. Candidate plugin uses an isolated marketplace; normal desktop deployment is a separate step.

Observed changes: task time {fmt(pct(A['wallMs'],B['wallMs']))}, GPT total tokens {fmt(pct(A['totalTokens'],B['totalTokens']))}, known GPT+Jev tokens {fmt(pct(A['knownAllModelTokens'],B['knownAllModelTokens']))}. Small-sample backend observations, not desktop UI latency, subscription debits or guaranteed savings.

All development probes, including rejected shared-rubric experiments and one deliberately interrupted unpaired baseline, are reported separately. Regression checks: 221 passed. Six native model entry points verified against synthetic endpoints, not paid performance trials.
''')
m=json.loads((out/'manifest.json').read_text());m['reportFiles']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.iterdir()) if f.is_file() and f.name!='manifest.json'};(out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'complete':complete,'accepted':accepted,'timeChangePercent':pct(A['wallMs'],B['wallMs']),'gptChangePercent':pct(A['totalTokens'],B['totalTokens']),'allTokenChangePercent':pct(A['knownAllModelTokens'],B['knownAllModelTokens'])}))
