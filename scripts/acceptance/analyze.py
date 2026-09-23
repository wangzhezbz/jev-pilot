"""Rebuild public tables from original receipts; no hand-entered timing values."""
import csv, hashlib, json, math, random, statistics, sys
from collections import Counter, defaultdict
from pathlib import Path

base = Path(sys.argv[1] if len(sys.argv)>1 else 'dist/acceptance-v10-20260923')
out = Path(sys.argv[2] if len(sys.argv)>2 else 'docs/reports/validation-20260923')
out.mkdir(parents=True, exist_ok=True)
raw = json.loads((base/'results.json').read_text())
expected_order=[f"{j['model']}-{j['task']}-{j['repeat']}-{arm}" for j in raw['protocol']['jobs'] for arm in j['arms']]
assert [r['id'] for r in raw['records']]==expected_order[:len(raw['records'])], 'PREREGISTERED_ORDER_MISMATCH'
assert len(raw['records'])<=len(expected_order), 'EXTRA_UNREGISTERED_RUNS'
event_fields = ['at','kind','event','targetModel','model','from','recommended','published','status','code','confirmation','elapsedMs','inputTokens','outputTokens','horizon','recommendedHorizon','horizonReason','probability','confidence','reason','recoveryScheduled','retryAfterMs','attempt','leaseUnit','boundaryId','adapter','originalBytes','retainedBytes','sourceTextBytes','retainedRatio','excludedItems','deferredItems','applied','nativeTokenSavings','totalTokens','cachedInputTokens','reasoningOutputTokens','scope','batchLeaseSkips','supportedEfforts','policyVersion','finalEffort','usage','usageEvents','invalidUsageEvents','routineProgressNotes','leaseSkips','budgetSkips','coalescedBoundaries','accounting']
def clean(v):
    if isinstance(v,str):
        import re
        v=re.sub(r'/Users/[^/\s]+', '<user-home>',v)
        v=re.sub(r'/var/folders/[^\s"\']+', '<private-temp-path>',v)
        return v
    if isinstance(v,list): return [clean(x) for x in v]
    if isinstance(v,dict): return {k:clean(x) for k,x in v.items()}
    return v
def subset(x): return {k:x[k] for k in event_fields if k in x}
rows=[];public=[]
for r in raw['records']:
    t=r.get('tokens') or {}
    calls=[e for e in r.get('jevEvents',[]) if e.get('kind')=='jev_call']
    decisions=[e for e in r.get('routing',[]) if e.get('kind')=='decision' and e.get('model')!='fixed-control-no-api']
    changes=[e for e in decisions if e.get('from')!=e.get('published') and e.get('status') in ('start_forwarded','applied')]
    native=[e for e in changes if e.get('status')=='applied']
    outputs=[e for e in r.get('jevEvents',[]) if e.get('kind')=='automatic_output_filter']
    row={k:r.get(k) for k in ['id','model','task','repeat','arm','startedAt','status','wallMs','passed']}
    row['artifactQualityPassed']=(r.get('quality') or {}).get('pass',False)
    row['timeLimitReached']=bool(r.get('wallMs',0)>=raw['protocol']['timeLimitMs'] and r['status']!='completed')
    for k in ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens']: row[k]=t.get(k)
    row['nativeUsageEvents']=len(r.get('usage',[]))
    row['uncachedInputTokens']=None if not t else t.get('inputTokens',0)-t.get('cachedInputTokens',0)
    row.update(jevAttempts=len(calls),jevFailures=sum(e.get('status')=='failed' for e in calls),jevInputTokens=sum(e.get('inputTokens') or 0 for e in calls),jevOutputTokens=sum(e.get('outputTokens') or 0 for e in calls),jevElapsedMs=sum(e.get('elapsedMs') or 0 for e in calls),effortChanges=len(changes),firstParameterChanges=len(changes)-len(native),nativeAppliedChanges=len(native),outputFilters=len(outputs),filteredBytes=sum(e['originalBytes']-e['retainedBytes'] for e in outputs))
    assert not t or t.get('inputTokens',0)+t.get('outputTokens',0)==t.get('totalTokens',0), 'TOKEN_TOTAL_MISMATCH'
    assert not t or 0<=t.get('cachedInputTokens',0)<=t.get('inputTokens',0), 'CACHE_SUBSET_MISMATCH'
    assert not t or 0<=t.get('reasoningOutputTokens',0)<=t.get('outputTokens',0), 'REASONING_SUBSET_MISMATCH'
    usage_events=[e for e in r.get('routing',[]) if e.get('kind')=='turn_usage']
    if usage_events and t: assert usage_events[-1]['usage']==t, 'ROUTER_CLIENT_USAGE_MISMATCH'
    # Failed calls can be billed remotely without a usage receipt. Never invent zero usage for them.
    row['jevUsageUnknownCalls']=sum(e.get('status')=='failed' or e.get('inputTokens') is None for e in calls)
    rows.append(row)
    public.append({**row,'quality':clean(r.get('quality')),'errors':clean(r.get('errors',[])),'error':clean(r.get('error')),'nativeUsage':r.get('usage',[]),'routing':[subset(e) for e in r.get('routing',[])],'semanticEvents':[subset(e) for e in r.get('jevEvents',[])],'artifacts':clean(r.get('artifacts',{}))})
def csvfile(name,entries):
    if not entries:return
    with (out/name).open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(entries[0]),lineterminator='\n');w.writeheader();w.writerows(entries)
csvfile('runs.csv',rows)
groups=defaultdict(dict)
for r in rows: groups[(r['model'],r['task'],r['repeat'])][r['arm']]=r
pairs=[]
for (model,task,repeat),arms in groups.items():
    f,a=arms.get('fixed'),arms.get('auto');eligible=bool(f and a and f['passed'] and a['passed'])
    p={'model':model,'task':task,'repeat':repeat,'qualityAcceptedPair':eligible,'fixedStatus':f and f['status'],'autoStatus':a and a['status']}
    for k in ['wallMs','totalTokens','inputTokens','uncachedInputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','nativeUsageEvents']:
        p['fixed_'+k]=f and f[k];p['auto_'+k]=a and a[k];p['savingPct_'+k]=(1-a[k]/f[k])*100 if eligible and f[k] else None
    pairs.append(p)
csvfile('pairs.csv',pairs)
numeric=['wallMs','totalTokens','inputTokens','uncachedInputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','nativeUsageEvents']
def summarize(ps):
    ps=[p for p in ps if p['qualityAcceptedPair']]
    if not ps:return {'pairs':0}
    result={'pairs':len(ps),'metrics':{}}
    for k in numeric:
        f=sum(p['fixed_'+k] for p in ps);a=sum(p['auto_'+k] for p in ps)
        result['metrics'][k]={'fixedTotal':f,'autoTotal':a,'fixedMean':f/len(ps),'autoMean':a/len(ps),'fixedMedian':statistics.median(p['fixed_'+k] for p in ps),'autoMedian':statistics.median(p['auto_'+k] for p in ps),'savingPct':(1-a/f)*100 if f else None,'autoLowerPairs':sum(p['auto_'+k]<p['fixed_'+k] for p in ps)}
    return result
complete=[p for p in pairs if p['qualityAcceptedPair']]
summary={'plannedRuns':raw['protocol']['runs'],'attemptedRuns':len(rows),'successfulRuns':sum(bool(r['passed']) for r in rows),'finished':len(rows)==raw['protocol']['runs'],'countsByStatus':dict(Counter(r['status'] for r in rows)),'qualityByArm':{arm:{'attempted':sum(r['arm']==arm for r in rows),'passed':sum(r['arm']==arm and bool(r['passed']) for r in rows)}for arm in ['fixed','auto']},'matchedQualityAccepted':summarize(pairs),'byModel':{m:summarize([p for p in pairs if p['model']==m])for m in raw['protocol']['models']},'byTask':{t:summarize([p for p in pairs if p['task']==t])for t in sorted(set(p['task'] for p in pairs))},'allAttemptsTotals':{k:sum(r.get(k)or 0 for r in rows) for k in numeric+['jevAttempts','jevFailures','jevInputTokens','jevOutputTokens','jevElapsedMs','jevUsageUnknownCalls','effortChanges','firstParameterChanges','nativeAppliedChanges','outputFilters','filteredBytes']}}
# Cluster bootstrap keeps the two repeats from a model/task together.
clusters=defaultdict(list)
for p in complete:clusters[(p['model'],p['task'])].append(p)
rng=random.Random(230923)
if len(clusters)>=2:
    values=list(clusters.values());intervals={k:[] for k in ['wallMs','totalTokens','uncachedInputTokens','outputTokens']}
    for _ in range(10000):
        sample=[p for _ in values for p in rng.choice(values)]
        for k in intervals:
            f=sum(p['fixed_'+k] for p in sample);a=sum(p['auto_'+k] for p in sample)
            if f:intervals[k].append((1-a/f)*100)
    summary['exploratoryClusterBootstrap95']={k:[sorted(v)[int(len(v)*.025)],sorted(v)[min(len(v)-1,int(len(v)*.975))]]for k,v in intervals.items()}
    summary['bootstrapClusters']=len(clusters)
all_paired=[arms for arms in groups.values() if 'fixed' in arms and 'auto' in arms]
summary['allPairedAttempts']={arm:{'runs':len(all_paired),'passed':sum(bool(x[arm]['passed']) for x in all_paired),'wallMs':sum(x[arm]['wallMs'] or 0 for x in all_paired),'knownTotalTokens':sum(x[arm]['totalTokens'] or 0 for x in all_paired),'unknownUsageRuns':sum(x[arm]['totalTokens'] is None for x in all_paired)} for arm in ['fixed','auto']}
summary['missingGPTUsageRuns']=[r['id'] for r in rows if r['totalTokens'] is None]
summary['dataIntegrity']={'preregisteredOrderMatches':True,'duplicateOrExtraRuns':False,'nativeUsageArithmeticChecked':True,'cacheAndReasoningSubsetsChecked':True,'routerAndClientTotalsCheckedWhereAvailable':True,'completedAtOrBeyondDeadline':[r['id'] for r in rows if r['status']=='completed' and r['wallMs']>=raw['protocol']['timeLimitMs']]}
summary['jevInputOnlyEstimateUsd']=summary['allAttemptsTotals']['jevInputTokens']*42/1e9
auto_raw=[r for r in raw['records'] if r['arm']=='auto']
changes=[e for r in auto_raw for e in r.get('routing',[]) if e.get('kind')=='decision' and e.get('from')!=e.get('published') and e.get('status') in ('start_forwarded','applied')]
effort_order={'minimal':0,'low':1,'medium':2,'high':3,'xhigh':4,'max':5,'ultra':6}
filter_results=[e for r in auto_raw for e in r.get('jevEvents',[]) if e.get('kind')=='automatic_output_result']
summary['activation']={
 'automaticRuns':len(auto_raw),
 'runsWithAppliedEffortChange':sum(any(e.get('kind')=='decision' and e.get('from')!=e.get('published') and e.get('status') in ('start_forwarded','applied') for e in r.get('routing',[])) for r in auto_raw),
 'effortTransitions':dict(Counter(f"{e['from']} -> {e['published']}" for e in changes)),
 'upshifts':sum(effort_order.get(e.get('published'),-1)>effort_order.get(e.get('from'),-1) for e in changes),
 'downshifts':sum(effort_order.get(e.get('published'),-1)<effort_order.get(e.get('from'),-1) for e in changes),
 'routingFallbacksByCode':dict(Counter(e.get('code','unknown') for r in auto_raw for e in r.get('routing',[]) if e.get('kind') in ('fallback','metadata_unavailable'))),
 'metadataUnavailableByArm':{arm:sum(e.get('kind')=='metadata_unavailable' for r in raw['records'] if r['arm']==arm for e in r.get('routing',[])) for arm in ['fixed','auto']},
 'outputAdmissionsByReason':dict(Counter(e.get('reason','unknown') for r in auto_raw for e in r.get('jevEvents',[]) if e.get('kind')=='automatic_output_admission')),
 'filterResultsByReason':dict(Counter(e.get('reason','unknown') for e in filter_results)),
 'filterResultsWithExclusion':sum(bool(e.get('applied')) and e.get('excludedItems',0)>0 for e in filter_results),
 'filterResultsWithDeferralOnly':sum(bool(e.get('applied')) and e.get('excludedItems',0)==0 and e.get('deferredItems',0)>0 for e in filter_results),
 'filterExcludedItems':sum(e.get('excludedItems',0) for e in filter_results),
 'filterDeferredItems':sum(e.get('deferredItems',0) for e in filter_results),
}
summary['pricingSource']='https://typesafe.ai/ (42 USD per billion input tokens, checked 2026-09-23); input-only estimate excludes unknown failed-call usage and is not account debit.'
summary['limitations']=['Two repeats per model/task; synthetic author-built workloads, not a production corpus.','Matched quality-accepted subset excludes failed/incomplete pairs; all attempts and their costs remain in runs.csv.','No quota/account debit or graphical desktop wall-time measurement.','GPT cached input is a subset of input; reasoning output is a subset of output; never add either twice.','Jev and GPT tokenizers differ; adding their counts does not estimate equivalent work or money.','Current host continues running normal applications and this parent conversation; initial feature/native/browser checks overlapped some arms. Single concurrency applies to this benchmark only.','Absolute latency includes model waiting, tools and Jev work, but excludes app startup and independent offline acceptance.','No component ablation: combined auto results cannot causally separate effort routing from filtering.','The control uses the same bridge/hooks with a zero-network keep evaluator and disabled filtering; it is not an unmodified bare-Codex process.','No product code changes or selective retries during the paid benchmark.']
for name,v in [('summary.json',summary),('runs.json',public),('protocol.json',raw['protocol'])]: (out/name).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'attempted':len(rows),'planned':summary['plannedRuns'],'qualityAcceptedPairs':len(complete),'allAttemptsTotals':summary['allAttemptsTotals']},ensure_ascii=False))
