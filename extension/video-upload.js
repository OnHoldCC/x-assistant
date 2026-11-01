// Runs in the verified composer. Only video bytes cross into X; backend credentials stay in the companion.
export function createVideoTransfer(owner,total){
 if(location.origin!=='https://x.com'||location.pathname!=='/home'||document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.toLowerCase()!=='/'+owner)throw Error('视频上传页面或账号不匹配');
 const main=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
 const input=[...(main?.querySelectorAll('input[type="file"]')||[])].find(node=>/video\//i.test(node.accept));
 if(!input||!Number.isSafeInteger(total)||total<1||total>100000000)throw Error('视频上传控件或大小无效');
 return {chunks:[],size:0,append(bytes,offset){
  if(offset!==this.size||!Array.isArray(bytes)||bytes.length<1||bytes.length>65536||bytes.some(n=>!Number.isInteger(n)||n<0||n>255)||this.size+bytes.length>total)throw Error('视频分片不连续或大小无效');
  this.chunks.push(Uint8Array.from(bytes));this.size+=bytes.length;return this.size;
 },finish(){
  if(this.size!==total||!input.isConnected)throw Error('视频传输未完成或上传页面已改变');
  const transfer=new DataTransfer();transfer.items.add(new File(this.chunks,'video.mp4',{type:'video/mp4'}));this.chunks=[];
  input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;
 }};
}

export function isMediaUpload(raw){
 try{const url=new URL(raw);return url.protocol==='https:'&&['upload.twitter.com','upload.x.com','x.com'].includes(url.hostname)&&/\/(?:i\/|1\.1\/)?media\/upload\.json$/.test(url.pathname);}catch{return false;}
}

export async function uploadVideo(job,command,call,owner,inspect,mediaIds,failure){
 let offset=0,total,handle;
 try{
  do{
   const chunk=await call('video_upload_chunk',{id:job.id,client:job.client,offset},30000);
   if(chunk.offset!==offset||!Array.isArray(chunk.bytes)||!chunk.bytes.length||chunk.bytes.length>65536||!Number.isSafeInteger(chunk.total)||chunk.total>100000000||total!==undefined&&chunk.total!==total)throw Error('后端返回的视频分片无效');
   total=chunk.total;
   if(!handle){
    const created=await command('Runtime.evaluate',{expression:`(${createVideoTransfer.toString()})(${JSON.stringify(owner)},${total})`,returnByValue:false});
    if(created.exceptionDetails||!created.result?.objectId)throw Error('X 视频上传控件未就绪，未上传');handle=created.result.objectId;
   }
   const added=await command('Runtime.callFunctionOn',{objectId:handle,functionDeclaration:'function(bytes,offset){return this.append(bytes,offset)}',arguments:[{value:chunk.bytes},{value:offset}],returnByValue:true});
   if(added.exceptionDetails||added.result?.value!==offset+chunk.bytes.length)throw Error('视频分片写入失败，未发送');
   offset+=chunk.bytes.length;
  }while(offset<total);
  const finished=await command('Runtime.callFunctionOn',{objectId:handle,functionDeclaration:'function(){return this.finish()}',returnByValue:true});
  if(finished.exceptionDetails||finished.result?.value!==true)throw Error('X 未接受完整视频，未发送');
 }finally{if(handle)await command('Runtime.releaseObject',{objectId:handle}).catch(()=>{});}
 let page;const until=Date.now()+300000;
 for(let attempt=0;attempt<1200&&Date.now()<until;attempt++){
  if(failure())throw Error(failure());
  page=await inspect();
  if(page?.ready&&page.enabled&&page.mediaReady&&mediaIds.size===1)return [...mediaIds][0];
  if(attempt%20===0)await call('video_upload_chunk',{id:job.id,client:job.client,offset:0},30000);
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error('视频上传或处理等待5分钟后仍未就绪（Post按钮'+(page?.enabled?'可用':'不可用')+'，视频'+(page?.mediaReady?'就绪':'处理中')+'，媒体回执'+mediaIds.size+'条），页面已保留；未发送推文');
}
