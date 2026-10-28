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
import { registerEditorTools } from '../../src/mcp/tools';
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
 if(allowed&&req.relPath.endsWith('.py'))try{execFileSync(process.env.FORGE_PYTHON??'python',['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:req.newText,encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','pipe']});}catch{allowed=false;rejectionReason='Python syntax validation failed; nothing approved.';}
 record.reviews.push({path:req.relPath,rationale:req.rationale,hunks:req.hunks.length,allowed,rejectionReason});await save();
 return allowed&&!signal.aborted?req.hunks.map(h=>h.id):[];
 },
 async confirmCommand(command){record.commands.push({command,allowed:false});await save();return false;},close(){},
 }});
 const client=createClient('http://localhost:8790');
 record.stage='starting MCP';await save();
 const mcp=await startEditorMcpServer(server=>registerEditorTools(server,api));
 try {
 record.stage='registering MCP';await save();
 await registerMcpServer(client,mcp.url,mcp.token);
 record.stage='loading agents';await save();
 const agents=(await loadAgentFiles(path.join(ext.extensionPath,'agents'))).filter(a=>a.name!=='forge-agent-fallback'||!!process.env.FORGE_LIVE_FALLBACK);
 for(const agent of agents)if(agent.name!=='forge-agent-fallback')agent.manifest.model.name=process.env.FORGE_LIVE_MODEL ?? agent.manifest.model.name;
 record.stage='synchronizing agents';record.effectiveModels=agents.map(a=>a.manifest.model.name);await save();
 const synced=await syncAgents(client,agents);if(synced.some(a=>!a.ok))throw new Error(JSON.stringify(synced));
 const controller=new AgentController({getClient:()=>client,approvals,agents:()=>({primary:task==='C'?'forge-audit-invalid':'forge-agent',fallback:task==='C'?'forge-agent':process.env.FORGE_LIVE_FALLBACK}),onRunStart:()=>api.beginRun(),onCancel:()=>api.cancelCommands()});
 let prompt='Reply with a short greeting. Do not edit files or run commands.';
 if(task==='A'||task==='C'){
 const text=(await api.readText(path.join(root,'src/flask/helpers.py')))!;const lines=text.split('\n');const start=lines.findIndex(l=>l.startsWith('def get_debug_flag'));let end=start+1;while(end<lines.length&&!lines[end]!.startsWith('def get_load_dotenv'))end++;
 prompt=buildInlinePrompt('src/flask/helpers.py',start+1,end,lines.slice(start,end).join('\n'),"Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.");
 }else if(task==='B'){
 prompt="Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as \"***\". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.";
 const budget=Number(process.env.FORGE_LIVE_CONTEXT_BUDGET??6000);if(!Number.isFinite(budget)||budget<1||budget>6000)throw Error('FORGE_LIVE_CONTEXT_BUDGET must be between 1 and 6000.');record.contextBudget=budget;
 const context=await assembleContext(prompt,new WorkspaceContextDeps(api,findRg(ext.extensionPath),root),budget);record.context=context;prompt=context.text+'\n\n'+prompt;
 }
 record.stage='running controller';record.prompt=prompt;await save();const timer=setTimeout(()=>void controller.cancel(),task==='B'?900000:300000);
 try{await controller.run(prompt,{textDelta:(_id,t)=>{record.text+=t;},toolCall:n=>{record.tools.push(n);},notice:t=>{record.notices.push({time:Date.now(),text:t});},finished:info=>{record.finished=info;}},task==='A'?'forge-inline':undefined);}finally{clearTimeout(timer);}
 await vscode.workspace.saveAll(false);
 }catch(error){record.error=String(error);record.stack=(error as Error).stack;throw error;}
 finally{record.ended=new Date().toISOString();await save();await mcp.dispose();}
}
