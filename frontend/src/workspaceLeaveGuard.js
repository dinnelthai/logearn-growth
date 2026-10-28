// Desktop workspace navigation draft safety. Never serialize drafts to a URL.
export function hasUnsavedPageChanges(page,from,to){
  if(!from||!to||from===to)return false;
  try{return page?.hasPendingChanges?.()===true}
  catch{return true} // If the editor cannot report safely, prefer protecting data.
}

export function confirmWorkspaceLeave(page,from,to,confirmLeave){
  if(!hasUnsavedPageChanges(page,from,to))return true;
  return typeof confirmLeave==='function'&&
    confirmLeave('当前页面有未保存的修改。离开页面可能丢失这些内容，确定继续吗？')===true;
}
