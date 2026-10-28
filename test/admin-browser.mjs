import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {extensionVersion} from '../app/src/shared/extension-version.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('.'),fixtures=JSON.parse(fs.readFileSync('test/fixtures/x-session.json','utf8'));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-capture-test-')),port=process.env.ONHOLD_TEST_PORT||'21429',base='http://127.0.0.1:'+port;
// The test-only Rust host runs the production scheduler with fixture responses; it never sends X credentials over the network.
const build=spawnSync('cargo',['test','--manifest-path','backend/Cargo.toml','--locked','--offline','--lib','--no-run','--message-format=json'],{encoding:'utf8',maxBuffer:4*1024*1024});
assert.equal(build.status,0,build.stderr);
const executable=build.stdout.split('\n').filter(Boolean).map(line=>JSON.parse(line)).find(item=>item.executable)?.executable;
assert.ok(executable,'Rust fixture test executable must exist');
const child=spawn(executable,['browser_fixture','--ignored','--nocapture'],{env:{...process.env,ONHOLD_FIXTURE_HOME:home,ONHOLD_FIXTURE_PORT:port},stdio:['ignore','pipe','pipe']});
child.stderr.on('data',chunk=>process.stderr.write(chunk));let context;
const waitFor=async(read,accept,label)=>{for(let i=0;i<150;i++){const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}throw Error(label);};
try{
 await waitFor(()=>fetch(base+'/health').then(r=>r.json()).catch(()=>null),v=>v?.service==='onhold-admin','fixture backend did not start');
 const html=await fetch(base).then(r=>r.text()),token=html.match(/name="onhold-token" content="([a-f0-9]{64})"/)[1];
 const request=async(operation,input={},headers={})=>{
  const response=await fetch(base+'/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},body:JSON.stringify({operation,input})});
  const value=await response.json();return {status:response.status,value};
 };
 assert.equal((await request('dashboard',{}, {Authorization:'Bearer invalid'})).status,401);
 assert.equal((await request('dashboard',{}, {Origin:'https://evil.example'})).status,403);
 assert.equal((await fetch(base+'/health').then(r=>r.json())).schema_version,4);
 const extension=path.join(home,'extension');fs.cpSync(path.join(root,'extension'),extension,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));manifest.host_permissions.push(base+'/*');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
 context=await chromium.launchPersistentContext(path.join(home,'browser'),{headless:true,channel:'chromium',viewport:{width:1320,height:940},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 await context.addCookies([{name:'auth_token',value:'fixture-auth',domain:'.x.com',path:'/',httpOnly:true,secure:true},{name:'ct0',value:'fixture-csrf',domain:'.x.com',path:'/',secure:true},{name:'twid',value:'u%3D'+fixtures.uid,domain:'.x.com',path:'/',secure:true}]);
 const observed=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'&&url.port===port||url.protocol==='chrome-extension:')return route.continue();
  if(url.hostname!=='x.com')return route.abort();
  if(url.pathname.startsWith('/i/api/graphql/')){
   const operation=url.pathname.split('/').at(-1),kind={UserByRestId:'profile',UserTweets:'posts',GetAccountAnalytics:'analytics',GetCreatorEligibility:'creator'}[operation];
   assert.ok(kind,'only fixture read operations are requested');observed.push(operation);return route.fulfill({json:fixtures[kind]});
  }
  const operations=url.pathname==='/i/account_analytics'?['GetAccountAnalytics']:url.pathname.includes('/creators/')?['GetCreatorEligibility']:['UserByRestId','UserTweets'];
  const script=operations.map(operation=>`fetch('/i/api/graphql/observed-id/${operation}?variables='+encodeURIComponent(JSON.stringify({userId:${JSON.stringify(fixtures.uid)}})),{headers:{authorization:'Bearer fixture-only'}});`).join('');
  return route.fulfill({contentType:'text/html;charset=utf-8',body:`<a data-testid="AppTabBar_Profile_Link" href="/example">Profile</a><main>Fixture X page</main><script>${script}</script>`});
 });
 const x=await context.newPage();await x.goto('https://x.com/example');
 const popup=await context.newPage();await popup.goto('chrome-extension://efnelpfiicmcfahpkoidcegnebndoiad/admin-ui/bridge.html');
 const send=(type,data)=>popup.evaluate(({type,data})=>chrome.runtime.sendMessage({type,data}),{type,data});
 assert.equal((await send('CDP_SAVE',{endpoint:base,token})).ok,true);
 await x.bringToFront();const connected=await send('CDP_CONNECT');assert.equal(connected.ok,true,connected.error);assert.equal(connected.data.account,'example');
 const jobs=()=>request('jobs').then(r=>r.value),connections=()=>request('connections').then(r=>r.value);
 await waitFor(jobs,v=>v.some(j=>j.state==='completed'),'initial backend capture did not complete');
 const data=(await request('dashboard',{account:'example',days:7})).value;
 assert.equal(data.posts.length,1);assert.equal(data.posts[0].text,'A captured #OnHold post');assert.equal(data.metrics.followers.value,1200);assert.equal(data.metrics.views.value,566000);assert.equal(data.analytics.data.metrics.impressions.value,70);
 await waitFor(connections,v=>v.some(c=>c.transport==='websocket'&&c.extension_version===extensionVersion),'browser version not reported');
 assert.ok((await connections()).some(c=>c.transport==='backend'&&c.login_state==='logged_in'));
 const visible=JSON.stringify([await connections(),await jobs(),(await request('logs')).value]);
 for(const secret of ['fixture-auth','fixture-csrf','Bearer fixture-only'])assert.ok(!visible.includes(secret),'credentials must not appear in status or logs');
 const queued=await request('enqueue',{account:fixtures.uid,action:'capture_analytics'});assert.equal(queued.status,200);
 await waitFor(jobs,v=>v.some(j=>j.id===queued.value.id&&j.state==='completed'),'manual UID-based capture did not complete');
 const before=(await jobs()).length,requestsBefore=observed.length;
 await x.close();await waitFor(connections,v=>!v.some(c=>c.transport==='websocket'&&c.online),'browser disconnect not reflected');
 const db=new DatabaseSync(path.join(home,'onhold-admin.sqlite3'));db.prepare('UPDATE x_sessions SET next_poll=?').run(Date.now());db.close();
 await waitFor(jobs,v=>v.length>before&&v[0].state==='completed','scheduled backend capture did not continue without X tab');
 assert.equal(observed.length,requestsBefore,'backend capture must not navigate a browser tab');assert.equal(context.pages().filter(p=>p.url().startsWith('https://x.com/')).length,0);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('onhold-setup-complete','1'));
 await page.goto(base+'/#accounts');await page.getByRole('table',{name:'账号列表',exact:true}).waitFor();
 await page.getByText('后台定时采集',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'立即采集',exact:true}).isDisabled(),false);
 await page.screenshot({path:path.join(home,'capture-desktop.png'),fullPage:true});
 await page.setViewportSize({width:375,height:800});await page.getByLabel('账号列表',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'断开采集',exact:true}).click();await page.getByText('@example 已断开采集，历史数据已保留',{exact:true}).waitFor();
 assert.equal((await request('enqueue',{account:'example'})).status,422);assert.equal((await request('dashboard',{account:'example',days:7})).value.posts.length,1);
 const stored=new DatabaseSync(path.join(home,'onhold-admin.sqlite3'));assert.equal(stored.prepare('SELECT headers FROM x_sessions').get().headers,'{}');assert.equal(stored.prepare('SELECT count(*) AS n FROM request_templates').get().n,0);stored.close();
 assert.deepEqual(errors,[]);
 console.log('Passed: CDP credential/template learning, authenticated Rust API, backend collection, UID routing, secret redaction, manual analytics jobs, scheduled collection after X tab closes, desktop/mobile status and credential revocation. Fixture responses replace external X requests.');
}finally{
 if(context)await context.close();if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}fs.rmSync(home,{recursive:true,force:true});
}
