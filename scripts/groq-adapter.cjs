/** Groq HTTP compatibility only. TrueForge owns sessions, tools and approvals. */
const http = require('node:http');
const {once} = require('node:events');
const UPSTREAM='https://api.groq.com/openai/v1';
function normalizeRequest(body){
 const result={...body};
 if(Array.isArray(body.messages))result.messages=body.messages.map(message=>{
  if(message.role!=='assistant')return message;
  const {reasoning_content,reasoning,...rest}=message;
  return rest;
 });
 if(typeof body.model==='string'&&body.model.startsWith('openai/gpt-oss-')){
  delete result.reasoning_format;
  result.include_reasoning=false;
 }
 return result;
}
function quotaWait(text,header,now=Date.now()){
 if(header){const n=Number(header);if(Number.isFinite(n))return Math.max(0,Math.min(60000,Math.ceil(n*1000)+250));const date=Date.parse(header);if(Number.isFinite(date))return Math.max(0,Math.min(60000,date-now+250));}
 const match=/(?:retry|try\s+again)\s+in\s+(\d+(?:\.\d+)?)s\b/i.exec(text);
 return match?Math.min(60000,Math.ceil(Number(match[1])*1000)+250):2000;
}
function wait(ms,signal){return new Promise((resolve,reject)=>{
 const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new Error('Cancelled'));};
 const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
});}
async function forwardStream(upstream,res,signal,canRegenerate){
 const eventStream=(upstream.headers.get('content-type')||'').includes('text/event-stream');
 let pending=[],bytes=0,scan='',sent=false;const decoder=new TextDecoder();
 const write=async chunk=>{if(!res.headersSent)res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json','Cache-Control':'no-cache'});if(!res.write(Buffer.from(chunk)))await once(res,'drain',{signal});};
 const flush=async()=>{for(const chunk of pending)await write(chunk);pending=[];bytes=0;sent=true;};
 if(upstream.body)for await(const chunk of upstream.body){
  if(signal.aborted)break;
  if(!eventStream||sent){await write(chunk);continue;}
  pending.push(chunk);bytes+=chunk.byteLength;scan+=decoder.decode(chunk,{stream:true});
  const frames=scan.split(/\r?\n\r?\n/);scan=frames.pop();
  for(const frame of frames){
   const data=frame.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
   if(!data||data==='[DONE]')continue;
   let event;try{event=JSON.parse(data);}catch{continue;}
   const error=typeof event.error==='string'?event.error:event.error?.message;
   if(!sent&&canRegenerate&&typeof error==='string'&&/Failed to parse tool call arguments as JSON|Invalid tool call generated|Tool call validation failed/i.test(error))return {regenerate:true};
   if(event.choices?.some(c=>typeof c.delta?.content==='string'&&c.delta.content.length))await flush();
  }
  if(bytes>8*1024*1024)await flush();
 }
 if(pending.length)await flush();
 return {regenerate:false};
}
async function startAdapter({port=8791,fetchImpl=fetch,sleep=wait,maxRetries=4,onError=()=>{}}={}){
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({service:'forge-groq-adapter',version:1}));return;}
  if(!['/v1/chat/completions','/v1/models'].includes(url.pathname)||url.search||!['GET','POST'].includes(req.method)){res.writeHead(404);res.end();return;}
  if((url.pathname==='/v1/chat/completions'&&req.method!=='POST')||(url.pathname==='/v1/models'&&req.method!=='GET')){res.writeHead(405);res.end();return;}
  if(!/^Bearer \S+$/i.test(req.headers.authorization||'')){res.writeHead(401);res.end();return;}
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),300000);
  req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  try{
   let body;
   if(req.method==='POST'){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>4*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    try{body=JSON.stringify(normalizeRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{res.writeHead(400);res.end('Invalid JSON');return;}
   }
   for(let attempt=0;;attempt++){
    const upstream=await fetchImpl(UPSTREAM+url.pathname.slice(3),{method:req.method,headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body,signal:abort.signal});
    if(upstream.status===429&&attempt<maxRetries){
     const message=await upstream.text();
     const limits=/Limit\s+(\d+)[\s\S]*?Requested\s+(\d+)/i.exec(message);
     if(!limits||Number(limits[2])<=Number(limits[1])){await sleep(quotaWait(message,upstream.headers.get('retry-after')),abort.signal);continue;}
     res.writeHead(429,{'Content-Type':upstream.headers.get('content-type')||'application/json'});res.end(message);return;
    }
    const forwarded=await forwardStream(upstream,res,abort.signal,attempt<Math.min(maxRetries,2));
    if(forwarded.regenerate){
     const payload=JSON.parse(body);payload.temperature=Math.max(0,Number(payload.temperature??0.2)-0.1);
     const required=(payload.tools||[]).filter(t=>t.type==='function').map(t=>t.function.name+': '+(t.function.parameters?.required||[]).join(', ')).join('; ').slice(0,4000);
     payload.messages=[...(payload.messages||[]),{role:'system',content:'The preceding tool generation was rejected before delivery. Continue the original user task. Generate valid JSON matching the exposed tool schema, including every required field. Required top-level fields by function: '+required+'. For call_tool, include mcp_server, tool_name and input; editor parameters belong inside input.'}];
     body=JSON.stringify(payload);continue;
    }
    if(!res.headersSent)res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json'});res.end();return;
   }
  }catch(error){
   onError(error);
   if(!res.headersSent&&!res.destroyed){res.writeHead(abort.signal.aborted?499:502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:abort.signal.aborted?'Groq request cancelled or timed out.':'Groq connection failed.'}}));}
   else if(!res.destroyed)res.destroy();
  }finally{clearTimeout(timeout);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {server,url:'http://127.0.0.1:'+server.address().port+'/v1',close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
module.exports={normalizeRequest,quotaWait,startAdapter};
if(require.main===module)startAdapter().then(a=>console.log('Groq compatibility adapter: '+a.url)).catch(e=>{console.error('Groq adapter could not start: '+e.code);process.exitCode=1;});
