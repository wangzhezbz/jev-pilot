// Closed-world evidence processing only: no execution, configuration, memory,
// browser actions or external retrieval. Jev evaluates the supplied material.
export const evidenceTool={
  name:'jev_evidence',
  description:'Select supplied candidates with select {goal,items,budget?}, or read and select task-relevant evidence from a large unresolved text file using prepare with input {goal,path}, before reading the full file. For an existing tool result use {goal,value,source} in the same exec cell and emit returned value. Recall exact omitted material with {artifactId,ids?}. Preserve raw results for computation; on failure use the original. Skip small, exact, code or already understood material.',
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  inputSchema:{type:'object',properties:{workspace:{type:'string'},operation:{type:'string',enum:['prepare','select','recall']},input:{type:'object',properties:{
    goal:{type:'string',description:'What evidence is needed for the current task (prepare).'},
    path:{type:'string',description:'Workspace text file to prepare directly, instead of first reading it in full. Use path OR value.'},
    value:{description:'Original completed tool result or text to prepare. Keep the raw value unchanged.'},
    items:{type:'array',items:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text'],additionalProperties:true},description:'Candidates for select, retaining source identity and any status metadata.'},
    budget:{type:'integer',minimum:128,maximum:500000,description:'Selection output budget in UTF-8 bytes, not tokens.'},
    source:{type:'string',description:'Source path or tool name when using value.'},
    taskId:{type:'string',description:'Actual host task ID, if available.'},
    artifactId:{type:'string',description:'Artifact returned by prepare (recall).'},
    ids:{type:'array',items:{type:'string'},description:'Optional source IDs to recall; omit for the exact original.'},
    exact:{type:'boolean',description:'Preserve exact output without filtering.'}
  },additionalProperties:true}},required:['workspace','operation','input'],additionalProperties:false},
};
export function evidenceArguments(args){
  if(!args||!Object.hasOwn({prepare:1,select:1,recall:1},args.operation))throw Object.assign(new Error('READ_ONLY_OPERATION_REQUIRED'),{code:'READ_ONLY_OPERATION_REQUIRED'});
  return{workspace:args.workspace,operation:args.operation==='prepare'?'prepare_output':args.operation==='select'?'select':'recall_output',input:args.input};
}
