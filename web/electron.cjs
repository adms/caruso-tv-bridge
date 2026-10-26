// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
const { app, BrowserWindow, Menu, shell, dialog, ipcMain, globalShortcut, net } = require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const runFile=promisify(execFile);
let controller, window, knob, discovery, mediaObserver;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    try {
      app.setAboutPanelOptions({applicationName:'Caruso Remote',copyright:'Copyright (c) 2026 Adms Chung',website:'https://github.com/adms/caruso-tv-bridge'});
      const configFile=path.join(app.getPath('userData'),'devices.json');
      let config={};try{config=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch{}
      const host=process.env.CARUSO_HOST || config.host;
      if(!host)throw Error('請先設定 Caruso 裝置位址。');
      const {TvMessages}=await import('./tv-messages.mjs');
      const persistConfig=value=>{fs.mkdirSync(path.dirname(configFile),{recursive:true});const temporary=configFile+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});fs.chmodSync(temporary,0o600);fs.renameSync(temporary,configFile);};
      const messages=new TvMessages(config,persistConfig);
      let music;
      const musicAction=input=>{if(activityBusy)throw Error('Apple TV 操作進行中，請稍候');if(!music)throw Error('音樂服務啟動中');return music.handle(input);};
      const { LyricsService } = await import('./lyrics.mjs');
      const lyrics=new LyricsService({fetchImpl:(url,options)=>net.fetch(url,options),cacheFile:path.join(app.getPath('userData'),'lyrics-cache.json')});
      const { startServer } = await import('./server.mjs');
      try { controller = await startServer({ host, port: 43186, messages, music:musicAction, lyrics }); }
      catch (error) { if (error.code !== 'EADDRINUSE') throw error; controller = await startServer({ host, port: 0, messages, music:musicAction, lyrics }); }
      const {LanDiscovery}=await import('./discovery.mjs');
      discovery=new LanDiscovery(controller.caruso,config,persistConfig,{nativeModule:app.isPackaged?path.join(process.resourcesPath,'caruso-network.node'):path.join(__dirname,'native/caruso-network.node')});
      ipcMain.on('discover-devices',()=>discovery.scan());
      const {KnobMute}=await import('./knob-mute.mjs');
      const {Knob}=await import('./knob.mjs');
      const nativeModule=app.isPackaged?path.join(process.resourcesPath,'caruso-hid.node'):path.join(__dirname,'native/caruso-hid.node');
      const muteFile=path.join(app.getPath('userData'),'knob-mute.json');let savedMute=null;try{savedMute=JSON.parse(fs.readFileSync(muteFile,'utf8'));}catch{}
      const mute=new KnobMute(controller.caruso,{saved:savedMute,persist:value=>{const tmp=muteFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,muteFile);}});
      knob=new Knob(controller.caruso,mute,{nativeModule,...config.knob});knob.start();
      ipcMain.on('request-knob-access',()=>knob.requestPermission());
      ipcMain.on('reconnect-knob',()=>knob.restart());
      ipcMain.on('restart-app',()=>{app.relaunch();app.quit();});
      ipcMain.on('open-network-settings',()=>shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork'));
      ipcMain.on('open-input-settings',()=>shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'));
      let activityBusy=false,shortcutRegistered=false;
      const activityConfigured=Boolean(config.appleTV?.python && config.appleTV?.configFile);
      const activityStatus=()=>({configured:activityConfigured,shortcutRegistered,busy:activityBusy,profile:config.appleTV?.profileName||'上次使用者'});
      const runActivity=async()=>{
        if(!activityConfigured)return {ok:false,message:'Apple TV 尚未設定'};
        if(activityBusy||music?.busy)return {ok:false,message:'Apple TV 操作進行中，請稍候'};
        activityBusy=true;window?.webContents.send('activity-state',activityStatus());
        try{
          if(music?.active)await music.close();
          const helper=app.isPackaged?path.join(process.resourcesPath,'apple_tv_activity.py'):path.join(__dirname,'../scripts/apple_tv_activity.py');
          const {stdout}=await runFile(config.appleTV.python,[helper,'watch-community','--config',config.appleTV.configFile],{timeout:175000,maxBuffer:16384,env:{...process.env,PYTHONUNBUFFERED:'1'}});
          const result=JSON.parse(stdout.trim());
          return {ok:result.playbackConfirmed===true,message:result.message||'無法確認播放狀態，已停止操作。',playbackConfirmed:result.playbackConfirmed===true};
        }catch{return {ok:false,message:'Apple TV 畫面驗證或影集啟動未完成，已停止操作；沒有自動重送。'};}
        finally{activityBusy=false;window?.webContents.send('activity-state',activityStatus());}
      };
      const ownPage=event=>{try{return event.sender===window?.webContents && new URL(event.senderFrame.url).origin===controller.url;}catch{return false;}};
      const {MusicControl}=await import('./music.mjs');
      music=new MusicControl(controller.caruso,config,persistConfig,{remoteScript:app.isPackaged?path.join(process.resourcesPath,'apple_tv_music_remote.py'):path.join(__dirname,'../scripts/apple_tv_music_remote.py'),screenScript:app.isPackaged?path.join(process.resourcesPath,'apple_tv_music_screen.py'):path.join(__dirname,'../scripts/apple_tv_music_screen.py'),preview:app.isPackaged?path.join(process.resourcesPath,'caruso-tv-image'):path.join(__dirname,'native/caruso-tv-image'),directory:app.getPath('userData')});
      controller.caruso.setExternalTransport({available:activityConfigured,device:'Apple TV'});
      if(activityConfigured){const {NowPlaying}=await import('./now-playing.mjs');mediaObserver=new NowPlaying({python:config.appleTV.python,config:config.appleTV.configFile,script:app.isPackaged?path.join(process.resourcesPath,'apple_tv_now_playing.py'):path.join(__dirname,'../scripts/apple_tv_now_playing.py'),onUpdate:metadata=>controller.caruso.setExternalTransport({available:true,device:'Apple TV',metadata})});mediaObserver.start();}
      app.on('before-quit',()=>{music?.close().catch(()=>{});});
      ipcMain.handle('music-action',async(event,input)=>{if(!ownPage(event))return {ok:false,message:'無效的操作來源'};try{return await musicAction(input);}catch(error){return {ok:false,message:error.message};}});
      ipcMain.handle('activity-status',event=>ownPage(event)?activityStatus():{configured:false});
      ipcMain.handle('watch-community',event=>ownPage(event)?runActivity():{ok:false,message:'無效的操作來源'});
      if(activityConfigured)shortcutRegistered=globalShortcut.register('Control+Alt+Command+N',async()=>{const result=await runActivity();window?.webContents.send('activity-result',result);});
      console.log('Caruso Remote: ' + controller.url);
      let discoveryStarted=false;
      const create = () => {
        window = new BrowserWindow({ width: 1040, height: 760, minWidth: 800, minHeight: 680, title: 'Caruso Remote', backgroundColor: '#111311', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload:path.join(__dirname,'preload.cjs') } });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (e, url) => { if (new URL(url).origin !== controller.url) e.preventDefault(); });
        window.webContents.once('did-finish-load',()=>{if(!discoveryStarted){discoveryStarted=true;discovery.start();}});
        window.on('closed', () => { window = null; }); window.loadURL(controller.url);
      };
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: '在瀏覽器開啟', click: () => shell.openExternal(controller.url) }, { type: 'separator' }, { role: 'quit' }] },
        {label:'Apple TV',submenu:[{label:'續播《廢柴聯盟》',enabled:activityConfigured,click:async()=>{const result=await runActivity();window?.webContents.send('activity-result',result);}}]},
        { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
      ]));
      create(); app.on('activate', () => { if (!window) create(); });
    } catch (e) { dialog.showErrorBox('Caruso Remote', e.message); app.quit(); }
  });
  app.on('window-all-closed', () => app.quit()); app.on('before-quit', () => { globalShortcut.unregisterAll();mediaObserver?.stop();discovery?.stop();knob?.stop();controller?.close(); });
}
