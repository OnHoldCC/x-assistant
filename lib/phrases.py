"""Conservative local POS chunks; never construct arbitrary character n-grams."""
import re
import threading
import json
from pathlib import Path
import jieba
import jieba.posseg

jieba.setLogLevel(40)
_lock=threading.Lock()
_atom=r'(?:[A-Za-z][A-Za-z0-9]*|[0-9]+[A-Za-z][A-Za-z0-9]*)(?:[._+-][A-Za-z0-9]+)*'
_version=r'[0-9]+(?:[._-][0-9]+)*'
_english=re.compile(rf'(?<![A-Za-z0-9_]){_atom}(?:[ \t]+(?:{_atom}|{_version})){{0,2}}(?:[ \t]*[（(](?:{_atom}|{_version})(?:[ \t]+{_atom})?[）)])?')

_terms_path=Path(__file__).with_name('phrase-terms.json')
_generic={'博主','作者','用户','网友','内容','东西','片子','大家','时候','地方','有用','一个'}
_english_stop={'the','and','this','that','with','from','into','for','are','was','is','it','to','of','in','on','a','an'}
_functional={'有点','有些','一些','这个','那个','一个','很多','这样','那样'}
_relation_verbs={'消耗','带来','使用','进行','提供','表示','认为','成为','得到','获得','分享','看到','刷到','做到','说用'}


def candidates(text):
    if not isinstance(text,str) or not text.strip() or len(text)>24000:raise ValueError('短语提取支持 1–24000 字符的正文。')
    clean=re.sub(r'https?://\S+|@[A-Za-z0-9_]+|#[\w]+',lambda match:' '*len(match[0]),text)
    tokens=[]
    def chinese(start,end):
        position=start
        for item in jieba.posseg.cut(clean[start:end],HMM=False):
            tokens.append((item.word,item.flag,position,position+len(item.word)));position+=len(item.word)
    with _lock:
        dictionary=json.loads(_terms_path.read_text(encoding='utf-8'))
        spans=[(match.start(),match.end(),'eng') for match in _english.finditer(clean)]
        for category,flag in [('fixed_phrases','nz'),('named_terms','eng')]:
            for term in dictionary[category]:
                spans.extend((match.start(),match.end(),flag) for match in re.finditer(re.escape(term),clean,re.IGNORECASE))
        protected=[]
        for start,end,flag in sorted(spans,key=lambda span:(-(span[1]-span[0]),span[0])):
            if not any(start<other_end and end>other_start for other_start,other_end,_ in protected):protected.append((start,end,flag))
        position=0
        for start,end,flag in sorted(protected):
            chinese(position,start);tokens.append((clean[start:end],flag,start,end));position=end
        chinese(position,len(clean))
    tokens=[token for token in tokens if not (token[0].isspace() and '\n' not in token[0] and '\r' not in token[0])]
    protected_kind={(start,end):('entity' if flag=='eng' else 'fixed') for start,end,flag in protected}
    pool={}
    def add(start,end,kind):
        term=clean[start:end].strip()
        if len(term)<2 or len(term)>(48 if kind=='entity' else 32) or term in _generic or term in _functional or term in _relation_verbs or not any(char.isalpha() for char in term):return
        if all(word.lower() in _english_stop for word in term.split()):return
        current=pool.get(term)
        spans=set((current or {}).get('spans',set()));spans.add((start,end))
        if current and current['kind'] in ('entity','fixed'):kind=current['kind']
        pool[term]={'term':term,'kind':kind,'spans':spans,'count':len(spans)}
    def noun(index):return 0<=index<len(tokens) and (tokens[index][1].startswith('n') or tokens[index][1] in ('eng','vn'))
    def contiguous(left,right):
        gap=clean[tokens[left][3]:tokens[right][2]]
        return not gap.strip() and '\n' not in gap and '\r' not in gap
    for index,token in enumerate(tokens):
        word,flag,start,end=token
        if (start,end) in protected_kind:add(start,end,protected_kind[(start,end)])
        elif flag=='eng':add(start,end,'entity')
        if not noun(index):continue
        if len(word)==1 and flag=='n':continue
        last=index
        while last+1<len(tokens):
            next_index=last+1
            if not contiguous(last,next_index):break
            if tokens[next_index][0]=='之' and noun(next_index+1) and contiguous(next_index,next_index+1):last=next_index+1;continue
            if not noun(next_index) or tokens[next_index][0] in _functional:break
            if flag=='eng' and (tokens[next_index][1]=='vn' or tokens[next_index][0] in _relation_verbs):break
            if tokens[last][0] in _generic:break
            if tokens[next_index][1]=='eng' and tokens[last][1]!='eng' and not (len(tokens[last][0])==1 and len(tokens[next_index][0])==1):break
            last=next_index
            if tokens[last][3]-start>24:break
        add(start,tokens[last][3],'phrase' if last>index else 'word')
        before=index-1
        if before>=0 and contiguous(before,index) and tokens[before][1].startswith('v') and len(tokens[before][0])>=2 and tokens[before][0] not in _relation_verbs:
            add(tokens[before][2],tokens[last][3],'phrase')
    values=list(pool.values())
    # A named phrase keeps its whole boundary; do not offer an internal suffix as a rival.
    values=[item for item in values if not any(item['term']!=other['term'] and item['term'] in other['term'] and (other['kind']=='entity' or (item['kind'] not in ('entity','fixed') or item['kind']=='entity' and len(item['term'])<=3) and other['kind']=='phrase') and len(other['term'])<=48 for other in values)]
    values.sort(key=lambda item:(item['kind']!='word',item['count'],min(len(item['term']),12)),reverse=True)
    return [item['term'] for item in values[:20]]
