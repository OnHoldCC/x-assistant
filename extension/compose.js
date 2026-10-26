(() => {
  if(globalThis.__localComposeTranslationLoaded)return;
  globalThis.__localComposeTranslationLoaded=true;
  const names=()=>config.languages||{en:'英语',ja:'日语',ko:'韩语',fr:'法语',de:'德语',es:'西班牙语'};
  const editors=new Map();let config={},scanTimer,focusedEditor=null;
  const text=editor=>editor.innerText.replace(/\u00a0/g,' ');
  function insert(editor,value){
    editor.focus();const selection=getSelection(),range=document.createRange();range.selectNodeContents(editor);selection.removeAllRanges();selection.addRange(range);
    return document.execCommand('insertText',false,value)&&text(editor).trim()===value.trim();
  }
  function mount(editor){
    const host=document.createElement('x-compose-translation'),root=host.attachShadow({mode:'open'});host.hidden=true;
    const style=document.createElement('style');style.textContent=`:host([hidden]){display:none!important}:host{display:contents;font:14px/1.6 system-ui,-apple-system,sans-serif;color:#242424}*{box-sizing:border-box;scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}[hidden]{display:none!important}button{font:inherit;color:inherit;min-height:42px;border:1px solid #ddd;border-radius:10px;background:#fff;padding:8px 14px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button:focus-visible,textarea:focus-visible{outline:2px solid #c36948;outline-offset:3px}.launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;background:#242424;color:#fff;border:0;border-radius:22px;box-shadow:0 4px 18px #0002;font-size:12px}.dialog{width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;color:#242424;background:#f5f5f5;border:1px solid #ddd;border-radius:18px;padding:22px;box-shadow:0 18px 70px #0003}.dialog::backdrop{background:#0004}.heading{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:17px;font-weight:600}.close{min-width:42px;padding:0;font-size:20px;background:transparent;border:0}label{display:block;font-size:12px;color:#717171;margin:14px 0 6px}.source,.preview{display:block;width:100%;resize:vertical;min-height:90px;max-height:28vh;padding:12px;border:1px solid #e2e2e2;border-radius:10px;background:#fff;white-space:pre-wrap;overflow:auto;overflow-wrap:anywhere;font:inherit;font-size:14px;line-height:1.7;color:#242424}.source{color:#717171;min-height:66px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.apply{background:#242424;color:#fff;border-color:#242424}.status{font-size:12px;color:#717171;min-height:20px;margin-top:12px}@media(max-width:600px){.launcher{bottom:16px;right:16px}.dialog{padding:18px}}`;
    const launch=document.createElement('button');launch.type='button';launch.className='launcher';launch.setAttribute('aria-haspopup','dialog');
    const dialog=document.createElement('dialog');dialog.className='dialog';dialog.setAttribute('aria-label','发帖翻译预览');
    const heading=document.createElement('div');heading.className='heading';const title=document.createElement('span');
    const close=document.createElement('button');close.type='button';close.className='close';close.textContent='×';close.setAttribute('aria-label','关闭翻译预览');heading.append(title,close);
    const sourceLabel=document.createElement('label');sourceLabel.textContent='原稿';const sourceBox=document.createElement('textarea');sourceBox.className='source';sourceBox.placeholder='在这里输入要翻译的草稿';sourceBox.dir='auto';sourceBox.setAttribute('aria-label','原稿');
    const targetLabel=document.createElement('label');const preview=document.createElement('textarea');preview.className='preview';preview.readOnly=true;preview.dir='auto';preview.setAttribute('aria-label','译文预览');
    const actions=document.createElement('div');actions.className='actions';
    const apply=document.createElement('button');apply.type='button';apply.className='apply';apply.textContent='一键采纳';apply.hidden=true;
    const restore=document.createElement('button');restore.type='button';restore.textContent='恢复原稿';restore.hidden=true;
    const copy=document.createElement('button');copy.type='button';copy.textContent='复制译文';copy.hidden=true;
    const status=document.createElement('div');status.className='status';status.setAttribute('role','status');
    actions.append(apply,restore,copy);dialog.append(heading,sourceLabel,sourceBox,targetLabel,preview,actions,status);root.append(style,launch,dialog);
    // Keep preview outside X's clipped contenteditable tree and in the browser top layer.
    document.body.append(host);
    const state={host,seq:0,seen:'',composing:false,mutating:false,timer:null,source:'',translated:'',applied:'',backup:'',base:'',ignoreFocusUntil:0};
    const visible=()=>{const box=editor.getBoundingClientRect();return box.width>0&&box.height>0&&!editor.closest('[hidden],[aria-hidden="true"]');};
    const hide=()=>{if(dialog.open)dialog.close();host.hidden=true;};
    const headingText=()=>{const name=names()[config.composeTarget]||'英语';title.textContent=`自动识别 → ${name}`;targetLabel.textContent=`${name}译文`;launch.textContent=state.backup?'草稿翻译 · 可恢复原稿':`查看${name}草稿`;};headingText();
    function currentSource(){return dialog.open?sourceBox.value:text(editor);}
    function closeDialog(){state.ignoreFocusUntil=performance.now()+500;if(dialog.open)dialog.close();}
    async function translate(source,seq){
      if(seq!==state.seq||!editor.isConnected||!config.composeTranslate||state.composing||currentSource()!==source)return;
      status.textContent='翻译中…';apply.hidden=true;preview.value='';const started=performance.now();
      try{
        const response=await chrome.runtime.sendMessage({type:'TRANSLATE_DRAFT',text:source});
        if(seq!==state.seq||!editor.isConnected||currentSource()!==source||!config.composeTranslate)return;
        if(!response?.ok)throw new Error(response?.error||'本机翻译失败');
        if(typeof response.data?.text!=='string'||!response.data.text.trim())throw new Error('没有生成有效译文');
        state.source=source;state.translated=response.data.text;preview.value=state.translated;preview.lang=config.composeTarget;
        apply.hidden=false;copy.hidden=false;status.textContent=response.data.cached?'缓存':`机器翻译 · ${Number.isFinite(response.data.elapsed_ms)?Math.round(response.data.elapsed_ms):Math.round(performance.now()-started)} ms`;
      }catch(error){if(seq===state.seq)status.textContent=error.message;}
    }
    function prepare(source){
      state.seq++;clearTimeout(state.timer);headingText();apply.hidden=true;copy.hidden=true;preview.value='';
      if(!source.trim()){status.textContent='在上方输入原稿，下方自动显示译文';return;}
      if(state.composing){status.textContent='等待输入完成…';return;}
      if(!/\p{L}/u.test(source)){status.textContent='请输入包含文字的草稿';return;}
      if(source.length>12000){status.textContent='草稿超过 12000 字符，请分段处理';return;}
      const seq=state.seq;status.textContent='等待输入完成…';state.timer=setTimeout(()=>translate(source,seq),700);
    }
    function openDialog(){
      if(!config.composeTranslate||!visible()||dialog.open)return;
      host.hidden=false;focusedEditor=editor;state.base=text(editor);state.seen=state.base;
      sourceBox.value=state.backup&&state.base===state.applied?state.backup:state.base;
      headingText();dialog.showModal();sourceBox.focus();
      if(state.backup&&state.base===state.applied){preview.value=state.translated;restore.hidden=false;copy.hidden=false;apply.hidden=true;}
      else{restore.hidden=true;prepare(sourceBox.value);}
    }
    function changed(){
      if(state.mutating)return;
      if(!config.composeTranslate||!visible()||focusedEditor!==editor){state.seq++;clearTimeout(state.timer);closeDialog();host.hidden=true;return;}
      if(dialog.open){if(text(editor)!==state.base){state.seq++;clearTimeout(state.timer);apply.hidden=true;status.textContent='X 草稿已改变，请关闭后重新打开，避免覆盖';}return;}
      const source=text(editor);state.seen=source;
      if(source!==state.applied){restore.hidden=true;state.backup='';}
      host.hidden=!source.trim()&&!state.backup;
    }
    launch.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openDialog();});
    close.addEventListener('click',closeDialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
    dialog.addEventListener('close',()=>{state.ignoreFocusUntil=performance.now()+500;state.seq++;clearTimeout(state.timer);});
    sourceBox.addEventListener('input',()=>prepare(sourceBox.value));
    sourceBox.addEventListener('compositionstart',()=>{state.composing=true;state.seq++;clearTimeout(state.timer);apply.hidden=true;});
    sourceBox.addEventListener('compositionend',()=>{state.composing=false;prepare(sourceBox.value);});
    apply.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(sourceBox.value!==state.source||text(editor)!==state.base){status.textContent='草稿已改变，未覆盖你的输入';return;}
      closeDialog();state.mutating=true;
      try{state.backup=state.source;const inserted=insert(editor,state.translated);
        if(text(editor)!==state.base){state.applied=text(editor);state.seen=state.applied;restore.hidden=false;}
        if(inserted){apply.hidden=true;status.textContent='已采纳，请核对后自行发布';}
        else{status.textContent='此输入框未完整接受替换，可恢复原稿或复制译文';dialog.showModal();}
        headingText();
      }finally{state.mutating=false;}
    });
    restore.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();if(text(editor)!==state.applied){status.textContent='草稿已改变，未覆盖你的输入';return;}
      closeDialog();state.mutating=true;
      try{if(insert(editor,state.backup)){state.seen=text(editor);state.seq++;restore.hidden=true;apply.hidden=false;state.backup='';status.textContent='已恢复原稿';headingText();}}
      finally{state.mutating=false;}
    });
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.translated);status.textContent='已复制';}catch{status.textContent='复制失败，可选中译文手动复制';}});
    host.addEventListener('click',event=>event.stopPropagation());
    const focus=()=>{if(focusedEditor!==editor){focusedEditor=editor;for(const item of editors.values())item.refresh();}if(!state.mutating&&performance.now()>state.ignoreFocusUntil)openDialog();};
    const compositionStart=()=>{state.composing=true;state.seq++;clearTimeout(state.timer);hide();};
    const compositionEnd=()=>{state.composing=false;changed();};
    editor.addEventListener('focus',focus);editor.addEventListener('input',changed);editor.addEventListener('compositionstart',compositionStart);editor.addEventListener('compositionend',compositionEnd);
    return {host,refresh:changed,scan:()=>{if(!config.composeTranslate||!visible()||focusedEditor!==editor){hide();return;}const value=text(editor);if(value!==state.seen||host.hidden&&/\p{L}/u.test(value)&&!state.composing)changed();},remove:()=>{state.seq++;clearTimeout(state.timer);if(dialog.open)dialog.close();editor.removeEventListener('focus',focus);editor.removeEventListener('input',changed);editor.removeEventListener('compositionstart',compositionStart);editor.removeEventListener('compositionend',compositionEnd);host.remove();}};
  }
  function scan(){
    if(!focusedEditor?.isConnected)focusedEditor=null;
    for(const [editor,state] of editors)if(!editor.isConnected){state.remove();editors.delete(editor);}
    for(const editor of document.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]')){
      const old=editors.get(editor);if(old?.host.isConnected){old.scan();continue;}
      if(!focusedEditor)focusedEditor=editor;old?.remove();const state=mount(editor);editors.set(editor,state);state.refresh();if(document.activeElement===editor)editor.dispatchEvent(new Event('focus'));
    }
  }
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='CONFIG_CHANGED'){config=message.config;for(const state of editors.values())state.refresh();scan();}});
  new MutationObserver(()=>{if(!scanTimer)scanTimer=setTimeout(()=>{scanTimer=null;scan();},200);}).observe(document.body,{childList:true,subtree:true,characterData:true});
  chrome.runtime.sendMessage({type:'GET_PUBLIC_CONFIG'}).then(response=>{if(response?.ok){config=response.data;scan();}}).catch(()=>{});
})();
