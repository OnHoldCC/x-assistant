// Run in the gateway container; no host Node or Python required.
import assert from 'node:assert/strict';
async function request(route,body) {
  const response=await fetch('http://127.0.0.1:18427'+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});
  const value=await response.json();assert.ok(response.ok,value.error||route);return value;
}
const mode=process.argv[2]||'all';
assert.equal((await request('/health')).service,'onhold-assistant');
let metrics;
for(let n=0;n<60;n++) {
  metrics=await request('/metrics');
  if(metrics.translation_loaded)break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
{
  assert.equal(metrics.translation_loaded,true,'翻译模型尚未加载');
  const first=await request('/translate',{text:'Hello, world!',target_lang:'zh'});assert.ok(first.text?.trim());
  const cached=await request('/translate',{text:'Hello, world!',target_lang:'zh'});assert.equal(cached.text,first.text);assert.equal(cached.cached,true);
  console.log('[验证] 实际翻译和缓存通过：'+first.text);
}
