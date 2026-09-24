"""Summarize the separately frozen entry follow-up without mixing v17 samples."""
import json,pathlib,sys,hashlib,csv
out=pathlib.Path(sys.argv[1]);s=json.loads((out/'summary.json').read_text());p=json.loads((out/'protocol.json').read_text());details=json.loads((out/'runs.json').read_text())
assert s['planned']==s['attempted']==s['passed']==8 and len(s['pairs'])==4
A=s['arms']['bare'];B=s['arms']['combined'];change=lambda k:100*(B[k]/A[k]-1)
names={'incident':'日志排障','semantic':'180 条记录筛选'}
skillReads=sum(i['type']=='commandExecution' and '/skills/jev-pilot/' in i.get('command','') for r in details if r['id'].endswith('combined') for i in r['completedItems'])
audit={'completed':8,'accepted':8,'candidateSkillReads':skillReads,'candidateEvidenceOperations':B['evidenceOperations'],'actualAppliedChanges':B['nativeAppliedChanges'],'unknownJevUsage':B['jevUnknownUsage'],'interpretation':'Plugin triggered real routing but avoided evidence delegation for these locally resolvable fixtures. Do not attribute all observed savings to Jev classification or all timing differences to routing.'}
(out/'workflow-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
text=f'''# 普通入口修复后的独立 A/B

**本轮 GPT 总 token 减少 {-change('totalTokens'):.2f}%，计入 Jev 的已知总 token 减少 {-change('knownAllModelTokens'):.2f}%；总耗时增加 {change('wallMs'):.2f}%。因此，省 token 在本轮有观察证据，整体加速仍未达标。**

GPT‑6 Astra、初始 high；日志排障和 180 条记录筛选，各两次裸 Codex / 候选插件对照，共 8 次、4 对，全部通过相同独立验收。按预先冻结的 AB/BA 顺序单并发运行，没有失败重跑。版本 `{p['expectedPluginVersion']}`。这 8 次不与此前 v17 的 12 次混合计算；也不是新的未见过任务泛化评估。

## 实测总计

| 指标（每组 4 次合计） | 裸 Codex | 候选插件 | 变化 |
|---|---:|---:|---:|
| 任务耗时 | {A['wallMs']/1000:.3f} 秒 | {B['wallMs']/1000:.3f} 秒 | {change('wallMs'):+.2f}% |
| GPT 总 token | {A['totalTokens']:,} | {B['totalTokens']:,} | {change('totalTokens'):+.2f}% |
| GPT 未缓存输入 token | {A['uncachedInputTokens']:,} | {B['uncachedInputTokens']:,} | {change('uncachedInputTokens'):+.2f}% |
| GPT 输出 token | {A['outputTokens']:,} | {B['outputTokens']:,} | {change('outputTokens'):+.2f}% |
| Jev 输入 / 输出 token | 0 / 0 | {B['jevInputTokens']:,} / {B['jevOutputTokens']:,} | 额外开销 |
| GPT＋Jev 已知总 token | {A['knownAllModelTokens']:,} | {B['knownAllModelTokens']:,} | {change('knownAllModelTokens'):+.2f}% |
| 功能验收 | 4/4 | 4/4 | 相同标准 |

不同模型的 token 数量相加不等价于同等费用。未测 Codex 订阅扣额；Jev 已知输入按 [官方单价](https://docs.typesafe.ai/models) $0.042 / 百万、输出免费估算 ${B['knownJevInputUsdEstimate']:.8f}，不是实际账单金额。

## 全部配对结果

正号表示插件更多或更慢。

| 任务 / 重复 | 耗时变化 | GPT token 变化 | 加上 Jev 的总 token 变化 |
|---|---:|---:|---:|
'''
for r in s['pairs']:
 d=r['increasePercent'];text+=f"| {names[r['task']]} / {r['repeat']+1} | {d['wallMs']:+.2f}% | {d['totalTokens']:+.2f}% | {d['knownAllModelTokens']:+.2f}% |\n"
text+=f'''
四对中有 {sum(r['increasePercent']['wallMs']<0 for r in s['pairs'])}/4 对更快、{sum(r['increasePercent']['knownAllModelTokens']<0 for r in s['pairs'])}/4 对已知总 token 更少。第二对日志比裸组慢约 17 秒，抵消了其他配对的时间改善；记录筛选第二次的 token 也更多。保留这些负面结果，不将平均 token 下降写成每个任务都节省。

## 这次具体修了什么

此前通用 MCP 工具说明要求读取完整 skill，导致普通证据任务多读一次说明、多走一轮 GPT，并在本地已经能够解析时仍调用筛选。此次将普通只读操作的参数和限制放在 `jev_evidence` 工具说明中；完整 skill 改为配置、诊断、浏览器协调、授权记忆和交接等高级操作入口。明确先使用原生精确搜索、本地模板分组，已解决时继续原任务。

这不是关闭 Jev：本轮真实路由请求 {B['jevCalls']} 次，实际原生应用 {B['nativeAppliedChanges']} 次，失败 {B['jevFailures']} 次。普通任务读取完整 skill {skillReads} 次。针对这两类可以本地处理的样本，语义筛选调用为 {B['evidenceOperations']}；因此收益不能归因为“Jev 分类省了这些 token”。分类、回读和其他能力的实现与工具入口仍保留，按需自动使用。

同时保留此前已验证的有限期降档、完整记录分块、批次预检、关键证据保护和原文回读。真实组件验证及六模型原生协议证据见 [上一轮完整报告](../repair-v17-20260924/README.zh-CN.md)。上一轮总体表现不佳的结果仍然公开。

安装收尾另增加旧助手兼容迁移：只识别已知原版 `jev-assistant` 文档哈希，先备份，再把它变为插件缺失时的 fallback；自定义文档、链接或冲突备份保持不动。旧助手命令和凭据文件保留，避免同一任务通过两个入口重复判断。此迁移不在隔离 A/B 中，不能归入上面的节省数字。

## 功能与测量边界

- 普通任务结果、源文件保持、事件引用、金额状态等使用原有独立验收，8/8 通过。代码与安装回归最终 224 项通过。
- 保留用户档位上限、失败/新输入/过期恢复、错误和未知状态证据、权限边界；没有降低排除概率阈值。
- 时间是原生 app-server 的整个任务时间，含 Jev 等待和工具工作；不是桌面点击响应。启动单列于 CSV。
- 原生累计用量与逐生成增量核对，重复通知不重复计数；两处 Jev 账本按精确合成项目合并且无重叠。Jev 未知用量 {B['jevUnknownUsage']} 次。
- 缓存、生成路径和服务等待仍有波动，只有 4 个配对；没有统计显著性或稳定加速结论。测试发生于 macOS，三系统 CI 不代表三系统性能实测。
- 之前的 12 次修复回归、所有真实 Jev 开发尝试和一个主动中断的未配对裸任务均单独保留于上一轮报告。主对话开发、编排、报告整理消耗不包含在这 8 个隔离任务内。

[逐次 CSV](runs.csv) · [完整轨迹](runs.json) · [工作流核对](workflow-audit.json) · [冻结协议](protocol.json) · [逐生成用量](generations.csv) · [token 差额分解](token-decomposition.csv)

付费复现：`node scripts/acceptance/factorial-run.mjs --run --release-ab --case-ids=incident,semantic --candidate-root=<immutable-plugin-snapshot> --out=<new-directory>`。务必使用新目录保留全部样本。
'''
(out/'README.zh-CN.md').write_text(text)
(out/'README.md').write_text(f'''# Ordinary-entry repair: frozen follow-up

[Full Chinese report](README.zh-CN.md) · [Runs CSV](runs.csv) · [Raw evidence](runs.json)

Eight real tasks, four matched pairs, GPT-6 Astra initially high, balanced AB/BA and sequential. All eight accepted.

Observed change: GPT tokens {change('totalTokens'):+.2f}%; known GPT+Jev tokens {change('knownAllModelTokens'):+.2f}%; backend task time {change('wallMs'):+.2f}%. Token reduction was observed overall, but speedup was not achieved. Small regression sample, not guaranteed savings or subscription-debit evidence.

Real Jev routing calls: {B['jevCalls']}; native changes applied: {B['nativeAppliedChanges']}. No full skill reads or evidence delegation for these locally resolvable fixtures. All capabilities remain available. Do not attribute the token difference to Jev classification.

Earlier unsuccessful repair experiments and the twelve-run v17 campaign remain in [the previous report](../repair-v17-20260924/README.zh-CN.md); their samples are not mixed into this summary.
''')
m=json.loads((out/'manifest.json').read_text());m['reportFiles']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.iterdir()) if f.is_file() and f.name!='manifest.json'};(out/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps(audit))
