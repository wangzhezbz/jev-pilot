// Synthetic MCP transport; real Pilot filtering/recall code, no paid API calls.
// Only launched by verify-desktop.mjs in an isolated temporary home.
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Pilot} from '../../src/pilot.mjs';
import {Store} from '../../src/core.mjs';
import {evidenceTool,evidenceArguments} from '../../src/evidence-tool.mjs';

const work=process.argv[2];
if(!work)throw new Error('FIXTURE_WORK_REQUIRED');
const pilot=new Pilot({store:new Store({home:join(work,'chain-pilot')}),key:'fixture',send:async p=>{if(process.argv.includes('--fail'))throw Error('FIXTURE_NETWORK_FAILURE');return({
  model:'fixture',usage:{input_tokens:1,output_tokens:1},
  answers:Object.fromEntries(Object.entries(p.questions).map(([id])=>{
    const keep=p.state.items[Number(id.slice(1))].text.includes('NEEDLE');
    return[id,{type:'choice',choice:keep?'keep':'exclude',probabilities:{keep:keep?1:0,review:0,exclude:keep?0:1}}];
  })),
});}});
const lines=createInterface({input:process.stdin});
lines.on('line',async line=>{
  const m=JSON.parse(line);if(m.id===undefined)return;
  try{
    let result;
    if(m.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}};
    else if(m.method==='tools/list')result={tools:[evidenceTool]};
    else if(m.method==='tools/call'){
      const a=evidenceArguments(m.params.arguments),data=await pilot.call(a);
      const artifactId=data.selection.artifactId;
      const recalled=artifactId?await pilot.call({workspace:a.workspace,operation:'recall_output',input:{artifactId}}):null;
      writeFileSync(join(work,'chain-evidence.json'),JSON.stringify({
        recallExact:recalled?JSON.stringify(recalled.value)===JSON.stringify(a.input.value):null,
        fallbackExact:JSON.stringify(data.value)===JSON.stringify(a.input.value),
        sourceBytes:Buffer.byteLength(JSON.stringify(a.input.value)),resultBytes:Buffer.byteLength(JSON.stringify(data)),
        calls:pilot.store.events(pilot.store.project(a.workspace)).filter(e=>e.kind==='jev_call').length,
        selection:data.selection,
      }));
      result={content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
    }else result=m.method==='resources/list'?{resources:[]}:m.method==='resources/templates/list'?{resourceTemplates:[]}:{};
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\n');
  }catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'FIXTURE_FAILURE'}})+'\n');}
});
