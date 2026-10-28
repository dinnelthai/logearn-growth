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
        <img class="a-brandmark" src="/brand/logearn-official.svg" alt="LogEarn" width="209" height="44">
        <span class="la-login-subtitle">数据分析后台</span>
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
