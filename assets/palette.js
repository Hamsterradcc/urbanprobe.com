/* Shared by xurbanai.com and urbanprobe.com — command palette (Ctrl/Cmd+K).
   Entries, registries, standard fields, research themes, and actions in one box. Needs assets/site.js. */
(() => {
  'use strict';
  const R = window.REG;
  if (!R || typeof HTMLDialogElement !== 'function') return;
  const { esc, link } = R;
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
  const ICON = {
    entry: '<path d="M5 3.5h7l3 3v10H5z"/><path d="M12 3.5v3h3M7.5 10h5M7.5 13h5"/>',
    page: '<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>',
    field: '<path d="M4 6h12M4 10h8M4 14h10"/>',
    theme: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
    action: '<path d="M10 4v12M4 10h12"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;

  document.querySelectorAll('[data-palette]').forEach((b) => {
    b.hidden = false;
    const k = b.querySelector('kbd');
    if (k) k.textContent = isMac ? '⌘K' : 'Ctrl K';
    b.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
  });

  let dialog, input, list, items = [], active = 0, sources = null;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'palette';
    dialog.setAttribute('aria-label', 'Search');
    dialog.innerHTML = `
      <div class="palette-box">
        <svg class="palette-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
        <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search entries, fields, themes…">
        <kbd>esc</kbd>
      </div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Results"></div>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>`;
    document.body.appendChild(dialog);
    input = dialog.querySelector('input');
    list = dialog.querySelector('.palette-list');
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(items[active], e.metaKey || e.ctrlKey); }
    });
    list.addEventListener('mousemove', (e) => { const o = e.target.closest('[role="option"]'); if (o) setActive(+o.dataset.i, false); });
    list.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (o) run(items[+o.dataset.i], e.metaKey || e.ctrlKey); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  }

  function loadSources() {
    if (sources) return sources;
    sources = R.ready.then((ctx) => {
      const repo = ctx.site.repo;
      const entries = ctx.entries.map(({ reg, e }) => ({
        kind: 'entry', title: e.title, sub: `${reg.singular} · ${e.status}${e.version ? ' · v' + e.version : ''}`,
        href: e.url || `entry.html?registry=${reg.key}&id=${e.id}`, extra: [e.summary, e.task, ...(e.tags || []), ...(e.cities || []), ...(e.themes || [])].join(' '),
        date: e.updated || e.released || '',
      }));
      const pages = [
        ...ctx.registries.map((r) => ({ kind: 'page', title: r.label, sub: `Registry ${r.number}`, href: r.page })),
        { kind: 'page', title: 'Standard', sub: 'Every field an entry documents', href: ctx.site.standard || 'standards.html' },
        { kind: 'page', title: 'Home', sub: ctx.site.name, href: 'index.html' },
      ];
      const fields = [];
      ctx.registries.forEach((r) => Object.entries(ctx.schema.$defs[r.card]?.properties || {}).forEach(([key, prop]) => {
        let title = prop.title, ref = prop.$ref || '';
        while (title == null && ref.startsWith('#/$defs/')) { const t = ctx.schema.$defs[ref.split('/').pop()] || {}; title = t.title; ref = t.$ref || ''; }
        fields.push({ kind: 'field', title: title || key, sub: `${r.singular} card · ${key}`, href: `standards.html#${r.key}`, extra: key });
      }));
      const themes = Object.values(ctx.theme).map((t) => ({ kind: 'theme', title: t.label, sub: 'Theme hub on the City Computing Collective', href: `${R.CCC}/theme.html?t=${t.slug}`, external: true }));
      const actions = [
        ...ctx.registries.map((r) => ({ kind: 'action', title: `Propose a ${r.singular}`, sub: 'Opens the proposal form on GitHub', href: `${repo}/issues/new?template=${r.template}`, external: true })),
        { kind: 'action', title: 'Report a correction', sub: 'An error in an entry or in the standard', href: `${repo}/issues/new?template=correction.yml`, external: true },
        { kind: 'action', title: 'Subscribe to releases (RSS)', sub: 'feeds/releases.xml', href: 'feeds/releases.xml' },
      ];
      return { entries, pages, fields, themes, actions };
    });
    return sources;
  }

  function score(item, terms) {
    if (!terms.length) return 1;
    const t = item.title.toLowerCase(), rest = `${item.sub || ''} ${item.extra || ''}`.toLowerCase();
    let s = 0;
    for (const term of terms) {
      if (t.startsWith(term)) s += 4; else if (t.includes(' ' + term)) s += 3; else if (t.includes(term)) s += 2; else if (rest.includes(term)) s += 1; else return 0;
    }
    return s;
  }

  async function render() {
    const src = await loadSources();
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pick = (arr, n) => arr.map((x) => [x, score(x, terms)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x]) => x);
    const groups = terms.length
      ? [['Entries', pick(src.entries, 6)], ['Standard fields', pick(src.fields, 5)], ['Themes', pick(src.themes, 3)], ['Pages', pick(src.pages, 3)], ['Actions', pick(src.actions, 3)]]
      : [['Latest entries', src.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)], ['Pages', src.pages], ['Actions', src.actions]];
    items = [];
    let html = '';
    for (const [label, arr] of groups) {
      if (!arr.length) continue;
      html += `<div class="palette-group" role="presentation"><p class="palette-label" role="presentation">${esc(label)}</p>`;
      for (const it of arr) {
        const i = items.push(it) - 1;
        html += `<div class="palette-item" role="option" id="pal-${i}" data-i="${i}" aria-selected="false">${icon(it.kind)}<span class="palette-text"><strong>${esc(it.title)}</strong>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.external ? '<span class="palette-ext" aria-hidden="true">↗</span>' : ''}</div>`;
      }
      html += '</div>';
    }
    if (!items.length) {
      const q = input.value.trim();
      html = `<div class="palette-empty"><strong>No results for “${esc(q)}”.</strong><p>Nothing in the registries or the standard matches.</p></div>`;
    }
    list.innerHTML = html;
    setActive(0, false);
  }

  function setActive(i, scroll = true) {
    if (!items.length) return;
    active = (i + items.length) % items.length;
    list.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute('aria-selected', String(+o.dataset.i === active)));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
    if (scroll) list.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function run(item, newTab) {
    if (!item) return;
    const href = item.external ? item.href : link(item.href);
    if (newTab) { window.open(href, '_blank', 'noopener'); return; }
    dialog.close();
    location.href = href;
  }

  function open() {
    if (!dialog) build();
    if (dialog.open) return;
    input.value = '';
    dialog.showModal();
    input.focus();
    render();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dialog?.open) dialog.close(); else open(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-palette]')) { e.preventDefault(); open(); } });
})();
