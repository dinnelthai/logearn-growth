/** Pure fixed-cohort tracking helpers; UTC+7 is the reporting timezone. */
export const DAY=86400000
export const OFFSET=25200000
export const dayStart=t=>Math.floor((t+OFFSET)/DAY)*DAY-OFFSET

export function canonicalUserIds(input) {
  if(!Array.isArray(input))return []
  return [...new Set(input.map(raw=>{
    const id=String(raw??'').trim()
    if(!id||id.startsWith('anonymous:'))return null
    const key=id.startsWith('user:')?id:'user:'+id
    return /^user:[^\s]+$/.test(key)?key:null
  }).filter(Boolean))]
}

export function trendPeriods(asOf) {
  if(!Number.isFinite(asOf))throw new Error('分析快照时间无效')
  const first=dayStart(asOf)-6*DAY
  return Array.from({length:7},(_,i)=>({
    start:first+i*DAY,end:Math.min(first+(i+1)*DAY,asOf+1)
  }))
}

export function actionWindows(executedAt) {
  if(!Number.isFinite(executedAt))throw new Error('运营动作时间无效')
  const day=dayStart(executedAt)
  return {
    beforeStart:day-7*DAY,beforeEnd:day,
    afterStart:day+DAY,afterEnd:day+8*DAY
  }
}
