// Parse reported UA labels, never infer viewport size from device class.
function deviceInfo(e={}){
 const ua=String(e.ua||''),match=re=>ua.match(re)?.[1]||null
 let browser='未知',version=null
 for(const [name,re] of [['Edge',/Edg(?:A|iOS)?\/([\d.]+)/],['Opera',/OPR\/([\d.]+)/],['Firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['Chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['Safari',/Version\/([\d.]+).*Safari/]]){const v=match(re);if(v){browser=name;version=v;break}}
 const os=/iPhone|iPad|iPod/.test(ua)?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'未知'
 const environment=/Telegram/i.test(ua)?'Telegram 内置':/MicroMessenger/i.test(ua)?'微信内置':/; wv\)|\bwv\b/.test(ua)?'Android WebView':'未识别内置环境'
 const width=Number(e.viewport_width),height=Number(e.viewport_height)
 return {device:e.device==='mobile'?'手机':e.device==='desktop'?'桌面':'未知',browser,version,os,environment,viewport_width:Number.isFinite(width)&&width>0?width:null,viewport_height:Number.isFinite(height)&&height>0?height:null}
}
module.exports={deviceInfo}
