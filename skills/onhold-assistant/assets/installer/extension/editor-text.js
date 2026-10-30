// Shared by the composer and the CDP publisher; innerText adds CSS-dependent spacing.
(()=>{
 if(globalThis.OnHoldEditorText)return;
 globalThis.OnHoldEditorText = function readEditorText(editor){
  function read(node){
   if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;
   if(node.nodeType!==Node.ELEMENT_NODE)return '';
   if(node.tagName==='BR')return '\n';if(node.tagName==='IMG')return node.alt||'';
   if((node===editor||/^(DIV|P|LI)$/.test(node.tagName))&&!node.textContent&&node.querySelectorAll('br').length===1&&!node.querySelector('img'))return '';
   let value='',previousBlock=false;
   for(const [index,child] of [...node.childNodes].entries()){
    const block=child.nodeType===Node.ELEMENT_NODE&&/^(DIV|P|LI)$/.test(child.tagName);
    if(index&&(block||previousBlock))value+='\n';value+=read(child);previousBlock=block;
   }
   return value;
  }
  return read(editor).replace(/\u00a0/g,' ');
 };
})();
