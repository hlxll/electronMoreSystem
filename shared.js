// SharedWorker 脚本：所有同源页面共享这一个实例
const connections = new Set();

self.onconnect = function (event) {
  const port = event.ports[0];
  connections.add(port);
  console.log('[worker] 新页面连接，当前连接数:', connections.size);

  // 通知所有页面（包括新连上来的）当前连接数
  broadcast({ type: 'system', text: `新页面加入，当前连接数 ${connections.size}` });

  port.onmessage = function (event) {
    const data = event.data;
    console.log('[worker] 收到页面消息:', data);
    // 广播给所有页面（包括发送者自己）
    broadcast({ type: 'message', from: data.pageId, text: data.text });
  };

  port.onmessageerror = function (err) {
    console.error('[worker] 消息反序列化失败:', err);
  };

  port.start();
};

function broadcast(payload) {
  connections.forEach((port) => {
    port.postMessage(payload);
  });
}
