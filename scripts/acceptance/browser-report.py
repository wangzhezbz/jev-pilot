"""Recompute browser component accounting without calling any model or UI."""
import csv
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1])
rows = json.loads((root / 'ui-runs.json').read_text())
events = json.loads((root / 'events.json').read_text())
calls = [x for x in events if x['kind'] == 'jev_call']
cursor = 0
for row in rows:
    count = len(row.get('decisions', [])) if row['arm'] != 'direct' else 0
    row['jevCalls'] = calls[cursor:cursor + count]
    cursor += count
assert cursor == len(calls), 'Unattributed API call; inspect failures before summarizing'
for row in rows:
    row['jevInput'] = sum(c.get('inputTokens') or 0 for c in row['jevCalls'])
    row['jevOutput'] = sum(c.get('outputTokens') or 0 for c in row['jevCalls'])
    row['unknownUsage'] = sum(c.get('inputTokens') is None for c in row['jevCalls'])
    assert all(c.get('model') == 'jev-1.13.0' for c in row['jevCalls'] if c.get('inputTokens') is not None)
    row['knownJevUsd'] = row['jevInput'] * .042 / 1_000_000
summary = {'scope': 'Official Computer Use component; not full GPT task A/B or subscription billing', 'arms': {}, 'failedRuns': [r['session'] for r in rows if not r['passed']]}
for arm in ['direct', 'legacy', 'choice']:
    sample = [r for r in rows if r['arm'] == arm and r['passed']]
    summary['arms'][arm] = {
        'n': len(sample), 'meanMs': statistics.mean(r['elapsedMs'] for r in sample),
        'minMs': min(r['elapsedMs'] for r in sample), 'maxMs': max(r['elapsedMs'] for r in sample),
        'jevInput': sum(r['jevInput'] for r in sample), 'jevOutput': sum(r['jevOutput'] for r in sample),
        'knownJevUsd': sum(r['knownJevUsd'] for r in sample), 'unknownUsage': sum(r['unknownUsage'] for r in sample),
        'meanPhaseMs': {phase: sum(s['elapsedMs'] for r in sample for s in r.get('stages', []) if s['phase'] == phase) / len(sample) for phase in ['observe', 'jev_decision', 'revalidate', 'consume', 'execute']},
    }
old, new = summary['arms']['legacy'], summary['arms']['choice']
summary['changePercent'] = {key: 100 * (new[key] / old[key] - 1) for key in ['meanMs', 'jevInput', 'jevOutput', 'knownJevUsd']}
# Adjacent AB/BA pairs: direction only; four pairs cannot establish general benefit.
paired = [r for r in rows if r['passed'] and r['arm'] in ('legacy', 'choice')]
summary['pairedDeltaMs'] = []
for i in range(0, len(paired), 2):
    pair = {r['arm']: r for r in paired[i:i + 2]}
    assert set(pair) == {'legacy', 'choice'}
    summary['pairedDeltaMs'].append(pair['choice']['elapsedMs'] - pair['legacy']['elapsedMs'])
(root / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
(root / 'matched-runs.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
columns = ['session', 'arm', 'passed', 'elapsedMs', 'jevInput', 'jevOutput', 'knownJevUsd', 'unknownUsage', 'error']
with (root / 'runs.csv').open('w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(rows)
print(json.dumps(summary, ensure_ascii=False, indent=2))
