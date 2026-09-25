// Public report assembly from reconciled observations; no inference or execution.
import {readFile,writeFile} from 'node:fs/promises';
import {gptRequestCost,jevRequestCost,PRICE_SNAPSHOT} from '../../src/cost.mjs';
const root=process.argv[2]||'docs/reports/comprehensive-20260925';
const read=async p=>JSON.parse(await readFile(root+'/'+p,'utf8'));
const pct=(a,b)=>100*(b/a-1),num=n=>Number(n).toLocaleString('en-US'),s=n=>(n/1000).toFixed(2),change=n=>n==null?'未知':(n>0?'+':'')+n.toFixed(2)+'%';
const names={cross_file:'跨文件修复',incident:'日志调查',repository:'370 文件仓库溯源',semantic:'180 条语义筛选'};
const campaigns=[];
for(const [id,label]of [['sol','首次冻结 · GPT-6 Sol'],['astra','首次冻结 · GPT-6 Astra'],['repair','入口修复追加 · GPT-6 Sol'],['shipping','最终收窄入口 · GPT-6 Sol']])campaigns.push({id,label,cost:await read(id+'/costs.json'),summary:await read(id+'/summary.json'),runs:await read(id+'/runs.json')});
const ui=await read('browser/usage.json');
for(const run of ui.runs){
 const parts=run.cells.map(c=>gptRequestCost(c.model,{inputTokens:c.usage.input_tokens,cachedInputTokens:c.usage.cached_input_tokens,outputTokens:c.usage.output_tokens,cacheWriteInputTokens:c.usage.cache_write_input_tokens||0}));
 const j=jevRequestCost('jev-1.13.0',run.jev?.inputTokens||0),bg=run.backgroundJev?.inputTokens||0;
 run.apiCost={gptKnownUsd:parts.reduce((n,p)=>n+(p.usd||0),0),jevKnownUsd:j.usd,backgroundJevKnownUsd:jevRequestCost('jev-1.13.0',bg).usd,unknownCalls:parts.filter(p=>p.usd==null).length+(run.jev?.unknownUsage||0)};
 run.apiCost.knownUsd=run.apiCost.gptKnownUsd+run.apiCost.jevKnownUsd+run.apiCost.backgroundJevKnownUsd;
}
await writeFile(root+'/browser/costs.json',JSON.stringify({basis:'Standard public API equivalent, not account debit. Current long-task episodes; shared bootstrap excluded.',priceSnapshot:PRICE_SNAPSHOT,priceVerifiedAt:'2026-09-25',runs:ui.runs.map(({id,apiCost})=>({id,...apiCost}))},null,2)+'\n');
const out=[];const add=x=>out.push(x);
add('# JevPilot 全面实测：时间、GPT token、质量与失败记录\n\n2026-09-25 · macOS 实测 · 原版 Codex 后端 + 官方 Chrome / Computer Use。首次冻结版本 20260925164800，入口修复 20260925173800，最终收窄入口 20260925175000；前两阶段结果不冒充最终版本完整矩阵。');
add('**结果有明确的场景差异，不能宣传为全面加速。** 首次冻结的 Sol 组有总体收益，Astra 组总体变慢且增加 GPT token；Computer Use 文档导航减少了 GPT 往返，Chrome 则暴露了交接与共享预算耗尽后的额外开销。失败、计量异常和修复追加数据全部保留。');
add('最终版本的仓库定位追加对照 4/4 通过，两对均更快：耗时 −36.00%、GPT token −20.97%、含 Jev 的 API 等价费用 −30.35%。这仅对应该场景的两对实测，不是最终版本全矩阵或普遍收益。36 次模型任务和 10 次界面任务最终功能验收均通过，首次界面记录有一次计量异常。');
add('## 原生模型任务\n\n比较同模型、初始 high 的原生基线与完整 JevPilot 候选，未切换成更小模型。以下各行分别计算，不将不同模型、不同修复版本混为一个营销比例。负数表示候选更少。');
add('| 组别 | 验收 | 原生 / 候选耗时 | 耗时变化 | 原生 / 候选 GPT token | token 变化 | 含 Jev 费用变化 |\n|---|---:|---:|---:|---:|---:|---:|');
for(const c of campaigns){const a=c.cost.arms.bare,b=c.cost.arms.combined,v=c.cost.comparison;add(`| ${c.label} | ${a.passed+b.passed}/${a.runs+b.runs} | ${s(a.wallMs)} / ${s(b.wallMs)}s | ${change(v.timePercent)} | ${num(a.totalTokens)} / ${num(b.totalTokens)} | ${change(v.gptTokensPercent)} | ${change(v.costPercent)}${v.costPercent==null?'（存在未知用量）':''} |`);}
add('费用是公开 API 等价估算，Standard 假设；各组 `costs.json` 另有 Fast 敏感性数据。不是订阅额度或账户扣款。进程与插件启动另列于 CSV 的 startupMs / totalMs。');
add('### 每一对结果\n\n| 组别 | 任务 / 重复 | 双方验收 | 耗时变化 | GPT token 变化 | 费用变化 |\n|---|---|---|---:|---:|---:|');
for(const c of campaigns)for(const p of c.summary.pairs){const cost=c.cost.pairs.find(x=>x.task===p.task&&x.repeat===p.repeat);add(`| ${c.label} | ${names[p.task]} / ${p.repeat+1} | ${p.bothPassed?'通过':'未通过'} | ${change(p.increasePercent.wallMs)} | ${change(p.increasePercent.totalTokens)} | ${change(cost?.costPercent)} |`);}
add('### 实际调用与调档\n\n| 组别 | GPT 生成次数：原生 / 候选 | Jev 请求 / 失败 / 未知用量 | Jev 输入 / 输出 | 实际应用改档 |\n|---|---:|---:|---:|---:|');
for(const c of campaigns){const a=c.summary.arms.bare,b=c.summary.arms.combined;add(`| ${c.label} | ${a.generations} / ${b.generations} | ${b.jevCalls} / ${b.jevFailures} / ${b.jevUnknownUsage} | ${num(b.jevInputTokens)} / ${num(b.jevOutputTokens)} | ${b.startChanges+b.nativeAppliedChanges} |`);}
add('推荐不是实际改档：最后一列仅统计首步实际转发不同档位及原生 applied 回执。回退恢复另见明细。不能把最后阶段的一次降档说成整个任务都在低档运行。');
add('## Chrome 与 Computer Use\n\n两组均在当前真实桌面长会话中运行；原生组由 GPT 逐次选择，候选组让 Jev 选择可见 AX 控件，GPT 验收。后台桌面判档保持启用，单独按任务账本核对，界面区间内没有本任务额外判档请求。它是导航策略对照，不是卸载插件对照。');
add('| 原始运行 | 耗时 | GPT 生成 | GPT 总 token | GPT 非缓存输入 | 浏览器 Jev 请求 | 结果 |\n|---|---:|---:|---:|---:|---:|---|');
for(const r of ui.runs)add(`| ${r.id} | ${s(r.elapsedMs)}s | ${r.gptCalls} | ${num(r.gpt.total_tokens)} | ${num(r.gpt.uncached_input_tokens)} | ${r.jev?.jevRequests||0} | ${r.passed?'页面验收通过':'未通过'}${r.measurementValid===false?'；计量异常':r.fallback?'; '+r.fallback:''} |`);
add('### 有效配对\n\n| 平台 / 目标 | 耗时变化 | GPT 总 token 变化 | GPT 非缓存输入变化 |\n|---|---:|---:|---:|');
for(const p of ui.pairs)if(p.measurementValid)add(`| ${p.platform} / ${p.task} | ${change(p.timePercent)} | ${change(p.gptTotalPercent)} | ${change(p.gptUncachedPercent)} |`);
add('首次 Chrome 文档基线完成了页面操作，但测试辅助函数保存计时时引用了失效的 REPL 绑定；原始行含修复时间，标记计量异常，不计算该对的节省率。补测 `document2` 的整对完整保留：候选因共享等待预算不足而全部原生回退，反而更慢。没有增加配额、换 taskId 或删除不利样本。');
add('报表两次 Jev 委托均在最初的 Analytics 入口选择上返回 review；GPT 操作一步后，原会话继续并成功。这三次额外交接轮次不是免费成本。文档六步委托无需接管，节省较明显。六步 AX 点击并不代表任意网站、登录、图像识别或坐标操作都获得同样收益。');
add('## 本轮修复与未解决的问题\n\n1. **命名大文本入口漏检。** 目标文件排在目录枚举后面、文件名后带句号时，现在可正确识别；只检查元数据，不读取正文或调用 Jev。搜索提示避免通用行号和时间戳。\n2. **工作目录歧义。** 两次自然语义任务都曾把 `workspace` 传成 `.`，MCP 在插件目录解析导致 ENOENT。现明确要求任务绝对目录，并在任何处理前验证；错误会指导 agent 使用正确 cwd，不让用户手工补文件。修复后的实际 MCP 调用及状态见追加组。\n3. **元数据采样偏差。** 原来只看前 80 个文件，可能全是小代码文件；现在仍最多 stat 80 个，但分散到完整列表。无命名文本时跳过逐路径名称匹配。识别覆盖改善不等于必然加速。追加两对仓库定位都出现负向结果后，最终版本不再对以 find/locate/trace 或查找/定位/追踪开头的任务自动推荐广泛调查；工具仍可使用，命名大文本和广泛 review/reconcile 提示保留。\n4. **Astra 的复杂生成仍未解决。** 首次跨文件候选多出约 74 秒，Jev 请求累计仅约 2.25 秒。额外生成轮次、工具定义输入、生成/网络等待共同存在；没有证据把全部差异归因于 Jev 延迟。两次实际降档都较晚，不能据此承诺复杂代码工作受益。\n5. **浏览器目标拆分与预算回退。** 多条件整体目标在入口处可能不够明确，交接会增加 GPT 轮次。长会话共享预算耗尽后也可能为一次不执行的委托付出额外轮次。本轮保留这些保护，没有为了好看而关闭验证、修改权限或增加额度。\n6. **查询与结果恢复仍有开销。** 宽泛 OR 查询可能匹配大量噪音并提前触及检索上限；外部判断超时后，GPT 需要恢复取证。追加样本中的此类情况单独记录，不能把工具成功返回当成真实 Jev 筛选成功。');
add('## 14 项功能验收\n\n最终本地回归 **354/354**；原版引擎协议 **27/27**；真实 Jev 功能验收 **12/12**（修复前后各跑一次）。下列“通过”指功能/边界验收，不代表每项都证明节省 GPT。\n\n| # | 功能 | 本轮证据与边界 |\n|---:|---|---|\n| 1 | 自动判断 | 多语言分类、注入样本、判断缓存；真实 API 结果验收通过 |\n| 2 | 自动推理强度 | 真实任务 applied 回执；六种模型名的引擎协议/缓存验证；收益分模型报告 |\n| 3 | 搜索与文件筛选 | 搜索/回读、源行号/hash、截断覆盖说明；自然任务目录错误已修复，仍需关注宽泛查询 |\n| 4 | 可恢复输出过滤 | 关键证据保留，原文可完整恢复；不能拿字节缩减当原生 token 节省 |\n| 5 | 工具选择 | 相关工具保留、无关工具排除；不会移除原生工具 |\n| 6 | 失败识别与恢复 | 429、等待、重复失败升级；危险建议不执行；真实浏览器交接完成 |\n| 7 | 完成证据与质量 | 真检查回执、伪造跨平台声明拒绝、文件变化失效、多语言含义校验 |\n| 8 | Chrome / Computer Use | 官方插件真实 UI，全部最终页面通过；保留计量异常、两次 review 和预算回退 |\n| 9 | 项目记忆 | 合成授权场景：默认禁用、启用、冲突、忘记、源变更失效；未改用户全局记忆 |\n| 10 | 效果统计 | 原生逐生成用量与总量核对、Jev 账本去重、未知费用不当零 |\n| 11 | 上下文交接 | 保护规则/最新需求/未完成及写操作块、调用结果配对、原文回读；不重写原生历史 |\n| 12 | 改动评审与测试选择 | 强制/变更/相关回归保留，不相关测试可延后；不会用它跳过本轮独立验收 |\n| 13 | 检查点与恢复 | 文件 hash 改变要求重新验证，保留未完成清单，不自动重放 |\n| 14 | 原文精确抽取 | 姓名/日期原文位置核对；不存在或不明确的字段不编造 |');
add('## 复核文件\n\n- [详细方法与计量边界](METHOD.md)、[首次冻结协议](protocol.json)、[修复追加协议](repair-protocol.json)、[最终入口协议](shipping-protocol.json)、[界面补测协议](ui-supplement-protocol.json)。\n- 原生任务：[Sol CSV](sol/runs.csv)、[Astra CSV](astra/runs.csv)、[修复追加 CSV](repair/runs.csv)、[最终入口 CSV](shipping/runs.csv)；各目录的 `runs.json` 保留完成结果、工具调用、独立验收、路由回执和用量，`token-decomposition.csv` 给出 token 差额分解。\n- 界面：[逐次 CSV](browser/runs.csv)、[原始页面与回执](browser/ui-runs.json)、[原生 GPT 用量对应关系](browser/usage.json)、[真实 Jev 账本](browser/request-audit.json)、[界面模块与最终版的字节一致性](browser-runtime-equivalence.json)。\n- [最终回归日志](final-regression.txt)、[原版协议验证](final-native/native.json)、[真实 Jev 功能验收](final-features/features.json)。\n\n样本是已用于开发的合成工作负载，每模型/任务仅两个重复，界面每目标仅一对有效对照；不是未见生产样本，也不是普遍收益证明。Mac 实机结果不能替代 Windows/Linux 的真实宿主验收。公开数据去除了机器目录及推理内容，原始私有证据保留在本地 dist，绝不提交密钥。');
await writeFile(root+'/README.zh-CN.md',out.join('\n\n')+'\n');
const overview={date:'2026-09-25',finalCandidate:'0.2.0+codex.20260925175000',regression:{passed:354,total:354},nativeProtocol:{passed:27,total:27,paidModel:false},liveFunctional:{passed:12,total:12},
 nativeTaskRuns:campaigns.reduce((n,c)=>n+c.cost.runs.length,0),nativeTaskPassed:campaigns.reduce((n,c)=>n+c.cost.runs.filter(r=>r.passed).length,0),
 uiRuns:ui.runs.length,uiPassed:ui.runs.filter(r=>r.passed).length,uiMeasurementInvalid:ui.runs.filter(r=>r.measurementValid===false).length,
 campaigns:campaigns.map(c=>({id:c.id,label:c.label,arms:c.cost.arms,...c.cost.comparison})),uiPairs:ui.pairs,
 scope:'Separate versions, workloads and models; do not pool into a universal saving claim. Previously used synthetic fixtures; native backend tasks and current-desktop UI episodes have different timing boundaries. All negative results retained.'};
await writeFile(root+'/summary.json',JSON.stringify(overview,null,2)+'\n');
console.log(JSON.stringify(overview,null,2));
