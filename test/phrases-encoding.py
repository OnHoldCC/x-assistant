"""The phrase dictionary must load under a non-UTF-8 Windows locale."""
from pathlib import Path
import sys
sys.dont_write_bytecode = True
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import phrases

original_open = Path.open
def legacy_locale(file, *args, **kwargs):
    if file == phrases._terms_path:
        kwargs.setdefault('encoding', 'cp1252')
    return original_open(file, *args, **kwargs)

with patch.object(Path, 'open', legacy_locale):
    result = phrases.candidates('本地模型支持机器翻译和开源项目。')
    assert result and any('翻译' in term or '模型' in term for term in result), result
print('Chinese dictionary loads under the Windows legacy locale')
