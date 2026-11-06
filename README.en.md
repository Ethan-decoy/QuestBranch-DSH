# QuestBranch for DeepSeek Harness

[简体中文](README.md) | English

An unofficial research workspace extension for DeepSeek Harness, developed and maintained independently by the community. Open QuestBranch from the DSH sidebar, organize questions in a research graph, discuss a selected branch, and preserve reports, sources, and history.

**Developer preview `0.1.0-dev.3` · DSH `0.2.1-rc.5` · MIT**

Download the prebuilt `.tgz` and its SHA-256 file from [Releases](https://github.com/Ethan-decoy/QuestBranch-DSH/releases). No source checkout or compilation is required. This project does not currently publish to npm.

Windows Host / Web has been tested in an isolated profile with a fixed-response model, including the native Agent tool loop. The desktop window, real provider research, and native hosts on macOS and Linux remain unverified. This preview is intended for developers willing to report issues.

## Install the preview

Download the `.tgz` and `.tgz.sha256` for the same version. In PowerShell, run `Get-FileHash '<plugin-package-path>' -Algorithm SHA256` and compare the result with the checksum file. GitHub's automatically generated Source code archives are for development, not plugin installation.

Use the CLI supplied with your DSH installation. Exit DSH normally first, then replace the installation and download paths in this example:

```powershell
& 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add 'D:\downloads\dsh-plugin-questbranch-0.1.0-dev.3.tgz'
```

Reopen DSH and select **QuestBranch** in the sidebar. Configure accounts, models, tools, and skills in DSH. QB's composer lets you select the model and reasoning effort supplied by the host. Create a research workspace and start a conversation; explicitly ask the Agent to save a report or create agreed research directions when needed.

The interface defaults to Simplified Chinese. Select English under **设置 → 通用 → 界面语言** (Settings → General → Interface language). The preference persists across restarts. Both languages are bundled for offline use. Switching languages preserves research questions, reports, conversations, and DSH's own language preference.

`desktop` is the DSH desktop profile. For a first trial, use a new isolated profile. For later launches, retain the first three environment and path settings and skip profile initialization and package installation:

```powershell
$env:DSH_HOME = 'D:\qb-trial\dsh-home'
$env:DSH_AGENTS_HOME = 'D:\qb-trial\agents'
$dshCli = 'C:\path\to\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
# Only when creating a new isolated profile:
& $dshCli --profile qb-trial --from-default-profile web --dump-config
# For the first installation or a new package:
& $dshCli plugin --profile qb-trial add 'D:\downloads\dsh-plugin-questbranch-0.1.0-dev.3.tgz'
& $dshCli --profile qb-trial
```

All paths above are examples. `--from-default-profile` resets the target profile; do not use it for routine launches or upgrades. Installation uses DSH's official plugin mechanism and does not modify its installation directory. Restart the target profile after installation, replacement, or removal. Remove the plugin through DSH's plugin manager or with `dsh plugin --profile desktop remove dsh-plugin-questbranch`. Research data is retained.

## Updates

Click the running plugin version at the bottom of QB's sidebar to open DSH's native plugin manager. DSH owns installation and updates; QB does not poll for or install updates independently.

The current distribution uses local `.tgz` packages. Stop research, exit the target profile normally, and back up the QB data directory and any DSH native data you need to retain. Install the new package using the command above, then reopen the same profile with the same research directory. Do not reinitialize the profile to upgrade.

DSH `0.2.1-rc.5` does not have the newer plugin version-list and update APIs. Later registry update interfaces also require installation from the registry under the plugin's own package name. File, linked-directory, and Git installations do not automatically become registry installations. This project has not enabled npm distribution, so the current `.tgz` installation cannot automatically check for updates. Each package's `engines.dsh` declares its supported host version.

This preview does not change the research database or session-mapping format. Replacing an application package does not roll back data. Before returning to an older package, confirm data compatibility and, if necessary, restore a complete backup after stopping all writers.

## Source development

See the [development guide](docs/development.md) (Chinese) for the build environment, checks, and packaging commands. This repository contains independently buildable DSH source. Installing a Git repository URL directly as a plugin is not supported. Installation follows the [DSH documentation](https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/docs/user/develop/basic/publish.md), within the scope declared for each release.

## Research data and sessions

- The research database is `<DSH_HOME>/plugins/questbranch/research.sqlite`, outside the DSH installation directory. **Settings → Local storage** shows its actual location.
- `dsh-sessions.json` in the same directory stores research-node references to native sessions and the selected models. DSH owns native history, compaction, permissions, and execution. QB does not read or copy model login credentials.
- Each research node has its own native session. Returning to a node continues that history; changed research materials are supplied as a new snapshot. QB retains ownership of reports, sources, and branches. Ordinary chat does not automatically become a report.
- Before first use or migration, set an absolute `config.directory` for `questbranch` in the target profile's `cordis.patch.yml`. There is currently no in-app migration command. Exit the host and back up the entire directory before moving existing data. A directory lock rejects concurrent hosts writing to one research database.
- Research workspaces support JSON export and import. Research exports do not include DSH accounts, its native session database, or the plugin's session mapping. Restoring research JSON does not restore host sessions. A complete backup requires both the QB directory and DSH native data.

```yaml
# In the target profile's cordis.patch.yml; use an empty directory for first use.
- id: questbranch
  config:
    directory: D:\research\questbranch-dsh
```

## Product boundaries

Standalone QuestBranch and this extension share research models, graph logic, reports, and storage rules. The standalone app provides its own model connections. This extension uses DSH's native Agent without bundling Pi AI, an ACP subprocess, or a separate account manager.

QuestBranch owns the structure and continuity of exploration, not the authority of conclusions or execution.

QB provides the research graph, reports, and sources. DSH's native interactions handle tool permissions; research conclusions do not authorize execution. Node conversations show public tool activity. Hidden reasoning and raw arguments are not displayed as ordinary content.

## Feedback and contribution

Read [troubleshooting](docs/troubleshooting.md) (Chinese), then submit a [redacted issue](https://github.com/Ethan-decoy/QuestBranch-DSH/issues/new/choose). Include QB and DSH versions, operating system, Web or desktop carrier, reproduction steps, and expected and actual results. Remove private research, account identifiers, tokens, and sensitive local paths from attachments.

This repository distributes selected source and accepts feedback and patch proposals. Maintainers integrate and verify patches in the development repository before synchronizing distribution source; a submitted or closed public PR does not mean a fix has shipped. See [contribution guidance](CONTRIBUTING.md) and [private security reporting](SECURITY.md) (Chinese). Do not post exploitable security details publicly.

Project source is licensed under [MIT](LICENSE). Original third-party copyright and license texts are retained in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and included in the plugin package. Using DSH's extension mechanism does not imply official listing or endorsement.
