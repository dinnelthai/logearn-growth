/**
 * Pagination rules for remote, filtered drill-down lists.
 * The server is authoritative for total: never fabricate missing rows.
 */
export function normalizeRemoteTotal(total){
  const number=Number(total);
  return Number.isSafeInteger(number)&&number>=0?number:0;
}

export function lastRemotePage(total,pageSize){
  const size=Number.isSafeInteger(pageSize)&&pageSize>0?pageSize:12;
  return Math.max(0,Math.ceil(normalizeRemoteTotal(total)/size)-1);
}

export function remotePageCorrection({page,total,pageSize}){
  const current=Number.isSafeInteger(page)&&page>=0?page:0;
  const last=lastRemotePage(total,pageSize);
  const next=Math.min(current,last);
  return {page:next,refetch:normalizeRemoteTotal(total)>0&&next!==current};
}
