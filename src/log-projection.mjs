// Lossless presentation for repeated numeric key=value log lines. No inference,
// aggregation, sampling or omission: every original line and numeric lexeme stays.
const marker=/\[=N\d+(?: |\])/;
const header=item=>`[${item.id} ${item.source}:${item.startLine}-${item.endLine}]\n`;
export function projectLogTemplates(items){
  const original=items.map(item=>header(item)+item.text+'\n').join('');
  const plain=()=>({kind:'original',context:original});
  if(items.some(item=>/\[=B\d+/.test(item.text)||marker.test(item.text)||/\{#\d+\}/.test(item.text)))return plain();
  const groups=new Map();
  for(const item of items){
    if(!/\.log$/i.test(item.source||''))continue;
    for(const line of item.text.split('\n')){
      if(line.length<60||(line.match(/\b[A-Za-z_][\w.-]*=/g)||[]).length<3)continue;
      const values=line.match(/\d+/g); if(!values||values.length>24)continue;
      const parts=line.split(/\d+/g),key=JSON.stringify(parts);
      const entry=groups.get(key)||{parts,count:0,constants:[...values]};
      entry.constants=entry.constants.map((v,i)=>v===values[i]?v:null);entry.count++;groups.set(key,entry);
    }
  }
  const chosen=[...groups].filter(([,g])=>g.count>=8).sort((a,b)=>b[1].count-a[1].count).slice(0,32);
  if(!chosen.length)return plain();
  const keys=new Map(chosen.map(([key],i)=>[key,'N'+i]));
  // Fold only byte-identical numeric columns into the template. No numeric
  // normalization: 00 and 0 remain different. Keep one slot even for constant
  // rows so existing row syntax and exact expansion remain unambiguous.
  const slots=new Map();
  const dictionary=Object.fromEntries(chosen.map(([key,g],i)=>{
    const variable=g.constants.flatMap((v,j)=>v===null?[j]:[]);
    if(!variable.length)variable.push(0);
    slots.set(key,variable);
    const parts=[g.parts[0]];
    for(let j=0;j<g.constants.length;j++){
      if(variable.includes(j))parts.push(g.parts[j+1]);
      else parts[parts.length-1]+=g.constants[j]+g.parts[j+1];
    }
    return ['N'+i,parts];
  }));
  const projected=items.map(item=>({...item,text:! /\.log$/i.test(item.source||'')?item.text:item.text.split('\n').map(line=>{
    const key=JSON.stringify(line.split(/\d+/g)),id=keys.get(key);
    const values=id?line.match(/\d+/g):null;
    return id?`[=${id} ${slots.get(key).map(i=>values[i]).join('|')}]`:line;
  }).join('\n')}));
  const blocked=projectLogBlocks(projected);
  const shown=blocked.items;
  const context=blocked.guide+'Lossless log templates: substitute each row\'s digit strings for {#1}, {#2}, ... in order. Preserve leading zeros; values are text, not arithmetic. Each row is one original line; no records or values omitted. Other lines remain verbatim.\n'
    +Object.entries(dictionary).map(([id,parts])=>`[=${id}] `+parts.map((p,i)=>p+(i<parts.length-1?`{#${i+1}}`:'')).join('')+'\n').join('')
    +'Source records:\n'+shown.map(item=>header(item)+item.text+'\n').join('');
  if(Buffer.byteLength(context)>=Buffer.byteLength(original)*.75)return plain();
  const result={kind:'log_templates',context,dictionary,projected:shown,blocks:blocked.blocks};
  // Assert byte-exact reversibility before exposing any compact representation.
  const expanded=expandLogTemplates(result);
  if(expanded.some((item,i)=>item.text!==items[i].text))return plain();
  return result;
}
export function expandLogTemplates(projection){
  return expandLogBlocks(projection.projected,projection.blocks??{}).map(item=>({...item,text:item.text.split('\n').map(line=>{
    const match=line.match(/^\[=(N\d+) ([0-9|]+)\]$/);
    if(!match||!Object.hasOwn(projection.dictionary,match[1]))return line;
    const parts=projection.dictionary[match[1]],values=match[2].split('|');
    if(parts.length!==values.length+1)return line;
    return parts.map((part,i)=>part+(values[i]||'')).join('');
  }).join('\n')}));
}

// Compact only exact regular digit columns. No statistical approximation,
// missing rows, semantic classification or floating-point arithmetic.
function arithmetic(values){
  if(values.length<3)return null;
  const start=BigInt(values[0]),step=BigInt(values[1])-start;
  for(const width of [0,values[0].length])
    if(values.every((v,i)=>(start+step*BigInt(i)).toString().padStart(width,'0')===v))return {start:values[0],step:String(step),width};
  return null;
}
function encodeColumn(values){
  const candidates=[{values}],sequence=arithmetic(values);
  if(sequence)candidates.push(sequence);
  for(let period=1;period<=Math.min(64,Math.floor(values.length/3));period++)
    if(values.every((v,i)=>v===values[i%period])){candidates.push({cycle:values.slice(0,period)});break;}
  const segments=[];
  for(let i=0;i<values.length;){
    const seed=arithmetic(values.slice(i,i+3));
    if(!seed){segments.push({count:1,values:[values[i++]]});continue;}
    let end=i+3;while(end<values.length&&columnAt(seed,end-i)===values[end])end++;
    segments.push({count:end-i,...seed});i=end;
  }
  candidates.push({segments});
  return candidates.sort((a,b)=>JSON.stringify(a).length-JSON.stringify(b).length)[0];
}
function columnAt(column,i){
  if(column.segments){for(const part of column.segments){if(i<part.count)return columnAt(part,i);i-=part.count;}throw Error('INVALID_COLUMN_INDEX');}
  if(column.values)return column.values[i];
  if(column.cycle)return column.cycle[i%column.cycle.length];
  return (BigInt(column.start)+BigInt(column.step)*BigInt(i)).toString().padStart(column.width,'0');
}
export function projectLogBlocks(items){
  const blocks={};
  const projected=items.map(item=>{
    const lines=item.text.split('\n'),out=[];
    for(let i=0;i<lines.length;){
      const match=lines[i].match(/^\[=(N\d+) ([0-9|]+)\]$/);
      if(!match){out.push(lines[i++]);continue;}
      const rows=[];let end=i;
      while(end<lines.length){const next=lines[end].match(/^\[=(N\d+) ([0-9|]+)\]$/);
        if(!next||next[1]!==match[1])break;
        rows.push(next[2].split('|'));end++;
      }
      if(rows.length<8){out.push(...lines.slice(i,end));i=end;continue;}
      const values=rows[0].map((_,j)=>rows.map(r=>r[j]));
      const block={template:match[1],count:rows.length,columns:values.map((v,j)=>{
        const previous=values.findIndex((other,k)=>k<j&&JSON.stringify(other)===JSON.stringify(v));
        return previous>=0?{column:previous}:encodeColumn(v);
      })};
      const id='B'+Object.keys(blocks).length,display=`[=${id} ${JSON.stringify(block)}]`;
      const original=lines.slice(i,end).join('\n');
      const expanded=Array.from({length:block.count},(_,n)=>`[=${block.template} ${block.columns.map(c=>columnAt(c.column===undefined?c:block.columns[c.column],n)).join('|')}]`).join('\n');
      if(expanded===original&&Buffer.byteLength(display)<Buffer.byteLength(original)*.8){blocks[id]=block;out.push(display);}
      else out.push(...lines.slice(i,end));
      i=end;
    }
    return {...item,text:out.join('\n')};
  });
  return {items:projected,blocks,guide:Object.keys(blocks).length?
    'Lossless row blocks [=B# JSON]: expand count rows in original order, zero-based i. Each column is exact digit text: values[i], cycle[i modulo cycle length], or (start + step*i) left-padded to width. segments concatenate their count rows; column:k copies earlier zero-based column k. Substitute those digits into template N#. Every original row survives; exceptions stay explicit.\n':''};
}
export function expandLogBlocks(items,blocks){
  return items.map(item=>({...item,text:item.text.split('\n').flatMap(line=>{
    const match=line.match(/^\[=(B\d+) (.+)\]$/);
    if(!match||!Object.hasOwn(blocks,match[1]))return [line];
    const block=JSON.parse(match[2]);
    if(JSON.stringify(block)!==JSON.stringify(blocks[match[1]]))throw Error('BLOCK_MISMATCH');
    return Array.from({length:block.count},(_,i)=>`[=${block.template} ${block.columns.map(c=>columnAt(c.column===undefined?c:block.columns[c.column],i)).join('|')}]`);
  }).join('\n')}));
}
