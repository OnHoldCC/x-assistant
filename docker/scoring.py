"""Keep verified source model files immutable when Laya normalizes tokenizer JSON."""
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import sys
root=Path('/opt/onhold')
lock=json.loads((root/'lib/runtime-lock.json').read_text())
version=hashlib.sha256(json.dumps(lock['decision_model']['files'],sort_keys=True).encode()).hexdigest()[:20]
model=Path('/data')/('laya-runtime-'+version)
if not model.exists():
    stage=model.with_name(model.name+'.partial')
    if stage.exists():shutil.rmtree(stage)
    shutil.copytree('/models/laya-source',stage)
    stage.rename(model)
os.environ['LAYA_API_KEY']=Path('/secrets/backend-key').read_text().strip()
sys.path.insert(0,str(root/'lib'))
sys.argv=[str(root/'lib/decision_server.py'),str(model),'18430']
runpy.run_path(sys.argv[0],run_name='__main__')
