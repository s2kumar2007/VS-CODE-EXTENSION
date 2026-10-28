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
