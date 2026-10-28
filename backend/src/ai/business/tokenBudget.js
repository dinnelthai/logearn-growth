'use strict';
// The relay has no exact preflight tokenizer for its configured model.
// This conservatively estimates tokens rather than conflating UTF-8 bytes
// with tokens. Provider-reported usage is authoritative after each call.
const ESTIMATE_HEADROOM=1.20;
const MESSAGE_OVERHEAD=12;
function isAsciiWord(code){
 return (code>=48&&code<=57)||(code>=65&&code<=90)||
  (code>=97&&code<=122)||code===95;
}
function estimateTextTokens(value){
 if(typeof value!=='string')throw Error('模型预算估算需要文本消息');
 let tokens=0,asciiWordLength=0;
 const flush=()=>{if(asciiWordLength){tokens+=Math.ceil(asciiWordLength/2);asciiWordLength=0}};
 for(const char of value){
  const code=char.codePointAt(0);
  if(isAsciiWord(code)){asciiWordLength++;continue}
  flush();
  if(code<128)tokens+=1; // punctuation and JSON separators
  else if(code>0xFFFF)tokens+=4; // emoji / non-BMP
  else tokens+=2; // CJK and other non-ASCII text
 }
 flush();
 return tokens;
}
function estimateChatTokens(messages){
 if(!Array.isArray(messages)||!messages.length)throw Error('模型消息为空，无法估算预算');
 let total=6;
 for(const message of messages){
  if(!message||typeof message.role!=='string'||typeof message.content!=='string')
   throw Error('模型消息不完整，无法估算预算');
  total+=MESSAGE_OVERHEAD+estimateTextTokens(message.role)+estimateTextTokens(message.content);
  if(!Number.isSafeInteger(total))throw Error('模型消息超出预算估算上限');
 }
 return Math.ceil(total*ESTIMATE_HEADROOM);
}
module.exports={estimateTextTokens,estimateChatTokens};
