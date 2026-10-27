/**
 * 应用入口：同一个可执行文件既是桌宠，也是开机自启的守望进程（带 --watcher 参数时）。
 * 打包成 exe 后没法像开发时那样直接让 Electron 跑 watcher.js，所以在这里分流。
 * @module claude-pet/src/main/index
 */
if (process.argv.includes('--watcher')) await import('./watcher.js');
else await import('./main.js');
