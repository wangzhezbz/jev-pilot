# Windows 计算器：状态证据与输入完成时序

上一份报告的 visibleExpression=null 与原始 AX 不一致：加号后的原文包含 `3 文本 运行历史记录 Value: 7 + ID: 404`，其后直到回车仍保留该表达式。Numpad_Add 已产生可观察的运算状态。按 2 后结果仍为 7、回车后才成为 2，可能存在输入处理或 AX 更新延迟，尚不能断定原因。

本候选修复表达式提取，并把计算器单键模式的旧一次 150ms 再读改为最多四次只读观察，等待预算最多 1000ms，仍共享任务总预算。立即变化不额外等候；未变化、取消、身份改变仍停止。不重复按键、不额外问 Jev、不适用于普通 Chrome/macOS 操作。正在进行的官方读操作由宿主控制超时，本地等待预算不是强制取消该读的保证。

## Windows Codex 执行

无需安装或重启，只解压独立候选，不改当前配置/密钥/模型/其他插件。记录包、说明和所导入模块 SHA-256。使用当前官方 Computer Use 文档与现有 sky，绑定唯一独立计算器窗口。Escape 清零后新读 AX，确认结果 0；未清零则停止，不继续序列。

从本候选导入 createComputerUseDriver（`src/host-browser-drivers.mjs`），显式绑定当前窗口、完整计算器 AX scope 和当次允许按钮名，使用 `7→7`、`加→Numpad_Add`、`2→2`、`等于→Return`。不要改键名，也不要导入已安装旧模块。

导入 `scripts/windows-calculator-probe.mjs` 的 probeCalculatorAddition，由 Codex 用实际已绑定变量调用：

```js
var result = await probeCalculatorAddition({
  driver,
  readIndependent: async () => {
    const state = await sky.get_window_state({window: boundWindow, include_screenshot:false, include_text:true});
    if(state.window.id!==boundWindow.id || state.window.app!==boundWindow.app) throw Error('HOST_WINDOW_IDENTITY_CHANGED');
    return state.accessibility.tree;
  }
});
nodeRepl.write(result);
```

每次候选 observe 自带身份/新鲜候选检查。探针只运行一次固定诊断，不经过 Jev 或 session.run。程序依次要求观察到 7、表达式 7 +、结果 2 且表达式 7 +、结果 9；任何一步未满足时只读等待，超时后停止，不发下一键。每步 observations 自动提供真实 result/expression，不再手工填 visibleExpression=null。最终另读官方 AX 得 9 才通过。

返回完整精简 result（含每次观察与等待时长），以及实际调用参数/键名、窗口身份核验、总时长、模块哈希。只有 stopped at 2 也属于有价值的定位结果，不能为了得到 9 补按回车。任何工具异常记录明确阶段并停止。操作期间若用户切换窗口，取消本次测试。

## Chrome 本轮不再请求

现有证据仅能确定 nodeRepl.fetch 失败，官方日志未暴露底层原因。没有新的运行环境变化或官方诊断信息时，不再重复 tabs.list、改代理或要求重启。写明未恢复、未新增请求；本轮优化不宣称修复 Chrome。

输出 WINDOWS_OBSERVATION_RESULTS.md 和 WINDOWS_OBSERVATION_EVIDENCE.json，使用相对证据链接，避免报告中的本地盘符路径。主动 Jev 调用与后台路由分别计数。区别候选驱动测试、真实 Jev 自动循环及安装激活；本轮不做性能宣传。
