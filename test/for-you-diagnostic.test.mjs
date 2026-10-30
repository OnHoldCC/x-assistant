import test from 'node:test';
import assert from 'node:assert/strict';
import {forYouDiagnostic} from '../extension/for-you.js';
test('For You diagnostics distinguish account, tab, and timeline readiness without saving post text',()=>{
 assert.match(forYouDiagnostic({phase:'account',profile_link:false,account_switcher:true}),/未识别登录账号.*个人页入口=无.*账号切换入口=有/);
 assert.match(forYouDiagnostic({phase:'tab',tab_labels:['Following'],document_state:'complete',visibility:'hidden'}),/未找到 For You 页签.*Following.*complete.*hidden/);
 const message=forYouDiagnostic({phase:'timeline',scanned:0,posts:[{text:'private text'}],loading:true},[429,429,403]);
 assert.match(message,/帖子节点=0.*可用正文=1.*加载中=是.*429\/403/);assert.ok(!message.includes('private text'));
 assert.equal(forYouDiagnostic(null),'未取得页面快照');
});
