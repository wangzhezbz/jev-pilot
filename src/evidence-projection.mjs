// Reversible presentation of repeated prose lines. Original items are untouched.
// Every source occurrence remains in place; this is not semantic deduplication.
const marker=/\[=S\d+\]/;
const header=x=>`[${x.id} ${x.source}:${x.startLine}-${x.endLine}]\n`;
export function projectEvidence(items,{fragments=false}={}){
  const original=items.map(x=>header(x)+x.text+'\n').join('');
  const plain=()=>({context:original,kind:'original',rawBytes:Buffer.byteLength(original),displayBytes:Buffer.byteLength(original),dictionary:{},projected:items.map(x=>({...x}))});
  if(items.some(x=>marker.test(x.text)))return plain();
  const counts=new Map();
  for(const item of items){
    if(!/\.(?:md|txt|log)$/i.test(item.source??''))continue;
    for(const line of item.text.split('\n')){
      // Whole repeated paragraphs can replace several shared sentences. Keep
      // both candidates; replace longer spans first and emit only used entries.
      const pieces=fragments?[line,...(line.split(/(?<=[.!?。！？])\s+/u).length>1?line.split(/(?<=[.!?。！？])\s+/u):[])]:[line];
      for(const piece of pieces)if(Buffer.byteLength(piece)>=(fragments?60:120))counts.set(piece,(counts.get(piece)??0)+1);
    }
  }
  const repeated=[...counts].filter(([,count])=>count>=3).sort((a,b)=>(Buffer.byteLength(b[0])-8)*(b[1]-1)-(Buffer.byteLength(a[0])-8)*(a[1]-1)).slice(0,32);
  if(fragments)repeated.sort((a,b)=>b[0].length-a[0].length);
  if(!repeated.length)return plain();
  let dictionary=Object.fromEntries(repeated.map(([line],i)=>['S'+i,line]));const ids=new Map(Object.entries(dictionary).map(([id,line])=>[line,id]));
  const projected=items.map(item=>{let text=item.text;if(/\.(?:md|txt|log)$/i.test(item.source??'')){
    if(fragments){for(const [id,piece]of Object.entries(dictionary))text=text.split(piece).join(`[=${id}]`);}
    else text=text.split('\n').map(line=>ids.has(line)?`[=${ids.get(line)}]`:line).join('\n');
  }return{...item,text};});
  if(fragments){const used=new Set(projected.flatMap(item=>[...item.text.matchAll(/\[=(S\d+)\]/g)].map(m=>m[1])));dictionary=Object.fromEntries(Object.entries(dictionary).filter(([id])=>used.has(id)));}
  const context=(fragments?'Shared exact prose (replace each [=S#] with its dictionary text; all whitespace, source records and occurrences are preserved):\n':'Shared source lines (each [=S#] reference below occupies one original line; every occurrence is preserved):\n')
    +Object.entries(dictionary).map(([id,line])=>`[=${id}] ${line}\n`).join('')+'Source excerpts:\n'+projected.map(x=>header(x)+x.text+'\n').join('');
  if(Buffer.byteLength(context)>=Buffer.byteLength(original)*.85)return plain();
  const result={context,kind:fragments?'shared_fragments':'shared_lines',rawBytes:Buffer.byteLength(original),displayBytes:Buffer.byteLength(context),dictionary,projected};
  if(expandEvidenceProjection(result).some((item,i)=>item.text!==items[i].text))return plain();
  return result;
}
export function expandEvidenceProjection(projection){
  if(projection.kind==='shared_fragments')return projection.projected.map(item=>({...item,text:item.text.replace(/\[=(S\d+)\]/g,(match,id)=>Object.hasOwn(projection.dictionary,id)?projection.dictionary[id]:match)}));
  return projection.projected.map(item=>({...item,text:item.text.split('\n').map(line=>{
    const match=line.match(/^\[=(S\d+)\]$/);return match&&Object.hasOwn(projection.dictionary,match[1])?projection.dictionary[match[1]]:line;
  }).join('\n')}));
}
