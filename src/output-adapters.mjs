// Native hook replacement is text. Supported MCP text envelopes are serialized
// as JSON with every original field retained; mixed/typed payloads pass through.
export function outputAdapter(tool,response) {
 if(typeof response==='string')return{text:response,kind:'text',wrap:text=>text};
 if(!/^mcp__/.test(tool||'')||!response||typeof response!=='object'||Array.isArray(response)
  ||Object.keys(response).some(k=>!['content','isError'].includes(k))||response.isError===true
  ||!Array.isArray(response.content)||response.content.length!==1)return null;
 const part=response.content[0];
 if(!part||part.type!=='text'||typeof part.text!=='string'||Object.keys(part).some(k=>!['type','text'].includes(k)))return null;
 // A JSON text block may itself be a structured contract; never reinterpret it.
 try{JSON.parse(part.text);return null;}catch{}
 return{text:part.text,kind:'mcp_text',wrap:text=>JSON.stringify({...response,content:[{...part,text}]})};
}
