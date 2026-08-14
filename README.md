# 修炼档案

一个修仙式激励成长系统：把每个技能拆成境界、十层进阶和可计数任务，用来追踪长期练习。

## 功能

- 多技能独立修炼路线
- 内置“凡人修仙传路线”“绝世战神武道路线”“神位仙阶路线”等预设
- 境界可新增、删除、改名，每个境界固定 10 层
- 每层可编辑标题、描述和多个任务
- 任务支持 `0/n` 进度，点击 `+` 推进一格
- Profile 页面汇总每个技能的当前境界、层级和总进度
- localStorage 自动保存
- 支持 JSON 导入/导出
- 支持浏览器 File System Access API 的本地文件夹双保存
- 内置 AI JSON 生成提示词，可让 AI 返回可直接导入的技能配置

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm run lint
npm test
```

## 数据文件

本地文件夹保存会写入：

```text
cultivation-progress.json
```

导出的 JSON 可以作为完整备份，也可以把 AI 生成的 `skills` JSON 合并导入。
