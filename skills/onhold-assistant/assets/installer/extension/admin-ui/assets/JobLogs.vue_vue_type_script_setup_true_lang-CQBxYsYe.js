import{A as J}from"./Alert-CBDSyu-z.js";import{aR as U,cn as q,z as o,a7 as _,a6 as y,A as c,d as I,B as L,u as W,b as m,e as u,n as b,D as p,a as Q,x as X,E as h,C as R,f as B,ad as F,g as G,a4 as Y,I as Z,c as V,af as C,J as ee,S,k as P,L as v,O as k,Q as te,F as ie,T as ne,U as oe,M as N,P as re,r as j}from"./onhold-vue-DvEWy-vp.js";import{P as le}from"./DataTable-JHoA5CqQ.js";import{u as ae}from"./use-houdini-DuLPPHE2.js";import{f as se}from"./Select-BrLaBIWN.js";import{a as ce}from"./api-DaGM3egm.js";import{t as me}from"./format-D1KE0cI2.js";function de(e){const{textColor3:i,infoColor:a,errorColor:n,successColor:t,warningColor:s,textColor1:d,textColor2:z,railColor:l,fontWeightStrong:x,fontSize:f}=e;return{...q,contentFontSize:f,titleFontWeight:x,circleBorder:`2px solid ${i}`,circleBorderInfo:`2px solid ${a}`,circleBorderError:`2px solid ${n}`,circleBorderSuccess:`2px solid ${t}`,circleBorderWarning:`2px solid ${s}`,iconColor:i,iconColorInfo:a,iconColorError:n,iconColorSuccess:t,iconColorWarning:s,titleTextColor:d,contentTextColor:z,metaTextColor:i,lineColor:l}}const pe={common:U,self:de},E=1.25;var ue=o("timeline",`
 position: relative;
 width: 100%;
 display: flex;
 flex-direction: column;
 line-height: ${E};
`,[_("horizontal",`
 flex-direction: row;
 `,[y(">",[o("timeline-item",`
 flex-shrink: 0;
 padding-right: 40px;
 `,[_("dashed-line-type",[y(">",[o("timeline-item-timeline",[c("line",`
 background-image: linear-gradient(90deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 10px 1px;
 `)])])]),y(">",[o("timeline-item-content",`
 margin-top: calc(var(--n-icon-size) + 12px);
 `,[y(">",[c("meta",`
 margin-top: 6px;
 margin-bottom: unset;
 `)])]),o("timeline-item-timeline",`
 width: 100%;
 height: calc(var(--n-icon-size) + 12px);
 `,[c("line",`
 left: var(--n-icon-size);
 top: calc(var(--n-icon-size) / 2 - 1px);
 right: 0px;
 width: unset;
 height: 2px;
 `)])])])])]),_("right-placement",[o("timeline-item",[o("timeline-item-content",`
 text-align: right;
 margin-right: calc(var(--n-icon-size) + 12px);
 `),o("timeline-item-timeline",`
 width: var(--n-icon-size);
 right: 0;
 `)])]),_("left-placement",[o("timeline-item",[o("timeline-item-content",`
 margin-left: calc(var(--n-icon-size) + 12px);
 `),o("timeline-item-timeline",`
 left: 0;
 `)])]),o("timeline-item",`
 position: relative;
 `,[y("&:last-child",[o("timeline-item-timeline",[c("line",`
 display: none;
 `)]),o("timeline-item-content",[c("meta",`
 margin-bottom: 0;
 `)])]),o("timeline-item-content",[c("title",`
 margin: var(--n-title-margin);
 font-size: var(--n-title-font-size);
 transition: color .3s var(--n-bezier);
 font-weight: var(--n-title-font-weight);
 color: var(--n-title-text-color);
 `),c("content",`
 transition: color .3s var(--n-bezier);
 font-size: var(--n-content-font-size);
 color: var(--n-content-text-color);
 `),c("meta",`
 transition: color .3s var(--n-bezier);
 font-size: 12px;
 margin-top: 6px;
 margin-bottom: 20px;
 color: var(--n-meta-text-color);
 `)]),_("dashed-line-type",[o("timeline-item-timeline",[c("line",`
 --n-color-start: var(--n-line-color);
 transition: --n-color-start .3s var(--n-bezier);
 background-color: transparent;
 background-image: linear-gradient(180deg, var(--n-color-start), var(--n-color-start) 50%, transparent 50%, transparent 100%);
 background-size: 1px 10px;
 `)])]),o("timeline-item-timeline",`
 width: calc(var(--n-icon-size) + 12px);
 position: absolute;
 top: calc(var(--n-title-font-size) * ${E} / 2 - var(--n-icon-size) / 2);
 height: 100%;
 `,[c("circle",`
 border: var(--n-circle-border);
 transition:
 background-color .3s var(--n-bezier),
 border-color .3s var(--n-bezier);
 width: var(--n-icon-size);
 height: var(--n-icon-size);
 border-radius: var(--n-icon-size);
 box-sizing: border-box;
 `),c("icon",`
 color: var(--n-icon-color);
 font-size: var(--n-icon-size);
 height: var(--n-icon-size);
 width: var(--n-icon-size);
 display: flex;
 align-items: center;
 justify-content: center;
 `),c("line",`
 transition: background-color .3s var(--n-bezier);
 position: absolute;
 top: var(--n-icon-size);
 left: calc(var(--n-icon-size) / 2 - 1px);
 bottom: 0px;
 width: 2px;
 background-color: var(--n-line-color);
 `)])])]);const fe={...L.props,horizontal:Boolean,itemPlacement:{type:String,default:"left"},size:{type:String,default:"medium"},iconSize:Number},M=Q("n-timeline");var ge=I({name:"Timeline",props:fe,setup(e,{slots:i}){const{mergedClsPrefixRef:a}=W(e),n=L("Timeline","-timeline",ue,pe,e,a);return X(M,{props:e,mergedThemeRef:n,mergedClsPrefixRef:a}),()=>{const{value:t}=a;return m(),u("div",{class:p([`${t}-timeline`,e.horizontal&&`${t}-timeline--horizontal`,`${t}-timeline--${e.size}-size`,!e.horizontal&&`${t}-timeline--${e.itemPlacement}-placement`])},[b(()=>i.default?.())],2)}}});const ve={time:[String,Number],title:String,content:String,color:String,lineType:{type:String,default:"default"},type:{type:String,default:"default"}};var he=I({name:"TimelineItem",props:ve,slots:Object,setup(e){const i=G(M);i||Y("timeline-item","`n-timeline-item` must be placed inside `n-timeline`."),ae();const{inlineThemeDisabled:a}=W(),n=V(()=>{const{props:{size:s,iconSize:d},mergedThemeRef:z}=i,{type:l}=e,{self:{titleTextColor:x,contentTextColor:f,metaTextColor:g,lineColor:$,titleFontWeight:T,contentFontSize:r,[C("iconSize",s)]:w,[C("titleMargin",s)]:A,[C("titleFontSize",s)]:D,[C("circleBorder",l)]:H,[C("iconColor",l)]:K},common:{cubicBezierEaseInOut:O}}=z.value;return{"--n-bezier":O,"--n-circle-border":H,"--n-icon-color":K,"--n-content-font-size":r,"--n-content-text-color":f,"--n-line-color":$,"--n-meta-text-color":g,"--n-title-font-size":D,"--n-title-font-weight":T,"--n-title-margin":A,"--n-title-text-color":x,"--n-icon-size":se(d)||w}}),t=a?Z("timeline-item",V(()=>{const{props:{size:s,iconSize:d}}=i,{type:z}=e;return`${s[0]}${d||"a"}${z[0]}`}),n,i.props):void 0;return{mergedClsPrefix:i.mergedClsPrefixRef,cssVars:a?void 0:n,themeClass:t?.themeClass,onRender:t?.onRender}},render(){const{mergedClsPrefix:e,color:i,onRender:a,$slots:n}=this;return a?.(),m(),u("div",{class:p([`${e}-timeline-item`,this.themeClass,`${e}-timeline-item--${this.type}-type`,`${e}-timeline-item--${this.lineType}-line-type`]),style:B(this.cssVars)},[h("div",{class:p(`${e}-timeline-item-timeline`)},[h("div",{class:p(`${e}-timeline-item-timeline__line`)},null,2),b(()=>R(n.icon,t=>t?(m(),u("div",{key:1,class:p(`${e}-timeline-item-timeline__icon`),style:B({color:i})},[b(()=>t)],6)):(m(),u("div",{key:2,class:p(`${e}-timeline-item-timeline__circle`),style:B({borderColor:i})},null,6))))],2),h("div",{class:p(`${e}-timeline-item-content`)},[b(()=>R(n.header,t=>t||this.title?(m(),u("div",{key:3,class:p(`${e}-timeline-item-content__title`)},[b(()=>t||this.title)],2)):null)),h("div",{class:p(`${e}-timeline-item-content__content`)},[b(()=>F(n.default,()=>[this.content]))],2),h("div",{class:p(`${e}-timeline-item-content__meta`)},[b(()=>F(n.footer,()=>[this.time]))],2)],2)],6)}});const ze={"aria-label":"执行明细日志",class:"business-stack"},xe={class:"business-muted break-all"},be={class:"business-pre"},_e={key:2},ye={key:3,role:"status"},Pe=I({__name:"JobLogs",props:{job:{}},setup(e){const i=e,a={created:"任务创建",queued:"等待执行",rewriting:"模型生成",model:"模型用量",ready:"正文校验",sending:"发送到 X",running:"执行中",completed:"执行完成",failed:"执行失败",cleanup:"页面清理",progress:"执行进度",sources:"新闻取材"},n=j(1),t=j(null),s=j("");let d=0;return ee([()=>i.job,n],async(z,l,x)=>{const f=++d;x(()=>d++);try{const g=await ce("job_logs",{account:i.job.account,id:i.job.id,offset:(n.value-1)*20});f===d&&(t.value=g,n.value=Math.floor(g.offset/20)+1,s.value="")}catch(g){f===d&&(s.value=String(g))}},{immediate:!0}),(z,l)=>{const x=J,f=he,g=ge,$=re,T=le;return m(),u("section",ze,[l[3]||(l[3]=h("h3",{class:"font-medium"},"执行明细日志",-1)),h("p",xe,"任务 ID："+S(e.job.id),1),s.value?(m(),P(x,{key:0,type:"error"},{default:v(()=>[k(S(s.value),1)]),_:1})):te("",!0),t.value?.items.length?(m(),P(g,{key:1},{default:v(()=>[(m(!0),u(ie,null,ne(t.value.items,r=>(m(),P(f,{key:r.id,time:oe(me)(r.at),title:a[r.stage]||r.stage,type:r.stage==="failed"?"error":r.stage==="completed"?"success":"default"},{default:v(()=>[h("p",be,S(r.message),1)]),_:2},1032,["time","title","type"]))),128))]),_:1})):t.value?(m(),u("p",_e," 暂无明细日志。升级前的任务仍可查看已有结果与模型调用记录。 ")):(m(),u("p",ye,"正在读取日志…")),N(T,{role:"navigation",page:n.value,"onUpdate:page":l[0]||(l[0]=r=>n.value=r),"page-size":20,"item-count":t.value?.total||0,class:"flex-wrap","aria-label":"执行明细日志分页"},{prev:v(({page:r})=>[N($,{text:"",disabled:r<=1,"aria-label":"上一页"},{default:v(()=>[...l[1]||(l[1]=[k("上一页",-1)])]),_:1},8,["disabled"])]),next:v(({page:r,pageCount:w})=>[N($,{text:"",disabled:r>=w,"aria-label":"下一页"},{default:v(()=>[...l[2]||(l[2]=[k("下一页",-1)])]),_:1},8,["disabled"])]),prefix:v(()=>[k("共 "+S(t.value?.total||0)+" 条 · 每页 20 条",1)]),_:1},8,["page","item-count"])])}}});export{Pe as _};
