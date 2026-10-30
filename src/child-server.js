const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
});

rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  console.error('子进程收到数据====', text);
  process.stdout.write('xulinlin\n');
})
process.stdin.resume();