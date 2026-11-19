const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const readline = require('node:readline');
const Database = require('better-sqlite3');
const { spawn } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const updateTools = require('./updateTools');
let db;
let childProcess;
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 520,
    title: 'Electron 桌面应用',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  updateTools.setup({ window: mainWindow });
}
function createDatabase(){
  const dbPath = path.join(app.getPath('userData'), 'app.db');
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL
    )
  `);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}
function createChildProcess(){
  childProcess = spawn(process.execPath, [path.join(__dirname, 'child-server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const rl = readline.createInterface({
    input: childProcess.stdout,
  });
  rl.on('line', (line)=>{
    const text = line.trim();
    if (!text) return;
    console.log('读取进程数据===', text);
  });
  childProcess.on('error', (error) => {
    console.error('启动子进程失败：', error);
  });
  childProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`子进程退出：code=${code}, signal=${signal}`);
    }
  });
  childProcess.stdin.write('huanglin\n');
}

function cleanup() {
  // 杀掉子进程
  if (childProcess && !childProcess.killed) {
    childProcess.kill('SIGTERM');
    // 3 秒后强杀兜底
    setTimeout(() => {
      if (childProcess && !childProcess.killed) childProcess.kill('SIGKILL');
    }, 3000);
  }
  // 关闭数据库
  if (db) {
    try { db.close(); } catch(e) {}
  }
  // 注销全局快捷键
  globalShortcut.unregisterAll();
}

const controlMenu=()=>{
  globalShortcut.register("CommandOrControl+K", ()=>{
    console.log("触发快捷键")
    
  })
}
ipcMain.handle('notes:list', () => {
  // const downlaoadPath = app.getPath('downloads');
  // console.log("下载路径", downlaoadPath);
  // const userDataPath = app.getPath('userData');
  // console.log("下载路径", userDataPath);
  try{
    return db.prepare('SELECT * FROM users').all();
  }catch(e){
    console.error('查询数据库失败：', e);
    return ['查询数据库失败：'+(e?.message || '未知错误')];
  }
  // return downlaoadPath;
});

// ---------- 配置文件读写（原子写 + 备份） ----------

// 配置文件路径
const configPath = path.join(__dirname, '../config.json');
const configTmpPath = path.join(os.tmpdir(), 'extest-mnt', 'config.json.tmp');
const configBakPath = configPath + '.bak';
/**
 * 读取配置
 * @returns {Promise<object>} 配置对象，文件不存在则返回 {}
 */
async function loadConfig() {
  try {
    if (!fsSync.existsSync(configPath)) return {};
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('读取配置失败：', e);
    // JSON 损坏时尝试从备份恢复
    try {
      if (fsSync.existsSync(configBakPath)) {
        const bak = await fs.readFile(configBakPath, 'utf8');
        return JSON.parse(bak);
      }
    } catch (e2) {
      console.error('备份恢复也失败：', e2);
    }
    return {};
  }
}

/**
 * 原子写配置：tmp → rename → config.json，并备份旧版本到 .bak
 * @param {object} newConfig 新的配置对象
 */
async function saveConfig(newConfig) {
  const content = JSON.stringify(newConfig, null, 2);

  // 1. 备份旧 config.json 到 config.json.bak（如果存在）
  if (fsSync.existsSync(configPath)) {
    try{
      await fs.copyFile(configPath, configBakPath);
    }catch(e){
      console.error('备份配置失败：', e);
    }
  }

  // 2. 先写到临时文件 .tmp 并 fsync 落盘（writeFile 不建目录、不保证落盘）
  await fs.mkdir(path.dirname(configTmpPath), { recursive: true });
  const fh = await fs.open(configTmpPath, 'w');
  try {
    await fh.writeFile(content, 'utf8');
    await fh.sync(); // fsync：防止断电时 tmp 文件只有半截
  } finally {
    await fh.close();
  }

  // 3. rename 到 config.json（同文件系统内是原子操作）
  console.log(configTmpPath)
  console.log(configPath)
  await fs.rename(configTmpPath, configPath);

  return { ok: true, path: configPath, bak: configBakPath };
}

// IPC：读取配置
ipcMain.handle('config:load', async () => {
  return await loadConfig();
});

// IPC：保存配置
ipcMain.handle('config:save', async (_event, newConfig) => {
  try {
    // 合并：保留已有配置，新字段覆盖
    const current = await loadConfig();
    const merged = { ...current, ...newConfig };
    const result = await saveConfig(merged);
    return result;
  } catch (e) {
    console.error('保存配置失败：', e);
    return { ok: false, error: e?.message || '未知错误' };
  }
});
// 单实例锁，防止多开
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 第二个实例启动时，把已有窗口提到前台
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].focus();
    }
  });
}

// activate 事件：从 Dock 或 Spotlight 启动（macOS 典型场景）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
// 创建子进程
function createWorkerProcess(){
  const worker = new Worker(path.join(__dirname, '../public/mainWorker.js'));
  worker.postMessage({type: 'start'});
  worker.on('message', (event) => {
    console.log('子进程返回数据===', event);
  });
}
// 同步读取临时目录
function readTmpDirSync() {
  const dir = path.join(__dirname, '../dist');
  // dist 被 .gitignore 忽略，新克隆的仓库里可能不存在
  if (!fsSync.existsSync(dir)) {
    console.warn('目录不存在，跳过读取：', dir);
    return [];
  }
  const files = fsSync.readdirSync(dir, { withFileTypes: true });
  files.forEach((item) => {
    console.log(item)
  });
  return files;
}
app.whenReady().then(() => {
  createWindow();
  createDatabase();
  createChildProcess();
  controlMenu();
  createWorkerProcess();
  readTmpDirSync();
  const mem = process.memoryUsage()
  console.log({
    rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`
  })
  ipcMain.on('getRenderProcess', (event, memory)=>{
    console.log(memory)
  })
});

// 窗口关闭功能
app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

// 应用退出功能，例如右键退出应用
app.on('before-quit', (e) => {
  cleanup();
});
