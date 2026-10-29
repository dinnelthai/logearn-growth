/**
 * loginPage.js — full-screen login overlay rendered before the dashboard loads.
 * Removed by calling the returned cleanup fn once login succeeds.
 */
import { login } from './authClient.js'

export function mountLoginPage(root, { onSuccess }) {
  const overlay = document.createElement('div')
  overlay.id = 'la-login-overlay'
  overlay.innerHTML = `
    <main class="la-login-card" aria-labelledby="la-login-heading">
      <header class="la-login-header">
        <div class="la-login-brand">
          <picture class="la-login-logo">
            <source media="(prefers-color-scheme: dark)" srcset="/brand/logearn-official-dark.svg">
            <img class="a-brandmark" src="/brand/logearn-official.svg" alt="LogEarn" width="190" height="40">
          </picture>
          <span class="la-login-subtitle">GROWTH ANALYTICS</span>
        </div>
        <h1 id="la-login-heading">登录工作台</h1>
        <p class="la-login-intro">查看增长数据、运营决策与 AI 分析</p>
      </header>
      <form id="la-login-form" novalidate>
        <div class="la-field">
          <label for="la-email">邮箱</label>
          <input id="la-email" name="email" type="email" inputmode="email" autocomplete="email"
            placeholder="请输入邮箱地址" required>
        </div>
        <div class="la-field">
          <label for="la-password">密码</label>
          <div class="la-password-control">
            <input id="la-password" name="password" type="password" autocomplete="current-password"
              placeholder="请输入密码" required minlength="8">
            <button type="button" class="la-password-toggle" aria-controls="la-password"
              aria-label="显示密码" aria-pressed="false">显示</button>
          </div>
        </div>
        <p id="la-login-error" class="la-error" role="alert" hidden></p>
        <button type="submit" class="la-login-btn" id="la-login-submit">登录</button>
      </form>
      <p class="la-login-footnote">仅限授权成员访问</p>
    </main>`
  root.appendChild(overlay)

  const form = overlay.querySelector('#la-login-form')
  const errorEl = overlay.querySelector('#la-login-error')
  const submitBtn = overlay.querySelector('#la-login-submit')
  const passwordInput = overlay.querySelector('#la-password')
  const passwordToggle = overlay.querySelector('.la-password-toggle')

  passwordToggle.addEventListener('click', () => {
    const visible = passwordInput.type === 'password'
    passwordInput.type = visible ? 'text' : 'password'
    passwordToggle.textContent = visible ? '隐藏' : '显示'
    passwordToggle.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码')
    passwordToggle.setAttribute('aria-pressed', String(visible))
  })

  function setError(msg) {
    errorEl.textContent = msg
    errorEl.hidden = !msg
  }

  function setLoading(on) {
    submitBtn.disabled = on
    form.setAttribute('aria-busy', String(on))
    submitBtn.textContent = on ? '正在登录…' : '登录'
  }

  form.addEventListener('submit', async e => {
    e.preventDefault()
    setError('')
    const email = overlay.querySelector('#la-email').value.trim()
    const password = passwordInput.value
    if (!email || !password) { setError('请填写邮箱和密码'); return }

    setLoading(true)
    try {
      const { user } = await login(email, password)
      overlay.remove()
      onSuccess(user)
    } catch (err) {
      setError(err.message ?? '登录失败，请重试')
      setLoading(false)
    }
  })

  // Focus email input immediately
  overlay.querySelector('#la-email').focus()

  return { dispose: () => overlay.remove() }
}
