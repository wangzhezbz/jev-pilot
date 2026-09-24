"""Export measured usage only, never private session text or credentials."""
import argparse, json, re, csv
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--rollout',required=True);p.add_argument('--results',required=True);a=p.parse_args()
root=Path(a.results); pending=None; records=[]; models={}
marker=re.compile(r'title:\s*"(full-(?:chrome|cua)-(?:report|document)-(?:native|auto)-[\w]+)：')
with open(a.rollout) as f:
 for line in f:
  row=json.loads(line);v=row.get('payload',{})
  if row.get('type')=='turn_context': models[v.get('turn_id')]=v.get('model')
  if row.get('type')=='response_item' and v.get('type')=='custom_tool_call':
   m=marker.search(v.get('input',''));pending={'marker':m[1],'at':row['timestamp'],'callId':v.get('call_id'),'usageRecords':0} if m else None
  if row.get('type')=='token_usage_record' and pending:
   pending['usageRecords']+=1;assert pending['usageRecords']==1
   records.append({k:x for k,x in pending.items() if k not in ('usageRecords','callId')}|{'usage':v['usage'],'model':models.get(v.get('turn_id'))})
  if row.get('type')=='response_item' and v.get('type')=='custom_tool_call_output' and pending and pending['callId']==v.get('call_id'):
   assert pending['usageRecords']==1;pending=None
rows=[]
for id in json.loads((root/'plan.json').read_text())['order']:
 host,case,arm=id.split('/');slug=id.replace('/','-');r=json.loads((root/(slug+'.json')).read_text());cells=[x for x in records if x['marker'].startswith('full-'+slug+'-')]
 if slug=='chrome-report-native':cells=[x for x in cells if '-r2' in x['marker']]
 assert len(cells)==(8 if arm=='native' else 6 if slug=='chrome-report-auto' else 4), (slug,len(cells))
 usage={k:sum(x['usage'].get(k,0) for x in cells) for k in ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']};usage['uncached_input_tokens']=usage['input_tokens']-usage['cached_input_tokens']
 j=(r.get('loop') or {}).get('metrics') or {};runs=(r.get('loop') or {}).get('runs',[])
 rows.append({'id':slug,'host':host,'case':case,'arm':arm,'elapsedMs':r['elapsedMs'],'passed':r['passed'],'nativeCalls':len(cells),'gpt':usage,'models':sorted(set(x['model'] or 'unknown' for x in cells)),'jev':j,'nativeRecoveryActions':(r.get('loop')or{}).get('nativeRecoveryActions',0),'harnessErrors':(r.get('loop')or{}).get('harnessErrors',[]),'compactReceiptChars':None,'hostPhases':{phase:sum(p['ms'] for run in runs for p in run['phases'] if p['phase']==phase) for phase in ['observe','decision','revalidate','execute']},'cells':cells})
pairs=[]
for host in ['chrome','cua']:
 for case in ['report','document']:
  n=next(x for x in rows if x['host']==host and x['case']==case and x['arm']=='native');j=next(x for x in rows if x['host']==host and x['case']==case and x['arm']=='auto')
  pairs.append({'host':host,'case':case,'timeReductionPct':100*(1-j['elapsedMs']/n['elapsedMs']),'gptTotalReductionPct':100*(1-j['gpt']['total_tokens']/n['gpt']['total_tokens']),'gptUncachedInputReductionPct':100*(1-j['gpt']['uncached_input_tokens']/n['gpt']['uncached_input_tokens']),'gptOutputReductionPct':100*(1-j['gpt']['output_tokens']/n['gpt']['output_tokens'])})
pre=[x for x in records if x['marker'].startswith('full-chrome-report-native-') and '-r2' not in x['marker']]
(root/'usage.json').write_text(json.dumps({'runs':rows,'pairs':pairs,'translationPrecheckCells':pre},indent=2)+'\n')
with open(root/'runs.csv','w')as f:
 fields=['id','seconds','passed','nativeCalls','gpt_input','gpt_cached','gpt_uncached','gpt_output','gpt_total','jev_requests','jev_input','jev_output','jev_unknown','handoffs'];w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
 for r in rows:
  g=r['gpt'];j=r['jev'];w.writerow(dict(zip(fields,[r['id'],r['elapsedMs']/1000,r['passed'],r['nativeCalls'],g['input_tokens'],g['cached_input_tokens'],g['uncached_input_tokens'],g['output_tokens'],g['total_tokens'],j.get('jevRequests',0),j.get('inputTokens',0),j.get('outputTokens',0),j.get('unknownUsage',0),j.get('handoffs',0)])))
print(json.dumps({'pairs':pairs,'runs':[{k:v for k,v in r.items() if k not in ['cells']}for r in rows]},indent=2))
