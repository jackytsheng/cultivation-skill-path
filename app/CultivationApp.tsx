"use client";

import {
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Task = {
  id: string;
  title: string;
  target: number;
  progress: number;
};

type Layer = {
  id: string;
  number: number;
  title: string;
  description: string;
  tasks: Task[];
};

type Realm = {
  id: string;
  name: string;
  summary: string;
  layers: Layer[];
};

type ActivityDay = {
  date: string;
  completedTasks: number;
  layerUps: string[];
  realmUps: string[];
  grandMastery: boolean;
  updatedAt: string;
};

type Skill = {
  id: string;
  name: string;
  description: string;
  color: string;
  presetName: string;
  realms: Realm[];
  activity: ActivityDay[];
  createdAt: string;
  updatedAt: string;
};

type StorageInfo = {
  progressFileName: string;
  localFolderName?: string;
  localFolderLinkedAt?: string;
};

type AppState = {
  version: 1;
  updatedAt: string;
  activeSkillId: string;
  storage: StorageInfo;
  skills: Skill[];
};

type Preset = {
  id: string;
  name: string;
  realms: string[];
  selectable?: boolean;
};

type TaskStats = {
  done: number;
  total: number;
  percent: number;
  complete: boolean;
};

type SkillStats = TaskStats & {
  currentRealm?: Realm;
  currentLayer?: Layer;
  currentLayerPercent: number;
  completedLayers: number;
  totalLayers: number;
};

type WritableFileStream = {
  write(data: BlobPart): Promise<void>;
  close(): Promise<void>;
};

type FileSystemFileHandleLike = {
  createWritable(): Promise<WritableFileStream>;
};

type FileSystemDirectoryHandleLike = {
  name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandleLike>;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
};

type FilePickerHandle = {
  getFile(): Promise<File>;
};

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandleLike>;
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FilePickerHandle[]>;
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{
        description: string;
        accept: Record<string, string[]>;
      }>;
    }) => Promise<FileSystemFileHandleLike>;
  }
}

const STORAGE_KEY = "cultivation-growth-state-v1";
const HANDLE_DB_NAME = "cultivation-growth-handles";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "progress-directory";
const PROGRESS_FILE_NAME = "cultivation-progress.json";
const DEFAULT_TIMESTAMP = "2026-08-14T00:00:00.000Z";
const COLORS = ["#2f7d5c", "#a04d3f", "#8b6f24", "#4e6b8f", "#7b5c8f"];
const LAYERS_PER_REALM = 10;
const SKILLS_PER_PAGE = 5;
const ACTIVITY_DAYS_PER_PAGE = 112;
const DAY_MS = 24 * 60 * 60 * 1000;

const PRESETS: Preset[] = [
  {
    id: "fanren",
    name: "凡人修仙传境界路线",
    realms: [
      "炼气",
      "筑基",
      "结丹",
      "元婴",
      "化神",
      "炼虚",
      "合体",
      "大乘",
      "飞升/真仙",
      "金仙",
      "太乙",
      "大罗",
      "道祖",
    ],
  },
  {
    id: "zhanshen",
    name: "绝世战神武道路线",
    realms: [
      "淬体境",
      "先天境",
      "武王境",
      "武宗境",
      "武皇境",
      "武尊境",
      "武圣境",
      "武祖境",
      "武帝境",
      "武神境",
      "人神",
      "地神",
      "天神",
      "人仙",
      "地仙",
      "天仙",
      "主宰",
      "天尊",
      "无上天尊",
    ],
  },
  {
    id: "shenxian",
    name: "神位仙阶路线",
    selectable: false,
    realms: [
      "人神",
      "地神",
      "天神",
      "人仙",
      "地仙",
      "天仙",
      "主宰",
      "天尊",
      "无上天尊",
    ],
  },
  {
    id: "simple",
    name: "极简自修路线",
    realms: ["入门", "熟练", "精通", "化境", "宗师"],
  },
];

const SELECTABLE_PRESETS = PRESETS.filter((preset) => preset.selectable !== false);
const CUSTOM_PRESET_ID = "custom";
const LEGACY_PRESET_IDS_BY_NAME: Record<string, string> = {
  凡人修仙传路线: "fanren",
};

function presetOptionLabel(preset: Preset) {
  return `${preset.name}（共${preset.realms.length}境界）`;
}

function presetMatchesRealms(skill: Skill, preset: Preset) {
  return (
    skill.realms.length === preset.realms.length &&
    skill.realms.every((realm, index) => realm.name === preset.realms[index])
  );
}

function selectedPresetIdForSkill(skill: Skill) {
  return (
    SELECTABLE_PRESETS.find((preset) => presetMatchesRealms(skill, preset))?.id ??
    CUSTOM_PRESET_ID
  );
}

function daoSchemaPrompt(preset: Preset) {
  return `你是一个“修仙式成长系统”的道法策划 agent。用户会先把这整段“道法引”发给你，然后由你主动索取最少必要信息，再把长期修行路径完整推演成一条可以直接导入网页应用的“道法 JSON”。

两段式流程：
1. 如果用户还没有提供“我想学”和“我眼中的顶级状态”，不要生成 JSON。请只回复下面这个表单，不要加其它解释：
请填两项，我再为你生成可导入的道法 JSON：
我想学：
我眼中的顶级状态：

2. 如果用户已经提供了“我想学”和“我眼中的顶级状态”，请不要继续追问，直接生成完整道法 JSON 文件。
3. 如果用户额外提供了当前水平、每周投入时间、偏好的任务强度或希望境界数量，就纳入规划；如果没提供，请自行做合理假设。

生成任务：
1. 把用户想学的能力抽象成“一道”，从入门到顶级状态拆成境界、十层、任务。
2. 按用户的“顶级状态”反推最终境界，再倒推中间路径。
3. 每一层都要有清晰 title 和 description，像一条真实训练路线，而不是空泛口号。
4. 每层任务要可执行、可打卡、可累计次数。任务可以包含练习、复盘、作品、测验、反馈、输出。
5. 每个任务的 target 是完成次数，建议 3 到 30 之间；progress 必须写 0。
6. 任务颗粒度默认每层 3 到 5 个任务；如果用户特别说明，可以调整。
7. 任务难度要随层数递进：前期重基础和稳定，中期重综合和应用，后期重创作、实战、风格、长期稳定性。

交付方式（最重要）：
1. 必须生成一个可下载的 UTF-8 JSON 文件，不要把 JSON 散贴在聊天正文里。
2. 文件名使用 dao-${preset.id}.json；如果能根据用户想学的内容生成更清晰的英文或拼音短名，也可以使用 dao-能力名.json。
3. 文件内容必须是一个完整、合法、可直接导入网页的单条“道法 JSON”。不要拆成多个文件，不要分多条消息逐段输出，不要按境界分批生成。
4. 生成文件后，聊天正文只需要简短说明“已生成可导入的道法 JSON 文件”，不要再重复粘贴完整 JSON。
5. 如果你所在环境暂时无法创建附件，请明确告诉用户换用支持文件生成的 AI 工具；不要改成让用户手动复制 JSON。

生成 JSON 时的导入规则：
1. 这是单条“道法 JSON”，不是完整存档；不要输出 version、skills、storage、activity、id、createdAt、updatedAt。
2. JSON 顶层必须只有 name、description、color、realms 这些导入字段。
3. 当前选择的预设路线是：${preset.name}（共${preset.realms.length}境界）。
4. 网页导入时会按这个预设路线给境界命名：${preset.realms.join(" → ")}。
5. 你不需要输出 realm.name；每个 realm 只写 summary 和 layers。
6. 如果用户没有指定境界数量，请你根据这项能力的学习跨度、复杂度和顶级状态自行决定 realms 数量；常见可以是 5 到 13 个境界，但不要机械套用预设数量。
7. 如果你返回的 realms 少于预设数量，网页只导入你返回的境界，后面多余境界会去掉。
8. 如果你返回的 realms 多于预设数量，网页会把多出来的境界自动命名为“境界${preset.realms.length + 1}”“境界${preset.realms.length + 2}”等。
9. 每个 realm 必须有 summary 和正好 10 个 layers。
10. 每个 layer 必须有 title、description、tasks。
11. 每个 task 必须有 title、target、progress。

最新道法 JSON schema：
{
  "name": "架子鼓",
  "description": "从节拍稳定、肢体协调、律动表达一路修到可录音、可现场、可即兴、可形成个人风格的架子鼓修行路线。",
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

现在开始执行本“道法引”：如果用户还没给出“我想学”和“我眼中的顶级状态”，先索取这两项；如果已经给出，就直接生成可下载的道法 JSON 文件。`;
}

function makeLayer(
  baseId: string,
  realmName: string,
  layerIndex: number,
  custom?: Partial<Layer>,
): Layer {
  const number = layerIndex + 1;
  return {
    id: custom?.id ?? `${baseId}-layer-${number}`,
    number,
    title: custom?.title ?? `${realmName} 第${number}层`,
    description:
      custom?.description ?? "把这一层的要求改成清晰、可完成的练习标准。",
    tasks:
      custom?.tasks && custom.tasks.length > 0
        ? custom.tasks
        : [
            {
              id: `${baseId}-layer-${number}-task-1`,
              title: "定义本层任务",
              target: 1,
              progress: 0,
            },
          ],
  };
}

function makeRealm(
  baseId: string,
  realmName: string,
  realmIndex: number,
  custom?: Partial<Realm>,
): Realm {
  const realmId = custom?.id ?? `${baseId}-realm-${realmIndex + 1}`;
  const rawLayers = custom?.layers ?? [];
  return {
    id: realmId,
    name: custom?.name ?? realmName,
    summary: custom?.summary ?? "自定义这个境界的核心主题。",
    layers: Array.from({ length: LAYERS_PER_REALM }, (_, layerIndex) =>
      makeLayer(`${realmId}`, custom?.name ?? realmName, layerIndex, rawLayers[layerIndex]),
    ),
  };
}

function makeSkillFromPreset(
  name: string,
  description: string,
  preset: Preset,
  baseId: string,
  color = COLORS[0],
): Skill {
  return {
    id: baseId,
    name,
    description,
    color,
    presetName: preset.name,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
    activity: [],
    realms: preset.realms.map((realmName, index) =>
      makeRealm(baseId, realmName, index),
    ),
  };
}

function createDefaultState(): AppState {
  const skill = makeSkillFromPreset(
    "架子鼓",
    "把练习拆成境界、层数和可点击推进的任务。",
    PRESETS[1],
    "skill-drums",
    COLORS[0],
  );

  skill.realms[0].summary = "基本功、节拍稳定、手脚协调";
  skill.realms[0].layers[0] = {
    ...skill.realms[0].layers[0],
    title: "基本功入门：稳住四分音符",
    description: "能在 60 到 80 BPM 下稳定跟节拍器，动作放松。",
    tasks: [
      {
        id: "drums-l1-task-1",
        title: "60 BPM 四分音符跟节拍器练习",
        target: 8,
        progress: 3,
      },
      {
        id: "drums-l1-task-2",
        title: "单跳 5 分钟无明显卡顿",
        target: 5,
        progress: 1,
      },
      {
        id: "drums-l1-task-3",
        title: "写一次练习复盘",
        target: 3,
        progress: 1,
      },
    ],
  };
  skill.realms[0].layers[1] = {
    ...skill.realms[0].layers[1],
    title: "基础协调：右手八分音符",
    description: "让右手、底鼓和军鼓的进入点稳定。",
    tasks: [
      {
        id: "drums-l2-task-1",
        title: "70 BPM 基础 8 beat",
        target: 10,
        progress: 0,
      },
      {
        id: "drums-l2-task-2",
        title: "慢速纠错录音",
        target: 4,
        progress: 0,
      },
    ],
  };

  return {
    version: 1,
    updatedAt: DEFAULT_TIMESTAMP,
    activeSkillId: skill.id,
    storage: {
      progressFileName: PROGRESS_FILE_NAME,
    },
    skills: [skill],
  };
}

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampProgress(value: number, target: number) {
  const max = Math.max(1, Math.floor(target || 1));
  return Math.min(max, Math.max(0, Math.floor(value || 0)));
}

function layerStats(layer: Layer): TaskStats {
  const totals = layer.tasks.reduce(
    (acc, task) => {
      const target = Math.max(1, Math.floor(task.target || 1));
      return {
        done: acc.done + clampProgress(task.progress, target),
        total: acc.total + target,
      };
    },
    { done: 0, total: 0 },
  );
  const percent =
    totals.total === 0 ? 0 : Math.round((totals.done / totals.total) * 100);
  return {
    ...totals,
    percent,
    complete: totals.total > 0 && totals.done >= totals.total,
  };
}

function skillStats(skill: Skill): SkillStats {
  const layers = skill.realms.flatMap((realm) =>
    realm.layers.map((layer) => ({ realm, layer, stats: layerStats(layer) })),
  );
  const total = layers.reduce((sum, item) => sum + item.stats.total, 0);
  const done = layers.reduce((sum, item) => sum + item.stats.done, 0);
  const current = layers.find((item) => !item.stats.complete) ?? layers.at(-1);
  const completedLayers = layers.filter((item) => item.stats.complete).length;
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done >= total,
    currentRealm: current?.realm,
    currentLayer: current?.layer,
    currentLayerPercent: current ? current.stats.percent : 0,
    completedLayers,
    totalLayers: layers.length,
  };
}

function orderedLayerEntries(skill: Skill) {
  return skill.realms.flatMap((realm, realmIndex) =>
    realm.layers.map((layer, layerIndex) => ({
      realm,
      layer,
      index: realmIndex * LAYERS_PER_REALM + layerIndex,
    })),
  );
}

function firstIncompleteLayerEntry(skill: Skill) {
  return orderedLayerEntries(skill).find((entry) => !layerStats(entry.layer).complete);
}

function layerOrderIndex(skill: Skill, realmId: string, layerId: string) {
  return orderedLayerEntries(skill).find(
    (entry) => entry.realm.id === realmId && entry.layer.id === layerId,
  )?.index;
}

function canAdvanceLayer(skill: Skill, realmId: string, layerId: string) {
  const selectedIndex = layerOrderIndex(skill, realmId, layerId);
  if (selectedIndex === undefined) {
    return false;
  }
  const current = firstIncompleteLayerEntry(skill);
  return !current || selectedIndex <= current.index;
}

function canAdvanceRealm(skill: Skill, realmId: string) {
  const realm = skill.realms.find((item) => item.id === realmId);
  const firstLayer = realm?.layers[0];
  return firstLayer ? canAdvanceLayer(skill, realmId, firstLayer.id) : false;
}

function currentGateLabel(skill: Skill) {
  const current = firstIncompleteLayerEntry(skill);
  return current ? `${current.realm.name} · 第${current.layer.number}层` : "";
}

function realmStats(realm: Realm): TaskStats {
  const stats = realm.layers.map(layerStats);
  const total = stats.reduce((sum, item) => sum + item.total, 0);
  const done = stats.reduce((sum, item) => sum + item.done, 0);
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done >= total,
  };
}

function visibleRealmWindow(realms: Realm[], currentIndex: number) {
  if (realms.length <= 10) {
    return realms;
  }
  const start = Math.max(0, Math.min(currentIndex - 4, realms.length - 10));
  return realms.slice(start, start + 10);
}

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(key: string, amount: number) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function activityWindow(activity: ActivityDay[], dayCount = ACTIVITY_DAYS_PER_PAGE, pageOffset = 0) {
  const byDate = new Map(activity.map((day) => [day.date, day]));
  const end = addDays(dateKey(), -pageOffset * dayCount);
  const start = addDays(end, -(dayCount - 1));
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      entry: byDate.get(date),
    };
  });
}

function activityMaxPageOffset(activity: ActivityDay[], dayCount = ACTIVITY_DAYS_PER_PAGE) {
  if (activity.length === 0) {
    return 0;
  }
  const oldestTime = Math.min(
    ...activity.map((day) => dateFromKey(day.date).getTime()),
  );
  const todayTime = dateFromKey(dateKey()).getTime();
  const distance = Math.max(0, Math.floor((todayTime - oldestTime) / DAY_MS));
  return Math.floor(distance / dayCount);
}

function shortDateLabel(key: string) {
  const [, month = "1", day = "1"] = key.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function compactRealmName(name: string) {
  if (name.includes("/")) {
    return name.split("/").filter(Boolean);
  }
  const chars = Array.from(name);
  return chars.length >= 3
    ? [chars.slice(0, 2).join(""), chars.slice(2).join("")]
    : [name];
}

function layerCompletionLabels(before: Skill, after: Skill) {
  const beforeEntries = new Map(
    orderedLayerEntries(before).map((entry) => [
      entry.layer.id,
      layerStats(entry.layer).complete,
    ]),
  );
  return orderedLayerEntries(after)
    .filter(
      (entry) =>
        layerStats(entry.layer).complete && beforeEntries.get(entry.layer.id) !== true,
    )
    .map((entry) => `${entry.realm.name} · 第${entry.layer.number}层`);
}

function realmPromotionLabels(before: Skill, after: Skill) {
  return after.realms.flatMap((realm, index) => {
    const wasComplete =
      before.realms.find((item) => item.id === realm.id)?.layers.every(
        (layer) => layerStats(layer).complete,
      ) ?? false;
    const isComplete = realm.layers.every((layer) => layerStats(layer).complete);
    const nextRealm = after.realms[index + 1];
    return isComplete && !wasComplete && nextRealm ? [`晋升至 ${nextRealm.name}`] : [];
  });
}

function recordActivity(before: Skill, after: Skill, completedTasks: number): Skill {
  const layerUps = layerCompletionLabels(before, after);
  const realmUps = realmPromotionLabels(before, after);
  const grandMastery = !skillStats(before).complete && skillStats(after).complete;
  if (completedTasks <= 0 && layerUps.length === 0 && realmUps.length === 0 && !grandMastery) {
    return after;
  }
  const today = dateKey();
  const now = new Date().toISOString();
  const current = after.activity.find((day) => day.date === today);
  const merged: ActivityDay = {
    date: today,
    completedTasks: (current?.completedTasks ?? 0) + Math.max(0, completedTasks),
    layerUps: uniqueValues([...(current?.layerUps ?? []), ...layerUps]),
    realmUps: uniqueValues([...(current?.realmUps ?? []), ...realmUps]),
    grandMastery: Boolean(current?.grandMastery || grandMastery),
    updatedAt: now,
  };
  return {
    ...after,
    activity: [
      ...after.activity.filter((day) => day.date !== today),
      merged,
    ].sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTask(value: unknown, index: number): Task {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const target = Math.max(1, Math.floor(readNumber(raw.target, 1)));
  return {
    id: readString(raw.id, uid("task")),
    title: readString(raw.title, `任务 ${index + 1}`),
    target,
    progress: clampProgress(readNumber(raw.progress, 0), target),
  };
}

function normalizeLayer(value: unknown, index: number, realmName: string): Layer {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map((task, taskIndex) => normalizeTask(task, taskIndex))
    : [];
  return {
    id: readString(raw.id, uid("layer")),
    number: index + 1,
    title: readString(raw.title, `${realmName} 第${index + 1}层`),
    description: readString(raw.description, "自定义这一层的练习标准。"),
    tasks:
      tasks.length > 0
        ? tasks
        : [
            {
              id: uid("task"),
              title: "定义本层任务",
              target: 1,
              progress: 0,
            },
          ],
  };
}

function normalizeRealm(value: unknown, index: number): Realm {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = readString(raw.name, `自定义境界 ${index + 1}`);
  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
  return {
    id: readString(raw.id, uid("realm")),
    name,
    summary: readString(raw.summary, "自定义这个境界的核心主题。"),
    layers: Array.from({ length: LAYERS_PER_REALM }, (_, layerIndex) =>
      normalizeLayer(rawLayers[layerIndex], layerIndex, name),
    ),
  };
}

function normalizeDaoLayer(value: unknown, index: number, realmName: string): Layer {
  const layer = normalizeLayer(value, index, realmName);
  return {
    ...layer,
    id: uid("layer"),
    tasks: layer.tasks.map((task) => ({
      ...task,
      id: uid("task"),
      progress: 0,
    })),
  };
}

function normalizeDaoRealm(value: unknown, index: number, preset: Preset): Realm {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = preset.realms[index] ?? `境界${index + 1}`;
  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
  return {
    id: uid("realm"),
    name,
    summary: readString(raw.summary, "自定义这个境界的核心主题。"),
    layers: Array.from({ length: LAYERS_PER_REALM }, (_, layerIndex) =>
      normalizeDaoLayer(rawLayers[layerIndex], layerIndex, name),
    ),
  };
}

function readDaoSkillSchema(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (Array.isArray(raw.skills) && raw.skills[0]) {
    return raw.skills[0];
  }
  if (raw.skill && typeof raw.skill === "object") {
    return raw.skill;
  }
  return value;
}

function normalizeDaoSchemaSkill(value: unknown, preset: Preset, index: number): Skill {
  const schema = readDaoSkillSchema(value);
  const raw = schema && typeof schema === "object" ? (schema as Record<string, unknown>) : {};
  const rawRealms = Array.isArray(raw.realms) ? raw.realms : [];
  if (rawRealms.length === 0) {
    throw new Error("道法 JSON 里没有 realms，无法导入整条道。");
  }
  const now = new Date().toISOString();
  return {
    id: uid("skill"),
    name: readString(raw.name, `道 ${index + 1}`),
    description: readString(raw.description, "自定义这条道的修炼目标。"),
    color: readString(raw.color, COLORS[index % COLORS.length]),
    presetName: preset.name,
    realms: rawRealms.map((realm, realmIndex) =>
      normalizeDaoRealm(realm, realmIndex, preset),
    ),
    activity: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeActivityDay(value: unknown): ActivityDay | undefined {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)
    ? raw.date
    : "";
  if (!date) {
    return undefined;
  }
  return {
    date,
    completedTasks: Math.max(0, Math.floor(readNumber(raw.completedTasks, 0))),
    layerUps: Array.isArray(raw.layerUps)
      ? raw.layerUps.filter((item): item is string => typeof item === "string")
      : [],
    realmUps: Array.isArray(raw.realmUps)
      ? raw.realmUps.filter((item): item is string => typeof item === "string")
      : [],
    grandMastery: Boolean(raw.grandMastery),
    updatedAt: readString(raw.updatedAt, new Date().toISOString()),
  };
}

function normalizeSkill(value: unknown, index: number): Skill {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawPresetName = readString(raw.presetName, "");
  const rawPresetId = readString(raw.presetId, "");
  const legacyPresetId = LEGACY_PRESET_IDS_BY_NAME[rawPresetName];
  const preset =
    PRESETS.find(
      (item) =>
        item.name === rawPresetName ||
        item.id === rawPresetId ||
        item.id === legacyPresetId,
    ) ??
    PRESETS[0];
  const presetName =
    rawPresetName === "自定义路线"
      ? rawPresetName
      : legacyPresetId || rawPresetId || PRESETS.some((item) => item.name === rawPresetName)
        ? preset.name
        : readString(raw.presetName, preset.name);
  const rawRealms = Array.isArray(raw.realms) ? raw.realms : [];
  const realms =
    rawRealms.length > 0
      ? rawRealms.map((realm, realmIndex) => normalizeRealm(realm, realmIndex))
      : preset.realms.map((realmName, realmIndex) =>
          makeRealm(uid("skill"), realmName, realmIndex),
        );
  const now = new Date().toISOString();
  return {
    id: readString(raw.id, uid("skill")),
    name: readString(raw.name, `道 ${index + 1}`),
    description: readString(raw.description, "自定义这条道的修炼目标。"),
    color: readString(raw.color, COLORS[index % COLORS.length]),
    presetName,
    realms,
    activity: Array.isArray(raw.activity)
      ? raw.activity
          .map((day) => normalizeActivityDay(day))
          .filter((day): day is ActivityDay => Boolean(day))
      : [],
    createdAt: readString(raw.createdAt, now),
    updatedAt: readString(raw.updatedAt, now),
  };
}

function normalizeStorage(value: unknown): StorageInfo {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    progressFileName: readString(raw.progressFileName, PROGRESS_FILE_NAME),
    localFolderName:
      typeof raw.localFolderName === "string" && raw.localFolderName.trim()
        ? raw.localFolderName.trim()
        : undefined,
    localFolderLinkedAt:
      typeof raw.localFolderLinkedAt === "string" && raw.localFolderLinkedAt.trim()
        ? raw.localFolderLinkedAt.trim()
        : undefined,
  };
}

function normalizeImport(value: unknown): AppState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const incomingSkills = Array.isArray(raw.skills)
    ? raw.skills
    : Array.isArray(value)
      ? value
      : [value];
  const skills = incomingSkills.map((skill, index) => normalizeSkill(skill, index));
  if (skills.length === 0) {
    throw new Error("JSON 里没有可导入的 skills。");
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    activeSkillId: readString(raw.activeSkillId, skills[0].id),
    storage: normalizeStorage(raw.storage),
    skills,
  };
}

function mergeImportedState(current: AppState, imported: AppState): AppState {
  const existingIds = new Set(current.skills.map((skill) => skill.id));
  const incoming = imported.skills.map((skill, index) =>
    existingIds.has(skill.id) ? { ...skill, id: uid(`skill-${index}`) } : skill,
  );
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    activeSkillId: incoming[0]?.id ?? current.activeSkillId,
    storage: current.storage,
    skills: [...current.skills, ...incoming],
  };
}

function downloadJson(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = PROGRESS_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandleLike) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadStoredDirectoryHandle() {
  const db = await openHandleDb();
  const handle = await new Promise<FileSystemDirectoryHandleLike | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const request = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      request.onsuccess = () =>
        resolve(request.result as FileSystemDirectoryHandleLike | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  db.close();
  return handle;
}

async function ensureWritePermission(handle: FileSystemDirectoryHandleLike) {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }
  const options = { mode: "readwrite" as const };
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }
  return (await handle.requestPermission(options)) === "granted";
}

async function writeStateToDirectory(
  state: AppState,
  handle: FileSystemDirectoryHandleLike,
) {
  const allowed = await ensureWritePermission(handle);
  if (!allowed) {
    throw new Error("没有本地文件夹写入权限。");
  }
  const fileHandle = await handle.getFileHandle(PROGRESS_FILE_NAME, {
    create: true,
  });
  const stream = await fileHandle.createWritable();
  await stream.write(JSON.stringify(state, null, 2));
  await stream.close();
}

function ProgressBar({ percent, tone }: { percent: number; tone?: string }) {
  return (
    <div className="progress-track" aria-label={`完成度 ${percent}%`}>
      <span
        className="progress-fill"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: tone,
        }}
      />
    </div>
  );
}

function activityTooltip(date: string, entry?: ActivityDay) {
  if (!entry) {
    return `${date}\n暂无打卡`;
  }
  const lines = [`${date} 完成 ${entry.completedTasks} 项功课`];
  if (entry.layerUps.length > 0) {
    lines.push(`破层：${entry.layerUps.join("、")}`);
  }
  if (entry.realmUps.length > 0) {
    lines.push(`升阶：${entry.realmUps.join("、")}`);
  }
  if (entry.grandMastery) {
    lines.push("大圆满：此道全境圆满");
  }
  return lines.join("\n");
}

function activityCellClass(entry?: ActivityDay) {
  if (!entry) {
    return "activity-cell";
  }
  const level = Math.min(4, Math.max(1, Math.ceil(entry.completedTasks / 2)));
  const milestone = entry.grandMastery
    ? "grand"
    : entry.realmUps.length > 0
      ? "realm-up"
      : entry.layerUps.length > 0
        ? "layer-up"
        : "";
  return ["activity-cell", `level-${level}`, milestone]
    .filter(Boolean)
    .join(" ");
}

function ActivityGrid({ skill }: { skill: Skill }) {
  const maxPageOffset = activityMaxPageOffset(skill.activity);
  const [pageOffset, setPageOffset] = useState(0);
  const visiblePageOffset = Math.min(pageOffset, maxPageOffset);
  const days = activityWindow(
    skill.activity,
    ACTIVITY_DAYS_PER_PAGE,
    visiblePageOffset,
  );
  const total = days.reduce((sum, day) => sum + (day.entry?.completedTasks ?? 0), 0);
  const rangeLabel =
    visiblePageOffset === 0
      ? "近 16 周"
      : `${shortDateLabel(days[0]?.date ?? "")} - ${shortDateLabel(days.at(-1)?.date ?? "")}`;
  return (
    <div
      className="dao-ledger"
      style={{ "--dao-color": skill.color } as CSSProperties}
    >
      <div className="dao-ledger-head">
        <span>道历打卡</span>
        <div className="dao-ledger-controls" aria-label={`${skill.name} 道历翻页`}>
          <button
            type="button"
            aria-label="往前翻看更早道历"
            onClick={() =>
              setPageOffset(Math.min(maxPageOffset, visiblePageOffset + 1))
            }
            disabled={visiblePageOffset >= maxPageOffset}
          >
            ◀
          </button>
          <b>{rangeLabel} · {total} 项</b>
          <button
            type="button"
            aria-label="往后翻看更新道历"
            onClick={() => setPageOffset(Math.max(0, visiblePageOffset - 1))}
            disabled={visiblePageOffset === 0}
          >
            ▶
          </button>
        </div>
      </div>
      <div className="activity-grid" aria-label={`${skill.name} 道历打卡`}>
        {days.map(({ date, entry }) => {
          const tooltip = activityTooltip(date, entry);
          return (
            <button
              type="button"
              key={date}
              className={activityCellClass(entry)}
              data-tooltip={tooltip}
              aria-label={tooltip}
            />
          );
        })}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div className="stat-box">
      <span>{label}</span>
      <strong>{value}</strong>
      {children}
    </div>
  );
}

function PanelHeading({ title, tone = "green" }: { title: string; tone?: string }) {
  return (
    <div className="panel-heading">
      <span className={`heading-diamond ${tone}`} aria-hidden="true" />
      <h2>{title}</h2>
    </div>
  );
}

function ScrollEmblem() {
  return <div className="scroll-emblem" aria-hidden="true" />;
}

function MetricCard({
  tone,
  icon,
  label,
  value,
  caption,
}: {
  tone: string;
  icon: string;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span className="metric-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </div>
  );
}

export function CultivationApp() {
  const [state, setState] = useState<AppState>(() => createDefaultState());
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"practice" | "profile" | "prompt">("practice");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDescription, setNewSkillDescription] = useState("");
  const [newSkillPreset, setNewSkillPreset] = useState(
    SELECTABLE_PRESETS[0]?.id ?? PRESETS[0].id,
  );
  const [daoImportPreset, setDaoImportPreset] = useState(
    SELECTABLE_PRESETS[0]?.id ?? PRESETS[0].id,
  );
  const [promptVaultOpen, setPromptVaultOpen] = useState(false);
  const [selectedRealmId, setSelectedRealmId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [skillPage, setSkillPage] = useState(0);
  const [newRealmName, setNewRealmName] = useState("");
  const [status, setStatus] = useState("本机自动保存已开启");
  const [fileApiSupported, setFileApiSupported] = useState(false);
  const [directoryHandle, setDirectoryHandle] =
    useState<FileSystemDirectoryHandleLike | null>(null);
  const [folderName, setFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const daoFileInputRef = useRef<HTMLInputElement>(null);

  const activeSkill =
    state.skills.find((skill) => skill.id === state.activeSkillId) ??
    state.skills[0];
  const activeStats = activeSkill ? skillStats(activeSkill) : undefined;
  const selectedRealm =
    activeSkill?.realms.find((realm) => realm.id === selectedRealmId) ??
    activeStats?.currentRealm ??
    activeSkill?.realms[0];
  const selectedLayer =
    selectedRealm?.layers.find((layer) => layer.id === selectedLayerId) ??
    activeStats?.currentLayer ??
    selectedRealm?.layers[0];
  const activePresetId = activeSkill
    ? selectedPresetIdForSkill(activeSkill)
    : CUSTOM_PRESET_ID;
  const selectedRealmStats = selectedRealm ? realmStats(selectedRealm) : undefined;
  const selectedLayerStats = selectedLayer ? layerStats(selectedLayer) : undefined;
  const selectedLayerUnlocked =
    activeSkill && selectedRealm && selectedLayer
      ? canAdvanceLayer(activeSkill, selectedRealm.id, selectedLayer.id)
      : false;
  const gateLabel = activeSkill ? currentGateLabel(activeSkill) : "";

  const profileStats = useMemo(
    () => state.skills.map((skill) => ({ skill, stats: skillStats(skill) })),
    [state.skills],
  );
  const skillPageCount = Math.max(
    1,
    Math.ceil(profileStats.length / SKILLS_PER_PAGE),
  );
  const currentSkillPage = Math.min(skillPage, skillPageCount - 1);
  const activeSkillIndex = profileStats.findIndex(
    ({ skill }) => skill.id === state.activeSkillId,
  );
  const activeSkillPage =
    activeSkillIndex >= 0 ? Math.floor(activeSkillIndex / SKILLS_PER_PAGE) : 0;
  const visibleProfileStats = profileStats.slice(
    currentSkillPage * SKILLS_PER_PAGE,
    currentSkillPage * SKILLS_PER_PAGE + SKILLS_PER_PAGE,
  );
  const currentRealmIndex = Math.max(
    0,
    activeSkill?.realms.findIndex(
      (realm) => realm.id === activeStats?.currentRealm?.id,
    ) ?? 0,
  );
  const visibleRealms = activeSkill
    ? visibleRealmWindow(activeSkill.realms, currentRealmIndex)
    : [];
  const activeTasks = useMemo(
    () =>
      activeSkill
        ? activeSkill.realms.flatMap((realm) =>
            realm.layers.flatMap((layer) => layer.tasks),
          )
        : [],
    [activeSkill],
  );
  const taskOverview = useMemo(
    () => ({
      total: activeTasks.length,
      doing: activeTasks.filter(
        (task) => task.progress > 0 && task.progress < task.target,
      ).length,
      done: activeTasks.filter((task) => task.progress >= task.target).length,
      waiting: activeTasks.filter((task) => task.progress === 0).length,
    }),
    [activeTasks],
  );
  const selectedDaoImportPreset =
    SELECTABLE_PRESETS.find((item) => item.id === daoImportPreset) ??
    SELECTABLE_PRESETS[0] ??
    PRESETS[0];
  const currentDaoSchemaPrompt = useMemo(
    () => daoSchemaPrompt(selectedDaoImportPreset),
    [selectedDaoImportPreset],
  );

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    let restoredState: AppState | null = null;
    let nextStatus = "本机自动保存已开启";
    if (raw) {
      try {
        restoredState = normalizeImport(JSON.parse(raw));
        nextStatus = "已从 localStorage 恢复进度";
      } catch {
        nextStatus = "本机存档读取失败，已载入默认示例";
      }
    }
    window.queueMicrotask(() => {
      if (restoredState) {
        setState(restoredState);
      }
      setStatus(nextStatus);
      setFileApiSupported(Boolean(window.showDirectoryPicker));
    });
    loadStoredDirectoryHandle()
      .then((handle) => {
        if (handle) {
          setDirectoryHandle(handle);
          setFolderName(handle.name);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    const nextState = { ...state, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }, [loaded, state]);

  useEffect(() => {
    if (!loaded || !directoryHandle) {
      return;
    }
    const timeout = window.setTimeout(() => {
      writeStateToDirectory(
        {
          ...state,
          updatedAt: new Date().toISOString(),
          storage: {
            ...state.storage,
            progressFileName: PROGRESS_FILE_NAME,
            localFolderName: folderName || state.storage.localFolderName,
          },
        },
        directoryHandle,
      )
        .then(() => setStatus(`已同步到 ${folderName || "本地文件夹"}`))
        .catch(() => setStatus("本机已保存；本地文件夹需要重新授权"));
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [directoryHandle, folderName, loaded, state]);

  function updateState(updater: (current: AppState) => AppState) {
    setState((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateActiveSkill(updater: (skill: Skill) => Skill) {
    updateState((current) => ({
      ...current,
      skills: current.skills.map((skill) =>
        skill.id === current.activeSkillId
          ? { ...updater(skill), updatedAt: new Date().toISOString() }
          : skill,
      ),
    }));
  }

  function addSkill() {
    const preset =
      SELECTABLE_PRESETS.find((item) => item.id === newSkillPreset) ??
      SELECTABLE_PRESETS[0] ??
      PRESETS[0];
    const skill = makeSkillFromPreset(
      newSkillName.trim() || `道 ${state.skills.length + 1}`,
      newSkillDescription.trim() || "把长期目标拆成境界、层数和任务。",
      preset,
      uid("skill"),
      COLORS[state.skills.length % COLORS.length],
    );
    updateState((current) => ({
      ...current,
      activeSkillId: skill.id,
      skills: [...current.skills, skill],
    }));
    setSelectedRealmId(skill.realms[0]?.id ?? "");
    setSelectedLayerId(skill.realms[0]?.layers[0]?.id ?? "");
    setNewSkillName("");
    setNewSkillDescription("");
    setView("practice");
  }

  function deleteSkill(skillId: string) {
    if (state.skills.length <= 1) {
      return;
    }
    const targetSkill = state.skills.find((skill) => skill.id === skillId);
    if (!targetSkill) {
      return;
    }
    const confirmed = window.confirm(`删除此道“${targetSkill.name}”？`);
    if (!confirmed) {
      return;
    }
    const nextSkills = state.skills.filter((skill) => skill.id !== skillId);
    const nextActiveSkillId =
      state.activeSkillId === skillId
        ? nextSkills[0]?.id ?? ""
        : state.activeSkillId;
    const nextActiveSkill = nextSkills.find((skill) => skill.id === nextActiveSkillId);
    updateState((current) => {
      const skills = current.skills.filter((skill) => skill.id !== skillId);
      return {
        ...current,
        skills,
        activeSkillId:
          current.activeSkillId === skillId
            ? skills[0]?.id ?? ""
            : current.activeSkillId,
      };
    });
    if (state.activeSkillId === skillId) {
      setSelectedRealmId(nextActiveSkill?.realms[0]?.id ?? "");
      setSelectedLayerId(nextActiveSkill?.realms[0]?.layers[0]?.id ?? "");
    }
    setSkillPage((page) =>
      Math.min(page, Math.max(0, Math.ceil(nextSkills.length / SKILLS_PER_PAGE) - 1)),
    );
  }

  function applyPresetToActiveSkill(presetId: string) {
    if (!activeSkill || presetId === CUSTOM_PRESET_ID) {
      return;
    }
    const preset = SELECTABLE_PRESETS.find((item) => item.id === presetId);
    if (!preset || selectedPresetIdForSkill(activeSkill) === preset.id) {
      updateActiveSkill((skill) => ({ ...skill, presetName: preset?.name ?? skill.presetName }));
      return;
    }
    const removedCount = activeSkill.realms.length - preset.realms.length;
    if (removedCount > 0) {
      const confirmed = window.confirm(
        `切换为“${preset.name}”会移除后面 ${removedCount} 个境界，以及其中的层级、任务和进度。确定继续？`,
      );
      if (!confirmed) {
        return;
      }
    }

    const previousRealmIndex = Math.max(
      0,
      activeSkill.realms.findIndex((realm) => realm.id === selectedRealm?.id),
    );
    const previousLayerIndex = Math.max(
      0,
      selectedRealm?.layers.findIndex((layer) => layer.id === selectedLayer?.id) ?? 0,
    );
    const realms = preset.realms.map((realmName, index) => {
      const existingRealm = activeSkill.realms[index];
      return existingRealm
        ? { ...existingRealm, name: realmName }
        : makeRealm(activeSkill.id, realmName, index, {
            id: uid("realm"),
            name: realmName,
          });
    });
    const nextRealmIndex = Math.min(previousRealmIndex, realms.length - 1);
    const nextRealm = realms[nextRealmIndex];
    const nextLayerIndex = Math.min(
      previousLayerIndex,
      Math.max(0, (nextRealm?.layers.length ?? 1) - 1),
    );

    updateActiveSkill((skill) => ({
      ...skill,
      presetName: preset.name,
      realms,
    }));
    setSelectedRealmId(nextRealm?.id ?? "");
    setSelectedLayerId(nextRealm?.layers[nextLayerIndex]?.id ?? "");
    setStatus(`已套用${preset.name}，原有层级任务已按位置保留`);
  }

  function updateRealm(realmId: string, patch: Partial<Realm>) {
    updateActiveSkill((skill) => ({
      ...skill,
      presetName: Object.prototype.hasOwnProperty.call(patch, "name")
        ? "自定义路线"
        : skill.presetName,
      realms: skill.realms.map((realm) =>
        realm.id === realmId ? { ...realm, ...patch } : realm,
      ),
    }));
  }

  function addRealm() {
    if (!activeSkill) {
      return;
    }
    const name = newRealmName.trim() || `自定义境界 ${activeSkill.realms.length + 1}`;
    const realm = makeRealm(activeSkill.id, name, activeSkill.realms.length, {
      id: uid("realm"),
      name,
    });
    updateActiveSkill((skill) => ({
      ...skill,
      presetName: "自定义路线",
      realms: [...skill.realms, realm],
    }));
    setSelectedRealmId(realm.id);
    setSelectedLayerId(realm.layers[0]?.id ?? "");
    setNewRealmName("");
  }

  function deleteRealm(realmId: string) {
    if (!activeSkill || activeSkill.realms.length <= 1) {
      return;
    }
    updateActiveSkill((skill) => {
      const realms = skill.realms.filter((realm) => realm.id !== realmId);
      return { ...skill, presetName: "自定义路线", realms };
    });
    const nextRealm = activeSkill.realms.find((realm) => realm.id !== realmId);
    setSelectedRealmId(nextRealm?.id ?? "");
    setSelectedLayerId(nextRealm?.layers[0]?.id ?? "");
  }

  function updateLayer(realmId: string, layerId: string, patch: Partial<Layer>) {
    updateActiveSkill((skill) => ({
      ...skill,
      realms: skill.realms.map((realm) =>
        realm.id === realmId
          ? {
              ...realm,
              layers: realm.layers.map((layer) =>
                layer.id === layerId ? { ...layer, ...patch } : layer,
              ),
            }
          : realm,
      ),
    }));
  }

  function updateTask(
    realmId: string,
    layerId: string,
    taskId: string,
    patch: Partial<Task>,
  ) {
    const changesProgress = Object.prototype.hasOwnProperty.call(patch, "progress");
    if (changesProgress && activeSkill && !canAdvanceLayer(activeSkill, realmId, layerId)) {
      setStatus(`先完成 ${currentGateLabel(activeSkill)}，再推进后续层级`);
      return;
    }
    updateActiveSkill((skill) => {
      let progressDelta = 0;
      const nextSkill = {
        ...skill,
        realms: skill.realms.map((realm) =>
          realm.id === realmId
            ? {
                ...realm,
                layers: realm.layers.map((layer) =>
                  layer.id === layerId
                    ? {
                        ...layer,
                        tasks: layer.tasks.map((task) => {
                          if (task.id !== taskId) {
                            return task;
                          }
                          const nextTarget = Math.max(
                            1,
                            Math.floor(patch.target ?? task.target),
                          );
                          const nextProgress = clampProgress(
                            patch.progress ?? task.progress,
                            nextTarget,
                          );
                          if (changesProgress) {
                            progressDelta += Math.max(0, nextProgress - task.progress);
                          }
                          return {
                            ...task,
                            ...patch,
                            target: nextTarget,
                            progress: nextProgress,
                          };
                        }),
                      }
                    : layer,
                ),
              }
            : realm,
        ),
      };
      return changesProgress && progressDelta > 0
        ? recordActivity(skill, nextSkill, progressDelta)
        : nextSkill;
    });
  }

  function addTask(realmId: string, layerId: string) {
    updateActiveSkill((skill) => ({
      ...skill,
      realms: skill.realms.map((realm) =>
        realm.id === realmId
          ? {
              ...realm,
              layers: realm.layers.map((layer) =>
                layer.id === layerId
                  ? {
                      ...layer,
                      tasks: [
                        ...layer.tasks,
                        {
                          id: uid("task"),
                          title: "新任务",
                          target: 1,
                          progress: 0,
                        },
                      ],
                    }
                  : layer,
              ),
            }
          : realm,
      ),
    }));
  }

  function deleteTask(realmId: string, layerId: string, taskId: string) {
    updateActiveSkill((skill) => ({
      ...skill,
      realms: skill.realms.map((realm) =>
        realm.id === realmId
          ? {
              ...realm,
              layers: realm.layers.map((layer) =>
                layer.id === layerId
                  ? {
                      ...layer,
                      tasks:
                        layer.tasks.length > 1
                          ? layer.tasks.filter((task) => task.id !== taskId)
                          : layer.tasks,
                    }
                  : layer,
              ),
            }
          : realm,
      ),
    }));
  }

  async function chooseFolder() {
    if (!window.showDirectoryPicker) {
      setStatus("当前浏览器未开放文件夹写入");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const now = new Date().toISOString();
      const nextState: AppState = {
        ...state,
        updatedAt: now,
        storage: {
          ...state.storage,
          progressFileName: PROGRESS_FILE_NAME,
          localFolderName: handle.name,
          localFolderLinkedAt: now,
        },
      };
      await saveStoredDirectoryHandle(handle);
      await writeStateToDirectory(nextState, handle);
      setState(nextState);
      setDirectoryHandle(handle);
      setFolderName(handle.name);
      setStatus(`已连接本地文件夹：${handle.name}`);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setStatus((error as Error).message || "本地文件夹连接失败");
      }
    }
  }

  async function saveToFolderNow() {
    if (!directoryHandle) {
      await chooseFolder();
      return;
    }
    try {
      const now = new Date().toISOString();
      const nextState: AppState = {
        ...state,
        updatedAt: now,
        storage: {
          ...state.storage,
          progressFileName: PROGRESS_FILE_NAME,
          localFolderName: folderName || state.storage.localFolderName,
          localFolderLinkedAt: state.storage.localFolderLinkedAt ?? now,
        },
      };
      await writeStateToDirectory(nextState, directoryHandle);
      setState(nextState);
      setStatus(`已保存到 ${folderName || "本地文件夹"}`);
    } catch {
      setStatus("保存失败，请重新选择本地文件夹");
    }
  }

  async function exportJson() {
    const exportState = {
      ...state,
      updatedAt: new Date().toISOString(),
      storage: {
        ...state.storage,
        progressFileName: PROGRESS_FILE_NAME,
        localFolderName: folderName || state.storage.localFolderName,
      },
    };
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: PROGRESS_FILE_NAME,
          types: [
            {
              description: "JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const stream = await fileHandle.createWritable();
        await stream.write(JSON.stringify(exportState, null, 2));
        await stream.close();
        setStatus("存档已导出");
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
      }
    }
    downloadJson(exportState);
    setStatus("存档已下载");
  }

  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const imported = normalizeImport(parsed);
      const isFullBackup =
        Boolean(parsed && typeof parsed === "object" && "version" in parsed) &&
        Boolean(parsed && typeof parsed === "object" && "skills" in parsed);
      const overwrite =
        isFullBackup &&
        window.confirm("检测到完整存档。确定覆盖当前全部道途？取消则合并导入。");
      updateState((current) => (overwrite ? imported : mergeImportedState(current, imported)));
      const importedFolder = imported.storage.localFolderName;
      setStatus(
        overwrite
          ? importedFolder
            ? `存档已覆盖导入；若要继续同步到 ${importedFolder}，请重新选择本地文件夹授权`
            : "存档已覆盖导入"
          : "存档已合并导入",
      );
      setView("profile");
    } catch (error) {
      setStatus((error as Error).message || "存档导入失败");
    }
  }

  async function importJson() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        if (handle) {
          await importFile(await handle.getFile());
        }
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
      }
    }
    fileInputRef.current?.click();
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void importFile(file);
    }
    event.target.value = "";
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(currentDaoSchemaPrompt);
    setStatus("道法引已刻录");
  }

  function addDaoFromSchema(parsed: unknown) {
    const skill = normalizeDaoSchemaSkill(
      parsed,
      selectedDaoImportPreset,
      state.skills.length,
    );
    updateState((current) => ({
      ...current,
      activeSkillId: skill.id,
      skills: [...current.skills, skill],
    }));
    setSelectedRealmId(skill.realms[0]?.id ?? "");
    setSelectedLayerId(skill.realms[0]?.layers[0]?.id ?? "");
    setStatus(`道法“${skill.name}”已导入`);
    setView("practice");
  }

  async function importDaoSchemaFile(file: File) {
    try {
      addDaoFromSchema(JSON.parse(await file.text()) as unknown);
    } catch (error) {
      setStatus((error as Error).message || "道法秘籍导入失败");
    }
  }

  async function selectDaoSchemaFile() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "道法秘籍",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        if (handle) {
          await importDaoSchemaFile(await handle.getFile());
        }
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
      }
    }
    daoFileInputRef.current?.click();
  }

  function handleDaoFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void importDaoSchemaFile(file);
    }
    event.target.value = "";
  }

  if (!activeSkill || !activeStats) {
    return null;
  }

  return (
    <main className="app-shell">
      <header className="hero-grid">
        <section className="brand-panel" aria-label="修炼档案">
          <ScrollEmblem />
          <div className="brand-copy">
            <h1>修炼档案</h1>
            <div className="brand-rule" aria-hidden="true">
              <span />
            </div>
            <p className="brand-subtitle">
              {activeSkill.name} <span>·</span> 修炼功法
            </p>
            <p className="brand-meta">
              {activeSkill.description.trim() || "此道目标尚未填写"}
            </p>
          </div>
        </section>

        <section className="realm-card" aria-label="境界进度">
          <PanelHeading title="境界" />
          <div className="realm-orbit-list">
            {visibleRealms.map((realm) => {
              const unlocked = canAdvanceRealm(activeSkill, realm.id);
              return (
                <button
                  key={realm.id}
                  title={
                    unlocked
                      ? `${realm.name} ${realmStats(realm).percent}%`
                      : `未解锁：先完成 ${gateLabel}`
                  }
                  className={`realm-orb ${
                    activeStats.currentRealm?.id === realm.id ? "current" : ""
                  } ${selectedRealm?.id === realm.id ? "selected" : ""} ${
                    unlocked ? "" : "locked"
                  }`}
                  onClick={() => {
                    setSelectedRealmId(realm.id);
                    setSelectedLayerId(realm.layers[0]?.id ?? "");
                    setView("practice");
                  }}
                >
                  {compactRealmName(realm.name).map((part, index) => (
                    <span key={`${part}-${index}`}>{part}</span>
                  ))}
                </button>
              );
            })}
          </div>
          {selectedRealm ? (
            <div className="realm-brief" aria-live="polite">
              <div>
                <span>境界说明</span>
                <strong>{selectedRealm.name}</strong>
                <p>
                  {selectedRealm.summary.trim() ||
                    "在境界路线里写下此境界的目标、要求或修行纲领。"}
                </p>
              </div>
              <b>{selectedRealmStats?.percent ?? 0}%</b>
            </div>
          ) : null}
          <div className="layer-path">
            {selectedRealm?.layers.map((layer) => {
              const stats = layerStats(layer);
              const unlocked = canAdvanceLayer(activeSkill, selectedRealm.id, layer.id);
              return (
                <button
                  key={layer.id}
                  className={`path-node ${
                    selectedLayer?.id === layer.id ? "active" : ""
                  } ${stats.complete ? "complete" : ""} ${
                    unlocked ? "" : "locked"
                  }`}
                  title={unlocked ? `第${layer.number}层` : `未解锁：先完成 ${gateLabel}`}
                  onClick={() => {
                    setSelectedLayerId(layer.id);
                    setView("practice");
                  }}
                >
                  <span />
                  <b>第{layer.number}层</b>
                </button>
              );
            })}
          </div>
        </section>
      </header>

      <section className="command-strip" aria-label="保存与导入">
        <nav className="view-tabs" aria-label="页面">
          <button
            className={view === "practice" ? "active" : ""}
            onClick={() => setView("practice")}
          >
            修炼台
          </button>
          <button
            className={view === "profile" ? "active" : ""}
            onClick={() => {
              setSkillPage(activeSkillPage);
              setView("profile");
            }}
          >
            修为总览
          </button>
          <button
            className={view === "prompt" ? "active" : ""}
            onClick={() => setView("prompt")}
          >
            道册
          </button>
        </nav>
        <span>{status}</span>
        <div className="command-actions">
          <button className="command-button import-command" onClick={importJson}>
            导入存档
          </button>
          <button className="command-button export-command" onClick={exportJson}>
            导出存档
          </button>
          <button className="command-button save-command" onClick={saveToFolderNow}>
            {folderName ? "保存进度" : "选择本地文件夹"}
          </button>
        </div>
        {!fileApiSupported && (
          <small>
            当前浏览器未开放本地文件夹写入；仍会自动存到 localStorage，也可以手动导入/导出 JSON 存档。
          </small>
        )}
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json,.json"
          onChange={handleFileInput}
        />
        <input
          ref={daoFileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json,.json"
          onChange={handleDaoFileInput}
        />
      </section>

      {view === "profile" ? (
        <section className="profile-page" aria-label="诸道档案">
          <div className="section-heading">
            <div>
              <p className="eyebrow">修为总览</p>
              <h2>
                诸道境界 <span>共 {state.skills.length} 道</span>
              </h2>
            </div>
            <strong>第 {currentSkillPage + 1} / {skillPageCount} 页</strong>
          </div>
          <div className="overview-management">
            <div className="cultivation-skill-panel">
              <PanelHeading title="诸道修行" />
              <div className="cultivation-rows">
                {visibleProfileStats.map(({ skill, stats }, index) => (
                  <button
                    key={skill.id}
                    className={`cultivation-row ${
                      skill.id === activeSkill.id ? "active" : ""
                    }`}
                    onClick={() => {
                      setState((current) => ({
                        ...current,
                        activeSkillId: skill.id,
                      }));
                      setSelectedRealmId(stats.currentRealm?.id ?? "");
                      setSelectedLayerId(stats.currentLayer?.id ?? "");
                      setView("practice");
                    }}
                  >
                    <span
                      className={`round-seal seal-${
                        ((currentSkillPage * SKILLS_PER_PAGE + index) % 4) + 1
                      }`}
                      aria-hidden="true"
                    >
                      {skill.name.slice(0, 1)}
                    </span>
                    <strong>{skill.name}</strong>
                    <small>等级 {stats.currentLayer?.number ?? 1}</small>
                    <ProgressBar percent={stats.percent} tone={skill.color} />
                    <b>
                      {stats.done} / {stats.total}
                    </b>
                  </button>
                ))}
              </div>
              <div className="cultivation-pager" aria-label="诸道修行分页">
                <button
                  onClick={() => setSkillPage((page) => Math.max(0, page - 1))}
                  disabled={currentSkillPage === 0}
                >
                  上一页
                </button>
                <span>
                  第 {currentSkillPage + 1} / {skillPageCount} 页 · 5道/页
                </span>
                <button
                  onClick={() =>
                    setSkillPage((page) => Math.min(skillPageCount - 1, page + 1))
                  }
                  disabled={currentSkillPage >= skillPageCount - 1}
                >
                  下一页
                </button>
              </div>
            </div>

            <div className="overview-create-panel">
              <PanelHeading title="开辟新道" tone="gold" />
              <div className="new-skill">
                <label>
                  新开一道
                  <input
                    value={newSkillName}
                    onChange={(event) => setNewSkillName(event.target.value)}
                    placeholder="比如 鼓道、剑道、英语口语"
                  />
                </label>
                <label>
                  目标
                  <textarea
                    value={newSkillDescription}
                    onChange={(event) =>
                      setNewSkillDescription(event.target.value)
                    }
                    placeholder="此道要修到什么程度"
                  />
                </label>
                <label>
                  预设路线
                  <select
                    value={newSkillPreset}
                    onChange={(event) => setNewSkillPreset(event.target.value)}
                  >
                    {SELECTABLE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {presetOptionLabel(preset)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" onClick={addSkill}>
                  开辟新道
                </button>
              </div>
            </div>

            <div className="overview-import-panel">
              <PanelHeading title="道法导入" tone="red" />
              <div className="dao-import">
                <label>
                  境界路线
                  <select
                    value={daoImportPreset}
                    onChange={(event) => setDaoImportPreset(event.target.value)}
                  >
                    {SELECTABLE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {presetOptionLabel(preset)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="jump-button" onClick={copyPrompt}>
                  刻录道法引
                </button>
                <button className="primary-button" onClick={selectDaoSchemaFile}>
                  选择道法秘籍
                </button>
              </div>
            </div>
          </div>
          <div
            className="profile-grid"
            aria-label={`第 ${currentSkillPage + 1} 页诸道境界卡片`}
          >
            {visibleProfileStats.map(({ skill, stats }) => (
              <article
                key={skill.id}
                className={`profile-card ${
                  skill.id === activeSkill.id ? "active" : ""
                }`}
              >
                <span
                  className="skill-mark"
                  style={{ background: skill.color }}
                  aria-hidden="true"
                />
                <div>
                  <h3>{skill.name}</h3>
                  <p>{skill.description}</p>
                </div>
                <div className="profile-current">
                  <strong>
                    {stats.currentRealm?.name ?? "未设境界"} · 第
                    {stats.currentLayer?.number ?? 1} 层
                  </strong>
                  <span>{stats.currentLayer?.title ?? "暂无层级"}</span>
                </div>
                <ProgressBar percent={stats.percent} tone={skill.color} />
                <div className="profile-meta">
                  <span>总进度 {stats.percent}%</span>
                  <span>
                    层数 {stats.completedLayers}/{stats.totalLayers}
                  </span>
                </div>
                <ActivityGrid skill={skill} />
                <div className="profile-actions">
                  <button
                    className="jump-button"
                    onClick={() => {
                      setState((current) => ({
                        ...current,
                        activeSkillId: skill.id,
                      }));
                      setView("practice");
                      setSelectedRealmId(stats.currentRealm?.id ?? "");
                      setSelectedLayerId(stats.currentLayer?.id ?? "");
                    }}
                  >
                    入道
                  </button>
                  <button
                    className="danger-button subtle"
                    onClick={() => deleteSkill(skill.id)}
                    disabled={state.skills.length <= 1}
                  >
                    删除此道
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "prompt" ? (
        <section className="prompt-page" aria-label="道册与道法导入">
          <div className="section-heading">
            <div>
              <p className="eyebrow">道册</p>
              <h2>修行道册</h2>
            </div>
            <button className="primary-button" onClick={copyPrompt}>
              刻录道法引
            </button>
          </div>

          <div className="guide-grid">
            <section className="guide-section">
              <h3>此册何用</h3>
              <p>
                它把一条长期能力称作“一道”。每一道都有独立的境界路线、
                每境十层、每层任务进度、每日道历打卡，以及自己的主题颜色。
                你可以同时修多条道，并在修为总览里看所有道目前走到哪里。
              </p>
            </section>

            <section className="guide-section">
              <h3>存档之法</h3>
              <p>
                页面会一直自动保存到浏览器的 localStorage。选择本地文件夹后，
                应用还会把同一份完整存档写成
                <strong>{PROGRESS_FILE_NAME}</strong>，之后每次推进进度都会自动同步。
              </p>
              <p>
                区别是：localStorage 只在当前浏览器和当前站点里可用；本地文件夹保存会生成你能看见、
                备份、迁移的 JSON 文件。
              </p>
            </section>

            <section className="guide-section">
              <h3>入档之法</h3>
              <p>
                “导入存档”可以读取完整 source of truth JSON。完整存档包含所有道、
                境界、层级、任务、当前进度、每日道历、保存文件名、上次本地文件夹名等存档元信息。检测到完整存档时，
                应用会询问是覆盖当前全部道途，还是合并导入。
              </p>
              <p>
                浏览器安全限制下，JSON 不能自动恢复本地文件夹写入权限；存档会记录上次连接的文件夹名称，
                但导入后如果要继续同步到本地文件夹，需要重新点“选择本地文件夹”授权。
              </p>
            </section>

            <section className="guide-section">
              <h3>道法导入怎么用</h3>
              <p>
                先在“道法导入”里选境界路线，再用“刻录”复制本页“道法引”发给 AI。
                AI 会先让你填写“我想学”和“我眼中的顶级状态”。
                你填完后，剩下的境界、十层、每层任务都交给道法引和 AI agent 推演。
              </p>
              <p>
                道法引会要求 AI 生成可下载的 .json 秘籍文件；下载后点“选择道法秘籍”即可导入。
                道法导入不是完整存档导入；它只包含道名、目标、境界、十层和每层任务。
                完整 source of truth 仍然用顶部的“导入存档”恢复。
              </p>
            </section>
          </div>

          <div className={`prompt-vault ${promptVaultOpen ? "open" : ""}`}>
            <div className="prompt-vault-head">
              <button
                type="button"
                className="prompt-toggle-button"
                aria-expanded={promptVaultOpen}
                onClick={() => setPromptVaultOpen((open) => !open)}
              >
                <span>道法引</span>
                <b>
                  {promptVaultOpen ? "收起完整生成提示词" : "展开完整生成提示词"}
                </b>
              </button>
              <button
                type="button"
                className="prompt-copy-button"
                onClick={copyPrompt}
              >
                刻录
              </button>
            </div>
            {promptVaultOpen ? (
              <textarea
                className="prompt-textarea"
                readOnly
                rows={10}
                value={currentDaoSchemaPrompt}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "practice" ? (
        <>
          <section className="dashboard-panels practice-dashboard" aria-label="当前道任务总览">
            <div className="task-summary-panel">
              <PanelHeading title="任务进度" tone="red" />
              <div className="metric-grid">
                <MetricCard
                  tone="green"
                  icon="全"
                  label="全部任务"
                  value={taskOverview.total}
                  caption="总计"
                />
                <MetricCard
                  tone="red"
                  icon="进"
                  label="进行中"
                  value={taskOverview.doing}
                  caption="进行中"
                />
                <MetricCard
                  tone="gold"
                  icon="成"
                  label="已完成"
                  value={taskOverview.done}
                  caption="已完成"
                />
                <MetricCard
                  tone="blue"
                  icon="待"
                  label="待推进"
                  value={taskOverview.waiting}
                  caption="未开始"
                />
              </div>
            </div>
          </section>

          <section className="workspace practice-workspace" aria-label="修炼面板">
          <section className="practice-main">
            <div className="skill-header">
              <div className="skill-title-block">
                <span
                  className="skill-mark large"
                  style={{ background: activeSkill.color }}
                  aria-hidden="true"
                />
                <label>
                  道名
                  <input
                    value={activeSkill.name}
                    onChange={(event) =>
                      updateActiveSkill((skill) => ({
                        ...skill,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="skill-description">
                此道目标
                <textarea
                  value={activeSkill.description}
                  onChange={(event) =>
                    updateActiveSkill((skill) => ({
                      ...skill,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="stats-grid">
              <StatBox
                label="当前境界"
                value={`${activeStats.currentRealm?.name ?? "未设境界"} · 第${
                  activeStats.currentLayer?.number ?? 1
                }层`}
              >
                <span>{activeStats.currentLayer?.title ?? "暂无层级"}</span>
              </StatBox>
              <StatBox label="本层完成" value={`${activeStats.currentLayerPercent}%`}>
                <ProgressBar
                  percent={activeStats.currentLayerPercent}
                  tone={activeSkill.color}
                />
              </StatBox>
              <StatBox label="总修为" value={`${activeStats.percent}%`}>
                <ProgressBar percent={activeStats.percent} tone={activeSkill.color} />
              </StatBox>
              <StatBox
                label="已破层"
                value={`${activeStats.completedLayers}/${activeStats.totalLayers}`}
              />
            </div>

            <div className="realm-section">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">{activeSkill.presetName}</p>
                  <h2>境界路线</h2>
                </div>
                <div className="realm-tools">
                  <label className="preset-switcher">
                    套用预设
                    <select
                      value={activePresetId}
                      onChange={(event) =>
                        applyPresetToActiveSkill(event.target.value)
                      }
                    >
                      <option value={CUSTOM_PRESET_ID} disabled>
                        自定义路线
                      </option>
                      {SELECTABLE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {presetOptionLabel(preset)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline-form">
                    <input
                      value={newRealmName}
                      onChange={(event) => setNewRealmName(event.target.value)}
                      placeholder="新增境界名"
                    />
                    <button onClick={addRealm}>添加</button>
                  </div>
                </div>
              </div>
              <div className="realm-list">
                {activeSkill.realms.map((realm) => {
                  const realmLayers = realm.layers.map(layerStats);
                  const realmPercent = Math.round(
                    realmLayers.reduce((sum, item) => sum + item.percent, 0) /
                      Math.max(1, realmLayers.length),
                  );
                  const unlocked = canAdvanceRealm(activeSkill, realm.id);
                  return (
                    <button
                      key={realm.id}
                      className={`realm-pill ${
                        selectedRealm?.id === realm.id ? "active" : ""
                      } ${unlocked ? "" : "locked"}`}
                      title={unlocked ? realm.name : `未解锁：先完成 ${gateLabel}`}
                      onClick={() => {
                        setSelectedRealmId(realm.id);
                        setSelectedLayerId(realm.layers[0]?.id ?? "");
                      }}
                    >
                      <span>{realm.name}</span>
                      <b>{realmPercent}%</b>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedRealm && selectedLayer ? (
              <div className="editor-grid">
                <section className="route-editor" aria-label="层级选择">
                  <div className="editor-heading">
                    <div>
                      <p className="eyebrow">境界</p>
                      <input
                        className="realm-name-input"
                        value={selectedRealm.name}
                        onChange={(event) =>
                          updateRealm(selectedRealm.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    </div>
                    <button
                      className="danger-button subtle"
                      onClick={() => deleteRealm(selectedRealm.id)}
                      disabled={activeSkill.realms.length <= 1}
                    >
                      删除境界
                    </button>
                  </div>
                  <textarea
                    className="realm-summary"
                    placeholder="写下此境界的目标、要求或修行纲领"
                    value={selectedRealm.summary}
                    onChange={(event) =>
                      updateRealm(selectedRealm.id, {
                        summary: event.target.value,
                      })
                    }
                  />
                  <div className="layer-grid">
                    {selectedRealm.layers.map((layer) => {
                      const stats = layerStats(layer);
                      const unlocked = canAdvanceLayer(
                        activeSkill,
                        selectedRealm.id,
                        layer.id,
                      );
                      return (
                        <button
                          key={layer.id}
                          className={`layer-button ${
                            selectedLayer.id === layer.id ? "active" : ""
                          } ${stats.complete ? "complete" : ""} ${
                            unlocked ? "" : "locked"
                          }`}
                          title={
                            unlocked ? `第${layer.number}层` : `未解锁：先完成 ${gateLabel}`
                          }
                          onClick={() => setSelectedLayerId(layer.id)}
                        >
                          <span>第{layer.number}层</span>
                          <b>{stats.percent}%</b>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="jump-button"
                    onClick={() => {
                      setSelectedRealmId(activeStats.currentRealm?.id ?? "");
                      setSelectedLayerId(activeStats.currentLayer?.id ?? "");
                    }}
                  >
                    跳到当前层
                  </button>
                </section>

                <section className="layer-editor" aria-label="任务进度">
                  <div className="editor-heading">
                    <div>
                      <p className="eyebrow">
                        {selectedRealm.name} · 第{selectedLayer.number}层
                      </p>
                      <textarea
                        className="layer-title-input"
                        rows={2}
                        value={selectedLayer.title}
                        onChange={(event) =>
                          updateLayer(selectedRealm.id, selectedLayer.id, {
                            title: event.target.value,
                          })
                        }
                      />
                    </div>
                    <strong>{selectedLayerStats?.percent ?? 0}%</strong>
                  </div>
                  <ProgressBar
                    percent={selectedLayerStats?.percent ?? 0}
                    tone={activeSkill.color}
                  />
                  <textarea
                    className="layer-description"
                    value={selectedLayer.description}
                    onChange={(event) =>
                      updateLayer(selectedRealm.id, selectedLayer.id, {
                        description: event.target.value,
                      })
                    }
                  />
                  {!selectedLayerUnlocked ? (
                    <div className="sequence-lock" role="status">
                      先完成 {gateLabel}，再推进此层任务。
                    </div>
                  ) : null}
                  <div className="task-list">
                    {selectedLayer.tasks.map((task) => {
                      const taskPercent = Math.round(
                        (clampProgress(task.progress, task.target) /
                          Math.max(1, task.target)) *
                          100,
                      );
                      return (
                        <div className="task-row" key={task.id}>
                          <div className="task-fields">
                            <input
                              value={task.title}
                              onChange={(event) =>
                                updateTask(
                                  selectedRealm.id,
                                  selectedLayer.id,
                                  task.id,
                                  { title: event.target.value },
                                )
                              }
                            />
                            <div className="task-targets">
                              <label>
                                目标
                                <input
                                  type="number"
                                  min={1}
                                  value={task.target}
                                  onChange={(event) =>
                                    updateTask(
                                      selectedRealm.id,
                                      selectedLayer.id,
                                      task.id,
                                      {
                                        target: readNumber(event.target.value, 1),
                                      },
                                    )
                                  }
                                />
                              </label>
                              <label>
                                进度
                                <input
                                  type="number"
                                  min={0}
                                  max={task.target}
                                  value={task.progress}
                                  disabled={!selectedLayerUnlocked}
                                  onChange={(event) =>
                                    updateTask(
                                      selectedRealm.id,
                                      selectedLayer.id,
                                      task.id,
                                      {
                                        progress: readNumber(
                                          event.target.value,
                                          0,
                                        ),
                                      },
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </div>
                          <div className="task-progress">
                            <ProgressBar percent={taskPercent} tone={activeSkill.color} />
                            <span>
                              {clampProgress(task.progress, task.target)}/{task.target}
                            </span>
                          </div>
                          <div className="task-actions">
                            <button
                              aria-label={`减少 ${task.title}`}
                              disabled={!selectedLayerUnlocked}
                              onClick={() =>
                                updateTask(
                                  selectedRealm.id,
                                  selectedLayer.id,
                                  task.id,
                                  { progress: task.progress - 1 },
                                )
                              }
                            >
                              -
                            </button>
                            <button
                              className="primary-button square"
                              aria-label={`推进 ${task.title}`}
                              disabled={!selectedLayerUnlocked}
                              onClick={() =>
                                updateTask(
                                  selectedRealm.id,
                                  selectedLayer.id,
                                  task.id,
                                  { progress: task.progress + 1 },
                                )
                              }
                            >
                              +
                            </button>
                            <button
                              className="danger-button square"
                              aria-label={`删除 ${task.title}`}
                              onClick={() =>
                                deleteTask(
                                  selectedRealm.id,
                                  selectedLayer.id,
                                  task.id,
                                )
                              }
                              disabled={selectedLayer.tasks.length <= 1}
                            >
                              x
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="add-task-button"
                    onClick={() => addTask(selectedRealm.id, selectedLayer.id)}
                  >
                    添加任务
                  </button>
                </section>
              </div>
            ) : null}
          </section>
          </section>
        </>
      ) : null}
    </main>
  );
}
