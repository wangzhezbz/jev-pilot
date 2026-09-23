const token=location.hash.slice(1)||sessionStorage.getItem('jev-dashboard-token'); if(token)sessionStorage.setItem('jev-dashboard-token',token); history.replaceState(null,'',location.pathname);
const $=id=>document.getElementById(id); let dictionary={},current,selectedTask='';
async function api(path,data){const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw new Error(dictionary.requestFailed||'Request failed');return r.json();}
async function language(code){dictionary=await fetch('/locales/'+code+'.json').then(r=>r.json());document.documentElement.lang=code;document.querySelectorAll('[data-i]').forEach(e=>e.textContent=dictionary[e.dataset.i]);$('language').value=code;if(current)render(current);}
function render(data){current=data;const {status,metrics,desktop,routing,diagnostics}=data;$('enabled').checked=status.config.enabled;$('memory').checked=status.config.memory;$('calls').textContent=metrics.jev.calls;$('tokens').textContent=(metrics.jev.inputTokens+metrics.jev.outputTokens).toLocaleString();$('cache').textContent=metrics.cacheHits;$('applied').textContent=routing.routing.nativeUpdatesApplied;$('runtime').replaceChildren();const rows={platform:desktop.platform+' / '+desktop.arch,version:desktop.runtimeVersion||'—',installed:desktop.installed,compatible:desktop.compatible,running:desktop.bridgeProcessAlive,loadedRevision:dictionary[desktop.loadedRevisionMatches===true?'revisionCurrent':desktop.loadedRevisionMatches===false?'revisionOld':'revisionUnknown'],keyStatus:status.configured};for(const [key,value]of Object.entries(rows)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=dictionary[key]||key;dd.textContent=typeof value==='boolean'?dictionary[value?'yes':'no']:value;$('runtime').append(dt,dd);}
  const appendRows=(target,rows)=>{if(['routingFailures','metadataFailures','skipReasons'].includes(target)){const merged={};for(const [key,value]of Object.entries(rows)){const label=dictionary[key]||key;merged[label]=typeof value==='number'?(merged[label]??0)+value:value;}rows=merged;}const el=$(target);el.replaceChildren();for(const [key,value]of Object.entries(rows)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=dictionary[key]||key;dd.textContent=String(value);el.append(dt,dd);}};
  const install=data.installation;
  appendRows('installation',Object.fromEntries((install?.checks??[]).map(x=>[x.id,(dictionary[x.ready?'yes':'no'])+(x.current?' · '+x.current:'')])));
  $('setup').disabled=!install?.canSetup;
  const records=data.activity?.events??[],tasks=[...new Set(records.map(x=>x.threadId))];
  if(selectedTask&&!tasks.includes(selectedTask))selectedTask='';
  $('taskFilter').replaceChildren();for(const id of ['',...tasks]){const option=document.createElement('option');option.value=id;option.textContent=id||dictionary.allTasks;$('taskFilter').append(option);}$('taskFilter').value=selectedTask;
  $('activity').replaceChildren();
  for(const e of records.filter(e=>!selectedTask||e.threadId===selectedTask)){
    const row=document.createElement('article'),title=document.createElement('strong'),detail=document.createElement('p');
    title.textContent=new Date(e.at).toLocaleString()+' · '+(dictionary['event_'+e.status]||dictionary[e.code]||e.status||e.kind);
    detail.textContent=[e.threadId,e.targetModel,e.from&&`${e.from} → ${e.published??'—'}`,
      e.recommended&&`${dictionary.recommended}: ${e.recommended}`,
      e.horizon!==undefined&&`${dictionary.horizon}: ${e.recommendedHorizon??'—'} → ${e.horizon} (${dictionary[e.horizonReason]||e.horizonReason||'—'})`,
      e.code&&(dictionary[e.code]||e.code),e.elapsedMs!==undefined&&`${e.elapsedMs} ms`,e.inputTokens!==undefined&&`${e.inputTokens??'—'} / ${e.outputTokens??'—'} token`].filter(Boolean).join(' · ');
    row.append(title,detail);$('activity').append(row);
  }
  if(!$('activity').children.length)$('activity').textContent=dictionary.noActivity;
  $('shadow').checked=diagnostics.policy.mode==='shadow';
  const rt=routing.routing;
  appendRows('routingDiagnostics',{firstStep:rt.firstStepForwarded,restored:rt.baselineRestoresApplied??0,restoreUnconfirmed:rt.baselineRestoresUnconfirmed??0,budgetHeld:rt.budgetHeld??0,superseded:rt.superseded??0,staleEvidence:rt.staleEvidence??0,budgetSkipped:rt.knownBudgetSkips??0,coalesced:rt.knownCoalescedBoundaries??0,leaseReused:rt.knownLeaseSkips??0,routingWait:rt.observedWaitMs??0,metadataRecovered:rt.metadataRecoveries??0});
  appendRows('routingFailures',Object.keys(rt.failureReasons??{}).length?rt.failureReasons:{noObservations:'—'});
  appendRows('metadataFailures',Object.keys(rt.metadataFailureReasons??{}).length?rt.metadataFailureReasons:{noObservations:'—'});
  appendRows('diagnostics',{observed:diagnostics.outputAdmission.observed,submitted:diagnostics.outputAdmission.submitted??0,preparedEvidence:diagnostics.preparedOutputs?.prepared??0,filtered:diagnostics.outputAdmission.matchedApplied??0,unconfirmedFilters:diagnostics.outputAdmission.unconfirmed??0,unmatchedFilters:diagnostics.outputAdmission.unmatchedSubmitted??0,proposed:diagnostics.evidence.proposedExclusions,removed:diagnostics.evidence.appliedExclusions,cooling:diagnostics.cooldowns.length,budgetScopes:diagnostics.budgets.map(b=>dictionary[b.scope==='task'?'taskScope':'workspaceScope']).filter((v,i,a)=>a.indexOf(v)===i).join(' / ')||'—',policyVersion:diagnostics.policy.version});
  const reasons={};for(const group of [diagnostics.outputAdmission.reasons,diagnostics.skips,diagnostics.failures])for(const [k,v]of Object.entries(group))reasons[k]=(reasons[k]||0)+v;
  appendRows('skipReasons',Object.keys(reasons).length?reasons:{noObservations:'—'});
}
async function refresh(){try{render(await api('status'));$('notice').textContent='';}catch(e){$('notice').textContent=e.message;}}
$('language').onchange=async()=>{await language($('language').value);try{await api('config',{locale:$('language').value});}catch(e){$('notice').textContent=e.message;}};
for(const key of ['enabled','memory'])$(key).onchange=async()=>{try{await api('config',{[key]:$(key).checked});await refresh();}catch(e){$('notice').textContent=e.message;}};
$('credentials').onsubmit=async e=>{e.preventDefault();try{await api('key',{key:$('key').value});$('key').value='';await refresh();$('notice').textContent=dictionary.saved;}catch(error){$('notice').textContent=error.message;}};
$('shadow').onchange=async()=>{try{await api('config',{evidenceMode:$('shadow').checked?'shadow':'active'});await refresh();}catch(e){$('notice').textContent=e.message;}};
$('refresh').onclick=refresh;
$('taskFilter').onchange=()=>{selectedTask=$('taskFilter').value;if(current)render(current);};
$('setup').onclick=async()=>{const button=$('setup');button.disabled=true;try{const result=await api('setup',{});await refresh();$('notice').textContent=dictionary[result.restartRequired?'restartNeeded':'saved'];}catch(error){$('notice').textContent=error.message;}finally{button.disabled=!current?.installation?.canSetup;}};
(async()=>{await language('en');await refresh();if(current)await language(current.status.config.locale);})();
