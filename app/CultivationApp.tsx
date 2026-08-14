"use client";

import {
  type ChangeEvent,
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

type Skill = {
  id: string;
  name: string;
  description: string;
  color: string;
  presetName: string;
  realms: Realm[];
  createdAt: string;
  updatedAt: string;
};

type AppState = {
  version: 1;
  updatedAt: string;
  activeSkillId: string;
  skills: Skill[];
};

type Preset = {
  id: string;
  name: string;
  realms: string[];
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

const PRESETS: Preset[] = [
  {
    id: "fanren",
    name: "凡人修仙传路线",
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
    ],
  },
  {
    id: "shenxian",
    name: "神位仙阶路线",
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

const AI_IMPORT_PROMPT = `你是一个“修仙式技能成长系统”的配置助手。请根据我给你的技能目标，返回一份可以直接导入网页应用的 JSON。

硬性要求：
1. 只返回合法 JSON，不要 Markdown，不要解释。
2. 每个 skill 代表一个独立技能。
3. 每个 realm 是一个境界，用户可以用预设境界，也可以自定义、删减境界。
4. 每个 realm 必须正好有 10 个 layers。
5. 每个 layer 都要有 title、description、tasks。
6. 每个 task 都要有 title、target、progress；target 是需要完成的次数，progress 通常从 0 开始。
7. task 的 target 应该具体、可执行，不要写空泛目标。

JSON 结构：
{
  "version": 1,
  "skills": [
    {
      "name": "架子鼓",
      "description": "用修炼境界管理架子鼓练习",
      "presetName": "绝世战神武道路线",
      "realms": [
        {
          "name": "淬体境",
          "summary": "基本功和稳定节拍",
          "layers": [
            {
              "number": 1,
              "title": "稳住四分音符",
              "description": "能在慢速下稳定跟拍，不抢拍不拖拍。",
              "tasks": [
                { "title": "60 BPM 四分音符跟节拍器练习", "target": 8, "progress": 0 },
                { "title": "记录练习复盘", "target": 3, "progress": 0 }
              ]
            }
          ]
        }
      ]
    }
  ]
}

请现在为这个技能生成完整 JSON：
技能名称：
技能目标：
偏好的境界路线：
希望每层任务数量：
每个任务的大致完成次数：`;

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
    layers: Array.from({ length: 10 }, (_, layerIndex) =>
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
    layers: Array.from({ length: 10 }, (_, layerIndex) =>
      normalizeLayer(rawLayers[layerIndex], layerIndex, name),
    ),
  };
}

function normalizeSkill(value: unknown, index: number): Skill {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const preset =
    PRESETS.find((item) => item.name === raw.presetName || item.id === raw.presetId) ??
    PRESETS[0];
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
    name: readString(raw.name, `技能 ${index + 1}`),
    description: readString(raw.description, "自定义这个技能的修炼目标。"),
    color: readString(raw.color, COLORS[index % COLORS.length]),
    presetName: readString(raw.presetName, preset.name),
    realms,
    createdAt: readString(raw.createdAt, now),
    updatedAt: readString(raw.updatedAt, now),
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

export function CultivationApp() {
  const [state, setState] = useState<AppState>(() => createDefaultState());
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"practice" | "profile" | "prompt">("practice");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDescription, setNewSkillDescription] = useState("");
  const [newSkillPreset, setNewSkillPreset] = useState(PRESETS[0].id);
  const [selectedRealmId, setSelectedRealmId] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [newRealmName, setNewRealmName] = useState("");
  const [status, setStatus] = useState("本机自动保存已开启");
  const [fileApiSupported, setFileApiSupported] = useState(false);
  const [directoryHandle, setDirectoryHandle] =
    useState<FileSystemDirectoryHandleLike | null>(null);
  const [folderName, setFolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const selectedLayerStats = selectedLayer ? layerStats(selectedLayer) : undefined;

  const profileStats = useMemo(
    () => state.skills.map((skill) => ({ skill, stats: skillStats(skill) })),
    [state.skills],
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
        { ...state, updatedAt: new Date().toISOString() },
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
    const preset = PRESETS.find((item) => item.id === newSkillPreset) ?? PRESETS[0];
    const skill = makeSkillFromPreset(
      newSkillName.trim() || `技能 ${state.skills.length + 1}`,
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

  function deleteActiveSkill() {
    if (!activeSkill || state.skills.length <= 1) {
      return;
    }
    const confirmed = window.confirm(`删除技能“${activeSkill.name}”？`);
    if (!confirmed) {
      return;
    }
    updateState((current) => {
      const skills = current.skills.filter((skill) => skill.id !== activeSkill.id);
      return {
        ...current,
        skills,
        activeSkillId: skills[0]?.id ?? "",
      };
    });
  }

  function updateRealm(realmId: string, patch: Partial<Realm>) {
    updateActiveSkill((skill) => ({
      ...skill,
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
                      tasks: layer.tasks.map((task) => {
                        if (task.id !== taskId) {
                          return task;
                        }
                        const nextTarget = Math.max(
                          1,
                          Math.floor(patch.target ?? task.target),
                        );
                        return {
                          ...task,
                          ...patch,
                          target: nextTarget,
                          progress: clampProgress(
                            patch.progress ?? task.progress,
                            nextTarget,
                          ),
                        };
                      }),
                    }
                  : layer,
              ),
            }
          : realm,
      ),
    }));
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
      await saveStoredDirectoryHandle(handle);
      await writeStateToDirectory(state, handle);
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
      await writeStateToDirectory(
        { ...state, updatedAt: new Date().toISOString() },
        directoryHandle,
      );
      setStatus(`已保存到 ${folderName || "本地文件夹"}`);
    } catch {
      setStatus("保存失败，请重新选择本地文件夹");
    }
  }

  async function exportJson() {
    const exportState = { ...state, updatedAt: new Date().toISOString() };
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
        setStatus("JSON 已导出");
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
      }
    }
    downloadJson(exportState);
    setStatus("JSON 已下载");
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
        window.confirm("检测到完整存档。确定覆盖当前全部技能？取消则合并导入。");
      updateState((current) => (overwrite ? imported : mergeImportedState(current, imported)));
      setStatus(overwrite ? "存档已覆盖导入" : "JSON 已合并导入");
      setView("profile");
    } catch (error) {
      setStatus((error as Error).message || "JSON 导入失败");
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
    await navigator.clipboard.writeText(AI_IMPORT_PROMPT);
    setStatus("AI JSON 提示词已复制");
  }

  if (!activeSkill || !activeStats) {
    return null;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cultivation Growth</p>
          <h1>修炼档案</h1>
        </div>
        <nav className="view-tabs" aria-label="页面">
          <button
            className={view === "practice" ? "active" : ""}
            onClick={() => setView("practice")}
          >
            修炼
          </button>
          <button
            className={view === "profile" ? "active" : ""}
            onClick={() => setView("profile")}
          >
            Profile
          </button>
          <button
            className={view === "prompt" ? "active" : ""}
            onClick={() => setView("prompt")}
          >
            AI JSON
          </button>
        </nav>
      </header>

      <section className="command-strip" aria-label="保存与导入">
        <span>{status}</span>
        <div className="command-actions">
          <button onClick={importJson}>导入 JSON</button>
          <button onClick={exportJson}>导出 JSON</button>
          <button onClick={saveToFolderNow}>
            {folderName ? "保存进度" : "选择本地文件夹"}
          </button>
        </div>
        {!fileApiSupported && (
          <small>文件夹写入不可用时，仍会使用 localStorage 和 JSON 导入导出。</small>
        )}
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json,.json"
          onChange={handleFileInput}
        />
      </section>

      {view === "profile" ? (
        <section className="profile-page" aria-label="技能档案">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>所有技能境界</h2>
            </div>
            <strong>{state.skills.length} 个技能</strong>
          </div>
          <div className="profile-grid">
            {profileStats.map(({ skill, stats }) => (
              <button
                key={skill.id}
                className="profile-card"
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
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "prompt" ? (
        <section className="prompt-page" aria-label="AI JSON 提示词">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Import Prompt</p>
              <h2>给 AI 的 JSON 生成提示词</h2>
            </div>
            <button className="primary-button" onClick={copyPrompt}>
              复制提示词
            </button>
          </div>
          <textarea readOnly value={AI_IMPORT_PROMPT} />
        </section>
      ) : null}

      {view === "practice" ? (
        <section className="workspace" aria-label="修炼面板">
          <aside className="sidebar">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Skills</p>
                <h2>技能</h2>
              </div>
            </div>
            <div className="skill-list">
              {profileStats.map(({ skill, stats }) => (
                <button
                  key={skill.id}
                  className={`skill-row ${
                    skill.id === activeSkill.id ? "active" : ""
                  }`}
                  onClick={() => {
                    setState((current) => ({
                      ...current,
                      activeSkillId: skill.id,
                    }));
                    setSelectedRealmId(stats.currentRealm?.id ?? "");
                    setSelectedLayerId(stats.currentLayer?.id ?? "");
                  }}
                >
                  <span
                    className="skill-mark"
                    style={{ background: skill.color }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{skill.name}</strong>
                    <small>
                      {stats.currentRealm?.name ?? "未设境界"} · 第
                      {stats.currentLayer?.number ?? 1} 层
                    </small>
                  </span>
                  <b>{stats.percent}%</b>
                </button>
              ))}
            </div>

            <div className="new-skill">
              <label>
                新技能
                <input
                  value={newSkillName}
                  onChange={(event) => setNewSkillName(event.target.value)}
                  placeholder="比如 英语口语"
                />
              </label>
              <label>
                目标
                <textarea
                  value={newSkillDescription}
                  onChange={(event) =>
                    setNewSkillDescription(event.target.value)
                  }
                  placeholder="这个技能要修到什么程度"
                />
              </label>
              <label>
                预设路线
                <select
                  value={newSkillPreset}
                  onChange={(event) => setNewSkillPreset(event.target.value)}
                >
                  {PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" onClick={addSkill}>
                新建技能
              </button>
            </div>
          </aside>

          <section className="practice-main">
            <div className="skill-header">
              <div className="skill-title-block">
                <span
                  className="skill-mark large"
                  style={{ background: activeSkill.color }}
                  aria-hidden="true"
                />
                <label>
                  技能名称
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
                技能目标
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
              <button
                className="danger-button"
                onClick={deleteActiveSkill}
                disabled={state.skills.length <= 1}
              >
                删除技能
              </button>
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
                <div className="inline-form">
                  <input
                    value={newRealmName}
                    onChange={(event) => setNewRealmName(event.target.value)}
                    placeholder="新增境界名"
                  />
                  <button onClick={addRealm}>添加</button>
                </div>
              </div>
              <div className="realm-list">
                {activeSkill.realms.map((realm) => {
                  const realmLayers = realm.layers.map(layerStats);
                  const realmPercent = Math.round(
                    realmLayers.reduce((sum, item) => sum + item.percent, 0) /
                      Math.max(1, realmLayers.length),
                  );
                  return (
                    <button
                      key={realm.id}
                      className={`realm-pill ${
                        selectedRealm?.id === realm.id ? "active" : ""
                      }`}
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
                      <p className="eyebrow">Realm</p>
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
                      return (
                        <button
                          key={layer.id}
                          className={`layer-button ${
                            selectedLayer.id === layer.id ? "active" : ""
                          } ${stats.complete ? "complete" : ""}`}
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
                      <input
                        className="layer-title-input"
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
      ) : null}
    </main>
  );
}
