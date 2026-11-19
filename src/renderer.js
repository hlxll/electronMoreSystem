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
