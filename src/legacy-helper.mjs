import {readFileSync,writeFileSync,existsSync,statSync,lstatSync,renameSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const legacyHash='68763ff906fbae2ab9d35796a364234dd6ddf9ac03ad2318be9c1ff729ff6d40';
const marker='<!-- jev-pilot-legacy-fallback-v1 -->';
// Migrate only the known shipped helper. Preserve custom skills and a byte-exact
// backup; retain its original fallback commands and separate credential file.
export function migrateLegacyHelper(options={}){
 try{return migrate(options);}catch(error){return{status:'migration_unavailable',changed:false,code:error.code||'FILESYSTEM_ERROR'};}
}
function migrate({home=homedir()}={}){
 const path=join(home,'.codex/skills/jev-assistant/SKILL.md');
 if(!existsSync(path))return{status:'not_present',changed:false};
 if(lstatSync(path).isSymbolicLink())return{status:'custom_link_unchanged',changed:false};
 const raw=readFileSync(path),source=raw.toString('utf8');
 if(source.includes(marker))return{status:'already_compatible',changed:false};
 if(createHash('sha256').update(raw).digest('hex')!==legacyHash)return{status:'custom_skill_unchanged',changed:false};
 const backup=path+'.before-jev-pilot';
 if(existsSync(backup)&&!readFileSync(backup).equals(raw))return{status:'backup_conflict_unchanged',changed:false};
 if(!existsSync(backup))writeFileSync(backup,raw,{flag:'wx',mode:statSync(path).mode&0o777});
 const description='Fallback Jev classification and filtering when the JevPilot plugin is unavailable. If jev_evidence is available, use that self-contained tool directly; do not load or invoke this helper for the same work. Background effort routing belongs to the desktop bridge.';
 const updated=source.replace(/^description:.*$/m,'description: '+JSON.stringify(description)).replace('# Jev 后台助手',`# Jev 后台助手\n\n${marker}\n\nWhen the JevPilot plugin is available, ordinary evidence work uses its self-contained \`jev_evidence\` tool directly. Do not run this helper, read its operation examples, or make a second judgment on the same evidence. The instructions below are a compatibility fallback only when that plugin is unavailable. Keep the normal user workflow; no manual runner or repeated setup is required.`);
 const temporary=path+'.jev-pilot-'+process.pid+'-'+Date.now();
 writeFileSync(temporary,updated,{flag:'wx',mode:statSync(path).mode&0o777});renameSync(temporary,path);
 return{status:'migrated_to_fallback',changed:true,backup};
}
