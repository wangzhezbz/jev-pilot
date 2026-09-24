"""Reconcile every model notification and Jev request; keep all attempts."""
import csv, hashlib, json, pathlib, re, sys
source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
data=json.loads((source/'results.json').read_text());rows=[]
for r in data['records']:
    previous={k:0 for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']};generations=0
    for u in r.get('usage',[]):
        delta={k:u['total'][k]-previous[k] for k in previous}
        if not any(delta.values()):continue
        assert all(v>=0 for v in delta.values()),r['id']
        assert all(delta[k]==u['last'][k] for k in delta),r['id']
        previous={k:u['total'][k] for k in previous};generations+=1
    if r.get('tokens'):assert all(previous[k]==r['tokens'][k] for k in previous),r['id']
    events=r.get('jevEvents',[])+r.get('externalJevEvents',[])
    calls=[e for e in events if e['kind']=='jev_call'];routes=[d for d in r.get('routing',[]) if d.get('kind')=='decision' and d.get('model')!='fixed-control-no-api']
    assert len(calls)>=len(routes),r['id']
    assert all(d.get('targetModel')==r.get('model') for d in routes),r['id']
    row={k:r.get(k) for k in ['id','arm','repeat','model','status','passed','error']}
    row.update(nativeMs=r.get('nativeMs',r.get('wallMs')),preparationMs=r.get('preparationMs',0),endToEndMs=r.get('endToEndMs',r.get('wallMs')),startupMs=r.get('startupMs'),generations=generations,**previous)
    row.update(uncachedInputTokens=previous['inputTokens']-previous['cachedInputTokens'],jevCalls=len(calls),jevInputTokens=sum(e.get('inputTokens') or 0 for e in calls),jevOutputTokens=sum(e.get('outputTokens') or 0 for e in calls),jevUnknownUsage=sum(e.get('inputTokens') is None or e.get('outputTokens') is None for e in calls),jevFailures=sum(e.get('status')!='success' for e in calls),routerDecisions=len(routes),actualSwitches=sum(d.get('status') in ['applied','start_forwarded'] and d.get('from')!=d.get('published') for d in routes),routerMs=sum(d.get('elapsedMs',0) for d in routes),evidenceOperations=sum(e.get('kind')=='operation' and e.get('operation') in ['select','prepare_output','filter_output'] for e in events))
    row['knownAllTokens']=row['totalTokens']+row['jevInputTokens']+row['jevOutputTokens']
    row['jevInputUsdEstimate']=row['jevInputTokens']*.042/1e6
    rows.append(row)
summary={'planned':data['protocol']['runs'],'attempted':len(rows),'passed':sum(r['passed'] is True for r in rows),'complete':len(rows)==data['protocol']['runs'],'arms':{}}
metrics=['nativeMs','preparationMs','endToEndMs','startupMs','generations','inputTokens','cachedInputTokens','uncachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','jevCalls','jevInputTokens','jevOutputTokens','jevUnknownUsage','jevFailures','routerDecisions','actualSwitches','routerMs','evidenceOperations','knownAllTokens','jevInputUsdEstimate']
for arm in dict.fromkeys(r['arm'] for r in rows):
    rs=[r for r in rows if r['arm']==arm]
    summary['arms'][arm]={'runs':len(rs),'passed':sum(r['passed'] is True for r in rs),**{k:sum(r[k] or 0 for r in rs) for k in metrics},'missingTimeMeasurements':sum(r['endToEndMs'] is None for r in rs)}
def public(obj):
    s=json.dumps(obj,ensure_ascii=False,indent=2)
    assert not re.search(r'apikey_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}',s)
    s=s.replace(str(pathlib.Path.home()),'<HOME>')
    return re.sub(r'/var/folders/[^/]+/[^/]+/T/','<TMP>/',s)+'\n'
public_records=[{**r,'completedItems':[i for i in r.get('completedItems',[]) if i.get('type')!='reasoning']} for r in data['records']]
for name,value in [('protocol.json',data['protocol']),('runs.json',public_records),('summary.json',summary)]: (out/name).write_text(public(value))
with (out/'runs.csv').open('w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
(out/'manifest.json').write_text(public({'rawSha256':hashlib.sha256((source/'results.json').read_bytes()).hexdigest(),'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.name!='manifest.json' and p.is_file()}}))
print(json.dumps(summary,ensure_ascii=False,indent=2))
