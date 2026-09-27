# Windows：真实 Jev 自动选控完整循环

上轮低层固定探针已经通过，最终两次独立 AX 均为 9。本轮直接使用**同一已解压候选** `0.2.1+codex.20260927022653`，不重复固定探针、不安装、不重启、不改配置/密钥/模型/代理。不再尝试 Chrome。目标是实测真实 Jev 选择 → 官方执行 → 等待可见进度 → 最终独立验收。

## 预算与证据

用户已要求执行这轮真实联动。本轮会调用收费 Jev API，仅执行一次 session.run，最多 4 次请求/4 次动作，session 总预算 30000ms，沿用现有任务共享额度及 0.7 选择概率门槛。默认真实 transport、模型和超时保持候选实现；不注入模拟 send、不修改返回答案、不降低门槛、不重置配额/熔断、不新建任务 ID 绕过预算。预算不足/网络失败/模型 review/状态异常立即交回并记录，不付费重投。

Jev 获得一个完整任务目标和当时实际可见候选。只有一个任务阶段，不能拆成“先按7、再按加”等带答案的阶段。按钮到宿主键的映射只是执行器映射，不是模型选择顺序。允许模型选择符合目标的顺序；代码只验证已观察到的最终结果。响应 model、输入/输出 token、实际调用数、每步选中标签和概率都要真实记录。

已核对官方 [API](https://docs.typesafe.ai/api) 与 [Choice](https://docs.typesafe.ai/primitives/choice) 文档；使用现有候选的固定模型配置，不能借此测试无提示换成另一个模型。

## Windows Codex 操作

1. 读取当前官方 Computer Use 文档，沿用上一轮唯一的计算器窗口与官方 sky 接口。检查 `CANDIDATE-LOCK.json` 中原候选 ZIP/模块哈希；同一候选已解压就直接使用，不复制安装到活动插件，不混入其他候选代码。记录当前安装仍是哪个版本。
2. 导入已验证候选的 `src/host-browser-session.mjs`（host）、`src/core.mjs`（Store）、`src/calculator-observation.mjs`（calculatorObservation）。另外导入本诊断包的 `windows-jev-loop-acceptance.mjs`。它没有相对依赖，不覆盖候选文件。不要导入此前的固定序列 windows-calculator-probe。
3. 新 inventory 绑定同一独立计算器，使用官方已验证接口激活窗口、Escape 清零并读取结果 0。按前轮相同 scope、身份检查和正向按钮允许列表建立候选 driver，映射 `7→7`、`加→Numpad_Add`、`2→2`、`等于→Return`。整个原始计算器 AX 作为 scope，不能漏掉 ID 404 表达式字段。这个准备步骤不算 Jev 选择。
4. 使用已有 JevPilot 数据目录创建 Store。复用真实当前 Windows 任务 ID 和当前实际 workspace；从已有任务元数据取得，不把 task ID 编造成随机测试 ID。保留已有 .env.local 与配额数据库，不将密钥放入聊天、argv、报告或新文件。Store/候选自动读取既有密钥；缺失就记录 MISSING_KEY，不让用户重新贴密钥，也不改现有配置。
5. 调用 `runWindowsJevAcceptance` 一次，传 host、driver、store、workspace、taskId，以及下面定义的独立读取函数。外层官方 JS 调用设 timeout_ms=60000（以当前工具支持的 schema 为准）。本机持有完整返回值，输出精简 JSON；完成后关闭这个 Store 连接。示意中的所有变量由 Windows Codex 从实际接口绑定：

```js
var acceptance;
try {
  acceptance = await runWindowsJevAcceptance({
    host, driver, store, workspace, taskId,
    readIndependent: async () => {
      const s = await sky.get_window_state({window: boundWindow, include_screenshot:false, include_text:true});
      if(s.window.id !== boundWindow.id || s.window.app !== boundWindow.app) throw Error('HOST_WINDOW_IDENTITY_CHANGED');
      return calculatorObservation(s.accessibility.tree);
    }
  });
} finally { store.close(); }
nodeRepl.write(acceptance);
```

6. 候选 createSession 内部调用现有 TypeSafe transport。收到不确定/失败回执后不执行原生补全、不再调用 run、不改代码让结果看起来通过。如果外层先超时，认为内部可能仍在运行，停止后续操作，不启动另一个循环。

## 通过标准

- run 状态 needs_verification，随后独立新 AX 为 9 且没有待计算表达式。
- 有与本轮 requestId 对齐的真实 jev_call 事件、返回模型和执行 history；不是仅看到 9 就算通过。
- 所有执行动作来自 Jev 的有效票据，执行前重新核验候选与窗口，未使用固定答案序列或额外补按。
- 记录原始 metrics，input/output/unknownUsage、模型、调用耗时、session 时间、包括准备与独立验证的任务总时间分别列出。未拿到用量写 unknown，不能用估算冒充实测。
- 这是一项功能验收，没有关闭 Jev 的配对基线，不写节省率，也不把四步微任务时间当作正常任务加速比例。

输出 `WINDOWS_JEV_LOOP_RESULTS.md` 与 `WINDOWS_JEV_LOOP_EVIDENCE.json`，保留 helper 返回的 observations/executions/history/calls/receipt/phases/independent，并列出所导入模块哈希、配置保留情况、后台路由的已知或未知用量。使用相对证据链接，移除个人路径、窗口句柄、密钥和完整任务标识。Chrome 未恢复、候选未安装必须继续单列。
