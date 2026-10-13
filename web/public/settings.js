const $=id=>document.getElementById(id);let token='',view;
function showError(message){const box=$('inspection');box.replaceChildren();const p=document.createElement('p');p.textContent=message;box.append(p);box.hidden=false;}
async function load(){
 try{
  const [state,status]=await Promise.all([fetch('/api/state'),fetch('/api/settings')]);
  if(!state.ok||!status.ok)throw Error('無法讀取本機服務。');token=(await state.json()).token;view=await status.json();
  $('settings-host').textContent=view.device.host; $('coverage').textContent=`${view.coverage.verified} / ${view.coverage.total}`;
  const rows=view.fields.map(f=>{const row=document.createElement('div');row.className='field-row';const label=document.createElement('div');label.className='field-label';label.textContent=f.label;const sub=document.createElement('small');sub.textContent=f.officialName;label.append(sub);const value=document.createElement('span');value.className='field-value';value.textContent='尚未讀取';row.append(label,value);return row;});$('settings-fields').replaceChildren(...rows);
 }catch(e){showError(e.message);}
}
$('backup-file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;
 if(file.size>262144){showError('檔案超過 256 KiB，未讀取。');return;}
 try{
  const raw=await file.text();JSON.parse(raw);
  const r=await fetch('/api/settings/inspect-backup',{method:'POST',headers:{'Content-Type':'application/json','X-Caruso-Token':token},body:raw});const result=await r.json();if(!r.ok)throw Error(result.error);
  const box=$('inspection');box.replaceChildren();const title=document.createElement('strong');title.textContent=result.valid?'檔案格式檢查通過；裝置還原仍鎖定':'此檔案不能用來還原音場';box.append(title);
  const list=document.createElement('ul');for(const text of result.problems){const li=document.createElement('li');li.textContent=text;list.append(li);}box.append(list);
  const note=document.createElement('p');note.textContent='僅檢查檔案。沒有更動音響或套用任何值。';box.append(note);
  if(result.valid){const diff=document.createElement('div');diff.className='diff';for(const item of result.diff){const row=document.createElement('div');row.className='diff-row';row.textContent=`${item.label}：目前值尚未讀取 → 備份值 ${String(item.backup)}`;diff.append(row);}box.append(diff);}
  box.hidden=false;
 }catch(e){showError(e instanceof SyntaxError?'不是有效的 JSON 檔案，未套用任何設定。':e.message);}
});
load();
