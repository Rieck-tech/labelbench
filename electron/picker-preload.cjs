// Gives the printer picker window exactly three things, and no Node.js access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
    onChoices: (handler) => ipcRenderer.on('picker:choices', (_event, choices) => handler(choices)),
    choose: (id) => ipcRenderer.send('picker:choose', String(id)),
    cancel: () => ipcRenderer.send('picker:cancel'),
});
