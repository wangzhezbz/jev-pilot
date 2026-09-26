# Windows 兼容修复定向复验

候选版本：`0.2.0+codex.20260926180000`。本轮不改调档策略，不修改官方插件代码，不做新的性能宣传。

## 已完成的代码修复

- Node 配置：支持 TOML 单引号路径、单行混合引号数组与注释；格式不支持时明确报 UNSUPPORTED_CONFIG，不再把 JSON 解析错误隐藏成 CONFIG_UNAVAILABLE。
- Windows 路径：识别本次脱敏实机配置的版本化 OpenAI.Codex 安装目录，校验 node_repl.exe 与同目录 node.exe；保留路径、命名管道、信任项和原有允许项。只增加缺失代理变量名及 NODE_USE_ENV_PROXY，显式关闭设置不覆盖。未知安装布局仍停止。
- Computer Use：支持官方 Windows Window2 的 window/get_window_state/accessibility.tree/click 参数；固定应用和窗口身份，观察失败立即废弃旧候选，不使用旧索引继续执行。
- 控件解析：支持实机的 `9 按钮 7 ID: 137` 格式。
- 默认点击请求新截图及 AX，遵守 Windows 宿主的几何信息要求。若截图/几何不可用，停止；不猜坐标、不自动重试。
- 计算器有显式单键模式：仅限 win32calc.exe/CalculatorApp.exe，使用当前可见候选和人工核对的按键映射，不依赖截图。该模式不代表任意 Windows 应用都能操作。

验证：完整本地回归 394 项通过；随后调整截图请求方式，对应 41 项回归通过。Windows 真实机器的修复后验证尚未完成。Chrome tabs.list 超时的根因仍未知，配置修复不等于通道已恢复。

## 交给 Windows Codex 的任务

1. 从提供的新 ZIP 解压到新的固定目录。先读本文件及 INSTALL.md，通过现有个人插件更新流程安装候选，保留密钥、原模型、全局档位、其他插件和数据。使用包内 Windows x64 启动器，无需重新安装 Go。不要下载旧 preview-20260926 包替代本候选，也不要只改版本字符串。
2. 更新插件后按安装文档准备桌面适配层；正常重启后核对新版本、加载指纹和实际加载文件。读取本任务新鲜工具文档。
3. 先只读执行 `node scripts/cli.mjs browser-network`。对于报告中的布局应不再是 CONFIG_UNAVAILABLE；若状态为 repair_available，再使用现有 `--repair`，核对备份和最小差异。若已由正常启动流程修复，直接检查结果，不重复修改。
4. 新配置只作用于新插件进程。按官方方式重载相关宿主，检查新进程状态，使用官方 Chrome 接口最多复测一次 tabs.list。超时则保留阶段和脱敏错误，不继续付费浏览器选控、不反复重装、不自行开 TUN。
5. Windows Computer Use 先从新 inventory 选定计算器窗口。按本机官方文档获取新 AX；若已知截图不可用，可在本次显式选择计算器单键模式。使用 `createComputerUseDriver({sky, window, policy, scope, calculatorKeys})`；scope 必须核对真实计算器视图并返回其原样子串。不要使用网页 scope 伪装应用身份。
6. calculatorKeys 的键名来自这一次观察的允许按钮，值为已核对的单个按键，例如中文按钮 `7`→`7`、`乘`→`asterisk`、`等于`→`Return`。仅允许数字及 plus/minus/asterisk/slash/period/Return。先由官方工具清理独立计算器测试状态，再让 Jev 在实时候选中选择，完成一个至多 4 步的简单运算。给任务目标，不把固定按钮序列作为 Jev 的判断。缺少按钮证据或身份变化就停止。
7. 记录实际 Jev 请求、选中候选、press_key/点击回执、新 AX 和独立核算结果。没有真实 Jev 选择的纯键盘操作，不算 Jev 联动验收。最多 4 次新增可观测 Jev 请求，不新增 GPT 独立任务来刷中途改档；共享预算不足则停止并报告。
8. 输出脱敏报告：配置解析及修复前后状态、Chrome 是否恢复、Windows 适配是否加载、采用点击还是显式单键、实际 Jev/宿主调用和独立结果。截图故障、普通应用点击未覆盖及 Chrome 超时如实单列；不报告节省率。

本候选保留 macOS 旧接口。没有修改本机 Mac 的已安装版本；本次给 Windows 更新使用。
