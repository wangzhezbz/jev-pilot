# JevPilot roadmap / 开发路线

This is a delivery plan, not a list of shipped capabilities. Milestones are accepted with evidence; no release dates are promised here.

这是交付计划，不是已经实现的功能清单。每个阶段以验收证据完成，不在此承诺发布日期。

| Milestone / 阶段 | Deliverable / 交付内容 | Acceptance / 验收条件 | Status / 状态 |
| :--- | :--- | :--- | :--- |
| Project foundation / 项目基础 | Bilingual overview, identity, license, roadmap / 中英文介绍、视觉、许可、路线 | Links and assets checked; product status explicit / 链接和素材检查，明确产品状态 | Initial documentation / 首版文档 |
| Unified setup / 统一入口 | Shared core; macOS, Windows and Linux adapters; configuration and diagnostics / 共享核心、三平台适配、配置、诊断 | One setup flow; credentials remain local; clean uninstall and fallback verified on each supported client / 一个配置入口，密钥本地保存，按实际客户端验证卸载与回退 | Planned / 规划中 |
| Effort routing / 推理调度 | Bounded decisions and runtime receipts / 有边界的判档与运行时回执 | Recommendations distinguished from actual outgoing effort; unsupported clients fall back / 建议与真实请求强度分开记录，不支持时回退 | Planned / 规划中 |
| Context selection / 上下文筛选 | Search ranking and recoverable tool-output filtering / 搜索排序、可恢复输出过滤 | Original evidence retrievable; missed evidence and rework measured / 原始证据可补读，统计遗漏与返工 | Planned / 规划中 |
| Recovery and checks / 恢复与检查 | Failure categories and task-appropriate completion evidence / 失败分类、适合任务的完成证据 | Repeated failures handled; missing evidence never counted as a pass / 处理重复失败，不把证据缺失视为通过 | Planned / 规划中 |
| Browser assistance / 浏览器协作 | Bounded internal browser loop / 有边界的内部浏览器操作 | Stale targets rejected; uncertain results return to Codex for verification / 拒绝过期目标，不确定结果交回 Codex 核验 | Planned / 规划中 |
| Public preview / 公开预览 | Versioned packages, compatibility table, measured results / 版本包、兼容表、实测结果 | End-to-end install/use/update/uninstall tested on declared platforms / 在声明支持的平台实测安装、使用、升级和卸载 | Planned / 规划中 |

## Architecture commitments / 架构约定

- One user-facing installation; shared decision logic with separate client/platform adapters.
- No requirement to manage many skills or invoke a separate runner for ordinary tasks.
- A tool or skill description alone does not change the main conversation's reasoning effort. An adapter must prove the actual effect.
- Platform names are targets, not proof of equivalent Codex desktop availability. Each supported client/version needs its own evidence.
- Jev failures must preserve a usable Codex workflow. Original evidence must remain available after filtering.
- Bring original implementations across only after separating experimental code, machine-specific paths, secrets, and tests. This repository does not yet contain the earlier local prototype.
- 第三方代码按原许可证处理；不把参考项目整体搬入后统一改署名。

## Validation / 验证

Use synthetic or explicitly authorized samples. Compare the same task and model with balanced execution order. Record end-to-end duration, available GPT usage, Jev overhead, acceptance, and rework. Test shared behavior once and platform behavior on the actual declared platform. A macOS run cannot certify Windows or Linux support.

使用合成或明确授权的样本，对同一任务和模型平衡测试顺序。记录完整耗时、可获取的 GPT 用量、Jev 开销、验收与返工。平台行为必须在实际声明支持的平台验收；macOS 通过不能代表 Windows 或 Linux 通过。

[English overview](../README.md) · [中文介绍](../README.zh-CN.md)
