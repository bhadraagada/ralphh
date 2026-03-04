import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  File,
  FileText,
  Circle,
  CircleDot,
  CirclePlay,
  Folder,
  GitBranch,
  Lock,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Moon,
  Pause,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  SunMedium,
  Timer,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  AutomationRecord,
  BroadcastEnvelope,
  EventRecord,
  ListWorkspaceFilesResponse,
  PrdDocumentRecord,
  PrdFormat,
  RalphBootstrapResult,
  RalphBootstrapStatus,
  ReadWorkspaceFileResponse,
  ReviewCommentRecord,
  RunRecord,
  RunStatus,
  ThreadRecord,
  WorkspaceFileEntryRecord,
  WorkspaceFileIndexResponse,
  WorkspaceFileWriteConflict,
} from "@ralphh/shared";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { json as jsonLanguage } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

interface ThreadBundle {
  thread: ThreadRecord;
  runs: RunRecord[];
}

interface DiffLine {
  key: string;
  text: string;
  type: "meta" | "add" | "remove" | "context";
  filePath?: string;
  lineNumber?: number;
}

interface FileEditorTab {
  path: string;
  content: string;
  savedContent: string;
  mtimeMs?: number;
}

type ThemeMode = "light" | "dark";

const API_BASE = "http://127.0.0.1:4242";

const DEFAULT_PRD_JSON = `{
  "name": "My Project",
  "description": "Describe the project goals and scope.",
  "validate": [
    "bun test"
  ],
  "maxIterations": 50,
  "tasks": [
    {
      "id": "task-1",
      "name": "First Task",
      "description": "Describe the first deliverable.",
      "acceptanceCriteria": [
        "All tests pass"
      ]
    }
  ]
}`;

const DEFAULT_PRD_MARKDOWN = `# My Project

Describe the project goals and scope.

## task-1: First Task

Describe the first deliverable.

### Acceptance Criteria
- All tests pass

### Validate
- \`bun test\`
`;

function defaultPrdTemplate(format: PrdFormat): string {
  return format === "json" ? DEFAULT_PRD_JSON : DEFAULT_PRD_MARKDOWN;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    return ".";
  }

  const segments = normalized.split("/").filter(Boolean);
  segments.pop();
  return segments.length === 0 ? "." : segments.join("/");
}

function languageExtensionsForPath(path: string): Extension[] {
  const normalized = path.toLowerCase();

  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return [markdown()];
  }

  if (normalized.endsWith(".json")) {
    return [jsonLanguage()];
  }

  if (normalized.endsWith(".tsx")) {
    return [javascript({ typescript: true, jsx: true })];
  }

  if (normalized.endsWith(".ts")) {
    return [javascript({ typescript: true })];
  }

  if (normalized.endsWith(".jsx")) {
    return [javascript({ jsx: true })];
  }

  if (normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) {
    return [javascript()];
  }

  return [];
}

const editorSurfaceTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "oklch(var(--card))",
    color: "oklch(var(--foreground))",
  },
  ".cm-scroller": {
    backgroundColor: "oklch(var(--card))",
    fontFamily: '"SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  ".cm-content": {
    caretColor: "oklch(var(--foreground))",
  },
  ".cm-gutters": {
    backgroundColor: "oklch(var(--card))",
    color: "oklch(var(--muted-foreground))",
    borderRight: "1px solid oklch(var(--border))",
  },
  ".cm-activeLine": {
    backgroundColor: "oklch(var(--muted) / 0.42)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "oklch(var(--muted) / 0.42)",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

function formatTime(ts?: number): string {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(ts?: number): string {
  if (!ts) {
    return "now";
  }

  const diff = Date.now() - ts;
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) {
    return `${mins}m`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function badgeVariantForStatus(status?: RunStatus):
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info" {
  if (!status) {
    return "default";
  }

  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "queued":
    case "paused":
      return "warning";
    case "failed":
    case "cancelled":
      return "danger";
    default:
      return "default";
  }
}

function eventLabel(event: EventRecord): string {
  const map: Record<string, string> = {
    "thread.created": "Created thread",
    "thread.worktree.created": "Created worktree",
    "review.comment.created": "Review comment added",
    "review.rerun.queued": "Feedback rerun queued",
    "automation.created": "Automation created",
    "automation.triggered": "Automation triggered",
    "run.queued": "Queued run",
    "run.started": "Started run",
    "run.paused": "Paused run",
    "run.resumed": "Resumed run",
    "run.cancelled": "Cancelled run",
    "run.completed": "Completed run",
    "run.failed": "Run failed",
    "loop.iteration.started": "Iteration started",
    "loop.agent.spawned": "Agent spawned",
    "loop.agent.exited": "Agent exited",
    "loop.validation.completed": "Validation completed",
    "loop.regression.reverted": "Regression reverted",
    "loop.checkpoint.committed": "Checkpoint committed",
  };

  return map[event.type] ?? event.type;
}

function parseUnifiedDiff(diff: string): DiffLine[] {
  if (!diff.trim()) {
    return [];
  }

  const lines = diff.split(/\r?\n/);
  const parsed: DiffLine[] = [];
  let currentFile: string | undefined;
  let newLine = 0;
  let oldLine = 0;

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    const key = `${index}-${text}`;

    if (text.startsWith("+++ b/")) {
      currentFile = text.slice(6);
      parsed.push({ key, text, type: "meta" });
      continue;
    }

    if (text.startsWith("@@")) {
      const match = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = Number(match[1]);
        newLine = Number(match[2]);
      }
      parsed.push({ key, text, type: "meta" });
      continue;
    }

    if (text.startsWith("+") && !text.startsWith("+++")) {
      parsed.push({
        key,
        text,
        type: "add",
        filePath: currentFile,
        lineNumber: newLine,
      });
      newLine += 1;
      continue;
    }

    if (text.startsWith("-") && !text.startsWith("---")) {
      parsed.push({
        key,
        text,
        type: "remove",
        filePath: currentFile,
        lineNumber: oldLine,
      });
      oldLine += 1;
      continue;
    }

    if (text.startsWith(" ")) {
      parsed.push({
        key,
        text,
        type: "context",
        filePath: currentFile,
        lineNumber: newLine,
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    parsed.push({ key, text, type: "meta" });
  }

  return parsed;
}

const EDITOR_SESSION_STORAGE_KEY = "ralph-editor-sessions-v1";
const LAYOUT_PREFS_STORAGE_KEY = "ralph-layout-prefs-v1";
const DEFAULT_LEFT_SIDEBAR_WIDTH = 316;
const DEFAULT_RIGHT_PANEL_WIDTH = 320;
const DEFAULT_EXPLORER_WIDTH = 280;

interface EditorSessionEntry {
  tabs: string[];
  activePath?: string;
  currentPath?: string;
  centerPaneMode?: "activity" | "editor";
}

interface LayoutPrefs {
  showLeftSidebar: boolean;
  showRightPanel: boolean;
  showExplorer: boolean;
  leftSidebarWidth: number;
  rightPanelWidth: number;
  explorerWidth: number;
}

interface ResizeState {
  target: "left" | "right" | "explorer";
  startX: number;
  startWidth: number;
}

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function readEditorSessions(): Record<string, EditorSessionEntry> {
  try {
    const raw = localStorage.getItem(EDITOR_SESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, EditorSessionEntry>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readLayoutPrefs(): LayoutPrefs | undefined {
  try {
    const raw = localStorage.getItem(LAYOUT_PREFS_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return {
      showLeftSidebar: Boolean(parsed.showLeftSidebar ?? true),
      showRightPanel: Boolean(parsed.showRightPanel ?? true),
      showExplorer: Boolean(parsed.showExplorer ?? true),
      leftSidebarWidth: clampNumber(
        Number(parsed.leftSidebarWidth ?? DEFAULT_LEFT_SIDEBAR_WIDTH),
        240,
        520
      ),
      rightPanelWidth: clampNumber(
        Number(parsed.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH),
        260,
        520
      ),
      explorerWidth: clampNumber(Number(parsed.explorerWidth ?? DEFAULT_EXPLORER_WIDTH), 220, 560),
    };
  } catch {
    return undefined;
  }
}

function writeLayoutPrefs(prefs: LayoutPrefs): void {
  try {
    localStorage.setItem(LAYOUT_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}

function writeEditorSessions(sessions: Record<string, EditorSessionEntry>): void {
  try {
    localStorage.setItem(EDITOR_SESSION_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    return;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isWorkspaceConflict(value: unknown): value is {
  conflict: WorkspaceFileWriteConflict;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybe = value as { conflict?: WorkspaceFileWriteConflict };
  return Boolean(maybe.conflict && typeof maybe.conflict.path === "string");
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed: ${response.status}`;
    throw new ApiError(message, response.status, body);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed: ${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [threads, setThreads] = useState<ThreadBundle[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [theme, setTheme] = useState<ThemeMode>("dark");

  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [newThreadName, setNewThreadName] = useState("");
  const [newThreadTask, setNewThreadTask] = useState("");
  const [newThreadRepo, setNewThreadRepo] = useState("");
  const [automations, setAutomations] = useState<AutomationRecord[]>([]);
  const [newAutomationName, setNewAutomationName] = useState("");
  const [newAutomationCron, setNewAutomationCron] = useState("0 9 * * *");

  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [centerPaneMode, setCenterPaneMode] = useState<"activity" | "editor">("activity");
  const [composerText, setComposerText] = useState("");
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"controls" | "review" | "plan">("controls");
  const [diffText, setDiffText] = useState("");
  const [comments, setComments] = useState<ReviewCommentRecord[]>([]);
  const [selectedDiffLine, setSelectedDiffLine] = useState<{ filePath: string; lineNumber: number }>();
  const [commentBody, setCommentBody] = useState("");
  const [selectedCommentIds, setSelectedCommentIds] = useState<number[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [prd, setPrd] = useState<PrdDocumentRecord>({
    exists: false,
    format: null,
    path: null,
    content: "",
  });
  const [prdLoading, setPrdLoading] = useState(false);
  const [prdSaving, setPrdSaving] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<RalphBootstrapStatus | undefined>();
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapInitializing, setBootstrapInitializing] = useState(false);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | undefined>();
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [workspaceCurrentPath, setWorkspaceCurrentPath] = useState(".");
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceFileEntryRecord[]>([]);
  const [workspaceFileIndex, setWorkspaceFileIndex] = useState<string[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | undefined>();
  const [fileTabs, setFileTabs] = useState<FileEditorTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>();
  const [editorLoadingPath, setEditorLoadingPath] = useState<string | undefined>();
  const [editorSavingPath, setEditorSavingPath] = useState<string | undefined>();
  const [lineJumpTarget, setLineJumpTarget] = useState<{ path: string; lineNumber: number }>();
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenActiveIndex, setQuickOpenActiveIndex] = useState(0);
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);
  const [quickOpenError, setQuickOpenError] = useState<string | undefined>();
  const editorViewRef = useRef<EditorView | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);

  const workspaces = useMemo(
    () => Array.from(new Set(threads.map((bundle) => bundle.thread.repoPath))),
    [threads]
  );

  const visibleThreads = useMemo(() => {
    if (selectedWorkspace === "all") {
      return threads;
    }
    return threads.filter((bundle) => bundle.thread.repoPath === selectedWorkspace);
  }, [threads, selectedWorkspace]);

  const selected = useMemo(
    () => threads.find((bundle) => bundle.thread.id === selectedThreadId),
    [threads, selectedThreadId]
  );

  const latestRun = selected?.runs[0];

  const activeWorkflows = useMemo(
    () =>
      visibleThreads.filter(({ runs }) => {
        const status = runs[0]?.status;
        return status === "queued" || status === "running" || status === "paused";
      }),
    [visibleThreads]
  );

  const windowControls = window.ralphDesktop?.windowControls;
  const hasNativeWindowControls = Boolean(windowControls);
  const diffLines = useMemo(() => parseUnifiedDiff(diffText), [diffText]);
  const activeEditorTab = useMemo(
    () => fileTabs.find((tab) => tab.path === activeFilePath),
    [fileTabs, activeFilePath]
  );
  const dirtyTabCount = useMemo(
    () => fileTabs.filter((tab) => tab.content !== tab.savedContent).length,
    [fileTabs]
  );
  const hasUnsavedFiles = dirtyTabCount > 0;
  const workspacePathSegments = useMemo(
    () => workspaceCurrentPath.split("/").filter(Boolean),
    [workspaceCurrentPath]
  );
  const quickOpenCandidates = useMemo(() => {
    const query = quickOpenQuery.trim().toLowerCase();
    const files = workspaceFileIndex;
    if (!query) {
      return files.slice(0, 40);
    }

    return files
      .filter((path) => path.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) {
          return aStarts - bStarts;
        }
        return a.length - b.length;
      })
      .slice(0, 60);
  }, [workspaceFileIndex, quickOpenQuery]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("ralph-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }

    const prefs = readLayoutPrefs();
    if (prefs) {
      setShowLeftSidebar(prefs.showLeftSidebar);
      setShowRightPanel(prefs.showRightPanel);
      setShowExplorer(prefs.showExplorer);
      setLeftSidebarWidth(prefs.leftSidebarWidth);
      setRightPanelWidth(prefs.rightPanelWidth);
      setExplorerWidth(prefs.explorerWidth);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("ralph-theme", theme);
  }, [theme]);

  useEffect(() => {
    writeLayoutPrefs({
      showLeftSidebar,
      showRightPanel,
      showExplorer,
      leftSidebarWidth,
      rightPanelWidth,
      explorerWidth,
    });
  }, [
    showLeftSidebar,
    showRightPanel,
    showExplorer,
    leftSidebarWidth,
    rightPanelWidth,
    explorerWidth,
  ]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) {
        return;
      }

      const delta = event.clientX - state.startX;
      if (state.target === "left") {
        setLeftSidebarWidth(clampNumber(state.startWidth + delta, 240, 520));
        return;
      }

      if (state.target === "right") {
        setRightPanelWidth(clampNumber(state.startWidth - delta, 260, 520));
        return;
      }

      setExplorerWidth(clampNumber(state.startWidth + delta, 220, 560));
    };

    const handleMouseUp = () => {
      if (!resizeStateRef.current) {
        return;
      }

      resizeStateRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!windowControls) {
      return;
    }

    void windowControls
      .isMaximized()
      .then((value) => setIsWindowMaximized(Boolean(value)))
      .catch(() => undefined);

    const unsubscribe = windowControls.onMaximizedChange((value) => {
      setIsWindowMaximized(value);
    });

    return unsubscribe;
  }, [windowControls]);

  async function loadThreads(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const data = await getJson<{ threads: ThreadBundle[] }>("/threads");
      setThreads(data.threads);

      if (!selectedThreadId && data.threads.length > 0) {
        setSelectedThreadId(data.threads[0].thread.id);
      }

      if (selectedWorkspace === "all" && data.threads.length > 0) {
        setSelectedWorkspace("all");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(threadId: string): Promise<void> {
    try {
      const data = await getJson<{ events: EventRecord[] }>(
        `/threads/${threadId}/events?limit=250`
      );
      setEvents(data.events.sort((a, b) => a.createdAt - b.createdAt));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }

  async function loadDiff(threadId: string): Promise<void> {
    try {
      const data = await getJson<{ diff: string }>(`/threads/${threadId}/diff`);
      setDiffText(data.diff);
    } catch {
      setDiffText("");
    }
  }

  async function loadComments(threadId: string): Promise<void> {
    try {
      const data = await getJson<{ comments: ReviewCommentRecord[] }>(
        `/threads/${threadId}/comments`
      );
      setComments(data.comments);
    } catch {
      setComments([]);
    }
  }

  async function loadAutomations(): Promise<void> {
    try {
      const data = await getJson<{ automations: AutomationRecord[] }>("/automations");
      setAutomations(data.automations);
    } catch {
      setAutomations([]);
    }
  }

  async function loadPrd(threadId: string): Promise<PrdDocumentRecord | undefined> {
    setPrdLoading(true);
    try {
      const data = await getJson<{ prd: PrdDocumentRecord }>(`/threads/${threadId}/prd`);
      setPrd(data.prd);
      return data.prd;
    } catch (loadError) {
      setPrd({
        exists: false,
        format: null,
        path: null,
        content: "",
      });
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      return undefined;
    } finally {
      setPrdLoading(false);
    }
  }

  async function loadBootstrapStatus(threadId: string): Promise<void> {
    setBootstrapLoading(true);
    try {
      const data = await getJson<{ status: RalphBootstrapStatus }>(`/threads/${threadId}/bootstrap`);
      setBootstrapStatus(data.status);
    } catch (loadError) {
      setBootstrapStatus(undefined);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBootstrapLoading(false);
    }
  }

  async function handleInitializeRalphWorkspace(): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    setBootstrapInitializing(true);
    try {
      const data = await postJson<RalphBootstrapResult>(`/threads/${selectedThreadId}/bootstrap/init`, {});
      setBootstrapStatus(data.status);
      if (data.created.length > 0) {
        setBootstrapMessage(`Initialized: ${data.created.join(", ")}`);
      } else {
        setBootstrapMessage("Already initialized. No new files were created.");
      }

      await Promise.all([
        loadPrd(selectedThreadId),
        loadWorkspaceDirectory(selectedThreadId, "."),
        loadWorkspaceFileIndex(selectedThreadId),
        loadThreads(),
      ]);
      setError(undefined);
    } catch (initError) {
      const message = initError instanceof Error ? initError.message : String(initError);
      setError(message);
      setBootstrapMessage(undefined);
    } finally {
      setBootstrapInitializing(false);
    }
  }

  async function loadWorkspaceDirectory(threadId: string, path = "."): Promise<void> {
    setWorkspaceLoading(true);
    setWorkspaceError(undefined);
    try {
      const suffix = path === "." ? "" : `?path=${encodeURIComponent(path)}`;
      const data = await getJson<ListWorkspaceFilesResponse>(`/threads/${threadId}/files${suffix}`);
      setWorkspaceRoot(data.root);
      setWorkspaceCurrentPath(data.currentPath);
      setWorkspaceEntries(data.entries);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setWorkspaceError(message);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function loadWorkspaceFileIndex(threadId: string): Promise<string[]> {
    try {
      const data = await getJson<WorkspaceFileIndexResponse>(`/threads/${threadId}/files/index`);
      setWorkspaceFileIndex(data.files);
      setQuickOpenError(undefined);
      return data.files;
    } catch (loadError) {
      const fallback = Array.from(
        new Set([
          ...workspaceEntries.filter((entry) => entry.type === "file").map((entry) => entry.path),
          ...fileTabs.map((tab) => tab.path),
        ])
      ).sort((a, b) => a.localeCompare(b));

      setWorkspaceFileIndex(fallback);
      const message =
        loadError instanceof Error
          ? `${loadError.message}. Restart backend to enable full quick search.`
          : "Quick search index unavailable. Restart backend to enable it.";
      setQuickOpenError(message);
      return fallback;
    }
  }

  async function openQuickOpen(): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    setCenterPaneMode("editor");
    setQuickOpenQuery("");
    setQuickOpenActiveIndex(0);
    setQuickOpenOpen(true);

    if (workspaceFileIndex.length > 0) {
      return;
    }

    setQuickOpenLoading(true);
    try {
      await loadWorkspaceFileIndex(selectedThreadId);
    } finally {
      setQuickOpenLoading(false);
    }
  }

  function closeQuickOpen(): void {
    setQuickOpenOpen(false);
    setQuickOpenQuery("");
    setQuickOpenActiveIndex(0);
  }

  function openQuickOpenCandidate(path: string): void {
    void openWorkspaceFile(path);
    closeQuickOpen();
  }

  function confirmDiscardUnsavedChanges(nextAction: string): boolean {
    if (!hasUnsavedFiles) {
      return true;
    }

    return window.confirm(
      `You have ${dirtyTabCount} unsaved file${dirtyTabCount === 1 ? "" : "s"}. ${nextAction} and discard unsaved changes?`
    );
  }

  function requestThreadSelection(threadId: string): void {
    if (threadId === selectedThreadId) {
      return;
    }

    if (!confirmDiscardUnsavedChanges("Switch threads")) {
      return;
    }

    setSelectedThreadId(threadId);
  }

  function startResize(target: ResizeState["target"], clientX: number): void {
    const startWidth =
      target === "left" ? leftSidebarWidth : target === "right" ? rightPanelWidth : explorerWidth;

    resizeStateRef.current = {
      target,
      startX: clientX,
      startWidth,
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }

  function handleResetLayout(): void {
    setShowLeftSidebar(true);
    setShowRightPanel(true);
    setShowExplorer(true);
    setLeftSidebarWidth(DEFAULT_LEFT_SIDEBAR_WIDTH);
    setRightPanelWidth(DEFAULT_RIGHT_PANEL_WIDTH);
    setExplorerWidth(DEFAULT_EXPLORER_WIDTH);
  }

  async function restoreEditorSession(threadId: string): Promise<void> {
    const sessions = readEditorSessions();
    const session = sessions[threadId];
    if (!session) {
      return;
    }

    if (session.centerPaneMode) {
      setCenterPaneMode(session.centerPaneMode);
    }

    if (session.currentPath && session.currentPath !== workspaceCurrentPath) {
      await loadWorkspaceDirectory(threadId, session.currentPath);
    }

    if (!session.tabs || session.tabs.length === 0) {
      return;
    }

    const uniqueTabs = Array.from(new Set(session.tabs)).slice(0, 8);
    for (const path of uniqueTabs) {
      await openWorkspaceFile(path);
    }

    if (session.activePath && uniqueTabs.includes(session.activePath)) {
      setActiveFilePath(session.activePath);
    }
  }

  async function openWorkspaceFile(
    filePath: string,
    options: { forceReload?: boolean; lineNumber?: number } = {}
  ): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    const existing = fileTabs.find((tab) => tab.path === filePath);
    if (existing && !options.forceReload) {
      setActiveFilePath(filePath);
      if (options.lineNumber) {
        setLineJumpTarget({ path: filePath, lineNumber: options.lineNumber });
      }
      return;
    }

    setCenterPaneMode("editor");
    setEditorLoadingPath(filePath);
    try {
      const data = await getJson<{ file?: ReadWorkspaceFileResponse } & Partial<ReadWorkspaceFileResponse>>(
        `/threads/${selectedThreadId}/files/read?path=${encodeURIComponent(filePath)}`
      );
      const file = data.file ?? {
        path: data.path ?? filePath,
        content: data.content ?? "",
        mtimeMs: typeof data.mtimeMs === "number" ? data.mtimeMs : Date.now(),
      };

      setFileTabs((prev) => {
        const index = prev.findIndex((tab) => tab.path === file.path);
        if (index === -1) {
          return [
            ...prev,
            {
              path: file.path,
              content: file.content,
              savedContent: file.content,
              mtimeMs: file.mtimeMs,
            },
          ];
        }

        const next = [...prev];
        next[index] = {
          ...next[index],
          content: file.content,
          savedContent: file.content,
          mtimeMs: file.mtimeMs,
        };
        return next;
      });

      setActiveFilePath(file.path);
      setWorkspaceError(undefined);
      if (options.lineNumber) {
        setLineJumpTarget({ path: file.path, lineNumber: options.lineNumber });
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setWorkspaceError(message);
      setError(message);
    } finally {
      setEditorLoadingPath(undefined);
    }
  }

  function handleUpdateActiveFile(content: string): void {
    if (!activeFilePath) {
      return;
    }

    setFileTabs((prev) =>
      prev.map((tab) => (tab.path === activeFilePath ? { ...tab, content } : tab))
    );
  }

  async function handleSaveFile(filePath: string, options: { force?: boolean } = {}): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    const tab = fileTabs.find((item) => item.path === filePath);
    if (!tab || tab.content === tab.savedContent) {
      return;
    }

    setEditorSavingPath(filePath);
    try {
      const data = await postJson<{ file?: ReadWorkspaceFileResponse } & Partial<ReadWorkspaceFileResponse>>(
        `/threads/${selectedThreadId}/files/write`,
        {
          path: tab.path,
          content: tab.content,
          expectedMtimeMs: tab.mtimeMs,
          force: options.force,
        }
      );

      const file = data.file ?? {
        path: data.path ?? tab.path,
        content: data.content ?? tab.content,
        mtimeMs: data.mtimeMs ?? tab.mtimeMs,
      };

      setFileTabs((prev) =>
        prev.map((item) =>
          item.path === file.path
            ? { ...item, content: file.content, savedContent: file.content, mtimeMs: file.mtimeMs }
            : item
        )
      );

      if (prd.path === file.path) {
        setPrd((prev) => ({
          ...prev,
          exists: true,
          content: file.content,
          validationError: undefined,
        }));
      }

      setError(undefined);
      await loadWorkspaceDirectory(selectedThreadId, dirname(file.path));
      await loadWorkspaceFileIndex(selectedThreadId);
      await loadBootstrapStatus(selectedThreadId);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409 && isWorkspaceConflict(saveError.body)) {
        const conflict = saveError.body.conflict;
        const overwrite = window.confirm(
          `${conflict.path} changed on disk since it was opened.\n\nPress OK to overwrite with your editor contents, or Cancel to reload the latest disk version.`
        );

        if (overwrite) {
          await handleSaveFile(filePath, { force: true });
          return;
        }

        await openWorkspaceFile(filePath, { forceReload: true });
        setError("Reloaded latest version from disk.");
        return;
      }

      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      setWorkspaceError(message);
    } finally {
      setEditorSavingPath(undefined);
    }
  }

  async function handleReloadFile(filePath: string): Promise<void> {
    const tab = fileTabs.find((item) => item.path === filePath);
    if (!tab) {
      return;
    }

    if (tab.content !== tab.savedContent) {
      const confirmed = window.confirm("Discard unsaved changes and reload this file?");
      if (!confirmed) {
        return;
      }
    }

    await openWorkspaceFile(filePath, { forceReload: true });
  }

  async function handleSaveAllFiles(): Promise<void> {
    const dirtyTabs = fileTabs.filter((tab) => tab.content !== tab.savedContent);
    for (const tab of dirtyTabs) {
      await handleSaveFile(tab.path);
    }
  }

  function handleCloseFileTab(filePath: string): void {
    const tab = fileTabs.find((item) => item.path === filePath);
    if (!tab) {
      return;
    }

    if (tab.content !== tab.savedContent) {
      const confirmed = window.confirm(`Close ${filePath} without saving?`);
      if (!confirmed) {
        return;
      }
    }

    const index = fileTabs.findIndex((item) => item.path === filePath);
    const nextTabs = fileTabs.filter((item) => item.path !== filePath);
    setFileTabs(nextTabs);

    if (activeFilePath === filePath) {
      const fallback = nextTabs[index] ?? nextTabs[index - 1];
      setActiveFilePath(fallback?.path);
    }
  }

  async function handleOpenFileAtLine(filePath: string, lineNumber: number): Promise<void> {
    setCenterPaneMode("editor");
    await openWorkspaceFile(filePath, { lineNumber });
  }

  async function handleOpenPrdQuickAction(): Promise<void> {
    setRightPanelTab("plan");
    if (selectedThreadId) {
      const latestPrd = await loadPrd(selectedThreadId);
      if (latestPrd?.exists && latestPrd.path) {
        setCenterPaneMode("editor");
        await openWorkspaceFile(latestPrd.path);
      }
    }
  }

  function handleCreatePrdQuickAction(): void {
    setRightPanelTab("plan");
    if (!selectedThreadId) {
      return;
    }

    if (prd.exists && prd.path) {
      setCenterPaneMode("editor");
      void openWorkspaceFile(prd.path);
      return;
    }

    void handleCreatePrd("json");
  }

  useEffect(() => {
    void loadThreads();
    void loadAutomations();
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setEvents([]);
      setDiffText("");
      setComments([]);
      setWorkspaceRoot("");
      setWorkspaceCurrentPath(".");
      setWorkspaceEntries([]);
      setWorkspaceFileIndex([]);
      setWorkspaceError(undefined);
      setQuickOpenError(undefined);
      setQuickOpenLoading(false);
      closeQuickOpen();
      setBootstrapStatus(undefined);
      setBootstrapMessage(undefined);
      setFileTabs([]);
      setActiveFilePath(undefined);
      setLineJumpTarget(undefined);
      setPrd({
        exists: false,
        format: null,
        path: null,
        content: "",
      });
      setSelectedDiffLine(undefined);
      setCommentBody("");
      setSelectedCommentIds([]);
      return;
    }
    void loadEvents(selectedThreadId);
    void loadDiff(selectedThreadId);
    void loadComments(selectedThreadId);
    void loadPrd(selectedThreadId);
    void loadBootstrapStatus(selectedThreadId);
    setSelectedDiffLine(undefined);
    setCommentBody("");
    setSelectedCommentIds([]);
    setBootstrapMessage(undefined);
    setFileTabs([]);
    setActiveFilePath(undefined);
    setLineJumpTarget(undefined);

    void (async () => {
      try {
        await loadWorkspaceDirectory(selectedThreadId, ".");
        await loadWorkspaceFileIndex(selectedThreadId);
        await restoreEditorSession(selectedThreadId);
      } catch {
        return;
      }
    })();
  }, [selectedThreadId]);

  useEffect(() => {
    if (!quickOpenOpen) {
      return;
    }

    setQuickOpenActiveIndex((prev) => {
      if (quickOpenCandidates.length === 0) {
        return 0;
      }
      return clampNumber(prev, 0, quickOpenCandidates.length - 1);
    });
  }, [quickOpenCandidates, quickOpenOpen]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    const sessions = readEditorSessions();
    sessions[selectedThreadId] = {
      tabs: fileTabs.map((tab) => tab.path),
      activePath: activeFilePath,
      currentPath: workspaceCurrentPath,
      centerPaneMode,
    };
    writeEditorSessions(sessions);
  }, [selectedThreadId, fileTabs, activeFilePath, workspaceCurrentPath, centerPaneMode]);

  useEffect(() => {
    if (!hasUnsavedFiles) {
      return;
    }

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedFiles]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);

      if (mod && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          void handleSaveAllFiles();
          return;
        }

        if (activeEditorTab) {
          void handleSaveFile(activeEditorTab.path);
        }
        return;
      }

      if (mod && key === "p" && selectedThreadId) {
        event.preventDefault();
        void openQuickOpen();
        return;
      }

      if (quickOpenOpen && key === "escape") {
        event.preventDefault();
        closeQuickOpen();
        return;
      }

      if (!editable && mod && key === "b") {
        event.preventDefault();
        setShowLeftSidebar((prev) => !prev);
        return;
      }

      if (!editable && mod && event.altKey && key === "b") {
        event.preventDefault();
        setShowRightPanel((prev) => !prev);
        return;
      }

      if (!editable && mod && key === "e" && centerPaneMode === "editor") {
        event.preventDefault();
        setShowExplorer((prev) => !prev);
        return;
      }

      if (!editable && mod && key === "0") {
        event.preventDefault();
        handleResetLayout();
        return;
      }

      if (mod && key === "w" && activeEditorTab) {
        event.preventDefault();
        handleCloseFileTab(activeEditorTab.path);
        return;
      }

      if (mod && key === "1") {
        event.preventDefault();
        setCenterPaneMode("activity");
        return;
      }

      if (mod && key === "2") {
        event.preventDefault();
        setCenterPaneMode("editor");
        return;
      }

      if (editable) {
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeEditorTab, quickOpenOpen, selectedThreadId, centerPaneMode]);

  useEffect(() => {
    if (!lineJumpTarget || lineJumpTarget.path !== activeFilePath || !editorViewRef.current) {
      return;
    }

    const view = editorViewRef.current;
    const lineCount = view.state.doc.lines;
    if (lineCount <= 0) {
      return;
    }

    const lineNumber = Math.max(1, Math.min(lineJumpTarget.lineNumber, lineCount));
    const line = view.state.doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    view.focus();
    setLineJumpTarget(undefined);
  }, [lineJumpTarget, activeFilePath, fileTabs, editorVersion]);

  useEffect(() => {
    const socket = new WebSocket(`${API_BASE.replace("http", "ws")}/ws`);
    socket.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data as string) as BroadcastEnvelope;
        if (parsed.channel !== "events") {
          return;
        }

        if (parsed.event.threadId === selectedThreadId) {
          setEvents((prev) => [...prev, parsed.event]);
          void loadDiff(parsed.event.threadId);
          void loadComments(parsed.event.threadId);
        }

        void loadThreads();
        void loadAutomations();
      } catch {
        return;
      }
    };

    return () => socket.close();
  }, [selectedThreadId]);

  async function handleCreateThread(): Promise<void> {
    if (!newThreadName.trim() || !newThreadTask.trim() || !newThreadRepo.trim()) {
      setError("Name, task, and repository path are required.");
      return;
    }

    try {
      const created = await postJson<{ thread: ThreadRecord }>("/threads", {
        name: newThreadName,
        task: newThreadTask,
        repoPath: newThreadRepo,
      });

      setNewThreadName("");
      setNewThreadTask("");
      setShowCreateThread(false);
      setError(undefined);
      await loadThreads();
      requestThreadSelection(created.thread.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    }
  }

  async function handleStartRun(): Promise<void> {
    if (!selectedThreadId) {
      return;
    }
    try {
      await postJson(`/threads/${selectedThreadId}/runs`, {
        maxIterations: 12,
      });
      await loadThreads();
      await loadEvents(selectedThreadId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
    }
  }

  async function handleRunControl(action: "pause" | "resume" | "stop" | "retry"): Promise<void> {
    if (!latestRun) {
      return;
    }

    try {
      await postJson(`/runs/${latestRun.id}/control`, {
        action,
      });
      await loadThreads();
      if (selectedThreadId) {
        await loadEvents(selectedThreadId);
      }
    } catch (controlError) {
      setError(controlError instanceof Error ? controlError.message : String(controlError));
    }
  }

  async function handleCreateReviewComment(): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    if (!selectedDiffLine) {
      setError("Select a diff line first to add inline review.");
      return;
    }

    if (!commentBody.trim()) {
      setError("Write a comment before saving.");
      return;
    }

    try {
      await postJson(`/threads/${selectedThreadId}/comments`, {
        runId: latestRun?.id,
        filePath: selectedDiffLine.filePath,
        lineNumber: selectedDiffLine.lineNumber,
        body: commentBody,
      });
      setCommentBody("");
      await loadComments(selectedThreadId);
      await loadDiff(selectedThreadId);
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : String(commentError));
    }
  }

  async function handleRerunFromComments(): Promise<void> {
    if (!selectedThreadId || selectedCommentIds.length === 0) {
      return;
    }

    setReviewLoading(true);
    try {
      await postJson(`/threads/${selectedThreadId}/rerun-from-comments`, {
        commentIds: selectedCommentIds,
      });
      setSelectedCommentIds([]);
      await loadThreads();
      await loadComments(selectedThreadId);
      await loadEvents(selectedThreadId);
    } catch (rerunError) {
      setError(rerunError instanceof Error ? rerunError.message : String(rerunError));
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleCreateAutomation(): Promise<void> {
    if (!selectedThreadId) {
      setError("Select a thread before creating an automation.");
      return;
    }

    if (!newAutomationName.trim() || !newAutomationCron.trim()) {
      setError("Automation name and cron are required.");
      return;
    }

    try {
      await postJson("/automations", {
        name: newAutomationName,
        cron: newAutomationCron,
        threadId: selectedThreadId,
        maxIterations: 10,
      });
      setNewAutomationName("");
      setShowAutomations(false);
      await loadAutomations();
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : String(automationError));
    }
  }

  async function handleCreatePrd(format: PrdFormat): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    setPrdSaving(true);
    try {
      const created = await postJson<{ prd: PrdDocumentRecord }>(`/threads/${selectedThreadId}/prd`, {
        format,
        content: defaultPrdTemplate(format),
      });
      setPrd(created.prd);
      setRightPanelTab("plan");
      if (created.prd.path) {
        setCenterPaneMode("editor");
        await loadWorkspaceDirectory(selectedThreadId, dirname(created.prd.path));
        await loadWorkspaceFileIndex(selectedThreadId);
        await openWorkspaceFile(created.prd.path, { forceReload: true });
      }
      await loadBootstrapStatus(selectedThreadId);
      setError(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setPrdSaving(false);
    }
  }

  async function handlePickRepoPath(): Promise<void> {
    const picker = window.ralphDesktop?.pickDirectory;
    if (!picker) {
      setError("Folder picker is available in desktop mode.");
      return;
    }

    try {
      const selectedPath = await picker({
        title: "Select repository folder",
        defaultPath: newThreadRepo || undefined,
      });

      if (selectedPath) {
        setNewThreadRepo(selectedPath);
        setError(undefined);
      }
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : String(pickError));
    }
  }

  async function handleSavePrd(): Promise<void> {
    if (!selectedThreadId) {
      return;
    }

    if (!prd.content.trim()) {
      setError("PRD content cannot be empty.");
      return;
    }

    setPrdSaving(true);
    try {
      const saved = await postJson<{ prd: PrdDocumentRecord }>(`/threads/${selectedThreadId}/prd`, {
        content: prd.content,
        format: prd.format ?? "json",
        path: prd.path ?? undefined,
      });
      setPrd(saved.prd);
      if (saved.prd.path) {
        setFileTabs((prev) =>
          prev.map((tab) =>
            tab.path === saved.prd.path
              ? { ...tab, content: saved.prd.content, savedContent: saved.prd.content }
              : tab
          )
        );
      }
      await loadBootstrapStatus(selectedThreadId);
      setError(undefined);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setPrdSaving(false);
    }
  }

  async function handleToggleAutomation(automationId: string, enabled: boolean): Promise<void> {
    try {
      await postJson(`/automations/${automationId}/toggle`, { enabled });
      await loadAutomations();
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : String(automationError));
    }
  }

  async function handleRunAutomationNow(automationId: string): Promise<void> {
    try {
      await postJson(`/automations/${automationId}/run-now`, {});
      await loadAutomations();
      await loadThreads();
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : String(automationError));
    }
  }

  async function handleComposerSend(): Promise<void> {
    if (!selectedThreadId) {
      setError("Select or create a thread before starting a run.");
      return;
    }

    if (!composerText.trim()) {
      setError("Write a task update before running.");
      return;
    }

    await handleStartRun();
    setComposerText("");
  }

  async function handleWindowMinimize(): Promise<void> {
    if (!windowControls) {
      return;
    }
    await windowControls.minimize();
  }

  async function handleWindowToggleMaximize(): Promise<void> {
    if (!windowControls) {
      const isFullscreen = Boolean(document.fullscreenElement);
      if (isFullscreen) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      setIsWindowMaximized(!isFullscreen);
      return;
    }
    const maximized = await windowControls.toggleMaximize();
    setIsWindowMaximized(Boolean(maximized));
  }

  async function handleWindowClose(): Promise<void> {
    if (!confirmDiscardUnsavedChanges("Close window")) {
      return;
    }

    if (!windowControls) {
      window.close();
      return;
    }
    await windowControls.close();
  }

  const workspaceLabel =
    selectedWorkspace === "all"
      ? "All workspaces"
      : selectedWorkspace.split(/[/\\]/).slice(-1)[0] ?? selectedWorkspace;

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full w-full">
        {showLeftSidebar ? (
          <>
            <aside
              style={{ width: `${leftSidebarWidth}px` }}
              className="flex h-full shrink-0 flex-col border-r border-border bg-muted/30 p-3"
            >
          <div className="mb-3 flex items-center justify-between rounded-lg bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                <WandSparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Ralph Studio</p>
                <p className="text-xs text-muted-foreground">Agent control center</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mb-3 space-y-1 rounded-lg bg-card p-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setShowCreateThread((prev) => !prev);
                setShowAutomations(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New thread
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setShowAutomations((prev) => !prev);
                setShowCreateThread(false);
              }}
            >
              <Timer className="mr-2 h-4 w-4" />
              Automations
            </Button>
            <Button variant="ghost" className="w-full justify-start" disabled>
              <Sparkles className="mr-2 h-4 w-4" />
              Skills
            </Button>
          </div>

          {showCreateThread && (
            <div className="mb-3 rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Create thread
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Thread title"
                  value={newThreadName}
                  onChange={(event) => setNewThreadName(event.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Repo path"
                    value={newThreadRepo}
                    onChange={(event) => setNewThreadRepo(event.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => void handlePickRepoPath()}>
                    Browse
                  </Button>
                </div>
                <Textarea
                  placeholder="What should this thread build?"
                  value={newThreadTask}
                  onChange={(event) => setNewThreadTask(event.target.value)}
                />
                <Button className="w-full" onClick={() => void handleCreateThread()}>
                  Create
                </Button>
              </div>
            </div>
          )}

          {showAutomations && (
            <div className="mb-3 rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New automation
              </p>
              <div className="space-y-2">
                <Input
                  placeholder="Automation name"
                  value={newAutomationName}
                  onChange={(event) => setNewAutomationName(event.target.value)}
                />
                <Input
                  placeholder="Cron (m h dom mon dow)"
                  value={newAutomationCron}
                  onChange={(event) => setNewAutomationCron(event.target.value)}
                />
                <Button className="w-full" onClick={() => void handleCreateAutomation()}>
                  Save automation
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {automations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No automations yet.</p>
                ) : (
                  automations.map((automation) => (
                    <div key={automation.id} className="rounded-md border border-border p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium">{automation.name}</p>
                        <Badge variant={automation.enabled ? "success" : "default"}>
                          {automation.enabled ? "on" : "off"}
                        </Badge>
                      </div>
                      <p className="mb-2 text-[11px] text-muted-foreground">{automation.cron}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => void handleRunAutomationNow(automation.id)}
                        >
                          Run now
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() =>
                            void handleToggleAutomation(automation.id, !automation.enabled)
                          }
                        >
                          {automation.enabled ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Active workflows
            </p>
            <Badge variant="info">{activeWorkflows.length}</Badge>
          </div>

          <ScrollArea className="mb-3 max-h-[180px] rounded-lg bg-card p-2">
            {activeWorkflows.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">No active workflows</p>
            ) : (
              activeWorkflows.map(({ thread, runs }) => (
                <button
                  key={`wf-${thread.id}`}
                  className="mb-1.5 flex w-full items-center justify-between rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-muted/60"
                  onClick={() => requestThreadSelection(thread.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{thread.name}</p>
                    <p className="text-[11px] text-muted-foreground">{timeAgo(runs[0]?.createdAt)}</p>
                  </div>
                  <Badge variant={badgeVariantForStatus(runs[0]?.status)}>{runs[0]?.status}</Badge>
                </button>
              ))
            )}
          </ScrollArea>

          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Threads</p>
            <Button variant="ghost" size="sm" onClick={() => void loadThreads()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

            <ScrollArea className="min-h-0 flex-1 rounded-lg bg-card p-2">
            {visibleThreads.map(({ thread, runs }) => {
              const latest = runs[0];
              const isSelected = thread.id === selectedThreadId;

              return (
                <button
                  key={thread.id}
                  className={`mb-1.5 w-full rounded-md border px-2 py-2 text-left transition ${
                    isSelected
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent hover:border-border hover:bg-muted/60"
                  }`}
                  onClick={() => requestThreadSelection(thread.id)}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{thread.name}</p>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(thread.updatedAt)}</span>
                  </div>
                  <p className="max-h-9 overflow-hidden text-xs text-muted-foreground">{thread.task}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <CircleDot
                      className={`h-3.5 w-3.5 ${
                        latest?.status === "running"
                          ? "text-sky-500"
                          : latest?.status === "completed"
                            ? "text-emerald-500"
                            : latest?.status === "failed"
                              ? "text-rose-500"
                              : "text-slate-400"
                      }`}
                    />
                    <span className="text-[11px] text-muted-foreground">{latest?.status ?? "idle"}</span>
                  </div>
                </button>
              );
            })}
            </ScrollArea>
            </aside>

            <div
              className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/40"
              onMouseDown={(event) => startResize("left", event.clientX)}
            />
          </>
        ) : (
          <div className="flex h-full w-10 shrink-0 items-start justify-center border-r border-border bg-muted/20 pt-3">
            <button
              className="rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setShowLeftSidebar(true)}
              title="Show sidebar (Ctrl/Cmd+B)"
            >
              &gt;
            </button>
          </div>
        )}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="drag-region border-b border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <p className="truncate text-xl font-semibold">
                    {selected?.thread.name ?? "New thread"}
                  </p>
                  {latestRun && (
                    <Badge variant={badgeVariantForStatus(latestRun.status)}>{latestRun.status}</Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {selected?.thread.repoPath ?? "Select a thread to start orchestrating runs"}
                </p>
              </div>

              <div className="no-drag flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md border border-border bg-background p-0.5">
                    <button
                      className={`rounded px-2 py-1 text-xs ${
                        centerPaneMode === "activity" ? "bg-muted text-foreground" : "text-muted-foreground"
                      }`}
                      onClick={() => setCenterPaneMode("activity")}
                    >
                      Activity
                    </button>
                    <button
                      className={`rounded px-2 py-1 text-xs ${
                        centerPaneMode === "editor" ? "bg-muted text-foreground" : "text-muted-foreground"
                      }`}
                      onClick={() => setCenterPaneMode("editor")}
                    >
                      Editor
                    </button>
                  </div>

                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setWorkspaceDropdownOpen((prev) => !prev)}
                    >
                      <Folder className="mr-1.5 h-4 w-4" />
                      {workspaceLabel}
                      <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                    {workspaceDropdownOpen && (
                      <div className="absolute right-0 top-11 z-20 w-[280px] rounded-lg border border-border bg-card p-1.5 shadow-xl">
                        <button
                          className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSelectedWorkspace("all");
                            setWorkspaceDropdownOpen(false);
                          }}
                        >
                          All workspaces
                        </button>
                        {workspaces.map((path) => (
                          <button
                            key={path}
                            className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setSelectedWorkspace(path);
                              setWorkspaceDropdownOpen(false);
                            }}
                          >
                            {path}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!selectedThreadId}
                    onClick={() => void openQuickOpen()}
                    title="Quick open (Ctrl/Cmd+P)"
                  >
                    <Search className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setShowLeftSidebar((prev) => !prev)}
                    title="Toggle left sidebar (Ctrl/Cmd+B)"
                  >
                    <PanelLeft className={`h-4 w-4 ${showLeftSidebar ? "" : "text-muted-foreground"}`} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={centerPaneMode !== "editor"}
                    onClick={() => setShowExplorer((prev) => !prev)}
                    title="Toggle explorer (Ctrl/Cmd+E)"
                  >
                    <Folder className={`h-4 w-4 ${showExplorer ? "" : "text-muted-foreground"}`} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setShowRightPanel((prev) => !prev)}
                    title="Toggle right panel (Ctrl/Cmd+Alt+B)"
                  >
                    <PanelRight className={`h-4 w-4 ${showRightPanel ? "" : "text-muted-foreground"}`} />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleResetLayout}
                    title="Reset layout (Ctrl/Cmd+0)"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!selectedThreadId}
                    onClick={() => void handleOpenPrdQuickAction()}
                    title="Open PRD"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={!selectedThreadId || prdSaving}
                    onClick={handleCreatePrdQuickAction}
                    title="Create PRD"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled title="Create branch">
                    <GitBranch className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center overflow-hidden rounded-md border border-border bg-background/85 backdrop-blur">
                  <button
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void handleWindowMinimize()}
                    aria-label="Minimize window"
                    title="Minimize"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => void handleWindowToggleMaximize()}
                    aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
                    title={isWindowMaximized ? "Restore" : "Maximize"}
                  >
                    {isWindowMaximized ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500"
                    onClick={() => void handleWindowClose()}
                    aria-label="Close window"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {!hasNativeWindowControls && (
                    <span className="px-2 text-[10px] text-muted-foreground">web mode</span>
                  )}
                </div>
              </div>
            </div>
          </header>

          <section className="flex min-h-0 flex-1 bg-background">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {centerPaneMode === "activity" ? (
                <ScrollArea className="min-h-0 flex-1 px-6 py-5">
                  {events.length === 0 ? (
                    <div className="mx-auto mt-24 max-w-xl text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Bot className="h-5 w-5" />
                      </div>
                      <p className="mb-2 text-lg font-medium">Let&apos;s build</p>
                      <p className="text-sm text-muted-foreground">
                        Start a run to see search, edit, validate, and checkpoint events stream in.
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-3xl space-y-2">
                      {events.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-lg border border-border bg-card px-3 py-2.5"
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <p className="text-sm font-medium">{eventLabel(event)}</p>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(event.createdAt)}
                            </span>
                          </div>
                          <p className="mb-1 text-[11px] text-muted-foreground">{event.type}</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              ) : (
                <div className="flex min-h-0 flex-1 border-b border-border">
                  {showExplorer ? (
                    <>
                      <aside
                        style={{ width: `${explorerWidth}px` }}
                        className="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/50"
                      >
                        <div className="border-b border-border px-3 py-2">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Explorer
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={!selectedThreadId || workspaceCurrentPath === "." || workspaceLoading}
                                onClick={() =>
                                  selectedThreadId &&
                                  void loadWorkspaceDirectory(selectedThreadId, dirname(workspaceCurrentPath))
                                }
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                disabled={!selectedThreadId || workspaceLoading}
                                onClick={() =>
                                  selectedThreadId &&
                                  void loadWorkspaceDirectory(selectedThreadId, workspaceCurrentPath)
                                }
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setShowExplorer(false)}
                                title="Hide explorer (Ctrl/Cmd+E)"
                              >
                                Hide
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                            <button
                              className="rounded bg-muted px-1.5 py-0.5 hover:bg-muted/70"
                              onClick={() =>
                                selectedThreadId && void loadWorkspaceDirectory(selectedThreadId, ".")
                              }
                            >
                              root
                            </button>
                            {workspacePathSegments.map((segment, index) => {
                              const path = workspacePathSegments.slice(0, index + 1).join("/");
                              return (
                                <button
                                  key={`${segment}-${index}`}
                                  className="rounded bg-muted px-1.5 py-0.5 hover:bg-muted/70"
                                  onClick={() =>
                                    selectedThreadId && void loadWorkspaceDirectory(selectedThreadId, path)
                                  }
                                >
                                  {segment}
                                </button>
                              );
                            })}
                          </div>
                          {workspaceRoot && (
                            <p className="mt-1 truncate text-[10px] text-muted-foreground">{workspaceRoot}</p>
                          )}
                        </div>

                        <ScrollArea className="min-h-0 flex-1 p-2">
                          {workspaceError ? (
                            <p className="text-xs text-rose-600">{workspaceError}</p>
                          ) : workspaceLoading ? (
                            <p className="text-xs text-muted-foreground">Loading files...</p>
                          ) : workspaceEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No files in this folder.</p>
                          ) : (
                            <div className="space-y-1">
                              {workspaceEntries.map((entry) => (
                                <button
                                  key={entry.path}
                                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${
                                    entry.type === "file" && activeFilePath === entry.path
                                      ? "bg-primary/10"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    if (!selectedThreadId) {
                                      return;
                                    }

                                    if (entry.type === "directory") {
                                      void loadWorkspaceDirectory(selectedThreadId, entry.path);
                                      return;
                                    }

                                    void openWorkspaceFile(entry.path);
                                  }}
                                >
                                  {entry.type === "directory" ? (
                                    <Folder className="h-3.5 w-3.5 text-sky-500" />
                                  ) : (
                                    <File className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <span className="truncate">{entry.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </aside>

                      <div
                        className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/40"
                        onMouseDown={(event) => startResize("explorer", event.clientX)}
                      />
                    </>
                  ) : (
                    <div className="flex w-8 shrink-0 items-start justify-center border-r border-border bg-card/40 pt-2">
                      <button
                        className="rounded border border-border px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setShowExplorer(true)}
                        title="Show explorer (Ctrl/Cmd+E)"
                      >
                        &gt;
                      </button>
                    </div>
                  )}

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
                      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                        {fileTabs.length === 0 ? (
                          <p className="px-2 text-xs text-muted-foreground">Open a file from explorer</p>
                        ) : (
                          fileTabs.map((tab) => {
                            const active = tab.path === activeFilePath;
                            const dirty = tab.content !== tab.savedContent;
                            return (
                              <div
                                key={tab.path}
                                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                                  active ? "border-primary/40 bg-primary/10" : "border-border bg-background"
                                }`}
                              >
                                <button
                                  className="max-w-[220px] truncate"
                                  onClick={() => setActiveFilePath(tab.path)}
                                >
                                  {tab.path}
                                  {dirty ? " *" : ""}
                                </button>
                                <button
                                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                  onClick={() => handleCloseFileTab(tab.path)}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          disabled={!activeEditorTab || editorSavingPath === activeEditorTab.path}
                          onClick={() => activeEditorTab && void handleReloadFile(activeEditorTab.path)}
                          title="Reload file"
                        >
                          Reload
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          disabled={dirtyTabCount === 0 || Boolean(editorSavingPath)}
                          onClick={() => void handleSaveAllFiles()}
                          title="Ctrl/Cmd+Shift+S"
                        >
                          Save all ({dirtyTabCount})
                        </Button>
                        <Button
                          size="sm"
                          className="h-7"
                          disabled={
                            !activeEditorTab ||
                            activeEditorTab.content === activeEditorTab.savedContent ||
                            editorSavingPath === activeEditorTab.path
                          }
                          onClick={() => activeEditorTab && void handleSaveFile(activeEditorTab.path)}
                          title="Ctrl/Cmd+S"
                        >
                          Save
                        </Button>
                      </div>
                    </div>

                    {activeEditorTab ? (
                      <>
                        <div className="flex items-center justify-between border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
                          <span>{activeEditorTab.path}</span>
                          {lineJumpTarget?.path === activeEditorTab.path && (
                            <span>Line {lineJumpTarget.lineNumber}</span>
                          )}
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <CodeMirror
                            key={activeEditorTab.path}
                            value={activeEditorTab.content}
                            height="100%"
                            theme={oneDark}
                            extensions={[
                              editorSurfaceTheme,
                              ...languageExtensionsForPath(activeEditorTab.path),
                            ]}
                            onChange={(value) => handleUpdateActiveFile(value)}
                            onCreateEditor={(editorView) => {
                              editorViewRef.current = editorView;
                              setEditorVersion((prev) => prev + 1);
                            }}
                            className="h-full text-[12px]"
                            basicSetup={{
                              foldGutter: true,
                              highlightActiveLine: true,
                              highlightSelectionMatches: true,
                              lineNumbers: true,
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                        Select a file to start editing.
                      </div>
                    )}

                    {editorLoadingPath && (
                      <div className="border-t border-border px-3 py-1 text-[11px] text-muted-foreground">
                        Loading {editorLoadingPath}...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-border bg-card px-5 py-4">
                <div className="mx-auto max-w-3xl">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <button
                      className="rounded-full border border-border bg-muted px-3 py-1 hover:bg-muted/70"
                      onClick={() => setComposerText("Create a classic snake game")}
                    >
                      Create a classic snake game
                    </button>
                    <button
                      className="rounded-full border border-border bg-muted px-3 py-1 hover:bg-muted/70"
                      onClick={() => setComposerText("Find and fix 4 bugs in my code")}
                    >
                      Find and fix 4 bugs in my code
                    </button>
                    <button
                      className="rounded-full border border-border bg-muted px-3 py-1 hover:bg-muted/70"
                      onClick={() => setComposerText("Summarize this app in a pdf")}
                    >
                      Summarize this app in a pdf
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border bg-background px-3 py-2 shadow-sm">
                    <Textarea
                      className="min-h-[72px] resize-none border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0"
                      placeholder="Ask Ralph anything, @ to add files, / for commands"
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                    />

                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          GPT-5.2-Codex
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          Extra high
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm">
                          <Lock className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Mic className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => void handleComposerSend()}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="border-b border-primary pb-0.5 text-foreground">Local</span>
                      <span>Worktree</span>
                      <span>Cloud</span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5" />
                      main
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {showRightPanel ? (
              <>
                <div
                  className="w-1 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/40"
                  onMouseDown={(event) => startResize("right", event.clientX)}
                />
                <aside
                  style={{ width: `${rightPanelWidth}px` }}
                  className="flex min-h-0 shrink-0 flex-col border-l border-border bg-card/80 p-4"
                >
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-muted p-1">
                <button
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    rightPanelTab === "controls" ? "bg-card" : "text-muted-foreground"
                  }`}
                  onClick={() => setRightPanelTab("controls")}
                >
                  Controls
                </button>
                <button
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    rightPanelTab === "review" ? "bg-card" : "text-muted-foreground"
                  }`}
                  onClick={() => setRightPanelTab("review")}
                >
                  Review
                </button>
                <button
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    rightPanelTab === "plan" ? "bg-card" : "text-muted-foreground"
                  }`}
                  onClick={() => setRightPanelTab("plan")}
                >
                  PRD
                </button>
              </div>

              {rightPanelTab === "controls" ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">Run Controls</p>
                    <Badge variant={badgeVariantForStatus(latestRun?.status)}>
                      {latestRun?.status ?? "idle"}
                    </Badge>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selected}
                      onClick={() => void handleStartRun()}
                    >
                      <CirclePlay className="mr-1.5 h-4 w-4" />
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!latestRun || latestRun.status !== "queued"}
                      onClick={() => void handleRunControl("pause")}
                    >
                      <Pause className="mr-1.5 h-4 w-4" />
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!latestRun || latestRun.status !== "paused"}
                      onClick={() => void handleRunControl("resume")}
                    >
                      <CirclePlay className="mr-1.5 h-4 w-4" />
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!latestRun || !["queued", "running", "paused"].includes(latestRun.status)}
                      onClick={() => void handleRunControl("stop")}
                    >
                      <Square className="mr-1.5 h-4 w-4" />
                      Stop
                    </Button>
                  </div>

                  <Button
                    variant="secondary"
                    className="mb-4 w-full"
                    disabled={!latestRun}
                    onClick={() => void handleRunControl("retry")}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry run
                  </Button>

                  <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Iterations</span>
                      <span className="font-medium">
                        {latestRun?.iterations ?? 0}/{latestRun?.maxIterations ?? 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Started</span>
                      <span className="font-medium">{formatTime(latestRun?.startedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Finished</span>
                      <span className="font-medium">{formatTime(latestRun?.finishedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Backend</span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" />
                        Connected
                      </span>
                    </div>
                  </div>
                </>
              ) : rightPanelTab === "review" ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">Diff + Comments</p>
                    <Badge variant="default">{comments.length}</Badge>
                  </div>

                  <ScrollArea className="mb-3 h-[220px] rounded-lg border border-border bg-background p-2">
                    {diffLines.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No local diff in this worktree yet.</p>
                    ) : (
                      <div className="space-y-0.5">
                        {diffLines.map((line) => {
                          const canSelect = Boolean(line.filePath && line.lineNumber);
                          const selectedLine =
                            selectedDiffLine &&
                            line.filePath === selectedDiffLine.filePath &&
                            line.lineNumber === selectedDiffLine.lineNumber;

                          return (
                            <button
                              key={line.key}
                              className={`block w-full rounded px-1.5 py-0.5 text-left font-mono text-[11px] ${
                                selectedLine ? "bg-primary/10" : "hover:bg-muted/70"
                              } ${
                                line.type === "add"
                                  ? "text-emerald-600"
                                  : line.type === "remove"
                                    ? "text-rose-600"
                                    : "text-muted-foreground"
                              }`}
                              disabled={!canSelect}
                              onClick={() => {
                                if (!line.filePath || !line.lineNumber) {
                                  return;
                                }
                                setSelectedDiffLine({
                                  filePath: line.filePath,
                                  lineNumber: line.lineNumber,
                                });
                                void handleOpenFileAtLine(line.filePath, line.lineNumber);
                              }}
                            >
                              {line.text || " "}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Click any diff line to jump into the editor at that location.
                  </p>

                  <div className="mb-3 rounded-lg border border-border bg-background p-2">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {selectedDiffLine
                        ? `Commenting ${selectedDiffLine.filePath}:${selectedDiffLine.lineNumber}`
                        : "Select a diff line to leave inline feedback"}
                    </p>
                    <Textarea
                      className="min-h-[72px]"
                      placeholder="What should change on this line?"
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                    />
                    <Button
                      className="mt-2 w-full"
                      size="sm"
                      disabled={!selectedDiffLine || !commentBody.trim()}
                      onClick={() => void handleCreateReviewComment()}
                    >
                      Add inline comment
                    </Button>
                  </div>

                  <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border bg-background p-2">
                    {comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No comments added yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {comments.map((comment) => {
                          const isChecked = selectedCommentIds.includes(comment.id);
                          return (
                            <label
                              key={comment.id}
                              className="block cursor-pointer rounded-md border border-border p-2"
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="truncate text-left text-xs font-medium underline decoration-dotted underline-offset-2"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void handleOpenFileAtLine(comment.filePath, comment.lineNumber);
                                  }}
                                >
                                  {comment.filePath}:{comment.lineNumber}
                                </button>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(event) => {
                                    setSelectedCommentIds((prev) => {
                                      if (event.target.checked) {
                                        return [...prev, comment.id];
                                      }
                                      return prev.filter((id) => id !== comment.id);
                                    });
                                  }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">{comment.body}</p>
                              <p className="mt-1 text-[10px] uppercase text-muted-foreground">
                                {comment.status}
                              </p>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                  <Button
                    className="mt-3 w-full"
                    size="sm"
                    disabled={selectedCommentIds.length === 0 || reviewLoading}
                    onClick={() => void handleRerunFromComments()}
                  >
                    {reviewLoading ? "Queueing rerun..." : "Rerun with selected feedback"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">PRD Studio</p>
                    <Badge variant={prd.exists ? "success" : "default"}>
                      {prd.format ?? "none"}
                    </Badge>
                  </div>

                  {selectedThreadId && (
                    <div className="mb-3 rounded-lg border border-border bg-background p-2.5">
                      {bootstrapLoading ? (
                        <p className="text-[11px] text-muted-foreground">Checking Ralph setup...</p>
                      ) : bootstrapStatus === undefined ? (
                        <p className="text-[11px] text-muted-foreground">
                          Unable to determine setup status right now.
                        </p>
                      ) : !bootstrapStatus.initialized ? (
                        <>
                          <p className="mb-1 text-[11px] text-amber-600">
                            Ralph setup is incomplete for this workspace.
                          </p>
                          <p className="mb-2 text-[11px] text-muted-foreground">
                            Missing: {bootstrapStatus.missing.join(", ")}
                          </p>
                          <p className="mb-2 text-[11px] text-muted-foreground">
                            Initialize will create only the missing Ralph files.
                          </p>
                          <Button
                            size="sm"
                            className="h-7 w-full"
                            disabled={bootstrapInitializing}
                            onClick={() => void handleInitializeRalphWorkspace()}
                          >
                            {bootstrapInitializing ? "Initializing..." : "Initialize Ralph Files"}
                          </Button>
                        </>
                      ) : (
                        <p className="text-[11px] text-emerald-600">Ralph setup is ready.</p>
                      )}
                      {bootstrapMessage && (
                        <p className="mt-2 text-[11px] text-muted-foreground">{bootstrapMessage}</p>
                      )}
                    </div>
                  )}

                  {!selectedThreadId ? (
                    <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                      Select a thread to edit or create a PRD file.
                    </div>
                  ) : prdLoading ? (
                    <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                      Loading PRD...
                    </div>
                  ) : !prd.exists ? (
                    <div className="space-y-3 rounded-lg border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">
                        No PRD found in this thread worktree.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={prdSaving}
                          onClick={() => void handleCreatePrd("json")}
                        >
                          Create prd.json
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={prdSaving}
                          onClick={() => void handleCreatePrd("markdown")}
                        >
                          Create prd.md
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 rounded-lg border border-border bg-background p-2">
                        <p className="text-[11px] text-muted-foreground">
                          {prd.path ? `Editing ${prd.path}` : "Editing PRD"}
                        </p>
                        {prd.validationError && (
                          <p className="mt-1 text-[11px] text-rose-600">{prd.validationError}</p>
                        )}
                      </div>

                      <Textarea
                        className="min-h-[360px] font-mono text-xs"
                        value={prd.content}
                        onChange={(event) =>
                          setPrd((prev) => ({
                            ...prev,
                            content: event.target.value,
                            validationError: undefined,
                          }))
                        }
                      />

                      <Button
                        className="mt-3 w-full"
                        size="sm"
                        disabled={prdSaving || !prd.content.trim()}
                        onClick={() => void handleSavePrd()}
                      >
                        {prdSaving ? "Saving PRD..." : "Save PRD"}
                      </Button>
                    </>
                  )}
                </>
              )}

                  <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    {loading ? "Refreshing data..." : "Ready"}
                    {error ? ` - ${error}` : ""}
                  </div>
                </aside>
              </>
            ) : (
              <div className="flex w-10 shrink-0 items-start justify-center border-l border-border bg-card/40 pt-3">
                <button
                  className="rounded border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setShowRightPanel(true)}
                  title="Show right panel (Ctrl/Cmd+Alt+B)"
                >
                  &lt;
                </button>
              </div>
            )}
          </section>
        </main>

        {quickOpenOpen && (
          <div
            className="fixed inset-0 z-40 flex items-start justify-center bg-black/35 p-6"
            role="dialog"
            onClick={closeQuickOpen}
          >
            <div
              className="mt-16 w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-border p-3">
                <Input
                  autoFocus
                  placeholder="Quick open file..."
                  value={quickOpenQuery}
                  onChange={(event) => {
                    setQuickOpenQuery(event.target.value);
                    setQuickOpenActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (quickOpenCandidates.length > 0) {
                        setQuickOpenActiveIndex((prev) =>
                          clampNumber(prev + 1, 0, quickOpenCandidates.length - 1)
                        );
                      }
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (quickOpenCandidates.length > 0) {
                        setQuickOpenActiveIndex((prev) =>
                          clampNumber(prev - 1, 0, quickOpenCandidates.length - 1)
                        );
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeQuickOpen();
                      return;
                    }

                    if (event.key === "Enter" && quickOpenCandidates.length > 0) {
                      event.preventDefault();
                      const selectedPath = quickOpenCandidates[quickOpenActiveIndex] ?? quickOpenCandidates[0];
                      openQuickOpenCandidate(selectedPath);
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Enter to open first match. Esc to close.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={!selectedThreadId || quickOpenLoading}
                    onClick={() => {
                      if (!selectedThreadId) {
                        return;
                      }
                      setQuickOpenLoading(true);
                      void loadWorkspaceFileIndex(selectedThreadId).finally(() => {
                        setQuickOpenLoading(false);
                      });
                    }}
                  >
                    {quickOpenLoading ? "Indexing..." : "Refresh index"}
                  </Button>
                </div>
                {quickOpenError && <p className="mt-1 text-[11px] text-amber-600">{quickOpenError}</p>}
              </div>

              <ScrollArea className="h-[340px] p-2">
                {quickOpenLoading ? (
                  <p className="p-2 text-xs text-muted-foreground">Building file index...</p>
                ) : quickOpenCandidates.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">
                    {workspaceFileIndex.length === 0
                      ? "No indexed files yet. Try Refresh index."
                      : "No matching files."}
                  </p>
                ) : (
                  quickOpenCandidates.map((path, index) => (
                    <button
                      key={path}
                      className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${
                        index === quickOpenActiveIndex ? "bg-primary/10" : ""
                      }`}
                      onMouseEnter={() => setQuickOpenActiveIndex(index)}
                      onClick={() => openQuickOpenCandidate(path)}
                    >
                      <span className="truncate">{path}</span>
                      {activeFilePath === path && <Badge variant="info">open</Badge>}
                    </button>
                  ))
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
