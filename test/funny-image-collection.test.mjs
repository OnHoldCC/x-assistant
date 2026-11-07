import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectForYou} from '../extension/for-you.js';
test('obsolete external image capture is rejected before any browser or API call',async()=>{
 let touched=false;
 await assert.rejects(collectForYou({id:'old',action:'capture_for_you',account:'owner',input:{limit:1,publication_mode:'funny_image'}},async()=>{touched=true;},'owner',async()=>{touched=true;}),/外部图片转载已停用/);
 assert.equal(touched,false);
});
