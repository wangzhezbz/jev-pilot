"""Summarize every attempted arm; cached tokens and Jev are separate resources."""
import csv,json,pathlib,sys
src=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist/workflow-admission-20260923')
out=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'docs/reports/workflow-admission-20260923')
out.mkdir(parents=True,exist_ok=True)
d=json.loads((src/'results.json').read_text());rows=[];details=[]
for r in d['records']:
 t=r.get('tokens') or {};events=r.get('jevEvents',[]);calls=[e for e in events if e['kind']=='jev_call'];route=r.get('routing',[])
 row={k:r.get(k) for k in ['id','model','task','repeat','arm','status','passed','wallMs','startupMs','totalMs']}
 row.update({k:t.get(k) for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']});row['uncachedInputTokens']=t.get('inputTokens',0)-t.get('cachedInputTokens',0) if t else None
 row.update(jevCalls=len(calls),jevFailures=sum(e.get('status')=='failed' for e in calls),jevUnknownUsage=sum(e.get('inputTokens') is None or e.get('outputTokens') is None for e in calls),jevInputTokens=sum(e.get('inputTokens') or 0 for e in calls),jevOutputTokens=sum(e.get('outputTokens') or 0 for e in calls),jevWaitMs=sum(e.get('elapsedMs') or 0 for e in calls),actualChanges=sum(e.get('kind')=='decision' and e.get('status') in ['applied','start_forwarded'] and e.get('from')!=e.get('published') for e in route),automaticFilters=sum(e['kind']=='automatic_output_result' and e.get('applied',False) for e in events),modelTurns=len(r.get('usage',[])),commands=sum(i.get('type')=='commandExecution' for i in r.get('completedItems',[])))
 row['knownAllModelTokens']=(row['totalTokens']+row['jevInputTokens']+row['jevOutputTokens']) if t else None
 rows.append(row)
 details.append({'id':r['id'],'quality':r.get('quality'),'errors':r.get('errors'),'mcpServers':r.get('mcpServers'), 'operations':[{'operation':e['operation'],'calls':e.get('calls'),'elapsedMs':e.get('elapsedMs')} for e in events if e['kind']=='operation'], 'routing':[{k:e[k] for k in ['kind','status','from','published','recommended','event','code','elapsedMs','reason','inputTokens','outputTokens'] if k in e} for e in route], 'outputAdmission':[e for e in events if e['kind'] in ['automatic_output_admission','automatic_output_result','evidence_selection']]})
metrics=['wallMs','totalMs','totalTokens','uncachedInputTokens','outputTokens','reasoningOutputTokens','knownAllModelTokens']
sumv=lambda rs,k:sum(r.get(k) or 0 for r in rs)
summary={'planned':d['protocol']['runs'],'attempted':len(rows),'passed':sum(bool(r['passed']) for r in rows),'arms':{},'pairs':[]}
for arm in ['bare','idle','auto']:
 rs=[r for r in rows if r['arm']==arm]
 summary['arms'][arm]={'runs':len(rs),'passed':sum(bool(r['passed']) for r in rs),**{k:sumv(rs,k) for k in metrics+['jevCalls','jevFailures','jevUnknownUsage','jevInputTokens','jevOutputTokens','jevWaitMs','actualChanges','automaticFilters','modelTurns']}}
 summary['arms'][arm]['knownJevInputUsdEstimate']=sumv(rs,'jevInputTokens')*.042/1e6
for a in rows:
 if a['arm']!='auto':continue
 for arm in ['bare','idle']:
  b=next((r for r in rows if r['arm']==arm and all(r[k]==a[k] for k in ['model','task','repeat'])),None)
  if b:summary['pairs'].append({'task':a['task'],'repeat':a['repeat'],'control':arm,'bothPassed':a['passed'] and b['passed'],'autoIncreasePercent':{k:100*(a[k]/b[k]-1) if a.get(k) is not None and b.get(k) else None for k in metrics}})
for name,obj in [('protocol.json',d['protocol']),('runs.json',details),('summary.json',summary)]: (out/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
if rows:
 with (out/'runs.csv').open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
print(json.dumps(summary,indent=2))
