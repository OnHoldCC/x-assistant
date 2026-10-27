(() => {
 if(globalThis.OnHoldUI)return;
 // @onhold/ui: react/tokens.ts and the Typography foundation, not LaunchWizard's Nunito skin.
 const fonts={sans:'Arial, Helvetica, sans-serif',mono:'SingleSpark Mono, ui-monospace, monospace',wallet:'SingleSpark Teka, Arial, sans-serif',inter:'SingleSpark Inter, Arial, sans-serif'};
 const typeScale={caption:12,body:14,input:15,subtitle:18,title:24,display:36};
 globalThis.OnHoldUI={fonts,typeScale,font:fonts.sans};
})();
