// Bound waiting and extra reads; never retry the action or overlap host reads.
// A host read already in flight must finish: its own timeout belongs to the host.
export async function waitForHostObservation({initial,observe,accept,budgetMs=1000,signal,remainingMs=()=>Infinity,onSample=()=>{}}) {
  if(!Number.isFinite(budgetMs)||budgetMs<0||budgetMs>1000)throw Error('INVALID_OBSERVATION_BUDGET');
  const start=performance.now();let observation=initial,reads=0;
  const remaining=()=>Math.min(budgetMs-(performance.now()-start),remainingMs());
  const result=status=>({status,observation,reads,elapsedMs:Math.round(performance.now()-start)});
  if(signal?.aborted)return result('cancelled');
  if(accept(observation))return result('matched');
  for(const delay of [100,200,300,400]){
    if(signal?.aborted)return result('cancelled');
    const left=remaining();if(left<=1)break;
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
      const timer=setTimeout(finish,Math.min(delay,Math.max(0,left-1)));
      signal?.addEventListener('abort',finish,{once:true});
    });
    if(signal?.aborted)return result('cancelled');
    if(remaining()<=0)break;
    observation=await observe();reads++;onSample(observation,reads);
    if(signal?.aborted)return result('cancelled');
    // Do not authorize more actions using evidence returned after the budget.
    if(remaining()<0)return result('timeout');
    if(accept(observation))return result('matched');
  }
  return result('timeout');
}
