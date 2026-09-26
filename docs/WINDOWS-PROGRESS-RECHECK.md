# Windows 计算器进度定向复验

本候选接续 19:00 实机报告。已确认的运行中更新及配置解析不再反复测试；无需新增独立 GPT 任务或性能 A/B。最多 4 次真实 Jev 请求。保留密钥、模型、档位、其他插件和既有配置。

## 改动与边界

显式 Windows 计算器单键模式在一次按键后若 AX 未变化，只等待 150ms 并额外读取一次，绝不重按原键。剩余预算不足、取消或窗口身份变化时停止。再读仍未改变就维持 HOST_NO_OBSERVED_PROGRESS。普通 Chrome、macOS、Windows 点击路径不新增等待。

结果的 progressDiagnostics 区分 scopedChanged、rawChanged、scopeMayHideChange、rechecked。rawChanged 本身不会授权继续操作。完整 progressObservation 仅保留在宿主 run 变量中，不放入精简回执、不发送给 Jev。它包含失败动作前后 scoped/raw AX，原始文本超过 50000 字符时为 null。

## 实机操作

1. 安装用户提供的新 progress ZIP，按现有个人插件更新流程准备适配层；核对新包与实际安装文件哈希。需要时正常重启，确认新桥接指纹；不要退回旧公共 ZIP。先读本机官方 Computer Use 文档。
2. 从新 inventory 绑定真实计算器窗口，使用单键模式；将计算器清为 0。先检查完整 AX，scope 必须同时包含可见结果、运算表达式（若 AX 暴露）和允许按钮。对已确认独立的计算器窗口，可采用完整原始 AX 作为 scope，不拼造“7+”或虚构状态。
3. 目标仍为 7+2=9，由 Jev 在当时可见候选中选择。只开放对应可见按钮，实际按键映射记录为 label/key；别预先写死按键序列。独立核验最终 AX，结果 9 才算运算完成。
4. 停止时保存：reason、metrics、requestDiagnostics、progressDiagnostics；若 reason 为 HOST_NO_OBSERVED_PROGRESS，从宿主结果 progressObservation 提取动作前后的脱敏 AX。仅导出该计算器内容，删除路径/账户/窗口句柄。另附实际 scope 函数和选中 label/key。不能只写“结果仍为7”，否则无法区分表达式变化被漏掉还是按键未生效。
5. 若全 AX 也没变化，不重复付费重投，不盲目发送下一键，报告原始观察即可。

## Chrome 只补剩余未知项

此前扩展、Native Host、profile dry-run 均通过，不重复改 ready 的代理配置，不再次批量重装。

核对官方插件实际选中的 Chrome profile 是否有打开的窗口，以及检查进程和实际运行宿主的 profile 覆盖变量是否一致。遵守本机官方 Browser 故障文档及窗口操作权限；如果无法确认，标 unknown。可确认后只复验一次 tabs.list；失败记录阶段、超时时间和官方诊断结果，不用其他控制通道代替本次验收。不导出 profile 名称、私人标签标题/URL 或环境变量值。

输出 WINDOWS_PROGRESS_RESULTS.md 和脱敏 JSON；区分真实请求、模拟测试与未覆盖功能，不报告节省率。
