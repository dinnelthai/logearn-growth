/**
 * cohortManager.js
 * Renders a cohort list + upload panel in the sidebar (segments page).
 * Calling mountCohortManager returns a cleanup fn and exposes a refresh fn.
 */
import { listCohorts, createCohort, deleteCohort, getCohort } from '../analytics/cohortClient.js'
import { createAudience } from '../analytics/audience.js'

const SWATCH = ['#6366f1','#f97316','#22c55e','#0ea5e9','#ec4899','#f59e0b','#14b8a6','#8b5cf6']

export function mountCohortManager(host, { allUsers, asof, day, onApply, esc, remote=false }) {
  let cohorts = []
  let busy = false
  let error = ''
  let showCreate = false
  let disposed = false

  function render() {
    if (disposed) return
    host.innerHTML = `
      <div class="a-cohort-manager">
        <div class="a-sectionhead" style="margin-bottom:10px">
          <h2>标签群组</h2>
          <button class="a-link" data-create ${busy ? 'disabled' : ''}>${showCreate ? '取消' : '+ 新建'}</button>
        </div>
        ${showCreate ? createForm() : ''}
        ${error ? `<p class="a-status">${esc(error)}</p>` : ''}
        ${cohorts.length === 0 && !showCreate
          ? `<p class="a-muted">还没有群组。新建群组后可将其作为受众，在漏斗、留存等模块中分析这批用户。</p>`
          : cohortList()
        }
      </div>`

    host.querySelector('[data-create]')?.addEventListener('click', () => {
      showCreate = !showCreate; error = ''; render()
    })

    if (showCreate) bindCreateForm()
    bindCohortList()
  }

  function createForm() {
    return `<form class="a-cohort-form" data-form>
      <label>群组名称
        <input name="name" required maxlength="80" placeholder="十一激活活动">
      </label>
      <label>备注（可选）
        <input name="description" maxlength="500" placeholder="2026年十月活动拉来的用户">
      </label>
      <label>颜色
        <div class="a-swatch-row">${SWATCH.map(c =>
          `<button type="button" class="a-swatch ${c === '#6366f1' ? 'is-selected' : ''}"
            data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}
        </div>
        <input name="color" type="hidden" value="#6366f1">
      </label>
      <label>用户 ID 列表
        <textarea name="user_ids" rows="5" placeholder="每行或逗号分隔一个 user_id&#10;LE10012&#10;LE10045&#10;LE10102" style="width:100%;resize:vertical"></textarea>
      </label>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button type="submit" class="a-button a-primary" ${busy ? 'disabled' : ''}>创建</button>
        <input type="file" accept=".txt,.csv" data-file-input style="display:none">
        <button type="button" class="a-button" data-upload ${busy ? 'disabled' : ''}>上传文件</button>
      </div>
      <p class="a-muted" data-count></p>
    </form>`
  }

  function bindCreateForm() {
    const form = host.querySelector('[data-form]')
    if (!form) return

    // Swatch color picker
    form.querySelectorAll('.a-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        form.querySelectorAll('.a-swatch').forEach(b => b.classList.remove('is-selected'))
        btn.classList.add('is-selected')
        form.querySelector('[name=color]').value = btn.dataset.color
      })
    })

    // Live count
    const ta = form.querySelector('[name=user_ids]')
    const countEl = form.querySelector('[data-count]')
    ta.addEventListener('input', () => {
      const ids = parseIds(ta.value)
      countEl.textContent = ids.length ? `已识别 ${ids.length} 个 user_id` : ''
    })

    // File upload
    const fileInput = form.querySelector('[data-file-input]')
    form.querySelector('[data-upload]').addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = e => {
        ta.value = e.target.result
        ta.dispatchEvent(new Event('input'))
      }
      reader.readAsText(file)
    })

    // Submit
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const data = new FormData(form)
      const name = String(data.get('name') ?? '').trim()
      const description = String(data.get('description') ?? '').trim()
      const color = String(data.get('color') ?? '#6366f1')
      const user_ids = parseIds(String(data.get('user_ids') ?? ''))

      if (!name) { error = '请填写群组名称'; render(); return }
      busy = true; error = ''; render()
      try {
        await createCohort({ name, description, color, user_ids })
        showCreate = false
        await load()
      } catch (err) {
        error = err.errors ? err.errors.join('；') : (err.message ?? '创建失败')
        busy = false; render()
      }
    })
  }

  function cohortList() {
    return `<div class="a-cohort-list">${cohorts.map(c => `
      <div class="a-cohort-item" data-id="${esc(c.id)}">
        <span class="a-cohort-dot" style="background:${esc(c.color ?? '#6366f1')}"></span>
        <div class="a-cohort-info">
          <strong>${esc(c.name)}</strong>
          <span class="a-muted">${(c.member_count ?? c.user_ids?.length ?? 0)} 人</span>
        </div>
        <div class="a-cohort-actions">
          <button class="a-button" data-apply="${esc(c.id)}">用于分析</button>
          <button class="a-iconbtn" data-delete="${esc(c.id)}" aria-label="删除">×</button>
        </div>
      </div>`).join('')}</div>`
  }

  function bindCohortList() {
    host.querySelectorAll('[data-apply]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.apply
        try {
          const cohort = cohorts.find(c => c.id === id)
          if (!cohort) return
          // Resolve user_ids: GET if only member_count is available
          let userIds = cohort.user_ids
          if (!userIds) {
            const full = await getCohort(id)
            userIds = full.user_ids ?? []
          }
          const idSet = new Set(userIds)
          const matched = allUsers.filter(u => idSet.has(u.id.replace(/^user:/, '')))
          if (!remote&&!matched.length) { error = `群组"${cohort.name}"在当前数据中没有匹配用户`; render(); return }
          const end = Math.floor((asof + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000
          const start = end - 14 * 86400000
          const audience = createAudience({
            title: cohort.name,
            description: `自定义群组 · ${cohort.description || ''} · 匹配 ${matched.length} / ${userIds.length} 人`,
            rows: remote?userIds.map(id=>({id:String(id).startsWith('anonymous:')?String(id):'user:'+String(id).replace(/^user:/,'')})):matched,
            context: { start, end, mode: 'funnel', source: 'all' },
          })
          onApply(audience)
        } catch (err) {
          error = err.message ?? '加载群组失败'; render()
        }
      })
    })

    host.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`确认删除群组"${cohorts.find(c => c.id === btn.dataset.delete)?.name}"？`)) return
        busy = true; render()
        try {
          await deleteCohort(btn.dataset.delete)
          await load()
        } catch (err) {
          error = err.message ?? '删除失败'; busy = false; render()
        }
      })
    })
  }

  function parseIds(raw) {
    return [...new Set(
      raw.split(/[\n,;\t]+/)
        .map(s => s.trim())
        .filter(Boolean)
    )]
  }

  async function load() {
    busy = true; render()
    try {
      const result = await listCohorts()
      cohorts = result.cohorts ?? []
    } catch {
      cohorts = []
    }
    busy = false; render()
  }

  load()

  return { refresh: load, dispose: () => { disposed = true } }
}
