---
description: "为 DeepSeek Harness Web 增加 Monaco 文件管理与编辑视图。"
kind: "package-bundle"
---

# dsh-file-manager

`dsh-file-manager` 是 DeepSeek Harness 的外部 Bundle。它在 Web Session 的
`conversation.view` 中加入 `File`，和 `dsh-embedded-codex` 一起运行时标题栏为：

```text
Chat | File | 轨迹
```

File Manager 提供工作区文件树、文本查看与编辑、Monaco 语法高亮、明暗主题、
中英文文案、`Cmd/Ctrl+S` 保存、外部修改冲突保护和 Session 状态恢复。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.7.0`
- Git，且两个仓库都初始化 submodule
- `dsh-embedded-codex` 与本仓库默认放在同一个父目录
- 已登录 Codex；登录和模型配置仍由 `dsh-embedded-codex` 负责

推荐目录结构：

```text
parent/
├── dsh-embedded-codex/
└── dsh-file-manager/
```

如果 Embedded Codex 不在默认位置，可以设置绝对路径：

```bash
export DSH_EMBEDDED_CODEX_ROOT=/absolute/path/to/dsh-embedded-codex
```

PowerShell 使用：

```powershell
$env:DSH_EMBEDDED_CODEX_ROOT = 'D:\path\to\dsh-embedded-codex'
```

## 从两个仓库启动 Embedded Codex + File Manager

第一次使用时，先准备 Embedded Codex：

```bash
cd ../dsh-embedded-codex
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm exec codex login
```

然后准备并启动 File Manager：

```bash
cd ../dsh-file-manager
git submodule update --init --recursive
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 会完成以下工作：

1. 调用 `dsh-embedded-codex` 的构建脚本，准备它固定版本的 DSH CLI 和 Codex Bundle。
2. 构建 File Manager 的 Host、Remote codec、类型和内含 Monaco 的 `lib/client.js`。
3. 把 `dsh-embedded-codex` 和 `dsh-file-manager` 都以稳定 `link:` 依赖加入同一个隔离
   Web profile。
4. 使用 Embedded Codex 固定的 DSH CLI 启动 Web。

这个联合开发环境固定使用：

```text
../dsh-embedded-codex/.tmp/dsh-home
```

它不是默认的 `~/.dsh`。因此日常开发请使用本仓库的 `pnpm dev:*` 命令，不要另开一个
未设置相同 `DSH_HOME` 的全局 `dsh web`，否则会启动另一套 profile。

Web 启动后新建或打开 Session，选择 `Codex 模式`，然后切换标题栏中的 `File`。
File Manager 使用该 Session 的工作目录；切换 Session 时文件树和编辑状态相互隔离。

## 常用命令

| 命令 | 用途 |
|---|---|
| `pnpm dev` | 构建两个仓库、确保两个本地链接并启动 Embedded Codex Web |
| `pnpm dev:install` | 构建并把 File Manager 的真实 tarball 安装到联合开发 profile，不启动 Web |
| `pnpm dev:web` | 启动已经准备好的联合开发 Web，不重新构建 |
| `pnpm dev:dump` | 打印联合开发 Web profile 的最终 Cordis 配置，不启动 Web |
| `pnpm dev:remove` | 只移除 File Manager，保留 Embedded Codex、配置和 Session 数据 |
| `pnpm build` | 构建 File Manager，不启动 DSH |
| `pnpm check` | 执行 Host 与 Client 严格类型检查及 Typert 生成检查 |
| `pnpm test` | 执行单元与契约测试 |
| `pnpm test:package` | 构建、`pnpm pack` 并验证发布文件白名单 |
| `pnpm verify` | 执行完整类型、测试、构建与 package 验证 |
| `pnpm pack` | 生成可安装 `.tgz`；`prepack` 会自动先执行构建 |

## 本地链接开发

日常开发直接执行：

```bash
pnpm dev
```

第一次运行会把两个仓库链接到 Embedded Codex 的隔离 Web profile。后续再次运行时，如果
链接没有变化，不会重复安装 package。修改 File Manager 后：

1. 执行 `pnpm build` 重新生成 `lib/`。
2. Client-only 改动通常会被 DSH Client HMR 检测并在浏览器内原地重载。
3. 如果页面没有更新，刷新浏览器。
4. 修改 Host、Remote API 或生成类型后，按 `Ctrl+C` 停止 Web，再执行
   `pnpm dev:web`。

也可以在一个终端保持 Web 运行，在另一个终端修改代码并执行：

```bash
pnpm build
```

本地链接直接读取本仓库最新的 `lib/`，所以重新构建后不需要再次运行
`dsh plugin add`。

## 用真实 tarball 验证 Embedded Codex 集成

发布前使用：

```bash
pnpm dev:install
pnpm dev:dump
pnpm dev:web
```

`pnpm dev:install` 会：

1. 构建 Embedded Codex 和 File Manager。
2. 将 File Manager 打成带内容 hash 的 `.tmp/packs/*.tgz`，避免相同版本号命中旧缓存。
3. 保持 Embedded Codex 为本地链接。
4. 将 File Manager tarball 安装进 Embedded Codex 的同一个隔离 Web profile。

切换本地链接和 tarball 前先停止正在运行的 Web。命令只重建该隔离 profile 的
`node_modules`；profile 配置、Codex 登录和 Session 数据不会删除。再次执行
`pnpm dev` 会把 File Manager 切回本地链接模式。

`pnpm dev:dump` 的输出中应同时出现：

```text
dsh-embedded-codex
dsh-file-manager
```

## 安装到其他现有 DSH

如果不使用 Embedded Codex 的隔离开发环境，可以先生成普通 tarball：

```bash
pnpm pack
```

然后安装到目标 DSH 的 Web profile：

```bash
dsh plugin --profile web add ./dsh-file-manager-0.1.0.tgz
dsh --profile web --dump-config
dsh web
```

本包声明了：

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

所以 `dsh plugin add` 会自动把 `dsh-file-manager` 加入
`dsh.profile.bundles`，并应用包内 `cordis.patch.yml`。不需要手工编辑 profile 来插入
File Manager row。

这里的 `cordis.patch.yml` 是 Cordis 组合层，只负责插入插件：

```yaml
- insert:
    - id: file-manager
      name: dsh-file-manager
```

它不会修改 DSH 源码，也不会禁用或替换任何 DSH provider。真正的源码 patch 是
`dsh-embedded-codex/compat/patches/*.patch` 那类 unified diff，两者用途不同。

包发布到 npm 后，也可以按包名安装：

```bash
dsh plugin --profile web add dsh-file-manager
dsh web
```

移除插件：

```bash
dsh plugin --profile web remove dsh-file-manager
```

DSH 会同时从依赖和 `dsh.profile.bundles` 中移除它。

## 配置

| 配置 | 默认值 | 作用 |
|---|---:|---|
| `maxFileBytes` | `2097152`（2 MiB） | 单次完整读取和保存的 Host 硬上限 |
| `maxEntriesPerDirectory` | `2000` | 单层目录最多返回的可见条目数 |
| `showHiddenByDefault` | `false` | 是否默认显示点文件 |
| `editable` | `true` | 设为 `false` 后只允许浏览和查看 |

在 Embedded Codex 联合开发环境中，用户覆盖文件位于：

```text
../dsh-embedded-codex/.tmp/dsh-home/profiles/web/cordis.patch.yml
```

例如，把完整配置写成一个按 id 定位的覆盖项：

```yaml
- id: file-manager
  config:
    maxFileBytes: 4194304
    maxEntriesPerDirectory: 3000
    showHiddenByDefault: true
    editable: true
```

Cordis patch 会替换这一 row 的完整 `config`，不会深度合并，所以覆盖时应写全需要保留的
字段。Web profile 使用 live patch reload；为了避免正在编辑文件时状态变化，调整 Host 配置
后仍建议重启 Web。

## 已实现能力

- 文件树逐层加载，目录优先排序，支持刷新、隐藏文件切换和键盘导航。
- 单一活动文件编辑器；切换顶层 tab 后保留未保存内容、光标、选区和滚动位置。
- TypeScript/JavaScript、JSON、HTML、CSS 系列使用 Monaco worker 语言服务；另含
  Markdown、YAML、Shell、Python、Go、Rust、Java、C/C++ 等常见语法高亮。
- Monaco 样式与五类 worker 在构建期内联到一个 `client.js`，运行时不访问 CDN。
- 保存采用读取版本令牌与原子 `replaceIfVersion`，不会静默覆盖 Agent、Git 或外部编辑器
  已经修改的文件。
- 所有浏览与编辑均严格限制在当前 Session 的权威 `cwd` 中。
- 二进制、无效 UTF-8、超限、权限、路径和版本冲突均有稳定错误码与 UI 状态。

V1 暂不包含新建、删除、重命名、多编辑器页签、二进制预览、全局搜索和工作区级 LSP。

## 安全边界

浏览器从不提供可信 `cwd`，只发送 `sessionId` 与规范化相对路径。每个 Remote 请求都会：

1. 重新通过 `SessionController.inspect` 获取 Session 的权威工作区。
2. 拒绝绝对路径、反斜杠、NUL、`.`、`..` 与空路径段。
3. 使用文件系统 canonical containment 阻止路径或符号链接逃逸。
4. 对读取执行字节上限、fatal UTF-8 解码和 NUL 检查。
5. 对写入执行 `workspace-write` sandbox policy 与版本条件原子替换。

## 构建说明

本仓库和 `dsh-embedded-codex` 的 DeepSeek Harness submodule 固定到同一提交。File Manager
自己的 upstream 用于 Host/Client TypeScript project reference、Typert Remote 生成以及 DSH
标准 client bundle 配置；发布归档不包含 `upstream/`。

完整构建顺序：

```text
校验固定 DSH upstream
  -> 生成 DSH Remote 前置契约
  -> File Manager Host 类型与 Typert Remote codec
  -> File Manager Client 类型
  -> 内联 Monaco 样式和五类 worker
  -> 单一 lib/client.js 动态插件 bundle
  -> package 结构与体积验证
```

构建输出位于 `lib/`。`pnpm test:package` 会检查归档包含
`cordis.patch.yml`，且不包含 `src/`、`upstream/`、`node_modules/`、本机绝对路径或未发布的
hash chunk。

## 常见问题

### 找不到 `dsh-embedded-codex`

默认要求两个仓库位于同一个父目录。如果不是，设置：

```bash
export DSH_EMBEDDED_CODEX_ROOT=/absolute/path/to/dsh-embedded-codex
```

然后重新执行 `pnpm dev`。

### Web 中没有 File tab

先停止 Web，然后执行：

```bash
pnpm dev
```

若仍未出现，运行 `pnpm dev:dump`，确认最终配置同时包含
`dsh-embedded-codex` 和 `dsh-file-manager`，再刷新浏览器。

### Web 仍显示旧的 File Manager

本地链接模式执行：

```bash
pnpm build
```

然后刷新浏览器；Host 或 Remote 改动需要重启 `pnpm dev:web`。tarball 模式则重新执行：

```bash
pnpm dev:install
pnpm dev:web
```

内容 hash tarball 会避免复用旧 package 内容。

### 端口已占用或 Windows 提示文件正在使用

先在运行 DSH Web 的终端按 `Ctrl+C`，再执行 `pnpm dev`、`pnpm dev:install` 或
`pnpm dev:remove`。这些命令会调整联合开发 profile 的依赖，不应与运行中的 Web 同时执行。

### 只想移除 File Manager，保留 Codex

```bash
pnpm dev:remove
pnpm dev:web
```

该命令不会删除 Embedded Codex Bundle、Codex 登录、profile 配置或 Session 数据。

## 维护文档

详细设计、Remote API 和验收记录见
[`docs/dsh-file-manager-implementation-plan.md`](docs/dsh-file-manager-implementation-plan.md)。

## License

本项目使用 MIT License。Monaco 与打包进 Client 的第三方代码声明见
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 和
[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt)。
