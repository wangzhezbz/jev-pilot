<p align="center">
  <img src="assets/hero.zh-CN.svg" width="100%" alt="JevPilot：复杂任务，交给 Codex。重复判断，交给 Jev。一个插件，自动调档、筛选上下文、辅助失败恢复。项目处于早期开发阶段。" />
</p>

<p align="center">
  <a href="#平台与下载"><img src="assets/windows.zh-CN.svg" width="32%" alt="Windows：规划中，暂无安装包" /></a>
  <a href="#平台与下载"><img src="assets/macos.zh-CN.svg" width="32%" alt="macOS：规划中，暂无安装包" /></a>
  <a href="#平台与下载"><img src="assets/linux.zh-CN.svg" width="32%" alt="Linux：规划中，暂无安装包" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>
<p align="center"><a href="#怎么协作">协作方式</a> · <a href="#计划整合的能力">产品能力</a> · <a href="docs/ROADMAP.md">开发路线</a> · <a href="https://github.com/wangzhezbz/jev-pilot/releases">版本发布</a> · <a href="LICENSE">MIT 许可证</a></p>

# JevPilot

**一个 Jev 插件，保持你习惯的 Codex 使用方式。**

JevPilot 正在将推理强度调度、上下文筛选和失败恢复整合进一个 Codex 插件。我们的目标是：安装一次、连接 TypeSafe 账户，之后照常对话，Jev 在内部完成适合它的小判断。

**当前为早期开发阶段：** 本仓库目前提供项目介绍与开发路线，尚无公开安装包或可运行插件。下列能力是计划实现的产品目标。

## 怎么协作

你描述任务，Codex 负责计划、实现和最终验收，Jev 在过程中处理有边界的判断。

<p align="center"><img src="assets/workflow.zh-CN.svg" width="100%" alt="计划中的协作：用户正常向 Codex 提问；Codex 计划、实现、验收；JevPilot 协助判档、筛上下文和判断失败原因。" /></p>

例如，你说“帮我修这个报错”：我们希望 JevPilot 在内部筛出相关搜索结果和日志片段，区分临时网络故障与代码错误；Codex 继续核对证据、修改代码并检查结果。

## 计划整合的能力

| 能力 | 解决什么问题 |
| :--- | :--- |
| **自动推理强度调度** | 为当前步骤选择合适强度，并区分判档建议与实际应用结果。 |
| **搜索与文件筛选** | 先筛相关候选，再深入阅读，减少无关材料。 |
| **可恢复的输出过滤** | 长日志和工具输出先保留重点，原文仍可补读。 |
| **失败识别与恢复** | 区分失败原因，减少无效重复操作。 |
| **完成证据检查** | 对照任务需要的检查及真实结果，核对完成声明。 |
| **浏览器小步骤代办** | 执行有边界的页面操作，再交回 Codex 验收。 |
| **真实效果统计** | 展示实际调用、已应用的变化、耗时与可获取的 token 用量。 |

这些模块将逐步通过一个安装入口交付。用户无需维护一组 Skill，也无需每次输入专门的触发语。

## 平台与下载

| 目标平台 | 公开安装包 | 适配状态 |
| :--- | :--- | :--- |
| Windows | 尚未发布 | 规划中，待验证 |
| macOS | 尚未发布 | 规划中，待验证 |
| Linux | 尚未发布 | 规划中，待验证 |

三平台是共同目标。实际兼容情况会按操作系统、Codex 客户端和版本分别验证后公布，不代表这些平台当前都有相同的桌面客户端或接入能力。顶部平台卡片目前链接到本节。

安装包准备好后，将在 [Releases](https://github.com/wangzhezbz/jev-pilot/releases) 发布，并附上已测试的兼容范围。目前没有需要运行的安装命令。

## 怎么证明好用

- **耗时：** 记录整个任务用时，包含 Jev 判断与失败重试。
- **用量：** 分别记录能够获取的输入、缓存输入、输出和推理 token，Jev 用量单独列出。
- **质量：** 记录任务验收、证据遗漏、补读与返工。
- **是否生效：** 判档建议和真实切档回执分别统计。

降低档位、缩短工具输出，都不直接等于整项任务更快或账户额度更省。我们会公开任务条件与测试方法，不承诺适用于所有任务的节省比例。

## 开发计划

第一阶段先完成共享核心、三平台适配框架、统一配置、诊断与正常 Codex 回退。之后接入检索筛选、失败恢复，再扩展浏览器协作。

完整里程碑见 [开发路线](docs/ROADMAP.md)。欢迎在 [Issues](https://github.com/wangzhezbz/jev-pilot/issues/new) 提供希望测试的具体任务、系统和 Codex 版本；请勿附带 API Key 或私人日志。

## 许可证与归属

本项目原创代码与视觉素材采用 [MIT 许可证](LICENSE)。未来整合第三方代码时，保留其适用许可证和署名，详见 [第三方声明](docs/THIRD_PARTY_NOTICES.md)。

JevPilot 是独立社区项目，并非 OpenAI 或 TypeSafe 官方产品。Jev 由 [TypeSafe](https://typesafe.ai/) 提供。
