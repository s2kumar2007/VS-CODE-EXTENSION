import { describe,it,expect,vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
vi.mock('vscode',()=>({workspace:{getConfiguration:()=>({get:(_k:string,d:unknown)=>d}),createFileSystemWatcher:()=>({onDidCreate(){},onDidDelete(){}})},window:{showWarningMessage(){}}}));
import { WorkspaceContextDeps } from '../src/context/vscodeDeps';
import { ChatPanel } from '../src/panel/ChatPanel';

describe('context host boundaries',()=>{
  it('does not read through a workspace symlink to an outside file',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'ctx-root-'));
    const outside=await fs.mkdtemp(path.join(os.tmpdir(),'ctx-outside-'));
    await fs.writeFile(path.join(outside,'secret.txt'),'private');
    await fs.symlink(outside,path.join(root,'link'),process.platform==='win32'?'junction':'dir');
    const read=vi.fn(async()=> 'private');
    const deps=new WorkspaceContextDeps({readText:read} as any,'rg',root);
    expect(await deps.readText('link/secret.txt')).toBeUndefined();expect(read).not.toHaveBeenCalled();
  });
  it('stops during retrieval and rejects overlapping sends before controller starts',async()=>{
    let release!:(files:string[])=>void;
    const list=vi.fn(()=>new Promise<string[]>(r=>release=r));
    const panel=Object.create(ChatPanel.prototype) as any;
    panel.controller={busy:false,run:vi.fn()};panel.post=vi.fn();panel.sending=false;
    panel.deps={listFiles:list,searchKeyword:async()=>[],searchImporters:async()=>[],readText:async()=>undefined,findSymbol:async()=>undefined};
    const pending=panel.send('config');await panel.send('overlap');
    expect(list).toHaveBeenCalledTimes(1);panel.sendAbort.abort();release([]);await pending;
    expect(panel.controller.run).not.toHaveBeenCalled();expect(panel.post).toHaveBeenCalledWith(expect.objectContaining({type:'done',status:'cancelled'}));
  });
  it('automatically includes retrieved context and its reasons in agent mode',async()=>{
    const panel=Object.create(ChatPanel.prototype) as any;
    panel.controller={busy:false,run:vi.fn(async()=>{})};panel.post=vi.fn();panel.sending=false;
    panel.deps={listFiles:async()=>['src/config.py'],searchKeyword:async()=>[{path:'src/config.py',line:1,text:'def config():'}],searchImporters:async()=>[],readText:async()=> 'def config():\n  return 1\n',findSymbol:async()=>undefined};
    await panel.send('fix config');
    expect(panel.controller.run.mock.calls[0][0]).toContain('src/config.py');
    expect(panel.post).toHaveBeenCalledWith(expect.objectContaining({type:'context',items:expect.arrayContaining([expect.objectContaining({reason:expect.stringContaining('config')})])}));
  });
});
