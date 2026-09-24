# Codex alpha.16.4 重启兼容核验 · 2026-09-25

本次重启后，上一轮工作流优化已经进入当前会话：直接调用现有 `jev_pilot select_tools`，必用工具返回 `source: policy`，保留结果正确，零 Jev 判断。

同时，Codex 原版运行时从已验证的 `0.155.0-alpha.16.3` 更新成 `0.155.0-alpha.16.4`。启动日志记录兼容回退，doctor 显示 `compatible=false`、活动调档桥为 0。普通 Codex 继续运行，但当时没有后台自动调档；不能把 MCP 插件可用等同于调档桥已启用。

## 根因与修复

- 精确版本验证拒绝未知的 alpha.16.4。已完成协议验证后，将此精确版本加入兼容列表；下一版本及相似版本仍拒绝，不扩大到整个版本前缀。
- 保持缓存的 `reasoning_effort_override` 开关也只允许 alpha.16.3。修复前 27 项中 21 项通过、6 个模型的缓存保持断言失败：请求顶层 effort 随调档改变。单独显式启用该原生开关的验证通过后，将 alpha.16.4 加入开关适用范围。
- 用户显式指定开关/关闭开关仍优先；没有调整判档算法、模型、排除门槛或付费预算。

## 验证结果

- 修复后 **27/27 原版引擎合成端点验证通过**。包含 GPT-6 Astra/Sol/Luna、GPT-5.6 Sol/Terra/Luna 的切档与缓存前缀保持、人工档位优先、失效回退、恢复、并行工具边界和证据调用链。
- **329/329 本地回归测试通过**，静态及密钥扫描通过。
- 插件和后台适配层已更新。已安装启动器独立启动成功，可信钩子 2 个，确认启用原生 effort override，运行记录指纹与安装指纹一致。
- 独立启动明确标记 `synthetic`，不计为当前桌面已激活；测试进程已结束。
- 这些兼容性测试 **额外付费 Jev/GPT 请求均为 0**（不包含本次开发对话用量）。这些是兼容性验证，不是新的省时、省 token 或账户额度对照。

## 重启后的现场确认

2026-09-25（北京时间）用户正常重启后，现场 doctor 确认 alpha.16.4 兼容、调档桥进程存活、加载指纹与安装指纹一致。真实运行桥于 `2026-09-24T17:21:12.628Z` 启动，PID 95776，原版后端 PID 95781，`nativeEffortOverrideRequested=true`，策略为 `effort-v17-bounded-final-lease`。本次加载确认后无需再次重启。

当前任务已产生真实 Jev 判档，建议 keep/high，状态 unchanged；原版用量记录中的 effort 为 high。证明自动判档已经恢复，但本次没有实际改档回执，不能把启动开关当作当前任务已经降档。

当前会话直接调用必选工具选择入口，结果为 `source: policy`、`reason: REQUIRED_TOOL`，保留必选工具，无需 Jev 判断。GitHub Actions 第 36033351093 次运行的 Windows、macOS、Linux 检查、构建、测试和打包均成功。CI 通过不等于 Windows/Linux 的交互式桌面验收。

此次仅验证重启生效，不新增性能 A/B，不据此声称节省时间、GPT token 或账户额度。自动判档自身用量单独记录在现场证据中。

原始证据：[修复前协议结果](native-before.json)、[修复后协议结果](native.json)、[验证汇总](validation.json)、[安装与独立启动](deployment.json)、[真实重启与当前任务判档](restart-activation.json)、[工作流入口与三系统 CI](restart-checks.json)。
