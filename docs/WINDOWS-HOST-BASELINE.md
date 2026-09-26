# Windows 官方宿主基线：计算器与 Chrome

本轮已完成，结果见 [基线分析](reports/windows-host-baseline-20260927.md)。后续使用 [定向隔离说明](WINDOWS-HOST-ISOLATION.md)，不要重复本文件的四键测试。

把本文交给 Windows 上的 Codex 执行。本轮承接 WINDOWS_PROGRESS_RESULTS.md，不安装新包、不改插件缓存版本、不重新配置密钥、不主动重启 Codex 或 Chrome。保留当前 JevPilot、模型、推理强度、代理和其他插件配置。本轮不调用 Jev，不做性能 A/B。

## 为什么要做

上一轮 Jev 已正确选择 7 和加，宿主发送了 `7` 和 `plus`。加号后完整 AX 在额外等待 150 ms 后仍不变，JevPilot 因此停止。尚不能判断是加号没送到，还是计算器内部已收到但 AX 没有可观察变化。这里用固定、有限的原生运算诊断这个差别；它不是 Jev 自动操作验收，也不授权修改生产进度保护。

## 一、计算器：仅运行一次 7 + 2 =

1. 先读取本机当前官方 Computer Use 接口说明。沿用官方宿主，不改插件内部文件、不使用另一个控制通道。前轮已验证接口为 `sky.get_window_state({window,include_screenshot:false,include_text:true})` 和 `sky.press_key({window,key})`；以本机实际文档为准。若接口已变，不猜参数，记录差异后停止该项。
2. 获取新鲜 inventory，唯一绑定测试用计算器窗口，验证应用身份。窗口不唯一且不能明确选定时先澄清；不要触碰其他应用。通过文档支持的方式清零，并重新读取 AX，独立确认结果为 0。窗口句柄只保留在本地内存，不导出。
3. 在同一个已绑定窗口，逐次调用官方 `press_key`，键值依次为 `7`、`plus`、`2`、`Return`。每次都等待调用结束并新读 AX 后再继续；不要并发、补按或循环。每步检查窗口仍为同一测试计算器，记录键值、调用是否返回成功、可见结果与可见表达式（没有则写 null）。若官方不支持其中某个键值，记录明确错误并停止，不凭空试其他键名。
4. **仅限本次四键诊断**：加号后 AX 未变化也继续到下一键，目的是测试不可见中间状态。不要调用 JevPilot 的 browserStep/run，不修改其生产进度保护，不把宿主返回成功等同于加法生效。宿主报错或窗口身份变化立即停止。
5. Return 后再独立调用一次 get_window_state，核对结果是否为 9。导出每步计算器脱敏 AX 和最后一次独立 AX。若不为 9，记录实际值及错误，不重新投 Jev、不换按键组合重试。

结论必须按证据填写：

- 最终为 9 且 plus 后 AX 不变：该窗口存在有效但 AX 不可见的中间状态，足以支持设计计算器专用的有限过渡规则；还不能证明 Jev 驱动完整流程通过。
- 最终不为 9：原生四键路径未通过，继续检查键值和宿主语义；此结果不能归因于 Jev 推理。
- 中途宿主错误：记录失败阶段，结论为基线未完成。

## 二、Chrome：解除无效前置条件后只重试一次

前轮扩展、Native Host、profile dry-run 已通过。窗口清单不暴露 profile、运行中的 node_repl 不开放 process.env，都是当前接口的观测限制，不再将它们当作禁止尝试连接的条件。

1. 读取本机当前官方 Browser 文档及 chrome-troubleshooting，使用其规定的 Chrome 入口。不要改 manifest、代理、TUN 或环境变量，不重复安装扩展。
2. 按官方故障流程打开插件所选 profile 的一个新窗口；如文档要求用户同意，先向用户说明并取得同意，不强制退出现有 Chrome。前轮官方流程提供过 `node scripts/open-chrome-window.js --browser chrome`，仅在本机当前文档仍提供此工具时，从该插件目录使用；不要自行猜 profile 名或目录。新窗口只用空白页。
3. 等待官方要求的初始化时间（前轮文档为 2 秒），通过官方浏览器会话调用一次 `tabs.list()`。若当前接口更名，使用当前文档对应的标签枚举方法并写明名称。只保留成功/失败、标签数量、耗时、脱敏错误与失败阶段，不导出私人标题或 URL。
4. 若失败，保留本次错误和官方诊断结论即停止；不循环重试、不重启浏览器、不使用 Computer Use 控制 Chrome 来替代 Chrome 插件验收。若因权限或工具缺失未执行，明确写未执行及原因。

## 输出

生成 `WINDOWS_HOST_BASELINE_RESULTS.md` 和 `WINDOWS_HOST_BASELINE_EVIDENCE.json`。报告至少包含：

- `jevCalls: 0`（指本轮测试主动调用数；如发现后台路由调用，另列，不计作绝对零消耗）。
- `calculator`: initialResult、各 step 的 key/accepted/error/result/expression/脱敏 AX、独立 finalResult/finalAx、sameWindowVerified、passed。
- `chrome`: officialEntry、selectedProfileWindowOpened、tabsListAttempted、tabCount、elapsedMs、error、blockedReason。
- 保持生产保护不变、未安装新包、未重启、未修改配置的实际情况；若有必要偏差须明确列出。

不包含 API Key、账户、个人路径、窗口句柄、profile 名称、私人标签数据、原始环境变量或认证头。本轮只判断接口是否有效，不写节省时间、token 或费用的结论。
