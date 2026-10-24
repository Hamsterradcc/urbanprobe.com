/* Shared by xurbanai.com and urbanprobe.com — navigation, registry browsing, entry pages.

   Data: data/registry.json (entries) and data/schema.json (registries, card fields, facets, themes,
   relations). ?src=example previews with data/examples/registry.json.
   Every page carries its own empty or loading state in the HTML, so nothing breaks without JavaScript.
   assets/palette.js adds the command palette on top of window.REG. */
(() => {
  'use strict';

  const CCC = 'https://citycomputingcollective.com';
  const SITES = { xurbanai: 'https://xurbanai.com', urbanprobe: 'https://urbanprobe.com' };
  const params = new URLSearchParams(location.search);
  const example = params.get('src') === 'example';

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); };
  const link = (href) => (!example || /^(https?:|#)/.test(href) ? href : href + (href.includes('?') ? '&' : '?') + 'src=example');
  const visible = (list) => (list || []).filter((e) => e && e.status !== 'draft');
  const byNewest = (a, b) => String(b.updated || b.released || '').localeCompare(String(a.updated || a.released || '')) || String(a.title).localeCompare(String(b.title));
  function prose(text) {
    return String(text).trim().split(/\n\s*\n/).map((para) => {
      let safe = esc(para).replace(/\n/g, '<br>');
      safe = safe.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" rel="noopener">$1</a>');
      return '<p>' + safe + '</p>';
    }).join('');
  }
  function copy(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
  }

  // ------------------------------------------------------------------ mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => { const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, select, dialog[open]')) return;
    const box = document.querySelector('.reg-search input');
    if (box) { e.preventDefault(); box.focus(); }
  });

  // ------------------------------------------------------------------ data
  const ready = Promise.all([
    getJSON(example ? 'data/examples/registry.json' : 'data/registry.json').catch(() => ({})),
    getJSON('data/schema.json'),
  ]).then(([data, schema]) => {
    const site = schema['x-site'] || {};
    const registries = schema['x-registries'] || [];
    const themes = schema['x-themes'] || [];
    const siteKey = Object.keys(SITES).find((k) => (site.url || '').includes(k)) || '';
    const entries = [];
    registries.forEach((r) => visible(data[r.key]).forEach((e) => entries.push({ reg: r, e })));
    return {
      data, schema, site, siteKey, registries, entries,
      reg: Object.fromEntries(registries.map((r) => [r.key, r])),
      theme: Object.fromEntries(themes.map((t) => [t.slug, t])),
      relations: schema['x-relations'] || {},
    };
  });
  window.REG = { ready, esc, link, example, CCC };

  if (example) {
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.appendChild(robots);
  }

  const entryHref = (regKey, e) => link(e.url || `entry.html?registry=${encodeURIComponent(regKey)}&id=${encodeURIComponent(e.id)}`);
  const refHref = (ctx, ref) => (ref.site && ref.site !== ctx.siteKey
    ? `${SITES[ref.site]}/entry.html?registry=${encodeURIComponent(ref.registry)}&id=${encodeURIComponent(ref.id)}`
    : link(`entry.html?registry=${encodeURIComponent(ref.registry)}&id=${encodeURIComponent(ref.id)}`));
  const findEntry = (ctx, registry, id) => (ctx.data[registry] || []).find((x) => x.id === id && x.status !== 'draft');
  const themeChip = (ctx, slug) => { const t = ctx.theme[slug]; return t ? `<a class="tag theme" href="${CCC}/theme.html?t=${t.slug}" title="Theme hub on the City Computing Collective">${esc(t.label)}</a>` : ''; };
  const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  function facts(ctx, e, opts = {}) {
    const items = [];
    if (e.task) items.push(`<span class="fact"><b>Task</b>${esc(e.task)}</span>`);
    if (e.modalities?.length) items.push(`<span class="fact"><b>Modality</b>${esc(e.modalities.join(', '))}</span>`);
    if (e.spatial_unit) items.push(`<span class="fact"><b>Unit</b>${esc(e.spatial_unit)}</span>`);
    if (e.period) items.push(`<span class="fact"><b>Period</b>${esc(e.period)}</span>`);
    if (e.cities?.length) items.push(`<span class="fact"><b>Places</b>${esc(e.cities.join(', '))}</span>`);
    if (e.formats?.length) items.push(`<span class="fact"><b>Format</b>${esc(e.formats.join(', '))}</span>`);
    if (!opts.short && e.license) items.push(`<span class="fact"><b>Licence</b>${esc(e.license)}</span>`);
    if (!opts.short && e.doi) items.push(`<a class="fact doi" href="https://doi.org/${esc(e.doi)}" rel="noopener"><b>DOI</b>${esc(e.doi)}</a>`);
    return items.join('');
  }

  // ------------------------------------------------------------------ index: counts and latest releases
  ready.then((ctx) => {
    document.querySelectorAll('[data-count]').forEach((c) => {
      const n = visible(ctx.data[c.dataset.count]).length;
      c.textContent = n ? plural(n, 'entry', 'entries') : 'Open registry';
    });
    const latest = document.querySelector('[data-latest]');
    if (latest) {
      const rows = ctx.entries.filter(({ e }) => e.status === 'released').sort((a, b) => byNewest(a.e, b.e)).slice(0, 6);
      if (rows.length) {
        latest.querySelector('[data-slot="list"]').innerHTML = rows.map(({ reg, e }) => `
          <a class="entry" href="${esc(entryHref(reg.key, e))}">
            <div><span class="entry-kind">${esc(reg.singular)}</span><h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p></div>
            <span class="badge">v${esc(e.version || '')} · ${esc(fmtDate(e.updated || e.released))}</span>
          </a>`).join('');
        latest.hidden = false;
      }
    }
  });

  // ------------------------------------------------------------------ registry browser
  document.querySelectorAll('[data-registry]').forEach((mount) => ready.then((ctx) => browser(mount, ctx)).catch(() => {}));

  function browser(mount, ctx) {
    const reg = ctx.reg[mount.dataset.registry];
    const entries = visible(ctx.data[reg.key]);
    const empty = mount.querySelector('.empty');
    if (!entries.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;

    const facets = (reg.facets || []).map((f) => {
      const counts = {};
      entries.forEach((e) => asList(e[f.key]).forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
      const values = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
      return { ...f, values };
    }).filter((f) => f.values.length);
    const label = (f, v) => (f.key === 'themes' ? ctx.theme[v]?.label || v : v);
    const state = { q: params.get('q') || '', sort: ['new', 'az', 'updated'].includes(params.get('sort')) ? params.get('sort') : 'new', sel: {} };
    facets.forEach((f) => { state.sel[f.key] = new Set((params.get(f.key) || '').split(',').filter((v) => f.values.includes(v))); });

    mount.insertAdjacentHTML('afterbegin', `
      <div class="reg-browser${facets.length ? '' : ' no-facets'}">
        ${facets.length ? `<details class="facets" ${matchMedia('(min-width: 900px)').matches ? 'open' : ''}><summary>Filters <span data-slot="active"></span></summary><div class="facet-groups">${facets.map((f) => `
          <fieldset class="facet" data-facet="${esc(f.key)}"><legend>${esc(f.label)}</legend>${f.values.map((v) => `
            <label class="facet-opt"><input type="checkbox" value="${esc(v)}"><span>${esc(label(f, v))}</span><small></small></label>`).join('')}
          </fieldset>`).join('')}</div></details>` : ''}
        <div class="reg-main">
          <div class="reg-controls">
            <label class="reg-search"><span class="visually-hidden">Search ${esc(reg.label.toLowerCase())}</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" placeholder="Search ${esc(reg.label.toLowerCase())}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
            <label class="reg-sort"><span>Sort</span><select><option value="new">Newest release</option><option value="updated">Recently updated</option><option value="az">A–Z</option></select></label>
          </div>
          <div class="reg-meta"><p class="reg-count" aria-live="polite"></p><button type="button" class="link-btn reg-clear" hidden>Clear filters</button></div>
          <div class="registry"></div>
        </div>
      </div>`);
    const $ = (s) => mount.querySelector(s);
    const input = $('.reg-search input');
    const sortSel = $('.reg-sort select');
    const list = $('.registry');
    input.value = state.q;
    sortSel.value = state.sort;
    mount.querySelectorAll('.facet').forEach((fs) => fs.querySelectorAll('input').forEach((cb) => { cb.checked = state.sel[fs.dataset.facet].has(cb.value); }));

    const hay = new Map(entries.map((e) => [e, [e.title, e.summary, e.task, ...(e.tags || []), ...(e.cities || []), ...(e.modalities || []), ...(e.themes || []).map((t) => ctx.theme[t]?.label || t), ...Object.values(e.card || {})].join(' ').toLowerCase()]));
    const passText = (e) => state.q.trim().toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.get(e).includes(t));
    const passFacet = (e, skip) => facets.every((f) => f.key === skip || !state.sel[f.key].size || asList(e[f.key]).some((v) => state.sel[f.key].has(v)));
    const sorts = {
      az: (a, b) => a.title.localeCompare(b.title),
      updated: (a, b) => String(b.updated || b.released || '').localeCompare(String(a.updated || a.released || '')),
      new: (a, b) => String(b.released || '').localeCompare(String(a.released || '')),
    };

    function render() {
      const shown = entries.filter((e) => passText(e) && passFacet(e)).sort(sorts[state.sort]);
      facets.forEach((f) => {
        const base = entries.filter((e) => passText(e) && passFacet(e, f.key));
        mount.querySelectorAll(`.facet[data-facet="${CSS.escape(f.key)}"] .facet-opt`).forEach((opt) => {
          const v = opt.querySelector('input').value;
          const n = base.filter((e) => asList(e[f.key]).includes(v)).length;
          opt.querySelector('small').textContent = n;
          opt.classList.toggle('zero', n === 0 && !state.sel[f.key].has(v));
        });
      });
      const activeN = facets.reduce((s, f) => s + state.sel[f.key].size, 0);
      const act = $('[data-slot="active"]'); if (act) act.textContent = activeN ? `(${activeN})` : '';
      const active = activeN > 0 || !!state.q.trim();
      $('.reg-count').textContent = active ? `${plural(shown.length, 'entry', 'entries')} of ${entries.length}` : plural(entries.length, 'entry', 'entries');
      $('.reg-clear').hidden = !active;
      list.innerHTML = shown.length ? shown.map((e) => `
        <a class="entry" href="${esc(entryHref(reg.key, e))}">
          <div>
            <h3>${esc(e.title)}</h3><p>${esc(e.summary)}</p>
            ${facts(ctx, e, { short: true }) ? `<div class="facts compact">${facts(ctx, e, { short: true })}</div>` : ''}
            ${(e.themes || []).length ? `<div class="tags">${e.themes.map((t) => `<span class="tag">${esc(ctx.theme[t]?.label || t)}</span>`).join('')}</div>` : ''}
          </div>
          <span class="badge ${esc(e.status)}">${esc(e.status)}${e.version ? ' · v' + esc(e.version) : ''}</span>
        </a>`).join('') : '<div class="no-match"><strong>Nothing matches.</strong><p>Try another word, or clear some filters.</p><button type="button" class="button" data-clear>Clear filters</button></div>';
      const p = new URLSearchParams(location.search);
      const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
      set('q', state.q.trim()); set('sort', state.sort !== 'new' ? state.sort : '');
      facets.forEach((f) => set(f.key, [...state.sel[f.key]].join(',')));
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; render(); }, 120); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; state.q = ''; render(); } });
    sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
    mount.addEventListener('change', (e) => {
      const cb = e.target.closest('.facet input'); if (!cb) return;
      const key = cb.closest('.facet').dataset.facet;
      if (cb.checked) state.sel[key].add(cb.value); else state.sel[key].delete(cb.value);
      render();
    });
    const reset = () => { state.q = ''; input.value = ''; facets.forEach((f) => state.sel[f.key].clear()); mount.querySelectorAll('.facet input').forEach((cb) => { cb.checked = false; }); render(); };
    $('.reg-clear').addEventListener('click', reset);
    mount.addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) reset(); });
    render();
  }

  // ------------------------------------------------------------------ entry page
  const page = document.querySelector('[data-entry]');
  if (page) ready.then(renderEntry).catch(() => notFound(null));

  function slot(name) { return page.querySelector(`[data-slot="${name}"]`); }

  function resolveField(schema, prop) {
    let title = prop.title, desc = prop.description, ref = prop.$ref || '';
    while ((title == null || desc == null) && ref.startsWith('#/$defs/')) {
      const target = schema.$defs[ref.split('/').pop()] || {};
      if (title == null) title = target.title;
      if (desc == null) desc = target.description;
      ref = target.$ref || '';
    }
    return { title, desc };
  }

  function notFound(reg, siteName) {
    slot('eyebrow').textContent = reg ? `Registry ${reg.number} / ${reg.label}` : 'Registry entry';
    slot('title').textContent = 'Entry not found.';
    slot('summary').textContent = 'No public entry matches this address. It may still be a draft, or the link may be wrong.';
    slot('links').innerHTML = `<a class="button" href="${esc(link(reg ? reg.page : 'index.html'))}">${reg ? 'Back to ' + esc(reg.label.toLowerCase()) : 'Home'}</a>`;
    slot('release').hidden = true;
    document.title = 'Entry not found — ' + (siteName || document.title);
  }

  function renderEntry(ctx) {
    const reg = ctx.reg[params.get('registry')];
    const id = params.get('id');
    const e = reg && (ctx.data[reg.key] || []).find((x) => x.id === id && (example || x.status !== 'draft'));
    if (!e) return notFound(reg, ctx.site.name);
    const one = reg.singular;
    nav?.querySelector(`a[href="${reg.page}"]`)?.setAttribute('aria-current', 'page');
    document.title = `${e.title} — ${reg.label} — ${ctx.site.name}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', e.summary);
    if (example) slot('banner').hidden = false;

    slot('eyebrow').innerHTML = `<a href="${esc(link(reg.page))}">Registry ${esc(reg.number)} / ${esc(reg.label)}</a>`;
    slot('title').textContent = e.title;
    slot('summary').textContent = e.summary;
    slot('facts').innerHTML = facts(ctx, e);
    slot('tags').innerHTML = [...(e.themes || []).map((t) => themeChip(ctx, t)), ...(e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`)].join('');
    slot('links').innerHTML = (e.links || []).map((l, i) => {
      const ext = /^https?:\/\//.test(l.href);
      return `<a class="button${i === 0 ? ' solid primary' : ''}" href="${esc(ext ? l.href : link(l.href))}"${ext ? ' rel="noopener"' : ''}>${esc(l.label)}${ext ? ' ↗' : ''}</a>`;
    }).join('');
    slot('meta').innerHTML = [['Status', e.status], ['Version', e.version ? 'v' + e.version : ''], ['Released', fmtDate(e.released)], ['Updated', fmtDate(e.updated)],
      ['Licence', e.license], ['Access', e.access], ['Authors', (e.authors || []).join(', ')]].filter((r) => r[1]).map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('');
    slot('status').hidden = false;
    slot('status').querySelector('b').textContent = e.status;
    if (e.status === 'deprecated') {
      const n = slot('deprecated'); n.hidden = false;
      n.innerHTML = 'This entry is deprecated and kept for the record.' + (e.replaced_by ? ` It is replaced by <a href="${esc(entryHref(reg.key, { id: e.replaced_by }))}">${esc(findEntry(ctx, reg.key, e.replaced_by)?.title || e.replaced_by)}</a>.` : '');
    }

    const sections = [];
    // card
    const props = (ctx.schema.$defs[reg.card] || {}).properties || {};
    if (e.card) sections.push(['card', 'Card', `The ${one} card`, `<div class="rules">${Object.keys(props).map((k) => {
      const f = resolveField(ctx.schema, props[k]);
      return `<div class="rule"><strong>${esc(f.title)}</strong><div class="rule-body">${e.card[k] ? prose(e.card[k]) : '<p class="missing">Not documented.</p>'}</div></div>`;
    }).join('')}</div><div class="actions"><a class="button ghost" href="${esc(link('standards.html#' + reg.key))}">What each field means</a></div>`]);
    // leaderboard on benchmarks; results on benchmarks for systems that appear on one
    if (e.leaderboard?.results?.length) sections.push(['leaderboard', 'Leaderboard', 'Leaderboard', '<div data-slot="board"></div>']);
    const onBoards = [];
    ctx.registries.forEach((r) => visible(ctx.data[r.key]).forEach((b) => (b.leaderboard?.results || []).forEach((res) => {
      const ref = res.system_ref;
      if (ref && !ref.site && ref.registry === reg.key && ref.id === e.id) onBoards.push({ r, b, res });
    })));
    if (onBoards.length) sections.push(['results', 'Results', 'Results on benchmarks', `<div class="table-wrap"><table class="board"><thead><tr><th>Benchmark</th><th>Scores</th><th>Rank</th><th>Date</th></tr></thead><tbody>${onBoards.map(({ r, b, res }) => {
      const m = b.leaderboard.metrics[0];
      const ranked = b.leaderboard.results.filter((x) => !x.baseline && x.scores[m.key] != null).sort((x, y) => (m.higher_is_better ? y.scores[m.key] - x.scores[m.key] : x.scores[m.key] - y.scores[m.key]));
      const rank = ranked.indexOf(res) + 1;
      return `<tr><td class="sys"><a href="${esc(entryHref(r.key, b))}#leaderboard">${esc(b.title)}</a></td><td>${b.leaderboard.metrics.map((mm) => `<span class="score-pill">${esc(mm.label)} <b>${res.scores[mm.key] == null ? '—' : Number(res.scores[mm.key]).toFixed(mm.decimals ?? 2)}${esc(mm.unit || '')}</b></span>`).join(' ')}</td><td>${rank ? `${rank} of ${ranked.length}` : '—'}<small> by ${esc(m.label)}</small></td><td class="date">${esc(fmtDate(res.date))}</td></tr>`;
    }).join('')}</tbody></table></div>`]);
    // data
    if (e.preview) sections.push(['preview', 'Preview', 'Data preview', '<div data-slot="preview"><p class="preview-note">Loading the sample…</p></div>']);
    if (e.variables?.length) sections.push(['variables', 'Variables', 'Variables', `<div class="table-wrap"><table class="dict"><thead><tr><th>Name</th><th>Type</th><th>Unit</th><th>Description</th></tr></thead><tbody>${e.variables.map((v) => `<tr><td><code>${esc(v.name)}</code></td><td>${esc(v.type)}</td><td>${esc(v.unit || '')}</td><td>${esc(v.description)}</td></tr>`).join('')}</tbody></table></div>`]);
    if (e.distributions?.length) sections.push(['files', 'Files', 'Files', `<ul class="files">${e.distributions.map((d) => {
      const ext = /^https?:/.test(d.href);
      return `<li><span class="format">${esc(d.format)}</span><a href="${esc(d.href)}"${ext ? ' rel="noopener"' : ' download'}>${esc(d.label || d.href.split('/').pop())}${ext ? ' ↗' : ''}</a>${d.size ? `<small>${esc(d.size)}</small>` : ''}</li>`;
    }).join('')}</ul>`]);
    // usage
    if (e.usage) sections.push(['use', 'Use', reg.key === 'methods' ? 'Run this method' : `Use this ${one}`, `<div class="code-block"><button type="button" class="copy-btn" data-copy-usage>Copy</button><pre><code>${esc(e.usage)}</code></pre></div>`]);
    // related, both directions
    const rel = [];
    (e.related || []).forEach((r) => rel.push({ label: ctx.relations[r.relation]?.label || r.relation, ref: r }));
    ctx.registries.forEach((r) => visible(ctx.data[r.key]).forEach((x) => (x.related || []).forEach((l) => {
      if (!l.site && l.registry === reg.key && l.id === e.id) rel.push({ label: ctx.relations[l.relation]?.inverse || l.relation, ref: { registry: r.key, id: x.id } });
    })));
    if (rel.length) {
      const groups = {};
      rel.forEach((x) => { (groups[x.label] = groups[x.label] || []).push(x.ref); });
      sections.push(['related', 'Related', 'Related entries', `<div class="related">${Object.entries(groups).map(([label, refs]) => `
        <div class="related-group"><h3>${esc(label)}</h3>${refs.map((ref) => {
          const local = !ref.site || ref.site === ctx.siteKey;
          const x = local ? findEntry(ctx, ref.registry, ref.id) : null;
          const kind = local ? (ctx.reg[ref.registry]?.singular || ref.registry) : `${ref.site} · ${ref.registry}`;
          return `<a class="related-card" href="${esc(refHref(ctx, ref))}"><span>${esc(kind)}</span><strong>${esc(x?.title || ref.id)}</strong>${x?.summary ? `<small>${esc(x.summary)}</small>` : ''}</a>`;
        }).join('')}</div>`).join('')}</div>`]);
    }
    // versions
    if (e.changelog?.length) sections.push(['versions', 'Versions', 'Versions', `<ol class="timeline">${e.changelog.slice().sort((a, b) => b.date.localeCompare(a.date)).map((c) => `
      <li class="${c.version === e.version ? 'current' : ''}"><span class="v">v${esc(c.version)}${c.version === e.version ? ' · current' : ''}</span><time>${esc(fmtDate(c.date))}</time><p>${esc(c.note)}</p></li>`).join('')}</ol>`]);
    // cite
    if (e.citation) {
      const year = (e.released || '').slice(0, 4);
      const key = `${ctx.siteKey || 'entry'}_${e.id.replace(/-/g, '_')}_${(e.version || '').replace(/\./g, '_')}`;
      const url = `${ctx.site.url}/entry.html?registry=${reg.key}&id=${e.id}`;
      const bib = [`@misc{${key},`, `  title = {${e.title}},`, e.authors?.length ? `  author = {${e.authors.join(' and ')}},` : '', year ? `  year = {${year}},` : '',
        e.version ? `  version = {${e.version}},` : '', `  howpublished = {${ctx.site.name}, ${reg.label} registry},`, e.doi ? `  doi = {${e.doi}},` : '', `  url = {${url}}`, '}'].filter(Boolean).join('\n');
      sections.push(['cite', 'Cite', `Cite this ${one}`, `<div class="cite-tabs" role="tablist" aria-label="Citation format"><button type="button" role="tab" aria-selected="true" data-cite="text">Text</button><button type="button" role="tab" aria-selected="false" data-cite="bibtex">BibTeX</button></div>
        <div class="code-block"><button type="button" class="copy-btn" data-copy-cite>Copy</button><pre class="cite" data-cite-text>${esc(e.citation)}</pre><pre class="cite" data-cite-bibtex hidden>${esc(bib)}</pre></div>`]);
    }

    slot('sections').innerHTML = sections.map(([idv, , title, body]) => `<section id="${idv}" class="entry-section"><h2>${esc(title)}</h2>${body}</section>`).join('');
    slot('toc').innerHTML = sections.map(([idv, short]) => `<a href="#${idv}">${esc(short)}</a>`).join('');
    slot('toc').hidden = sections.length < 2;
    tocSpy();

    if (e.leaderboard?.results?.length) leaderboard(slot('board'), ctx, e);
    if (e.preview) preview(slot('preview'), e);
    page.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-copy-usage]')) copy(e.usage, ev.target.closest('button'));
      const tab = ev.target.closest('[data-cite]');
      if (tab) {
        page.querySelectorAll('[data-cite]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        page.querySelector('[data-cite-text]').hidden = tab.dataset.cite !== 'text';
        page.querySelector('[data-cite-bibtex]').hidden = tab.dataset.cite !== 'bibtex';
      }
      if (ev.target.closest('[data-copy-cite]')) copy(page.querySelector('.cite:not([hidden])').textContent, ev.target.closest('button'));
    });
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    jsonld(ctx, reg, e);
  }

  // highlight the section in view, as documentation sites do
  function tocSpy() {
    const toc = slot('toc');
    if (toc.hidden || !('IntersectionObserver' in window)) return;
    const links = [...toc.querySelectorAll('a')];
    const io = new IntersectionObserver((items) => {
      items.forEach((it) => {
        if (!it.isIntersecting) return;
        links.forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + it.target.id));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    page.querySelectorAll('.entry-section').forEach((s) => io.observe(s));
  }

  function leaderboard(el, ctx, e) {
    const { metrics, results } = e.leaderboard;
    const state = { key: metrics[0].key, verifiedOnly: false };
    const fmt = (m, v) => (v == null ? '—' : Number(v).toFixed(m.decimals ?? 2) + (m.unit || ''));
    function draw() {
      const m = metrics.find((x) => x.key === state.key);
      const rows = results.filter((r) => !state.verifiedOnly || r.verified !== false);
      const dir = m.higher_is_better ? -1 : 1;
      rows.sort((a, b) => (a.scores[m.key] == null) - (b.scores[m.key] == null) || dir * ((a.scores[m.key] ?? 0) - (b.scores[m.key] ?? 0)));
      const ranked = rows.filter((r) => !r.baseline && r.scores[m.key] != null);
      const best = {};
      metrics.forEach((mm) => {
        const vals = rows.filter((r) => !r.baseline && r.scores[mm.key] != null).map((r) => r.scores[mm.key]);
        if (vals.length) best[mm.key] = mm.higher_is_better ? Math.max(...vals) : Math.min(...vals);
      });
      const vals = rows.map((r) => r.scores[m.key]).filter((v) => v != null);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      el.innerHTML = `
        <div class="board-tools"><p>Sorted by <b>${esc(m.label)}</b>, ${m.higher_is_better ? 'higher is better' : 'lower is better'}. Select a column to re-rank. Baselines are shown for reference and not ranked.</p>
          <label class="check"><input type="checkbox" ${state.verifiedOnly ? 'checked' : ''} data-verified> Verified only</label></div>
        <div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>System</th>${metrics.map((mm) => `<th aria-sort="${mm.key === state.key ? (mm.higher_is_better ? 'descending' : 'ascending') : 'none'}"><button type="button" data-metric="${esc(mm.key)}">${esc(mm.label)} <span aria-hidden="true">${mm.higher_is_better ? '↑' : '↓'}</span></button></th>`).join('')}<th>Date</th></tr></thead>
        <tbody>${rows.map((r) => {
          const rank = ranked.indexOf(r) + 1;
          const sys = r.system_ref ? `<a href="${esc(refHref(ctx, r.system_ref))}">${esc(r.system)}</a>` : (r.link ? `<a href="${esc(r.link)}" rel="noopener">${esc(r.system)} ↗</a>` : esc(r.system));
          const tags = `${r.baseline ? ' <span class="pill">baseline</span>' : ''}${r.verified === false ? ' <span class="pill warn">unverified</span>' : r.verified ? ' <span class="pill ok" title="Reproduced from the released artifacts">verified</span>' : ''}`;
          return `<tr class="${r.baseline ? 'is-baseline' : ''}${rank === 1 ? ' is-top' : ''}"><td class="rank">${rank || '—'}</td><td class="sys">${sys}${tags}${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</td>${metrics.map((mm) => {
            const v = r.scores[mm.key];
            const isBest = v != null && !r.baseline && v === best[mm.key];
            const bar = mm.key === state.key && v != null && hi > lo ? `<i style="width:${Math.round(((v - lo) / (hi - lo)) * 100)}%"></i>` : '';
            return `<td class="num${isBest ? ' best' : ''}${mm.key === state.key ? ' sorted' : ''}">${bar}<span>${fmt(mm, v)}</span></td>`;
          }).join('')}<td class="date">${esc(fmtDate(r.date))}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-metric]'); if (b) { state.key = b.dataset.metric; draw(); el.querySelector(`[data-metric="${CSS.escape(state.key)}"]`)?.focus(); } });
    el.addEventListener('change', (ev) => { if (ev.target.matches('[data-verified]')) { state.verifiedOnly = ev.target.checked; draw(); } });
    draw();
  }

  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  }

  // Kaggle / Hugging Face style viewer: first rows plus per-column statistics
  function preview(el, e) {
    const url = e.preview;
    fetch(url).then((r) => { if (!r.ok) throw new Error(); if (+r.headers.get('content-length') > 1.5e6) throw new Error('too large'); return r.text(); }).then((text) => {
      const [head, ...body] = parseCSV(text);
      const cols = head.map((name, j) => {
        const vals = body.map((r) => r[j] ?? '');
        const present = vals.filter((v) => v !== '');
        const nums = present.map(Number);
        const numeric = present.length > 0 && nums.every((v) => !isNaN(v));
        const col = { name, missing: vals.length - present.length, numeric };
        if (numeric) {
          col.min = Math.min(...nums); col.max = Math.max(...nums); col.mean = nums.reduce((s, v) => s + v, 0) / nums.length;
          col.year = nums.every((v) => Number.isInteger(v) && v >= 1800 && v <= 2100);
          col.bins = new Array(12).fill(0);
          nums.forEach((v) => { col.bins[Math.min(11, Math.floor(((v - col.min) / ((col.max - col.min) || 1)) * 12))]++; });
        } else {
          const counts = {}; present.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
          col.unique = Object.keys(counts).length;
          col.top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        }
        return col;
      });
      const nfmt = (v, big) => (big ? Math.round(v).toLocaleString('en-GB') : Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2));
      const spark = (bins) => { const mx = Math.max(...bins) || 1; return `<svg class="hist" viewBox="0 0 60 18" aria-hidden="true">${bins.map((b, i) => `<rect x="${i * 5}" y="${(18 - (b / mx) * 18).toFixed(1)}" width="4" height="${((b / mx) * 18).toFixed(1)}"/>`).join('')}</svg>`; };
      const shown = body.slice(0, 12);
      el.innerHTML = `
        <p class="preview-note">${plural(body.length, 'row')} and ${plural(head.length, 'column')} in the sample file. Showing the first ${shown.length}. <a href="${esc(url)}" download>Download the sample</a></p>
        <div class="table-wrap"><table class="preview"><thead><tr>${cols.map((c) => `<th class="${c.numeric ? 'num' : ''}"><code>${esc(c.name)}</code><div class="colstat">${c.numeric
          ? (c.year ? `${spark(c.bins)}<span>${c.min} – ${c.max}</span>` : `${spark(c.bins)}<span>${nfmt(c.min, c.max >= 10000)} – ${nfmt(c.max, c.max >= 10000)}</span><span>mean ${nfmt(c.mean, c.max >= 10000)}</span>`)
          : `<span>${plural(c.unique, 'value')}</span>${c.top ? `<span>top: ${esc(c.top[0])}</span>` : ''}`}${c.missing ? `<span class="miss">${c.missing} missing</span>` : ''}</div></th>`).join('')}</tr></thead>
        <tbody>${shown.map((r) => `<tr>${head.map((_, j) => `<td class="${cols[j].numeric ? 'num' : ''}">${r[j] === '' || r[j] == null ? '<span class="null">null</span>' : esc(r[j])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }).catch(() => { el.innerHTML = `<p class="preview-note">The sample could not be shown here. <a href="${esc(url)}">Download it</a> instead.</p>`; });
  }

  // schema.org metadata, so dataset search engines and scholarly crawlers can index entries
  function jsonld(ctx, reg, e) {
    const url = `${ctx.site.url}/entry.html?registry=${reg.key}&id=${e.id}`;
    const isData = ['datasets', 'indicators', 'benchmarks'].includes(reg.key);
    const ld = {
      '@context': 'https://schema.org', '@type': isData ? 'Dataset' : 'SoftwareSourceCode', name: e.title, description: e.summary, url,
      version: e.version, datePublished: e.released, dateModified: e.updated || e.released, license: e.license,
      creator: (e.authors || []).map((name) => ({ '@type': 'Person', name })),
      keywords: [...(e.tags || []), ...(e.themes || []).map((t) => ctx.theme[t]?.label || t)],
      citation: e.citation, isPartOf: { '@type': isData ? 'DataCatalog' : 'WebSite', name: ctx.site.name, url: ctx.site.url },
    };
    if (e.doi) ld.identifier = `https://doi.org/${e.doi}`;
    if (isData) {
      ld.isAccessibleForFree = true;
      if (e.cities?.length) ld.spatialCoverage = e.cities.map((name) => ({ '@type': 'Place', name }));
      if (e.period) ld.temporalCoverage = e.period.replace('–', '/');
      if (e.variables?.length) ld.variableMeasured = e.variables.map((v) => ({ '@type': 'PropertyValue', name: v.name, description: v.description, unitText: v.unit || undefined }));
      if (e.distributions?.length) ld.distribution = e.distributions.map((d) => ({ '@type': 'DataDownload', encodingFormat: d.format, contentUrl: /^https?:/.test(d.href) ? d.href : `${ctx.site.url}/${d.href}` }));
    } else if (e.links?.[0]) ld.codeRepository = e.links[0].href;
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
  }
})();
