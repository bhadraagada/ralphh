import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
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
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  SunMedium,
  Timer,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  BroadcastEnvelope,
  EventRecord,
  ReviewCommentRecord,
  RunRecord,
  RunStatus,
  ThreadRecord,
} from "@ralphh/shared";
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

type ThemeMode = "light" | "dark";

const API_BASE = "http://127.0.0.1:4242";

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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
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
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [threads, setThreads] = useState<ThreadBundle[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [theme, setTheme] = useState<ThemeMode>("light");

  const [showCreateThread, setShowCreateThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [newThreadTask, setNewThreadTask] = useState("");
  const [newThreadRepo, setNewThreadRepo] = useState("");

  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [composerText, setComposerText] = useState("");
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"controls" | "review">("controls");
  const [diffText, setDiffText] = useState("");
  const [comments, setComments] = useState<ReviewCommentRecord[]>([]);
  const [selectedDiffLine, setSelectedDiffLine] = useState<{ filePath: string; lineNumber: number }>();
  const [commentBody, setCommentBody] = useState("");
  const [selectedCommentIds, setSelectedCommentIds] = useState<number[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);

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

  useEffect(() => {
    const storedTheme = localStorage.getItem("ralph-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("ralph-theme", theme);
  }, [theme]);

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

  useEffect(() => {
    void loadThreads();
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setEvents([]);
      setDiffText("");
      setComments([]);
      setSelectedDiffLine(undefined);
      setCommentBody("");
      setSelectedCommentIds([]);
      return;
    }
    void loadEvents(selectedThreadId);
    void loadDiff(selectedThreadId);
    void loadComments(selectedThreadId);
    setSelectedDiffLine(undefined);
    setCommentBody("");
    setSelectedCommentIds([]);
  }, [selectedThreadId]);

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
      setSelectedThreadId(created.thread.id);
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
      <div className="grid h-full w-full grid-cols-[316px_minmax(0,1fr)]">
        <aside className="flex h-full flex-col border-r border-border bg-muted/30 p-3">
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
              onClick={() => setShowCreateThread((prev) => !prev)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New thread
            </Button>
            <Button variant="ghost" className="w-full justify-start" disabled>
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
                <Input
                  placeholder="Repo path"
                  value={newThreadRepo}
                  onChange={(event) => setNewThreadRepo(event.target.value)}
                />
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
                  onClick={() => setSelectedThreadId(thread.id)}
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
                  onClick={() => setSelectedThreadId(thread.id)}
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

        <main className="flex min-w-0 flex-col">
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

                  <Button variant="outline" size="sm" disabled>
                    Open
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    Checkout on local
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    <GitBranch className="mr-1.5 h-4 w-4" />
                    Create branch here
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

          <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] bg-background">
            <div className="flex min-h-0 flex-col">
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

            <aside className="flex min-h-0 flex-col border-l border-border bg-card/80 p-4">
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
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
              ) : (
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
                              }}
                            >
                              {line.text || " "}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

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
                                <span className="truncate text-xs font-medium">
                                  {comment.filePath}:{comment.lineNumber}
                                </span>
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
              )}

              <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {loading ? "Refreshing data..." : "Ready"}
                {error ? ` - ${error}` : ""}
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}
