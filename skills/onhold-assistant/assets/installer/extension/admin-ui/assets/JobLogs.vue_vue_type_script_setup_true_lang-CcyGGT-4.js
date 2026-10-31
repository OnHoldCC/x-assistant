import{a as G,C as Y}from"./CollapseItem-DwindQr9.js";import{D as Z,a as ee}from"./DescriptionsItem-DgttFqnf.js";import{aR as te,cn as ne,z as d,a7 as $,a6 as S,A as _,d as P,B as A,u as H,b as c,e as f,n as y,D as z,a as ie,x as oe,E as k,C as V,f as R,ad as E,g as le,a4 as ae,I as re,c as I,af as T,F,S as p,U as C,M as v,L as u,O as x,k as N,T as J,Q as L,J as se,P as ce,r as D}from"./onhold-vue-VwSaDf6b.js";import{A as me}from"./Alert-CnB0Doph.js";import{P as ue}from"./DataTable-Qx4Pp9DB.js";import{u as de}from"./use-houdini-IEkCpu-R.js";import{f as pe}from"./Select-hvOkxKub.js";import{a as ge}from"./api-DaGM3egm.js";import{t as fe}from"./format-DBmTApMD.js";function _e(e){const{textColor3:n,infoColor:t,errorColor:i,successColor:o,warningColor:m,textColor1:l,textColor2:h,railColor:s,fontWeightStrong:r,fontSize:a}=e;return{...ne,contentFontSize:a,titleFontWeight:r,circleBorder:`2px solid ${n}`,circleBorderInfo:`2px solid ${t}`,circleBorderError:`2px solid ${i}`,circleBorderSuccess:`2px solid ${o}`,circleBorderWarning:`2px solid ${m}`,iconColor:n,iconColorInfo:t,iconColorError:i,iconColorSuccess:o,iconColorWarning:m,titleTextColor:l,contentTextColor:h,metaTextColor:n,lineColor:s}}const ve={common:te,self:_e},W=1.25;var he=d("timeline",`
 position: relative;
 width: 100%;
 display: flex;
 flex-direction: column;
 line-height: ${W};
`,[$("horizontal",`
 flex-direction: row;
 `,[S(">",[d("timeline-item",`
 flex-shrink: 0;
 padding-right: 40px;
 `,[$("dashed-line-type",[S(">",[d("timeline-item-timeline",[_("line",`
 background-image: linear-gradient(90deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 10px 1px;
 `)])])]),S(">",[d("timeline-item-content",`
 margin-top: calc(var(--n-icon-size) + 12px);
 `,[S(">",[_("meta",`
 margin-top: 6px;
 margin-bottom: unset;
 `)])]),d("timeline-item-timeline",`
 width: 100%;
 height: calc(var(--n-icon-size) + 12px);
 `,[_("line",`
 left: var(--n-icon-size);
 top: calc(var(--n-icon-size) / 2 - 1px);
 right: 0px;
 width: unset;
 height: 2px;
 `)])])])])]),$("right-placement",[d("timeline-item",[d("timeline-item-content",`
 text-align: right;
 margin-right: calc(var(--n-icon-size) + 12px);
 `),d("timeline-item-timeline",`
 width: var(--n-icon-size);
 right: 0;
 `)])]),$("left-placement",[d("timeline-item",[d("timeline-item-content",`
 margin-left: calc(var(--n-icon-size) + 12px);
 `),d("timeline-item-timeline",`
 left: 0;
 `)])]),d("timeline-item",`
 position: relative;
 `,[S("&:last-child",[d("timeline-item-timeline",[_("line",`
 display: none;
 `)]),d("timeline-item-content",[_("meta",`
 margin-bottom: 0;
 `)])]),d("timeline-item-content",[_("title",`
 margin: var(--n-title-margin);
 font-size: var(--n-title-font-size);
 transition: color .3s var(--n-bezier);
 font-weight: var(--n-title-font-weight);
 color: var(--n-title-text-color);
 `),_("content",`
 transition: color .3s var(--n-bezier);
 font-size: var(--n-content-font-size);
 color: var(--n-content-text-color);
 `),_("meta",`
 transition: color .3s var(--n-bezier);
 font-size: 12px;
 margin-top: 6px;
 margin-bottom: 20px;
 color: var(--n-meta-text-color);
 `)]),$("dashed-line-type",[d("timeline-item-timeline",[_("line",`
 --n-color-start: var(--n-line-color);
 transition: --n-color-start .3s var(--n-bezier);
 background-color: transparent;
 background-image: linear-gradient(180deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 1px 10px;
 `)])]),d("timeline-item-timeline",`
 width: calc(var(--n-icon-size) + 12px);
 position: absolute;
 top: calc(var(--n-title-font-size) * ${W} / 2 - var(--n-icon-size) / 2);
 height: 100%;
 `,[_("circle",`
 border: var(--n-circle-border);
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 border-radius: var(--n-icon-size);
 box-sizing: border-box;
 `),_("icon",`
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 display: flex;
 align-items: center;
 justify-content: center;
 `),_("line",`
 transition: background-color .3s var(--n-bezier);
 position: absolute;
 top: var(--n-icon-size);
 left: calc(var(--n-icon-size) / 2 - 1px);
 bottom: 0px;
 width: 2px;
 background-color: var(--n-line-color);
 `)])])]);const be={...A.props,horizontal:Boolean,itemPlacement:{type:String,default:"left"},size:{type:String,default:"medium"},iconSize:Number},K=ie("n-timeline");var xe=P({name:"Timeline",props:be,setup(e,{slots:n}){const{mergedClsPrefixRef:t}=H(e),i=A("Timeline","-timeline",he,ve,e,t);return oe(K,{props:e,mergedThemeRef:i,mergedClsPrefixRef:t}),()=>{const{value:o}=t;return c(),f("div",{class:z([`${o}-timeline`,e.horizontal&&`${o}-timeline--horizontal`,`${o}-timeline--${e.size}-size`,!e.horizontal&&`${o}-timeline--${e.itemPlacement}-placement`])},[y(()=>n.default?.())],2)}}});const ze={time:[String,Number],title:String,content:String,color:String,lineType:{type:String,default:"default"},type:{type:String,default:"default"}};var ke=P({name:"TimelineItem",props:ze,slots:Object,setup(e){const n=le(K);n||ae("timeline-item","`n-timeline-item` must be placed inside `n-timeline`."),de();const{inlineThemeDisabled:t}=H(),i=I(()=>{const{props:{size:m,iconSize:l},mergedThemeRef:h}=n,{type:s}=e,{self:{titleTextColor:r,contentTextColor:a,metaTextColor:b,lineColor:B,titleFontWeight:M,contentFontSize:g,[T("iconSize",m)]:j,[T("titleMargin",m)]:O,[T("titleFontSize",m)]:U,[T("circleBorder",s)]:q,[T("iconColor",s)]:Q},common:{cubicBezierEaseInOut:X}}=h.value;return{"--n-bezier":X,"--n-circle-border":q,"--n-icon-color":Q,"--n-content-font-size":g,"--n-content-text-color":a,"--n-line-color":B,"--n-meta-text-color":b,"--n-title-font-size":U,"--n-title-font-weight":M,"--n-title-margin":O,"--n-title-text-color":r,"--n-icon-size":pe(l)||j}}),o=t?re("timeline-item",I(()=>{const{props:{size:m,iconSize:l}}=n,{type:h}=e;return`${m[0]}${l||"a"}${h[0]}`}),i,n.props):void 0;return{mergedClsPrefix:n.mergedClsPrefixRef,cssVars:t?void 0:i,themeClass:o?.themeClass,onRender:o?.onRender}},render(){const{mergedClsPrefix:e,color:n,onRender:t,$slots:i}=this;return t?.(),c(),f("div",{class:z([`${e}-timeline-item`,this.themeClass,`${e}-timeline-item--${this.type}-type`,`${e}-timeline-item--${this.lineType}-line-type`]),style:R(this.cssVars)},[k("div",{class:z(`${e}-timeline-item-timeline`)},[k("div",{class:z(`${e}-timeline-item-timeline__line`)},null,2),y(()=>V(i.icon,o=>o?(c(),f("div",{key:1,class:z(`${e}-timeline-item-timeline__icon`),style:R({color:n})},[y(()=>o)],6)):(c(),f("div",{key:2,class:z(`${e}-timeline-item-timeline__circle`),style:R({borderColor:n})},null,6))))],2),k("div",{class:z(`${e}-timeline-item-content`)},[y(()=>V(i.header,o=>o||this.title?(c(),f("div",{key:3,class:z(`${e}-timeline-item-content__title`)},[y(()=>o||this.title)],2)):null)),k("div",{class:z(`${e}-timeline-item-content__content`)},[y(()=>E(i.default,()=>[this.content]))],2),k("div",{class:z(`${e}-timeline-item-content__meta`)},[y(()=>E(i.footer,()=>[this.time]))],2)],2)],6)}});function ye(e){const n=e.input?.telemetry?.generations||[],t=e.input?.model_not_called===!0&&n.length===0?0:null,i=n.filter(r=>r.usage!=null),o=n.length-i.length,m=i.reduce((r,a)=>r+a.usage.input_tokens,0),l=i.reduce((r,a)=>r+a.usage.output_tokens,0),h=i.every(r=>r.usage.cached_input_tokens!=null)?i.reduce((r,a)=>r+a.usage.cached_input_tokens,0):null,s=e.state==="completed"||e.state==="failed";return{attempts:n.length,missing:o,known_tokens:m+l,total_tokens:n.length&&!o?m+l:t,input_tokens:i.length?m:t,output_tokens:i.length?l:t,cached_input_tokens:i.length?h:t,generation_ms:n.length?n.reduce((r,a)=>r+a.duration_ms,0):t,total_ms:s?Math.max(0,e.updated_at-e.created_at):null,send_ms:s&&e.input?.telemetry?.send_started_at!=null?Math.max(0,e.updated_at-e.input.telemetry.send_started_at):null}}function w(e){if(e===null)return"未记录";if(e<1e3)return`${e} 毫秒`;const n=Math.round(e/100)/10;return n<60?`${n} 秒`:`${Math.floor(n/60)} 分 ${Math.round(n%60)} 秒`}const Ce={key:0},$e={key:1},Se={key:2},We=P({__name:"JobMetrics",props:{job:{},details:{type:Boolean}},setup(e){const n=e,t=I(()=>ye(n.job)),i=I(()=>t.value.total_tokens===null?t.value.known_tokens?`已记录 ${t.value.known_tokens.toLocaleString()} tokens · ${t.value.missing} 次用量未知`:"Token 未记录":`${t.value.total_tokens.toLocaleString()} tokens`);return(o,m)=>{const l=ee,h=Z,s=G,r=Y;return e.job.action==="rewrite_publish"?(c(),f(F,{key:0},[!e.details&&e.job.input?.model_not_called&&t.value.attempts===0?(c(),f("small",Ce,"未调用模型 · 0 tokens")):e.details?(c(),f("div",Se,[v(h,{column:1,bordered:"",size:"small"},{default:u(()=>[v(l,{label:"总耗时（含排队与重试等待）"},{default:u(()=>[x(p(C(w)(t.value.total_ms)),1)]),_:1}),v(l,{label:"生成耗时"},{default:u(()=>[x(p(C(w)(t.value.generation_ms)),1)]),_:1}),v(l,{label:"发送耗时"},{default:u(()=>[x(p(C(w)(t.value.send_ms)),1)]),_:1}),v(l,{label:"模型调用次数"},{default:u(()=>[x(p(t.value.attempts||(e.job.input?.model_not_called?0:"未记录")),1)]),_:1}),v(l,{label:"Token 用量"},{default:u(()=>[x(p(i.value),1)]),_:1}),v(l,{label:"输入 / 输出"},{default:u(()=>[x(p(t.value.input_tokens??"未知")+" / "+p(t.value.output_tokens??"未知"),1)]),_:1}),v(l,{label:"其中缓存输入"},{default:u(()=>[x(p(t.value.cached_input_tokens??"未知")+"（包含在输入中）",1)]),_:1})]),_:1}),t.value.attempts>0?(c(),N(r,{key:0,class:"mt-12px"},{default:u(()=>[v(s,{title:"逐次模型调用记录"},{default:u(()=>[(c(!0),f(F,null,J(e.job.input?.telemetry?.generations,(a,b)=>(c(),f("p",{key:b}," 第 "+p(b+1)+" 次 · "+p(C(w)(a.duration_ms))+" · "+p(a.usage?`${a.usage.total_tokens} tokens（输入 ${a.usage.input_tokens} / 输出 ${a.usage.output_tokens}）`:"用量未知"),1))),128))]),_:1})]),_:1})):L("",!0)])):(c(),f("small",$e,"生成 "+p(C(w)(t.value.generation_ms))+" · "+p(i.value),1))],64)):L("",!0)}}}),Te={"aria-label":"执行明细日志",class:"business-stack"},we={class:"business-muted break-all"},Be={class:"business-pre"},Ne={key:2},Ie={key:3,role:"status"},Ae=P({__name:"JobLogs",props:{job:{}},setup(e){const n=e,t={created:"任务创建",queued:"等待执行",rewriting:"模型生成",model:"模型用量",ready:"正文校验",sending:"发送到 X",running:"执行中",completed:"执行完成",failed:"执行失败",cleanup:"页面清理",progress:"执行进度",sources:"新闻取材"},i=D(1),o=D(null),m=D("");let l=0;return se([()=>n.job,i],async(h,s,r)=>{const a=++l;r(()=>l++);try{const b=await ge("job_logs",{account:n.job.account,id:n.job.id,offset:(i.value-1)*20});a===l&&(o.value=b,i.value=Math.floor(b.offset/20)+1,m.value="")}catch(b){a===l&&(m.value=String(b))}},{immediate:!0}),(h,s)=>{const r=me,a=ke,b=xe,B=ce,M=ue;return c(),f("section",Te,[s[3]||(s[3]=k("h3",{class:"font-medium"},"执行明细日志",-1)),k("p",we,"任务 ID："+p(e.job.id),1),m.value?(c(),N(r,{key:0,type:"error"},{default:u(()=>[x(p(m.value),1)]),_:1})):L("",!0),o.value?.items.length?(c(),N(b,{key:1},{default:u(()=>[(c(!0),f(F,null,J(o.value.items,g=>(c(),N(a,{key:g.id,time:C(fe)(g.at),title:t[g.stage]||g.stage,type:g.stage==="failed"?"error":g.stage==="completed"?"success":"default"},{default:u(()=>[k("p",Be,p(g.message),1)]),_:2},1032,["time","title","type"]))),128))]),_:1})):o.value?(c(),f("p",Ne," 暂无明细日志。升级前的任务仍可查看已有结果与模型调用记录。 ")):(c(),f("p",Ie,"正在读取日志…")),v(M,{role:"navigation",page:i.value,"onUpdate:page":s[0]||(s[0]=g=>i.value=g),"page-size":20,"item-count":o.value?.total||0,class:"flex-wrap","aria-label":"执行明细日志分页"},{prev:u(({page:g})=>[v(B,{text:"",disabled:g<=1,"aria-label":"上一页"},{default:u(()=>[...s[1]||(s[1]=[x("上一页",-1)])]),_:1},8,["disabled"])]),next:u(({page:g,pageCount:j})=>[v(B,{text:"",disabled:g>=j,"aria-label":"下一页"},{default:u(()=>[...s[2]||(s[2]=[x("下一页",-1)])]),_:1},8,["disabled"])]),prefix:u(()=>[x("共 "+p(o.value?.total||0)+" 条 · 每页 20 条",1)]),_:1},8,["page","item-count"])])}}});export{We as _,Ae as a};
