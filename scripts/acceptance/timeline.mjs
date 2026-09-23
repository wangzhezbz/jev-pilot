// Observed host boundaries, not provider inference latency. No message bodies.
export function timelineEntry(message, elapsedMs) {
  const p=message.params??{}, item=p.item;
  if(!['turn/started','turn/completed','item/started','item/completed','hook/started','hook/completed','thread/tokenUsage/updated','error'].includes(message.method))return null;
  return {elapsedMs:Math.round(elapsedMs*1000)/1000,method:message.method,
    ...(item?{itemId:item.id,itemType:item.type}:{}),
    ...(message.method==='thread/tokenUsage/updated'?{totalTokens:p.tokenUsage?.total?.totalTokens}:{}),
    ...(p.turn?.status?{status:p.turn.status}:{})};
}
