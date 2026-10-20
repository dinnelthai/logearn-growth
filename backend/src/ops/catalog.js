const fail=message=>{throw Object.assign(Error(message),{status:400})}
const field=(key,label,type='text',required=false,extra={})=>({key,label,type,required,...extra})
const id=field('userId','用户 ID','id',true),provider=field('provider','登录类型','provider',true),subject=field('subject','登录身份','subject',true),address=(key,label,required=true)=>field(key,label,'address',required)
const specs=[
 ['grant_quota','下发 SKILL 次数','POST','admin/api_skill/grant_quota',[id,field('quotaAmount','发放次数','positive',true),field('remark','备注','text',false,{max:128})]],
 ['vip','赠送 VIP','POST','vip/admin/distribute',[provider,subject,field('expectedUserId','预期用户 ID（用于返回核对）','id'),field('effectiveDays','VIP 天数','positive',true)]],
 ['coupon','下发优惠券','POST','user/coupon/admin/distribute',[provider,subject,field('templateId','优惠券模板 ID','positive',true)]],
 ['trading','配置交易等级','POST','admin/internal_sale_user/config_trading_level',[id,field('name','合作伙伴名称','text',true),field('tradingLevel','交易等级','integer',true,{min:1,max:7}),field('description','描述'),...['feeRebateRatioLevel1','feeRebateRatioLevel2','feeRebateRatioLevel3','vipRebateRatioLevel1','vipRebateRatioLevel2','vipRebateRatioLevel3'].map((k,i)=>field(k,(i<3?'手续费':'VIP')+' '+(i%3+1)+'级返佣','ratio')),field('vipDiscount','VIP 折扣','number',false,{min:.4,max:1}),field('status','状态','status')]],
 ['sales','添加 / 修改销售','POST','admin/internal_sale_user/create_or_update',[id,field('name','销售名称'),field('description','描述'),field('couponTemplateId','优惠券模板 ID','positive'),field('status','状态','status')]],
 ['sale_status','更新销售状态','PUT','admin/internal_sale_user/update_sale_status',[address('loginAddress','销售登录地址'),field('status','状态','status',true)]],
 ['relation','更新邀请关系','PUT','admin/internal_sale_user/update_invite_relation',[address('inviteeLoginAddress','被邀请人登录地址'),address('newInviterLoginAddress','新邀请人登录地址'),address('oldInviterLoginAddress','旧邀请人登录地址',false)]],
 ['platform','查询平台地址','POST','admin/api_skill/get_platform_address',[id],true],
 ['sale_info','查询销售信息','GET','admin/internal_sale_user/get_sale_user_info',[id],true],
 ['sale_list','查询启用销售列表','GET','admin/internal_sale_user/list',[],true]
].map(([key,label,method,path,fields,readOnly=false])=>({key,label,method,path,fields,readOnly}))
const catalog=specs.map(({path,method,...s})=>s)
const normalizeAddress=v=>{if(/^0x[0-9a-fA-F]{40}$/.test(v))return v.toLowerCase();if(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v))return v;fail('请输入有效 EVM 或 Solana 钱包地址')}
function normalize(operation,input){
 const spec=specs.find(s=>s.key===operation);if(!spec)fail('不支持的 OPS 操作')
 if(!input||typeof input!=='object'||Array.isArray(input))fail('操作参数须为对象')
 if(Object.keys(input).some(k=>!spec.fields.some(f=>f.key===k)))fail('存在未知参数，请核对字段名')
 const out={}
 for(const f of spec.fields){let v=input[f.key];if(typeof v==='string')v=v.trim();if(v==null||v===''){if(f.required)fail('请填写'+f.label);continue}
  if(['positive','integer','ratio','number','status'].includes(f.type)){if(!['string','number'].includes(typeof v))fail(f.label+'格式无效');v=Number(v);if(!Number.isFinite(v))fail(f.label+'须为数字');if(['positive','integer','status'].includes(f.type)&&!Number.isSafeInteger(v))fail(f.label+'须为安全整数');if(f.type==='positive'&&v<=0||f.type==='ratio'&&(v<0||v>1)||f.type==='status'&&![0,1,2].includes(v)||f.min!=null&&v<f.min||f.max!=null&&v>f.max)fail(f.label+'超出允许范围')}
  else{if(f.type==='id'&&typeof v==='number'&&!Number.isSafeInteger(v))fail('用户 ID 须保持整数精度');if(typeof v!=='string'&&f.type!=='id')fail(f.label+'格式无效');v=String(v).trim();if(!v&&f.required)fail('请填写'+f.label);if(v.length>(f.max||1000))fail(f.label+'过长');if(f.type==='id'&&!/^[1-9]\d{0,19}$/.test(v))fail('用户 ID 格式无效');if(f.type==='provider'&&!['email','telegram','metamask','phantom'].includes(v))fail('登录类型无效');if(f.type==='address')v=normalizeAddress(v)}
  out[f.key]=v
 }
 if(out.subject){if(out.provider==='metamask'){out.subject=normalizeAddress(out.subject);if(!out.subject.startsWith('0x'))fail('metamask 需要 EVM 地址')}else if(out.provider==='phantom'){out.subject=normalizeAddress(out.subject);if(out.subject.startsWith('0x'))fail('phantom 需要 Solana 地址')}else if(out.provider==='email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.subject))fail('邮箱格式无效')}else if(!/^\d+$/.test(out.subject))fail('Telegram 身份须为数字 ID')}
 if(operation==='trading')for(const prefix of ['feeRebateRatioLevel','vipRebateRatioLevel']){const keys=[1,2,3].map(n=>prefix+n),present=keys.filter(k=>k in out);if(present.length&&present.length!==3)fail('配置返佣时必须同时填写三级比例');if(keys.reduce((n,k)=>n+(out[k]||0),0)>.900000000001)fail('三级返佣比例合计不能超过90%')}
 if(operation==='relation'&&(out.inviteeLoginAddress===out.newInviterLoginAddress||out.inviteeLoginAddress===out.oldInviterLoginAddress||out.oldInviterLoginAddress===out.newInviterLoginAddress))fail('邀请双方或新旧邀请人不能相同')
 // Keep integer precision explicit for APIs documented with numeric IDs.
 if(['trading','sales','sale_info','platform'].includes(operation)){if(!Number.isSafeInteger(Number(out.userId)))fail('该接口的用户 ID 超过安全整数范围');out.userId=Number(out.userId)}
 return out
}
module.exports={catalog,specs,normalize,normalizeAddress,fail}
