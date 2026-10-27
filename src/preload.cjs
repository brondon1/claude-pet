/**
 * 预加载：只向渲染端暴露有限的 IPC 通道。
 */
const { contextBridge, ipcRenderer } = require('electron');

const IN = ['init', 'play', 'bubble', 'squash', 'chat-open'];

contextBridge.exposeInMainWorld('pet', {
  on: (ch, fn) => IN.includes(ch) && ipcRenderer.on(ch, (_e, p) => fn(p)),
  hitArea: (info) => ipcRenderer.send('hit-area', info),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragEnd: () => ipcRenderer.send('drag-end'),
  click: (info) => ipcRenderer.send('click', info),
  contextMenu: () => ipcRenderer.send('context-menu'),
  chat: (text) => ipcRenderer.invoke('chat', text),
  chatClosed: () => ipcRenderer.send('chat-closed'),
  videoMeta: (meta) => ipcRenderer.send('video-meta', meta),
  bubbleAction: (id) => ipcRenderer.send('bubble-action', id),
  rename: (name) => ipcRenderer.send('rename', name),
});
