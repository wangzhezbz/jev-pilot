// Keep the harness stop cause even if native cancellation later acknowledges
// "interrupted" (or a completion races with the deadline).
export function stopTask(record,reason){
  record.terminationReason??=reason;
  record.status=record.terminationReason==='deadline'?'timeout':'interrupted';
}
export function nativeTerminal(record,status){
  record.nativeTerminalStatus=status;
  if(!record.terminationReason)record.status=status;
}
