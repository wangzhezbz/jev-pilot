<p align="center"><img src="assets/hero.zh-CN.e322cba4a04b.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.zh-CN.svg?v=preview20260926" width="32%" alt="windows x64 — 下载预览版" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.zh-CN.svg?v=preview20260926" width="32%" alt="macos arm64 — 下载预览版" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.zh-CN.svg?v=preview20260926" width="32%" alt="linux x64 — 下载预览版" /></a></p>

<p align="center">[English](README.md) · [简体中文](README.zh-CN.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md)</p>

# JevPilot

**一个插件，照常使用 Codex。让 Jev 接手有明确范围的小判断，让 Codex 专注计划、实现和最终验收。**

[其他架构与校验文件](https://github.com/wangzhezbz/jev-pilot/releases/tag/preview-20260926) · [macOS Intel](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-x64.zip) · [Windows ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-arm64.zip) · [Linux ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-arm64.zip)

macOS 已做桌面实测 · Windows/Linux 为预览版：构建与 CI 已验证，桌面真机验收待完成。下载为未签名 ZIP，需 Node 24+、curl 和 ripgrep。

## 它如何帮你工作

你像平时一样提需求。JevPilot 在适合的步骤协助判断、筛选材料和操作界面，Codex 继续负责复杂推理与最终结果。不用下载一堆组件 Skill，不用另开任务运行器，也不用每次输入专门的触发词。

## 实测亮点

| 实测场景 | 耗时 | GPT token | 含 Jev 的估算费用 |
|---|---:|---:|---:|
| 文档筛选 | 减少 40.03% | 减少 23.88% | 减少 33.69% |
| Computer Use 多步导航 | 减少 47.64% | 减少 57.14% | 减少 56.52% |

以上为精选场景实测，每项两组配对，运行于 macOS。界面数据计量长会话中的操作窗口；费用采用 2026-09-24 API 等价价格快照。结果仅适用于这些样例，不是所有任务的固定收益保证。 [Data & methodology](docs/reports/targeted-20260925/README.zh-CN.md) · [All reports](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

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

## 一次安装，之后照常使用

1. 下载对应系统和芯片的 ZIP，解压到固定目录。
2. 打开 Codex，把下面这段话和解压目录发给它，由 Codex 检查依赖并安装。
3. 在本地设置页私密填写你自己的 TypeSafe Key，完成后正常重启 Codex。
4. 以后直接提需求即可。需要浏览器或电脑操作时，使用已有的官方 Chrome / Computer Use 插件。

> 请把这个解压目录里的 JevPilot 安装为个人 Codex 插件。检查依赖和运行时兼容性，打开本地设置页让我私密填写 TypeSafe Key，配置桌面适配层，并在重启后验证生效。保持我选择的模型和其他插件不变。

### 也可以直接从 GitHub 安装

> 请从 https://github.com/wangzhezbz/jev-pilot 安装 JevPilot，作为一个个人 Codex 插件。检查依赖和兼容性，引导我在本地页面填写 TypeSafe Key，配置后在重启时核验生效。

[详细安装、停用与恢复](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## 项目状态

开发预览版 · MIT 开源 · 支持英文、简体中文、俄语、日语和韩语。项目记忆需授权启用；上下文交接不改写原生聊天历史。这是独立社区项目，并非 OpenAI 或 TypeSafe 官方产品。
