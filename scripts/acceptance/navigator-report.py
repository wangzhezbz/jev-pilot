"""Extract measured native usage for named navigator benchmark cells only."""
import argparse, json, re, csv
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--rollout',required=True);p.add_argument('--results',required=True);a=p.parse_args();root=Path(a.results)
pattern=re.compile(r'title:\s*"(nav-(?:chrome|cua)-(?:document|report)-(?:old|new|followup)-\w+)：');records=[];pending=None;models={}
with open(a.rollout) as f:
 for line in f:
  r=json.loads(line);v=r.get('payload',{})
  if r.get('type')=='turn_context':models[v.get('turn_id')]=v.get('model')
  if r.get('type')=='response_item' and v.get('type')=='custom_tool_call':
   m=pattern.search(v.get('input',''));pending={'marker':m[1],'at':r['timestamp'],'callId':v.get('call_id'),'count':0}if m else None
  if r.get('type')=='token_usage_record' and pending:
   pending['count']+=1;assert pending['count']==1
   records.append({'marker':pending['marker'],'at':pending['at'],'usage':v['usage'],'model':models.get(v.get('turn_id'))})
  if r.get('type')=='response_item' and v.get('type')=='custom_tool_call_output' and pending and pending['callId']==v.get('call_id'):
   assert pending['count']==1;pending=None
runs=[]
for slug,n in [('chrome-document-old',4),('chrome-document-new',3),('cua-report-new',5),('cua-report-old',4),('cua-report-followup',3)]:
 r=json.loads((root/(slug+'.json')).read_text());cells=[x for x in records if x['marker'].startswith('nav-'+slug+'-')];assert len(cells)==n,(slug,len(cells))
 usage={k:sum(c['usage'].get(k,0)for c in cells)for k in ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']};usage['uncached_input_tokens']=usage['input_tokens']-usage['cached_input_tokens']
 runs.append({'id':slug,'elapsedMs':r['elapsedMs'],'passed':r['passed'],'hostRecovery':r.get('hostRecovery'),'gptCalls':len(cells),'gpt':usage,'jev':r['loop']['metrics'],'cells':cells})
auditPath=root/'request-audit.json'
if auditPath.exists():
 from datetime import datetime,timedelta
 for run in runs:
  source=json.loads((root/(run['id']+'.json')).read_text());start=datetime.fromisoformat(source['startedAt'].replace('Z','+00:00'));end=start+timedelta(milliseconds=source['elapsedMs']);events=[e for e in json.loads(auditPath.read_text()).get('currentTaskBackgroundRequests',[]) if start<=datetime.fromisoformat(e['at'].replace('Z','+00:00'))<=end];run['backgroundJev']={'requests':len(events),'inputTokens':sum(e['inputTokens']for e in events),'outputTokens':sum(e['outputTokens']for e in events),'events':events}
pairs=[]
for old,new in [('chrome-document-old','chrome-document-new'),('cua-report-old','cua-report-new'),('cua-report-old','cua-report-followup')]:
 x=next(r for r in runs if r['id']==old);y=next(r for r in runs if r['id']==new);pairs.append({'old':old,'new':new,'timeReductionPct':100*(1-y['elapsedMs']/x['elapsedMs']),'gptTotalReductionPct':100*(1-y['gpt']['total_tokens']/x['gpt']['total_tokens']),'gptOutputReductionPct':100*(1-y['gpt']['output_tokens']/x['gpt']['output_tokens']),'gptUncachedInputReductionPct':100*(1-y['gpt']['uncached_input_tokens']/x['gpt']['uncached_input_tokens'])})
(root/'usage.json').write_text(json.dumps({'runs':runs,'comparisons':pairs},indent=2)+'\n')
with open(root/'runs.csv','w')as f:
 fields=['id','seconds','passed','gpt_calls','gpt_input','gpt_cached','gpt_uncached','gpt_output','gpt_total','jev_requests','jev_input','jev_output','jev_api_ms','background_jev_requests','background_jev_input','background_jev_output'];w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader()
 for r in runs:
  g=r['gpt'];j=r['jev'];w.writerow(dict(zip(fields,[r['id'],r['elapsedMs']/1000,r['passed'],r['gptCalls'],g['input_tokens'],g['cached_input_tokens'],g['uncached_input_tokens'],g['output_tokens'],g['total_tokens'],j['jevRequests'],j['inputTokens'],j['outputTokens'],j['apiMs'],r.get('backgroundJev',{}).get('requests',0),r.get('backgroundJev',{}).get('inputTokens',0),r.get('backgroundJev',{}).get('outputTokens',0)])))
print(json.dumps(pairs,indent=2))
