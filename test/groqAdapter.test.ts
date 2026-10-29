import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {normalizeRequest,quotaWait,startAdapter}=createRequire(import.meta.url)('../scripts/groq-adapter.cjs');
const request={model:'openai/gpt-oss-120b',stream:true,messages:[{role:'assistant',content:null,reasoning_content:'not replayable',reasoning:'private',tool_calls:[{id:'call-1',type:'function',function:{name:'read_file',arguments:'{}'}}]}]};
it('removes only incompatible reasoning fields and preserves tool call structure',()=>{
 const normalized=normalizeRequest(request);
 expect(normalized.messages[0]).toEqual({role:'assistant',content:null,tool_calls:request.messages[0]!.tool_calls});
 expect(normalized.include_reasoning).toBe(false);expect(request.messages[0]!.reasoning_content).toBe('not replayable');
 expect(normalizeRequest({model:'other',messages:[{role:'tool',content:'result'}]})).toEqual({model:'other',messages:[{role:'tool',content:'result'}]});
});
it('reads Groq retry hints and Retry-After with bounded waits',()=>{
 expect(quotaWait('Please try again in 23.5s.',null)).toBe(23750);
 expect(quotaWait('Please retry in 1.2s.',null)).toBe(1450);
 expect(quotaWait('', '2')).toBe(2250);expect(quotaWait('retry in 3600s',null)).toBe(60000);
});
it('forwards exact SSE bytes and credentials only to the fixed Groq endpoint',async()=>{
 const seen:any[]=[];const body='data: {"choices":[]}\n\ndata: [DONE]\n\n';
 const adapter=await startAdapter({port:0,fetchImpl:async(url:string,options:any)=>{seen.push({url,options});return new Response(body,{headers:{'content-type':'text/event-stream'}});}});
 try{const result=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy-test-key','Content-Type':'application/json'},body:JSON.stringify(request)});expect(await result.text()).toBe(body);expect(seen[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');expect(seen[0].options.headers.Authorization).toBe('Bearer dummy-test-key');expect(JSON.parse(seen[0].options.body)).toEqual(normalizeRequest(request));}finally{await adapter.close();}
});
it('retries the same model body after 429 before emitting SSE',async()=>{
 const bodies:string[]=[];const sleeps:number[]=[];
 const adapter=await startAdapter({port:0,sleep:async(ms:number)=>{sleeps.push(ms);},fetchImpl:async(_url:string,o:any)=>{bodies.push(o.body);return bodies.length===1?new Response('Please try again in 0.1s.',{status:429}):new Response('data: [DONE]\n\n');}});
 try{const result=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(await result.text()).toBe('data: [DONE]\n\n');expect(sleeps).toEqual([350]);expect(bodies).toHaveLength(2);expect(bodies[0]).toBe(bodies[1]);}finally{await adapter.close();}
});
it('does not retry bad auth or a prompt larger than its token limit',async()=>{
 for(const [status,message] of [[401,'Bad credential'],[429,'Limit 7000, Used 100, Requested 8000']] as const){
 const upstream=vi.fn(async()=>new Response(message,{status}));const sleep=vi.fn();const adapter=await startAdapter({port:0,fetchImpl:upstream,sleep});
 try{const result=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(result.status).toBe(status);expect(await result.text()).toBe(message);expect(upstream).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled();}finally{await adapter.close();}}
});
it('cancels a quota wait when its downstream connection closes',async()=>{
 let ready!:()=>void;const entered=new Promise<void>(r=>{ready=r;});let cancelled!:()=>void;const cancelledWait=new Promise<void>(r=>{cancelled=r;});
 const upstream=vi.fn(async()=>new Response('retry in 60s',{status:429}));
 const adapter=await startAdapter({port:0,fetchImpl:upstream,sleep:async(_ms:number,signal:AbortSignal)=>{ready();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>{cancelled();reject(Error('cancelled'));},{once:true}));}});
 try{const abort=new AbortController();const pending=fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request),signal:abort.signal}).catch(()=>null);await entered;abort.abort();await pending;await cancelledWait;expect(upstream).toHaveBeenCalledTimes(1);}finally{await adapter.close();}
},3000);
it('rejects unsupported paths and missing credentials without calling Groq',async()=>{
 const upstream=vi.fn();const adapter=await startAdapter({port:0,fetchImpl:upstream});
 try{expect((await fetch(adapter.url+'/chat/completions',{method:'POST',body:'{}'})).status).toBe(401);expect((await fetch(adapter.url+'/other')).status).toBe(404);expect(upstream).not.toHaveBeenCalled();}finally{await adapter.close();}
});

it('regenerates rejected tool JSON before delivering any tool-call bytes',async()=>{
 const responses=['data: {"choices":[{"delta":{"role":"assistant"}}]}\n\ndata: {"error":{"message":"Failed to parse tool call arguments as JSON"}}\n\n','data: {"choices":[{"delta":{"tool_calls":[{"id":"valid","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\ndata: [DONE]\n\n'];
 const bodies:any[]=[];const adapter=await startAdapter({port:0,fetchImpl:async(_u:string,o:any)=>{bodies.push(JSON.parse(o.body));return new Response(responses[bodies.length-1],{headers:{'content-type':'text/event-stream'}});}});
 try{const result=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify({...request,temperature:0.2})});expect(await result.text()).toBe(responses[1]);expect(bodies).toHaveLength(2);expect(bodies[1].temperature).toBe(0.1);expect(bodies[1].messages.slice(0,-1)).toEqual(bodies[0].messages);expect(bodies[1].messages.at(-1)).toMatchObject({role:'system'});expect(bodies[1].messages.at(-1).content).toContain('mcp_server, tool_name and input');}finally{await adapter.close();}
});
it('never regenerates after visible text has been streamed',async()=>{
 const body='data: {"choices":[{"delta":{"content":"visible"}}]}\n\ndata: {"error":{"message":"Failed to parse tool call arguments as JSON"}}\n\n';
 const upstream=vi.fn(async()=>new Response(body,{headers:{'content-type':'text/event-stream'}}));const adapter=await startAdapter({port:0,fetchImpl:upstream});
 try{const result=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(await result.text()).toBe(body);expect(upstream).toHaveBeenCalledTimes(1);}finally{await adapter.close();}
});

it('recovers a schema-validation rejection before delivering tool output',async()=>{
 let calls=0;const adapter=await startAdapter({port:0,fetchImpl:async()=>{calls++;return new Response(calls===1?'data: {"error":{"message":"Tool call validation failed: missing mcp_server"}}\n\n':'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(await response.text()).toBe('data: [DONE]\n\n');expect(calls).toBe(2);}finally{await adapter.close();}
});
it('delivers text immediately while the upstream response remains open',async()=>{
 let upstream!:ReadableStreamDefaultController<Uint8Array>;
 const adapter=await startAdapter({port:0,fetchImpl:async()=>new Response(new ReadableStream<Uint8Array>({start(c){upstream=c;c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));}}),{headers:{'content-type':'text/event-stream'}})});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});const reader=response.body!.getReader();const first=await reader.read();expect(new TextDecoder().decode(first.value)).toContain('hello');upstream.close();await reader.cancel();}finally{await adapter.close();}
},3000);

it('recovers HTTP 400 tool-generation errors with feedback before delivery',async()=>{
 const bodies:any[]=[];const adapter=await startAdapter({port:0,fetchImpl:async(_u:string,o:any)=>{bodies.push(JSON.parse(o.body));return bodies.length===1?new Response(JSON.stringify({error:{code:'tool_use_failed',message:'Tool call validation failed: missing mcp_server'}}),{status:400,headers:{'content-type':'application/json'}}):new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(response.status).toBe(200);expect(await response.text()).toBe('data: [DONE]\n\n');expect(bodies).toHaveLength(2);expect(bodies[1].messages.slice(0,-1)).toEqual(bodies[0].messages);expect(bodies[1].messages.at(-1).content).toContain('mcp_server, tool_name and input');}finally{await adapter.close();}
});
it('does not retry ordinary HTTP 400 request errors',async()=>{
 const upstream=vi.fn(async()=>new Response(JSON.stringify({error:{message:'unsupported parameter'}}),{status:400}));const adapter=await startAdapter({port:0,fetchImpl:upstream});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(response.status).toBe(400);expect(await response.text()).toContain('unsupported parameter');expect(upstream).toHaveBeenCalledTimes(1);}finally{await adapter.close();}
});

it('stops after two HTTP tool regenerations and returns the original error status',async()=>{
 const message=JSON.stringify({error:{code:'tool_use_failed',message:'Tool call validation failed'}});const upstream=vi.fn(async()=>new Response(message,{status:400}));const adapter=await startAdapter({port:0,fetchImpl:upstream});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify(request)});expect(response.status).toBe(400);expect(await response.text()).toBe(message);expect(upstream).toHaveBeenCalledTimes(3);}finally{await adapter.close();}
});

it('optionally lowers output budgets without increasing smaller explicit budgets',()=>{
 expect(normalizeRequest({model:'other',max_tokens:2048},900).max_tokens).toBe(900);expect(normalizeRequest({model:'other',max_tokens:200},900).max_tokens).toBe(200);expect(normalizeRequest({model:'other',max_completion_tokens:2048},900).max_completion_tokens).toBe(900);expect(normalizeRequest({model:'other'},900).max_tokens).toBe(900);expect(()=>normalizeRequest({},0)).toThrow();
});
it('applies the optional account cap to real forwarded requests',async()=>{
 const seen:any[]=[];const adapter=await startAdapter({port:0,maxOutputTokens:900,fetchImpl:async(_u:string,o:any)=>{seen.push(JSON.parse(o.body));return new Response('data: [DONE]\n\n');}});
 try{const response=await fetch(adapter.url+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer dummy'},body:JSON.stringify({...request,max_tokens:2048})});await response.text();expect(seen[0].max_tokens).toBe(900);}finally{await adapter.close();}
});
