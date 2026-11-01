/** Opt-in provider checks; disposable Flask workspaces only. */
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isScopedInlineProposal } from './reviewPolicy';
import { AgentController } from '../../src/agent/controller';
import { createClient, registerMcpServer } from '../../src/forge/client';
import { loadAgentFiles, syncAgents } from '../../src/forge/agents';
import { startEditorMcpServer } from '../../src/mcp/server';
import { registerEditorTools, resetToolDeduplication } from '../../src/mcp/tools';
import { VsCodeEditorApi, findRg } from '../../src/workspace/vscodeApi';
import { DecisionStore } from '../../src/review/decisions';
import { UndoStack } from '../../src/review/undo';
import { ReviewApprovals } from '../../src/review/approvals';
import { buildInlinePrompt } from '../../src/inline/inlineEdit';
import { assembleContext } from '../../src/context/assemble';
import { WorkspaceContextDeps } from '../../src/context/vscodeDeps';
export async function run(): Promise<void> {
 const root=vscode.workspace.workspaceFolders![0]!.uri.fsPath;
 const output=process.env.FORGE_LIVE_RESULT!;
 const task=process.env.FORGE_LIVE_TASK ?? 'A';
 if(!output||!['A','B','C'].includes(task))throw new Error('Set FORGE_LIVE_RESULT and FORGE_LIVE_TASK=A/B/C in a disposable Flask checkout.');
 const ext=vscode.extensions.getExtension('forge-agent-dev.forge-agent')!;
 const store=new DecisionStore();
 const api=new VsCodeEditorApi(root,findRg(ext.extensionPath),store,new UndoStack());
 const record:any={task,model:process.env.FORGE_LIVE_MODEL,extensionPath:ext.extensionPath,mode:'automated native host, real provider, scoped programmatic hunk review',started:new Date().toISOString(),reviews:[],commands:[],notices:[],tools:[],text:''};
 const save=()=>fs.writeFile(output,JSON.stringify(record,null,2));
 const approvals=new ReviewApprovals({root,store,readText:p=>api.readText(p),ui:{
 async reviewHunks(req,signal) {
 let allowed=task==='A'?req.relPath==='src/flask/helpers.py'&&isScopedInlineProposal(req.oldText,req.newText):task==='B'&&['src/flask/cli.py','tests/test_cli.py','docs/cli.rst'].includes(req.relPath);
 let rejectionReason=allowed?'':task==='C'?'Failure demo deliberately rejects all writes.':'Proposal is outside the allowed file/function scope.';
 if(allowed&&req.relPath.endsWith('.py'))try{execFileSync(process.env.FORGE_PYTHON??'python',['-c',"import ast,sys; ast.parse(sys.stdin.buffer.read().decode('utf-8'))"],{input:req.newText,encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});}catch(err:any){allowed=false;const detail=String(err?.stderr||err?.message||err).trim().split(/\r?\n/).pop()||'syntax error';rejectionReason=`Python syntax validation failed: ${detail}; nothing approved.`;}
 record.reviews.push({path:req.relPath,rationale:req.rationale,hunks:req.hunks.length,allowed,rejectionReason});await save();
 return allowed&&!signal.aborted?req.hunks.map(h=>h.id):[];
 },
 async confirmCommand(command){record.commands.push({command,allowed:false});await save();return false;},close(){},
 }});
 resetToolDeduplication();
 const client=createClient('http://localhost:8790');
 record.stage='starting MCP';await save();
 const mcp=await startEditorMcpServer(server=>registerEditorTools(server,api));
 try {
 record.stage='registering MCP';await save();
 await registerMcpServer(client,mcp.url,mcp.token);
 record.stage='loading agents';await save();
 const agents=(await loadAgentFiles(path.join(ext.extensionPath,'agents'))).filter(a=>a.name!=='forge-agent-fallback'||!!process.env.FORGE_LIVE_FALLBACK||process.env.FORGE_LIVE_PRIMARY==='forge-agent-fallback');
 for(const agent of agents)if(agent.name!=='forge-agent-fallback')agent.manifest.model.name=process.env.FORGE_LIVE_MODEL ?? agent.manifest.model.name;
 const compact=process.env.FORGE_LIVE_COMPACTION_TOKENS;if(compact&&(!Number.isInteger(Number(compact))||Number(compact)<1000||Number(compact)>60000))throw Error('FORGE_LIVE_COMPACTION_TOKENS must be 1000..60000.');
 for(const agent of agents){if(compact){const raw=agent.manifest.config as unknown as {context_management:{compaction:{trigger:{type:string;value:number}}}};raw.context_management.compaction.trigger={type:'input_tokens',value:Number(compact)};}if(process.env.FORGE_LIVE_REASONING_EFFORT)agent.manifest.model.params={...agent.manifest.model.params,reasoning_effort:process.env.FORGE_LIVE_REASONING_EFFORT};}
 record.validationOverrides={compactionTokens:compact,reasoningEffort:process.env.FORGE_LIVE_REASONING_EFFORT};
 record.stage='synchronizing agents';record.effectiveModels=agents.map(a=>a.manifest.model.name);await save();
 const synced=await syncAgents(client,agents);if(synced.some(a=>!a.ok))throw new Error(JSON.stringify(synced));
 const resumeSession=process.env.FORGE_LIVE_REUSE_SESSION==='1'||process.env.FORGE_LIVE_REUSE_SESSION==='true';
 let sessionId=process.env.FORGE_LIVE_SESSION_ID;
 if(!sessionId&&resumeSession){try{const list=await client.sessions.list({limit:10});const target=task==='C'?'forge-audit-invalid':process.env.FORGE_LIVE_PRIMARY??'forge-agent';const ex=list.data?.find((s:any)=>s.agent?.name===target);if(ex)sessionId=ex.id;}catch{}}
 let currentSessionId=sessionId;
 if(sessionId)record.resumedSessionId=sessionId;
 const controller=new AgentController({getClient:()=>client,approvals,agents:()=>({primary:task==='C'?'forge-audit-invalid':process.env.FORGE_LIVE_PRIMARY??'forge-agent',fallback:task==='C'?'forge-agent':process.env.FORGE_LIVE_FALLBACK}),sessionId:()=>currentSessionId,onSessionCreated:(id)=>{currentSessionId=id;record.resumedSessionId=id;},onRunStart:()=>api.beginRun(),onCancel:()=>api.cancelCommands()});
 let prompt='Reply with a short greeting. Do not edit files or run commands.';
 if(task==='A'||task==='C'){
 const text=(await api.readText(path.join(root,'src/flask/helpers.py')))!;const lines=text.split('\n');const start=lines.findIndex(l=>l.startsWith('def get_debug_flag'));let end=start+1;while(end<lines.length&&!lines[end]!.startsWith('def get_load_dotenv'))end++;
 prompt=buildInlinePrompt('src/flask/helpers.py',start+1,end,lines.slice(start,end).join('\n'),"Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.");
 }else if(task==='B'){
 const baseReq="Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as \"***\". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.";
 record.taskRequest=baseReq;
 const budget=Number(process.env.FORGE_LIVE_CONTEXT_BUDGET??2500);if(!Number.isFinite(budget)||budget<1||budget>6000)throw Error('FORGE_LIVE_CONTEXT_BUDGET must be between 1 and 6000.');record.contextBudget=budget;
 const context=await assembleContext(baseReq,new WorkspaceContextDeps(api,findRg(ext.extensionPath),root),budget);record.context=context;
 prompt=process.env.FORGE_LIVE_GUIDANCE ? process.env.FORGE_LIVE_GUIDANCE+'\n\n'+baseReq+'\n\n'+context.text : context.text+'\n\n'+baseReq;
 }
 const timeoutMs=Number(process.env.FORGE_LIVE_TIMEOUT_MS)||(task==='B'?2400000:300000);
 record.stage='running controller';record.primaryAgent=task==='C'?'forge-audit-invalid':process.env.FORGE_LIVE_PRIMARY??'forge-agent';record.prompt=prompt;await save();const timer=setTimeout(()=>void controller.cancel(),timeoutMs);
 try{
  await controller.run(prompt,{textDelta:(_id,t)=>{record.text+=t;},toolCall:n=>{record.tools.push(n);},notice:t=>{record.notices.push({time:Date.now(),text:t});},finished:info=>{record.finished=info;}},task==='A'?'forge-inline':undefined);
  if(task==='B'){
   const targetFiles=['src/flask/cli.py','tests/test_cli.py','docs/cli.rst'];
   const missingFiles=()=>targetFiles.filter(f=>!record.reviews.some((r:any)=>r.allowed&&r.path===f));
   let followUpCount=0;
   while(missingFiles().length>0&&followUpCount<4){
    followUpCount++;
    const pending=missingFiles();
    let followUpPrompt=`You must now call propose_write for each of the following target files in sequence:\n${pending.map(f=>'- '+f).join('\n')}\nExecute propose_write for each file directly with edits: [{old_text, new_text}]. Do not perform redundant reads or searches.`;
     if(process.env.FORGE_LIVE_GUIDANCE)followUpPrompt+='\n\n'+process.env.FORGE_LIVE_GUIDANCE;
    await controller.run(followUpPrompt,{textDelta:(_id,t)=>{record.text+='\n'+t;},toolCall:n=>{record.tools.push(n);},notice:t=>{record.notices.push({time:Date.now(),text:t});},finished:info=>{record.finished=info;}});
   }
  }
 }finally{clearTimeout(timer);}
 await vscode.workspace.saveAll(false);
 }catch(error){record.error=String(error);record.stack=(error as Error).stack;throw error;}
 finally{record.ended=new Date().toISOString();await save();await mcp.dispose();}
}
