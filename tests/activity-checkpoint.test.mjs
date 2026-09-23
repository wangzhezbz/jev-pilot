import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';
import{Store,hash}from'../src/core.mjs';import{Pilot}from'../src/pilot.mjs';import{activity}from'../src/activity.mjs';import{checkpointObserver}from'../src/checkpoints.mjs';import{installationPlan}from'../src/installation.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'jev-v8-')),store=new Store({home:join(root,'private')}),project=store.project(root);t.after(()=>store.close());return{root,store,project};}
test('timeline excludes other projects, synthetic and unscoped logs, and whitelists fields',t=>{
 const f=fixture(t),dir=join(f.store.home,'runtime/desktop/logs');mkdirSync(dir,{recursive:true});const base={kind:'decision',projectId:f.project,threadId:'t',status:'applied',secret:'DO_NOT_EXPORT'};
 writeFileSync(join(dir,'events.jsonl'),[base,{...base,projectId:'other'},{...base,measurementSource:'synthetic'},{...base,projectId:null}].map(JSON.stringify).join('\n'));
 const r=activity(f);assert.equal(r.events.length,1);assert.equal(r.legacyUnscoped,1);assert(!JSON.stringify(r).includes('DO_NOT_EXPORT'));assert.equal(activity(f,{threadId:'other'}).events.length,0);
});
test('automatic checkpoint records observed progress and changed files without asserting completion',async t=>{
 const f=fixture(t);const git=args=>execFileSync('git',['-C',f.root,...args],{stdio:'ignore'});git(['init']);writeFileSync(join(f.root,'.gitignore'),'private/\n');writeFileSync(join(f.root,'file.txt'),'base');git(['add','.gitignore','file.txt']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-m','base']);
 writeFileSync(join(f.root,'file.txt'),'changed');const observe=checkpointObserver(f.store),turn={threadId:'thread',turnId:'turn',cwd:f.root,task:'finish fix'};
 observe({method:'turn/plan/updated',params:{threadId:'thread',turnId:'turn',plan:[{step:'implement',status:'completed'},{step:'verify',status:'pending'}]}},turn);
 observe({method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'commandExecution',id:'tool',status:'completed',exitCode:0}}},turn);
 await observe({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted'}}},turn);
 const saved=f.store.get(f.project,'checkpoint','auto-'+hash('thread'));assert.deepEqual(saved.completed,[]);assert.deepEqual(saved.pending,['verify']);assert.equal(saved.toolReceipts[0].exitCode,0);assert.equal(saved.sourceHashes['file.txt'],hash('changed'));assert.equal(saved.coverage,'worktree_changes');
 writeFileSync(join(f.root,'file.txt'),'changed again');const pilot=new Pilot({store:f.store,key:'fixture'});const r=await pilot.call({workspace:f.root,operation:'checkpoint',input:{action:'latest',taskId:'thread'}});assert.equal(r.state,'revalidate');assert.deepEqual(r.changedFiles,['file.txt']);assert.equal(r.automaticReplay,false);
});
test('installation plan never treats an unknown runtime or missing dependency as ready',()=>{
 const state={nodeSupported:true,curl:'curl',rg:'rg',realBin:'/fixture',runtimeVersion:'codex-cli 0.155.0-alpha.9.2',credentialsConfigured:true};assert.equal(installationPlan(state).canSetup,true);assert.equal(installationPlan({...state,rg:null}).canSetup,false);assert.equal(installationPlan({...state,runtimeVersion:'new'}).canSetup,false);assert.equal(installationPlan(state).signedConsumerInstaller,false);
});
