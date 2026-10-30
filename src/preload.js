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
  }
});
