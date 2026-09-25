"""Match one actual native usage record to each named host cell; no estimates."""
import argparse, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--rollout',required=True);p.add_argument('--results',required=True);a=p.parse_args()
root=Path(a.results);records=[];models={};pending=None
pattern=re.compile(r'title:\s*"(targeted-(?:chrome|cua)-(?:bare|pilot)-\d+-[a-z0-9]+)')
for line in Path(a.rollout).open():
    row=json.loads(line);v=row.get('payload',{})
    if row.get('type')=='turn_context':models[v.get('turn_id')]=v.get('model')
    if row.get('type')=='response_item' and v.get('type')=='custom_tool_call':
        m=pattern.search(v.get('input',''))
        pending={'marker':m[1],'at':row['timestamp'],'id':v.get('call_id'),'count':0} if m else None
    if row.get('type')=='token_usage_record' and pending:
        pending['count']+=1;assert pending['count']==1,pending
        records.append({'marker':pending['marker'],'at':pending['at'],'usage':v['usage'],'model':models.get(v.get('turn_id'))})
    if row.get('type')=='response_item' and v.get('type')=='custom_tool_call_output' and pending and pending['id']==v.get('call_id'):
        assert pending['count']==1,pending
        pending=None
assert len({c['marker'] for c in records})==len(records),'Duplicate cell marker'
runs=json.loads((root/'ui-runs.json').read_text());pairs=[]
for r in runs:
    cells=[c for c in records if c['marker'].startswith('targeted-'+r['id']+'-')]
    assert cells and cells[0]['marker'].endswith('-start') and cells[-1]['marker'].endswith('-finish'),r['id']
    assert len({c['model'] for c in cells})==1 and cells[0]['model'],r['id']
    r['cells']=cells;r['gptCalls']=len(cells)
    r['gpt']={k:sum(c['usage'].get(k,0) for c in cells) for k in ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']}
    r['gpt']['uncached_input_tokens']=r['gpt']['input_tokens']-r['gpt']['cached_input_tokens']
    assert r['gpt']['input_tokens']+r['gpt']['output_tokens']==r['gpt']['total_tokens']
for r in runs:
    if '-bare-' not in r['id']:continue
    y=next(x for x in runs if x['id']==r['id'].replace('-bare-','-pilot-'))
    pairs.append({'baseline':r['id'],'candidate':y['id'],'bothPassed':r['passed'] and y['passed'],'timePercent':100*(y['elapsedMs']/r['elapsedMs']-1),'gptPercent':100*(y['gpt']['total_tokens']/r['gpt']['total_tokens']-1)})
(root/'usage.json').write_text(json.dumps({'runs':runs,'pairs':pairs},ensure_ascii=False,indent=2)+'\n');print(json.dumps(pairs,indent=2))
