const { platform, versions } = window.desktop;

document.querySelector('#platform').textContent = platform;
document.querySelector('#versions').textContent =
  `Electron ${versions.electron} · Chromium ${versions.chrome} · Node.js ${versions.node}`;

// ---------- 原有功能 ----------

document.getElementById('selectBut').addEventListener('click', async () => {
  const dbData = await window.desktop.selectDB();
  document.getElementById('dataId').textContent = JSON.stringify(dbData);
});

document.getElementById('renderProcess').addEventListener('click', async () => {
  await window.desktop.getRenderProcess();
});

// ---------- Web Worker 通信 ----------

// 创建 Worker：用 import.meta.url 做相对路径解析（需配合 index.html 中 <script type="module">）
const workerUrl = new URL('../public/worker.js', import.meta.url);
const worker = new Worker(workerUrl);

// 请求计数器（用于 request-response 匹配）
let reqId = 0;

// Worker 主动推的消息（非请求-响应）
worker.addEventListener('message', (e) => {
  const { id, type, payload, error } = e.data || {};
  // 有 id 说明是对某个请求的回复，交给 Promise 处理
  if (id != null) return handleWorkerReply(id, type, payload, error);
  // 否则是 Worker 主动推送
  if (type === 'ready') {
    console.log('[Worker]', payload?.worker);
    appendLog('Worker 已就绪');
  }
});

worker.addEventListener('error', (e) => {
  appendLog('Worker 错误: ' + e.message);
});

/**
 * 发送请求到 Worker，返回 Promise
 * @param {string} type  消息类型
 * @param {any}    payload 数据
 * @param {(payload: any) => void} [onProgress] 进度回调
 */
function workerRequest(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, payload });
  });
}

const pending = new Map();

function handleWorkerReply(id, type, payload, error) {
  const p = pending.get(id);
  if (!p) return;

  if (type === 'progress') {
    p.onProgress?.(payload);
    return; // 还没完，不清理
  }

  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve({ type, payload });
}

// ---------- UI 绑定 ----------

const logEl = document.getElementById('workerLog');
function appendLog(msg) {
  const div = document.createElement('div');
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

// Ping
document.getElementById('workerPing').addEventListener('click', async () => {
  try {
    const start = performance.now();
    const { payload } = await workerRequest('ping');
    appendLog(`ping ✓ 往返 ${(performance.now() - start).toFixed(1)}ms, worker time=${payload.time}`);
  } catch (e) { appendLog('ping ✗ ' + e.message); }
});

// Echo
document.getElementById('workerEcho').addEventListener('click', async () => {
  const input = 'Hello Worker ' + Date.now();
  const { payload } = await workerRequest('echo', input);
  appendLog(`echo ✓ ${payload}`);
});

// Sum（同步）
document.getElementById('workerSum').addEventListener('click', async () => {
  const arr = Array.from({ length: 10000 }, (_, i) => i + 1);
  const { payload } = await workerRequest('sum', arr);
  appendLog(`sum(1..10000) = ${payload}`);
});

// Sum 带进度
document.getElementById('workerSumProgress').addEventListener('click', async () => {
  const arr = Array.from({ length: 1000000 }, (_, i) => i + 1);
  try {
    const { payload } = await workerRequest(
      'sum-progress',
      arr,
      (p) => appendLog(`进度 ${p.processed}/${p.total}  partial=${p.partial}`)
    );
    appendLog(`sum-progress ✓ 结果 = ${payload}`);
  } catch (e) { appendLog('sum-progress ✗ ' + e.message); }
});

// Fibonacci（重 CPU）
document.getElementById('workerFib').addEventListener('click', async () => {
  const n = 10000;
  const start = performance.now();
  try {
    const { payload } = await workerRequest('fib', n);
    appendLog(`fib(${n}) ✓ 耗时 ${(performance.now() - start).toFixed(1)}ms, 长度=${payload.result.length}`);
  } catch (e) { appendLog('fib ✗ ' + e.message); }
});

// Delay（异步模拟）
document.getElementById('workerDelay').addEventListener('click', async () => {
  const start = performance.now();
  const { payload } = await workerRequest('delay', 500);
  appendLog(`delay ✓ 等了 ${payload.waited}ms, 实际耗时 ${(performance.now() - start).toFixed(1)}ms`);
});

// 关闭 Worker
document.getElementById('workerTerminate').addEventListener('click', () => {
  worker.terminate();
  appendLog('Worker 已终止');
});

// ---------- 应用更新 ----------

const updateStatusEl = document.getElementById('updateStatus');
const updateCheckBtn = document.getElementById('updateCheckBtn');
const updateDownloadBtn = document.getElementById('updateDownloadBtn');
const updateInstallBtn = document.getElementById('updateInstallBtn');

const UPDATE_TEXT = {
  idle: () => '尚未检查更新',
  checking: () => '正在检查更新…',
  available: (s) => `发现新版本 ${s.version}，可点击下载`,
  'not-available': (s) => `已是最新版本${s.version ? `（远端 ${s.version}）` : ''}`,
  downloading: (s) => `正在下载… ${s.percent}%`,
  downloaded: (s) => `新版本 ${s.version} 已下载，重启后完成安装`,
  dev: () => '开发环境（未打包）不支持自动更新',
  error: (s) => `检查更新失败：${s.message}`,
};

function renderUpdateStatus(status) {
  if (!status) return;
  const state = status.state ?? 'idle';
  const describe = UPDATE_TEXT[state];
  updateStatusEl.textContent = describe ? describe(status) : state;

  updateCheckBtn.disabled = state === 'checking' || state === 'downloading';
  updateDownloadBtn.disabled = state !== 'available';
  updateInstallBtn.disabled = state !== 'downloaded';
}

updateCheckBtn.addEventListener('click', async () => {
  const result = await window.desktop.checkUpdate();
  // 成功时状态由 update:status 事件推送，失败/开发环境时直接用返回值渲染
  if (!result?.ok) renderUpdateStatus(result);
});

updateDownloadBtn.addEventListener('click', async () => {
  updateDownloadBtn.disabled = true;
  const result = await window.desktop.downloadUpdate();
  if (!result?.ok) renderUpdateStatus(result);
});

updateInstallBtn.addEventListener('click', async () => {
  updateInstallBtn.disabled = true;
  const result = await window.desktop.installUpdate({ silent: false, forceRunAfter: true });
  if (!result?.ok) renderUpdateStatus(result);
});

window.desktop.onUpdateStatus(renderUpdateStatus);
window.desktop.getUpdateStatus().then(renderUpdateStatus);

// ---------- 前端热更新（测试用） ----------

const HOT_UPDATE_SERVER = 'http://127.0.0.1:3001';
const HOT_UPDATE_FILES = ['index.html', 'renderer.js', 'styles.css'];

const hotUpdateResult = document.getElementById('hotUpdateResult');
const hotUpdateApplyBtn = document.getElementById('hotUpdateApplyBtn');
const hotUpdateClearBtn = document.getElementById('hotUpdateClearBtn');

function setHotResult(msg, isError = false) {
  hotUpdateResult.textContent = msg;
  hotUpdateResult.style.color = isError ? '#c00' : '#060';
}

hotUpdateApplyBtn.addEventListener('click', async () => {
  hotUpdateApplyBtn.disabled = true;
  try {
    setHotResult(`[热更] 正在从 ${HOT_UPDATE_SERVER} 下载…`);
    const results = [];

    for (const file of HOT_UPDATE_FILES) {
      const url = `${HOT_UPDATE_SERVER}/${file}`;
      let resp;
      try {
        resp = await fetch(url);
      } catch (e) {
        throw new Error(`无法连接 ${HOT_UPDATE_SERVER}，请确认 npm run update-server 已启动`);
      }
      if (!resp.ok) throw new Error(`${file} 下载失败：HTTP ${resp.status}`);
      const content = await resp.text();
      const writeRes = await window.desktop.writeHotPatch(file, content);
      if (!writeRes.ok) throw new Error(`${file} 写入失败：${writeRes.error}`);
      results.push(`  ✓ ${file} (${content.length}B) → ${writeRes.path}`);
    }

    setHotResult(`[热更] 补丁写入成功：\n${results.join('\n')}\n\n即将刷新页面以加载补丁…`);
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    setHotResult(`[热更] 失败：${e.message}`, true);
  } finally {
    hotUpdateApplyBtn.disabled = false;
  }
});

hotUpdateClearBtn.addEventListener('click', async () => {
  hotUpdateClearBtn.disabled = true;
  try {
    setHotResult('[热更] 正在清除补丁…');
    const res = await window.desktop.clearHotPatch();
    if (!res.ok) throw new Error(res.error);
    setHotResult('[热更] 补丁已清除，即将刷新页面恢复原始入口…');
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    setHotResult(`[热更] 清除失败：${e.message}`, true);
  } finally {
    hotUpdateClearBtn.disabled = false;
  }
});

// ---------- 配置读写 ----------

const configResult = document.getElementById('configResult');

// 读取配置
document.getElementById('configLoadBtn').addEventListener('click', async () => {
  try {
    const config = await window.desktop.loadConfig();
    document.getElementById('configInput').value = JSON.stringify(config);
    configResult.textContent = '读取成功：\n' + JSON.stringify(config, null, 2);
  } catch (e) {
    configResult.textContent = '读取失败：' + e.message;
  }
});

// 保存配置
document.getElementById('configSaveBtn').addEventListener('click', async () => {
  const raw = document.getElementById('configInput').value.trim();
  try {
    const newConfig = JSON.parse(raw); // 先校验 JSON
    const result = await window.desktop.saveConfig(newConfig);
    if (result.ok) {
      configResult.textContent =
        '保存成功\n' +
        `路径: ${result.path}\n` +
        `备份: ${result.bak}`;
    } else {
      configResult.textContent = '保存失败：' + (result.error || '未知错误');
    }
  } catch (e) {
    configResult.textContent = '保存失败：' + e.message;
  }
});
