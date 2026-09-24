// Closed-world evidence processing only: no execution, configuration, memory,
// browser actions or external retrieval. Workspace retrieval remains bounded and read-only.
export const evidenceTool={
  name:'jev_evidence',
  description:'Read-only evidence in one call; no skill/status prerequisite. For repository investigation before broad reads, investigate {goal,queries,paths?}: retrieves literal matches with surrounding lines, merges overlaps, uses Jev only for large semantic candidate sets, and returns original excerpts with scope and recovery. Use native tools for small/exact lookups. For exhaustive semantic review use prepare {goal,path} or select {goal,items}; query-based investigation cannot prove all cases found. For an existing result prepare {goal,value,source} in the same exec cell; preserve raw data for computation, emit returned value/context. Recall {artifactId,ids?} or {artifactId,query} for gaps; follow nextOffset. Full recall is available, covering saved evidence only. On failure use native tools/original. Do not filter exact code/JSON, media, unfinished output or already-read material. No execution authority.',
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  inputSchema:{type:'object',properties:{workspace:{type:'string'},operation:{type:'string',enum:['prepare','select','recall','investigate']},input:{type:'object',properties:{
    goal:{type:'string',description:'What evidence is needed for the current task (prepare).'},
    queries:{type:'array',items:{type:'string'},minItems:1,maxItems:6,description:'Investigate: discriminating literal terms (OR, case-insensitive), not shell/regex. Up to six.'},
    paths:{type:'array',items:{type:'string'},maxItems:20,description:'Investigate: workspace files/directories, default ["."]. Respects rg ignored/hidden paths.'},
    contextLines:{type:'integer',minimum:0,maximum:40,description:'Investigate: surrounding lines per match (default 8); overlapping windows merged.'},
    maxMatches:{type:'integer',minimum:1,maximum:400,description:'Investigate: bounded literal matching lines (default 200). Limits are disclosed.'},
    selection:{type:'string',enum:['auto','local'],description:'Investigate: auto admission (default), or deterministic local evidence only.'},
    path:{type:'string',description:'Workspace text file to prepare directly, instead of first reading it in full. Use path OR value.'},
    value:{description:'Original completed tool result or text to prepare. Keep the raw value unchanged.'},
    items:{type:'array',items:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text'],additionalProperties:true},description:'Candidates for select, retaining source identity and any status metadata.'},
    budget:{type:'integer',minimum:128,maximum:500000,description:'Selection output budget in UTF-8 bytes, not tokens.'},
    source:{type:'string',description:'Source path or tool name when using value.'},
    taskId:{type:'string',description:'Actual host task ID, if available.'},
    artifactId:{type:'string',description:'Artifact returned by prepare (recall).'},
    ids:{type:'array',items:{type:'string'},description:'Optional source IDs to recall; omit for the exact original.'},
    query:{type:'string',description:'Recall only: literal case-insensitive text, ID or source match in the saved artifact. Use query OR ids; neither returns the full original. No semantic judgment or paid call.'},
    offset:{type:'integer',minimum:0,description:'Recall query page offset; follow nextOffset when present.'},
    limit:{type:'integer',minimum:1,maximum:100,description:'Recall query page size (default 20).'},
    exact:{type:'boolean',description:'Preserve exact output without filtering.'}
  },additionalProperties:true}},required:['workspace','operation','input'],additionalProperties:false},
};
export function evidenceArguments(args){
  if(!args||!Object.hasOwn({prepare:1,select:1,recall:1,investigate:1},args.operation))throw Object.assign(new Error('READ_ONLY_OPERATION_REQUIRED'),{code:'READ_ONLY_OPERATION_REQUIRED'});
  return{workspace:args.workspace,operation:({prepare:'prepare_output',recall:'recall_output'})[args.operation]??args.operation,input:args.input};
}
