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

torch.set_num_threads(max(1,min(4,int(os.environ.get('ONHOLD_MODEL_THREADS','4')))))
try:
    agent=laya.load(sys.argv[1],device='auto')
except RuntimeError as error:
    if not (torch.cuda.is_available() or torch.backends.mps.is_available() or (hasattr(torch,'xpu') and torch.xpu.is_available())):
        raise
    print('GPU 评分模型初始化失败，回退 CPU：'+str(error),file=sys.stderr,flush=True)
    agent=laya.load(sys.argv[1],device='cpu')
device=str(agent.device)
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
    return {'device':{'mps':'Metal','cuda':'CUDA','xpu':'Intel XPU','cpu':'CPU'}.get(agent.device.type,str(agent.device))}

uvicorn.run(app,host=os.environ.get('ONHOLD_DECISION_HOST','127.0.0.1'),port=int(sys.argv[2]),log_level='warning')
