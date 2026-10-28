import test from 'node:test';
import assert from 'node:assert/strict';
import {requestKind,userRecords,sessionFromCookies,learnRequests} from '../extension/request-capture.js';
test('request learning accepts observed read operations and rejects mutations and other origins',()=>{
 assert.equal(requestKind('https://x.com/i/api/graphql/observed-id/Followers?variables=%7B%7D'),'followers');
 assert.equal(requestKind('https://x.com/i/api/graphql/observed-id/UserByRestId'),'profile');
 for(const url of ['https://evil.example/i/api/graphql/id/Followers','https://x.com.evil.example/i/api/graphql/id/Followers','https://x.com/i/api/graphql/id/CreateTweet','https://x.com/i/api/graphql/id/FollowersYouKnow','http://x.com/i/api/graphql/id/Following'])assert.equal(requestKind(url),null);
});
test('learning uploads only owned initial read templates, checks cookie changes and cleans up CDP',async t=>{
 const previous=globalThis.chrome,uid='1900000000000000123',cookies=[{name:'auth_token',value:'test-auth'},{name:'ct0',value:'test-csrf'},{name:'twid',value:'u%3D'+uid}];
 let listener,removed=0,detached=0,cookieReads=0,switched=false,clock=0,request=0;const bodies=new Map(),calls=[];
 t.after(()=>{if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;});
 t.mock.method(Date,'now',()=>clock+=5000);
 t.mock.method(globalThis,'setTimeout',callback=>{queueMicrotask(callback);return 0;});
 const emit=(kind,variables={},owner=uid)=>{
   const id=String(++request),url='https://x.com/i/api/graphql/observed-id/'+kind+'?variables='+encodeURIComponent(JSON.stringify(variables));
   bodies.set(id,{data:{user:{result:{rest_id:owner,core:{screen_name:'example'}}}}});
   listener({tabId:9},'Network.requestWillBeSent',{requestId:id,request:{url,method:'GET',headers:{authorization:'Bearer test-only','User-Agent':'fixture-browser'}}});
   listener({tabId:9},'Network.loadingFinished',{requestId:id});
 };
 globalThis.chrome={tabs:{create:async()=>({id:9}),remove:async()=>removed++},debugger:{attach:async()=>{},detach:async()=>detached++,onEvent:{addListener:fn=>listener=fn,removeListener:fn=>assert.equal(fn,listener)},sendCommand:async(target,method,input)=>{
   if(method==='Network.getCookies'){cookieReads++;return {cookies:switched&&cookieReads%2===0?cookies.map(c=>c.name==='auth_token'?{...c,value:'changed'}:c):cookies};}
   if(method==='Network.getResponseBody')return {body:JSON.stringify(bodies.get(input.requestId))};
   if(method==='Page.navigate'){
     if(input.url.endsWith('/example')){emit('UserByRestId',{userId:uid});emit('UserByRestId',{userId:'999'},'999');emit('UserTweets',{userId:uid});emit('UserTweets',{userId:uid,cursor:'next-page'});emit('CreateTweet');}
     if(input.url.endsWith('account_analytics'))emit('GetAccountAnalytics');
     return {};
   }
   return {};
 }}};
 await learnRequests(7,'example',async(op,input)=>{calls.push({op,input});return {uid};});
 assert.equal(calls.length,1);assert.equal(calls[0].op,'learn_x_session');assert.equal(calls[0].input.uid,uid);
 assert.deepEqual(calls[0].input.templates.map(t=>t.kind).sort(),['analytics','posts','profile']);
 for(const template of calls[0].input.templates){assert.ok(!template.url.includes('cursor'));assert.equal(template.method,'GET');assert.equal(template.sample,undefined);}
 assert.equal(removed,1);assert.equal(detached,1);
 switched=true;await assert.rejects(learnRequests(7,'example',async()=>assert.fail('changed credentials must not upload')),/登录态已改变/);
 assert.equal(removed,2);assert.equal(detached,2);
});
test('identities remain strings, missing relationship flags stay unknown and cookies require authenticated UID',()=>{
 const users=userRecords({data:{user:{result:{rest_id:'1900000000000000123',core:{screen_name:'Example',name:'Name'},legacy:{followers_count:100},relationship_perspectives:{following:true}}}}});
 assert.equal(users[0].uid,'1900000000000000123');assert.equal(users[0].handle,'example');assert.equal(users[0].following,true);assert.equal(users[0].followed_by,null);
 const cookies=[{name:'auth_token',value:'test-auth'},{name:'ct0',value:'test-csrf'},{name:'twid',value:'u%3D1900000000000000123'}];
 assert.equal(sessionFromCookies(cookies).uid,'1900000000000000123');
 assert.throws(()=>sessionFromCookies(cookies.filter(cookie=>cookie.name!=='auth_token')));
 assert.throws(()=>sessionFromCookies([...cookies.filter(cookie=>cookie.name!=='twid'),{name:'twid',value:'u=invalid'}]));
});
