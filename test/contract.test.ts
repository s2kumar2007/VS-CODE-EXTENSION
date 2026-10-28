import { describe, it, expect } from 'vitest';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import { registerMcpServer } from '../src/forge/client';
import { loadAgentFiles, syncAgents } from '../src/forge/agents';
import { runTurn, describeToolCall } from '../src/forge/turnRunner';
import { FakeTrueForge, created, toolMsg, approvalRequired, done } from './fakes';

describe('TrueForge wire contract', () => {
  it('serializes registration, header auth, agent create/update and approval selectors', async () => {
    const requests: { url: string; method: string; body: any }[] = [];
    let existing = false;
    const client = new TrueForge({ baseUrl: 'http://contract.test', fetch: async (url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url: String(url), method: init?.method ?? 'GET', body });
      if (init?.method === 'GET') return Response.json({ data: existing ? [{ id: 'agent-id', name: 'forge-agent' }] : [], pagination: {} });
      return Response.json({ data: { id: 'agent-id', name: 'forge-agent' } });
    }});
    await registerMcpServer(client, 'http://127.0.0.1:1234/mcp', 'secret');
    expect(requests[0]?.url).toBe('http://contract.test/api/v1/settings/mcp-servers');
    expect(requests[0]?.method).toBe('PUT');
    expect(requests[0]?.body.manifest.auth).toEqual({ type: 'header', headers: { Authorization: 'Bearer secret' } });
    const agents = (await loadAgentFiles('agents')).filter(a => a.name === 'forge-agent');
    expect((await syncAgents(client, agents))[0]?.ok).toBe(true);
    const create = requests.find(r => r.method === 'POST')!;
    expect(create.url).toBe('http://contract.test/api/v1/agents');
    expect(create.body.manifest.mcp_servers[0].require_approval_for_tools).toContain('propose_write');
    expect(create.body.manifest.mcp_servers[0].preload).toBe(true);
    expect(create.body.manifest.config.dynamic_sub_agents.enabled).toBe(true);
    existing = true;
    expect((await syncAgents(client, agents))[0]?.ok).toBe(true);
    expect(requests.at(-1)?.url).toBe('http://contract.test/api/v1/agents/agent-id');
    expect(requests.at(-1)?.method).toBe('PUT');
  });
  it('keeps approvals after terminal done and uses approval owner thread and source event', async () => {
    const message = toolMsg('source', 'call', 'propose_write', { path: 'a', new_content: 'b' });
    const pending = { ...approvalRequired('call', 'source'), threadId: 'child-thread' };
    const tf = new FakeTrueForge({ p: [() => [created(), message, pending, done()]] });
    const { data: session } = await tf.client.sessions.create({ agent: { name: 'p' } });
    const result = await runTurn(tf.client, session.id, [{ type: 'user.message', content: 'x' }], { onTextDelta() {}, onToolCall() {} });
    expect(result.status).toBe('paused');
    expect(result.approvals).toEqual([{ toolCallId: 'call', threadId: 'child-thread', sourceEventId: 'source' }]);
    expect(describeToolCall(result.events, result.approvals[0]!)?.args.path).toBe('a');
  });
});


it('rejects a malformed event envelope instead of treating it as successful output',async()=>{
  const tf=new FakeTrueForge({p:[()=>[{}]]});
  const {data:s}=await tf.client.sessions.create({agent:{name:'p'}});
  await expect(runTurn(tf.client,s.id,[],{onTextDelta(){},onToolCall(){}})).rejects.toThrow('invalid event');
});


it('uses the real SDK SSE decoder and serializes session, turns and cancel correctly',async()=>{
  const requests:{url:string;body:any}[]=[];
  const client=new TrueForge({baseUrl:'http://wire.test',maxRetries:0,fetch:async(url,init)=>{
    requests.push({url:String(url),body:init?.body?JSON.parse(String(init.body)):undefined});
    if(String(url).endsWith('/turns')) return new Response('id: 1\ndata: '+JSON.stringify({type:'turn.done',id:'e',thread_id:null,created_at:'x',state:{status:'done',completed_at:'x',output:null,required_actions:[]}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
    return Response.json({data:{id:'sess'}});
  }});
  const {data:s}=await client.sessions.create({agent:{name:'p'}});
  expect((await runTurn(client,s.id,[{type:'user.message',content:'x'}],{onTextDelta(){},onToolCall(){}})).status).toBe('done');
  await client.sessions.cancel(s.id,{});
  expect(requests.map(r=>r.url)).toEqual(['http://wire.test/api/v1/sessions','http://wire.test/api/v1/sessions/sess/turns','http://wire.test/api/v1/sessions/sess/cancel']);
  expect(requests[0]?.body.agent).toEqual({name:'p'});
  expect(requests[1]?.body).toMatchObject({stream:true,input:[{type:'user.message',content:'x'}]});
});


it('does not open approval review when SSE ends before a terminal event',async()=>{
  const tf=new FakeTrueForge({p:[()=>[created(),toolMsg('m','tc','propose_write',{path:'a',new_content:'b'}),approvalRequired('tc','m')]]});
  const {data:s}=await tf.client.sessions.create({agent:{name:'p'}});
  const result=await runTurn(tf.client,s.id,[],{onTextDelta(){},onToolCall(){}});
  expect(result.status).toBe('unknown');expect(result.approvals).toEqual([]);
});

it('unwraps deferred editor approvals without trusting other MCP servers or malformed inputs',async()=>{
 const message=toolMsg('source','call','call_tool',{mcp_server:'forge-editor',tool_name:'propose_write',input:{path:'a.py',new_content:'new',rationale:'change'}});
 message.toolCalls[0]!.toolInfo={type:'truefoundry-system',name:'call_tool'} as any;
 const tf=new FakeTrueForge({p:[()=>[created(),message,approvalRequired('call','source'),done()]]});const {data:s}=await tf.client.sessions.create({agent:{name:'p'}});
 const result=await runTurn(tf.client,s.id,[],{onTextDelta(){},onToolCall(){}});
 expect(describeToolCall(result.events,result.approvals[0]!)).toEqual({name:'propose_write',args:{path:'a.py',new_content:'new',rationale:'change'}});
 message.toolCalls[0]!.function.arguments=JSON.stringify({mcp_server:'outside',tool_name:'propose_write',input:{path:'a'}});
 expect(describeToolCall(result.events,result.approvals[0]!)).toBeUndefined();
 for(const bad of ['null','[]',JSON.stringify({mcp_server:'forge-editor',tool_name:'propose_write',input:null})]){message.toolCalls[0]!.function.arguments=bad;expect(describeToolCall(result.events,result.approvals[0]!)).toBeUndefined();}
});
it('reports a tool streamed only as indexed fragments exactly once',async()=>{
 const tc=toolMsg('source','call','propose_write',{}).toolCalls[0]!;
 const chunks=[{type:'model.message.delta',id:'source',threadId:'main',toolCalls:[{...tc,index:0,function:{name:'propose_write',arguments:'{"path":'}}]},{type:'model.message.delta',id:'source',threadId:'main',toolCalls:[{index:0,function:{arguments:'"a"}'}}]}];
 const tf=new FakeTrueForge({p:[()=>[created(),...chunks,approvalRequired('call','source'),done()]]});const {data:s}=await tf.client.sessions.create({agent:{name:'p'}});const calls:string[]=[];
 const result=await runTurn(tf.client,s.id,[],{onTextDelta(){},onToolCall:n=>calls.push(n)});
 expect(calls).toEqual(['propose_write']);expect(describeToolCall(result.events,result.approvals[0]!)?.args).toEqual({path:'a'});
});
it('does not claim completion when a client-side tool response is still required',async()=>{
 const tf=new FakeTrueForge({p:[()=>[created(),{type:'tool.response_required',id:'question',threadId:'main',toolCalls:[{id:'q',sourceEventId:'m'}]},done()]]});const {data:s}=await tf.client.sessions.create({agent:{name:'p'}});
 const result=await runTurn(tf.client,s.id,[],{onTextDelta(){},onToolCall(){}});expect(result.status).toBe('error');expect(result.error).toContain('unsupported client-side tool response');
});
