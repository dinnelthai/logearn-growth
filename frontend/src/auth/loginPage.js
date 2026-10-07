/**
 * loginPage.js — full-screen login overlay rendered before the dashboard loads.
 * Removed by calling the returned cleanup fn once login succeeds.
 */
import { login } from './authClient.js'

export function mountLoginPage(root, { onSuccess }) {
  const overlay = document.createElement('div')
  overlay.id = 'la-login-overlay'
  overlay.innerHTML = `
    <div class="la-login-card" role="main" aria-label="登录">
      <div class="la-login-brand">
        <svg class="a-brandmark" viewBox="0 0 46 40" aria-hidden="true" width="36" height="31">
          <path class="a-wing" d="M17 2C9 8 3 17 4 27c1 6 6 10 14 11-6-8-7-23-1-36Z"/>
          <path class="a-wing" d="M29 2c8 6 14 15 13 25-1 6-6 10-14 11 6-8 7-23 1-36Z"/>
          <text class="a-e" x="14" y="31">e</text>
        </svg>
        <span class="la-login-title">Log<span>Earn</span> 数据分析</span>
      </div>
      <form id="la-login-form" novalidate>
        <div class="la-field">
          <label for="la-email">邮箱</label>
          <input id="la-email" name="email" type="email" autocomplete="email"
            placeholder="your@email.com" required>
        </div>
        <div class="la-field">
          <label for="la-password">密码</label>
          <input id="la-password" name="password" type="password" autocomplete="current-password"
            placeholder="••••••••" required minlength="8">
        </div>
        <p id="la-login-error" class="la-error" hidden></p>
        <button type="submit" class="la-login-btn" id="la-login-submit">登录</button>
      </form>
    </div>`
  root.appendChild(overlay)

  const form = overlay.querySelector('#la-login-form')
  const errorEl = overlay.querySelector('#la-login-error')
  const submitBtn = overlay.querySelector('#la-login-submit')

  function setError(msg) {
    errorEl.textContent = msg
    errorEl.hidden = !msg
  }

  function setLoading(on) {
    submitBtn.disabled = on
    submitBtn.textContent = on ? '登录中…' : '登录'
  }

  form.addEventListener('submit', async e => {
    e.preventDefault()
    setError('')
    const email = form.email.value.trim()
    const password = form.password.value
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
