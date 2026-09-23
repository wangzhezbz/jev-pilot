import test from 'node:test';import assert from 'node:assert/strict';
import {outputAdapter} from '../src/output-adapters.mjs';
test('MCP plain text replacement preserves envelope and leaves original untouched',()=>{
 const original={content:[{type:'text',text:'plain log\nline two'}],isError:false};const saved=JSON.stringify(original);
 const a=outputAdapter('mcp__fixture__log',original);assert.equal(a.kind,'mcp_text');
 assert.deepEqual(JSON.parse(a.wrap('short log')),{content:[{type:'text',text:'short log'}],isError:false});assert.equal(JSON.stringify(original),saved);
});
test('structured, mixed media, citations, errors and unknown envelopes are not adapted',()=>{
 const text={type:'text',text:'plain log'};
 for(const response of [{content:[text],structuredContent:{}},{content:[text],isError:true},{content:[text,{type:'image',data:'AA=='}]},{content:[{...text,annotations:{}}]},{content:[{type:'text',text:'{"answer":42}'}]},{content:[text],metadata:{}},null])assert.equal(outputAdapter('mcp__fixture__log',response),null);
 assert.equal(outputAdapter('functions.exec',{content:[text]}),null);
});
