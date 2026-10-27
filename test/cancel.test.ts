import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { AgentController } from '../src/agent/controller';
import { ReviewApprovals, type ReviewUi } from '../src/review/approvals';
import { DecisionStore } from '../src/review/decisions';
import { FakeTrueForge, RecordingUi, approvalRequired, created, delta, done, toolMsg } from './fakes';
import { tempRepo } from './helpers';

function build(root: string, ui: ReviewUi, tf: FakeTrueForge) {
  const store = new DecisionStore();
  const approvals = new ReviewApprovals({ root, ui, store, readText: async (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined) });
  const ctl = new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'forge-agent' }), retries: 0, onCancel: () => store.clear() });
  return { store, ctl };
}
const NEW = 'a\nB\nc\n';

describe('cancellation (stage 6)', () => {
  it('cancel mid-stream: stream ends with turn.done(cancelled), message shown, git status clean', async () => {
    const { root, gitStatus } = tempRepo();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const tf = new FakeTrueForge({
      'forge-agent': [async function* () { yield created(); yield delta('m1', 'thinking '); await gate; yield done('cancelled'); } as any],
    });
    tf.cancelHooks.push(() => release()); // server side: cancel makes the stream finish by itself
    const { ctl } = build(root, { reviewHunks: async () => [], confirmCommand: async () => false, close() {} }, tf);
    const ui = new RecordingUi();

    const run = ctl.run('do something', ui);
    await new Promise((r) => setTimeout(r, 20)); // let the stream start
    expect(ui.text).toBe('thinking ');
    await ctl.cancel();
    await run;

    expect(tf.cancels).toEqual(['s1']);
    expect(ui.result).toEqual({ status: 'cancelled', message: 'Cancelled - no changes applied' });
    expect(gitStatus()).toBe('');
  });

  it('cancel while a diff review is pending: review aborted, no approval sent, nothing queued, git clean', async () => {
    const { root, gitStatus } = tempRepo();
    let reviewSignal!: AbortSignal;
    let opened!: () => void;
    const reviewOpened = new Promise<void>(resolve => { opened = resolve; });
    let closed = 0;
    const reviewUi: ReviewUi = {
      reviewHunks: (_req, signal) => new Promise<number[]>((resolve) => { reviewSignal = signal; opened(); signal.addEventListener('abort', () => resolve([])); }),
      confirmCommand: async () => false,
      close: () => { closed++; },
    };
    const tf = new FakeTrueForge({
      'forge-agent': [() => [created(), toolMsg('m1', 'tc1', 'propose_write', { path: 'f.txt', new_content: NEW, rationale: 'r' }), approvalRequired('tc1', 'm1')]],
    });
    const { ctl, store } = build(root, reviewUi, tf);
    const ui = new RecordingUi();

    const run = ctl.run('edit f', ui);
    await reviewOpened;
    expect(reviewSignal.aborted).toBe(false);
    await ctl.cancel();
    await run;

    expect(reviewSignal.aborted).toBe(true);
    expect(closed).toBeGreaterThan(0);          // review UI cleared
    expect(store.size).toBe(0);                 // queued proposals discarded
    expect(tf.inputs.length).toBe(1);           // no approval turn was ever sent
    expect(ui.result?.status).toBe('cancelled');
    expect(ui.result?.message).toBe('Cancelled - no changes applied');
    expect(gitStatus()).toBe('');
  });

  it('is a no-op when idle (idempotent)', async () => {
    const { root } = tempRepo();
    const { ctl } = build(root, { reviewHunks: async () => [], confirmCommand: async () => false, close() {} }, new FakeTrueForge({}));
    await expect(ctl.cancel()).resolves.toBeUndefined();
  });
});


it('Stop during session creation never starts a turn and cancels the late session',async()=>{
  let release!:(v:any)=>void,started!:()=>void;
  const ready=new Promise<void>(r=>started=r);let turns=0;const cancels:string[]=[];
  const client={sessions:{create:()=>{started();return new Promise(r=>release=r);},cancel:async(id:string)=>{cancels.push(id);},createTurnStream:async()=>{turns++;throw Error('must not run');}}} as any;
  const ctl=new AgentController({getClient:()=>client,approvals:{decide:async()=>({status:'allow'}),cancelAll(){}},agents:()=>({primary:'p'}),retries:0});
  const ui=new RecordingUi();const running=ctl.run('x',ui);await ready;await ctl.cancel();release({data:{id:'late'}});await running;
  expect(turns).toBe(0);expect(cancels).toEqual(['late']);expect(ui.result?.status).toBe('cancelled');
});
