// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
let controller, window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    try {
      app.setAboutPanelOptions({applicationName:'Caruso Remote',copyright:'Copyright (c) 2026 Adms Chung',website:'https://github.com/adms/caruso-tv-bridge'});
      const { startServer } = await import('./server.mjs');
      try { controller = await startServer({ port: 43186 }); }
      catch (error) { if (error.code !== 'EADDRINUSE') throw error; controller = await startServer({ port: 0 }); }
      console.log('Caruso Remote: ' + controller.url);
      const create = () => {
        window = new BrowserWindow({ width: 1080, height: 900, minWidth: 410, minHeight: 650, title: 'Caruso Remote', backgroundColor: '#111311', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (e, url) => { if (new URL(url).origin !== controller.url) e.preventDefault(); });
        window.on('closed', () => { window = null; }); window.loadURL(controller.url);
      };
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: '在瀏覽器開啟', click: () => shell.openExternal(controller.url) }, { type: 'separator' }, { role: 'quit' }] },
        { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
      ]));
      create(); app.on('activate', () => { if (!window) create(); });
    } catch (e) { dialog.showErrorBox('Caruso Remote', e.message); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit()); app.on('before-quit', () => { controller?.close(); });
}
