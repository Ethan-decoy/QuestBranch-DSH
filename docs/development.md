# 开发与构建

需要 Node.js 24 或更新版本，以及 pnpm 11.1.3。工作区包是源码项目；实际安装到 DSH 的插件由构建生成，包名为 `dsh-plugin-questbranch`。

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm notices:check
pnpm pack:dsh
```

`pack:dsh` 会先构建，再核对包清单并生成 SHA-256。构建输出固定在 `release/dsh/`，打包文件位于 `release/dsh-plugin-questbranch-0.1.0-dev.1.tgz`，旁有 `.sha256` 文件。使用 [README](../README.md) 中的 DSH 官方 CLI 安装这个文件，不能把源码目录或 GitHub 源码压缩包当作安装包。当前未提供 Git URL 安装所需的 `prepare` 流程。

## 代码入口

| 目录                      | 内容                                               |
| ------------------------- | -------------------------------------------------- |
| `src/dsh/`                | DSH Host 插件、客户端入口、节点与原生会话映射      |
| `src/research/`           | 研究结构、上下文、报告和分支规则                   |
| `src/desktop/`            | 两种承载共享的 SQLite 存储与研究操作               |
| `src/ui/`                 | 研究图、节点对话、报告和设置界面                   |
| `config/dsh-package.json` | 安装包身份、宿主兼容声明和插件入口                 |
| `tests/`                  | 原生会话桥接、研究工具、图谱和交互规则的自动化检查 |

Host SDK 在运行时由 DSH 提供。`host-types.d.ts` 描述本扩展使用的接口子集；构建时将 `@deepseek-ai/*` 保留为外部依赖，不打包第二份宿主。修改宿主接口时，需要在所声明的 DSH 版本中实际检查，类型检查和固定响应测试不能证明真实厂商或任意宿主版本可用。

QB 界面使用 React 19，DSH 客户端包装层使用宿主 React。两者通过独立文档和受校验的消息连接交互，避免混用 React 树。模型登录、工具权限、原生历史和压缩由 DSH 管理。

## 本地验证

自动化测试使用临时 SQLite 数据和模拟宿主接口，不读取模型凭据。安装验证使用独立的 `DSH_HOME`、`DSH_AGENTS_HOME` 和 profile，参考 README 的首次初始化与后续启动步骤。不要对已有资料配置重复执行 `--from-default-profile`。

GitHub Actions 在 Windows 与 Linux 检查源码、构建并生成试用构件，不会发布 npm 或 Release。这些检查不构成对应系统的 DSH 宿主兼容认证。

## 第三方许可

更新依赖后运行 `pnpm notices`，它从 `pnpm licenses list --prod --json` 读取锁定的生产依赖，保留原始版权和许可文本，并补入生成样式所用的 Tailwind 许可。结果为 `THIRD_PARTY_NOTICES.txt`；构建时一并交付。该清单保守覆盖生产依赖，不声称其中每个包都保留在最终 JavaScript 中。

个别 npm 包未附许可文本时，`config/dsh-license-overrides.json` 固定适用版本、上游文本来源与校验值，原文放在 `licenses/`。缺少或不一致会导致检查失败，不能用一份通用 MIT 文本代替不同作者的版权声明。

反馈时提供插件版本、DSH 版本、系统、复现步骤和预期结果。先移除研究正文、账号、令牌及其他个人资料，再分享日志或截图。
