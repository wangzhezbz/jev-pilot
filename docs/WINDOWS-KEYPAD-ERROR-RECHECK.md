# Windows 小键盘映射与 Chrome 原始错误复验

本轮已结束。Windows 文档给出了 Numpad_Add/Numpad_Multiply；此文要求精确 KP_Add 的前置条件不再适用。后续以 [文档化键名复验](WINDOWS-DOCUMENTED-KEYS-RECHECK.md) 为准，不重复下面的旧门槛。

本候选修复两处已定位的缺口：计算器驱动之前拒绝已经实机成功的 KP_Multiply；Chrome 诊断之前丢弃原始错误，只返回 other。新增 KP_Add 是待实机验证的显式单键候选，不代表加法已经修好。不更改进度保护，不自动替换原有映射。

本轮先解压，不安装候选、不改缓存版本、不重启、不改密钥/模型/代理/其他插件，不主动调用 Jev。保留当前安装。候选中的模块可以由 Windows Codex 在官方宿主内按实际路径导入；如果宿主禁止导入，不修改可信路径，记录阻断。代码由 Codex 执行，用户不用手工写脚本。

## 1. 核对包和说明

记录 ZIP 的 SHA-256、两份 plugin.json 的版本，及本说明文件的实际 SHA-256。sourceDocumentSha256 必须重新计算，不复用上一轮报告值。此前隔离报告中的该字段仍指向更早说明，不能用于核对本轮来源。

读取本机当前官方 Computer Use 文档。确认 KP_Multiply、KP_Add 的单键支持；KP_Multiply 的既有成功记录可作为该宿主已接受它的依据。若 KP_Add 未在文档列出，先只读查官方随附的按键定义；不要猜别名，也不要联网下载替代宿主。无法确认则明确记录未执行及缺少的定义。

## 2. 原生加法，只改变一个变量

从新 inventory 唯一绑定既有独立 win32calc.exe 测试窗口，官方 Escape 清零，新 AX 确认 0。执行一次 `7 → KP_Add → 2 → Return`，每键单独 await，键间照常读取新 AX 和核对窗口。逐项记录调用是否成功、实际用时、可见结果、表达式和焦点。不能因操作符后的 AX 不变而停止本次固定诊断；生产 JevPilot 保护保持不变。任何宿主错误/身份变化即停。

Return 后独立再读 AX，只有 9 才通过。上一轮相同窗口、相同其余键名、使用 plus 的终值为 2；本轮只替换加号键。记录结果，不额外改等号或补按。不为完成报告继续尝试其他键组合。

## 3. 候选驱动定向验收（仅原生加法通过后）

不安装候选，只从解压包显式导入 `src/host-browser-drivers.mjs` 的 createComputerUseDriver；不能误用仍安装的旧模块。记录导入文件 SHA-256。使用现有官方 sky、同一新鲜窗口、完整计算器 AX scope、当前可见按钮的精确允许名称，映射 `7→7`、`加→KP_Add`、`2→2`、`等于→Return`。按钮名称以当前观察为准。

清零确认 0 后，调用候选 driver.observe，再从当次真实 candidates 中精确选中本次固定诊断所需按钮并 driver.execute。每键重新观察，执行同一个四键加法一次；没有候选、重复候选或身份异常立即停止。最后独立官方 AX 验证 9。这里不调用 session.run 或 Jev，也不声称 Jev 自动选择/完整进度循环通过。

将“原生路径”“候选驱动路径”“已安装插件版本”分别记录。候选驱动验收只证明新键名可通过显式驱动执行；安装激活和 Jev 进度循环仍需另行验收。不要删除进度保护来让测试通过。

## 4. Chrome：一条请求，保留本地原始错误

沿用已有所选 profile 窗口，按当前官方 Browser 文档 bootstrap 并选择 chrome 会话，不再次开窗。导入候选包 `scripts/windows-host-probe.mjs`。只发一次 tabs.list，外层 node_repl timeout_ms 显式设 60000，内层 waitMs 为 45000。

Windows Codex 依据实际文件 URL 和官方会话变量使用以下结构，captureError 必须是同步赋值函数：

```js
var localChromeError;
var result = await probe.probeChromeTabs({
  browser,
  waitMs: 45000,
  captureError: error => { localChromeError = error; },
  emit: event => nodeRepl.write(event)
});
```

localChromeError 只留在本机内存；不要整体 console.log、JSON.stringify、写入共享文件或上传。自动回执包含有限原因链的安全代码和 HTTP 状态，未知 code 标记 hasUnexportedCode=true。若有原始错误，用本机代码先摘取 message/code/cause 的必要文本，再剔除完整 URL、查询参数、认证头、密钥、用户名、个人路径、profile、标签内容等敏感字段；**人工检查脱敏文本后**，才将简短错误摘要纳入报告。不必导出 stack，不复制整个异常。若无法可靠脱敏，则只提供固定错误码/错误类型及脱敏未完成的原因，不填空泛的根因结论。

pending 表示底层调用未取消，停止，不重试。operation_error 表示调用自身拒绝；结合本地原始错误判断阶段。若再次只有 other，也必须说明原始错误是否已捕获、是否为字符串/对象、是否有 message/code/cause，不能据此猜测 VPN 或身份问题。成功只导出标签数量和用时。

## 返回

`WINDOWS_KEYPAD_ERROR_RESULTS.md` 和 `WINDOWS_KEYPAD_ERROR_EVIDENCE.json`：原生加法、候选驱动、Chrome 分阶段回执及审查后的错误摘要、实际版本和文件哈希、未执行项及原因。主动 Jev 次数与观察到的后台路由分别记录。不要把测试辅助器当作插件安装器，不作性能/费用宣传。
