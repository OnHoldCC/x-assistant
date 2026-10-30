(() => {
 if(globalThis.OnHoldUI)return;
 const font='"Launch Rounded", ui-rounded, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
 const fonts={sans:font,mono:font,wallet:font,inter:font};
 const url=globalThis.chrome?.runtime?.getURL?.('assets/nunito-variable.ttf');
 if(url){
  const face=new FontFace('Launch Rounded',`url("${url}")`,{weight:'200 1000',display:'swap'});
  document.fonts.add(face);
  face.load().catch(()=>{});
 }
 const typeScale={caption:12,body:14,input:15,subtitle:18,title:24,display:36};
 globalThis.OnHoldUI={fonts,typeScale,font:fonts.sans};
})();
