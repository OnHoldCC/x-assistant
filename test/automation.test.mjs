import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAutomationPage} from '../extension/automation.js';

test('follow-back discovery distinguishes an unreadable list from an explicit empty state',()=>{
 const oldDocument=globalThis.document,oldLocation=globalThis.location;
 try{
  globalThis.location={protocol:'https:',hostname:'x.com',pathname:'/example/followers'};
  let empty=false;
  globalThis.document={querySelector:selector=>selector.includes('AppTabBar_Profile_Link')?{getAttribute:()=>'/example'}:selector.includes('emptyState')&&empty?{}:null,querySelectorAll:()=>[]};
  assert.equal(inspectAutomationPage('example','candidates','follow_back').ready,false);
  empty=true;
  assert.deepEqual(inspectAutomationPage('example','candidates','follow_back'),{owner:'example',ready:true,targets:[]});
  globalThis.location.hostname='untrusted.example';
  assert.throws(()=>inspectAutomationPage('example','candidates','follow_back'),/来源无效/);
 }finally{globalThis.document=oldDocument;globalThis.location=oldLocation;}
});
