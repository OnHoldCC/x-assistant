(() => {
 if(globalThis.__localComposeTranslationLoaded||['#x-local-full-reader','#onhold-dashboard-reader','#onhold-publisher','#onhold-reply'].includes(location.hash))return;
 globalThis.__localComposeTranslationLoaded=true;
 const editors=new Map();let config={},scanTimer;
 const text=globalThis.OnHoldEditorText;
 const visible=editor=>{const box=editor.getBoundingClientRect();return editor.isConnected&&box.width>0&&box.height>0&&!editor.closest('[hidden],[aria-hidden="true"]');};
 function mount(editor){
  const host=document.createElement('onhold-compose-translation'),root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
:host{display:block;width:100%;min-width:0;margin-top:4px;color:#536471;font:${OnHoldUI.typeScale.caption}px/1.5 ${OnHoldUI.font}}:host([hidden]),[hidden]{display:none!important}*{box-sizing:border-box}.row{display:flex;align-items:center;flex-wrap:wrap;gap:0 8px}label{display:flex;align-items:center;gap:4px;min-height:44px}select,button{font:inherit;background:transparent;border:0;min-height:44px;border-radius:4px}select{color:inherit;max-width:130px;cursor:pointer}button{font-weight:650;display:inline-flex;align-items:center;gap:5px;color:#1d9bf0;padding:0 8px;cursor:pointer;touch-action:manipulation}button:disabled{opacity:.5;cursor:default}button:hover:enabled{background:#1d9bf00d}button:focus-visible,select:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}svg{width:16px;height:16px}.status{margin:0;font-size:12px;overflow-wrap:anywhere}.undo{color:inherit}:host([data-dark]){color:#a1aeb8}:host([data-dark]) button:not(.undo){color:#71c9f8}:host([data-dark]) select{color-scheme:dark}
</style><div class="row"><button class="translate" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 5h12M9 2v3m-4 3c1 5 4 8 9 10M13 5c-1 6-5 11-10 14m12 2 4-11 4 11m-6-4h4"/></svg><span>一键翻译</span></button><button class="focus" type="button">聚焦输入框</button><span aria-hidden="true">→</span><label for="target">语言<select id="target" aria-label="目标语言"></select></label><button class="undo" type="button" hidden>撤销翻译</button></div><section class="preview" aria-label="译文预览" hidden><h3>译文预览</h3><p class="preview-text"></p><div class="row"><button class="apply" type="button">应用替换</button><button class="regenerate" type="button">重新生成</button></div></section><p class="status" role="status" aria-live="polite" hidden></p>`;
  const previewStyle=document.createElement('style');previewStyle.textContent='.translate{border:1px solid #cfe0eb;border-radius:6px}.preview{margin-top:8px;padding:12px;border:1px solid #cfe0eb;border-radius:10px}.preview h3{font:inherit;font-weight:650;margin:0}.preview-text{font-size:14px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;margin:8px 0}.apply{background:#1d9bf0;color:white!important}.apply:hover:enabled{background:#1684c6}:host([data-dark]) .preview,:host([data-dark]) .translate{border-color:#344654}';root.append(previewStyle);
  const $=selector=>root.querySelector(selector);let seen=text(editor),composing=false,mutating=false,loading=false,request=0,backup=null,applied=null,preview=null,defaultTarget;
  function note(value=''){$('.status').textContent=value;$('.status').hidden=!value;}
  function controls(){host.hidden=!config.composeTranslate||!visible(editor);$('.translate').disabled=loading||composing||mutating||!seen.trim();$('.translate span').textContent=loading?'翻译中…':'一键翻译';$('.translate').setAttribute('aria-busy',String(loading));$('.undo').hidden=backup===null;$('.undo').disabled=composing||loading||mutating;$('.preview').hidden=!preview;$('.preview').setAttribute('aria-busy',String(loading));$('.apply').disabled=$('.regenerate').disabled=loading||composing||mutating;$('.apply').textContent=mutating?'应用中…':'应用替换';}
  function place(){
   let anchor=editor.closest('[data-testid$="RichTextInputContainer"]')||editor;
   while(anchor.parentElement&&getComputedStyle(anchor.parentElement).display==='flex'&&getComputedStyle(anchor.parentElement).flexDirection==='row')anchor=anchor.parentElement;
   if(anchor.nextElementSibling!==host)anchor.after(host);
   const rgb=getComputedStyle(editor).color.match(/\d+/g)||[];host.toggleAttribute('data-dark',rgb.slice(0,3).reduce((sum,n)=>sum+Number(n),0)>480);controls();
  }
  function invalidate(){request++;loading=false;preview=null;note();controls();}
  function sync(){if(mutating||composing)return;const value=text(editor);if(value!==seen){seen=value;backup=applied=null;invalidate();}controls();}
  function focus(){
   if(!visible(editor)||composing)return;
   editor.focus({preventScroll:true});editor.scrollIntoView({block:'nearest'});
   const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  async function insert(value,expected){
   editor.focus();
   await new Promise(resolve=>requestAnimationFrame(resolve));
   if(!editor.isConnected||composing||text(editor)!==expected)throw Error('草稿已改变，未覆盖你的输入。');
   const selection=getSelection(),range=document.createRange();range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);
   // A single native edit preserves paragraph order; separate edits let X reset the caret between chunks.
   document.execCommand('insertText',false,value);
   await new Promise(resolve=>requestAnimationFrame(resolve));
   return text(editor)===value;
  }
  async function translate(regenerate=false){
   sync();if(loading||composing||!config.composeTranslate||!seen.trim())return;
   if(seen.length>4000){note('草稿超过 4000 字符，请缩短后翻译。');return;}
   const source=seen,target=$('#target').value,mine=++request;loading=true;note();controls();
   try{
    const response=await chrome.runtime.sendMessage({type:'TRANSLATE_DRAFT',text:source,targetLang:target,regenerate});
    if(!editor.isConnected||mine!==request||!config.composeTranslate)return;
    if(text(editor)!==source||composing||$('#target').value!==target){sync();note('草稿或语言已改变，请重新翻译。');return;}
    if(!response?.ok)throw Error(response?.error||'本机翻译未完成，请重试。');
    const value=response.data?.text;if(typeof value!=='string'||!value.trim()||value.length>24000)throw Error('译文格式不正确，请重试。');
    preview={source,target,text:value};$('.preview-text').textContent=value;
    if(value===source)note('译文与原文相同。');
   }catch(error){if(mine===request)note(error.message);}
   finally{if(mine===request){loading=false;controls();}}
  }
  async function apply(){
   const candidate=preview;if(!candidate||loading||composing||mutating)return;
   sync();if(preview!==candidate||text(editor)!==candidate.source||$('#target').value!==candidate.target){note('草稿或语言已改变，请重新翻译。');return;}
   mutating=true;controls();
   try{
    backup=candidate.source;const accepted=await insert(candidate.text,candidate.source);applied=seen=text(editor);preview=null;
    if(!accepted){if(applied===candidate.source)backup=applied=null;throw Error('输入框未完整接受译文，请核对或撤销后重试。');}
    note('已替换正文');
   }catch(error){note(error.message);}
   finally{mutating=false;controls();}
  }
  async function undo(){
   if(backup===null)return;
   if(composing||!editor.isConnected||text(editor)!==applied){sync();note('草稿已另外修改，未覆盖你的输入。');return;}
   invalidate();loading=true;mutating=true;controls();
   try{if(!await insert(backup,applied))throw Error('撤销未完整写入，请核对输入框。');seen=text(editor);backup=applied=null;note();}
   catch(error){note(error.message);}
   finally{mutating=false;loading=false;controls();}
  }
  $('.focus').onclick=focus;
  if(location.pathname.startsWith('/compose/')||editor.closest('[role=dialog]'))requestAnimationFrame(()=>{if(!document.activeElement||document.activeElement===document.body)focus();});
  const input=event=>{if(!event.isComposing)sync();},start=()=>{composing=true;invalidate();},end=()=>{composing=false;sync();};
  editor.addEventListener('input',input);editor.addEventListener('compositionstart',start);editor.addEventListener('compositionend',end);
  $('#target').onchange=()=>invalidate();$('.translate').onclick=()=>translate();$('.regenerate').onclick=()=>translate(true);$('.apply').onclick=apply;$('.undo').onclick=undo;
  host.addEventListener('click',event=>event.stopPropagation());host.addEventListener('pointerdown',event=>event.stopPropagation());
  function refresh(){
   if(!$('#target').options.length){for(const [value,name] of Object.entries(config.languages||{})){const option=document.createElement('option');option.value=value;option.textContent=name;$('#target').append(option);}}
   if(defaultTarget!==config.composeTarget){defaultTarget=config.composeTarget;$('#target').value=config.composeTarget||'en';invalidate();}
   if(!config.composeTranslate)invalidate();sync();place();
  }
  refresh();return {scan:()=>{sync();place();},refresh,remove:()=>{request++;editor.removeEventListener('input',input);editor.removeEventListener('compositionstart',start);editor.removeEventListener('compositionend',end);host.remove();}};
 }
 function scan(){
  for(const [editor,item] of editors)if(!editor.isConnected){item.remove();editors.delete(editor);}
  for(const editor of document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]')){if(!editors.has(editor))editors.set(editor,mount(editor));editors.get(editor).scan();}
 }
 const refresh=next=>{config=next;for(const item of editors.values())item.refresh();scan();};
 chrome.runtime.onMessage.addListener(message=>{if(message.type==='CONFIG_CHANGED')refresh(message.config);});
 new MutationObserver(()=>{if(!scanTimer)scanTimer=setTimeout(()=>{scanTimer=null;scan();},200);}).observe(document.body,{childList:true,subtree:true,characterData:true});
 addEventListener('resize',scan);
 chrome.runtime.sendMessage({type:'GET_PUBLIC_CONFIG'}).then(response=>{if(response?.ok)refresh(response.data);}).catch(()=>{});
})();
