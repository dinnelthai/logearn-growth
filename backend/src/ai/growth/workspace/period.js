'use strict';
const DAY=86400000, OFFSET=7*3600000;
function validTime(now){if(!Number.isSafeInteger(now)||now<0)throw Error('无效时间');return now}
function bangkokParts(ms){const d=new Date(validTime(ms)+OFFSET);return {y:d.getUTCFullYear(),m:d.getUTCMonth(),date:d.getUTCDate(),weekday:d.getUTCDay()}}
function atBangkok(y,m,date){return Date.UTC(y,m,date)-OFFSET}
function dayStart(ms){const {y,m,date}=bangkokParts(ms);return atBangkok(y,m,date)}
function lastCompleted(kind,now=Date.now()){
 const p=bangkokParts(now),today=dayStart(now);
 if(kind==='daily')return {kind,start:today-DAY,end:today,timezone:'Asia/Bangkok'};
 if(kind==='weekly'){const mondayOffset=(p.weekday+6)%7;const monday=today-mondayOffset*DAY;return {kind,start:monday-7*DAY,end:monday,timezone:'Asia/Bangkok'}}
 if(kind==='monthly'){const thisMonth=atBangkok(p.y,p.m,1);return {kind,start:atBangkok(p.y,p.m-1,1),end:thisMonth,timezone:'Asia/Bangkok'}}
 throw Error('不支持的统计周期')
}
function currentMonth(now=Date.now()){const {y,m}=bangkokParts(now);return {kind:'monthly',start:atBangkok(y,m,1),end:atBangkok(y,m+1,1),timezone:'Asia/Bangkok'}}
function monthFor(ms){const {y,m}=bangkokParts(ms);return `${y}-${String(m+1).padStart(2,'0')}`}
function periodLabel(period){return new Date(period.start+OFFSET).toISOString().slice(0,10)}
module.exports={DAY,OFFSET,bangkokParts,atBangkok,dayStart,lastCompleted,currentMonth,monthFor,periodLabel};
