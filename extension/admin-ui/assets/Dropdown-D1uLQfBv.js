import{a1 as Ae,a2 as Fe,o as Te,a3 as Z,$ as Me,aQ as Ee,a0 as ee,J as he,z as R,a7 as N,a6 as _,d as D,B as re,ap as ge,j as G,m as q,u as xe,cB as je,I as ke,c as m,a as ve,b as l,e as b,D as C,r as F,k as x,n as S,aa as te,F as $,aY as Se,g as T,aD as Pe,l as ne,as as Le,x as W,E as oe,cC as He,aB as Ve,aC as Ue,aF as We,b2 as ye,A as z,au as qe,y as I,cD as Ge,aL as pe,af as A}from"./onhold-vue-BwEsA1MS.js";import{f as Je,B as Qe,V as Xe,c as Ye,r as Ze,p as Re,P as eo,k as oo}from"./Select-BUUgEECL.js";import{C as no}from"./ChevronRight-BDp-s6UM.js";import{h as be,u as to}from"./get-slot-D3Egee3_.js";function ro(e={},o){const r=Ee({ctrl:!1,command:!1,win:!1,shift:!1,tab:!1}),{keydown:n,keyup:i}=e,a=s=>{switch(s.key){case"Control":r.ctrl=!0;break;case"Meta":r.command=!0,r.win=!0;break;case"Shift":r.shift=!0;break;case"Tab":r.tab=!0;break}n!==void 0&&Object.keys(n).forEach(g=>{if(g!==s.key)return;const y=n[g];if(typeof y=="function")y(s);else{const{stop:P=!1,prevent:k=!1}=y;P&&s.stopPropagation(),k&&s.preventDefault(),y.handler(s)}})},d=s=>{switch(s.key){case"Control":r.ctrl=!1;break;case"Meta":r.command=!1,r.win=!1;break;case"Shift":r.shift=!1;break;case"Tab":r.tab=!1;break}i!==void 0&&Object.keys(i).forEach(g=>{if(g!==s.key)return;const y=i[g];if(typeof y=="function")y(s);else{const{stop:P=!1,prevent:k=!1}=y;P&&s.stopPropagation(),k&&s.preventDefault(),y.handler(s)}})},u=()=>{(o===void 0||o.value)&&(ee("keydown",document,a),ee("keyup",document,d)),o!==void 0&&he(o,s=>{s?(ee("keydown",document,a),ee("keyup",document,d)):(Z("keydown",document,a),Z("keyup",document,d))})};return Ae()?(Fe(u),Te(()=>{(o===void 0||o.value)&&(Z("keydown",document,a),Z("keyup",document,d))})):u(),Me(r)}function io(e){return o=>{o?e.value=o.$el:e.value=null}}var ao=R("icon",`
 height: 1em;
 width: 1em;
 line-height: 1em;
 text-align: center;
 display: inline-block;
 position: relative;
 fill: currentColor;
`,[N("color-transition",{transition:"color .3s var(--n-bezier)"}),N("depth",{color:"var(--n-color)"},[_("svg",{opacity:"var(--n-opacity)",transition:"opacity .3s var(--n-bezier)"})]),_("svg",{height:"1em",width:"1em"})]);const so={...re.props,depth:[String,Number],size:[Number,String],color:String,component:[Object,Function]},lo=D({_n_icon__:!0,name:"Icon",inheritAttrs:!1,props:so,setup(e){const{mergedClsPrefixRef:o,inlineThemeDisabled:r}=xe(e),n=re("Icon","-icon",ao,je,e,o),i=m(()=>{const{depth:d}=e,{common:{cubicBezierEaseInOut:u},self:s}=n.value;if(d!==void 0){const{color:g,[`opacity${d}Depth`]:y}=s;return{"--n-bezier":u,"--n-color":g,"--n-opacity":y}}return{"--n-bezier":u,"--n-color":"","--n-opacity":""}}),a=r?ke("icon",m(()=>`${e.depth||"d"}`),i,e):void 0;return{mergedClsPrefix:o,mergedStyle:m(()=>{const{size:d,color:u}=e;return{fontSize:Je(d),color:u}}),cssVars:r?void 0:i,themeClass:a?.themeClass,onRender:a?.onRender}},render(){const{$parent:e,depth:o,mergedClsPrefix:r,component:n,onRender:i,themeClass:a}=this;return e?.$options?._n_icon__&&ge("icon","don't wrap `n-icon` inside `n-icon`"),i?.(),G("i",q(this.$attrs,{role:"img",class:[`${r}-icon`,a,{[`${r}-icon--depth`]:o,[`${r}-icon--color-transition`]:o!==void 0}],style:[this.cssVars,this.mergedStyle]}),n?G(n):this.$slots.default?.())}}),me=ve("n-dropdown-menu"),ie=ve("n-dropdown"),we=ve("n-dropdown-option");var Ne=D({name:"DropdownDivider",props:{clsPrefix:{type:String,required:!0}},render(){return l(),b("div",{class:C(`${this.clsPrefix}-dropdown-divider`)},null,2)}});function fe(e,o){return e.type==="submenu"||e.type===void 0&&e[o]!==void 0}function co(e){return e.type==="group"}function Ce(e){return e.type==="divider"}function uo(e){return e.type==="render"}function po(e,o,r){const n=F(e.value);let i=null;return he(e,a=>{i!==null&&window.clearTimeout(i),a===!0?r&&!r.value?n.value=!0:i=window.setTimeout(()=>{n.value=!0},o):n.value=!1}),n}var Ie=D({name:"DropdownOption",props:{clsPrefix:{type:String,required:!0},tmNode:{type:Object,required:!0},parentKey:{type:[String,Number],default:null},placement:{type:String,default:"right-start"},props:Object,scrollable:Boolean},setup(e){const o=T(ie),{hoverKeyRef:r,keyboardKeyRef:n,lastToggledSubmenuKeyRef:i,pendingKeyPathRef:a,activeKeyPathRef:d,animatedRef:u,mergedShowRef:s,renderLabelRef:g,renderIconRef:y,labelFieldRef:P,childrenFieldRef:k,renderOptionRef:M,nodePropsRef:E,menuPropsRef:K}=o,j=T(we,null),L=T(me),H=T(Pe),X=m(()=>e.tmNode.rawNode),J=m(()=>{const{value:t}=k;return fe(e.tmNode.rawNode,t)}),ae=m(()=>{const{disabled:t}=e.tmNode;return t}),de=m(()=>{if(!J.value)return!1;const{key:t,disabled:c}=e.tmNode;if(c)return!1;const{value:w}=r,{value:B}=n,{value:ue}=i,{value:O}=a;return w!==null?O.includes(t):B!==null?O.includes(t)&&O[O.length-1]!==t:ue!==null?O.includes(t):!1}),se=m(()=>n.value===null&&!u.value),le=po(de,300,se),ce=m(()=>!!j?.enteringSubmenuRef.value),V=F(!1);W(we,{enteringSubmenuRef:V});function U(){V.value=!0}function Y(){V.value=!1}function Q(){const{parentKey:t,tmNode:c}=e;c.disabled||s.value&&(i.value=t,n.value=null,r.value=c.key)}function p(){const{tmNode:t}=e;t.disabled||s.value&&r.value!==t.key&&Q()}function f(t){if(e.tmNode.disabled||!s.value)return;const{relatedTarget:c}=t;c&&!be({target:c},"dropdownOption")&&!be({target:c},"scrollbarRail")&&(r.value=null)}function v(){const{value:t}=J,{tmNode:c}=e;s.value&&!t&&!c.disabled&&(o.doSelect(c.key,c.rawNode),o.doUpdateShow(!1))}return{labelField:P,renderLabel:g,renderIcon:y,siblingHasIcon:L.showIconRef,siblingHasSubmenu:L.hasSubmenuRef,menuProps:K,popoverBody:H,animated:u,mergedShowSubmenu:m(()=>le.value&&!ce.value),rawNode:X,hasSubmenu:J,pending:ne(()=>{const{value:t}=a,{key:c}=e.tmNode;return t.includes(c)}),childActive:ne(()=>{const{value:t}=d,{key:c}=e.tmNode,w=t.findIndex(B=>c===B);return w===-1?!1:w<t.length-1}),active:ne(()=>{const{value:t}=d,{key:c}=e.tmNode,w=t.findIndex(B=>c===B);return w===-1?!1:w===t.length-1}),mergedDisabled:ae,renderOption:M,nodeProps:E,handleClick:v,handleMouseMove:p,handleMouseEnter:Q,handleMouseLeave:f,handleSubmenuBeforeEnter:U,handleSubmenuAfterEnter:Y}},render(){const{animated:e,rawNode:o,mergedShowSubmenu:r,clsPrefix:n,siblingHasIcon:i,siblingHasSubmenu:a,renderLabel:d,renderIcon:u,renderOption:s,nodeProps:g,props:y,scrollable:P}=this;let k=null;if(r){const j=this.menuProps?.(o,o.children);k=(L=>(l(),x(Ke,q({key:1},j,{clsPrefix:n,scrollable:this.scrollable,tmNodes:this.tmNode.children,parentKey:this.tmNode.key}),null,16,["clsPrefix","scrollable","tmNodes","parentKey"])))()}const M={class:[`${n}-dropdown-option-body`,this.pending&&`${n}-dropdown-option-body--pending`,this.active&&`${n}-dropdown-option-body--active`,this.childActive&&`${n}-dropdown-option-body--child-active`,this.mergedDisabled&&`${n}-dropdown-option-body--disabled`],onMousemove:this.handleMouseMove,onMouseenter:this.handleMouseEnter,onMouseleave:this.handleMouseLeave,onClick:this.handleClick},E=g?.(o),K=(l(),b("div",q({class:[`${n}-dropdown-option`,E?.class],"data-dropdown-option":!0},E),[S(()=>G("div",q(M,y),[(l(),b("div",{class:C([`${n}-dropdown-option-body__prefix`,i&&`${n}-dropdown-option-body__prefix--show-icon`])},[S(()=>[u?u(o):te(o.icon)])],2)),(l(),b("div",{"data-dropdown-option":!0,class:C(`${n}-dropdown-option-body__label`)},[d?(l(),b($,{key:0},[S(()=>d(o))],64)):(l(),b($,{key:1},[S(()=>te(o[this.labelField]??o.title))],64))],2)),(l(),b("div",{"data-dropdown-option":!0,class:C([`${n}-dropdown-option-body__suffix`,a&&`${n}-dropdown-option-body__suffix--has-submenu`])},[this.hasSubmenu?(l(),x(lo,{key:0},{_:1,default:Se(()=>(l(),x(no)))})):S(()=>null)],2))])),this.hasSubmenu?(l(),x(Qe,{key:0},{default:()=>[(l(),x(Xe,null,{default:()=>(l(),b("div",{class:C(`${n}-dropdown-offset-container`)},[(l(),x(Ye,{show:this.mergedShowSubmenu,placement:this.placement,to:P&&this.popoverBody||void 0,teleportDisabled:!P},{default:()=>(l(),b("div",{class:C(`${n}-dropdown-menu-wrapper`)},[e?(l(),x(Le,{key:0,onBeforeEnter:this.handleSubmenuBeforeEnter,onAfterEnter:this.handleSubmenuAfterEnter,name:"fade-in-scale-up-transition",appear:!0},{default:()=>k},1032,["onBeforeEnter","onAfterEnter"])):(l(),b($,{key:1},[S(()=>k)],64))],2))},1032,["show","placement","to","teleportDisabled"]))],2))},1024))]},1024)):S(()=>null)],16));return s?s({node:K,option:o}):K}}),fo=D({name:"DropdownGroupHeader",props:{clsPrefix:{type:String,required:!0},tmNode:{type:Object,required:!0}},setup(){const{showIconRef:e,hasSubmenuRef:o}=T(me),{renderLabelRef:r,labelFieldRef:n,nodePropsRef:i,renderOptionRef:a}=T(ie);return{labelField:n,showIcon:e,hasSubmenu:o,renderLabel:r,nodeProps:i,renderOption:a}},render(){const{clsPrefix:e,hasSubmenu:o,showIcon:r,nodeProps:n,renderLabel:i,renderOption:a}=this,{rawNode:d}=this.tmNode,u=(l(),b("div",q({class:`${e}-dropdown-option`},n?.(d)),[oe("div",{class:C(`${e}-dropdown-option-body ${e}-dropdown-option-body--group`)},[oe("div",{"data-dropdown-option":!0,class:C([`${e}-dropdown-option-body__prefix`,r&&`${e}-dropdown-option-body__prefix--show-icon`])},[S(()=>te(d.icon))],2),oe("div",{class:C(`${e}-dropdown-option-body__label`),"data-dropdown-option":!0},[i?(l(),b($,{key:0},[S(()=>i(d))],64)):(l(),b($,{key:1},[S(()=>te(d.title??d[this.labelField]))],64))],2),oe("div",{class:C([`${e}-dropdown-option-body__suffix`,o&&`${e}-dropdown-option-body__suffix--has-submenu`]),"data-dropdown-option":!0},null,2)],2)],16));return a?a({node:u,option:d}):u}}),ho=D({name:"NDropdownGroup",props:{clsPrefix:{type:String,required:!0},tmNode:{type:Object,required:!0},parentKey:{type:[String,Number],default:null}},render(){const{tmNode:e,parentKey:o,clsPrefix:r}=this,{children:n}=e;return l(),b($,null,[(l(),x(fo,{clsPrefix:r,tmNode:e,key:e.key},null,8,["clsPrefix","tmNode"])),S(()=>n?.map(i=>{const{rawNode:a}=i;return a.show===!1?null:Ce(a)?G(Ne,{clsPrefix:r,key:i.key}):i.isGroup?(ge("dropdown","`group` node is not allowed to be put in `group` node."),null):(l(),x(Ie,{clsPrefix:r,tmNode:i,parentKey:o,key:i.key},null,8,["clsPrefix","tmNode","parentKey"]))}))],64)}}),vo=D({name:"DropdownRenderOption",props:{tmNode:{type:Object,required:!0}},render(){const{rawNode:{render:e,props:o}}=this.tmNode;return G("div",o,[e?.()])}}),Ke=D({name:"DropdownMenu",props:{scrollable:Boolean,showArrow:Boolean,arrowStyle:[String,Object],clsPrefix:{type:String,required:!0},tmNodes:{type:Array,default:()=>[]},parentKey:{type:[String,Number],default:null}},setup(e){const{renderIconRef:o,childrenFieldRef:r}=T(ie);W(me,{showIconRef:m(()=>{const i=o.value;return e.tmNodes.some(a=>{if(a.isGroup)return a.children?.some(({rawNode:u})=>i?i(u):u.icon);const{rawNode:d}=a;return i?i(d):d.icon})}),hasSubmenuRef:m(()=>{const{value:i}=r;return e.tmNodes.some(a=>{if(a.isGroup)return a.children?.some(({rawNode:u})=>fe(u,i));const{rawNode:d}=a;return fe(d,i)})})});const n=F(null);return W(Ve,null),W(Ue,null),W(Pe,n),{bodyRef:n}},render(){const{parentKey:e,clsPrefix:o,scrollable:r}=this,n=this.tmNodes.map(i=>{const{rawNode:a}=i;return a.show===!1?null:uo(a)?(l(),x(vo,{tmNode:i,key:i.key},null,8,["tmNode"])):Ce(a)?(l(),x(Ne,{clsPrefix:o,key:i.key},null,8,["clsPrefix"])):co(a)?(l(),x(ho,{clsPrefix:o,tmNode:i,parentKey:e,key:i.key},null,8,["clsPrefix","tmNode","parentKey"])):(l(),x(Ie,{clsPrefix:o,tmNode:i,parentKey:e,key:i.key,props:a.props,scrollable:r},null,8,["clsPrefix","tmNode","parentKey","props","scrollable"]))});return l(),b("div",{class:C([`${o}-dropdown-menu`,r&&`${o}-dropdown-menu--scrollable`]),ref:"bodyRef"},[r?(l(),x(He,{key:0,contentClass:`${o}-dropdown-menu__content`},{default:()=>n},1032,["contentClass"])):(l(),b($,{key:1},[S(()=>n)],64)),this.showArrow?(l(),b($,{key:2},[S(()=>Ze({clsPrefix:o,arrowStyle:this.arrowStyle,arrowClass:void 0,arrowWrapperClass:void 0,arrowWrapperStyle:void 0}))],64)):S(()=>null)],2)}}),mo=R("dropdown-menu",`
 transform-origin: var(--v-transform-origin);
 background-color: var(--n-color);
 border-radius: var(--n-border-radius);
 box-shadow: var(--n-box-shadow);
 position: relative;
 transition:
 background-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
`,[We(),R("dropdown-option",`
 position: relative;
 `,[_("a",`
 text-decoration: none;
 color: inherit;
 outline: none;
 `,[_("&::before",`
 content: "";
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 `)]),R("dropdown-option-body",`
 display: flex;
 cursor: pointer;
 position: relative;
 height: var(--n-option-height);
 line-height: var(--n-option-height);
 font-size: var(--n-font-size);
 color: var(--n-option-text-color);
 transition: color .3s var(--n-bezier);
 `,[_("&::before",`
 content: "";
 position: absolute;
 top: 0;
 bottom: 0;
 left: 4px;
 right: 4px;
 transition: background-color .3s var(--n-bezier);
 border-radius: var(--n-border-radius);
 `),ye("disabled",[N("pending",`
 color: var(--n-option-text-color-hover);
 `,[z("prefix, suffix",`
 color: var(--n-option-text-color-hover);
 `),_("&::before","background-color: var(--n-option-color-hover);")]),N("active",`
 color: var(--n-option-text-color-active);
 `,[z("prefix, suffix",`
 color: var(--n-option-text-color-active);
 `),_("&::before","background-color: var(--n-option-color-active);")]),N("child-active",`
 color: var(--n-option-text-color-child-active);
 `,[z("prefix, suffix",`
 color: var(--n-option-text-color-child-active);
 `)])]),N("disabled",`
 cursor: not-allowed;
 opacity: var(--n-option-opacity-disabled);
 `),N("group",`
 font-size: calc(var(--n-font-size) - 1px);
 color: var(--n-group-header-text-color);
 `,[z("prefix",`
 width: calc(var(--n-option-prefix-width) / 2);
 `,[N("show-icon",`
 width: calc(var(--n-option-icon-prefix-width) / 2);
 `)])]),z("prefix",`
 width: var(--n-option-prefix-width);
 display: flex;
 justify-content: center;
 align-items: center;
 color: var(--n-prefix-color);
 transition: color .3s var(--n-bezier);
 z-index: 1;
 `,[N("show-icon",`
 width: var(--n-option-icon-prefix-width);
 `),R("icon",`
 font-size: var(--n-option-icon-size);
 `)]),z("label",`
 white-space: nowrap;
 flex: 1;
 z-index: 1;
 `),z("suffix",`
 box-sizing: border-box;
 flex-grow: 0;
 flex-shrink: 0;
 display: flex;
 justify-content: flex-end;
 align-items: center;
 min-width: var(--n-option-suffix-width);
 padding: 0 8px;
 transition: color .3s var(--n-bezier);
 color: var(--n-suffix-color);
 z-index: 1;
 `,[N("has-submenu",`
 width: var(--n-option-icon-suffix-width);
 `),R("icon",`
 font-size: var(--n-option-icon-size);
 `)]),R("dropdown-menu","pointer-events: all;")]),R("dropdown-offset-container",`
 pointer-events: none;
 position: absolute;
 left: 0;
 right: 0;
 top: -4px;
 bottom: -4px;
 `)]),R("dropdown-divider",`
 transition: background-color .3s var(--n-bezier);
 background-color: var(--n-divider-color);
 height: 1px;
 margin: 4px 0;
 `),R("dropdown-menu-wrapper",`
 transform-origin: var(--v-transform-origin);
 width: fit-content;
 `),_(">",[R("scrollbar",`
 height: inherit;
 max-height: inherit;
 `)]),ye("scrollable",`
 padding: var(--n-padding);
 `),N("scrollable",[z("content",`
 padding: var(--n-padding);
 `)])]);const yo={animated:{type:Boolean,default:!0},keyboard:{type:Boolean,default:!0},size:String,inverted:Boolean,placement:{type:String,default:"bottom"},onSelect:[Function,Array],options:{type:Array,default:()=>[]},menuProps:Function,showArrow:Boolean,renderLabel:Function,renderIcon:Function,renderOption:Function,nodeProps:Function,labelField:{type:String,default:"label"},keyField:{type:String,default:"key"},childrenField:{type:String,default:"children"},value:[String,Number]},bo=Object.keys(Re),wo={...Re,...yo,...re.props};var Po=D({name:"Dropdown",inheritAttrs:!1,props:wo,setup(e){const o=F(!1),r=to(I(e,"show"),o),n=m(()=>{const{keyField:p,childrenField:f}=e;return oo(e.options,{getKey(v){return v[p]},getDisabled(v){return v.disabled===!0},getIgnored(v){return v.type==="divider"||v.type==="render"},getChildren(v){return v[f]}})}),i=m(()=>n.value.treeNodes),a=F(null),d=F(null),u=F(null),s=m(()=>a.value??d.value??u.value??null),g=m(()=>n.value.getPath(s.value).keyPath),y=m(()=>n.value.getPath(e.value).keyPath),P=ne(()=>e.keyboard&&r.value);ro({keydown:{ArrowUp:{prevent:!0,handler:se},ArrowRight:{prevent:!0,handler:de},ArrowDown:{prevent:!0,handler:le},ArrowLeft:{prevent:!0,handler:ae},Enter:{prevent:!0,handler:ce},Escape:J}},P);const{mergedClsPrefixRef:k,inlineThemeDisabled:M,mergedComponentPropsRef:E}=xe(e),K=m(()=>e.size||E?.value?.Dropdown?.size||"medium"),j=re("Dropdown","-dropdown",mo,Ge,e,k);W(ie,{labelFieldRef:I(e,"labelField"),childrenFieldRef:I(e,"childrenField"),renderLabelRef:I(e,"renderLabel"),renderIconRef:I(e,"renderIcon"),hoverKeyRef:a,keyboardKeyRef:d,lastToggledSubmenuKeyRef:u,pendingKeyPathRef:g,activeKeyPathRef:y,animatedRef:I(e,"animated"),mergedShowRef:r,nodePropsRef:I(e,"nodeProps"),renderOptionRef:I(e,"renderOption"),menuPropsRef:I(e,"menuProps"),doSelect:L,doUpdateShow:H}),he(r,p=>{!e.animated&&!p&&X()});function L(p,f){const{onSelect:v}=e;v&&pe(v,p,f)}function H(p){const{"onUpdate:show":f,onUpdateShow:v}=e;f&&pe(f,p),v&&pe(v,p),o.value=p}function X(){a.value=null,d.value=null,u.value=null}function J(){H(!1)}function ae(){U("left")}function de(){U("right")}function se(){U("up")}function le(){U("down")}function ce(){const p=V();p?.isLeaf&&r.value&&(L(p.key,p.rawNode),H(!1))}function V(){const{value:p}=n,{value:f}=s;return!p||f===null?null:p.getNode(f)??null}function U(p){const{value:f}=s,{value:{getFirstAvailableNode:v}}=n;let t=null;if(f===null){const c=v();c!==null&&(t=c.key)}else{const c=V();if(c){let w;switch(p){case"down":w=c.getNext();break;case"up":w=c.getPrev();break;case"right":w=c.getChild();break;case"left":w=c.getParent()}w&&(t=w.key)}}t!==null&&(a.value=null,d.value=t)}const Y=m(()=>{const{inverted:p}=e,f=K.value,{common:{cubicBezierEaseInOut:v},self:t}=j.value,{padding:c,dividerColor:w,borderRadius:B,optionOpacityDisabled:ue,[A("optionIconSuffixWidth",f)]:O,[A("optionSuffixWidth",f)]:ze,[A("optionIconPrefixWidth",f)]:_e,[A("optionPrefixWidth",f)]:$e,[A("fontSize",f)]:De,[A("optionHeight",f)]:Be,[A("optionIconSize",f)]:Oe}=t,h={"--n-bezier":v,"--n-font-size":De,"--n-padding":c,"--n-border-radius":B,"--n-option-height":Be,"--n-option-prefix-width":$e,"--n-option-icon-prefix-width":_e,"--n-option-suffix-width":ze,"--n-option-icon-suffix-width":O,"--n-option-icon-size":Oe,"--n-divider-color":w,"--n-option-opacity-disabled":ue};return p?(h["--n-color"]=t.colorInverted,h["--n-option-color-hover"]=t.optionColorHoverInverted,h["--n-option-color-active"]=t.optionColorActiveInverted,h["--n-option-text-color"]=t.optionTextColorInverted,h["--n-option-text-color-hover"]=t.optionTextColorHoverInverted,h["--n-option-text-color-active"]=t.optionTextColorActiveInverted,h["--n-option-text-color-child-active"]=t.optionTextColorChildActiveInverted,h["--n-prefix-color"]=t.prefixColorInverted,h["--n-suffix-color"]=t.suffixColorInverted,h["--n-group-header-text-color"]=t.groupHeaderTextColorInverted):(h["--n-color"]=t.color,h["--n-option-color-hover"]=t.optionColorHover,h["--n-option-color-active"]=t.optionColorActive,h["--n-option-text-color"]=t.optionTextColor,h["--n-option-text-color-hover"]=t.optionTextColorHover,h["--n-option-text-color-active"]=t.optionTextColorActive,h["--n-option-text-color-child-active"]=t.optionTextColorChildActive,h["--n-prefix-color"]=t.prefixColor,h["--n-suffix-color"]=t.suffixColor,h["--n-group-header-text-color"]=t.groupHeaderTextColor),h}),Q=M?ke("dropdown",m(()=>`${K.value[0]}${e.inverted?"i":""}`),Y,e):void 0;return{mergedClsPrefix:k,mergedTheme:j,mergedSize:K,tmNodes:i,mergedShow:r,handleAfterLeave:()=>{e.animated&&X()},doUpdateShow:H,cssVars:M?void 0:Y,themeClass:Q?.themeClass,onRender:Q?.onRender}},render(){const e=(n,i,a,d,u)=>{const{mergedClsPrefix:s,menuProps:g}=this;this.onRender?.();const y=g?.(void 0,this.tmNodes.map(k=>k.rawNode))||{},P={ref:io(i),class:[n,`${s}-dropdown`,`${s}-dropdown--${this.mergedSize}-size`,this.themeClass],clsPrefix:s,tmNodes:this.tmNodes,style:[...a,this.cssVars],showArrow:this.showArrow,arrowStyle:this.arrowStyle,scrollable:this.scrollable,onMouseenter:d,onMouseleave:u};return G(Ke,q(this.$attrs,P,y))},{mergedTheme:o}=this,r={show:this.mergedShow,theme:o.peers.Popover,themeOverrides:o.peerOverrides.Popover,internalOnAfterLeave:this.handleAfterLeave,internalRenderBody:e,onUpdateShow:this.doUpdateShow,"onUpdate:show":void 0};return l(),x(eo,qe(this.$props,bo,r),{_:1,trigger:Se(()=>this.$slots.default?.())},16)}});export{Po as D,io as c};
