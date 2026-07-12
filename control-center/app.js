import { renderConsoleDashboard } from './src/ceo-operations-console-view.js';

async function main() {
  const container = document.getElementById('app');

  try {
    const response = await fetch('/api/dashboard');
    const payload = await response.json();
    container.innerHTML = renderConsoleDashboard({
      ...(payload.snapshot ?? {}),
      viewModel: payload.viewModel ?? {}
    });
  } catch (error) {
    container.innerHTML = `<div class="panel"><h2>Unable to load dashboard</h2><p>${escapeHtml(error?.message ?? 'Unknown error')}</p></div>`;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

main();
