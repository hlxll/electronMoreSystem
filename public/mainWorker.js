const { parentPort } = require("node:worker_threads");

parentPort.on('message', (msg) => {
  console.log('子进程收到消息:', msg);
});
parentPort.postMessage("发送消息");
