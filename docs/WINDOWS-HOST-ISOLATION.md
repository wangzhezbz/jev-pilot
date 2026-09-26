# Windows 定向隔离：按键、界面读取与外层超时

本轮已完成；后续使用 [小键盘与错误复验](WINDOWS-KEYPAD-ERROR-RECHECK.md)，不要重复本轮对照。

承接 WINDOWS_HOST_BASELINE_RESULTS.md。当前已知：7/plus/2/Return 每键都返回成功，逐步读 AX 后最终为 2；Chrome 一次 tabs.list 外层约 15 秒超时。两项均未通过。以下是诊断，不是 Jev 联动验收或性能测试。

不安装新包，不修改清单/配置/密钥/模型/代理，不重启应用，不主动调用 Jev，不修改 JevPilot 进度保护。主任务后台路由若有消耗，另列。只使用本机当前官方插件文档支持的接口。本地辅助文件不执行连接，只接收已有官方句柄。若运行环境禁止导入文件，则由 Codex 在官方 node_repl 中实现同样的计时和脱敏记录，不能为此修改可信路径。

## 1. 先补一条已有证据，不操作桌面

只读查找先前完成 17×23=391 的那次测试所保存的调用记录，提取精确 press_key 参数及调用之间是否执行 get_window_state。不扫描其他任务或凭据。若原始记录未保存，写 unavailable，不从成功结果倒推按键序列。

读取本机官方 press_key 文档，记录 key 参数对多个按键、组合键、Return、等号的定义；没有相关定义就写 undocumented。不要仅凭中文按钮名称推定宿主键名。

## 2. 计算器：对照最多三组，先不换键名

每组开始：从当前 inventory 绑定同一个独立测试计算器；官方 Escape 清零，新 AX 确认 0。每次调用记录阶段、实际用时、脱敏错误、焦点和可见结果。仅操作该窗口；每组结束独立读取 AX。所有按键仍各调用一次并等待返回，不并发，不用 shell 注入，不调用 JevPilot。

| 组 | 操作 | 要区分什么 |
| --- | --- | --- |
| A | 7 → 读 AX → 2 → 读 AX | 连续数字是否得到 72；若得到 2，问题不依赖运算符或等号 |
| B（仅当 A 不为 72） | 7 → 2 → 读 AX | 按键间不读 AX 是否恢复连续输入；每键仍是单独的官方调用 |
| C | 7 → plus → 2 → Return → 读 AX | 对比上一轮逐键读 AX 的最终 2，查看去掉中间观察能否得到 9 |

在 B/C 的短序列中不插入 AX 读取，不切换窗口或执行其他 UI 操作。固定有限序列只用于诊断，不授权生产流程省略观察与身份检查。任何宿主错误立即停止该组并停止后续按键；用户切换窗口或状态不确定时停止，不为补齐结果盲目继续。

判定：

- A=2、B=72：新增证据指向观察插入或其时序影响，需要进一步查官方读状态/焦点行为；还不能直接断定 get_window_state 必然有副作用。
- C=9：当前键名组合可以完成加法；此前带中间观察的失败与观察/时序相关。不能因此删除生产检查。
- A=72、C≠9：连续数字正常，继续聚焦运算符/等号和按键语义。
- A/B 都异常：优先检查单键调用、焦点或宿主输入行为；不要继续改 Jev 判断。

本轮不再试其他按键组合；把第 1 步的官方定义和既有成功调用交回，下一次只改有依据的一项。

## 3. Chrome：一条请求，分清谁超时

上一轮所选 profile 窗口已经打开，本轮不再开窗或重装。先读取当前官方 Browser 文档，通过官方 bootstrap 取得 chrome 会话。若 bootstrap 本身失败，记录阶段并停止，不声称 tabs.list 失败。

用随附 `windows-host-probe.mjs` 的 probeChromeTabs 包住已有会话的一次 tabs.list。示意代码中的路径和 browser 变量由 Windows Codex 按实际文件和官方会话绑定，用户无需手工改代码：

```js
var probe = await import(/* 随附 windows-host-probe.mjs 的实际文件 URL */);
var evidence = await probe.probeChromeTabs({
  browser, waitMs: 45000,
  emit: event => nodeRepl.write(event)
});
```

**这一条 node_repl 调用显式设置 timeout_ms: 60000**（仅在当前工具 schema 支持时）。内层只等 45 秒；这只改变诊断等待时间，不改插件全局超时。用 await 保持调用存活，不启动后立刻结束 cell。若工具只支持更短上限，记录限制，不再次发送 tabs.list。

- tabs_list_returned/success：只记录标签数和实际用时，不输出标题、URL。如果耗时超过 15 秒，说明旧等待窗口不足，但根本延迟原因尚未确定。
- tabs_list_returned/operation_error：调用在观察期内明确失败。辅助器只返回脱敏错误类别。Windows Codex 可在本机查看完整错误，只回传去除路径、URL、账户与凭据的固定错误码和调用阶段；不能用模糊类别编造底层原因。
- probe_wait_expired/pending：45 秒内没有完成，**底层请求未被取消**。停止，不再发第二条请求或其他浏览器动作。
- 只有 started，工具返回 node_repl_call_timeout：说明外层仍先中断或未回传完成。保存本次实际 timeout_ms 和外层错误；不能把它描述成浏览器明确返回连接超时。

辅助器不收集浏览器内容，不创建连接，不绕过官方工具，不重试。它在延迟拒绝时也接住异常，但不保证撤销已经发出的请求。

## 4. 返回文件

生成 WINDOWS_HOST_ISOLATION_RESULTS.md 和 WINDOWS_HOST_ISOLATION_EVIDENCE.json。包含：官方接口相关摘录、先前成功调用是否找到、计算器各组精确调用顺序/耗时/焦点/结果、Chrome 外层 timeout_ms 和完整脱敏阶段事件、配置保留情况、主动与后台 Jev 调用分别计数。

不导出窗口句柄、个人路径、profile 名、私人标签或密钥。不把某一次通过宣传为稳定兼容或提速。
