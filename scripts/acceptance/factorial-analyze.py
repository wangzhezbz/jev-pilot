"""Read-only accounting. Includes native usage and both independent Jev ledgers.

The routing-only bridge uses its default store, not the automation store. Read
only the synthetic project's event rows there; never infer zero from an empty
per-run automation ledger. Do not add routing decision usage a second time.
"""
import csv, hashlib, json, pathlib, sqlite3, sys

def tool_timing(record):
    starts={}; spans=[]
    for e in record.get('timeline',[]):
        if e.get('itemType') not in ['commandExecution','mcpToolCall','fileChange']:continue
        if e['method']=='item/started':starts[e['itemId']]=e['elapsedMs']
        if e['method']=='item/completed' and e['itemId'] in starts:spans.append((starts.pop(e['itemId']),e['elapsedMs']))
    merged=[]
    for lo,hi in sorted(spans):
        if merged and lo<=merged[-1][1]:merged[-1][1]=max(merged[-1][1],hi)
        else:merged.append([lo,hi])
    return round(sum(hi-lo for lo,hi in merged),3)

source = pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'dist/factorial-20260924')
out = pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'docs/reports/factorial-20260924')
out.mkdir(parents=True, exist_ok=True)
data = json.loads((source/'results.json').read_text())
rows=[]; details=[]; generations=[]; accounting=[]
for r in data['records']:
    events = r.get('jevEvents', [])
    ledger = 'per_run_store'
    if r['arm']=='routing':
        projects = {e['projectId'] for e in r.get('routing',[]) if e.get('projectId')}
        assert len(projects)==1, (r['id'],'routing project identity')
        dbpath=pathlib.Path.home()/'.codex/jev-pilot/state.sqlite'
        db=sqlite3.connect(f'file:{dbpath}?mode=ro',uri=True)
        events=[dict(at=at,kind=kind,**json.loads(body)) for at,kind,body in db.execute('SELECT at,kind,body FROM events WHERE project=? ORDER BY seq', (next(iter(projects)),))]
        config=db.execute("SELECT count(*) FROM objects WHERE kind='config' AND project IN ('global',?)",(next(iter(projects)),)).fetchone()[0]
        assert config==0, 'Unexpected configuration override in routing store'
        db.close();ledger='default_store_exact_synthetic_project'
    t=r.get('tokens') or {}; route=r.get('routing',[])
    calls=[e for e in events if e['kind']=='jev_call']
    decisions=[e for e in route if e['kind']=='decision' and e.get('model')!='fixed-control-no-api']
    successful=[e for e in calls if e.get('status')=='success']
    # Decisions are a second view of the router's calls, not additional calls.
    assert len(successful)>=len(decisions), (r['id'],'missing real router ledger')
    row={k:r.get(k) for k in ['id','task','arm','status','passed','wallMs','startupMs','totalMs']}
    row.update({k:t.get(k) for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']})
    row['uncachedInputTokens']=t['inputTokens']-t['cachedInputTokens'] if t else None
    row.update(generations=len(r.get('usage',[])),jevCalls=len(calls),jevFailures=sum(e.get('status')!='success' for e in calls),jevUnknownUsage=sum(e.get('inputTokens') is None or e.get('outputTokens') is None for e in calls),jevInputTokens=sum(e.get('inputTokens') or 0 for e in calls),jevOutputTokens=sum(e.get('outputTokens') or 0 for e in calls),jevRequestMs=sum(e.get('elapsedMs') or 0 for e in calls),routerDecisions=len(decisions),routerDecisionMs=sum(e.get('elapsedMs') or 0 for e in decisions),startChanges=sum(e.get('status')=='start_forwarded' and e.get('from')!=e.get('published') for e in decisions),nativeAppliedChanges=sum(e.get('status')=='applied' and e.get('from')!=e.get('published') for e in decisions),nativeRestores=sum(e.get('kind')=='effort_restore' and e.get('status')=='applied' for e in route),preparedOutputs=sum(e['kind']=='prepared_output' and e.get('status')=='prepared' for e in events),evidenceOperations=sum(e['kind']=='operation' and e.get('operation') in ['prepare_output','filter_output','select','search','extract'] for e in events),recalls=sum(e['kind']=='operation' and e.get('operation') in ['recall_output','recall'] for e in events),hookSubmissions=sum(e['kind']=='automatic_output_result' and e.get('submitted',False) for e in events))
    row['knownAllModelTokens']=t['totalTokens']+row['jevInputTokens']+row['jevOutputTokens'] if t else None
    row['budgetHeldDecisions']=sum(e.get('status')=='budget_held' for e in decisions)
    row['recommendedChanges']=sum(e.get('recommended') not in ['keep',e.get('from'),None] for e in decisions)
    row['knownJevInputUsdEstimate']=row['jevInputTokens']*.042/1e6
    # Native notifications can repeat the same cumulative and last usage.
    # Preserve raw notifications in runs.json; count each positive increment
    # once. Never silently accept a correction or a missing generation.
    last=[]; duplicates=0
    keys=['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']
    previous={k:0 for k in keys}
    for u in r.get('usage',[]):
        delta={k:u['total'][k]-previous[k] for k in keys}
        if all(v==0 for v in delta.values()):
            assert last and all(u['last'][k]==last[-1][k] for k in keys), (r['id'],'ambiguous zero-usage notification')
            duplicates+=1;continue
        assert all(v>=0 for v in delta.values()), (r['id'],'negative usage correction')
        assert all(delta[k]==u['last'][k] for k in keys), (r['id'],'last usage differs from cumulative increment')
        last.append(u['last']);previous={k:u['total'][k] for k in keys}
    row['usageNotifications']=len(r.get('usage',[]))
    row['duplicateUsageNotifications']=duplicates
    row['generations']=len(last)
    for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']:
        assert not t or sum(g[k] for g in last)==t[k], (r['id'],k,'usage reconciliation')
    for i,g in enumerate(last):generations.append(dict(id=r['id'],task=r['task'],arm=r['arm'],generation=i+1,**{k:g[k] for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']}))
    row['firstInputTokens']=last[0]['inputTokens'] if last else None
    row['historyGrowthTokens']=sum(g['inputTokens']-row['firstInputTokens'] for g in last) if last else None
    commands=[i for i in r.get('completedItems',[]) if i['type']=='commandExecution']
    row['commands']=len(commands)
    row['identicalCommandRepeats']=len(commands)-len({i.get('command') for i in commands})
    row['observedToolSpanUnionMs']=tool_timing(r)
    row['nativeCommandDurationUsable']=bool(commands) and all((i.get('durationMs') or 0)>0 for i in commands)
    rows.append(row)
    items=[i for i in r.get('completedItems',[]) if i['type']!='reasoning']
    details.append(dict(id=r['id'],quality=r.get('quality'),errors=r.get('errors'),error=r.get('error'),pluginVersion=r.get('pluginVersion'),mcpServers=r.get('mcpServers'),ledgerSource=ledger,jevEvents=events,routing=route,usage=r.get('usage',[]),timeline=r.get('timeline',[]),completedItems=items,artifacts=r.get('artifacts'),changedPaths=r.get('changedPaths')))

metrics=['wallMs','startupMs','totalMs','inputTokens','cachedInputTokens','uncachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens','generations','jevCalls','jevFailures','jevUnknownUsage','jevInputTokens','jevOutputTokens','jevRequestMs','routerDecisions','routerDecisionMs','recommendedChanges','budgetHeldDecisions','startChanges','nativeAppliedChanges','nativeRestores','preparedOutputs','evidenceOperations','recalls','hookSubmissions','knownAllModelTokens','knownJevInputUsdEstimate','commands','identicalCommandRepeats','observedToolSpanUnionMs']
summary=dict(planned=data['protocol']['runs'],attempted=len(rows),passed=sum(bool(r['passed']) for r in rows),arms={},pairs=[])
for arm in ['bare','routing','evidence','combined']:
    rs=[r for r in rows if r['arm']==arm]
    summary['arms'][arm]=dict(runs=len(rs),passed=sum(bool(r['passed']) for r in rs),**{k:sum(r.get(k) or 0 for r in rs) for k in metrics})
for a in rows:
    if a['arm']=='bare':continue
    b=next((r for r in rows if r['arm']=='bare' and r['task']==a['task']),None)
    if not b:continue
    pair=dict(task=a['task'],arm=a['arm'],bothPassed=a['passed'] and b['passed'],increasePercent={k:100*(a[k]/b[k]-1) if a.get(k) is not None and b.get(k) else None for k in ['wallMs','totalMs','totalTokens','uncachedInputTokens','knownAllModelTokens']})
    summary['pairs'].append(pair)
    if a['firstInputTokens'] is not None and b['firstInputTokens'] is not None:
        parts=dict(extraGenerationBase=(a['generations']-b['generations'])*b['firstInputTokens'],repeatedFirstInputDifference=a['generations']*(a['firstInputTokens']-b['firstInputTokens']),historyGrowthDifference=a['historyGrowthTokens']-b['historyGrowthTokens'],outputDifference=a['outputTokens']-b['outputTokens'])
        delta=a['totalTokens']-b['totalTokens'];assert sum(parts.values())==delta
        accounting.append(dict(task=a['task'],arm=a['arm'],totalTokenDelta=delta,**parts))

# Machine-specific paths are replaced only in the public copy. Raw local data is
# retained byte-for-byte under dist/. No credential file is read by this script.
def public(obj):
    text=json.dumps(obj,ensure_ascii=False,indent=2)
    import re
    assert not re.search(r'apikey_[A-Za-z0-9_-]+|\bsk-[A-Za-z0-9_-]{12,}',text), 'Credential in public material'
    text=text.replace(str(pathlib.Path.home()),'<HOME>')
    text=re.sub(r'/var/folders/[^/]+/[^/]+/T/', '<TMP>/',text)
    return text+'\n'
for name,obj in [('protocol.json',data['protocol']),('runs.json',details),('summary.json',summary),('accounting.json',accounting)]:
    (out/name).write_text(public(obj))
for name,items in [('runs.csv',rows),('generations.csv',generations),('token-decomposition.csv',accounting)]:
    if items:
        with (out/name).open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=list(items[0]),lineterminator='\n');writer.writeheader();writer.writerows(items)
(out/'manifest.json').write_text(public(dict(sourceSha256=hashlib.sha256((source/'results.json').read_bytes()).hexdigest(),complete=len(rows)==data['protocol']['runs'],reportFiles={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file() and p.name!='manifest.json'})))
print(json.dumps(summary,ensure_ascii=False,indent=2))
