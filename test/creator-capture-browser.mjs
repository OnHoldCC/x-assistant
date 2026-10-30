import assert from 'node:assert/strict';
import {captureX} from '../extension/cdp-bridge.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();let text='';
 await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).hostname,'x.com');return route.fulfill({contentType:'text/html',body:`<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main>${text}</main>`});});
 const read=async body=>{text=body;await page.goto('https://x.com/i/jf/creators/original_content_rewards');return page.evaluate(captureX);};
 let snapshot=await read('Have at least 500 Verified followers 0');assert.equal(snapshot.creator.verified_followers.current.value,0);assert.equal(snapshot.creator.verified_impressions,undefined);
 snapshot=await read('Have at least 500K Verified Home Timeline impressions in the last 90 days 291 Does not include replies');assert.equal(snapshot.creator.verified_impressions.current.value,291);assert.equal(snapshot.creator.verified_impressions.exclude_replies,true);assert.equal(snapshot.creator.verified_followers,undefined);
 snapshot=await read('Original Content Rewards Enrolled');assert.equal(snapshot.creator.state,'enrolled');
 snapshot=await read('Loading...');assert.equal(snapshot.creator,null,'unknown data must never become zero or invented progress');
 await page.locator('[data-testid="AppTabBar_Profile_Link"]').evaluate(node=>node.remove());
 await page.locator('main').evaluate(node=>node.textContent='Have at least 500 Verified followers 492');
 await assert.rejects(page.evaluate(captureX),/尚未识别登录账号/);
 snapshot=await page.evaluate('('+captureX.toString()+')(undefined,"example")');assert.equal(snapshot.creator.verified_followers.current.value,492);assert.equal(snapshot.handle,'example');
 await page.goto('https://x.com/i/flow/login');await page.locator('[data-testid="AppTabBar_Profile_Link"]').evaluate(node=>node.remove());
 await assert.rejects(page.evaluate('('+captureX.toString()+')(undefined,"example")'),/尚未识别登录账号/,'an expected creator account cannot label a login page as authenticated');
 console.log('Passed: independent partial creator metrics, real zero, source period, enrollment and unknown values. Fixture only.');
}finally{await browser.close();}
