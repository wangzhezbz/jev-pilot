<p align="center"><img src="assets/hero.zh-CN.e322cba4a04b.svg" width="100%" alt="JevPilot" /></p>

<p align="center">
  <a href="#availability"><img src="assets/windows.zh-CN.svg" width="32%" alt="Windows — 开发预览 · 查看状态" /></a>
  <a href="#availability"><img src="assets/macos.zh-CN.svg" width="32%" alt="macOS — 开发预览 · 查看状态" /></a>
  <a href="#availability"><img src="assets/linux.zh-CN.svg" width="32%" alt="Linux — 开发预览 · 查看状态" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**一个插件，保持你习惯的 Codex 使用方式。**

当前是可运行的开发预览版。14 项模块共用一个 MCP 入口、一个自动调用的 Skill 和桌面适配层。Codex 负责计划、实施和验收，Jev 负责有明确范围的小判断。

## 全部 14 项功能

| # | 能力 | 作用 |
| :--- | :--- | :--- |
| 1 | **自动判断** | 批量处理有明确候选的小判断，缓存重复请求，失败交回 Codex。 |
| 2 | **自动调整推理强度** | 改变实际请求中的强度，保持模型不变，记录原生应用回执。 |
| 3 | **搜索与文件筛选** | 按相关性筛选候选，保留原文位置，并说明遗漏范围。 |
| 4 | **可恢复的输出过滤** | 长日志先保留重点，原文完整保存，需要时可以补读。 |
| 5 | **工具与 Skill 选择** | 筛出适用工具，保留必需和不确定的候选。 |
| 6 | **失败识别与恢复** | 根据实际错误判断原因，避免原地反复重试。 |
| 7 | **完成证据与内容质量** | 核对真实执行结果、当前文件、内容规则和翻译一致性。 |
| 8 | **Chrome 与 Computer Use 协作** | 接现有插件，核对最新界面，每张操作票据只执行一次，再验收结果。 |
| 9 | **项目记忆** | 用户启用后按项目保存，附来源、有效期，处理冲突并支持撤销。 |
| 10 | **真实用量与效果统计** | 分别记录 Jev 开销、原生用量与真正应用的强度变化。 |
| 11 | **上下文压缩与交接** | 生成可恢复的精简交接，保留约束、错误和未完成工作。 |
| 12 | **改动审查与测试选择** | 定位应重点检查的改动，保留必测项与不确定项。 |
| 13 | **检查点与任务续接** | 保存阶段进度，续接前核对文件变化，避免盲目重放。 |
| 14 | **原文精确提取** | 返回原文片段和位置，不存在或含糊的字段明确标记。 |

<a id="availability"></a>

## 平台与使用

此预览版需要 Node 24+、curl 和 rg。一次安装插件并在本地配置自己的 TypeSafe Key，由 Codex 完成适配设置。日常照常提需求，不用另外建任务文件、运行独立入口或反复念触发词。详见[使用说明](docs/FEATURES.md)。

macOS、Windows、Linux 的核心自动检查已通过。macOS 原版引擎切档与 Computer Use 已实测；Windows/Linux 桌面会话仍需设备验收。真实 Chrome 扩展已在关闭 TUN 时通过 Jev 判断、单次执行和页面核验；代理继承修复只调整插件配置，不修改 Codex 本体。尚未发布公开签名安装器。

## 验证与边界

上下文功能提供可恢复的精简交接，不会改写原生历史或回收已经消耗的 token。不承诺固定的提速、省 token 或省额度比例。详见[整体验收报告](docs/reports/ACCEPTANCE.md)、[功能边界](docs/FEATURES.md)和[后续路线](docs/ROADMAP.md)。

最新实测：[2026-09-23 功能与性能报告](docs/reports/validation-20260923/README.zh-CN.md)公开真实调用、失败、逐次 token、耗时和可复现用例。局部压缩不等于完整任务节省。

JevPilot 采用 [MIT 许可证](LICENSE)。这是独立社区项目，并非 OpenAI 或 TypeSafe 官方产品。

成本回归修复：[v11 排查与真实复测](docs/reports/cost-fix-20260923/README.zh-CN.md)。自动档位以用户选择为上限；相关证据不因长度预算被扣留，暂不宣称稳定效率收益。

进一步排查：[深层成本审计与局部修复](docs/reports/deep-audit-20260923/README.zh-CN.md)，包含重复正文、无效复查、输入上限和正常桌面测试缺口。
