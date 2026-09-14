---
description: "为 DeepSeek Harness Web 增加 Monaco 文件管理与编辑视图。"
kind: "package-bundle"
---

# dsh-file-manager

`dsh-file-manager` 是 DeepSeek Harness 的外部 Bundle。它在 Web Session 的 `conversation.view` 中增加 `File`，提供工作区文件树、文本查看与编辑、Monaco 语法高亮、明暗主题、中英文文案、`Cmd/Ctrl+S` 保存、外部修改冲突保护和 Session 状态恢复。

File Manager 使用当前 Session 的权威工作目录。它不会修改 DSH 源码、替换 provider 或改变其他 Agent 预设；安装到任意兼容 DSH 的 Web Profile 后即可使用。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.7.0`
- Git，且克隆时初始化 submodule

本项目固定使用仓库内 `upstream/deepseek-harness` 指向的 DSH 版本。该 submodule 只参与开发和打包，发布归档不包含 `upstream/`。

## 从克隆到启动 Web

```powershell
git clone --recurse-submodules <repository-url> D:\dsh-file-manager
Set-Location D:\dsh-file-manager
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会完成以下工作：

1. 在需要时安装并构建 `upstream/deepseek-harness`。
2. 生成 Remote 合约并构建本插件的 Host、Client 和 Monaco 资源。
3. 首次运行时把当前仓库稳定链接到隔离的 `.tmp/dsh-home`；后续构建复用该链接。
4. 启动 DSH Web。

打开或创建一个 Session，然后切换到 `File` 即可。File Manager 使用该 Session 的工作目录；切换 Session 时文件树和编辑状态相互隔离。

如果克隆时没有携带 submodule，先执行：

```powershell
git submodule update --init --recursive
```

## 常用命令

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 构建、确保本地开发链接并启动隔离的 DSH Web |
| `pnpm dev:install` | 构建、打包并执行一次真实 tarball 安装，但不启动 Web |
| `pnpm dev:web` | 启动已经安装好的隔离 Web，不重新构建 |
| `pnpm dev:remove` | 从隔离 Web Profile 移除开发插件 |
| `pnpm build` | 先准备 DeepSeek Harness，再生成并构建本插件 |
| `pnpm build:embedded-codex` | 构建、打包本插件，并安装到同级 `dsh-embedded-codex` 仓库的隔离开发 Web Profile |
| `pnpm test` | 执行 build、Vitest、lint、文档检查、开发链接和 tarball 隔离安装测试 |
| `pnpm pack` | 生成可安装的 `.tgz`；pnpm 会通过 `prepack` 自动先执行 build |

调试单个测试不需要额外的 package script，例如：

```powershell
pnpm exec vitest run tests/package-contract.spec.ts
```

### 开发链接与真实安装

日常开发使用 `pnpm dev`。首次运行会通过稳定的 `link:` 依赖把本仓库注册进隔离的 DSH Web Profile；以后修改插件代码只会重新构建 `lib`，不会再次执行 `pnpm add`。插件运行时直接使用仓库根目录中由 `pnpm install --frozen-lockfile` 安装并由 `pnpm build` 准备好的固定 DSH 依赖。

需要验证发布包时使用：

```powershell
pnpm dev:install
pnpm dev:web
```

`pnpm dev:install` 会生成带内容哈希文件名的真实 `.tgz`，只删除并重建 `.tmp/dsh-home/profiles/web/node_modules`，然后通过固定版本的 DSH CLI 安装 tarball。Profile 配置、lockfile、用户 patch 和 Session 数据不会被删除。这样既验证真实发布边界，也避免同一版本号复用旧插件内容。再次执行 `pnpm dev` 会把 Profile 切回本地链接模式。

切换模式或重新安装前必须先停止正在运行的 DSH Web。Windows 会阻止删除正在使用的 `node_modules`；脚本会重试短暂的文件占用，仍无法处理时会提示停止 Web，不会扩大删除范围。

### 与 Embedded Codex 联调

默认情况下，`dsh-file-manager` 和 `dsh-embedded-codex` 应位于同一个父目录。先停止正在运行的 Embedded Codex Web，然后在本仓库执行：

```shell
pnpm build:embedded-codex
cd ../dsh-embedded-codex
pnpm dev
```

如果 Embedded Codex 位于其他位置，请通过绝对路径覆盖默认目录：

```shell
DSH_EMBEDDED_CODEX_ROOT=/absolute/path/to/dsh-embedded-codex pnpm build:embedded-codex
```

PowerShell 使用 `$env:DSH_EMBEDDED_CODEX_ROOT = 'D:\\dsh-embedded-codex'` 设置该变量。

`build:embedded-codex` 会把 File Manager 构建成内容哈希 tarball，重建 Embedded Codex 临时 Web Profile 的 `node_modules`，再安装到目标仓库的 `.tmp/dsh-home`。Profile 配置和 Session 数据不会删除。这里有意不使用跨仓库 `link:`：两个独立 checkout 各自拥有一份 DSH 依赖，源码链接会让 Cordis、文件系统和 Typert Remote 出现重复运行时。每次修改 File Manager 后重新执行该命令即可更新联调版本。

## 安装到现有 DSH

先生成本地 tarball：

```powershell
pnpm pack
```

然后通过任意兼容 DSH 的 Web Profile 安装并启动：

```powershell
dsh plugin --profile web add .\dsh-file-manager-0.1.0.tgz
dsh web
```

移除插件：

```powershell
dsh plugin --profile web remove dsh-file-manager
```

包发布到 npm 后，也可以直接按包名安装：

```powershell
dsh plugin --profile web add dsh-file-manager
dsh web
```

## 构建说明

父仓库的 Git submodule gitlink 是唯一的 DSH commit 来源，不额外维护 commit 或源码摘要文件。`pnpm build` 会检查本地 submodule 是否与 gitlink 一致，并使用 `.tmp/upstream-build.json` 缓存已经完成的 DSH 构建；首次构建、gitlink 变化、产物缺失或 submodule 有源码修改时会重新构建 DSH。

完整构建顺序：

```text
DeepSeek Harness dependencies and build
  -> DSH Remote prerequisite contracts
  -> File Manager Host declarations and Typert Remote codec
  -> File Manager Client declarations
  -> embedded Monaco styles and workers
  -> runtime and Web client bundles
  -> package structure and size verification
```

构建输出位于 `lib/`。发布包包含 Host、Client、Typert Remote、类型声明、`cordis.patch.yml` 和许可证文件，不包含 `src/`、`upstream/`、`node_modules/` 或 `.tmp/`。

## Bundle 与配置

`package.json` 通过 `dsh.bundle.patch` 声明包内的 `cordis.patch.yml`。执行 `dsh plugin --profile web add ...` 后，DSH 会把 `dsh-file-manager` 加入 `dsh.profile.bundles`，并插入：

```yaml
- insert:
    - id: file-manager
      name: dsh-file-manager
```

可以在更晚的 Profile patch 中覆盖 `file-manager` 条目：

```yaml
- id: file-manager
  config:
    maxFileBytes: 4194304
    maxEntriesPerDirectory: 3000
    showHiddenByDefault: true
    editable: true
```

| 字段 | 默认值 | 用途 |
|---|---:|---|
| `maxFileBytes` | `2097152`（2 MiB） | 单次完整读取和保存的 Host 硬上限 |
| `maxEntriesPerDirectory` | `2000` | 单层目录最多返回的可见条目数 |
| `showHiddenByDefault` | `false` | 是否默认显示点文件 |
| `editable` | `true` | 设为 `false` 后只允许浏览和查看 |

Cordis patch 会替换该 row 的完整 `config`，不会深度合并，所以覆盖时应写全需要保留的字段。

## 已实现能力

- 文件树逐层加载，目录优先排序，支持刷新、隐藏文件切换和键盘导航。
- 单一活动文件编辑器；切换顶层视图后保留未保存内容、光标、选区和滚动位置。
- TypeScript/JavaScript、JSON、HTML、CSS 系列使用 Monaco worker 语言服务；Markdown、YAML、Shell、Python、Go、Rust、Java、C/C++ 等常见语言支持语法高亮。
- Monaco 样式与五类 worker 在构建期内联到 `client.js`，运行时不访问 CDN。
- 保存使用读取版本令牌和原子 `replaceIfVersion`，不会静默覆盖 Agent、Git 或外部编辑器已经修改的文件。
- 所有浏览与编辑均严格限制在当前 Session 的权威 `cwd` 中。
- 二进制、无效 UTF-8、超限、权限、路径和版本冲突均有稳定错误码与 UI 状态。

V1 暂不包含新建、删除、重命名、多编辑器页签、二进制预览、全局搜索和工作区级 LSP。

## 常见问题

### Web 仍显示旧的 File Manager

执行 `pnpm dev:install` 后必须重启正在运行的 Web 进程：先按 `Ctrl+C`，再执行 `pnpm dev:web`。必要时在浏览器中按 `Ctrl+F5`。

真实安装使用内容哈希 tarball 文件名，避免 pnpm 因版本号没有变化而复用旧插件内容。日常 `pnpm dev` 使用稳定链接，不经过 tarball 缓存。

### 提示 submodule 未初始化或 commit 不一致

```powershell
git submodule update --init --recursive
```

构建不会自动切换或更新 submodule commit。

### 端口已占用或 Windows 提示文件正在使用

先在运行 DSH Web 的终端按 `Ctrl+C`，再执行 `pnpm dev`、`pnpm dev:install` 或 `pnpm dev:remove`。这些命令会调整隔离 Profile 的依赖，不应与运行中的 Web 同时执行。

## 维护文档

详细设计、Remote API 和验收记录见 [实现方案](docs/dsh-file-manager-implementation-plan.md)。

许可证见 [LICENSE](LICENSE)，第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。
