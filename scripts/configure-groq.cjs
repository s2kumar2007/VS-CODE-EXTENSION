/** Local opt-in provider setup. Credentials come only from the process environment. */
const fs = require('node:fs/promises');
const path = require('node:path');
const GROQ_URL = 'https://api.groq.com/openai/v1';
const MODEL = 'openai/gpt-oss-120b';
async function configureGroq({apiKey,baseUrl='http://localhost:8790',agents,fetchImpl=fetch}) {
 if(!apiKey?.trim())throw new Error('GROQ_API_KEY is missing. Enter it locally; never put it in the repository or chat.');
 const local=new URL(baseUrl);
 if(!['localhost','127.0.0.1','[::1]'].includes(local.hostname)||!['http:','https:'].includes(local.protocol))throw new Error('This helper sends credentials only to a loopback TrueForge server.');
 const request=async(url,options={})=>{
  const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error((url.startsWith(GROQ_URL)?'Groq':'TrueForge')+' request failed (HTTP '+response.status+'). Check credentials, model access and quota locally.');
  return response.status===204?{}:response.json();
 };
 const list=await request(GROQ_URL+'/models',{headers:{Authorization:'Bearer '+apiKey}});
 if(!list.data?.some(m=>m.id===MODEL))throw new Error('Groq account does not expose '+MODEL+'. No TrueForge settings changed.');
 await request(GROQ_URL+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:'Reply OK.'}],max_completion_tokens:256,reasoning_effort:'low'})});
 const providers=await request(baseUrl+'/api/v1/settings/model-providers');
 const existing=providers.data.find(p=>p.name==='groq');
 if(existing&&(existing.manifest.type!=='custom'||existing.manifest.base_url!==GROQ_URL))throw new Error('A different provider named groq already exists. It was not overwritten.');
 const manifest={type:'custom',name:'groq',base_url:GROQ_URL,auth:{api_key:apiKey},models:[...(existing?.manifest.models||[]).filter(m=>m.name!=='gpt-oss-120b'),{name:'gpt-oss-120b',model_id:MODEL,properties:{}}]};
 await request(baseUrl+'/api/v1/settings/model-providers',{method:existing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest})});
 const registered=await request(baseUrl+'/api/v1/agents?limit=100');
 for(const agent of agents){
  const current=registered.data.find(a=>a.name===agent.name);
  const payload=current?{description:agent.description,manifest:agent.manifest}:agent;
  await request(baseUrl+'/api/v1/agents'+(current?'/'+current.id:''),{method:current?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 }
 return 'Groq generation verified. Primary/inline remain Gemini; fallback is groq/gpt-oss-120b. Reload the extension.';
}
module.exports={configureGroq};
if(require.main===module)(async()=>{
 const root=path.resolve(__dirname,'..');
 const names=(await fs.readdir(path.join(root,'agents'))).filter(n=>n.endsWith('.json'));
 const agents=await Promise.all(names.map(n=>fs.readFile(path.join(root,'agents',n),'utf8').then(JSON.parse)));
 console.log(await configureGroq({apiKey:process.env.GROQ_API_KEY,baseUrl:process.argv[2]||'http://localhost:8790',agents}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
