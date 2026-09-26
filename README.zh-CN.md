<p align="center"><img src="assets/hero.zh-CN.e322cba4a04b.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.zh-CN.svg?v=download20260926" width="32%" alt="windows x64 — 下载" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.zh-CN.svg?v=download20260926" width="32%" alt="macos arm64 — 下载" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.zh-CN.svg?v=download20260926" width="32%" alt="linux x64 — 下载" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**一个插件，照常使用 Codex。让 Jev 接手有明确范围的小判断，让 Codex 专注计划、实现和最终验收。**

## 它如何帮你工作

你像平时一样提需求。JevPilot 在适合的步骤协助判断、筛选材料和操作界面，Codex 继续负责复杂推理与最终结果。不用下载一堆组件 Skill，不用另开任务运行器，也不用每次输入专门的触发词。

## 实测亮点

### 精选任务对照

| 实测场景 | 耗时 | GPT token | 含 Jev 的估算费用 |
| --- | --- | --- | --- |
| [文档筛选](docs/reports/targeted-20260925/README.zh-CN.md) | −40.03% | −23.88% | −33.69% |
| [工单稳定排序修复](docs/reports/holdout-20260925/README.zh-CN.md) | −25.64% | −17.13% | −5.25% |
| [区间差集修复](docs/reports/holdout-20260925/README.zh-CN.md) | −14.20% | −12.58% | −31.40% |

### 浏览器与桌面操作窗口

| 实测场景 | 耗时 | GPT token | 含 Jev 的估算费用 |
| --- | --- | --- | --- |
| [Chrome 记录查询](docs/reports/holdout-20260925/README.zh-CN.md) | −41.03% | −55.91% | −54.87% |
| [Computer Use 多步导航](docs/reports/targeted-20260925/README.zh-CN.md) | −47.64% | −57.14% | −56.52% |

### 组件实测

| 组件 | 实测效果 |
| --- | --- |
| [必用工具选择](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 保留全部 12 项必用工具，不必要的 Jev token 从 2,090 降至 0 |
| [审查与测试选择](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 相比旧版，耗时减少 22.69%，Jev token 减少 53.93%，9 个必测项全部保留 |
| [重复交接判断复用](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 连续 5 次交接，请求从 5 次降至 1 次，Jev token 减少 80.25%，原文全部保留 |
| [无损上下文交接](docs/reports/localization-handoff-20260925/README.zh-CN.md) | 完整表示从 5,439 降至 2,713 字节，体积减少 50.12%，6 组交换全部可恢复 |

以上为真实场景实测。 [测试场景与完整数据](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

## 14 项核心功能

| # | 功能 | 能帮你做什么 |
|---:|---|---|
| 1 | **自动判断** | 分类、筛选、固定候选选择，批量处理并复用重复判断。 |
| 2 | **自动调整推理强度** | 按任务步骤调整实际请求强度，保持你选择的模型。 |
| 3 | **搜索与文件筛选** | 先找相关材料，再深入阅读，保留来源位置。 |
| 4 | **可恢复的输出过滤** | 长日志和文档先展示有效证据，原文随时可补读。 |
| 5 | **工具与 Skill 选择** | 保留必需工具，挑选当前任务适用的能力。 |
| 6 | **失败识别与恢复** | 识别限流、重复失败和执行异常，控制重试并交回 Codex。 |
| 7 | **完成证据与内容质量** | 核对真实执行结果、内容规则及翻译一致性。 |
| 8 | **Chrome 与 Computer Use** | 接现有官方插件，让 Jev 连续处理限定范围内的界面点击。 |
| 9 | **项目记忆** | 按授权保存项目信息，带来源、有效期和撤销能力。 |
| 10 | **真实用量与效果统计** | 分别记录 GPT/Jev 用量、估算费用和实际切档回执。 |
| 11 | **上下文压缩与交接** | 可恢复的精简交接，重复文本无损表示，保护约束与未完成工作。 |
| 12 | **改动审查与测试选择** | 优先检查相关改动，保留必测项与不确定项。 |
| 13 | **检查点与任务续接** | 保存阶段进度，续接前核对文件变化。 |
| 14 | **原文精确提取** | 返回原文片段和位置，对缺失或含糊字段明确标记。 |

## 从 GitHub 安装

把下面这句话发给 Codex：

> 请从 https://github.com/wangzhezbz/jev-pilot 安装 JevPilot，作为一个个人 Codex 插件。检查依赖和兼容性，引导我在本地页面填写 TypeSafe Key，配置后在重启时核验生效。

[详细安装、停用与恢复](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)
