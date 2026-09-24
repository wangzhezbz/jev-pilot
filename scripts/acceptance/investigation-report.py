"""Publishable, redacted audit of all investigation development attempts."""
import csv, hashlib, json, re
from pathlib import Path
root=Path.cwd(); out=root/'docs/reports/investigation-20260924';out.mkdir(parents=True,exist_ok=True)
phases={'tool_only':'investigation-ab-20260924','guided':'investigation-guided-20260924','packed':'investigation-packed-20260924'}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def scrub(v):
 if isinstance(v,str):
  v=v.replace(str(Path.home()),'<HOME>')
  v=re.sub(r'/(?:private/)?var/folders/[^\s"\']*?/T/','<TMP>/',v)
  return v.replace('/private/tmp/','<TMP>/').replace('/tmp/','<TMP>/')
 if isinstance(v,list):return [scrub(x) for x in v]
 if isinstance(v,dict):return {k:scrub(x) for k,x in v.items()}
 return v
def tool_union(record):
 active={}; intervals=[]
 for e in record.get('timeline',[]):
  if e.get('itemType') not in ['commandExecution','mcpToolCall']:continue
  i=e.get('itemId')
  if e['method']=='item/started':active[i]=e['elapsedMs']
  if e['method']=='item/completed' and i in active:intervals.append((active.pop(i),e['elapsedMs']))
 intervals.sort();merged=[]
 for start,end in intervals:
  if merged and start<=merged[-1][1]:merged[-1]=(merged[-1][0],max(end,merged[-1][1]))
  else:merged.append((start,end))
 return sum(b-a for a,b in merged)
rows=[];audits=[];protocols={};raw_hashes={}
for phase,folder in phases.items():
 base=root/'dist'/folder; data=json.loads((base/'results.json').read_text());protocols[phase]=data['protocol']
 for record in data['records']:
  tokens=record.get('tokens') or {};events=record.get('jevEvents',[]);jev=[x for x in events if x['kind']=='jev_call'];ops=[e.get('operation') for e in events if e['kind']=='operation'];inv=[e for e in events if e['kind']=='investigation']
  unique={json.dumps(e['total'],sort_keys=True):e for e in record['usage']}
  ji=sum(e.get('inputTokens',0) or 0 for e in jev);jo=sum(e.get('outputTokens',0) or 0 for e in jev)
  unknown=sum(e.get('inputTokens') is None or e.get('outputTokens') is None for e in jev)
  row={'phase':phase,'id':record['id'],'arm':record['arm'],'repeat':record.get('repeat'),'status':record['status'],'passed':record['passed'],'endToEndMs':record.get('endToEndMs'),'startupMs':record.get('startupMs'),'generationsWithUsage':len(unique),'inputTokens':tokens.get('inputTokens'),'cachedInputTokens':tokens.get('cachedInputTokens'),'outputTokens':tokens.get('outputTokens'),'gptTokens':tokens.get('totalTokens'),'uncachedInputTokens':(tokens.get('inputTokens') or 0)-(tokens.get('cachedInputTokens') or 0),'jevCalls':len(jev),'jevInputTokens':ji,'jevOutputTokens':jo,'jevUnknownUsage':unknown,'knownAllTokens':(tokens.get('totalTokens') or 0)+ji+jo,'usageComplete':record['status']=='completed' and not unknown,'investigations':ops.count('investigate'),'recalls':ops.count('recall_output'),'hintSubmissions':sum(e['kind']=='investigation_hint' for e in events),'observedToolIntervalUnionMs':tool_union(record)}
  rows.append(row)
  commands=[];mcp=[]
  for i in record['completedItems']:
   if i['type']=='commandExecution':
    text=i.get('aggregatedOutput','');commands.append({'command':i.get('command'),'exitCode':i.get('exitCode'),'outputBytes':len(text.encode()) if isinstance(text,str) else None,'outputSha256':hashlib.sha256(text.encode()).hexdigest() if isinstance(text,str) else None,'outputPreview':text[:800] if isinstance(text,str) else None})
   if i['type']=='mcpToolCall':
    result=i.get('result') or {};value=result.get('structuredContent') or {}
    if not value:
     try:value=json.loads(result['content'][0]['text'])
     except (KeyError,IndexError,TypeError,json.JSONDecodeError):pass
    context=value.get('context','')
    mcp.append({'tool':i.get('tool'),'arguments':i.get('arguments'),'status':i.get('status'),'error':i.get('error'),'resultSummary':{k:v for k,v in value.items() if k not in ['context','items']},'items':value.get('items'),'contextBytes':len(context.encode()),'contextSha256':hashlib.sha256(context.encode()).hexdigest(),'contextPreview':context[:800]})
  audits.append(scrub({'metrics':row,'quality':record.get('quality'),'artifacts':record.get('artifacts'),'commands':commands,'mcp':mcp,'usage':record['usage'],'timeline':record['timeline'],'jevEvents':events}))
  p=base/record['id']/'run.json';raw_hashes[str(p.relative_to(root))]=sha(p)
with (out/'runs.csv').open('w') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");writer.writeheader();writer.writerows(rows)
(out/'runs.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2)+'\n')
(out/'protocols.json').write_text(json.dumps(protocols,ensure_ascii=False,indent=2)+'\n')
live={}
for folder in ['investigation-live-20260924','investigation-live-atomic-20260924','investigation-live-atomic-fixed-20260924','investigation-live-bounded-20260924','investigation-live-timed-20260924','investigation-live-retention-fixed-20260924']:
 live[folder]=json.loads((root/'dist'/folder/'result.json').read_text())
(out/'live-attempts.json').write_text(json.dumps(live,ensure_ascii=False,indent=2)+'\n')
network={p.stem:json.loads(p.read_text()) for p in (root/'dist/investigation-network-20260924').glob('*.json')}
(out/'network-diagnostics.json').write_text(json.dumps(network,indent=2)+'\n')
(out/'native-regression.json').write_bytes((root/'dist/investigation-native-20260924/native.json').read_bytes())
(out/'packed-source-snapshot.json').write_bytes((root/'dist/investigation-packed-20260924/source-snapshot.json').read_bytes())
packed=[r for r in rows if r['phase']=='packed'];totals={arm:{k:sum(r[k] for r in packed if r['arm']==arm) for k in ['endToEndMs','gptTokens','knownAllTokens','generationsWithUsage','inputTokens','cachedInputTokens','uncachedInputTokens','outputTokens','observedToolIntervalUnionMs']} for arm in ['bare','jev']}
changes={k:(totals['jev'][k]/totals['bare'][k]-1)*100 for k in ['endToEndMs','gptTokens','knownAllTokens','generationsWithUsage','cachedInputTokens','uncachedInputTokens','outputTokens']}
pairs=[]
for repeat in [0,1]:
 a=next(r for r in packed if r['arm']=='bare' and r['repeat']==repeat);b=next(r for r in packed if r['arm']=='jev' and r['repeat']==repeat)
 pairs.append({'repeat':repeat,'timeChangePercent':(b['endToEndMs']/a['endToEndMs']-1)*100,'tokenChangePercent':(b['knownAllTokens']/a['knownAllTokens']-1)*100,'baseline':a,'candidate':b})
summary={'paidNativeAttempts':len(rows),'accepted':sum(r['passed'] for r in rows),'fullTaskJevCalls':sum(r['jevCalls'] for r in rows),'packedTotals':totals,'packedChangePercent':changes,'pairs':pairs,'liveCallAttempts':sum(len(x.get('calls',[])) for x in live.values()),'liveSuccessfulCalls':sum(c['status']=='success' for x in live.values() for c in x.get('calls',[])),'liveFailedUnknownUsage':sum(c.get('inputTokens') is None for x in live.values() for c in x.get('calls',[])),'deployment':'HELD: both end-to-end targets have not passed; installed desktop remains unchanged.','limits':['Development fixtures, not held-out generalization.','One policy fixture, two paired repeats for packed version.','No desktop effort routing in paid task arms.','First packed baseline overlapped two short failed Jev integration requests; no causal timing claim.','Atomic request profile, narrower hint eligibility, five-second evidence deadline and survivor-budget fix occurred after the packed task measurement. They have separate component/regression evidence, no new task A/B.','Unknown usage on timed-out Jev requests is not zero.','Public command/model-visible output bodies are bounded previews and hashes; full private run artifacts are not published.']}
summary['liveKnownInputTokens']=sum(c.get('inputTokens',0) or 0 for x in live.values() for c in x.get('calls',[]))
summary['liveKnownOutputTokens']=sum(c.get('outputTokens',0) or 0 for x in live.values() for c in x.get('calls',[]))
summary['diagnosticModelCall']={'calls':1,'inputTokens':315,'outputTokens':31,'includedInTaskAB':False}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
(out/'private-artifact-hashes.json').write_text(json.dumps(raw_hashes,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
