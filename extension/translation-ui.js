(() => {
  if(globalThis.XAITranslationUI)return;
  const originals = new WeakMap();
  function readOriginal(node) {
    const saved = originals.get(node);
    if (saved && node.innerHTML === saved.html) return saved.text;
    if (saved) {node.style.display=saved.display; originals.delete(node);}
    if(!node.matches('[data-testid="tweetText"]'))return node.innerText;
    // X's inline link wrappers can make innerText invent line breaks inside a sentence.
    function text(child){
      if(child.nodeType===Node.TEXT_NODE)return child.nodeValue;
      if(child.nodeType!==Node.ELEMENT_NODE)return '';
      const style=getComputedStyle(child);
      if(child.hidden||style.display==='none'||style.visibility==='hidden')return '';
      if(child.tagName==='BR')return '\n';
      if(child.tagName==='IMG')return child.alt||'';
      return [...child.childNodes].map(text).join('');
    }
    return [...node.childNodes].map(text).join('').replace(/\r\n?/g,'\n');
  }
  function isForeign(text,target='zh') {
    const clean = text.replace(/https?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?|@[A-Za-z0-9_]+|#[\p{L}\p{N}_]+/giu, '');
    if(target!=='zh')return (clean.match(/\p{L}/gu)||[]).length>=2;
    if (/[\u3040-\u30ff\uac00-\ud7af]/u.test(clean)) return true;
    const letters = clean.match(/\p{L}/gu) || [];
    const han = clean.match(/[\u3400-\u9fff]/gu) || [];
    return letters.length >= 4 && han.length < letters.length * 0.25;
  }
  function originalLine(parent, text, links) {
    let rest=text;
    while(rest) {
      const next=links.map(link=>({...link,index:rest.indexOf(link.label)})).filter(link=>link.index>=0)
        .sort((a,b)=>a.index-b.index||b.label.length-a.label.length)[0];
      if(!next){parent.append(document.createTextNode(rest));break;}
      parent.append(document.createTextNode(rest.slice(0,next.index)));
      const a=document.createElement('a');a.href=next.href;a.textContent=next.label;parent.append(a);
      rest=rest.slice(next.index+next.label.length);
    }
  }
  function mount(textNode, text, send, current, options={}) {
    const host=document.createElement('x-local-translation');
    const nativeStyle=getComputedStyle(textNode);
    host.style.font=nativeStyle.font;host.style.fontFamily='"Launch Rounded", ui-rounded, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';host.style.color=nativeStyle.color;
    const rgb=nativeStyle.color.match(/\d+/g)?.slice(0,3).map(Number)||[0,0,0];
    host.style.setProperty('--translation-color',rgb.reduce((a,b)=>a+b,0)>480?'#b6cbd5':'#486572');
    const root=host.attachShadow({mode:'open'});
    const style=document.createElement('style');
    style.textContent=`:host{display:block;font:inherit;color:inherit;overflow-wrap:anywhere}*{box-sizing:border-box}.body[hidden],[hidden]{display:none!important}.pair{margin:0}.original,.translation{white-space:pre-wrap;line-height:1.65}.translation{margin-top:5px;color:var(--translation-color,#486572);font-size:.96em}.tools{color:#536471;font-family:inherit;font-size:12px;line-height:1.5;margin:6px 0}.tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.status{overflow-wrap:anywhere}button{font:inherit;color:#1473a9;border:0;background:transparent;padding:2px 0;min-height:32px;cursor:pointer}button:disabled{cursor:wait}button:focus-visible{outline:2px solid #1d9bf0;outline-offset:3px}a{color:#1d9bf0;text-decoration:none}a:hover{text-decoration:underline}@media(prefers-color-scheme:dark){.translation{color:var(--translation-color,#b6cbd5)}.tools{color:#a3b4bf}button{color:#7ac5ff}}`;
    const body=document.createElement('div');body.className='body';body.hidden=true;
    const tools=document.createElement('div');tools.className='tools';
    const label=document.createElement('span');label.textContent='翻译';
    const button=document.createElement('button');button.type='button';button.textContent='翻译';
    const status=document.createElement('span');status.className='status';status.setAttribute('role','status');
    tools.append(label,status,button);root.append(style,body,tools);textNode.after(host);
    const saved={text,html:textNode.innerHTML,display:textNode.style.display};
    const more=options.moreNode, moreDisplay=more?.style.display;
    const links=[...textNode.querySelectorAll('a[href]')].map(a=>({label:a.innerText,href:a.href}))
      .filter(a=>a.label&&/^https?:\/\//.test(a.href));
    let loading=false,done=false,expanded=false,retries=0,retryTimer,port,rendered=false,failed=false;
    let rows=[],sources=[],breaks=[];
    function show(active) {
      body.hidden=!active;
      if(active&&!options.translationOnly){originals.set(textNode,saved);textNode.style.display='none';}
      else if(originals.get(textNode)===saved)textNode.style.display=saved.display;
      if(more&&expanded)more.style.display=active?'none':moreDisplay;
      button.textContent=active?'原文':options.translationOnly?'译文':'对照';
    }
    function begin(data) {
      if(!Array.isArray(data.sourceLines)||!data.sourceLines.length||!data.sourceLines.every(s=>typeof s==='string'))throw new Error('原文段落格式不正确。');
      expanded=data.expanded===true;
      breaks=data.sourceBreaks||data.sourceLines.map((_,index)=>index?'\n':'');
      if(!rendered||sources.length!==data.sourceLines.length||sources.some((line,i)=>line!==data.sourceLines[i])) {
        sources=data.sourceLines;rows=[];body.replaceChildren();
        sources.forEach((source,index)=>{
          const pair=document.createElement('div');pair.className='pair';
          pair.style.margin=`${Math.max(0,(breaks[index].match(/\n/g)||[]).length-1)*1.65}em 0 0`;
          if(!options.translationOnly){const original=document.createElement('div');original.className='original';originalLine(original,source,links);pair.append(original);}
          const chinese=document.createElement('div');chinese.className='translation';chinese.lang=options.target||'zh';chinese.dir='auto';chinese.textContent='…';chinese.setAttribute('aria-label','此段翻译中');
          pair.append(chinese);body.append(pair);rows.push({node:chinese,done:false});
        });
      }
      if(!rendered){rendered=true;show(true);}
      button.disabled=false;
    }
    function paragraph(data,started) {
      if(!Number.isInteger(data.index)||!rows[data.index]||typeof data.text!=='string')throw new Error('段落译文格式不正确。');
      const row=rows[data.index];row.node.replaceChildren();originalLine(row.node,data.text,links);row.node.removeAttribute('aria-label');
      row.node.hidden=sources[data.index].trim()===data.text.trim();row.done=true;
      status.textContent=`· ${rows.filter(r=>r.done).length}/${rows.length} · ${Math.round(performance.now()-started)} ms`;
    }
    function request(payload,progress) {
      if(typeof chrome.runtime.connect!=='function')return send(payload);
      return new Promise((resolve,reject)=>{
        let settled=false;port=chrome.runtime.connect({name:'local-translation-stream'});
        const finish=(data,error)=>{if(settled)return;settled=true;if(error)reject(error);else resolve(data);port?.disconnect();port=null;};
        port.onMessage.addListener(message=>{
          if(!current())return finish(null,new Error('页面已改变。'));
          try{
            if(message.kind==='complete')finish(message.data);
            else if(message.kind==='error'){const error=new Error(message.error||'本机翻译失败');error.retryable=message.retryable===true;finish(null,error);}
            else progress(message);
          }catch(error){finish(null,error);}
        });
        port.onDisconnect.addListener(()=>{if(!settled){const error=new Error('本机翻译连接中断，稍后重试。');error.retryable=true;finish(null,error);}});
        port.postMessage(payload);
      });
    }
    async function start(automatic=false) {
      if(loading||done||!current())return;
      const started=performance.now();failed=false;loading=true;options.onStart?.();button.disabled=!rendered;button.textContent='翻译中…';
      status.textContent=options.readFull&&!automatic?'正在补读全文，仅在本机翻译':'仅在本机处理';
      try {
        const data=await request({type:'TRANSLATE',text,automatic,readFull:!!options.readFull&&!automatic,postUrl:options.postUrl},message=>{
          if(message.kind==='source')begin(message);else if(message.kind==='paragraph')paragraph(message,started);
        });
        if(!current()||!host.isConnected)return;
        const sourceLines=data.sourceLines||text.split(/\n+/).map(s=>s.trim()).filter(Boolean);
        const translated=data.paragraphs||(typeof data.text==='string'?data.text.split(/\n+/).map(s=>s.trim()).filter(Boolean):[]);
        if(sourceLines.length!==translated.length||!sourceLines.length)throw new Error('段落未能对齐，请重试翻译。');
        begin({sourceLines,sourceBreaks:data.sourceBreaks,expanded:data.expanded});translated.forEach((line,index)=>{
          if(!rows[index].done)paragraph({index,text:line,cached:data.paragraphCached?.[index]??data.cached,elapsed_ms:data.paragraphMs?.[index]??data.elapsed_ms,referenceOnly:data.paragraphSkipped?.[index]},started);
        });
        done=true;retries=0;label.title=`本机 Hy-MT2 · ${data.source_lang||'自动'} → ${options.targetName||'中文'}${expanded?' · 已读取全文':''}`;
        send({type:'OBSERVE_CONTENT',source:{url:options.postUrl||location.href,...(options.sourceRecord||{original:sourceLines.map((line,index)=>breaks[index]+line).join('')})}}).catch(()=>{});
        options.onComplete?.(data);
        label.textContent=options.readFull&&!expanded?'部分译文':data.cached?'缓存':'机器翻译';
        status.textContent=options.readFull&&!expanded?'当前显示部分 · 展开帖子后继续翻译':data.cached?'':`· ${Math.round(data.elapsed_ms??performance.now()-started)} ms`;
        button.textContent=body.hidden?(options.translationOnly?'译文':'对照'):'原文';
      } catch(error) {if(current()){
        failed=true;button.textContent='重试';status.textContent=error.message;
        for(const row of rows)if(!row.done){row.node.textContent='此段暂未译出';row.node.removeAttribute('aria-label');}
        if(automatic&&error.retryable&&retries<2){retries++;status.textContent='本机服务连接中，稍后自动重试';retryTimer=setTimeout(()=>start(true),retries*3000);}
      }}finally{loading=false;button.disabled=false;options.onSettled?.();}
    }
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(rendered&&!failed)show(body.hidden);else start();});
    host.addEventListener('click',event=>{
      const path=event.composedPath();
      if(path.some(node=>node instanceof Element&&node.matches('a,button'))){event.stopPropagation();return;}
      if(!path.includes(body)||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||getSelection()?.toString())return;
      const article=textNode.closest('article[data-testid="tweet"]');
      const permalink=article&&[...article.querySelectorAll('a[href]')].find(link=>link.querySelector('time')&&link.href===options.postUrl&&!link.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]'));
      if(permalink){event.stopPropagation();permalink.click();}
    });
    return {host,start,remove:()=>{
      clearTimeout(retryTimer);port?.disconnect();port=null;
      if(originals.get(textNode)===saved){textNode.style.display=saved.display;originals.delete(textNode);}
      if(more&&expanded)more.style.display=moreDisplay;
      host.remove();
    }};
  }
  globalThis.XAITranslationUI={mount,isForeign,readOriginal};
})();
