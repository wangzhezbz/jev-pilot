// Release ordering is explicit; timestamps are UTC, never mixed local strings.
export function releaseParts(version){
 const m=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\+codex\.(\d{14})$/.exec(version??'');
 if(!m)throw Error('UNSUPPORTED_RELEASE_VERSION');
 const stamp=m[4],iso=`${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}Z`;
 const ms=Date.parse(iso);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().replace(/[-:TZ.]/g,'').slice(0,14)!==stamp)throw Error('INVALID_RELEASE_TIMESTAMP');
 const base=m.slice(1,4).map(Number);if(base.some(x=>!Number.isSafeInteger(x)))throw Error('UNSUPPORTED_RELEASE_VERSION');
 return {base,ms};
}
export function assertReleaseVersion({portable,codex,packageVersion,previousVersion}){
 if(portable!==codex)throw Error('PLUGIN_MANIFEST_VERSION_MISMATCH');
 const a=releaseParts(portable),b=releaseParts(previousVersion);
 if(packageVersion!==a.base.join('.'))throw Error('PACKAGE_VERSION_MISMATCH');
 const different=a.base.findIndex((x,i)=>x!==b.base[i]);
 if(different>=0?a.base[different]<b.base[different]:a.ms<=b.ms)throw Error('RELEASE_VERSION_NOT_NEWER');
 return portable;
}
export function nextReleaseVersion({base,previousVersion,now=Date.now()}){
 const old=releaseParts(previousVersion),parts=releaseParts(`${base}+codex.20000101000000`).base;
 const different=parts.findIndex((x,i)=>x!==old.base[i]);
 if(different>=0&&parts[different]<old.base[different])throw Error('RELEASE_BASE_REGRESSION');
 const stamp=new Date(Math.max(now,old.ms+1000)).toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
 return `${base}+codex.${stamp}`;
}
export function newestReleaseVersion(versions){
 return versions.reduce((best,value)=>{
  const a=releaseParts(value),b=releaseParts(best),i=a.base.findIndex((x,j)=>x!==b.base[j]);
  return (i>=0?a.base[i]>b.base[i]:a.ms>b.ms)?value:best;
 });
}
