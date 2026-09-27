import { calculatorObservation } from '../src/calculator-observation.mjs';
import { waitForHostObservation } from '../src/host-observation-wait.mjs';

// One fixed diagnostic on an explicitly bound calculator driver, never a Jev
// decision. Caller clears the test window and supplies an independent AX reader.
export async function probeCalculatorAddition({driver,readIndependent,signal,labels={seven:'7',add:'加',two:'2',equals:'等于'}}){
  if(driver?.kind!=='computer-use'||driver.progressRecheck!=='calculator_keys'||typeof readIndependent!=='function')throw Error('CALCULATOR_DIAGNOSTIC_HANDLE_REQUIRED');
  const initial=await driver.observe(),first=calculatorObservation(initial.snapshot),steps=[];
  const finish=(status,extra={})=>({status,steps,jevCalls:0,...extra});
  if(first.ambiguous||first.result!=='0')return finish('initial_state_not_zero',{initial:first});
  const sequence=[
    [labels.seven,s=>s.result==='7'],
    [labels.add,s=>s.expression?.replace(/\s/g,'')==='7+'],
    [labels.two,s=>s.result==='2'&&s.expression?.replace(/\s/g,'')==='7+'],
    [labels.equals,s=>s.result==='9'],
  ];
  for(const [label,expected]of sequence){
    if(signal?.aborted)return finish('cancelled');
    const before=await driver.observe(),candidates=before.candidates.filter(c=>c.text===label&&!c.requiresApproval&&!c.destructive);
    if(candidates.length!==1)return finish('candidate_not_unique',{failedLabel:label});
    if(signal?.aborted)return finish('cancelled');
    const stepStart=performance.now();
    await driver.execute(candidates[0]);
    const observations=[];
    const capture=o=>{observations.push({...calculatorObservation(o.snapshot),elapsedMs:Math.round(performance.now()-stepStart)});};
    const after=await driver.observe();capture(after);
    const settled=await waitForHostObservation({initial:after,observe:()=>driver.observe(),signal,
      accept:o=>{const state=calculatorObservation(o.snapshot);return !state.ambiguous&&expected(state);},onSample:capture});
    steps.push({label,before:calculatorObservation(before.snapshot),observations,reads:settled.reads,settleMs:settled.elapsedMs,elapsedMs:Math.round(performance.now()-stepStart),status:settled.status});
    if(settled.status!=='matched')return finish(settled.status==='cancelled'?'cancelled':'expected_state_not_observed',{failedLabel:label});
  }
  const independent=calculatorObservation(await readIndependent());
  return finish(!independent.ambiguous&&independent.result==='9'?'passed':'independent_verification_failed',{independent});
}
