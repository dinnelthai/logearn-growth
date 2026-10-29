import {describe,it,expect} from 'vitest';
import {renderXPanel} from '../../pages/contentGrowth.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const posts=[
 {post_id:'1',published_at:'2026-10-17T10:00:00Z',body:'Higher views',impressions:2500,likes:8,replies:2,reposts:0,quotes:null},
 {post_id:'2',published_at:'2026-10-14T10:00:00Z',body:'Higher engagement',impressions:900,likes:4,replies:3,reposts:7,quotes:null},
 {post_id:'3',published_at:'2026-10-12T10:00:00Z',body:'Unknown views',impressions:null,likes:2,replies:1,reposts:0,quotes:null}
];
const report={
 configured:true,accounts:[
  {id:'logearn_cn',followers:9721,autoSync:true,lastSynced:Date.parse('2026-10-29T04:28:00Z'),lastAttempt:Date.now(),
   posts,metrics:{impressions:3400,engagementRate:0.71,measuredPosts:2,followerChange:null}},
  {id:'logearn_global',followers:null,posts:[],metrics:{}}
 ]
};
describe('content growth reading experience',()=>{
 it('does not break when the backend has not been upgraded',()=>{
  expect(renderXPanel(undefined,esc,'logearn_cn','recent')).toContain('监测数据暂不可用');
 });
 it('shows existing X metrics with a useful conclusion and source caveat',()=>{
  const html=renderXPanel(report,esc,'logearn_cn','recent');
  expect(html).toContain('9,721');
  expect(html).toContain('内容评价与运营建议');
  expect(html).toContain('互动率较高');
  expect(html).toContain('Higher engagement');
  expect(html).toContain('数据源已连接');
  expect(html).toContain('同步冷却中');
  expect(html).toContain('前往 AI Growth Agent');
  expect(html).not.toContain('内容 0');
 });
 it('supports both existing official accounts without an account-creation flow',()=>{
  const html=renderXPanel(report,esc,'logearn_global','recent');
  expect(html).toContain('data-x-tab="logearn_cn"');
  expect(html).toContain('data-x-tab="logearn_global"');
  expect(html).toContain('当前有 0 条');
  expect(html).not.toContain('请输入 X 用户名');
 });
 it('ranks known engagement above raw views and preserves unknown metrics',()=>{
  const html=renderXPanel(report,esc,'logearn_cn','engagement');
  expect(html.indexOf('Higher engagement',html.indexOf('帖子表现与行为比率'))).toBeLessThan(html.indexOf('Higher views',html.indexOf('帖子表现与行为比率')));
  expect(html).toContain('Unknown views');
  expect(html).toContain('未知');
 });
 it('shows independent reply, repost and like rates with missing snapshots',()=>{
  const html=renderXPanel(report,esc,'logearn_cn','recent');
  expect(html).toContain('回复 / 回复率');
  expect(html).toContain('转发 / 转发率');
  expect(html).toContain('点赞 / 点赞率');
  expect(html).toContain('24h：未记录');
  expect(html).toContain('48h：未记录');
  expect(html).toContain('不可计算');
  expect(html).toContain('twitterapi.io');
 });
 it('shows an actual 24h observation, never inferring 48h from current totals',()=>{
  const copy=structuredClone(report);
  copy.accounts[0].posts[0].milestones={h24:{
   ageHours:25.5,impressions:1000,observedAt:Date.parse('2026-10-18T11:30:00Z')},h48:null};
  const html=renderXPanel(copy,esc,'logearn_cn','recent');
  expect(html).toContain('24h附近：1,000 浏览（25.5h采集）');
  expect(html).toContain('48h：未记录');
 });
 it('escapes untrusted post text',()=>{
  const copy=structuredClone(report);
  copy.accounts[0].posts[0].body='<img src=x onerror=alert(1)>';
  const html=renderXPanel(copy,esc,'logearn_cn','recent');
  expect(html).not.toContain('<img src=x onerror=');
  expect(html).toContain('&lt;img');
 });
});
