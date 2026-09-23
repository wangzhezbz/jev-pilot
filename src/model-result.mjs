// The full library result stays available internally and through recall.
// Native text consumers receive each evidence body once, with provenance intact.
export function modelResult(operation,result){
 if(!result||typeof result.context!=='string')return result;
 if(['select','search','filter_output'].includes(operation)&&Array.isArray(result.items))
  return {...result,items:result.items.map(({text,...metadata})=>metadata),textLocation:'context'};
 if(operation==='compact'&&Array.isArray(result.blocks))
  return {...result,blocks:result.blocks.map(({content,...metadata})=>metadata),textLocation:'context'};
 return result;
}
