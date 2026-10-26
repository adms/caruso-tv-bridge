// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
const tabs=[...document.querySelectorAll('[data-tab-target]')];
function activate(tab){for(const t of tabs){const selected=t===tab;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;document.getElementById(t.dataset.tabTarget).hidden=!selected;}sessionStorage.setItem('caruso-view:'+location.pathname,tab.dataset.tabTarget);}
for(const tab of tabs){tab.addEventListener('click',()=>activate(tab));tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();activate(tabs[index]);tabs[index].focus();});}
const saved=tabs.find(t=>t.dataset.tabTarget===sessionStorage.getItem('caruso-view:'+location.pathname));if(saved)activate(saved);
