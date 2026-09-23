// Closed-world evidence processing only: no execution, configuration, memory,
// browser actions or external retrieval. Jev evaluates the supplied material.
export const evidenceTool={
  name:'jev_evidence',
  description:'Prepare large unresolved text before showing it to Codex, or recall the exact original. In code-mode call this after a native tool in the same exec cell; emit its value, keep the raw result for computation. On failure emit the raw result. Never rerun commands for recall.',
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  inputSchema:{type:'object',properties:{workspace:{type:'string'},operation:{type:'string',enum:['prepare','recall']},input:{type:'object',additionalProperties:true}},required:['workspace','operation','input'],additionalProperties:false},
};
export function evidenceArguments(args){
  if(!args||!Object.hasOwn({prepare:1,recall:1},args.operation))throw Object.assign(new Error('READ_ONLY_OPERATION_REQUIRED'),{code:'READ_ONLY_OPERATION_REQUIRED'});
  return{workspace:args.workspace,operation:args.operation==='prepare'?'prepare_output':'recall_output',input:args.input};
}
