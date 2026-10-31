import{a as G,C as Y}from"./CollapseItem-DwindQr9.js";import{D as Z,a as ee}from"./DescriptionsItem-DgttFqnf.js";import{aR as te,cn as ne,z as u,a7 as $,a6 as S,A as v,d as P,B as A,u as H,b as c,e as f,n as y,D as b,a as ie,x as oe,E as k,C as V,f as j,ad as E,g as le,a4 as ae,I as re,c as I,af as T,F,S as d,U as C,M as h,L as s,O as z,k as N,T as J,Q as L,J as se,P as ce,r as D}from"./onhold-vue-VwSaDf6b.js";import{A as me}from"./Alert-CnB0Doph.js";import{P as ue}from"./DataTable-LWKq3XTg.js";import{u as de}from"./use-houdini-IEkCpu-R.js";import{f as pe}from"./Select-hvOkxKub.js";import{a as ge}from"./api-DaGM3egm.js";import{t as fe}from"./format-DO8LndCS.js";function _e(e){const{textColor3:n,infoColor:t,errorColor:l,successColor:i,warningColor:r,textColor1:a,textColor2:_,railColor:o,fontWeightStrong:m,fontSize:g}=e;return{...ne,contentFontSize:g,titleFontWeight:m,circleBorder:`2px solid ${n}`,circleBorderInfo:`2px solid ${t}`,circleBorderError:`2px solid ${l}`,circleBorderSuccess:`2px solid ${i}`,circleBorderWarning:`2px solid ${r}`,iconColor:n,iconColorInfo:t,iconColorError:l,iconColorSuccess:i,iconColorWarning:r,titleTextColor:a,contentTextColor:_,metaTextColor:n,lineColor:o}}const ve={common:te,self:_e},W=1.25;var he=u("timeline",`
 position: relative;
 width: 100%;
 display: flex;
 flex-direction: column;
 line-height: ${W};
`,[$("horizontal",`
 flex-direction: row;
 `,[S(">",[u("timeline-item",`
 flex-shrink: 0;
 padding-right: 40px;
 `,[$("dashed-line-type",[S(">",[u("timeline-item-timeline",[v("line",`
 background-image: linear-gradient(90deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 10px 1px;
 `)])])]),S(">",[u("timeline-item-content",`
 margin-top: calc(var(--n-icon-size) + 12px);
 `,[S(">",[v("meta",`
 margin-top: 6px;
 margin-bottom: unset;
 `)])]),u("timeline-item-timeline",`
 width: 100%;
 height: calc(var(--n-icon-size) + 12px);
 `,[v("line",`
 left: var(--n-icon-size);
 top: calc(var(--n-icon-size) / 2 - 1px);
 right: 0px;
 width: unset;
 height: 2px;
 `)])])])])]),$("right-placement",[u("timeline-item",[u("timeline-item-content",`
 text-align: right;
 margin-right: calc(var(--n-icon-size) + 12px);
 `),u("timeline-item-timeline",`
 width: var(--n-icon-size);
 right: 0;
 `)])]),$("left-placement",[u("timeline-item",[u("timeline-item-content",`
 margin-left: calc(var(--n-icon-size) + 12px);
 `),u("timeline-item-timeline",`
 left: 0;
 `)])]),u("timeline-item",`
 position: relative;
 `,[S("&:last-child",[u("timeline-item-timeline",[v("line",`
 display: none;
 `)]),u("timeline-item-content",[v("meta",`
 margin-bottom: 0;
 `)])]),u("timeline-item-content",[v("title",`
 margin: var(--n-title-margin);
 font-size: var(--n-title-font-size);
 transition: color .3s var(--n-bezier);
 font-weight: var(--n-title-font-weight);
 color: var(--n-title-text-color);
 `),v("content",`
 transition: color .3s var(--n-bezier);
 font-size: var(--n-content-font-size);
 color: var(--n-content-text-color);
 `),v("meta",`
 transition: color .3s var(--n-bezier);
 font-size: 12px;
 margin-top: 6px;
 margin-bottom: 20px;
 color: var(--n-meta-text-color);
 `)]),$("dashed-line-type",[u("timeline-item-timeline",[v("line",`
 --n-color-start: var(--n-line-color);
 transition: --n-color-start .3s var(--n-bezier);
 background-color: transparent;
 background-image: linear-gradient(180deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 1px 10px;
 `)])]),u("timeline-item-timeline",`
 width: calc(var(--n-icon-size) + 12px);
 position: absolute;
 top: calc(var(--n-title-font-size) * ${W} / 2 - var(--n-icon-size) / 2);
 height: 100%;
 `,[v("circle",`
 border: var(--n-circle-border);
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 border-radius: var(--n-icon-size);
 box-sizing: border-box;
 `),v("icon",`
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 display: flex;
 align-items: center;
 justify-content: center;
 `),v("line",`
 transition: background-color .3s var(--n-bezier);
 position: absolute;
 top: var(--n-icon-size);
 left: calc(var(--n-icon-size) / 2 - 1px);
 bottom: 0px;
 width: 2px;
 background-color: var(--n-line-color);
 `)])])]);const xe={...A.props,horizontal:Boolean,itemPlacement:{type:String,default:"left"},size:{type:String,default:"medium"},iconSize:Number},K=ie("n-timeline");var ze=P({name:"Timeline",props:xe,setup(e,{slots:n}){const{mergedClsPrefixRef:t}=H(e),l=A("Timeline","-timeline",he,ve,e,t);return oe(K,{props:e,mergedThemeRef:l,mergedClsPrefixRef:t}),()=>{const{value:i}=t;return c(),f("div",{class:b([`${i}-timeline`,e.horizontal&&`${i}-timeline--horizontal`,`${i}-timeline--${e.size}-size`,!e.horizontal&&`${i}-timeline--${e.itemPlacement}-placement`])},[y(()=>n.default?.())],2)}}});const be={time:[String,Number],title:String,content:String,color:String,lineType:{type:String,default:"default"},type:{type:String,default:"default"}};var ke=P({name:"TimelineItem",props:be,slots:Object,setup(e){const n=le(K);n||ae("timeline-item","`n-timeline-item` must be placed inside `n-timeline`."),de();const{inlineThemeDisabled:t}=H(),l=I(()=>{const{props:{size:r,iconSize:a},mergedThemeRef:_}=n,{type:o}=e,{self:{titleTextColor:m,contentTextColor:g,metaTextColor:x,lineColor:B,titleFontWeight:M,contentFontSize:p,[T("iconSize",r)]:R,[T("titleMargin",r)]:O,[T("titleFontSize",r)]:U,[T("circleBorder",o)]:q,[T("iconColor",o)]:Q},common:{cubicBezierEaseInOut:X}}=_.value;return{"--n-bezier":X,"--n-circle-border":q,"--n-icon-color":Q,"--n-content-font-size":p,"--n-content-text-color":g,"--n-line-color":B,"--n-meta-text-color":x,"--n-title-font-size":U,"--n-title-font-weight":M,"--n-title-margin":O,"--n-title-text-color":m,"--n-icon-size":pe(a)||R}}),i=t?re("timeline-item",I(()=>{const{props:{size:r,iconSize:a}}=n,{type:_}=e;return`${r[0]}${a||"a"}${_[0]}`}),l,n.props):void 0;return{mergedClsPrefix:n.mergedClsPrefixRef,cssVars:t?void 0:l,themeClass:i?.themeClass,onRender:i?.onRender}},render(){const{mergedClsPrefix:e,color:n,onRender:t,$slots:l}=this;return t?.(),c(),f("div",{class:b([`${e}-timeline-item`,this.themeClass,`${e}-timeline-item--${this.type}-type`,`${e}-timeline-item--${this.lineType}-line-type`]),style:j(this.cssVars)},[k("div",{class:b(`${e}-timeline-item-timeline`)},[k("div",{class:b(`${e}-timeline-item-timeline__line`)},null,2),y(()=>V(l.icon,i=>i?(c(),f("div",{key:1,class:b(`${e}-timeline-item-timeline__icon`),style:j({color:n})},[y(()=>i)],6)):(c(),f("div",{key:2,class:b(`${e}-timeline-item-timeline__circle`),style:j({borderColor:n})},null,6))))],2),k("div",{class:b(`${e}-timeline-item-content`)},[y(()=>V(l.header,i=>i||this.title?(c(),f("div",{key:3,class:b(`${e}-timeline-item-content__title`)},[y(()=>i||this.title)],2)):null)),k("div",{class:b(`${e}-timeline-item-content__content`)},[y(()=>E(l.default,()=>[this.content]))],2),k("div",{class:b(`${e}-timeline-item-content__meta`)},[y(()=>E(l.footer,()=>[this.time]))],2)],2)],6)}});function ye(e){const n=e.input?.telemetry?.generations||[],t=n.filter(o=>o.usage!=null),l=n.length-t.length,i=t.reduce((o,m)=>o+m.usage.input_tokens,0),r=t.reduce((o,m)=>o+m.usage.output_tokens,0),a=t.every(o=>o.usage.cached_input_tokens!=null)?t.reduce((o,m)=>o+m.usage.cached_input_tokens,0):null,_=e.state==="completed"||e.state==="failed";return{attempts:n.length,missing:l,known_tokens:i+r,total_tokens:n.length&&!l?i+r:null,input_tokens:t.length?i:null,output_tokens:t.length?r:null,cached_input_tokens:t.length?a:null,generation_ms:n.length?n.reduce((o,m)=>o+m.duration_ms,0):null,total_ms:_?Math.max(0,e.updated_at-e.created_at):null,send_ms:_&&e.input?.telemetry?.send_started_at!=null?Math.max(0,e.updated_at-e.input.telemetry.send_started_at):null}}function w(e){if(e===null)return"未记录";if(e<1e3)return`${e} 毫秒`;const n=Math.round(e/100)/10;return n<60?`${n} 秒`:`${Math.floor(n/60)} 分 ${Math.round(n%60)} 秒`}const Ce={key:0},$e={key:1},Ee=P({__name:"JobMetrics",props:{job:{},details:{type:Boolean}},setup(e){const n=e,t=I(()=>ye(n.job)),l=I(()=>t.value.total_tokens===null?t.value.known_tokens?`已记录 ${t.value.known_tokens.toLocaleString()} tokens · ${t.value.missing} 次用量未知`:"Token 未记录":`${t.value.total_tokens.toLocaleString()} tokens`);return(i,r)=>{const a=ee,_=Z,o=G,m=Y;return e.job.action==="rewrite_publish"?(c(),f(F,{key:0},[e.details?(c(),f("div",$e,[h(_,{column:1,bordered:"",size:"small"},{default:s(()=>[h(a,{label:"总耗时（含排队与重试等待）"},{default:s(()=>[z(d(C(w)(t.value.total_ms)),1)]),_:1}),h(a,{label:"生成耗时"},{default:s(()=>[z(d(C(w)(t.value.generation_ms)),1)]),_:1}),h(a,{label:"发送耗时"},{default:s(()=>[z(d(C(w)(t.value.send_ms)),1)]),_:1}),h(a,{label:"模型调用次数"},{default:s(()=>[z(d(t.value.attempts||"未记录"),1)]),_:1}),h(a,{label:"Token 用量"},{default:s(()=>[z(d(l.value),1)]),_:1}),h(a,{label:"输入 / 输出"},{default:s(()=>[z(d(t.value.input_tokens??"未知")+" / "+d(t.value.output_tokens??"未知"),1)]),_:1}),h(a,{label:"其中缓存输入"},{default:s(()=>[z(d(t.value.cached_input_tokens??"未知")+"（包含在输入中）",1)]),_:1})]),_:1}),t.value.attempts>0?(c(),N(m,{key:0,class:"mt-12px"},{default:s(()=>[h(o,{title:"逐次模型调用记录"},{default:s(()=>[(c(!0),f(F,null,J(e.job.input?.telemetry?.generations,(g,x)=>(c(),f("p",{key:x}," 第 "+d(x+1)+" 次 · "+d(C(w)(g.duration_ms))+" · "+d(g.usage?`${g.usage.total_tokens} tokens（输入 ${g.usage.input_tokens} / 输出 ${g.usage.output_tokens}）`:"用量未知"),1))),128))]),_:1})]),_:1})):L("",!0)])):(c(),f("small",Ce,"生成 "+d(C(w)(t.value.generation_ms))+" · "+d(l.value),1))],64)):L("",!0)}}}),Se={"aria-label":"执行明细日志",class:"business-stack"},Te={class:"business-muted break-all"},we={class:"business-pre"},Be={key:2},Ne={key:3,role:"status"},We=P({__name:"JobLogs",props:{job:{}},setup(e){const n=e,t={created:"任务创建",queued:"等待执行",rewriting:"模型生成",model:"模型用量",ready:"正文校验",sending:"发送到 X",running:"执行中",completed:"执行完成",failed:"执行失败",cleanup:"页面清理",progress:"执行进度",sources:"新闻取材"},l=D(1),i=D(null),r=D("");let a=0;return se([()=>n.job,l],async(_,o,m)=>{const g=++a;m(()=>a++);try{const x=await ge("job_logs",{account:n.job.account,id:n.job.id,offset:(l.value-1)*20});g===a&&(i.value=x,l.value=Math.floor(x.offset/20)+1,r.value="")}catch(x){g===a&&(r.value=String(x))}},{immediate:!0}),(_,o)=>{const m=me,g=ke,x=ze,B=ce,M=ue;return c(),f("section",Se,[o[3]||(o[3]=k("h3",{class:"font-medium"},"执行明细日志",-1)),k("p",Te,"任务 ID："+d(e.job.id),1),r.value?(c(),N(m,{key:0,type:"error"},{default:s(()=>[z(d(r.value),1)]),_:1})):L("",!0),i.value?.items.length?(c(),N(x,{key:1},{default:s(()=>[(c(!0),f(F,null,J(i.value.items,p=>(c(),N(g,{key:p.id,time:C(fe)(p.at),title:t[p.stage]||p.stage,type:p.stage==="failed"?"error":p.stage==="completed"?"success":"default"},{default:s(()=>[k("p",we,d(p.message),1)]),_:2},1032,["time","title","type"]))),128))]),_:1})):i.value?(c(),f("p",Be," 暂无明细日志。升级前的任务仍可查看已有结果与模型调用记录。 ")):(c(),f("p",Ne,"正在读取日志…")),h(M,{role:"navigation",page:l.value,"onUpdate:page":o[0]||(o[0]=p=>l.value=p),"page-size":20,"item-count":i.value?.total||0,class:"flex-wrap","aria-label":"执行明细日志分页"},{prev:s(({page:p})=>[h(B,{text:"",disabled:p<=1,"aria-label":"上一页"},{default:s(()=>[...o[1]||(o[1]=[z("上一页",-1)])]),_:1},8,["disabled"])]),next:s(({page:p,pageCount:R})=>[h(B,{text:"",disabled:p>=R,"aria-label":"下一页"},{default:s(()=>[...o[2]||(o[2]=[z("下一页",-1)])]),_:1},8,["disabled"])]),prefix:s(()=>[z("共 "+d(i.value?.total||0)+" 条 · 每页 20 条",1)]),_:1},8,["page","item-count"])])}}});export{Ee as _,We as a};
