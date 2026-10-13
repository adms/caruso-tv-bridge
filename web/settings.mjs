// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
// Inventory from T+A Caruso UM_Caruso_220_DE_EN, Audio menu, pages 61–62.
// These labels do NOT imply a device read. No settings message IDs are guessed.
export const FIELDS = [
 ['balance','左右平衡','Balance'],['loudness','等響補償','Loudness'],['toneControl','音調控制','Tone control'],
 ['treble','高音','Treble'],['midrange','中音','Midrange'],['bass','低音','Bass'],
 ['contourPresence','人聲輪廓','Contour Presence'],['contourFundamental','基音輪廓','Contour Fundamental'],
 ['subwoofer','超低音輸出','Subwoofer'],['subwooferCrossover','超低音分頻','Subwoofer Crossover'],
 ['subwooferLevel','超低音音量','Subwoofer level'],['maximumVolume','最大音量','Max. volume level'],
 ['speakers','內建喇叭','Speaker'],['analogOut','類比輸出','Analog out']
];
export function settingsView(state) {
 return {
  schema:'caruso-settings-status/v1',readOnly:true,
  device:{host:state.host,connected:state.connected,model:'Caruso',modelVerified:false,serial:null,firmware:null},
  capturedAt:new Date().toISOString(),mediaLastSeen:state.lastSeen,
  coverage:{verified:0,total:FIELDS.length,complete:false},
  fields:FIELDS.map(([id,label,officialName])=>({id,label,officialName,value:null,status:'not-read',readable:false,writable:false})),
  capabilities:{readAudioSettings:false,backupAudioSettings:false,restoreAudioSettings:false},
  blockedReason:'目前尚未取得並驗證這台 Caruso 的音場設定讀寫方式。',
  reference:'https://www.ta-hifi.de/wp-content/uploads/UM_Caruso_220_DE_EN.pdf'
 };
}
export function observation(state) {
 return {schema:'caruso-observation/v1',kind:'observation-not-backup',createdAt:new Date().toISOString(),
  notice:'這是已讀媒體狀態與設定讀取範圍的紀錄，不是音場設定備份，不能用來還原音響。',
  device:{host:state.host,serial:null,modelReference:null,firmware:null},
  observed:{connected:state.connected,lastSeen:state.lastSeen,volume:state.volume,playState:state.playState,track:state.track},
  audioSettings:settingsView(state),restorable:false};
}
function canonical(value) {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function backupDigest(backup) {
 const {integrity,...payload}=backup;return createHash('sha256').update(canonical(payload)).digest('hex');
}
export function inspectBackup(file,current=settingsView({host:'',connected:false})) {
 const problems=[];
 if(!file||typeof file!=='object'||Array.isArray(file))return {valid:false,canRestore:false,problems:['檔案必須是 JSON 物件。'],diff:[]};
 if(file.schema!=='caruso-audio-backup/v1')problems.push(file.kind==='observation-not-backup'?'這是狀態紀錄，不是音場備份。':'不支援此檔案格式。');
 if(file.complete!==true)problems.push('檔案未標示為完整音場備份。');
 if(!file.device?.serial||!file.device?.modelReference||!file.device?.firmware)problems.push('缺少序號、型號或韌體版本，無法確認還原對象。');
 if(!file.integrity||file.integrity.algorithm!=='sha256'||typeof file.integrity.value!=='string'||backupDigest(file)!==file.integrity.value)problems.push('檔案完整性檢查未通過。');
 const values=file.settings;
 for(const [id] of FIELDS)if(!values||!Object.hasOwn(values,id)||values[id]===null||!['number','boolean','string'].includes(typeof values[id]))problems.push(`缺少有效設定：${id}`);
 if(values&&typeof values==='object')for(const key of Object.keys(values))if(!FIELDS.some(([id])=>id===key))problems.push(`包含未支援的設定：${key}`);
 const diff=FIELDS.map(([id,label])=>({id,label,current:null,backup:values&&Object.hasOwn(values,id)?values[id]:null,status:'current-value-unavailable'}));
 return {valid:problems.length===0,canRestore:false,problems,diff,
  restoreBlockedReason:current.blockedReason||'目前音場設定唯讀，尚未開放裝置還原。',
  identityVerified:false,note:'SHA-256 僅檢查檔案一致性，不代表來源可信或適合這台音響。'};
}
