// Closed-world evidence processing only: no execution, configuration, memory,
// browser actions or external retrieval. Workspace retrieval remains bounded and read-only.
export const evidenceTool={
  name:'jev_evidence',
  description:'Read-only evidence; no skill/status prerequisite. prepare {goal,path} filters a large text file; prepare {goal,value,source} handles an existing result in the same exec cell: retain raw data, emit returned value. investigate {goal,queries,paths?} finds literal windows, not exhaustive semantic coverage. select {goal,items} filters candidates. recall {artifactId,ids?} or {artifactId,query} recovers saved originals; follow nextOffset. Use native tools for small/exact reads, code/JSON, media and unfinished output. On failure use original/native tools. No execution authority.',
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  inputSchema:{type:'object',properties:{workspace:{type:'string'},operation:{type:'string',enum:['prepare','select','recall','investigate']},input:{type:'object',properties:{
    goal:{type:'string',description:'Evidence needed for this task.'},
    queries:{type:'array',items:{type:'string'},minItems:1,maxItems:6,description:'Investigate: literal terms, case-insensitive OR.'},
    paths:{type:'array',items:{type:'string'},maxItems:20,description:'Investigate: paths, default ["."], rg visibility.'},
    contextLines:{type:'integer',minimum:0,maximum:40,description:'Investigate: surrounding lines, default 8.'},
    maxMatches:{type:'integer',minimum:1,maximum:400,description:'Investigate: matching-line limit, default 200.'},
    selection:{type:'string',enum:['auto','local'],description:'Investigate: auto (default) or local only.'},
    path:{type:'string',description:'Prepare: workspace text file; path OR value.'},
    value:{description:'Prepare: completed original result; retain raw value.'},
    items:{type:'array',items:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text'],additionalProperties:true},description:'Select: candidates with source/status metadata.'},
    budget:{type:'integer',minimum:128,maximum:500000,description:'UTF-8 output bytes; investigate maximum 100000.'},
    source:{type:'string',description:'Source path/tool for value.'},
    taskId:{type:'string',description:'Real host task ID, if available.'},
    artifactId:{type:'string',description:'Saved artifact ID.'},
    ids:{type:'array',items:{type:'string'},description:'Recall IDs; omit ids/query for original.'},
    query:{type:'string',description:'Recall: literal text/ID/source match; query OR ids. Free local search.'},
    offset:{type:'integer',minimum:0,description:'Recall offset; follow nextOffset.'},
    limit:{type:'integer',minimum:1,maximum:100,description:'Recall page size, default 20.'},
    exact:{type:'boolean',description:'Preserve exact output without filtering.'}
  },additionalProperties:true}},required:['workspace','operation','input'],additionalProperties:false},
};
export function evidenceArguments(args){
  if(!args||!Object.hasOwn({prepare:1,select:1,recall:1,investigate:1},args.operation))throw Object.assign(new Error('READ_ONLY_OPERATION_REQUIRED'),{code:'READ_ONLY_OPERATION_REQUIRED'});
  return{workspace:args.workspace,operation:({prepare:'prepare_output',recall:'recall_output'})[args.operation]??args.operation,input:args.input};
}
