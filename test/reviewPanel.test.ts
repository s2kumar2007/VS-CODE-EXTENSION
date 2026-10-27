import { describe,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({hidden:undefined as undefined|(()=>void),disposed:0}));
vi.mock('vscode',()=>({window:{createQuickPick:()=>({title:'',placeholder:'',items:[],selectedItems:[],onDidAccept(){},onDidHide(fn:()=>void){state.hidden=fn;},show(){},dispose(){state.disposed++;}})}}));
vi.mock('../src/review/proposalProvider',()=>({closeProposalTabs:async()=>{}}));
import { ReviewPanel } from '../src/review/ReviewPanel';
it('Stop dismisses command confirmation and denies without waiting for user input',async()=>{
  const panel=new ReviewPanel({} as any,{} as any,'');
  const abort=new AbortController();
  const pending=panel.confirmCommand('npm test',abort.signal);
  abort.abort();expect(await pending).toBe(false);expect(state.disposed).toBe(1);
});
