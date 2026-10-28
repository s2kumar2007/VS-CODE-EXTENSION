import { describe, it, expect } from 'vitest';
import { runWithFallback, ForgeFailure, CancelledError } from '../src/agent/resilience';
import { AgentController } from '../src/agent/controller';
import { ReviewApprovals } from '../src/review/approvals';
import { DecisionStore } from '../src/review/decisions';
import { FakeTrueForge, RecordingUi, created, delta, done, errorDone, toolMsg, approvalRequired } from './fakes';
import { tempRepo } from './helpers';

const opts = (attempt: (a: string) => Promise<string>, extra = {}) => {
  const sleeps: number[] = [];
  return { sleeps, o: { primary: 'p', fallback: 'f', retries: 2, backoffMs: 1000, sleep: async (ms: number) => { sleeps.push(ms); }, attempt, isCancelled: () => false, ...extra } };
};

describe('runWithFallback', () => {
  it('returns the primary result without touching the fallback', async () => {
    const calls: string[] = [];
    const { o } = opts(async (a) => { calls.push(a); return 'ok'; });
    expect(await runWithFallback(o)).toBe('ok');
    expect(calls).toEqual(['p']);
  });
  it('retries with exponential backoff (1s, 2s) then succeeds', async () => {
    let n = 0;
    const { o, sleeps } = opts(async () => { if (++n < 3) throw new Error('503'); return 'ok'; });
    expect(await runWithFallback(o)).toBe('ok');
    expect(sleeps).toEqual([1000, 2000]);
  });
  it('after 1+2 failed tries on primary switches to the fallback once and notifies', async () => {
    const calls: string[] = [];
    let notified = 0;
    const { o } = opts(async (a) => { calls.push(a); if (a === 'p') throw new Error('network'); return 'from-fallback'; }, { onFallback: () => notified++ });
    expect(await runWithFallback(o)).toBe('from-fallback');
    expect(calls).toEqual(['p', 'p', 'p', 'f']);
    expect(notified).toBe(1);
  });
  it('throws ONE clear ForgeFailure (no stack text) when both fail', async () => {
    const { o } = opts(async () => { throw new Error('boom\n    at stack line'); });
    const err = await runWithFallback(o).catch((e) => e);
    expect(err).toBeInstanceOf(ForgeFailure);
    expect(err.message).toBe('Both the primary and fallback models failed (boom).');
  });
  it('does not retry once cancelled', async () => {
    let n = 0;
    const { o } = opts(async () => { n++; throw new Error('x'); }, { isCancelled: () => n >= 1 });
    await expect(runWithFallback(o)).rejects.toBeInstanceOf(CancelledError);
    expect(n).toBe(1);
  });
});

describe('controller resilience (stage 7)', () => {
  const build = (root: string, tf: FakeTrueForge) => {
    const approvals = new ReviewApprovals({ root, ui: { reviewHunks: async () => [], confirmCommand: async () => false, close() {} }, store: new DecisionStore(), readText: async () => undefined });
    return new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'forge-agent', fallback: 'forge-agent-fallback' }), retries: 2, backoffMs: 1, sleep: async () => {} });
  };

  it('network errors on the primary -> fallback agent answers in a NEW session; non-blocking notice; workspace untouched', async () => {
    const { root, gitStatus } = tempRepo();
    const boom = () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8790'); };
    const tf = new FakeTrueForge({ 'forge-agent': [boom, boom, boom], 'forge-agent-fallback': [() => [created(), delta('m1', 'fallback answer'), done()]] });
    const ui = new RecordingUi();
    await build(root, tf).run('hello', ui);
    expect(ui.notices).toContain('Primary model failed, using fallback');
    expect(ui.text).toBe('fallback answer');
    expect(ui.result?.status).toBe('done');
    expect(new Set(tf.sessions.values())).toEqual(new Set(['forge-agent', 'forge-agent-fallback']));
    expect(tf.inputs.at(-1)![0]).toEqual(tf.inputs[0]![0]); // same request re-sent
    expect(gitStatus()).toBe('');
  });

  it('turn.done status=error counts as a failure too', async () => {
    const { root } = tempRepo();
    const tf = new FakeTrueForge({ 'forge-agent': [() => [created(), errorDone('429 rate limited')], () => [created(), errorDone('429')], () => [created(), done()]] });
    const ui = new RecordingUi();
    await build(root, tf).run('hello', ui);
    expect(ui.result?.status).toBe('done');
    expect(ui.notices.some((n) => n.includes('Primary model failed'))).toBe(false); // recovered by retry
  });

  it('both models fail -> one clear message, no stack trace, git status clean', async () => {
    const { root, gitStatus } = tempRepo();
    const boom = () => { throw new Error('401 Unauthorized: invalid api key\n    at fetch (node:internal)'); };
    const tf = new FakeTrueForge({ 'forge-agent': [boom, boom, boom], 'forge-agent-fallback': [boom, boom, boom] });
    const ui = new RecordingUi();
    await build(root, tf).run('hello', ui);
    expect(ui.result?.status).toBe('error');
    expect(ui.result?.message).toBe('Both the primary and fallback models failed (401 Unauthorized: invalid api key). No changes were made to your workspace.');
    expect(ui.result?.message).not.toContain('at fetch');
    expect(gitStatus()).toBe('');
  });
});


describe('fault matrix', () => {
  it.each(['401 Unauthorized', 'connect ECONNREFUSED', '429 rate limited', 'malformed event', 'SSE drop', 'turn error'])('recovers from %s with backoff then a fresh fallback session',async(reason)=>{
    const { root,gitStatus }=tempRepo();
    const fail=()=>{throw Error(reason+'\n at private stack');};
    const tf=new FakeTrueForge({p:[fail,fail,fail],f:[()=>[created(),done()]]});
    const sleeps:number[]=[];
    const ctl=new AgentController({getClient:()=>tf.client,approvals:{decide:async()=>({status:'deny',reason:'no'}),cancelAll(){}},agents:()=>({primary:'p',fallback:'f'}),sleep:async ms=>{sleeps.push(ms);}});
    const ui=new RecordingUi();await ctl.run('test',ui);
    expect(sleeps).toEqual([1000,2000]);expect(ui.result?.status).toBe('done');expect(gitStatus()).toBe('');
  });
  it('retries setup on the next request after activation was offline',async()=>{
    let setup=0;const tf=new FakeTrueForge({p:[()=>[created(),done()]]});
    const ctl=new AgentController({getClient:()=>tf.client,prepare:async()=>{if(++setup===1)throw Error('offline');},approvals:{decide:async()=>({status:'allow'}),cancelAll(){}},agents:()=>({primary:'p'}),retries:0});
    const first=new RecordingUi();await ctl.run('a',first);expect(first.result?.status).toBe('error');
    const second=new RecordingUi();await ctl.run('b',second);expect(second.result?.status).toBe('done');expect(setup).toBe(2);
  });
  it('never replays an attempt after a write approval',async()=>{
    const calls:string[]=[];const {o}=opts(async a=>{calls.push(a);throw Error('drop after write');},{canRetry:()=>false});
    await expect(runWithFallback(o)).rejects.toThrow('automatic replay was skipped');expect(calls).toEqual(['p']);
  });
});


it('does not replay an approved command or claim an unchanged workspace on uncertain completion',async()=>{
  const tf=new FakeTrueForge({p:[()=>[created(),toolMsg('m','tc','run_command',{command:'npm test'}),approvalRequired('tc','m'),done()],()=>{throw Error('drop after approval');}],f:[()=>[created(),done()]]});
  const ctl=new AgentController({getClient:()=>tf.client,approvals:{decide:async()=>({status:'allow'}),cancelAll(){}},agents:()=>({primary:'p',fallback:'f'}),retries:2,sleep:async()=>{}});
  const ui=new RecordingUi();await ctl.run('run tests',ui);
  expect(ui.result?.status).toBe('error');expect(ui.result?.message).toContain('may have completed');
  expect(ui.result?.message).not.toContain('No changes were made');expect(tf.sessions.size).toBe(1);
});

it('honors a quota retry hint before replaying an unapproved request', async () => {
 let elapsed=0, attempts=0;
 const {o}=opts(async()=>{attempts++;if(elapsed<39000)throw new Error('Request failed (429): Please retry in 38.976679664s.');return 'ok';},{sleep:async(ms:number)=>{elapsed+=ms;}});
 expect(await runWithFallback(o)).toBe('ok');expect(attempts).toBe(2);expect(elapsed).toBeGreaterThanOrEqual(39000);expect(elapsed).toBeLessThanOrEqual(60000);
});
it('caps excessive quota hints and preserves backoff for other failures',async()=>{
 let n=0;const quota=opts(async()=>{if(++n===1)throw new Error('429 Please retry in 3600s.');return 'ok';});
 expect(await runWithFallback(quota.o)).toBe('ok');expect(quota.sleeps).toEqual([60000]);
 let m=0;const ordinary=opts(async()=>{if(++m<3)throw new Error('503 Please retry in 60s.');return 'ok';});
 expect(await runWithFallback(ordinary.o)).toBe('ok');expect(ordinary.sleeps).toEqual([1000,2000]);
});
it('Stop interrupts provider-directed backoff before another session starts',async()=>{
 const {root}=tempRepo();const tf=new FakeTrueForge({p:[()=>[created(),errorDone('429 Please retry in 60s.')]]});
 let retrying!:()=>void;const retryStarted=new Promise<void>(resolve=>{retrying=resolve;});
 const ui=new RecordingUi();const original=ui.notice.bind(ui);ui.notice=text=>{original(text);if(text.includes('retrying'))retrying();};
 const approvals=new ReviewApprovals({root,ui:{reviewHunks:async()=>[],confirmCommand:async()=>false,close(){}},store:new DecisionStore(),readText:async()=>undefined});
 const ctl=new AgentController({getClient:()=>tf.client,approvals,agents:()=>({primary:'p'})});
 const running=ctl.run('hello',ui);await retryStarted;await ctl.cancel();await running;
 expect(ui.result?.status).toBe('cancelled');expect(tf.inputs).toHaveLength(1);
},2000);

it('honors Groq try-again quota wording before retrying',async()=>{
 let n=0;const retry=opts(async()=>{if(++n===1)throw new Error('429 Please try again in 23.5s.');return 'ok';});
 expect(await runWithFallback(retry.o)).toBe('ok');expect(retry.sleeps).toEqual([23750]);
});
