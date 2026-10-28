import {it,expect} from 'vitest';
import {materializeWrite} from '../src/review/proposal';
import {ReviewApprovals} from '../src/review/approvals';
import {DecisionStore,proposalKey} from '../src/review/decisions';
import {applyHunks} from '../src/review/hunks';
import * as os from 'node:os';
import * as path from 'node:path';
it('preserves the full-content form and rejects mixed or missing forms',()=>{
 expect(materializeWrite(undefined,{new_content:'new'})).toBe('new');
 for(const args of [{},{new_content:'new',edits:[]},{new_content:null}])expect(()=>materializeWrite('old',args)).toThrow();
});
it('edits unique anchors while preserving unread content and CRLF',()=>{
 const old='header\r\nvalue = 1\r\nunrelated\r\nfooter\r\n';
 expect(materializeWrite(old,{edits:[{old_text:'value = 1\n',new_text:'value = 2\n'}]})).toBe('header\r\nvalue = 2\r\nunrelated\r\nfooter\r\n');
});
it('fails closed on missing, ambiguous or empty anchors and absent files',()=>{
 for(const old_text of ['','missing','a'])expect(()=>materializeWrite('a a',{edits:[{old_text,new_text:'b'}]})).toThrow();
 expect(()=>materializeWrite(undefined,{edits:[{old_text:'a',new_text:'b'}]})).toThrow();
 expect(()=>materializeWrite('a',{edits:[]})).toThrow();
});
it('handles sequential exact edits and deletion without changing other text',()=>{
 expect(materializeWrite('a\nb\nc\n',{edits:[{old_text:'a',new_text:'A'},{old_text:'b\n',new_text:''}]})).toBe('A\nc\n');
});
it('stores only reviewed exact-edit hunks as a single-use candidate permit',async()=>{
 const store=new DecisionStore(),root=os.tmpdir();const old='a\nb\nc\nd\ne\n';
 const args={path:'exact.txt',edits:[{old_text:'a',new_text:'A'},{old_text:'e',new_text:'E'}]};
 const approvals=new ReviewApprovals({root,store,readText:async()=>old,ui:{reviewHunks:async r=>{expect(r.hunks).toHaveLength(2);return [1];},confirmCommand:async()=>false,close(){}}});
 expect((await approvals.decide({name:'propose_write',args},new AbortController().signal)).status).toBe('allow');
 const key=proposalKey(path.join(root,'exact.txt'),materializeWrite(old,args));const decision=store.take(key)!;
 expect(applyHunks(decision.baseText,decision.newText,new Set(decision.acceptedHunks))).toBe('A\nb\nc\nd\ne\n');expect(store.take(key)).toBeUndefined();
 expect(proposalKey(path.join(root,'exact.txt'),materializeWrite('Z\n'+old,args))).not.toBe(key);
});
it('does not store exact-edit decisions after Stop or when an anchor is ambiguous',async()=>{
 const store=new DecisionStore(),abort=new AbortController();
 const approvals=new ReviewApprovals({root:os.tmpdir(),store,readText:async()=> 'a a',ui:{reviewHunks:async()=>{abort.abort();return [1];},confirmCommand:async()=>false,close(){}}});
 expect((await approvals.decide({name:'propose_write',args:{path:'exact.txt',edits:[{old_text:'a',new_text:'b'}]}},abort.signal)).status).toBe('deny');expect(store.size).toBe(0);
 expect((await approvals.decide({name:'propose_write',args:{path:'exact.txt',edits:[{old_text:'a a',new_text:'b'}]}},abort.signal)).status).toBe('deny');expect(store.size).toBe(0);
});
