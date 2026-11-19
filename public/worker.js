/**
 * 基础通信 Web Worker
 * 用法见 src/renderer.js
 *
 * 消息协议（统一格式，便于扩展）：
 *   { id: number, type: string, payload: any }
 *
 * Worker 回复：
 *   { id: number, type: string, payload: any, error?: string }
 */

// ---------- 工具函数 ----------

function reply(id, type, payload) {
  self.postMessage({ id, type, payload });
}

function replyError(id, type, error) {
  self.postMessage({ id, type, payload: null, error: String(error?.message || error) });
}

// ---------- 消息处理 ----------

self.onmessage = function (e) {
  const { id, type, payload } = e.data || {};

  switch (type) {
    // 1. Ping - 测试连通性
    case 'ping':
      reply(id, 'pong', { time: Date.now() });
      break;

    // 2. Echo - 原样返回
    case 'echo':
      reply(id, 'echo', payload);
      break;

    // 3. 求和 - 同步计算
    case 'sum': {
      try {
        const arr = Array.isArray(payload) ? payload : [];
        const result = arr.reduce((a, b) => a + Number(b), 0);
        reply(id, 'sum', result);
      } catch (err) {
        replyError(id, 'sum', err);
      }
      break;
    }

    // 4. 带进度的求和 - 分块计算 + 中间进度
    case 'sum-progress': {
      try {
        const arr = Array.isArray(payload) ? payload : [];
        const chunkSize = 1000;
        let total = 0;
        let i = 0;

        function next() {
          const end = Math.min(i + chunkSize, arr.length);
          for (; i < end; i++) total += Number(arr[i]);

          // 发送进度
          self.postMessage({
            id,
            type: 'progress',
            payload: { processed: i, total: arr.length, partial: total },
          });

          if (i < arr.length) {
            // 让出事件循环，保持 UI 流畅
            setTimeout(next, 0);
          } else {
            reply(id, 'sum-progress', total);
          }
        }
        next();
      } catch (err) {
        replyError(id, 'sum-progress', err);
      }
      break;
    }

    // 5. Fibonacci - 演示重 CPU 任务不阻塞主线程
    case 'fib': {
      try {
        const n = Number(payload) || 0;
        if (n < 0 || n > 100000) throw new RangeError('n 范围 0~100000');

        // 快速倍增法 O(log n)
        function fastDouble(n) {
          if (n === 0) return [0n, 1n];
          const [a, b] = fastDouble(n >> 1);
          const c = a * ((b << 1n) - a);
          const d = a * a + b * b;
          return (n & 1) === 0 ? [c, d] : [d, c + d];
        }
        const result = fastDouble(n)[0].toString();
        reply(id, 'fib', { n, result });
      } catch (err) {
        replyError(id, 'fib', err);
      }
      break;
    }

    // 6. 延迟任务 - 模拟异步耗时操作
    case 'delay': {
      const ms = Number(payload) || 0;
      setTimeout(() => reply(id, 'delay', { waited: ms }), ms);
      break;
    }

    default:
      replyError(id, type, `未知消息类型: ${type}`);
  }
};

// 主动向主线程发一条启动消息（非请求-响应模式）
self.postMessage({ type: 'ready', payload: { worker: '基础通信 Worker 已启动' } });
