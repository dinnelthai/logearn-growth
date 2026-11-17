import {describe,it,expect,vi,afterEach} from 'vitest';
import {mountLoginPage} from '../loginPage.js';
import {login} from '../authClient.js';

vi.mock('../authClient.js',()=>({login:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks()});

function node(value=''){
 return {
  value,textContent:'',hidden:false,disabled:false,type:'',
  attrs:{},events:{},focused:false,
  addEventListener(name,listener){this.events[name]=listener},
  setAttribute(name,value){this.attrs[name]=value},
  focus(){this.focused=true}
 };
}
function fixture(){
 const elements={
  '#la-login-form':node(),
  '#la-email':node(),
  '#la-password':{...node(),type:'password'},
  '#la-login-error':{...node(),hidden:true},
  '#la-login-submit':node(),
  '.la-password-toggle':node()
 };
 const overlay={
  innerHTML:'',removed:false,
  querySelector:selector=>elements[selector],
  remove(){overlay.removed=true}
 };
 const root={appendChild:vi.fn()};
 vi.stubGlobal('document',{createElement:()=>overlay});
 const onSuccess=vi.fn();
 const mounted=mountLoginPage(root,{onSuccess});
 return {elements,overlay,root,onSuccess,mounted};
}
describe('login page UI',()=>{
 it('uses transparent official assets selected by theme and a compact accessible form',()=>{
  const {overlay,elements}=fixture();
  expect(overlay.innerHTML).toContain('srcset="/brand/logearn-official-dark.svg"');
  expect(overlay.innerHTML).toContain('src="/brand/logearn-official.svg"');
  expect(overlay.innerHTML).toContain('aria-labelledby="la-login-heading"');
  expect(overlay.innerHTML).toContain('role="alert"');
  expect(overlay.innerHTML).toContain('autocomplete="current-password"');
  expect(elements['#la-email'].focused).toBe(true);
 });
 it('shows or hides the password without submitting the form',()=>{
  const {elements}=fixture();
  const toggle=elements['.la-password-toggle'];
  toggle.events.click();
  expect(elements['#la-password'].type).toBe('text');
  expect(toggle.attrs['aria-pressed']).toBe('true');
  toggle.events.click();
  expect(elements['#la-password'].type).toBe('password');
  expect(toggle.attrs['aria-pressed']).toBe('false');
  expect(login).not.toHaveBeenCalled();
 });
 it('blocks empty credentials and clears the overlay only on successful login',async()=>{
  const {overlay,elements,onSuccess}=fixture();
  await elements['#la-login-form'].events.submit({preventDefault(){}});
  expect(login).not.toHaveBeenCalled();
  expect(elements['#la-login-error'].hidden).toBe(false);
  elements['#la-email'].value='  viewer@example.test  ';
  elements['#la-password'].value='test-password';
  login.mockResolvedValue({user:{id:'test-user'}});
  await elements['#la-login-form'].events.submit({preventDefault(){}});
  expect(login).toHaveBeenCalledWith('viewer@example.test','test-password');
  expect(overlay.removed).toBe(true);
  expect(onSuccess).toHaveBeenCalledWith({id:'test-user'});
 });
 it('keeps form usable and announces an authentication error after failure',async()=>{
  const {overlay,elements}=fixture();
  elements['#la-email'].value='viewer@example.test';
  elements['#la-password'].value='incorrect';
  login.mockRejectedValue(new Error('登录失败'));
  await elements['#la-login-form'].events.submit({preventDefault(){}});
  expect(overlay.removed).toBe(false);
  expect(elements['#la-login-submit'].disabled).toBe(false);
  expect(elements['#la-login-form'].attrs['aria-busy']).toBe('false');
  expect(elements['#la-login-error'].textContent).toBe('登录失败');
  expect(elements['#la-login-error'].hidden).toBe(false);
 });
});
