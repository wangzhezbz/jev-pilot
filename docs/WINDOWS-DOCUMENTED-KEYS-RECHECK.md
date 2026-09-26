# Windows：直接验证文档化按键，定位官方 fetch 故障

这次修复依据 WINDOWS_KEYPAD_ERROR_RESULTS.md：官方文档明确支持 `Numpad_Add` 和 `Numpad_Multiply`，而前轮说明误将未列出的 `KP_Add` 作为硬门槛。本候选支持两个文档化名称，并已同步 Skill 示例。不要再以缺少 KP_Add 定义阻止执行，也不把 Numpad_Add 改写成 plus 或 KP_Add。

解压本候选到独立目录即可，不安装、不重启、不改密钥/模型/代理/当前插件。不主动调用 Jev；主任务后台路由若有消耗，另列。候选文件只在官方宿主内按真实路径导入。用户无需手工运行脚本。

## 计算器：直接测试候选驱动一次

1. 记录包 SHA-256、清单版本、driver 文件 SHA-256、本说明 SHA-256。读取当前官方 Computer Use 文档，核对本报告已经确认的 Numpad_Add 定义。若官方插件版本与报告一致且文档仍有该键，不再重复寻找 KP_Add。
2. 从新鲜 inventory 绑定独立测试计算器窗口，官方 Escape 清零，新 AX 确认 0。导入本候选 `src/host-browser-drivers.mjs` 的 createComputerUseDriver，传现有官方 sky、精确 window、完整计算器原始 AX scope 与当前真实按钮名称。显式映射为 `7→7`、`加→Numpad_Add`、`2→2`、`等于→Return`；用当前界面对应名称，不能虚构候选。
3. 进行一次固定四键诊断：每步 driver.observe，从当次真实 candidates 中精确选中相应按钮，再 driver.execute；每键等宿主返回后再进行下一步。顺序为 7、加、2、等于。记录宿主实际 key、是否成功、耗时、可见结果和表达式。完成后用官方新 AX 独立确认最终值。加号后的 AX 不变不阻止本次固定诊断，但身份变化、无候选或工具错误立即停止。
4. 这是低层驱动定向验证，不调用 createSession.run/browserStep、不调用 Jev，不改变生产进度保护。最终 9 才算此路径通过；不能据此声称安装已激活、Jev 完整自动循环通过或性能节省。
5. 如果候选模块无法导入，记录具体阻断；可直接用相同官方 press_key 和文档化键名完成一次原生四键诊断，分别注明 native-only/driver-not-run。不要修改可信路径，也不要因模块导入失败把宿主支持误判为不支持。无论走哪个分支只做一次加法，不重复付费测试。

## Chrome：不再无变化地重试 tabs.list

已知错误原文是 `nodeRepl.fetch request failed`，约 21 秒返回；外层 60 秒、内层 45 秒未先到期。无需重做扩展安装、profile 窗口、超时长度或现成的代理白名单检查。

1. 先按本机官方诊断入口查看 Codex/node_repl 宿主日志。仅取前一轮失败时间附近的相关网络错误；若时间无法对应，则明确注明旧日志无法关联。检索线索为 `nodeRepl.fetch request failed`、fetch/native request 及相关 error/cause。不要导出完整日志、请求头、账户/会话 ID、认证信息、个人路径或私人浏览器内容。
2. 若官方日志可用且能记录下一次失败，准备好读取日志，再用候选 `scripts/windows-host-probe.mjs` 对现有官方 chrome 会话执行一次 probeChromeTabs，外层 timeout_ms=60000，内层 waitMs=45000；captureError 同步保留原始对象在本地，emit 仅输出精简阶段。新版 startedAtUtc 可用于关联日志。日志与 probe 时间对齐后，导出脱敏的底层错误码、网络阶段和安全摘要。
3. 若官方日志不可用、仍只返回相同的一句话，停止重复请求并写明“官方宿主没有暴露更深错误”。不能伪造 DNS/代理/身份根因，不另起控制通道代替官方 Chrome。不要 monkey-patch fetch，不修改官方插件、不跳过身份检查、不自行调用插件源码中的内部认证 URL。
4. 本地 `browser-network` 返回 ready 或 configured_for_new_process 仅表示配置检查通过；新版已显式返回 verificationScope=configuration_only、runtimeConnectivity=not_tested、nativeFetchConnectivity=not_tested。不能把它作为官方 fetch 已连通的证据。不要再次修改已经正确的配置，更不要为试验强制打开 TUN。

返回 WINDOWS_DOCUMENTED_KEYS_RESULTS.md 与 WINDOWS_DOCUMENTED_KEYS_EVIDENCE.json。记录键名、最终值、候选驱动是否执行、Chrome 是否实际新增请求及原因、能否关联底层日志、实际安装版本和未执行项。保持证据与推断分开。
