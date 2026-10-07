/**
 * userMenu.js — "我的" dropdown in the top-right corner of the dashboard.
 * Mounts a small avatar button next to #as-data-badge; click toggles a panel.
 */
import { logout, changePassword, updateProfile, listSavedConfigs, saveConfig, deleteSavedConfig } from './authClient.js'

export function mountUserMenu(root, { user: initialUser, onLogout, getCurrentConfig }) {
  let user = initialUser
  let open = false
  let view = 'main'     // 'main' | 'password' | 'configs'
  let error = ''
  let success = ''
  let configs = []
  let disposed = false

  const $ = s => root.querySelector(s)

  // ── Create avatar button ──────────────────────────────────────────────────
  const badge = root.querySelector('#as-data-badge')
  const btn = document.createElement('button')
  btn.id = 'la-user-btn'
  btn.className = 'la-user-btn'
  btn.setAttribute('aria-label', '我的账号')
  btn.setAttribute('aria-expanded', 'false')
  btn.setAttribute('aria-haspopup', 'true')
  badge?.insertAdjacentElement('afterend', btn)

  // ── Create panel ──────────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.id = 'la-user-panel'
  panel.className = 'la-user-panel'
  panel.hidden = true
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '账号菜单')
  root.querySelector('.a-top')?.appendChild(panel)

  function initial(name) {
    return name ? name.trim().charAt(0).toUpperCase() : '?'
  }

  function renderBtn() {
    btn.textContent = initial(user.name)
    btn.title = user.name || user.email
  }

  function renderPanel() {
    if (disposed) return
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

    let inner = ''
    if (view === 'main') {
      inner = `
        <div class="la-user-info">
          <span class="la-user-avatar">${esc(initial(user.name))}</span>
          <div>
            <strong>${esc(user.name || '未设置名称')}</strong>
            <p>${esc(user.email)}</p>
          </div>
        </div>
        <hr class="la-menu-divider">
        <button class="la-menu-item" data-action="configs">📌 收藏的配置</button>
        <button class="la-menu-item" data-action="password">🔑 修改密码</button>
        <hr class="la-menu-divider">
        <button class="la-menu-item la-menu-danger" data-action="logout">退出登录</button>`
    } else if (view === 'password') {
      inner = `
        <div class="la-panel-header">
          <button class="la-back-btn" data-action="back">← 返回</button>
          <strong>修改密码</strong>
        </div>
        ${error ? `<p class="la-panel-error">${esc(error)}</p>` : ''}
        ${success ? `<p class="la-panel-success">${esc(success)}</p>` : ''}
        <form class="la-pwd-form" data-form="password">
          <label>当前密码<input type="password" name="current" autocomplete="current-password" required></label>
          <label>新密码（至少8位）<input type="password" name="new" autocomplete="new-password" required minlength="8"></label>
          <label>确认新密码<input type="password" name="confirm" autocomplete="new-password" required></label>
          <button type="submit" class="la-menu-btn-primary">保存</button>
        </form>`
    } else if (view === 'configs') {
      const list = configs.length
        ? configs.map(c => `<div class="la-config-item">
            <button class="la-config-name" data-apply="${esc(c.id)}">${esc(c.name)}</button>
            <button class="la-config-del" data-delete="${esc(c.id)}" aria-label="删除">×</button>
          </div>`).join('')
        : '<p class="la-panel-muted">还没有收藏的配置。运行分析后可在此保存当前配置。</p>'
      inner = `
        <div class="la-panel-header">
          <button class="la-back-btn" data-action="back">← 返回</button>
          <strong>收藏的配置</strong>
        </div>
        ${error ? `<p class="la-panel-error">${esc(error)}</p>` : ''}
        ${success ? `<p class="la-panel-success">${esc(success)}</p>` : ''}
        <div class="la-config-list">${list}</div>
        <hr class="la-menu-divider">
        <form class="la-save-form" data-form="save">
          <input name="name" placeholder="为当前配置命名…" maxlength="80" required>
          <button type="submit" class="la-menu-btn-primary">保存当前配置</button>
        </form>`
    }

    panel.innerHTML = inner
    bindPanel()
  }

  function bindPanel() {
    panel.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action
        error = ''; success = ''
        if (action === 'back') { view = 'main'; renderPanel() }
        else if (action === 'logout') {
          await logout()
          close()
          onLogout()
        }
        else if (action === 'password') { view = 'password'; renderPanel() }
        else if (action === 'configs') {
          view = 'configs'
          try { const r = await listSavedConfigs(); configs = r.configs ?? [] } catch { configs = [] }
          renderPanel()
        }
      })
    })

    const pwdForm = panel.querySelector('[data-form="password"]')
    pwdForm?.addEventListener('submit', async e => {
      e.preventDefault()
      const current = pwdForm.current.value
      const newPwd = pwdForm.new.value
      const confirm = pwdForm.confirm.value
      if (newPwd !== confirm) { error = '两次新密码不一致'; renderPanel(); return }
      try {
        await changePassword(current, newPwd)
        success = '密码已修改'; error = ''; pwdForm.reset(); renderPanel()
      } catch (err) { error = err.message ?? '修改失败'; renderPanel() }
    })

    const saveForm = panel.querySelector('[data-form="save"]')
    saveForm?.addEventListener('submit', async e => {
      e.preventDefault()
      const name = saveForm.name.value.trim()
      const config = getCurrentConfig?.()
      if (!config) { error = '请先运行一次分析'; renderPanel(); return }
      try {
        await saveConfig(name, config)
        saveForm.reset()
        const r = await listSavedConfigs(); configs = r.configs ?? []
        success = `"${name}" 已保存`; error = ''; renderPanel()
      } catch (err) { error = err.message ?? '保存失败'; renderPanel() }
    })

    panel.querySelectorAll('[data-apply]').forEach(el => {
      el.addEventListener('click', () => {
        const cfg = configs.find(c => c.id === el.dataset.apply)
        if (cfg?.config) { close(); onLogout._applyConfig?.(cfg.config) }
      })
    })

    panel.querySelectorAll('[data-delete]').forEach(el => {
      el.addEventListener('click', async () => {
        try {
          await deleteSavedConfig(el.dataset.delete)
          const r = await listSavedConfigs(); configs = r.configs ?? []
          renderPanel()
        } catch (err) { error = err.message ?? '删除失败'; renderPanel() }
      })
    })
  }

  function open_() {
    open = true
    panel.hidden = false
    btn.setAttribute('aria-expanded', 'true')
    view = 'main'; error = ''; success = ''
    renderPanel()
    // Close on outside click
    setTimeout(() => document.addEventListener('click', outsideClick), 0)
  }

  function close() {
    open = false
    panel.hidden = true
    btn.setAttribute('aria-expanded', 'false')
    document.removeEventListener('click', outsideClick)
  }

  function outsideClick(e) {
    if (!panel.contains(e.target) && e.target !== btn) close()
  }

  btn.addEventListener('click', e => { e.stopPropagation(); open ? close() : open_() })
  panel.addEventListener('click', e => e.stopPropagation())

  renderBtn()

  return {
    setUser(u) { user = u; renderBtn() },
    dispose() {
      disposed = true
      document.removeEventListener('click', outsideClick)
      btn.remove()
      panel.remove()
    }
  }
}
