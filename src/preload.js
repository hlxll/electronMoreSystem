const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  selectDB: async () => await ipcRenderer.invoke('notes:list'),
  getRenderProcess: async () => {
    const data =  await process.getProcessMemoryInfo();
    ipcRenderer.send('getRenderProcess', data.private)
  },
  loadConfig: async () => await ipcRenderer.invoke('config:load'),
  saveConfig: async (newConfig) => await ipcRenderer.invoke('config:save', newConfig),
  // 更新：检查 / 下载 / 安装
  checkUpdate: async () => await ipcRenderer.invoke('update:check'),
  downloadUpdate: async () => await ipcRenderer.invoke('update:download'),
  installUpdate: async (options) => await ipcRenderer.invoke('update:install', options),
  getUpdateStatus: async () => await ipcRenderer.invoke('update:status'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  // 热更新补丁：写入 / 清理
  // 注意：补丁写完后需 mainWindow.reload() 或重启才生效
  writeHotPatch: (relativePath, content, sha512) =>
    ipcRenderer.invoke('hotupdate:write-patch', relativePath, content, sha512 ? { sha512 } : {}),
  clearHotPatch: () => ipcRenderer.invoke('hotupdate:clear-patch'),
});
