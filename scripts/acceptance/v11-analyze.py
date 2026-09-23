"""Publish bounded pilot measurements; no quota or savings extrapolation."""
import csv, json, pathlib, hashlib
root=pathlib.Path(__file__).resolve().parents[2]
src=root/'dist/v11-cost-fix-20260923'
out=root/'docs/reports/cost-fix-20260923'
data=json.loads((src/'results.json').read_text())
rows=[];details=[]
for r in data['records']:
 t=r.get('tokens') or {};events=r.get('jevEvents',[]);calls=[e for e in events if e['kind']=='jev_call'];decisions=[e for e in r.get('routing',[]) if e['kind']=='decision'];filters=[e for e in events if e['kind']=='automatic_output_result']
 row={k:r.get(k) for k in ['id','model','task','arm','status','passed','wallMs']}
 row.update({k:t.get(k) for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']})
 row['usageSnapshots']=len(r.get('usage',[]))
 row['uncachedInputTokens']=t.get('inputTokens',0)-t.get('cachedInputTokens',0) if t else None
 row.update(jevCalls=len(calls),jevFailures=sum(e.get('status')=='failed' for e in calls),jevUnknownUsage=sum(e.get('inputTokens') is None or e.get('outputTokens') is None for e in calls),jevInputTokens=sum(e.get('inputTokens') or 0 for e in calls),jevOutputTokens=sum(e.get('outputTokens') or 0 for e in calls),jevWaitMs=sum(e.get('elapsedMs') or 0 for e in calls),actualChanges=sum(e.get('status') in ['applied','start_forwarded'] and e.get('from')!=e.get('published') for e in decisions),ceilingBlocked=sum(bool(e.get('ceilingApplied')) for e in decisions),filtersApplied=sum(bool(e.get('applied')) for e in filters),deferredItems=sum(e.get('deferredItems',0) for e in filters))
 rows.append(row)
 fields=['kind','event','status','from','published','recommended','baselineEffort','ceilingApplied','confirmation','inputTokens','outputTokens','elapsedMs','horizon','horizonReason','code']
 details.append(dict(id=r['id'],quality=r.get('quality'),errors=r.get('errors'),routing=[{k:e[k] for k in fields if k in e} for e in r.get('routing',[])],filterOutcomes=[{k:v for k,v in e.items() if k not in ['project','cwd','session','taskId']} for e in filters]))
pairs=[]
for f in rows:
 if f['arm']!='fixed':continue
 a=next((x for x in rows if x['arm']=='auto' and x['model']==f['model'] and x['task']==f['task']),None)
 if a:pairs.append({'model':f['model'],'task':f['task'],'bothPassed':bool(f['passed'] and a['passed']),'fixed':f,'auto':a})
matched=[p for p in pairs if p['bothPassed']]
metrics=['wallMs','totalTokens','uncachedInputTokens','outputTokens','reasoningOutputTokens']
summary={'attempted':len(rows),'planned':data['protocol']['runs'],'passed':sum(bool(r['passed']) for r in rows),'matchedPairs':len(matched),'metrics':{}}
for key in metrics:
 f=sum(p['fixed'][key] for p in matched);a=sum(p['auto'][key] for p in matched)
 summary['metrics'][key]={'fixed':f,'auto':a,'autoIncreasePercent':(a/f-1)*100 if f else None}
summary['jev']={k:sum(r[k] for r in rows) for k in ['jevCalls','jevFailures','jevUnknownUsage','jevInputTokens','jevOutputTokens','jevWaitMs']}
summary['jev']['knownInputUsdEstimate']=summary['jev']['jevInputTokens']*42/1e9
summary['actualChanges']=sum(r['actualChanges'] for r in rows)
summary['ceilingBlocked']=sum(r['ceilingBlocked'] for r in rows)
summary['filtersApplied']=sum(r['filtersApplied'] for r in rows)
summary['deferredItems']=sum(r['deferredItems'] for r in rows)
for name,obj in [('protocol.json',data['protocol']),('runs.json',details),('summary.json',summary),('pairs.json',pairs)]:
 (out/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
with (out/'runs.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
print(json.dumps(summary,indent=2))
