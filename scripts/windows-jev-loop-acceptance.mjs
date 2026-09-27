// Run inside the official Windows host using the already-verified extracted
// candidate modules. No answer sequence, custom transport, key, or quota override.
export async function runWindowsJevAcceptance({host,driver,store,workspace,taskId,readIndependent,signal}) {
  if(driver?.kind!=='computer-use'||driver.progressRecheck!=='calculator_keys'||typeof readIndependent!=='function')throw Error('WINDOWS_CALCULATOR_DRIVER_REQUIRED');
  if(typeof host?.createSession!=='function'||typeof host?.summarizeHostResult!=='function')throw Error('CANDIDATE_SESSION_MODULE_REQUIRED');
  const start=performance.now(),observations=[],executions=[];
  const state=o=>o?.calculatorState;
  const valid=s=>s&&!s.ambiguous&&s.result!==null;
  const original=await driver.observe();
  if(!valid(state(original))||state(original).result!=='0'||state(original).expression!==null)
    return {status:'initial_state_not_zero',jevCalls:0};
  const traced={...driver,
    async observe(){
      const o=await driver.observe();
      if(observations.length<40)observations.push({elapsedMs:Math.round(performance.now()-start),state:state(o),candidateNames:o.candidates.map(c=>c.text)});
      return o;
    },
    async execute(action){
      const entry={label:action.text,startedMs:Math.round(performance.now()-start),accepted:false};executions.push(entry);
      await driver.execute(action);entry.accepted=true;entry.returnedMs=Math.round(performance.now()-start);
    },
  };
  const task={goal:'Use the calculator to compute 7 + 2 and display the completed result.',
    stages:[{id:'calculate',goal:'Use the calculator to compute 7 + 2 and display the completed result.',complete:()=>false}],
    invariant:o=>({ok:valid(state(o)),evidence:'Observed calculator numeric state must remain unambiguous.'}),
    verify:o=>({passed:valid(state(o))&&state(o).result==='9'&&state(o).expression===null,
      evidence:valid(state(o))&&state(o).result==='9'&&state(o).expression===null?'Observed calculator result 9 with no pending expression.':null}),
    signal,
  };
  const session=host.createSession({workspace,taskId,driver:traced,store,maxSteps:4,maxMs:30000,minProbability:.7});
  try {
    const run=await session.run(task);
    const requestIds=run.requestDiagnostics?.map(r=>r.requestId)||[];
    const calls=store.events(store.project(workspace),200)
      .filter(e=>e.kind==='jev_call'&&requestIds.includes(e.requestId))
      .map(e=>({requestIndex:requestIds.indexOf(e.requestId),model:e.model,inputTokens:e.inputTokens,outputTokens:e.outputTokens,status:e.status,elapsedMs:e.elapsedMs}))
      .sort((a,b)=>a.requestIndex-b.requestIndex);
    let independent=null,independentError=null;
    if(!signal?.aborted){try{independent=await readIndependent();}catch{independentError='INDEPENDENT_OBSERVATION_FAILED';}}
    const actualCallEvidence=run.metrics.jevRequests>0&&calls.length===run.metrics.jevRequests&&calls.every(c=>c.status==='success'&&typeof c.model==='string');
    const passed=run.status==='needs_verification'&&actualCallEvidence&&valid(independent)&&independent.result==='9'&&independent.expression===null;
    return {status:passed?'passed':'not_passed',receipt:host.summarizeHostResult(run),history:run.history,
      phases:run.phases,observations,executions,calls,actualCallEvidence,independent,independentError,
      totalElapsedMs:Math.round(performance.now()-start),candidateInstalled:false,
      evidenceScope:'single_real_session_acceptance_not_performance_comparison'};
  } finally { session.close(); }
}
