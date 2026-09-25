// Lossless presentation for repeated numeric key=value log lines. No inference,
// aggregation, sampling or omission: every original line and numeric lexeme stays.
const marker=/\[=N\d+(?: |\])/;
const header=item=>`[${item.id} ${item.source}:${item.startLine}-${item.endLine}]\n`;
export function projectLogTemplates(items){
  const original=items.map(item=>header(item)+item.text+'\n').join('');
  const plain=()=>({kind:'original',context:original});
  if(items.some(item=>marker.test(item.text)||/\{#\d+\}/.test(item.text)))return plain();
  const groups=new Map();
  for(const item of items){
    if(!/\.log$/i.test(item.source||''))continue;
    for(const line of item.text.split('\n')){
      if(line.length<60||(line.match(/\b[A-Za-z_][\w.-]*=/g)||[]).length<3)continue;
      const values=line.match(/\d+/g); if(!values||values.length>24)continue;
      const parts=line.split(/\d+/g),key=JSON.stringify(parts);
      const entry=groups.get(key)||{parts,count:0};entry.count++;groups.set(key,entry);
    }
  }
  const chosen=[...groups].filter(([,g])=>g.count>=8).sort((a,b)=>b[1].count-a[1].count).slice(0,32);
  if(!chosen.length)return plain();
  const keys=new Map(chosen.map(([key],i)=>[key,'N'+i]));
  const dictionary=Object.fromEntries(chosen.map(([,g],i)=>['N'+i,g.parts]));
  const projected=items.map(item=>({...item,text:! /\.log$/i.test(item.source||'')?item.text:item.text.split('\n').map(line=>{
    const id=keys.get(JSON.stringify(line.split(/\d+/g)));
    return id?`[=${id} ${line.match(/\d+/g).join('|')}]`:line;
  }).join('\n')}));
  const context='Lossless log templates: substitute each row\'s digit strings for {#1}, {#2}, ... in order. Preserve leading zeros; values are text, not arithmetic. Each row is one original line; no records or values omitted. Other lines remain verbatim.\n'
    +Object.entries(dictionary).map(([id,parts])=>`[=${id}] `+parts.map((p,i)=>p+(i<parts.length-1?`{#${i+1}}`:'')).join('')+'\n').join('')
    +'Source records:\n'+projected.map(item=>header(item)+item.text+'\n').join('');
  if(Buffer.byteLength(context)>=Buffer.byteLength(original)*.75)return plain();
  const result={kind:'log_templates',context,dictionary,projected};
  // Assert byte-exact reversibility before exposing any compact representation.
  const expanded=expandLogTemplates(result);
  if(expanded.some((item,i)=>item.text!==items[i].text))return plain();
  return result;
}
export function expandLogTemplates(projection){
  return projection.projected.map(item=>({...item,text:item.text.split('\n').map(line=>{
    const match=line.match(/^\[=(N\d+) ([0-9|]+)\]$/);
    if(!match||!Object.hasOwn(projection.dictionary,match[1]))return line;
    const parts=projection.dictionary[match[1]],values=match[2].split('|');
    if(parts.length!==values.length+1)return line;
    return parts.map((part,i)=>part+(values[i]||'')).join('');
  }).join('\n')}));
}
