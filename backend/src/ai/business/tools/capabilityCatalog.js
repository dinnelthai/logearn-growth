'use strict';
// Project-shipped, reviewed connectors only. No remote loading or dynamic installation.
// This catalog deliberately preserves the legacy tool contract.
const ID=/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const VERSION=/^[1-9][0-9]*(?:\.[0-9]+){0,2}$/;
const TYPES=new Set(['object','array','string','integer','number','boolean','null']);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
function validSchema(schema,depth=0){
 if(depth>6||!plain(schema)||!TYPES.has(schema.type))return false;
 if(schema.type==='object'){
  if(schema.additionalProperties!==false||!plain(schema.properties||{}))return false;
  if(Object.keys(schema.properties||{}).length>30)return false;
  if(!Object.entries(schema.properties||{}).every(([key,value])=>
   /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)&&validSchema(value,depth+1)))return false;
  if(schema.required!==undefined&&(!Array.isArray(schema.required)||
   schema.required.some(k=>!Object.hasOwn(schema.properties||{},k))||
   new Set(schema.required).size!==schema.required.length))return false;
 }else if(schema.type==='array'){
  if(!validSchema(schema.items,depth+1)||!Number.isSafeInteger(schema.maxItems)||
   schema.maxItems<0||schema.maxItems>100)return false;
 }else if(schema.type==='string'){
  if(!Number.isSafeInteger(schema.maxLength)||schema.maxLength<1||schema.maxLength>2000)return false;
 }
 if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||!schema.enum.length||
   schema.enum.length>30||schema.enum.some(v=>!['string','number','boolean'].includes(typeof v))))return false;
 for(const k of ['minimum','maximum','minLength','minItems']){
  if(schema[k]!==undefined&&(!Number.isFinite(schema[k])||schema[k]<0))return false;
 }
 return true;
}
function matches(schema,value,depth=0){
 if(depth>6)return false;
 if(schema.enum&&!schema.enum.includes(value))return false;
 switch(schema.type){
 case 'object':return plain(value)&&Object.keys(value).length<=30&&
  (schema.required||[]).every(k=>Object.hasOwn(value,k))&&
  Object.entries(value).every(([k,v])=>Object.hasOwn(schema.properties||{},k)&&
   !['__proto__','prototype','constructor'].includes(k)&&matches(schema.properties[k],v,depth+1));
 case 'array':return Array.isArray(value)&&value.length<=schema.maxItems&&
  value.length>=(schema.minItems||0)&&value.every(v=>matches(schema.items,v,depth+1));
 case 'string':return typeof value==='string'&&value.length<=schema.maxLength&&
  value.length>=(schema.minLength||0);
 case 'integer':return Number.isSafeInteger(value)&&
  (schema.minimum===undefined||value>=schema.minimum)&&
  (schema.maximum===undefined||value<=schema.maximum);
 case 'number':return typeof value==='number'&&Number.isFinite(value)&&
  (schema.minimum===undefined||value>=schema.minimum)&&
  (schema.maximum===undefined||value<=schema.maximum);
 case 'boolean':return typeof value==='boolean';
 case 'null':return value===null;
 default:return false;
 }
}
function validateDescriptor(item,legacyIds){
 if(!plain(item)||typeof item.id!=='string'||!ID.test(item.id)||
    legacyIds.has(item.id)||!VERSION.test(item.version||'')||
    typeof item.description!=='string'||item.description.length<1||item.description.length>240||
    !Array.isArray(item.supportedScopes)||!item.supportedScopes.length||
    item.supportedScopes.some(s=>!['source','activityId','cohortId'].includes(s))||
    new Set(item.supportedScopes).size!==item.supportedScopes.length||
    !['owner-read','owner-write'].includes(item.permission)||
    !['none','paid','unknown'].includes(item.cost)||
    !validSchema(item.inputSchema)||!validSchema(item.outputSchema)||
    item.inputSchema.type!=='object'||item.outputSchema.type!=='object'||
    typeof item.execute!=='function'||typeof item.project!=='function'||
    typeof item.enabled!=='function'||typeof item.authorize!=='function')
  fail('连接器能力声明无效');
}
function createCapabilityCatalog({legacyIds=[],extensions=[],assertOwner}={}){
 const old=new Set(legacyIds),byId=new Map();
 if(typeof assertOwner!=='function')fail('能力目录缺少可信身份检查');
 if(!Array.isArray(extensions))fail('连接器集合必须由项目静态声明');
 for(const item of extensions){
  validateDescriptor(item,old);
  if(byId.has(item.id))fail('重复连接器能力ID');
  byId.set(item.id,Object.freeze({...item}));
 }
 function permitted(item,context){
  // The extension's enabled/authorize callbacks are trusted server code, never model input.
  // Until shared budget enforcement is implemented, chargeable capabilities stay closed.
  return item.cost==='none'&&item.enabled(context)===true&&item.authorize(context)===true;
 }
 function list(context,legacyList){
  assertOwner(context);
  const result=legacyList(context);
  for(const item of byId.values()){
   if(!permitted(item,context))continue;
   result.push({id:item.id,version:item.version,description:item.description,
    supportedScopes:[...item.supportedScopes],inputSchema:item.inputSchema,
    outputSchema:item.outputSchema,permission:item.permission,cost:item.cost});
  }
  return result;
 }
 async function execute(id,input={},context,legacyExecute){
  assertOwner(context);
  if(old.has(id))return legacyExecute(id,input,context);
  const item=byId.get(id);
  if(!item)fail('未知调查工具');
  if(!permitted(item,context))fail('能力未启用或未获得授权',403);
  const scope=context.scope||{};
  if(Object.keys(scope).some(key=>!item.supportedScopes.includes(key)))
   fail('能力不允许当前数据范围',403);
  if(!plain(input)||Buffer.byteLength(JSON.stringify(input))>8192||
     !matches(item.inputSchema,input))fail('连接器输入不符合授权schema');
  const raw=await item.execute(JSON.parse(JSON.stringify(input)),context);
  // No raw provider response is returned or archived through this interface.
  const projected=item.project(raw,context);
  if(!plain(projected)||!matches(item.outputSchema,projected)||
     Buffer.byteLength(JSON.stringify(projected))>16000)
   fail('连接器输出未通过安全投影',422);
  return projected;
 }
 return Object.freeze({list,execute});
}
module.exports={createCapabilityCatalog};
