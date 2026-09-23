"""Exact accounting from retained native usage; does not infer causal effects."""
import csv, hashlib, json, pathlib, sys
source = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
data = json.loads(source.read_text()); records = data['records']; rows = []
for r in records:
    generations = [u['last'] for u in r['usage']]
    totals = r['tokens']; n = len(generations); first = generations[0]['inputTokens']
    for key in ['inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens', 'reasoningOutputTokens']:
        assert sum(g[key] for g in generations) == totals[key], (r['id'], key)
    growth = sum(g['inputTokens'] - first for g in generations)
    assert totals['totalTokens'] == n * first + growth + totals['outputTokens']
    calls = [e for e in r['jevEvents'] if e['kind'] == 'jev_call']
    decisions = [e for e in r['routing'] if e['kind'] == 'decision']
    commands = [i for i in r['completedItems'] if i['type'] == 'commandExecution']
    rows.append(dict(id=r['id'],task=r['task'],arm=r['arm'],wallMs=r['wallMs'],generations=n,
        firstInput=first,historyGrowth=growth,**totals,
        uncachedInput=totals['inputTokens']-totals['cachedInputTokens'],
        reasoningIncludedInOutput=True,jevCalls=len(calls),
        jevInput=sum(e.get('inputTokens') or 0 for e in calls),jevOutput=sum(e.get('outputTokens') or 0 for e in calls),
        jevRequestMs=sum(e.get('elapsedMs') or 0 for e in calls),
        routerDecisionMs=sum(e.get('elapsedMs') or 0 for e in decisions),
        actualSwitches=sum(e.get('status') in ['applied','start_forwarded'] and e.get('from')!=e.get('published') for e in decisions),
        commands=len(commands),nativeCommandDurationMs=sum(i.get('durationMs') or 0 for i in commands),
        commandDurationUsable=bool(commands) and all((i.get('durationMs') or 0)>0 for i in commands)))
pairs=[]
for a in rows:
    if a['arm']!='auto': continue
    for control in ['bare','idle']:
        b=next(r for r in rows if r['task']==a['task'] and r['arm']==control)
        parts=dict(extraGenerationBase=(a['generations']-b['generations'])*b['firstInput'],
            repeatedFirstInputDifference=a['generations']*(a['firstInput']-b['firstInput']),
            historyGrowthDifference=a['historyGrowth']-b['historyGrowth'],
            outputDifference=a['outputTokens']-b['outputTokens'])
        delta=a['totalTokens']-b['totalTokens']; assert sum(parts.values())==delta
        pairs.append(dict(task=a['task'],control=control,totalTokenDelta=delta,**parts,
            inputDelta=a['inputTokens']-b['inputTokens'],cachedInputDelta=a['cachedInputTokens']-b['cachedInputTokens'],
            uncachedInputDelta=a['uncachedInput']-b['uncachedInput'],wallDeltaMs=a['wallMs']-b['wallMs']))
report=dict(source='dist/workflow-clean-20260923/results.json',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    kind='retrospective_exact_accounting_not_causal_estimation',paidCallsInThisAnalysis=0,
    limits=['One observation per task and arm, not a causal or powered savings estimate.',
      'First input differences include plugin metadata and any other differing initial context.',
      'No timestamps for old generation boundaries. Zero command durations are unusable telemetry.',
      'Cached input is a subset of input; reasoning output is a subset of output.',
      'Router durations can overlap tool work; do not subtract them to infer model latency.'],rows=rows,pairs=pairs)
(out/'accounting.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for name,items in [('runs-accounting.csv',rows),('token-decomposition.csv',pairs)]:
    with (out/name).open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(items[0]),lineterminator='\n');w.writeheader();w.writerows(items)
print(json.dumps(pairs,ensure_ascii=False,indent=2))
