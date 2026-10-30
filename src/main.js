const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const readline = require('node:readline');
const Database = require('better-sqlite3');
const { spawn } = require('node:child_process');
let db;
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
  const child = spawn('node', [path.join(__dirname, 'child-server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const rl = readline.createInterface({
    input: child.stdout,
  });
  rl.on('line', (line)=>{
    const text = line.trim();
    if (!text) return;
    console.log('读取进程数据===', text);
  });
  child.on('error', (error) => {
    console.error('启动子进程失败：', error);
  });
  child.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`子进程退出：code=${code}, signal=${signal}`);
    }
  });
  child.stdin.write('huanglin\n');
}
ipcMain.handle('notes:list', () => {
  return db.prepare('SELECT * FROM users').all();
});
app.whenReady().then(() => {
  createWindow();
  createDatabase();
  createChildProcess();
  const mem = process.memoryUsage()
  console.log({
    rss: `${(mem.rss / 1024 / 1024).toFixed(2)} MB`,       // 进程占用的物理内存
    heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`, // V8 堆总量
    heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,   // V8 堆已用量
    external: `${(mem.external / 1024 / 1024).toFixed(2)} MB`    // C++ 绑定对象内存
  })
  ipcMain.on('getRenderProcess', (event, memory)=>{
    console.log(memory)
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
