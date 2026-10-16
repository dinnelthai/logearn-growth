// Use a real SVG so the loading indicator stays visible in every page layout.
export function loadingState(label='正在加载…') {
 const text=String(label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 return `<div class="dashboard-loading" role="status" aria-live="polite"><svg class="dashboard-loading-spinner" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" opacity=".16"/><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="24 58"><animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur=".85s" repeatCount="indefinite"/></circle></svg><span>${text}</span></div>`
}
