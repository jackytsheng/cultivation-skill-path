# 修炼档案

修炼档案是一个修仙式长期成长系统。它把任何你想长期修炼的能力称为“一道”，比如架子鼓、格斗、写作、编程、英语表达。每一条道都有自己的境界路线、每境十层、每层任务、任务次数进度、道历打卡和主题颜色。

界面目标是简单、克制、直观：你不用每天重新想“我该练什么”，只需要看自己当前在哪个境界、哪一层，还有哪些任务没有推进。

## 仓库位置

当前项目目录：

```powershell
C:\Users\jacky\OneDrive\Documents\cultivation-skill-path
```

进入项目：

```powershell
cd C:\Users\jacky\OneDrive\Documents\cultivation-skill-path
```

## 快速启动

需要 Node.js `22.13.0` 或更高版本。

首次打开项目后安装依赖：

```powershell
npm.cmd install
```

启动本地开发版：

```powershell
npm.cmd run dev
```

然后打开：

```text
http://localhost:3000/
```

在 Windows PowerShell 里建议用 `npm.cmd`，这样可以避开 PowerShell 脚本执行策略的问题。macOS 或 Linux 可以直接用 `npm`。

## 常用命令

```powershell
npm.cmd run dev
```

启动本地开发服务器，用来改界面、看热更新。

```powershell
npm.cmd run build
```

构建 Vinext 版本，主要用于检查本地应用能不能正式编译通过。

```powershell
npm.cmd run build:pages
```

构建 GitHub Pages 静态版本，输出到 `dist-pages`。

```powershell
npm.cmd run lint
```

运行 ESLint。

```powershell
npm.cmd test
```

先执行 `npm run build`，再跑渲染产物测试。

## 本地版和 GitHub Pages 版的区别

这个项目有两个入口，是为了同时满足“本地开发舒服”和“GitHub Pages 可以静态托管”。

### 本地开发版

启动方式：

```powershell
npm.cmd run dev
```

访问地址通常是：

```text
http://localhost:3000/
```

本地开发版走 Vinext 应用入口，适合开发和调 UI。修改 `app/CultivationApp.tsx` 或 `app/globals.css` 后，页面会自动刷新。

### GitHub Pages 静态版

构建方式：

```powershell
npm.cmd run build:pages
```

它走 `github-pages/index.html` 和 `github-pages/src/main.tsx`，复用同一个 `app/CultivationApp.tsx` 主应用。构建产物在：

```text
dist-pages
```

部署后访问地址预计是：

```text
https://jackytsheng.github.io/cultivation-skill-path/
```

GitHub Pages 是纯静态托管，没有后端数据库、登录系统或服务器 API。这个应用目前本来就是本地优先设计，所以在 Pages 上仍然可以使用 localStorage 自动保存、JSON 导入导出，以及浏览器支持时的本地文件夹保存。

注意：`http://localhost:3000/` 和 `https://jackytsheng.github.io/cultivation-skill-path/` 是两个不同站点。浏览器会把它们的 localStorage 分开保存，所以两边进度不会自动互通。要把本地进度迁移到 Pages，先在本地“导出存档”，再到 Pages 页面“导入存档”。

## GitHub Pages 发布

仓库里已经有 GitHub Pages workflow：

```text
.github/workflows/pages.yml
```

它会在 push 到 `main` 后自动：

1. 安装依赖
2. 执行 `npm run build:pages`
3. 上传 `dist-pages`
4. 发布到 GitHub Pages

如果是第一次启用 GitHub Pages，需要在 GitHub 仓库里检查：

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

如果 workflow 在 `Configure Pages` 步骤报：

```text
Get Pages site failed
Please verify that the repository has Pages enabled and configured to build using GitHub Actions
```

通常就是这里还没启用。先到上面的设置页把 Source 改成 `GitHub Actions`，保存后重新运行 workflow。

如果看到 `Node 20 is being deprecated`，那是 GitHub Action 自己的运行时警告，不是这个项目使用了 Node 20。项目构建仍然使用 `actions/setup-node` 安装的 Node 22。workflow 里的官方 action 已经升级到 Node 24 运行时版本：

```text
actions/checkout@v5
actions/setup-node@v5
actions/configure-pages@v6
actions/upload-pages-artifact@v4
actions/deploy-pages@v5
```

然后 push：

```powershell
git push -u origin main
```

如果命令行要求登录 GitHub，需要完成 GitHub 凭据授权后才能 push。只要 push 成功，GitHub Actions 会接手构建和发布。

## 应用概念

“道”：一条长期修炼路线。每条道独立保存自己的境界、层级、任务和进度。

“境界”：一条道的大阶段。可以使用预设路线，也可以自己增删改名。

“预设路线”：开辟新道时可以选择，修到一半也可以在“境界路线”里重新套用。套用新预设会按位置保留已有层级、任务和进度；如果新路线更短，会先确认再移除后面多余境界。

“十层”：每个境界固定 10 层。完成当前层所有任务后，才能进入下一层；完成当前境界十层后，才能进入下一境界。

“任务”：每层下面的可打卡项目。任务有目标次数，比如 `0/8`。点击 `+` 后推进一次。

“道历”：类似 GitHub 贡献图的打卡记录。每天完成任务、升层、升阶或大圆满，都会在道历里留下不同样式的格子。

“修为总览”：查看所有道目前修到哪里。诸道修行每页显示 5 道，底下的道历也跟着同页切换。

## 数据保存

应用有两层保存机制：localStorage 自动保存，以及可选的本地文件夹保存。

### localStorage 自动保存

页面加载后会先从浏览器 localStorage 读取进度。之后只要你改动任务、境界、层级、道名、导入内容或打卡记录，应用都会自动写入 localStorage。

当前 localStorage key 是：

```text
cultivation-growth-state-v1
```

localStorage 的特点：

- 不需要你手动选择文件夹
- 自动保存到当前浏览器、当前站点
- 不会生成你能直接看到的文件
- 换浏览器、换域名、清浏览器数据后可能看不到旧进度

所以 `localhost` 和 GitHub Pages 的进度默认不互通，因为它们是两个不同站点。

### 本地文件夹保存

点击“选择本地文件夹”后，如果浏览器支持 File System Access API，应用会把完整存档写入你选择的文件夹：

```text
cultivation-progress.json
```

之后每次进度变化，应用会在短暂延迟后自动同步到这个 JSON 文件。

本地文件夹保存的特点：

- 会生成一个你能看见、备份、复制、迁移的 JSON 文件
- 和 localStorage 同时保存，不是二选一
- 更适合作为长期 source of truth
- 浏览器可能会要求重新授权文件夹写入权限

如果浏览器不支持本地文件夹写入，或者授权失效，应用仍会继续保存到 localStorage。你也可以用“导出存档”手动下载 JSON。

## 导出存档和导入存档

“导出存档”会导出完整 source of truth JSON。它包含：

- 所有道
- 当前选中的道
- 所有境界、层级、任务
- 每个任务当前进度
- 每日道历记录
- 保存文件名
- 上次连接过的本地文件夹名称
- 更新时间

完整存档的顶层结构大致是：

```json
{
  "version": 1,
  "updatedAt": "2026-08-15T00:00:00.000Z",
  "activeSkillId": "dao-id",
  "storage": {
    "progressFileName": "cultivation-progress.json",
    "localFolderName": "你的文件夹名"
  },
  "skills": []
}
```

说明：代码里的历史字段名仍然是 `skills`，在这个应用里它代表“诸道列表”。界面文案统一称为“道”。

“导入存档”用于恢复完整 source of truth。导入完整存档时，应用会询问是覆盖当前所有道，还是合并导入。

浏览器安全限制下，JSON 存档不能自动恢复本地文件夹写入权限。导入后如果还想继续自动写入本地 `cultivation-progress.json`，需要重新点击“选择本地文件夹”授权一次。

## 道法秘籍

“道法秘籍”不是完整存档导入。它位于总览页“开辟新道”面板里，用来导入一整条新的道，包括：

- 道名
- 此道目标
- 主题颜色
- 境界数量
- 每个境界的说明
- 每境十层
- 每层标题、说明和任务

道法 JSON 不要包含完整存档字段，例如 `version`、`skills`、`storage`、`activity`、`id`、`createdAt`、`updatedAt`。

道法秘籍只接受文件：

- AI 生成可下载 `.json` 文件后，点击“选择道法秘籍”直接导入

应用不提供手输或粘贴 JSON 的入口。道法引会要求 AI 直接生成可下载的道法秘籍文件。

基本结构：

```json
{
  "name": "架子鼓",
  "description": "从稳定节拍、肢体协调、律动表达，一路修到可录音、可现场、可即兴、可形成个人风格的架子鼓修行路线。",
  "color": "#8b6f24",
  "realms": [
    {
      "summary": "此境界的核心目标、能力边界、完成后应该呈现的状态。",
      "layers": [
        {
          "title": "本层名称",
          "description": "本层要修成的具体能力标准。",
          "tasks": [
            { "title": "可执行任务名称", "target": 8, "progress": 0 },
            { "title": "另一个可打卡任务", "target": 5, "progress": 0 }
          ]
        }
      ]
    }
  ]
}
```

每个 `realm` 必须有 `summary` 和正好 10 个 `layers`。每个 `layer` 必须有 `title`、`description`、`tasks`。每个 `task` 必须有 `title`、`target`、`progress`。

导入前会先在“道法秘籍”里选择一条预设境界路线。应用会按照所选路线给境界命名：

- 如果 AI 返回的境界少于预设路线，多余的预设境界会被去掉
- 如果 AI 返回的境界多于预设路线，多出来的会自动命名为 `境界14`、`境界15` 之类
- 如果 AI 没指定境界数量，应由 AI 根据这项能力的复杂度和目标状态自行决定，不会机械默认 13 个

## 道法引怎么用

“道法引”是给 AI 用的完整提示词。它的设计目标是让用户只需要说清楚两件事：

```text
我想学：
我眼中的顶级状态：
```

使用步骤：

1. 打开总览页“开辟新道”里的“道法秘籍”
2. 选择一个预设境界路线
3. 点击“刻录道法引”，复制完整提示词
4. 把提示词发给 AI
5. AI 会先让你填写“我想学”和“我眼中的顶级状态”
6. 你填完后，AI 会优先生成一个可下载的道法 `.json` 文件
7. 下载文件后，在应用里点“选择道法秘籍”导入

例子：

```text
我想学：打架子鼓
我眼中的顶级状态：能稳定录音、现场演出、跟乐队即兴，能打出自己的律动风格。
```

道法引会要求 AI 自动补全剩下的境界、十层、每层任务和任务次数。它会明确要求 AI 不要一条条分批生成 JSON，而是直接生成一个完整、可下载、UTF-8 编码的 `.json` 秘籍文件。

## 主要文件

```text
app/CultivationApp.tsx              主应用逻辑和交互
app/globals.css                     主视觉样式
app/page.tsx                        Vinext 本地应用入口
app/layout.tsx                      页面 metadata
github-pages/index.html             GitHub Pages 静态入口 HTML
github-pages/src/main.tsx           GitHub Pages React 入口
vite.github-pages.config.ts         GitHub Pages 静态构建配置
.github/workflows/pages.yml         GitHub Pages 自动发布 workflow
tests/rendered-html.test.mjs        构建产物测试
public/                             图片、图标和 Open Graph 资源
```

## 开发备注

这个应用目前是纯前端、本地优先架构。它没有远程数据库，也不会把你的修炼数据上传到服务器。

如果以后要做账号登录、云同步、多人共享或跨设备实时同步，就需要增加后端存储，例如 Cloudflare D1、Supabase、Neon Postgres 或其他数据库。那会是另一层架构，不是当前 GitHub Pages 静态版能直接提供的能力。
