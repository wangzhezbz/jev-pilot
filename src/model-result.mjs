// The full library result stays available internally and through recall.
// Native text consumers receive each evidence body once, with provenance intact.
export function modelResult(operation,result,{compactEvidence=false}={}){
 if(!result||typeof result.context!=='string')return result;
 if(['select','search','filter_output'].includes(operation)&&Array.isArray(result.items))
  return {...result,context:compactEvidence?evidenceHandoff(result):result.context,items:result.items.map(({text,judgment,...metadata})=>compactEvidence?{...metadata,...(judgment?{judgment:{choice:judgment.choice,source:judgment.source,...(judgment.reason?{reason:judgment.reason}:{})}}:{})}:{...metadata,...(judgment?{judgment}:{})}),textLocation:'context'};
 if(operation==='compact'&&Array.isArray(result.blocks))
  return {...result,blocks:result.blocks.map(({content,...metadata})=>metadata),textLocation:'context'};
 return result;
}
import {evidenceHandoff} from './evidence-handoff.mjs';
