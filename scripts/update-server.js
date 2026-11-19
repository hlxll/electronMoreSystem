/**
 * 本地更新服务器（electron-updater generic provider）
 *
 * 启动：
 *   npm run update-server
 *   node scripts/update-server.js --dir dist --port 3001 --host 127.0.0.1
 *
 * 应用侧需要在打包后的应用里指定更新源（开发模式 app.isPackaged 为 false，不会真正检查）：
 *   $env:UPDATE_FEED_URL="http://127.0.0.1:3001"
 *   .\dist\win-unpacked\MyApp.exe
 *
 * 路由：
 *   GET /latest.yml            → 更新元数据
 *   GET /<安装包>               → 安装包，支持单段 Range（差分/断点下载需要）
 *   GET /<安装包>.blockmap      → 块索引
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.zip': 'application/zip',
  '.dmg': 'application/octet-stream',
  '.pkg': 'application/octet-stream',
};

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const rootDir = path.resolve(readArg('--dir', null) || path.join(__dirname, '..', 'dist'));
const host = readArg('--host', '127.0.0.1');
const port = Number(readArg('--port', process.env.PORT || 3001));

/**
 * 把 URL 路径映射到磁盘文件。
 * electron-builder 生成的 latest.yml 里 url 会把空格替换成 "-"，而 dist 里的文件名是带空格的，
 * 所以依次尝试原名、减号换空格、空格换减号。
 */
function resolveFile(rawUrl) {
  const urlPath = decodeURIComponent(String(rawUrl || '').split('?')[0]);
  const name = urlPath.replace(/^\/+/, '');
  if (!name || name.includes('\0')) return null;

  const candidates = [name, name.replace(/-/g, ' '), name.replace(/ /g, '-')];
  for (const candidate of candidates) {
    const full = path.resolve(rootDir, candidate);
    // 防目录穿越
    if (!full.startsWith(rootDir + path.sep)) continue;
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {
      // 不存在，继续尝试下一个候选名
    }
  }
  return null;
}

function sendFile(req, res, filePath) {
  const { size } = fs.statSync(filePath);
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }

  const start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }

  res.writeHead(206, {
    'Content-Type': type,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  // 根路径列出可用文件，方便确认服务正常
  if (req.url === '/' || req.url === '') {
    const files = fs.readdirSync(rootDir, { withFileTypes: true })
      .filter((item) => item.isFile())
      .map((item) => `${item.name}\t${fs.statSync(path.join(rootDir, item.name)).size} bytes`);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    console.log(`GET / 200 列出 ${files.length} 个文件`);
    return res.end(files.join('\n') + '\n');
  }

  const filePath = resolveFile(req.url);
  if (!filePath) {
    console.warn(`${req.method} ${req.url} 404 未找到（目录：${rootDir}）`);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`Not Found: ${req.url}\n`);
  }

  const range = req.headers.range ? ` range=${req.headers.range}` : '';
  console.log(`${req.method} ${req.url} 200 ${path.basename(filePath)}${range}`);
  sendFile(req, res, filePath);
});

server.listen(port, host, () => {
  const feedUrl = `http://${host}:${port}`;
  console.log('本地更新服务器已启动');
  console.log(`  更新源: ${feedUrl}`);
  console.log(`  目录:   ${rootDir}`);
  console.log(`  示例:   $env:UPDATE_FEED_URL="${feedUrl}"; .\\dist\\win-unpacked\\MyApp.exe`);

  const meta = path.join(rootDir, 'latest.yml');
  if (!fs.existsSync(meta)) {
    console.warn(`  警告: ${meta} 不存在，electron-updater 无法检查更新`);
  } else {
    const info = fs.readFileSync(meta, 'utf8');
    const version = /^version:\s*(.+)$/m.exec(info)?.[1];
    console.log(`  latest.yml 版本: ${version ?? '未知'}`);
  }
});
