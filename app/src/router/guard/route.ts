import type {Router} from 'vue-router';
import {useRouteStore} from '@/store/modules/route';
import {useWorkspace} from '@/views/onhold/workspace';
/** OnHold authenticates API requests with its existing desktop/pairing token. */
export function createRouteGuard(router:Router){
 router.beforeEach(async to=>{
  const routes=useRouteStore();
  if(!routes.isInitConstantRoute){await routes.initConstantRoute();return{path:to.path,query:to.query,hash:to.hash,replace:true};}
  if(to.path==='/settings'){useWorkspace().settingsOpen=true;return{path:'/overview',replace:true};}
  if(to.name==='not-found')return{path:'/overview',replace:true};
 });
}
