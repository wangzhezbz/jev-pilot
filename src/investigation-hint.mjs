// A small prompt hint, not a routing judgment or a command rewrite.
// Cheap metadata admission keeps it off exact/small tasks. No file bodies or API calls.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {statSync} from 'node:fs';
import {basename} from 'node:path';
import {inside} from './core.mjs';
const exec=promisify(execFile);
export const INVESTIGATION_HINT='For broad workspace investigation, prefer one read-only jev_evidence call with operation="investigate" and input={goal,queries:[discriminating literal terms],paths:[relevant directories]} before broad file reads. It returns source excerpts, scope and recovery; no skill/status call needed. Skip this for small or exact lookups. Query matches are not exhaustive semantic coverage; read additional source context when needed.';
export const LARGE_TEXT_HINT='A text file named in this task exceeds 16 kB. Before displaying it in full, use discriminating native searches when sufficient; otherwise use read-only jev_evidence operation="prepare" with input={goal,path}. No skill/status call needed. Read coverage and recovery metadata, recall missing or contradictory evidence, and use the original on failure. Do not claim exhaustive coverage from literal search alone. Exact output and code/structured data stay on native tools.';
const mentioned=(prompt,path)=>[path,basename(path)].some(name=>{
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(?:^|[^\\w./\\\\-])'+escaped+'(?=$|[^\\w./\\\\-])','i').test(prompt);
});
export async function investigationHint(root,prompt){
  if(typeof prompt!=='string'||prompt.length>10000||!/(?:\b(?:inspect|review|analy[sz]e|investigat\w*|diagnos\w*|locate|reconcile|find|debug)\b|分析|排查|调查|检索|查找|梳理|核对|查明|研究)/i.test(prompt)
    ||/\b(?:verbatim|exact output|only translate)\b|原样输出|完整输出|只翻译/i.test(prompt))return null;
  if(!/\b(?:workspace|repository|repo|files?|logs?|code|documents?|policy)\b|\.(?:md|txt|log)\b|\b(?:notes|docs|src)\/|目录|仓库|文件|代码|项目文档|本地文档/i.test(prompt))return null;
  const start=performance.now();let stdout;
  try{({stdout}=await exec('rg',['--no-config','--files','--null'],{cwd:root,timeout:150,maxBuffer:512000,windowsHide:true}));}catch{return null;}
  let files=0,bytes=0;
  for(const path of stdout.split('\0').filter(Boolean).slice(0,80)){
    if(performance.now()-start>200)return null;
    if(!/\.(?:md|txt|log|[cm]?[jt]sx?|py|rs|go|java|c|cpp|h)$/i.test(path))continue;
    try{const s=statSync(inside(root,path));if(!s.isFile()||s.size>1000000)continue;
      if(/\.(?:md|txt|log)$/i.test(path)&&s.size>16000&&s.size<=100000&&mentioned(prompt,path))
        return{context:LARGE_TEXT_HINT,eligibleFiles:1,observedBytes:s.size};
      files++;bytes+=s.size;}catch{continue;}
    if(files>=8&&bytes>16000)return{context:INVESTIGATION_HINT,eligibleFiles:files,observedBytes:bytes};
  }
  return null;
}
