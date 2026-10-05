export function parseStaticServerOptions(args) {
  let port = 3500;
  let portSeen = false;
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg !== '--port' && !arg.startsWith('--port=')) throw new Error(`不支持的参数：${arg}。使用 --help 查看启动方法。`);
    if (portSeen) throw new Error('--port 只能指定一次。');
    portSeen = true;
    const value = arg === '--port' ? args[++index] : arg.slice('--port='.length);
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) {
      throw new Error('--port 须为1～65535的整数，例如 --port 3501。');
    }
    port = Number(value);
  }
  return { port, help };
}

export const STATIC_SERVER_HELP = '用法：npm start [-- --port <1～65535>]\n默认端口3500，仅监听127.0.0.1。缺少静态产物时退出，请先执行 npm run build；端口占用时退出，不停止已有进程。';
