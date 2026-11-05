# QuestBranch for DeepSeek Harness

问之的 DeepSeek Harness 非官方研究工作台扩展，由社区独立开发与维护。在 DSH 侧栏打开 QuestBranch，用研究图组织问题，选择分支对话，并保存阶段报告、来源与历史。

**开发者预览 `0.1.0-dev.2` · DSH `0.2.1-rc.5` · MIT**

预构建插件包与 SHA-256 校验文件统一提供在 [Releases](https://github.com/Ethan-decoy/QuestBranch-DSH/releases)。下载 `.tgz` 即可安装，无需克隆源码或编译；本项目尚未启用 npm 分发。

Windows Host / Web 已完成隔离固定响应验收，包括原生 Agent 工具循环；桌面窗口、真实厂商研究、macOS 和 Linux 的宿主使用仍待实测。此版本面向愿意反馈问题的开发者。

## 安装试用包

从 [Releases](https://github.com/Ethan-decoy/QuestBranch-DSH/releases) 下载同一版本的 `.tgz` 与 `.tgz.sha256`，在 PowerShell 用 `Get-FileHash '<插件包路径>' -Algorithm SHA256` 核对校验值。GitHub 自动生成的 Source code 压缩包供源码开发，不作为插件安装包。

使用已安装的 DSH 自带 CLI；正常退出 DSH 后执行，替换安装路径与附件路径：

```powershell
& 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add 'D:\downloads\dsh-plugin-questbranch-0.1.0-dev.2.tgz'
```

重开 DSH，在侧栏选择 **QuestBranch**。账号、模型、工具和技能先在 DSH 配置；在 QB 输入栏选择宿主提供的模型与思考强度。新建研究空间后可以直接对话；明确要求保存报告或创建方向时，由 Agent 调用 QB 工具完成。

界面默认简体中文，可在 **设置 → 通用 → 界面语言** 选择 English，重开后保留选择。中英文资源随插件提供，离线可用；切换语言不翻译或改写已有研究问题、报告与对话，也不改变 DSH 自身的语言偏好。

`desktop` 是 DSH 桌面的资料配置。初次试用建议使用新的隔离配置；后续启动保留前三行的环境与路径设置，跳过初始化和安装两行：

```powershell
$env:DSH_HOME = 'D:\qb-trial\dsh-home'
$env:DSH_AGENTS_HOME = 'D:\qb-trial\agents'
$dshCli = 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
# 仅首次创建新的隔离 profile：
& $dshCli --profile qb-trial --from-default-profile web --dump-config
# 首次安装或更新附件：
& $dshCli plugin --profile qb-trial add 'D:\downloads\dsh-plugin-questbranch-0.1.0-dev.2.tgz'
& $dshCli --profile qb-trial
```

路径仅为示例。`--from-default-profile` 会重置目标 profile，不用于日常启动或升级。试用包使用 DSH 官方插件管理入口，不修改 DSH 安装目录。升级时退出宿主，再安装新附件并重启；移除后也重启目标 profile。移除插件可使用 DSH 插件管理页面，或 `dsh plugin --profile desktop remove dsh-plugin-questbranch`；研究资料继续保留。

## 版本更新

QB 侧栏底部显示正在运行的插件版本，点击可打开 DSH 的原生插件管理页面。更新安装由 DSH 处理，QB 不单独轮询或安装更新。

当前提供本地 `.tgz`：停止研究并正常退出目标 profile，备份 QB 资料目录及需要保留的 DSH 原生资料，再按上面的命令安装新版本附件并重启。使用相同的 profile 和研究目录，不能以重新初始化 profile 代替升级。

DSH `0.2.1-rc.5` 尚无新版插件版本列表与更新接口。后续 DSH 的 registry 更新入口还要求插件以自身包名从 registry 安装；文件、目录链接和 Git 来源不会自动转为 registry 来源。本项目尚未启用 npm 分发，不能在当前 `.tgz` 安装中自动检查新版本。宿主版本支持范围仍以各插件包的 `engines.dsh` 为准。

本轮不改变研究库和会话映射格式。更换程序包不等于数据回退；恢复旧包前需核对数据兼容性，必要时在停止写入后恢复完整备份。

## 源码开发

构建环境、检查命令和生成插件包的方法见[开发说明](docs/development.md)。本仓库提供可独立构建的 DSH 源码；不支持直接把 Git 仓库 URL 当作插件安装。安装机制沿用 [DSH 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/docs/user/develop/basic/publish.md)，支持范围以具体版本说明为准。

## 资料与会话

- 研究数据库位于 `<DSH_HOME>/plugins/questbranch/research.sqlite`，不是 DSH 安装目录。“设置 → 本地存储”显示实际路径。
- 同一目录的 `dsh-sessions.json` 保存研究节点与 DSH 原生会话的引用及模型选择；原生历史、压缩、权限与执行由 DSH 管理。QB 不读取或复制模型登录凭据。
- 每个研究节点对应独立的原生会话；回到同一节点继续历史，研究材料变化时补充当前快照。报告、来源和分支继续由 QB 保存，普通聊天不自动变成报告。
- 首次使用或迁移之前，可在对应 profile 的 `cordis.patch.yml` 为 `questbranch` 设置绝对路径 `config.directory`。当前没有界面迁移功能；已有资料须在宿主退出后备份整个目录再移动。目录锁会拒绝多个宿主同时写一个研究库。
- 研究空间支持 JSON 导出与导入。研究导出不包含 DSH 账号、原生会话库或插件会话映射；恢复研究资料不等于恢复宿主会话。完整备份需要同时保留 QB 目录与 DSH 原生资料。

```yaml
# 对应 profile 的 cordis.patch.yml；选择空目录用于首次启用。
- id: questbranch
  config:
    directory: D:\research\questbranch-dsh
```

## 产品关系

独立版 QuestBranch 与本扩展复用研究模型、图谱、报告和存储规则。独立版提供自己的模型连接；本扩展直接使用 DSH 的原生 Agent，不携带 Pi AI、ACP 子进程或另一套账号管理。

QuestBranch owns the structure and continuity of exploration, not the authority of conclusions or execution.

QB 提供研究图、报告与来源；工具权限仍由 DSH 的原生交互处理，研究结论不构成执行授权。公开工具活动在节点聊天中显示，隐藏思考和原始参数不作为普通内容展示。

## 反馈与参与

遇到问题先查看[试用排查](docs/troubleshooting.md)，再提交[脱敏反馈](https://github.com/Ethan-decoy/QuestBranch-DSH/issues/new/choose)。开发贡献见[参与说明](https://github.com/Ethan-decoy/QuestBranch-DSH/blob/main/CONTRIBUTING.md)，安全问题见[私下报告说明](https://github.com/Ethan-decoy/QuestBranch-DSH/blob/main/SECURITY.md)。

本扩展的项目源码采用 [MIT](LICENSE)。第三方版权与许可保留在 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)，并随插件安装包交付。使用官方扩展机制不代表获得 DSH 官方收录或背书。
