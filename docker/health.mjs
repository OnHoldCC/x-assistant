const response=await fetch('http://127.0.0.1:18427/health',{signal:AbortSignal.timeout(4000)});
const value=await response.json();
if(!response.ok||value.service!=='onhold-assistant')process.exit(1);
