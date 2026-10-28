import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {configureGroq}=createRequire(import.meta.url)('../scripts/configure-groq.cjs');
const agent={name:'forge-agent-fallback',description:'Fallback',manifest:{model:{name:'groq/gpt-oss-120b'}}};
const ok=(body:any)=>({ok:true,status:200,json:async()=>body});
function wire(providers:any[]=[],registered:any[]=[]){
 const calls:any[]=[];
 const fetchImpl=vi.fn(async(url:string,options:any={})=>{
  calls.push({url,...options});
  if(url.endsWith('/models'))return ok({data:[{id:'openai/gpt-oss-120b'}]});
  if(url.endsWith('/chat/completions'))return ok({choices:[{message:{content:'OK'}}]});
  if(url.endsWith('/settings/model-providers')&&!options.method)return ok({data:providers});
  if(url.endsWith('/agents?limit=100'))return ok({data:registered});
  return ok({});
 });
 return {calls,fetchImpl};
}
it('requires a local key and loopback TrueForge before making requests',async()=>{
 const fetchImpl=vi.fn();
 await expect(configureGroq({apiKey:'',agents:[agent],fetchImpl})).rejects.toThrow('GROQ_API_KEY');
 await expect(configureGroq({apiKey:'test-only',baseUrl:'https://outside.example',agents:[agent],fetchImpl})).rejects.toThrow('loopback');
 expect(fetchImpl).not.toHaveBeenCalled();
});
it('does not configure TrueForge when Groq rejects authentication',async()=>{
 const fetchImpl=vi.fn(async(_url:string)=>({ok:false,status:401}));
 await expect(configureGroq({apiKey:'test-only',agents:[agent],fetchImpl})).rejects.toThrow('Groq request failed (HTTP 401)');
 expect(fetchImpl).toHaveBeenCalledTimes(1);
 expect(fetchImpl.mock.calls[0]![0]).toContain('api.groq.com');
});
it('verifies generation before adding Groq and synchronizing fallback',async()=>{
 const {calls,fetchImpl}=wire();
 await configureGroq({apiKey:'test-only',agents:[agent],fetchImpl});
 expect(calls[1].url).toContain('/chat/completions');
 const provider=calls.find(c=>c.url.endsWith('/settings/model-providers')&&c.method);
 expect(JSON.parse(provider.body).manifest).toMatchObject({type:'custom',name:'groq',base_url:'https://api.groq.com/openai/v1',auth:{api_key:'test-only'},models:[{name:'gpt-oss-120b',model_id:'openai/gpt-oss-120b'}]});
 const saved=calls.find(c=>c.url.endsWith('/agents')&&c.method==='POST');
 expect(JSON.parse(saved.body).manifest.model.name).toBe('groq/gpt-oss-120b');
});
it('does not overwrite a conflicting provider named groq',async()=>{
 const {calls,fetchImpl}=wire([{name:'groq',manifest:{type:'custom',base_url:'https://different.example'}}]);
 await expect(configureGroq({apiKey:'test-only',agents:[agent],fetchImpl})).rejects.toThrow('not overwritten');
 expect(calls.filter(c=>c.url.includes('localhost')&&c.method)).toHaveLength(0);
});
it('updates an existing fallback by registry id and preserves unrelated Groq models',async()=>{
 const {calls,fetchImpl}=wire([{name:'groq',manifest:{type:'custom',base_url:'https://api.groq.com/openai/v1',models:[{name:'other',model_id:'other',properties:{}}]}}],[{name:agent.name,id:'existing-id'}]);
 await configureGroq({apiKey:'test-only',agents:[agent],fetchImpl});
 const provider=calls.find(c=>c.url.endsWith('/settings/model-providers')&&c.method==='PUT');
 expect(JSON.parse(provider.body).manifest.models.map((m:any)=>m.name)).toEqual(['other','gpt-oss-120b']);
 const update=calls.find(c=>c.url.endsWith('/agents/existing-id'));
 expect(update.method).toBe('PUT');expect(JSON.parse(update.body)).not.toHaveProperty('name');
});
