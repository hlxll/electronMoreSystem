const { platform, versions } = window.desktop;

document.querySelector('#platform').textContent = platform;
document.querySelector('#versions').textContent =
  `Electron ${versions.electron} · Chromium ${versions.chrome} · Node.js ${versions.node}`;

  document.getElementById('selectBut').addEventListener('click', async () => {
    const dbData = await window.desktop.selectDB();
    document.getElementById('dataId').textContent = JSON.stringify(dbData);
  });
document.getElementById('renderProcess').addEventListener('click', async ()=>{
  await window.desktop.getRenderProcess()
})