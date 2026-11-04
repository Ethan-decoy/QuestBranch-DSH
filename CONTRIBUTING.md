# 参与开发

问题和改进建议提交到[本仓库 Issues](https://github.com/Ethan-decoy/QuestBranch-DSH/issues)。复现信息至少包含 QB 版本、DSH 版本、系统、Web／桌面承载、操作步骤和实际结果；分享日志或截图前移除研究正文、账号与令牌。

源码准备和命令见[开发说明](docs/development.md)。修改前先确认问题发生在 QB，还是 DSH 自身的模型、工具或账号连接中。PR 以本仓库 `main` 为目标，说明问题、改动及验证结果，保持每次修改的目的集中。

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm notices:check
pnpm pack:dsh
```

涉及 DSH 原生接口时，还要在声明的宿主版本中安装生成的 `.tgz` 验证；固定响应测试或 CI 成功不能代替真实模型与权限交互检查。测试使用新的隔离资料，避免打开个人日常研究库。

更新依赖时同步锁文件并运行 `pnpm notices`，提交更新后的第三方声明。保留第三方原始版权、许可证和来源；项目源码使用 [MIT](LICENSE)，第三方内容按各自许可处理。构建输出、依赖目录、凭据、个人研究和日志不进入 PR。
