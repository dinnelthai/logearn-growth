import {test,expect} from 'vitest'
import {pathCrossDayMarkup} from '../../pages/pathCrossDay.js'
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),ctx={esc,fmt:String,names:{chip:'有效分析'},table:(headers,rows)=>JSON.stringify([headers,rows])}
test('cross-day view labels calendar windows, undefined intervals and clickable exact lists',()=>{
 const html=pathCrossDayMarkup(ctx,{users:2,returning_users:1,analysis_returning_users:0,median_first_return_hours:null,distribution:[{days:2,users:1,list_key:'crossday:days:2'}],entries:[{from:'<unsafe>',to:'chip',users:1,list_key:'entry:"unsafe'}],partial_last_day:true})
 expect(html).toContain('跨天回访行为');expect(html).toContain('crossday:returning');expect(html).toContain('crossday:days:2');expect(html).toContain('末日仍在进行中');expect(html).toContain('不等于首次注册');expect(html).toContain('少于24小时');expect(html).toContain('&lt;unsafe>');expect(html).not.toContain('<unsafe>');expect(html).not.toContain('NaN');expect(pathCrossDayMarkup(ctx,null)).toBe('')
})
