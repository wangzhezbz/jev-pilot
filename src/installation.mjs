import {existsSync} from 'node:fs';import {join} from 'node:path';
import {desktopStatus,packageRoot,probeHooks,discoverCodex} from './setup.mjs';
export function installationPlan(state=desktopStatus()) {
 const checks=[['node',state.nodeSupported,state.node],['curl',Boolean(state.curl),state.curl],['rg',Boolean(state.rg),state.rg],['codex',Boolean(state.realBin),state.runtimeVersion],['verifiedRuntime',state.runtimeVersion==='codex-cli 0.155.0-alpha.9.2',state.runtimeVersion],['credentials',state.credentialsConfigured,null]];
 return{checks:checks.map(([id,ready,current])=>({id,ready,current})),canSetup:checks.slice(0,5).every(x=>x[1]),keyReady:state.credentialsConfigured,
  bundledLauncher:existsSync(join(packageRoot,'bin',process.platform+'-'+process.arch,process.platform==='win32'?'jev-pilot.exe':'jev-pilot')),
  installed:state.installed,active:state.loadedRevisionMatches===true,requiresRestart:state.configuredForNextLaunch&&state.loadedRevisionMatches!==true,
  dependencyBundled:false,signedConsumerInstaller:false};
}
export async function compatibilityProbe() {
 const state=desktopStatus(),realBin=discoverCodex();if(!realBin)return{status:'runtime_missing',activated:false};
 try{const trust=await probeHooks(realBin,join(packageRoot,'runtime/desktop/hook.mjs'));return{status:Object.keys(trust).length===2?'hooks_available':'hooks_incomplete',runtimeVersion:state.runtimeVersion,verifiedVersion:state.runtimeVersion==='codex-cli 0.155.0-alpha.9.2',activated:false,scope:'Isolated hook discovery only; unknown versions still require native routing fixtures.'};}
 catch{return{status:'probe_failed',runtimeVersion:state.runtimeVersion,activated:false};}
}
