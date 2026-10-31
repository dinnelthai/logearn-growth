import {describe,it,expect} from 'vitest';
import {savedSnapshotAuditNotice} from '../aiWeeklyReportPanel.js';

describe('saved weekly audit copy uses read-only source boundaries',()=>{
 it('does not call a saved v5 projection real-source acceptance',()=>{
  const text=savedSnapshotAuditNotice({version:'weekly-saved-context-audit-v1',
   audit:{status:'snapshot-contract-ready',checks:{under22KB:true}}});
  expect(text).toContain('v5');
  expect(text).toContain('13 个模块');
  expect(text).toContain('不是实时数据源');
 });
 it('rejects an archived v4 report without offering a paid retry',()=>{
  const text=savedSnapshotAuditNotice({version:'weekly-saved-context-audit-v1',
   audit:{status:'snapshot-contract-incomplete',
    checks:{pinnedV5Report:false,exactThirteenModules:false}}});
  expect(text).toContain('缺少已存档 v5 周报标记');
  expect(text).toContain('不是完整的 13 模块');
  expect(text).toContain('不会升级或重新收费');
 });
 it('does not display untrusted raw strings',()=>{
  const text=savedSnapshotAuditNotice({version:'wrong',audit:{error:'private@example.test'}});
  expect(text).toContain('不能判断');
  expect(text).not.toContain('private@example.test');
 });
});