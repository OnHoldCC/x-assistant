import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNotificationReplies} from '../extension/notifications.js';

test('notification parser rejects unknown responses and accepts a recognized empty timeline',()=>{
 assert.throws(()=>parseNotificationReplies({data:{unexpected:true}},'owner','99'),/结构无法识别/);
 assert.deepEqual(parseNotificationReplies({timeline:{instructions:[]}},'owner','99'),[]);
});
test('direct timeline references support GraphQL replies without promoting embedded like cards',()=>{
 const reply=id=>({rest_id:id,legacy:{full_text:'Can this run locally?',in_reply_to_user_id_str:'99',in_reply_to_status_id_str:'123'},core:{user_results:{result:{core:{screen_name:'writer'}}}}});
 const value={data:{timeline:{instructions:[{entries:[
  {entryId:'tweet-100',content:{itemContent:{tweet_results:{result:reply('101')}}}},
  {entryId:'notification-liked',content:{itemContent:{tweet_results:{result:reply('102')}}}},
 ]}]}}};
 assert.deepEqual(parseNotificationReplies(value,'owner','99').map(post=>post.id),['101']);
});
