import assert from 'node:assert/strict';
import {inspectForYou} from '../extension/for-you.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main></main>'}));
 await page.goto('https://x.com/home');
 const read=()=>page.evaluate('('+inspectForYou.toString()+')("example","for_you",0,"en")');
 assert.equal((await read()).phase,'account');
 await page.setContent('<a data-testid="SideNav_AccountSwitcher_Button">@example</a><main></main>');
 assert.equal((await read()).account_switcher,true);
 await page.setContent('<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main><button role="tab">Following</button></main>');
 assert.deepEqual((await read()).tab_labels,['Following']);
 await page.setContent('<a data-testid="AppTabBar_Profile_Link" href="/other"></a>');await assert.rejects(read(),/账号已改变/);
 const header='<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main><button role="tab" aria-selected="true">For you</button>';
 await page.setContent(header+'<div role="progressbar"></div></main>');let result=await read();assert.equal(result.phase,'timeline');assert.equal(result.scanned,0);assert.equal(result.loading,true);
 await page.setContent(header+'<article data-testid="tweet"><a href="/writer/status/123"><time></time></a><div data-testid="tweetText" lang="zh">正常中文内容</div></article></main>');result=await read();assert.equal(result.scanned,1);assert.equal(result.posts.length,1,'English replies also accept Chinese source posts');
 console.log('Passed: read-only For You readiness diagnostics; account mismatch remains blocked. No live X requests.');
}finally{await browser.close();}
