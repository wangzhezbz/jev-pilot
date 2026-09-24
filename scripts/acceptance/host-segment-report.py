"""Extract native usage for explicitly marked current-session UI decision cells.

No pricing, hypothetical calls, full rollout or private text is copied to the report.
The input rollout stays local. Only measured usage and synthetic fixture results export.
"""
import argparse
import json
import re
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--rollout', required=True)
p.add_argument('--results', required=True)
p.add_argument('--out', required=True)
a = p.parse_args()
marker = re.compile(r'title:"((?:native|auto)-(?:chrome|cua)-(?:fresh-|recovery-)?[1-6])：')
records = []
pending = None
models = {}
with open(a.rollout) as f:
    for line in f:
        row = json.loads(line)
        v = row.get('payload', {})
        if row.get('type') == 'turn_context':
            models[v.get('turn_id')] = v.get('model')
        if row.get('type') == 'response_item' and v.get('type') == 'custom_tool_call':
            m = marker.search(v.get('input', ''))
            pending = {'marker': m[1], 'timestamp': row['timestamp'], 'call_id': v.get('call_id'), 'usageRecords': 0} if m else None
        if row.get('type') == 'token_usage_record' and pending:
            pending['usageRecords'] += 1
            assert pending['usageRecords'] == 1, 'ambiguous token attribution'
            records.append({k: x for k, x in pending.items() if k not in ('call_id', 'usageRecords')} | {
                'usageTimestamp': row['timestamp'], 'usage': v['usage'], 'model': models.get(v.get('turn_id')),
            })
        if row.get('type') == 'response_item' and v.get('type') == 'custom_tool_call_output' and pending and pending['call_id'] == v.get('call_id'):
            assert pending['usageRecords'] == 1, 'native usage missing'
            pending = None

root = Path(a.results)
groups = []
for arm, driver, filename, expected in [('native', 'chrome', 'native-chrome', 6), ('auto', 'chrome', 'auto-chrome', 1), ('native', 'cua', 'native-cua', 4), ('auto', 'cua', 'auto-cua-recovered', 3), ('native', 'cua-fresh', 'native-cua-fresh', 6), ('auto', 'cua-fresh', 'auto-cua-fresh', 1)]:
    selected = [r for r in records if re.fullmatch(f'{arm}-{driver}-(?:recovery-)?[1-6]', r['marker'])]
    assert len(selected) == expected, (arm, driver, len(selected))
    result = json.loads((root / (filename + '.json')).read_text())
    usage = {key: sum(r['usage'].get(key, 0) for r in selected) for key in ('input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens')}
    usage['uncached_input_tokens'] = usage['input_tokens'] - usage['cached_input_tokens']
    groups.append({'arm': arm, 'driver': driver, 'segmentMs': result['elapsedMs'], 'decisionCalls': len(selected),
        'nativeUsage': usage, 'jev': result.get('loop', {}).get('metrics'), 'passed': result.get('passed', result.get('loop', {}).get('status') == 'needs_verification'), 'cells': selected})
comparisons = []
for driver in ('chrome', 'cua', 'cua-fresh'):
    base, auto = [g for g in groups if g['driver'] == driver]
    comparisons.append({'driver': driver, 'timeReductionPct': 100 * (1 - auto['segmentMs'] / base['segmentMs']),
        'gptTotalTokenReductionPct': 100 * (1 - auto['nativeUsage']['total_tokens'] / base['nativeUsage']['total_tokens']),
        'gptUncachedInputReductionPct': 100 * (1 - auto['nativeUsage']['uncached_input_tokens'] / base['nativeUsage']['uncached_input_tokens'])})
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
(out / 'segment-usage.json').write_text(json.dumps({'scope': 'One Chrome pair and two different-length Computer Use pairs in an existing long desktop conversation. Nonblinded known fixture, native-first order. Native usage is from real token_usage_record entries for the marked decision tool cells, including recovery. Setup, planning and final verification are excluded; no stable speed or account-billing claim. Input includes cached context. Four-step CUA automatic arm exhausted shared test wait budget and needed native recovery; not a balanced fresh-budget comparison. Six-step CUA follow-up used the next natural budget window without changing task ID or limits.', 'groups': groups, 'comparisons': comparisons}, indent=2) + '\n')
print(json.dumps({'groups': [{k: v for k, v in g.items() if k != 'cells'} for g in groups], 'comparisons': comparisons}, indent=2))
