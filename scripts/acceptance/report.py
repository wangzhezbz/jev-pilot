"""Render the publishable Chinese report from measured data, including failures."""
import json, statistics
from pathlib import Path
p=Path('docs/reports/validation-20260923')
read=lambda n:json.loads((p/n).read_text())
s=read('summary.json');runs=read('runs.json');features=read('features.json')['rows'];followup=read('followup.json')['rows'];browser=read('browser.json');native=read('native.json')['rows'];unique=read('unique-log.json')
engineering=read('engineering-evidence.json') if (p/'engineering-evidence.json').exists() else None
def num(v):return '未测得' if v is None else f'{v:,.0f}'
def pct(v):return '不适用' if v is None else f'{v:+.2f}%'
def metric_table(obj):
 lines=['| 指标 | 固定 medium | Jev 自动 | 节省率 |','|---|---:|---:|---:|']
 labels={'wallMs':'累计耗时（秒）','inputTokens':'GPT 输入 token','cachedInputTokens':'其中缓存输入 token','uncachedInputTokens':'非缓存输入 token','outputTokens':'GPT 输出 token','reasoningOutputTokens':'其中推理输出 token','totalTokens':'GPT 总 token'}
 for k,label in labels.items():
  v=obj['metrics'][k];scale=1000 if k=='wallMs' else 1
  lines.append(f"| {label} | {v['fixedTotal']/scale:,.2f} | {v['autoTotal']/scale:,.2f} | {pct(v['savingPct'])} |")
 return '\n'.join(lines)
jev_calls=[e for r in features+followup for e in r['events'] if e['kind']=='jev_call']+browser.get('usageEvents',[])+[e for e in unique['events'] if e['kind']=='jev_call']+[e for e in (engineering or {}).get('events',[]) if e['kind']=='jev_call']
ft={k:sum(e.get(k)or 0 for e in jev_calls)for k in ['inputTokens','outputTokens','elapsedMs']}
failures=sum(e.get('status')=='failed'for e in jev_calls)
eff=s['allAttemptsTotals']
paired_metrics=s['matchedQualityAccepted'].get('metrics',{})
def observed(k,measure):
 v=paired_metrics.get(k,{}).get('savingPct')
 return '尚无完整对照' if v is None else f"{measure}{'减少' if v>=0 else '增加'} {abs(v):.2f}%"
headline=f"在双方通过预定验收的 {s['matchedQualityAccepted']['pairs']} 对任务中，自动组相对固定 medium 的{observed('wallMs','耗时')}，{observed('totalTokens','GPT 总 token')}。"
if s['finished']:headline+=' **本轮确认了实际接入，但没有证明这版默认策略能普遍省 token 或加速；局部有效与整项任务收益必须区分。**'
else:headline+=' 这是未完成实验的阶段性统计。'
lines=[f'''# JevPilot v10：功能、实际接入与性能验收

测试日期：2026-09-23。对象：`effort-v10-bounded-recovery`，Jev `jev-1.13.0`。代码基线、系统版本和运行环境见 [environment.json](environment.json)。

**报告状态：{'48 次预注册模型任务均已尝试' if s['finished'] else '性能实验尚未完成；不得作为最终节省结论发布'}。实际尝试 {s['attemptedRuns']}/{s['plannedRuns']} 次，达到“任务结束且独立验收通过”的有 {s['successfulRuns']} 次；完整且双方通过的对照有 {s['matchedQualityAccepted']['pairs']} 对。**

{headline}

本报告是项目维护者在单台 macOS 机器上的可复现实测，不是独立第三方审计。测试输入为人工设计的合成工程场景，不是随机抽取的真实生产任务。报告保留失败、超时、无收益和未验证项目；不引用之前不完整的性能实验来补足本轮样本。

## 先看证据边界

| 层次 | 本轮证据 | 可以说明什么 | 不能说明什么 |
|---|---|---|---|
| 普通桌面 | [普通任务回执](ordinary-routing.json)、此前正常重启后确认 v10 加载 | 当前普通会话实际调用了 Jev，并有真实首步 effort 转发回执 | 当前所有功能都自动触发、当前对话节省多少 |
| 模块实测 | 首轮 {len(features)} 组真实 Jev 功能用例；{sum(r['pass'] for r in features)} 组达到全部预定断言；另有 {len(followup)} 组独立补充诊断 | 分类、过滤、校验等模块的实际行为与局部收益 | 每个自然任务都能得到相同收益 |
| 宿主接口 | {sum(r['passed']for r in native)}/{len(native)} 组原版 Codex 引擎 + 合成模型端点 | effort 请求参数、原生应用回执、手动设置优先、降级与过滤接口确实工作 | 真实模型质量、实际模型 token 或速度 |
| 真实模型对照 | {s['attemptedRuns']} 次付费/账户额度模型任务，预注册 48 次 | 相同任务和验收标准下的耗时、token、失败差异 | 普遍节省比例、账户扣费和所有用户的体验 |
| 浏览器 | Chrome 扩展与原生 Computer Use 各完成两步任务 | Jev 选择 → 新观察 → 单次执行 → 页面验收这条链可用 | 已证明浏览器比纯 Codex 更快 |

## 测试设计

完整 [预注册协议](protocol.json)、[逐次数据](runs.csv)、[成对数据](pairs.csv)、[详细回执与产物](runs.json)、[生成文件与测试源码](generated-files.json)、[统计摘要](summary.json) 均随报告公开。协议在首个计时任务前写入，固定任务、顺序、起始档位、代码哈希和停止规则。模型执行期间没有调整产品策略来追逐更好的结果。

- 模型：GPT‑6 Astra、GPT‑6 Sol、GPT‑6 Luna、GPT‑5.6 Sol。
- 每模型 3 类任务，每任务重复 2 次，每次固定组与自动组各运行一次，共 48 次、24 对；顺序在模型、任务与重复间交替。
- 两组均以 **medium** 开始，与当时桌面默认档位一致。固定组保持 medium；自动组允许 Jev 按实际策略提高或降低档位，并启用输出过滤。
- 固定组使用相同桥接层和工具钩子，判档器替换为零网络的 `keep`，关闭语义过滤。因此这是相同适配层下的产品开关对照，不是完全裸 Codex 的基准。
- 单个计时模型任务串行执行，240 秒截止；独立验收在计时结束后执行。明确的模型限额错误或执行器抛出的 `infrastructure_error` 会停止实验，不替换失败结果。
- 工具和系统指令对两组一致。任务工作区独立、临时、没有真实业务数据；模型不能读取隐藏验收器，禁止修改受保护样本。
- 记录输入、缓存输入、非缓存输入、输出、推理输出、总 token，以及 Jev 的请求次数、失败、耗时和已知用量。

**对照范围：自动判档与原生文本输出过滤。** 为隔离这两条宿主路径，模型任务关闭 apps、设置 `selectedCapabilityRoots=[]`，并明确禁止读取 skills、访问外部项目及调用子代理；其余模块通过真实 Jev 功能用例单独验收。这里没有测出“14 项模块全部共同启用”的整体收益，也没有为每项建议型功能建立独立 GPT 基线，不能声称每一项都已证明省时或省 token。

**协议描述的不足：** `stopRule` 中的 infrastructure 一词过宽；冻结的执行器实际以异常分类和明确限额消息判断停止。模型在回合内的 `Reconnecting…` 会先按原版引擎机制重试，达到 240 秒后记为失败并继续下一任务。原始日志公开这一行为，本轮没有将这些失败改成成功，也没有选择性补跑。它增加了延迟比较的不确定性。

### 三类任务与独立验收

| 场景 | 实际工作 | 验收重点 |
|---|---|---|
| 并发故障修复 `bug_fix` | 修复 Promise 合并器；编写回归测试和故障说明 | 同键共享 Promise、不同键独立、成功和失败后可重试、同步抛错转拒绝、没有额外未处理拒绝、不改复现文件 |
| 事件账目重建 `mixed` | 按规格修复事件归并器；生成账目和说明 | 全局 ID 去重、版本与平局规则、删除墓碑、统计与排序、不改输入，另有 80 组固定种子的隐藏样本 |
| 长日志事故分析 `incident` | 从 540 行运维日志定位连接池回归，包含无关行、反证和未知影响 | 8 处分散证据、12/80 的失败比例、DNS 假设被推翻、回滚与恢复、结算影响保持未知，结构化结果与文字报告都包含证据 ID |

长日志任务要求先读取充分长度的日志，是有意设置的“长工具输出”场景。结构化交付物命名为 `findings.data`，提示词没有使用 JSON 关键词，以免精确输出保护让这个过滤诊断场景完全旁路。实际文件仍用严格 JSON 解析验收。这是刻意暴露过滤边界的用例，不代表真实用户的提示词和读取习惯，也不能用其触发率推算日常覆盖率。[验收器反向测试](oracle.json) 拒绝未修复代码、错误根因、编造安全结论、错误比例和漏掉关键反证。

验收器也有边界：事故报告的结构化字段严格校验，正文检查长度和证据 ID 覆盖，不是逐句语义证明；工程任务的解释文档也不是逐句评分。额外的 [Codex 文字复核](semantic-review.json) 保留了“没有 503”被写宽成“全部成功／没有故障”的问题。预注册通过率不因事后加规则而重写，但不能解读为产物文字毫无问题。这个附加复核不是独立人工审计。

**覆盖限制：** 为了检验原生文本工具边界，两组都关闭了 `code_mode` 和 `code_mode_host`。当前普通桌面经常使用嵌套 code-mode 工具，JevPilot 明确跳过这些输出。因此该对照测得的过滤收益不能直接推广到所有桌面工具；判档链路与过滤覆盖率必须分别看。

## 14 项功能逐项结果

| # | 功能 | 本轮实际验证 | 作用与结论 |
|---|---|---|---|
| 1 | 自动判断 | 10 条含中、俄、日、法文及提示注入的分类全部符合预设标签；重复调用命中缓存 | 模块可用，重复请求避免再次调用 Jev；普通语义功能依靠 Codex 调用统一工具，并非无条件接管每次判断 |
| 2 | 自动推理强度 | 6 个受支持模型的原版引擎请求参数验证；真实模型对照另记录首步与中途回执 | 实际可改档，模型保持不变；建议、参数已转发、原生 applied 三种证据分开统计 |
| 3 | 搜索与证据筛选 | 相关与矛盾证据保留；12 条无关候选实际去除 9 条，未达预设至少 10 条目标；独立搜索、来源哈希和截断提示通过 | 有效但不是满分：去噪不足，不是误删关键证据；低概率候选继续保留供 Codex 检查 |
| 4 | 可恢复输出过滤 | 真实 Jev 正向场景和原版引擎文本/MCP 边界；全文 recall 相等；负向场景不替换，重复进入冷却 | 重复内容较多的正向用例 30,868 → 2,526 UTF‑8 字节，减少 91.82%，其中包括确定性去重；独立无重复日志超时后原文放行。这是字节数，不是 GPT token 节省；真实任务另计 |
| 5 | 工具与技能选择 | 源码读取、修改、必需测试保留；无关邮件与天气工具被排除建议集 | 减少候选选择负担；不会删除宿主真实工具 |
| 6 | 失败识别与恢复 | 429 建议遵守 Retry-After；拒绝无变化重试/破坏性候选；三次同错升级；桌面超时恢复接口验证 | 有界建议与安全降级可用；不是自动修复一切错误，不赋予建议执行权限 |
| 7 | 完成证据与内容质量 | 当前通过回执被认可；虚构 Windows 验收和过期回执被拒绝；正确中日翻译通过、篡改数字/承诺的俄韩翻译被识别 | 防止无证据完成声明、数字及产品承诺漂移；最终验收仍由 Codex 承担 |
| 8 | Chrome / Computer Use | 两条真实驱动各两步；6 次 Jev 尝试包含 2 次超时，重试后完成；已消费票据不能重用 | 两条链确实可用，但仍需宿主 Codex 观察和执行；未测出相对纯 Codex 的提速 |
| 9 | 项目记忆 | 默认禁用、测试区显式启用、冲突提示、撤销、来源修改后失效 | 生命周期检查通过；一次检索含服务失败后保守保留，不能当成排名正确性证据；没有修改用户真实长期记忆 |
| 10 | 统计与面板 | 已知用量与底层调用回执相符、缓存计数、未授权请求 403、五语言资源、运行版本一致 | 未测节省显示 null；`missingUsage` 只统计成功但缺字段的调用，不包含失败请求的未知用量，字段含义需要澄清；五语言是接口检查，不是逐语言视觉验收 |
| 11 | 上下文压缩 | 首次原用例因 Jev 超时保留全部内容；独立小样本 571 → 343 字节；较长多阶段交接 45,521 → 2,571 字节，指令、写操作、反证、错误、待办保留，全文可恢复 | 长交接文本减少 94.35%，再次调用复用 12 个判断、不新增 Jev 请求；这是交接字节数，不是 GPT token 或时间节省；不替换首次失败，也不会改写宿主历史 |
| 12 | 变更审查与测试优先级 | 拒绝清理缺陷被标记；相关、必需、已改测试保留；无关颜色测试可延后 | 可用于分流，不替代代码审查和全部强制检查 |
| 13 | 检查点与恢复 | 文件修改触发重新验证，待完成事项保留；原版引擎自动快照/续接、当前普通任务恢复证据 | 能恢复任务线索，不能把保存的进度当作已验收完成；不自动重放副作用 |
| 14 | 原文抽取 | 从旧/当前负责人区分出当前俄文姓名与截止日期；未给电话、未定审阅者不编造；偏移与原文逐字一致 | 样本通过；正确来源片段仍不等于业务事实已被独立证实 |

额外的 [无重复日志诊断](unique-log.json) 使用 240 行不同内容、25,514 字节：1.816 秒后因服务超时降级，没有输出替换；原文与关键证据完整保留。不能把重复内容样本的 91.82% 当作一般语义筛选效果。

功能原始结果：[首轮](features.json)、[独立补充诊断](followup.json)、[浏览器](browser.json)、[原版引擎](native.json)、[面板](dashboard.json)。首轮断言失败是报告的一部分，不用后续通过将它抹掉。

## 性能结果

![成对任务耗时与 token 对照](paired-results.png)


以下节省率统一为 `(固定组 − 自动组) / 固定组`。**负数表示自动组更慢或消耗更多。** 比较表只使用双方按时结束且独立验收通过的完整配对；失败任务的次数、耗时和已用 token 在后面单列。这个子集存在幸存者偏差，不能据此忽略自动组失败。
''']
if s['matchedQualityAccepted']['pairs']:lines.append(metric_table(s['matchedQualityAccepted']))
lines+=['\n### 按模型分组\n','| 模型 | 完整合格配对 | 耗时节省 | GPT 总 token 节省 | 非缓存输入节省 |','|---|---:|---:|---:|---:|']
for m,v in s['byModel'].items():
 if v['pairs']:lines.append(f"| {m} | {v['pairs']} | {pct(v['metrics']['wallMs']['savingPct'])} | {pct(v['metrics']['totalTokens']['savingPct'])} | {pct(v['metrics']['uncachedInputTokens']['savingPct'])} |")
 else:lines.append(f'| {m} | 0 | 未形成完整配对 | — | — |')
lines+=['\n### 按任务分组\n','| 任务 | 完整合格配对 | 耗时节省 | GPT 总 token 节省 |','|---|---:|---:|---:|']
for t,v in s['byTask'].items():
 if v['pairs']:lines.append(f"| {t} | {v['pairs']} | {pct(v['metrics']['wallMs']['savingPct'])} | {pct(v['metrics']['totalTokens']['savingPct'])} |")
lines+=['\n### 不确定性与失败\n']
for k,label in [('wallMs','耗时节省'),('totalTokens','总 token 节省')]:
 if k in s.get('exploratoryClusterBootstrap95',{}):
  lo,hi=s['exploratoryClusterBootstrap95'][k];lines.append(f'- {label}的探索性 95% 聚类自助区间：{pct(lo)} 至 {pct(hi)}。')
lines.append('以模型×任务为簇，保留重复的关联性，固定随机种子、10,000 次重采样。该区间仅描述这批合成样本；每个格子只有两次重复，不能当跨用户或跨任务的可靠总体区间。')
lines+=['','| 组别 | 尝试 | 按时完成且验收通过 |','|---|---:|---:|']
for arm,v in s['qualityByArm'].items():lines.append(f"| {arm} | {v['attempted']} | {v['passed']} |")
lines+=['\n包含失败的全部成对尝试（不是质量等价的节省比较）：\n','| 组别 | 尝试 | 通过 | 累计实耗秒 | 已记录 GPT token | 用量缺失 |','|---|---:|---:|---:|---:|---:|']
for arm,v in s.get('allPairedAttempts',{}).items():lines.append(f"| {arm} | {v['runs']} | {v['passed']} | {v['wallMs']/1000:.2f} | {num(v['knownTotalTokens'])} | {v['unknownUsageRuns']} |")
for r in runs:
 if not r['passed']:
  lines.append(f"\n- `{r['id']}`：状态 `{r['status']}`，耗时 {(r.get('wallMs') or 0)/1000:.2f}s，已记录 {num(r.get('totalTokens'))} GPT token；独立产物检查 {'通过' if (r.get('quality')or{}).get('pass') else '未通过'}。" )
lines.append(f'''
### 实际切档、筛选与额外开销

- GPT 用量缺失任务：{len(s.get('missingGPTUsageRuns',[]))} 次；未知保持未知，所有尝试的累计 token 只表示已记录量，不是完整账单。
- 本轮对照中的真实 effort 改变：{eff['effortChanges']} 次，其中首步参数转发 {eff['firstParameterChanges']} 次，中途原生 `applied` {eff['nativeAppliedChanges']} 次。保持原档不计为切换，建议未应用也不计。
- 自动输出替换：{eff['outputFilters']} 次，回执中的减少量合计 {num(eff['filteredBytes'])} 字节；不能直接当 token。
- 改档方向：升档 {s['activation']['upshifts']} 次、降档 {s['activation']['downshifts']} 次；{s['activation']['runsWithAppliedEffortChange']}/{s['activation']['automaticRuns']} 个自动任务至少有一次真实改档。
- 能力列表不可用事件：固定组 {s['activation']['metadataUnavailableByArm']['fixed']} 次、自动组 {s['activation']['metadataUnavailableByArm']['auto']} 次；自动组的路由降级分类为 `{json.dumps(s['activation']['routingFallbacksByCode'],ensure_ascii=False)}`。任务交付成功不能证明其判档链也启用了。
- 输出替换中，包含语义排除的有 {s['activation']['filterResultsWithExclusion']} 次，仅延后部分材料、没有语义排除的有 {s['activation']['filterResultsWithDeferralOnly']} 次。后者是材料预算控制，不能描述成 Jev 成功识别并删掉了无关内容。
- 对照实验 Jev：{eff['jevAttempts']} 次尝试，{eff['jevFailures']} 次失败；已知输入 {num(eff['jevInputTokens'])}、输出 {num(eff['jevOutputTokens'])} token，请求累计等待 {eff['jevElapsedMs']/1000:.3f}s。失败调用的远端计费量未知，不假定为零。
- 功能与浏览器实测另计：{len(jev_calls)} 次尝试，{failures} 次失败；已知输入 {num(ft['inputTokens'])}、输出 {num(ft['outputTokens'])} token，累计调用耗时 {ft['elapsedMs']/1000:.3f}s，不混入性能配对。
- 按 [TypeSafe 官网](https://typesafe.ai/) 当日公布的每十亿输入 token 42 美元，仅对照实验的**已知输入费用估算**为 ${s['jevInputOnlyEstimateUsd']:.6f}。这不是账单，未包含失败请求未知用量，也没有推算 Codex 订阅额度节省。

缓存输入属于输入，推理输出属于输出，不重复相加。Jev 和 GPT 的 tokenizer 与计价不同，不把二者 token 直接相加做“净节省率”。没有读取账户扣款变化；本报告只能回答已测模型 token 和时间。

## 已观察到的限制与后续优先项

- 自动调档不是无限逐步重判：每个用户回合最多六次，其中普通重判最多四次，其余留给紧急情况。当前长会话的回执显示早期六次判断已用完；之后不能声称每个步骤仍由 Jev 重新定档。
- 有效建议可以升档，起始 medium 不代表自动组始终更便宜。应针对真实任务分布校准升档收益，同时保留复杂任务质量。
- 无重复长输出在短截止时间下会失败；重复输出的本地去重收益与语义筛选收益需要分开。
- 输出被缩短但证据被延后时，模型可能继续读取材料，减少的字节不等于最终减少 token。应评估重读次数和完整任务用量。
- 普通桌面的嵌套输出覆盖不足，以及 Windows/Linux 真机验证仍然缺失。
- 面板回执中 16 次调用有 2 次失败，但 `missingUsage=0`；源码定义只计成功且缺输入字段的调用。这个字段不能表示“全部远端用量都已知”。本报告独立把失败调用列为用量未知，后续应改进产品字段和说明。

以上是后续优化方向，本轮没有边测边改产品策略。

## 影响解释的限制

1. 这批任务偏向工程修复和证据分析。它不代表简单格式处理、长时间机械操作或所有实际工作分布。medium 基线下，自动升档可能增加时间和推理输出；不能拿 high 基线的旧结果替换本轮数据。
2. 当前桌面常用嵌套 code-mode；本轮受控任务关闭 code-mode。文本过滤的实验覆盖范围比当前所有桌面工具窄，不能宣称全局透明压缩。
3. 机器没有独占：父会话与已有应用仍在运行，初期功能/浏览器/原版引擎检查与部分计时任务重叠。实验内部 GPT 任务串行，但绝对延迟仍受网络、服务端与系统活动影响。
4. 两组使用独立任务和工作区，云端缓存不能人工清空。报告公开缓存与非缓存量，而不是假定缓存命中一致。
5. 这是完整自动策略与固定档的比较，没有再做“仅判档/仅过滤”的消融实验。不能把所有差值都因果归于某一个模块。
6. 时间从任务请求开始到任务结束/截止，包含 Jev 和工具等待，不含宿主启动和离线验收。父会话准备测试、写报告的时间及 token 不计入子任务。
7. 首步 `start_parameter_forwarded` 证明实际传给原版引擎的参数，不是抓取了加密的远端模型请求。原版引擎到合成端点的线上字段由独立宿主测试验证，证据等级不同。
8. Windows/Linux 没有本轮真机桌面验收。六个模型的合成接口兼容通过，不等于每个模型都完成了真实质量与性能比较。没有新的签名安装包交付验收。

本轮本机回归 163/163 通过；另外核对了冻结代码基线的 [GitHub Actions](https://github.com/wangzhezbz/jev-pilot/actions/runs/35833789320)，Ubuntu、Windows、macOS 的 check/test/build/pack 均成功，详见 [baseline-ci.json](baseline-ci.json)。这是跨平台自动检查证据，不能替代 Windows/Linux 桌面实机验收。

## 如何复现与复核

需要 Node 24+、Python 3、rg、curl、受支持版本的原版 Codex 引擎、已登录的 Codex 账户和自己的 TypeSafe key。密钥只放私有 `.env.local`/环境变量。以下命令由开发者运行；普通用户使用插件不需要手工运行测试。

```sh
npm test
npm run check
node --use-env-proxy scripts/acceptance/features.mjs --run --out=dist/my-feature-run
node --use-env-proxy scripts/acceptance/followup.mjs --run --out=dist/my-followup-run
node scripts/acceptance/native.mjs --out=dist/my-native-run
node --use-env-proxy scripts/acceptance/run.mjs --run --out=dist/my-benchmark-run
python3 scripts/acceptance/analyze.py dist/my-benchmark-run docs/reports/my-validation
```

`--run` 会产生真实模型使用量。不要重复使用已有输出目录。浏览器需按 [浏览器协作规范](../../../../skills/jev-pilot/references/browser.md) 在现有 Chrome/Computer Use 驱动上执行 [本地用例](../../../../scripts/acceptance/browser-fixture.html)，记录实际观察；脚本模拟不替代驱动验收。

完整方法和输入可在 [任务生成器](../../../../scripts/acceptance/tasks.mjs)、[执行器](../../../../scripts/acceptance/run.mjs)、[独立验收实现](../../../../scripts/benchmark/tasks.mjs)、[统计程序](../../../../scripts/acceptance/analyze.py) 中审查。[TypeSafe API 文档](https://docs.typesafe.ai/api) 说明调用返回的模型标识与用量字段；本报告以实际返回值为准。

公开数据、图表、报告和本轮脚本的 [SHA‑256 校验清单](SHA256SUMS) 用于下载后核对文件一致性，不是第三方时间戳证明。
''')
lines += ['\n## 附录：功能用例的真实调用开销\n',
 '这些是模块的 Jev 开销，未设置逐模块 GPT 对照，因此不能从这张表推导节省。耗时为该用例内 Jev 请求耗时之和，包含失败等待；未记录到的失败用量仍未知。缓存命中不新增调用。完成证据首轮的算术回执仅检验凭据接入与失效边界；实际工程任务质量另由前述独立验收器检查。\n',
 '| 批次 / 用例 | 预定断言 | Jev 尝试 | 失败 | 已知输入 token | 已知输出 token | Jev 秒 |',
 '|---|---|---:|---:|---:|---:|---:|']
for batch, entries in [('首轮',features),('独立补充',followup)]:
 for r in entries:
  es=[e for e in r['events'] if e['kind']=='jev_call']
  lines.append(f"| {batch} / `{r['id']}` | {'通过' if r['pass'] else '未全部通过'} | {len(es)} | {sum(e.get('status')=='failed' for e in es)} | {num(sum(e.get('inputTokens')or 0 for e in es))} | {num(sum(e.get('outputTokens')or 0 for e in es))} | {sum(e.get('elapsedMs')or 0 for e in es)/1000:.3f} |")
if engineering:
 lines += ['\n### 实际工程产物的核验链\n',
  '主实验结束后，复制本轮首个固定组修复的 singleflight 工程产物，在新的合成工作区运行完整契约验收并交给完成核验模块。另把前面真实事故报告中的过度概括交给质量模块。这是独立补充诊断，不改变原来的通过率，也不代表模型任务会自动调用这些建议型模块。',
  '\n| 补充检查 | 结果 |','|---|---|']
 for c in engineering['checks']:lines.append(f"| `{c['id']}` | {'通过' if c['passed'] else '失败：'+str(c.get('error','unknown'))} |")
 lines.append('\n完整调用、失败和用量见 [engineering-evidence.json](engineering-evidence.json)，开销已计入前面的功能与浏览器合计。')
 lines.append('较长上下文用例包含 10 组已结束的旧任务读取，以及当前证据、反证、写操作、失败记录、待办和源文件位置。45,521 字节交接缩短为 2,571 字节，减少 94.35%；保护项与调用/结果配对完整，全文 recall 一致，第二次调用复用 12 个判断且没有新 Jev 请求。没有改写原生会话历史，也没有测量使用该交接后的 GPT 节省。')
text='\n'.join(lines).replace('../../../../','../../../')
(p/'README.zh-CN.md').write_text(text)
print(p/'README.zh-CN.md')
# Compact English entry page for GitHub; detailed methods and all 14 areas above.
paired=s['matchedQualityAccepted']; timing=paired.get('metrics',{}).get('wallMs',{}).get('savingPct'); tokens=paired.get('metrics',{}).get('totalTokens',{}).get('savingPct')
eng=f'''# JevPilot v10 validation — 2026-09-23

[完整中文报告](README.zh-CN.md) · [Raw runs](runs.csv) · [Paired data](pairs.csv) · [Protocol](protocol.json) · [Summary](summary.json)

**Status: {'all preregistered runs attempted' if s['finished'] else 'incomplete experiment — no final savings claim'}. {s['attemptedRuns']}/{s['plannedRuns']} attempted model tasks; {s['successfulRuns']} completed within the deadline and passed independent acceptance. {paired['pairs']} complete quality-passed pairs.**

For that matched subset, observed elapsed-time saving is **{pct(timing)}**, and GPT total-token saving is **{pct(tokens)}**. Negative saving means the automatic arm used more time or tokens. These are observations from synthetic tasks on one shared macOS host, not a general product guarantee. Read the failures alongside the successful subset.

![Paired task results](paired-results.png)

## What was tested

- Four real models: GPT-6 Astra, Sol, Luna and GPT-5.6 Sol.
- Concurrent Promise bug repair, event-ledger reconstruction, and 540-line incident analysis with contradictory and missing evidence.
- Fixed medium versus Jev automatic, identical medium starting effort, alternating arm order, two repetitions per model/task, 240-second deadline, single benchmark-model concurrency.
- {sum(r['pass']for r in features)}/{len(features)} first-pass functional suites met every assertion. Evidence screening missed its prespecified efficacy target (9/12 irrelevant items excluded instead of at least 10); context handoff timed out and preserved all evidence. Independent diagnostic follow-ups are reported separately, never substituted for these failures.
- {sum(r['passed']for r in native)}/{len(native)} native-engine contract scenarios passed with synthetic inference, including six model variants, manual settings, bounded recovery, resume, filtering and safe pass-through.
- Real Chrome extension and native Computer Use each executed two Jev-selected actions and verified the resulting page. Six decision attempts included two timeouts. Single-use ticket replay was rejected.
- Cached judgments, source recall, stale evidence, conflicting/revoked memory, exact-source offsets, unsafe/invented claims and required tests were checked. A duplicate-heavy filter fixture shrank bytes substantially; a separate nonrepeating log timed out and kept its original output.
- Five post-benchmark engineering integration checks passed using a copied real repair deliverable. A 45,521-byte multi-phase handoff shrank to 2,571 bytes with protected evidence intact and exact recovery; the second call reused 12 judgments without a new Jev request. This is handoff size, not native-history or measured GPT-token savings. See [engineering evidence](engineering-evidence.json).

## Important limits

The controlled benchmark disables code-mode in both arms to expose native text tool boundaries. Ordinary desktop nested code-mode outputs are **not automatically rewritten**. Direct module tests, real desktop activation, native synthetic tests and real-model performance are separate evidence levels.

The model benchmark also disables apps, sets `selectedCapabilityRoots=[]`, and prohibits accessing skills, external projects and subagents to isolate host effort routing and text-output filtering. Other modules were tested through live Jev functional fixtures, without individual GPT control arms. It is not an end-to-end comparison of all 14 modules working together, and it does not establish time/token savings for every feature.

The machine was not dedicated: normal applications and the parent conversation remained active, and early functional/browser/native checks overlapped some timed arms. No cloud-cache reset was possible. We report cached and uncached input separately. Latency excludes engine startup and offline acceptance. There is no graphical desktop wall-time, account debit, subscription-quota saving, component ablation or Windows/Linux real-desktop result here.

Reasoning tokens are already included in output tokens; cached tokens are already included in input tokens. Failed requests may have unknown remote usage. Jev tokens cannot be added to GPT tokens to infer equivalent cost. The [Chinese report](README.zh-CN.md) includes the input-only TypeSafe cost estimate and all limitations.

## Evidence and reproducibility

| Evidence | Artifact |
|---|---|
| Full model receipts, quality checks and generated deliverables | [runs.json](runs.json) |
| Read-only collection of generated source and test files | [generated-files.json](generated-files.json) |
| Feature first pass / independent diagnostics | [features.json](features.json), [followup.json](followup.json), [unique-log.json](unique-log.json) |
| Native engine / real host drivers | [native.json](native.json), [browser.json](browser.json) |
| Current ordinary task / dashboard API | [ordinary-routing.json](ordinary-routing.json), [dashboard.json](dashboard.json) |
| Installed source equality / frozen source hashes | [installed-source-match.json](installed-source-match.json), [source-integrity.json](source-integrity.json) |
| Environment / independent-oracle sensitivity | [environment.json](environment.json), [oracle.json](oracle.json) |
| Additional qualitative review of generated prose | [semantic-review.json](semantic-review.json) |
| Test fixtures and execution | [acceptance scripts](../../../scripts/acceptance) |

The plots are generated from the same CSV by Matplotlib; [SVG](paired-results.svg) and [PNG](paired-results.png) are provided. Statistical summaries use 10,000 fixed-seed cluster bootstrap draws, grouping by model/task; this small exploratory interval is not population evidence. Product code was frozen during measurement. Raw failed attempts remain included.
'''
(p/'README.md').write_text(eng)
