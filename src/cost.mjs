// Public API-equivalent estimates, not ChatGPT subscription debits.
export const PRICE_SNAPSHOT={date:'2026-09-24',currency:'USD',unit:'per million tokens',
 sources:['https://developers.openai.com/api/docs/pricing','https://developers.openai.com/api/docs/models/gpt-6-astra','https://docs.typesafe.ai/models'],
 models:{'gpt-6-astra':{input:10,cached:1,write:12.5,output:50},'gpt-6-sol':{input:2,cached:.2,write:2.5,output:10},'gpt-6-luna':{input:.1,cached:.01,write:.125,output:.5},'gpt-5.6-sol':{input:4,cached:.4,write:5,output:20}},
 jev:{'jev-1.13.0':{input:.042,output:0}}};
const count=n=>Number.isSafeInteger(n)&&n>=0;
export function gptRequestCost(model,usage,{tier='standard',cacheWritesIncludedInInput=true}={}){
 const p=PRICE_SNAPSHOT.models[model];if(!p)return{usd:null,reason:'unknown_model_price'};
 if(!['standard','fast'].includes(tier))return{usd:null,reason:'unknown_service_tier'};
 const {inputTokens:i,cachedInputTokens:c,outputTokens:o}=usage??{},w=usage?.cacheWriteInputTokens??0;
 if(![i,c,o,w].every(count)||c+(cacheWritesIncludedInInput?w:0)>i)return{usd:null,reason:'invalid_or_missing_usage'};
 const long=i>272000,inputMultiplier=long?2:1,outputMultiplier=long?1.5:1,tierMultiplier=tier==='fast'?2:1;
 const uncached=i-c-(cacheWritesIncludedInInput?w:0);
 const parts={uncachedInputUsd:uncached*p.input*inputMultiplier/1e6,cachedInputUsd:c*p.cached*inputMultiplier/1e6,cacheWriteUsd:w*p.write*inputMultiplier/1e6,outputUsd:o*p.output*outputMultiplier/1e6};
 for(const k of Object.keys(parts))parts[k]*=tierMultiplier;
 return{usd:Object.values(parts).reduce((a,b)=>a+b,0),...parts,longContext:long,tier,basis:'public_api_equivalent_not_account_debit'};
}
export function jevRequestCost(model,inputTokens){
 const p=PRICE_SNAPSHOT.jev[model];return !p||!count(inputTokens)?{usd:null,reason:!p?'unknown_model_price':'missing_usage'}:{usd:inputTokens*p.input/1e6,basis:'public_api_input_only_output_free'};
}
export function taskCost({model,usage=[],jevCalls=[],tier='standard',completed=true}){
 // Native totals are cumulative; deduplicate notifications and bill last once.
 const snapshots=[...new Map(usage.map(x=>[JSON.stringify(x.total),x])).values()];
 const gpt=snapshots.map(x=>gptRequestCost(model,x.last,{tier}));
 const jev=jevCalls.map(x=>jevRequestCost(x.model,x.inputTokens??x.usage?.input_tokens));
 const unknown=gpt.filter(x=>x.usd===null).length+jev.filter(x=>x.usd===null).length;
 const knownUsd=[...gpt,...jev].reduce((s,x)=>s+(x.usd??0),0);
 return{knownUsd,gptKnownUsd:gpt.reduce((s,x)=>s+(x.usd??0),0),jevKnownUsd:jev.reduce((s,x)=>s+(x.usd??0),0),unknownCalls:unknown,complete:completed&&snapshots.length>0&&unknown===0,generations:snapshots.length,tier,basis:'public_api_equivalent_not_account_debit',priceDate:PRICE_SNAPSHOT.date};
}
