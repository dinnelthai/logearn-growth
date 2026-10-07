/**
 * userMenu.js — "我的" dropdown pinned to the top-right corner.
 * Panel is appended to document.body and positioned with fixed coords
 * so it is never clipped by overflow:hidden ancestors.
 */
import { logout, changePassword, updateProfile, listSavedConfigs, saveConfig, deleteSavedConfig } from './authClient.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

export function mountUserMenu(root, { user: initialUser, onLogout, getCurrentConfig }) {
  let user = { ...initialUser }
  let open = false
  let disposed = false

  // ── sub-panel state ────────────────────────────────────────────────────────
  let pwdOpen = false, pwdError = '', pwdSuccess = ''
  let cfgOpen = false, cfgError = '', cfgSuccess = '', configs = []
  let nameEditing = false, nameError = ''

  // ── avatar button ──────────────────────────────────────────────────────────
  const btn = document.createElement('button')
  btn.className = 'la-user-btn'
  btn.setAttribute('aria-label', '我的账号')
  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-expanded', 'false')
  root.querySelector('#as-data-badge')?.insertAdjacentElement('afterend', btn)

  // ── panel (mounted on body, positioned with fixed) ─────────────────────────
  const panel = document.createElement('div')
  panel.className = 'la-user-panel'
  panel.hidden = true
  document.body.appendChild(panel)

  function initial(name) { return (name || '?').trim().charAt(0).toUpperCase() }
  function updateBtn() {
    btn.textContent = initial(user.name)
    btn.title = user.name || user.email
  }

  function position() {
    const r = btn.getBoundingClientRect()
    panel.style.top  = (r.bottom + 8) + 'px'
    panel.style.right = (window.innerWidth - r.right) + 'px'
  }

  // ── render ─────────────────────────────────────────────────────────────────
  function render() {
    if (disposed) return

    const cfgList = configs.length
      ? configs.map(c => `
          <div class="la-cfg-row">
            <button class="la-cfg-name" data-apply="${esc(c.id)}" title="${esc(c.name)}">${esc(c.name)}</button>
            <button class="la-cfg-del" data-delete="${esc(c.id)}" aria-label="删除 ${esc(c.name)}">×</button>
          </div>`).join('')
      : `<p class="la-sub-muted">还没有收藏的配置</p>`

    panel.innerHTML = `
      <div class="la-user-card">
        <div class="la-user-avatar-lg">${esc(initial(user.name))}</div>
        <div class="la-user-card-info">
          ${nameEditing
            ? `<form class="la-name-form" data-form="name">
                <input name="name" class="la-name-input" value="${esc(user.name)}" maxlength="60" required autofocus>
                <div class="la-name-actions">
                  <button type="submit" class="la-btn-xs la-btn-primary">保存</button>
                  <button type="button" class="la-btn-xs" data-cancel-name>取消</button>
                </div>
                ${nameError ? `<p class="la-sub-error">${esc(nameError)}</p>` : ''}
              </form>`
            : `<strong class="la-user-displayname">${esc(user.name || '未设置名称')}</strong>
               <button class="la-edit-name-btn" data-edit-name title="编辑名称">✎</button>`
          }
          <span class="la-user-email">${esc(user.email)}</span>
        </div>
      </div>

      <div class="la-menu-section">
        <button class="la-section-toggle ${cfgOpen ? 'is-open' : ''}" data-toggle="cfg">
          <span>📌 收藏的配置</span>
          <span class="la-toggle-arrow">${cfgOpen ? '▾' : '▸'}</span>
        </button>
        ${cfgOpen ? `
          <div class="la-sub-panel">
            ${cfgError ? `<p class="la-sub-error">${esc(cfgError)}</p>` : ''}
            ${cfgSuccess ? `<p class="la-sub-success">${esc(cfgSuccess)}</p>` : ''}
            <div class="la-cfg-list">${cfgList}</div>
            <form class="la-save-form" data-form="save">
              <input name="name" placeholder="为当前配置命名…" maxlength="80" required>
              <button type="submit" class="la-btn-xs la-btn-primary">保存当前配置</button>
            </form>
          </div>` : ''}
      </div>

      <div class="la-menu-section">
        <button class="la-section-toggle ${pwdOpen ? 'is-open' : ''}" data-toggle="pwd">
          <span>🔑 修改密码</span>
          <span class="la-toggle-arrow">${pwdOpen ? '▾' : '▸'}</span>
        </button>
        ${pwdOpen ? `
          <div class="la-sub-panel">
            ${pwdError ? `<p class="la-sub-error">${esc(pwdError)}</p>` : ''}
            ${pwdSuccess ? `<p class="la-sub-success">${esc(pwdSuccess)}</p>` : ''}
            <form class="la-pwd-form" data-form="pwd">
              <label>当前密码<input type="password" name="current" autocomplete="current-password" required></label>
              <label>新密码（至少8位）<input type="password" name="new" autocomplete="new-password" required minlength="8"></label>
              <label>确认新密码<input type="password" name="confirm" autocomplete="new-password" required></label>
              <button type="submit" class="la-btn-xs la-btn-primary">确认修改</button>
            </form>
          </div>` : ''}
      </div>

      <div class="la-menu-footer">
        <button class="la-logout-btn" data-logout>退出登录</button>
      </div>`

    bind()
  }

  function bind() {
    // Name edit
    panel.querySelector('[data-edit-name]')?.addEventListener('click', () => {
      nameEditing = true; nameError = ''; render()
      panel.querySelector('.la-name-input')?.focus()
    })
    panel.querySelector('[data-cancel-name]')?.addEventListener('click', () => {
      nameEditing = false; nameError = ''; render()
    })
    const nameForm = panel.querySelector('[data-form="name"]')
    nameForm?.addEventListener('submit', async e => {
      e.preventDefault()
      const name = nameForm.name.value.trim()
      try {
        const r = await updateProfile(name)
        user = { ...user, name: r.user.name }
        nameEditing = false; nameError = ''; updateBtn(); render()
      } catch (err) { nameError = err.message ?? '保存失败'; render() }
    })

    // Section toggles
    panel.querySelector('[data-toggle="cfg"]')?.addEventListener('click', async () => {
      cfgOpen = !cfgOpen; cfgError = ''; cfgSuccess = ''
      if (cfgOpen) {
        try { const r = await listSavedConfigs(); configs = r.configs ?? [] } catch { configs = [] }
      }
      render()
    })
    panel.querySelector('[data-toggle="pwd"]')?.addEventListener('click', () => {
      pwdOpen = !pwdOpen; pwdError = ''; pwdSuccess = ''; render()
    })

    // Configs
    panel.querySelectorAll('[data-apply]').forEach(el => {
      el.addEventListener('click', () => {
        const cfg = configs.find(c => c.id === el.dataset.apply)
        if (cfg?.config) { close(); getCurrentConfig?.._apply?.(cfg.config) }
      })
    })
    panel.querySelectorAll('[data-delete]').forEach(el => {
      el.addEventListener('click', async () => {
        try {
          await deleteSavedConfig(el.dataset.delete)
          const r = await listSavedConfigs(); configs = r.configs ?? []; render()
        } catch (err) { cfgError = err.message ?? '删除失败'; render() }
      })
    })
    const saveForm = panel.querySelector('[data-form="save"]')
    saveForm?.addEventListener('submit', async e => {
      e.preventDefault()
      const name = saveForm.name.value.trim()
      const config = getCurrentConfig?.()
      if (!config) { cfgError = '请先运行一次分析再保存'; render(); return }
      try {
        await saveConfig(name, config)
        saveForm.reset()
        const r = await listSavedConfigs(); configs = r.configs ?? []
        cfgSuccess = `"${name}" 已保存`; cfgError = ''; render()
      } catch (err) { cfgError = err.message ?? '保存失败'; render() }
    })

    // Password
    const pwdForm = panel.querySelector('[data-form="pwd"]')
    pwdForm?.addEventListener('submit', async e => {
      e.preventDefault()
      if (pwdForm.new.value !== pwdForm.confirm.value) { pwdError = '两次新密码不一致'; render(); return }
      try {
        await changePassword(pwdForm.current.value, pwdForm.new.value)
        pwdForm.reset(); pwdSuccess = '密码已修改'; pwdError = ''; render()
      } catch (err) { pwdError = err.message ?? '修改失败'; render() }
    })

    // Logout
    panel.querySelector('[data-logout]')?.addEventListener('click', async () => {
      await logout(); close(); onLogout()
    })
  }

  // ── open / close ───────────────────────────────────────────────────────────
  function openPanel() {
    open = true; panel.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    render(); position()
    setTimeout(() => document.addEventListener('click', outsideClick), 0)
  }

  function close() {
    open = false; panel.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('click', outsideClick)
  }

  function outsideClick(e) {
    if (!panel.contains(e.target) && e.target !== btn) close()
  }

  btn.addEventListener('click', e => { e.stopPropagation(); open ? close() : openPanel() })
  panel.addEventListener('click', e => e.stopPropagation())
  window.addEventListener('resize', () => { if (open) position() })

  updateBtn()

  return {
    setUser(u) { user = { ...u }; updateBtn() },
    dispose() {
      disposed = true
      document.removeEventListener('click', outsideClick)
      window.removeEventListener('resize', position)
      btn.remove(); panel.remove()
    },
  }
}
