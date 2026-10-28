import {describe,it,expect} from 'vitest';
import {deriveAnalysisState,formatAnalysisTime} from '../../pages/aiTaskState.js';

const record=(status,extra={})=>({
  id:'task-1',title:'真实任务',status,created_at:Date.parse('2026-10-28T10:00:00Z'),
  ...extra
});
const checkpoint=(extra={})=>({
  analysisId:'task-1',recordStatus:'processing',state:'not-started',modelCalls:0,
  canAutoResume:false,leaseExpired:false,requiresHumanReview:false,pendingTools:0,...extra
});

describe('AI task display state is derived from persisted evidence',()=>{
  it('treats an incomplete tool investigation as blocked even when record says processing',()=>{
    const state=deriveAnalysisState(record('processing'),checkpoint({
      state:'partial-tools',reason:'tool-execution-incomplete',
      requiresHumanReview:true,pendingTools:2
    }));
    expect(state.key).toBe('blocked');
    expect(state.label).toBe('需要人工处理');
    expect(state.canResume).toBe(false);
    expect(state.canCancel).toBe(true);
  });
  it('does not use an expired lease as permission to resume paid work',()=>{
    const state=deriveAnalysisState(record('processing'),checkpoint({leaseExpired:true}));
    expect(state.key).toBe('blocked');
    expect(state.canResume).toBe(false);
  });
  it('does not invent a completed report',()=>{
    expect(deriveAnalysisState(record('completed',{result:null}),null).key).toBe('unknown');
    expect(deriveAnalysisState(record('completed',{result:{summary:'真实报告'}}),null).key).toBe('completed');
  });
  it('distinguishes cancelled, failed and queued records',()=>{
    expect(deriveAnalysisState(record('failed',{cancel_requested:true}),null).key).toBe('cancelled');
    expect(deriveAnalysisState(record('failed',{error_message:'provider failed'}),checkpoint({recordStatus:'failed'})).reason).toBe('provider failed');
    expect(deriveAnalysisState(record('pending'),null).key).toBe('queued');
  });
  it('does not label an unverifiable processing record as running',()=>{
    expect(deriveAnalysisState(record('processing'),null).key).toBe('unknown');
    expect(deriveAnalysisState(record('processing'),checkpoint({recordStatus:'failed'})).key).toBe('unknown');
  });
  it('shows stale warning without inventing a terminal state',()=>{
    const state=deriveAnalysisState(record('processing'),checkpoint(),Date.parse('2026-10-28T10:06:00Z'));
    expect(state.key).toBe('running');
    expect(state.stale).toBe(true);
  });
  it('hides retry when paid calls are recorded or diagnostics absent',()=>{
    const failed=record('failed');
    expect(deriveAnalysisState(failed,null).canRetry).toBe(false);
    expect(deriveAnalysisState(failed,checkpoint({recordStatus:'failed',modelCalls:1})).canRetry).toBe(false);
    expect(deriveAnalysisState(failed,checkpoint({recordStatus:'failed'})).canRetry).toBe(true);
  });
  it('never fabricates a timestamp',()=>{
    expect(formatAnalysisTime(null)).toBe('未知');
    expect(formatAnalysisTime('not-a-time')).toBe('未知');
  });
});
