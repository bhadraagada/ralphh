import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const isDev = !app.isPackaged;
const __dirname = dirname(fileURLToPath(import.meta.url));

function getActiveWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    title: "Ralph Studio",
    backgroundColor: "#0f172a",
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.maximize();

  window.on("maximize", () => {
    window.webContents.send("window:maximized-changed", true);
  });

  window.on("unmaximize", () => {
    window.webContents.send("window:maximized-changed", false);
  });

  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173");
    if (process.env.RALPH_DESKTOP_DEVTOOLS === "1") {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void window.loadFile(join(__dirname, "../dist/renderer/index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

ipcMain.handle("window:minimize", () => {
  const window = getActiveWindow();
  window?.minimize();
  return true;
});

ipcMain.handle("window:toggle-maximize", () => {
  const window = getActiveWindow();
  if (!window) {
    return false;
  }

  if (window.isMaximized()) {
    window.unmaximize();
    return false;
  }

  window.maximize();
  return true;
});

ipcMain.handle("window:close", () => {
  const window = getActiveWindow();
  window?.close();
  return true;
});

ipcMain.handle("window:is-maximized", () => {
  const window = getActiveWindow();
  return window ? window.isMaximized() : false;
});

ipcMain.handle("dialog:pick-directory", async (_event, options) => {
  const activeWindow = getActiveWindow() ?? undefined;
  const result = await dialog.showOpenDialog(activeWindow, {
    title: options?.title ?? "Select folder",
    defaultPath: typeof options?.defaultPath === "string" ? options.defaultPath : undefined,
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
