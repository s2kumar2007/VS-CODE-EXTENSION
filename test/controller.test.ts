import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentController } from '../src/agent/controller';
import { ReviewApprovals, type ReviewUi } from '../src/review/approvals';
import { DecisionStore, proposalKey } from '../src/review/decisions';
import { applyHunks } from '../src/review/hunks';
import { FakeTrueForge, RecordingUi, approvalRequired, created, delta, done, toolMsg, toolResponseRequired } from './fakes';

const OLD = 'a\nb\nc\nd\ne\nf\n';
const NEW = 'a\nB\nc\nd\ne\nF\n';

function setup(acceptIds: number[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctl-'));
  const file = path.join(root, 'f.txt');
  fs.writeFileSync(file, OLD);
  const store = new DecisionStore();
  const ui: ReviewUi = { reviewHunks: async () => acceptIds, confirmCommand: async () => true, close() {} };
  const approvals = new ReviewApprovals({ root, ui, store, readText: async (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined) });
  return { root, file, store, approvals };
}

describe('approval loop (propose_write)', () => {
  it('resumes with a pure user.tool_approval turn and applies ONLY accepted hunks', async () => {
    const { root, file, store, approvals } = setup([1]); // accept hunk 1 (b->B), reject hunk 2 (f->F)
    const tf = new FakeTrueForge({
      'forge-agent': [
        () => [created(), delta('m1', 'Planning... '), toolMsg('m1', 'tc1', 'propose_write', { path: 'f.txt', new_content: NEW, rationale: 'r' }), approvalRequired('tc1', 'm1'), done()],
        (input) => {
          // This is what the MCP propose_write handler does once TrueForge executes the allowed call.
          const d = store.take(proposalKey(file, NEW));
          if (!d) throw new Error('handler would refuse: no decision');
          fs.writeFileSync(file, applyHunks(d.baseText, d.newText, new Set(d.acceptedHunks)));
          return [created(), delta('m2', 'Done.'), done()];
        },
      ],
    });
    const ctl = new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'forge-agent' }), retries: 0 });
    const ui = new RecordingUi();
    await ctl.run('change things', ui);

    expect(ui.result?.status).toBe('done');
    expect(ui.text).toBe('Planning... Done.');
    expect(fs.readFileSync(file, 'utf8')).toBe('a\nB\nc\nd\ne\nf\n');
    // first turn: user.message; resume turn: only a user.tool_approval (never mixed)
    expect(tf.inputs[0]![0].type).toBe('user.message');
    expect(tf.inputs[1]).toEqual([{ type: 'user.tool_approval', threadId: 'main', toolCallId: 'tc1', approval: { status: 'allow' } }]);
    void root;
  });

  it('denies (and stores no decision) when every hunk is rejected', async () => {
    const { file, store, approvals } = setup([]);
    const tf = new FakeTrueForge({
      'forge-agent': [
        () => [created(), toolMsg('m1', 'tc1', 'propose_write', { path: 'f.txt', new_content: NEW, rationale: 'r' }), approvalRequired('tc1', 'm1'), done()],
        () => [created(), done()],
      ],
    });
    const ctl = new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'forge-agent' }), retries: 0 });
    await ctl.run('x', new RecordingUi());
    expect(tf.inputs[1]![0].approval.status).toBe('deny');
    expect(store.size).toBe(0);
    expect(fs.readFileSync(file, 'utf8')).toBe(OLD);
  });

  it('denies paths outside the workspace without opening any review', async () => {
    const { approvals } = setup([1]);
    const d = await approvals.decide({ name: 'propose_write', args: { path: '../evil.txt', new_content: 'x', rationale: '' } }, new AbortController().signal);
    expect(d.status).toBe('deny');
  });
});


describe('concurrent and stale approvals', () => {
  it('collects two write calls in one turn, then sends only approvals', async () => {
    const { approvals, store }=setup([1]);
    const tf=new FakeTrueForge({p:[()=>[
      created(),toolMsg('m1','a','propose_write',{path:'f.txt',new_content:NEW}),
      toolMsg('m2','b','propose_write',{path:'second.txt',new_content:'new'}),
      approvalRequired('a','m1'),approvalRequired('b','m2'),done(),
    ],()=>[created(),done()]]});
    const ctl=new AgentController({getClient:()=>tf.client,approvals,agents:()=>({primary:'p'}),retries:0});
    await ctl.run('two files',new RecordingUi());
    expect(tf.inputs[1]).toHaveLength(2);
    expect(tf.inputs[1]!.every(i=>i.type==='user.tool_approval')).toBe(true);
    expect(store.size).toBe(0);
  });
  it('rejects a second request while review is open and clears permits after a failed resume', async () => {
    const {root,store}=setup([1]);
    let opened!:()=>void,release!:(ids:number[])=>void;
    const ready=new Promise<void>(r=>opened=r);
    const approvals=new ReviewApprovals({root,store,readText:async()=>OLD,ui:{
      reviewHunks:()=>new Promise(r=>{release=r;opened();}),confirmCommand:async()=>false,close(){},
    }});
    const tf=new FakeTrueForge({p:[()=>[created(),toolMsg('m','tc','propose_write',{path:'f.txt',new_content:NEW}),approvalRequired('tc','m'),done()],()=>{throw Error('SSE drop');}]});
    const ctl=new AgentController({getClient:()=>tf.client,approvals,agents:()=>({primary:'p'}),retries:0});
    const running=ctl.run('first',new RecordingUi());await ready;
    const second=new RecordingUi();await ctl.run('second',second);
    expect(second.result?.message).toContain('already working');
    release([1]);await running;expect(store.size).toBe(0);
  });
});

describe('unsupported client-side tool safety net', () => {
  it('responds to tool.response_required with guidance and continues the run', async () => {
    const { approvals } = setup([1]);
    const tf = new FakeTrueForge({
      p: [
        () => [created(), toolResponseRequired('call-question'), done()],
        (input) => {
          expect(input).toEqual([{
            type: 'user.tool_response',
            threadId: 'main',
            toolCallId: 'call-question',
            content: 'No user is available to answer. Proceed with your best judgment and use propose_write for edits.',
          }]);
          return [created(), delta('m2', 'Finished.'), done()];
        },
      ],
    });
    const ctl = new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'p' }), retries: 0 });
    const ui = new RecordingUi();
    await ctl.run('ask question test', ui);
    expect(ui.result?.status).toBe('done');
    expect(ui.text).toBe('Finished.');
    expect(tf.inputs).toHaveLength(2);
  });

  it('fails with a clear message when unsupported tool responses exceed 2 in one run', async () => {
    const { approvals } = setup([]);
    const tf = new FakeTrueForge({
      p: [
        () => [created(), toolResponseRequired('q1'), done()],
        () => [created(), toolResponseRequired('q2'), done()],
        () => [created(), toolResponseRequired('q3'), done()],
      ],
    });
    const ctl = new AgentController({ getClient: () => tf.client, approvals, agents: () => ({ primary: 'p' }), retries: 0 });
    const ui = new RecordingUi();
    await ctl.run('infinite questions', ui);
    expect(ui.result?.status).toBe('error');
    expect(ui.result?.message).toContain('Unsupported client-side tool was called too many times');
    expect(tf.inputs).toHaveLength(3);
  });
});

describe('fallback message rebuilding with smaller context budget', () => {
  it('rebuilds the message with fallback budget when switching to fallback agent', async () => {
    const { approvals } = setup([1]);
    const boom = () => { throw new Error('Primary rate limit'); };
    const tf = new FakeTrueForge({
      p: [boom, boom, boom],
      f: [
        (input) => {
          expect(input[0].content).toBe('rebuilt for fallback');
          return [created(), delta('m1', 'Fallback done'), done()];
        },
      ],
    });
    const ctl = new AgentController({
      getClient: () => tf.client,
      approvals,
      agents: () => ({ primary: 'p', fallback: 'f' }),
      retries: 2,
      backoffMs: 1,
      sleep: async () => {},
    });
    const ui = new RecordingUi();
    const rebuild = async (agent: string) => {
      if (agent === 'f') return 'rebuilt for fallback';
      return 'primary message';
    };
    await ctl.run('initial message', ui, undefined, rebuild);
    expect(ui.result?.status).toBe('done');
    expect(ui.text).toBe('Fallback done');
    expect(tf.inputs[0]![0].content).toBe('primary message');
    expect(tf.inputs.at(-1)![0].content).toBe('rebuilt for fallback');
  });
});
