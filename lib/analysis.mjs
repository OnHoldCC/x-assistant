import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fingerprint,resultKey} from './data.mjs';
import '../extension/analysis-core.js';
export function splitText(text){const lines=[];for(let line of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)){while(line.length>2000){let end=line.lastIndexOf(' ',2000);if(end<1000)end=2000;if(/[\uD800-\uDBFF]/.test(line[end-1]))end--;lines.push(line.slice(0,end).trim());line=line.slice(end).trim();}if(line)lines.push(line);}return lines;}
export function createAnalyzer({store,translate,candidates,decide,translationVersion,decisionVersion}){
 const lexicon=createHash('sha256').update(fs.readFileSync(new URL('./phrase-terms.json',import.meta.url))).digest('hex');
 const version=[decisionVersion,lexicon,'phrases-v7',translationVersion].join(':');
 let queue=Promise.resolve();
 return async function analyze({text,to_chinese=false}){
  if(typeof text!=='string'||!text.trim()||text.length>24000)throw Error('评分支持 1–24000 字符正文');
  const source=text.trim(),hash=fingerprint(source),key=resultKey(version,to_chinese,source);
  return store.obtain('analysis',key,hash,version,'zh',source,()=>{
   const task=queue.catch(()=>{}).then(async()=>{
    const started=performance.now();let chinese=source;
    if(to_chinese)chinese=(await Promise.all(splitText(source).map(line=>translate({text:line,target_lang:'zh',purpose:'analysis'})))).map(value=>value.text).join('\n\n');
    const body=chinese.replace(/#[\p{L}\p{N}_]+/gu,' ').trim()||chinese;
    const terms=[...new Set(await candidates(body))];if(terms.length>20||terms.some(term=>typeof term!=='string'||term.length<2||term.length>48||!body.includes(term)))throw Error('短语解析返回了无效边界');
    const {decisionWindows,decisionQuestions,CONTENT_QUESTIONS,readDecisions,selectKeywords}=globalThis.OnHoldAnalysisCore,scores=new Map();let content=0,weight=0;
    async function score(window){const local=terms.filter(term=>window.includes(term));const raw=await decide({model:'multilingual',state:window,questions:{...decisionQuestions(local),...CONTENT_QUESTIONS},max_len:1536,head_max_len:192});
     if(raw.usage?.truncated&&Array.from(window).length>100){const chars=Array.from(window),half=Math.floor(chars.length/2);await score(chars.slice(0,half).join(''));await score(chars.slice(half).join(''));return;}
     const value=readDecisions(raw,local);for(const item of value.terms)scores.set(item.term,Math.max(scores.get(item.term)||0,item.score));content+=value.content*window.length;weight+=window.length;
    }
    for(const window of decisionWindows(body))await score(window);
    return {keywords:selectKeywords([...scores].map(([term,score])=>({term,score}))),content:Math.round(content/weight),model:'本地 Laya',elapsed_ms:Math.round(performance.now()-started),cached:false};
   });queue=task.catch(()=>{});return task;
  });
 };
}
