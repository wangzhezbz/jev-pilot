"""Account real native generation usage for the frozen desktop UI episodes.

No token estimates from text size. Missing, duplicated or unmatched usage fails.
Bootstrap/reporting outside the named episode cells is explicitly excluded.
"""
import argparse, csv, json, re
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--rollout', required=True)
p.add_argument('--results', required=True)
a = p.parse_args()
root = Path(a.results)
pattern = re.compile(r'title:\s*"(holdout-(?:chrome|cua)-(?:bare|pilot)-[a-z0-9]+)')
records, models, pending = [], {}, None
with open(a.rollout) as f:
    for line in f:
        r = json.loads(line); v = r.get('payload', {})
        if r.get('type') == 'turn_context':
            models[v.get('turn_id')] = v.get('model')
        if r.get('type') == 'response_item' and v.get('type') == 'custom_tool_call':
            m = pattern.search(v.get('input', ''))
            pending = {'marker': m[1], 'at': r['timestamp'], 'callId': v.get('call_id'), 'count': 0} if m else None
        if r.get('type') == 'token_usage_record' and pending:
            pending['count'] += 1
            assert pending['count'] == 1, pending
            records.append({'marker': pending['marker'], 'at': pending['at'],
                            'usage': v['usage'], 'model': models.get(v.get('turn_id'))})
        if r.get('type') == 'response_item' and v.get('type') == 'custom_tool_call_output' and pending and pending['callId'] == v.get('call_id'):
            assert pending['count'] == 1, pending
            pending = None
assert len({x['marker'] for x in records}) == len(records), 'Repeated measured cell'
runs = json.loads((root / 'ui-runs.json').read_text())
for r in runs:
    cells = [c for c in records if c['marker'].startswith('holdout-' + r['id'] + '-')]
    assert cells and cells[0]['marker'].endswith('-start') and re.search(r'-finish2?$',cells[-1]['marker']), r['id']
    assert len({c['model'] for c in cells}) == 1, 'Model changed within UI episode'
    r['cells'] = cells
    r['gptCalls'] = len(cells)
    r['gpt'] = {k: sum(c['usage'].get(k, 0) for c in cells) for k in
                ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens']}
    r['gpt']['uncached_input_tokens'] = r['gpt']['input_tokens'] - r['gpt']['cached_input_tokens']
    assert r['gpt']['input_tokens'] + r['gpt']['output_tokens'] == r['gpt']['total_tokens']
pairs = []
for platform in ['chrome', 'cua']:
    x = next(r for r in runs if r['id'] == f'{platform}-bare')
    y = next(r for r in runs if r['id'] == f'{platform}-pilot')
    valid=x.get('measurementValid',True) and y.get('measurementValid',True)
    pairs.append({'platform':platform,'bothPassed':x['passed'] and y['passed'],'measurementValid':valid,
      'timePercent':100*(y['elapsedMs']/x['elapsedMs']-1) if valid else None,
      'gptTotalPercent':100*(y['gpt']['total_tokens']/x['gpt']['total_tokens']-1) if valid else None,
      'gptUncachedPercent':100*(y['gpt']['uncached_input_tokens']/x['gpt']['uncached_input_tokens']-1) if valid else None})
(root / 'usage.json').write_text(json.dumps({'runs': runs, 'pairs': pairs}, ensure_ascii=False, indent=2) + '\n')
with (root / 'runs.csv').open('w') as f:
    fields = ['id', 'seconds', 'passed', 'gpt_calls', 'gpt_input', 'gpt_cached', 'gpt_uncached', 'gpt_output', 'gpt_total', 'jev_requests', 'jev_input', 'jev_output', 'jev_unknown', 'fallback']
    w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n'); w.writeheader()
    for r in runs:
        g, j = r['gpt'], r.get('jev', {})
        w.writerow(dict(zip(fields, [r['id'], r['elapsedMs'] / 1000, r['passed'], r['gptCalls'], g['input_tokens'], g['cached_input_tokens'], g['uncached_input_tokens'], g['output_tokens'], g['total_tokens'], j.get('jevRequests', 0), j.get('inputTokens', 0), j.get('outputTokens', 0), j.get('unknownUsage', 0), r.get('fallback')])))
print(json.dumps(pairs, indent=2))
