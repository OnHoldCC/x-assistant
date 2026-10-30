import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRelationshipPage,collectRelationships} from '../extension/relationships.js';
const user=(id,flags={})=>({entryId:'user-'+id,content:{itemContent:{user_results:{result:{rest_id:id,core:{screen_name:'user'+id,name:'Name '+id},legacy:flags}}}}});
const page=(users,cursor)=>({data:{user:{result:{timeline:{timeline:{instructions:[{type:'TimelineAddEntries',entries:[...users,{entryId:'cursor-bottom',content:{cursorType:'Bottom',value:cursor}}]}]}}}}}});
test('relationship pages preserve unknown/false states, exact IDs and verified pagination',()=>{
 const result=parseRelationshipPage(page([user('123',{following:false,followed_by:true}),user('124')],'next'),'followers');
 assert.equal(result.items[0].following,false);assert.equal(result.items[1].following,null);assert.equal(result.next_cursor,'next');assert.equal(result.complete,false);
 assert.equal(parseRelationshipPage(page([],null),'following').complete,true);
 const terminated=page([],'opaque');terminated.data.user.result.timeline.timeline.instructions.push({type:'TimelineTerminateTimeline',direction:'Bottom'});assert.equal(parseRelationshipPage(terminated,'following').complete,true);
 assert.equal(parseRelationshipPage(page([],'next'),'following','next').complete,true);
 assert.throws(()=>parseRelationshipPage(page([user('124')],'next'),'following','next'),/未推进/);
 assert.throws(()=>parseRelationshipPage({data:{}},'followers'),/结构不支持/);
 assert.throws(()=>parseRelationshipPage({errors:[{code:88}]},'followers'));
 const promoted=user('125');promoted.content.promotedMetadata={};assert.equal(parseRelationshipPage(page([promoted],null),'followers').items.length,0);
});
test('relationship collection is bounded, resumes its cursor and cleans up its reader',async()=>{
 const listeners=new Set(),saved=[],closed=[];let fetches=0,verified=0;
 const original=globalThis.chrome;
 globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async id=>closed.push(id)},debugger:{attach:async()=>{},detach:async()=>{},onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},sendCommand:async(target,method,params)=>{
  if(method==='Page.navigate'){
   for(const fn of listeners){await fn({tabId:7},'Network.requestWillBeSent',{requestId:'first',request:{method:'GET',url:'https://x.com/i/api/graphql/id/Followers?variables='+encodeURIComponent(JSON.stringify({userId:'123456789'})),headers:{Authorization:'Bearer fixture'}}});await fn({tabId:7},'Network.loadingFinished',{requestId:'first'});}
  }
  if(method==='Network.getResponseBody')return {body:JSON.stringify(page([user('123')],'first'))};
  if(method==='Runtime.evaluate'){fetches++;assert.match(params.expression,/credentials:'include'/);return {result:{value:page([user(String(200+fetches))],'cursor'+fetches)}};}
  return {};
 }}};
 try{
  await collectRelationships({id:'job',client:'client',account:'owner',action:'capture_relationships',input:{kind:'followers',owner_uid:'123456789',generation:'generation',cursor:'resume'}},async(op,data)=>{assert.equal(op,'save_relationship_page');saved.push(data);},'owner',async()=>{verified++;});
  assert.equal(fetches,3);assert.deepEqual(saved.map(value=>value.cursor),['resume','cursor1','cursor2']);assert.equal(saved.at(-1).next_cursor,'cursor3');assert.ok(saved.every(value=>value.complete===false));assert.equal(listeners.size,0);assert.deepEqual(closed,[7]);assert.ok(verified>=6);
 }finally{globalThis.chrome=original;}
});
