import {describe,it,expect} from 'vitest';
import {beginPageLoad} from '../pageLoading.js';

function fixture(hasPage=true){
 const page={inert:false,isConnected:true};
 const notices=[];
 const host={
  innerHTML:'existing content',
  ownerDocument:{
   createElement:()=>({
    className:'',textContent:'',removed:false,
    setAttribute(){},remove(){this.removed=true}
   })
  },
  querySelector:selector=>selector==='.test-page'&&hasPage?page:null,
  prepend:notice=>notices.push(notice)
 };
 const start=()=>beginPageLoad(host,{
  selector:'.test-page',placeholder:'<p>Loading</p>',message:'正在刷新…'
 });
 return {host,page,notices,start};
}

describe('stable page refresh presentation',()=>{
 it('keeps previously rendered page visible until the read-only refresh finishes',()=>{
  const f=fixture();
  const finish=f.start();
  expect(f.host.innerHTML).toBe('existing content');
  expect(f.page.inert).toBe(true);
  expect(f.notices).toHaveLength(1);
  expect(f.notices[0].textContent).toContain('正在刷新');
  finish();
  expect(f.page.inert).toBe(false);
  expect(f.notices[0].removed).toBe(true);
 });
 it('retires the older banner when refresh requests overlap',()=>{
  const f=fixture();
  const first=f.start(),old=f.notices[0];
  const second=f.start(),current=f.notices[1];
  expect(old.removed).toBe(true);
  expect(current.removed).toBe(false);
  expect(f.page.inert).toBe(true);
  first();
  expect(f.page.inert).toBe(true);
  second();
  expect(f.page.inert).toBe(false);
  expect(current.removed).toBe(true);
 });
 it('uses the normal loading placeholder for first entry to a page',()=>{
  const f=fixture(false);
  f.start()();
  expect(f.host.innerHTML).toContain('Loading');
  expect(f.notices).toHaveLength(0);
 });
});
