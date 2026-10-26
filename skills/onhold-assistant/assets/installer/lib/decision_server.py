"""Private local Laya service, launched and stopped by the OnHold gateway."""
import os
import sys
os.environ.update(USE_TF='0',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',LAYA_MAX_CONCURRENT='1',LAYA_MAX_TOKEN_BUDGET='2048',LAYA_MAX_BATCH_TOKENS='4096')
import laya
import torch
import uvicorn
from laya.serve import create_app
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
import phrases

torch.set_num_threads(4)
device='mps' if torch.backends.mps.is_available() else 'cpu'
agent=laya.load(sys.argv[1],device=device)
router=laya.Router(device=device,max_loaded=1,default='multilingual')
router.attach('multilingual',agent)
app=create_app(router)

class CandidateRequest(BaseModel):
    text: str=Field(min_length=1,max_length=24000)

@app.post('/post-candidates')
async def post_candidates(body: CandidateRequest):
    return {'candidates':await run_in_threadpool(phrases.candidates,body.text)}

@app.get('/runtime-info')
def runtime_info():
    return {'device':'Metal' if str(agent.device).startswith('mps') else 'CPU'}

uvicorn.run(app,host='127.0.0.1',port=int(sys.argv[2]),log_level='warning')
