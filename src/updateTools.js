/**
 * 更新工具：基于 electron-updater 实现安装包检查 / 下载 / 安装
 *
 * 依赖打包时 electron-builder 生成的 app-update.yml（当前为 github provider），
 * 也可以在 setup() 里传 feedUrl 改用 generic 静态服务器。
 *
 * 注意：
 * 1. 只有打包后的应用（app.isPackaged === true）才能真正更新，开发环境直接返回提示。
 * 2. macOS 的自动更新依赖 zip 产物，且应用需要签名，否则 quitAndInstall 会失败。
 * 3. 更新源必须比当前安装包版本号更高才会被判定为 update-available。
 */
const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

let targetWindow = null;
let initialized = false;
let lastStatus = { state: 'idle' };

/** 当前是否处于可更新状态（已打包） */
function isUpdatable() {
  return app.isPackaged;
}

/** 把状态推给渲染进程，同时缓存一份供 update:status 主动查询 */
function report(status) {
  lastStatus = { ...status, at: Date.now() };
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send('update:status', lastStatus);
  }
}

const DEV_HINT = '开发环境（未打包）不支持自动更新，请先执行 npm run build:mac 打包后再测试';

/**
 * 初始化更新模块，只生效一次
 * @param {object} [options]
 * @param {import('electron').BrowserWindow} [options.window] 用于接收状态推送的窗口
 * @param {string} [options.feedUrl] 自定义更新源（generic provider），不传则用 app-update.yml
 * @param {boolean} [options.autoDownload] 发现新版本后是否自动下载，默认 false
 * @param {object} [options.logger] 日志对象，默认 console
 */
let writeLog = fs.createWriteStream(app.isPackaged ? path.join(process.resourcesPath, 'public/app.log') : path.join(__dirname, '../public/app.log'), { flags: 'a' });
function setup(options = {}) {
  const { window, feedUrl, autoDownload = false, logger = console } = options;
  if (window) targetWindow = window;
  if (initialized) return;
  initialized = true;

  autoUpdater.logger = logger;
  autoUpdater.autoDownload = autoDownload;
  // 下载完成后，用户下次退出应用时自动安装
  autoUpdater.autoInstallOnAppQuit = true;

  if (feedUrl) {
    // 自建/本地更新源统一用 generic provider；本地服务只支持单段 Range，
    // 关掉多段 Range 让差分下载退化为逐个分段请求
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl, useMultipleRangeRequest: false });
  }

  autoUpdater.on('checking-for-update', () => report({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => report({ state: 'available', version: info?.version }));
  autoUpdater.on('update-not-available', (info) => report({ state: 'not-available', version: info?.version }));
  autoUpdater.on('download-progress', (progress) => {
    report({
      state: 'downloading',
      percent: Number(progress.percent.toFixed(2)),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });
  autoUpdater.on('update-downloaded', (info) => report({ state: 'downloaded', version: info?.version }));
  autoUpdater.on('error', (error) => report({ state: 'error', message: error?.message || String(error) }));

  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:download', () => downloadUpdate());
  ipcMain.handle('update:install', (_event, options) => installUpdate(options));
  ipcMain.handle('update:status', () => lastStatus);
}

/** 检查是否有新版本 */
async function checkForUpdates() {
  writeLog.write('checkForUpdates\n');
  if (!isUpdatable()) {
    writeLog.write('dev环境\n');
    report({ state: 'dev', message: DEV_HINT });
    return { ok: false, state: 'dev', message: DEV_HINT };
  }
  try {
    writeLog.write('检查更新新版本\n');
    // 检查更新新版本
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version ?? null };
  } catch (error) {
    writeLog.write('检查更新新版本失败\n');
    writeLog.write(error?.message || String(error));
    const message = error?.message || String(error);
    report({ state: 'error', message });
    return { ok: false, state: 'error', message };
  }
}

/** 下载已经检测到的新版本 */
async function downloadUpdate() {
  if (!isUpdatable()) {
    return { ok: false, state: 'dev', message: DEV_HINT };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    const message = error?.message || String(error);
    report({ state: 'error', message });
    return { ok: false, state: 'error', message };
  }
}

/**
 * 退出应用并安装已下载的更新
 * @param {object} [options]
 * @param {boolean} [options.silent] 是否静默安装，默认 false
 * @param {boolean} [options.forceRunAfter] 安装后是否自动重启，默认 true
 */
function installUpdate(options = {}) {
  if (!isUpdatable()) {
    return { ok: false, state: 'dev', message: DEV_HINT };
  }
  const { silent = false, forceRunAfter = true } = options;
  // 放到下一个事件循环，避免当前 IPC 响应被打断
  setImmediate(() => autoUpdater.quitAndInstall(silent, forceRunAfter));
  return { ok: true };
}

module.exports = {
  setup,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isUpdatable,
  getLastStatus: () => lastStatus,
};
