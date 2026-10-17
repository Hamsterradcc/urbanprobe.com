/* Shared by xurbanai.com and urbanprobe.com — mobile navigation, registry lists, entry pages.
   Data: data/registry.json (entries) and data/schema.json (field order, titles, registry labels).
   Every page carries its own empty or loading state in the HTML, so nothing breaks without JavaScript. */
(function () {
  // ---------------------------------------------------------------- mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function visible(list) { return (list || []).filter(function (e) { return e && e.status !== 'draft'; }); }
  function byNewest(a, b) {
    return String(b.released || '').localeCompare(String(a.released || '')) || String(a.title).localeCompare(String(b.title));
  }
  function entryHref(registry, e) {
    return e.url || ('entry.html?registry=' + encodeURIComponent(registry) + '&id=' + encodeURIComponent(e.id));
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  // Plain text with blank-line paragraphs and bare URLs turned into links.
  function prose(text) {
    return String(text).trim().split(/\n\s*\n/).map(function (para) {
      var safe = esc(para).replace(/\n/g, '<br>');
      safe = safe.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" rel="noopener">$1</a>');
      return '<p>' + safe + '</p>';
    }).join('');
  }

  // ---------------------------------------------------------------- registry lists and counts
  var mounts = document.querySelectorAll('[data-registry]');
  var counts = document.querySelectorAll('[data-count]');
  if (mounts.length || counts.length) {
    getJSON('data/registry.json').catch(function () { return {}; }).then(function (data) {
      mounts.forEach(function (m) {
        var key = m.getAttribute('data-registry');
        var entries = visible(data[key]).sort(byNewest);
        var empty = m.querySelector('.empty');
        if (!entries.length) { if (empty) empty.hidden = false; return; }
        if (empty) empty.hidden = true;
        var list = document.createElement('div');
        list.className = 'registry';
        list.innerHTML = entries.map(function (e) {
          var tags = (e.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
          var status = esc(e.status || 'released');
          return '<a class="entry" href="' + esc(entryHref(key, e)) + '">' +
            '<div><h3>' + esc(e.title) + '</h3><p>' + esc(e.summary) + '</p>' +
            (tags ? '<div class="tags">' + tags + '</div>' : '') + '</div>' +
            '<span class="badge ' + status + '">' + status + (e.version ? ' · v' + esc(e.version) : '') + '</span></a>';
        }).join('');
        m.insertBefore(list, m.firstChild);
      });
      counts.forEach(function (c) {
        var n = visible(data[c.getAttribute('data-count')]).length;
        c.textContent = n ? n + (n === 1 ? ' entry' : ' entries') : 'Open registry';
      });
    });
  }

  // ---------------------------------------------------------------- entry page
  var page = document.querySelector('[data-entry]');
  if (!page) return;

  var q = new URLSearchParams(location.search);
  var regKey = q.get('registry');
  var id = q.get('id');
  var example = q.get('src') === 'example';
  function slot(name) { return page.querySelector('[data-slot="' + name + '"]'); }

  function resolve(schema, prop) {
    var title = prop.title, desc = prop.description, ref = prop.$ref || '';
    while ((title == null || desc == null) && ref.indexOf('#/$defs/') === 0) {
      var target = schema.$defs[ref.split('/').pop()] || {};
      if (title == null) title = target.title;
      if (desc == null) desc = target.description;
      ref = target.$ref || '';
    }
    return { title: title, description: desc };
  }

  function setNav(reg) {
    if (!reg || !nav) return;
    var link = nav.querySelector('a[href="' + reg.page + '"]');
    if (link) link.setAttribute('aria-current', 'page');
  }

  function notFound(reg, siteName) {
    slot('eyebrow').textContent = reg ? 'Registry ' + reg.number + ' / ' + reg.label : 'Registry entry';
    slot('title').textContent = 'Entry not found.';
    slot('summary').textContent = 'No public entry matches this address. It may still be a draft, or the link may be wrong.';
    slot('links').innerHTML = '<a class="button" href="' + esc(reg ? reg.page : 'index.html') + '">' + (reg ? 'Back to ' + esc(reg.label.toLowerCase()) : 'Home') + '</a>';
    slot('release').hidden = true;
    document.title = 'Entry not found — ' + (siteName || document.title);
    setNav(reg);
  }

  Promise.all([getJSON(example ? 'data/examples/registry.json' : 'data/registry.json'), getJSON('data/schema.json')])
    .then(function (res) {
      var data = res[0], schema = res[1];
      var site = schema['x-site'] || {};
      var reg = (schema['x-registries'] || []).filter(function (r) { return r.key === regKey; })[0];
      var entry = reg && (data[reg.key] || []).filter(function (e) { return e.id === id && (example || e.status !== 'draft'); })[0];
      if (!entry) return notFound(reg, site.name);

      setNav(reg);
      document.title = entry.title + ' — ' + reg.label + ' — ' + site.name;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', entry.summary);
      if (example) {
        slot('banner').hidden = false;
        var robots = document.createElement('meta');
        robots.name = 'robots'; robots.content = 'noindex';
        document.head.appendChild(robots);
      }

      slot('eyebrow').innerHTML = '<a href="' + esc(reg.page) + '">Registry ' + esc(reg.number) + ' / ' + esc(reg.label) + '</a>';
      slot('title').textContent = entry.title;
      slot('summary').textContent = entry.summary;
      slot('tags').innerHTML = (entry.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
      slot('links').innerHTML = (entry.links || []).map(function (l, i) {
        var external = /^https?:\/\//.test(l.href);
        return '<a class="button' + (i === 0 ? ' solid primary' : '') + '" href="' + esc(l.href) + '"' + (external ? ' rel="noopener"' : '') + '>' + esc(l.label) + (external ? ' ↗' : '') + '</a>';
      }).join('');

      var rows = [
        ['Status', entry.status],
        ['Version', entry.version ? 'v' + entry.version : ''],
        ['Released', fmtDate(entry.released)],
        ['Updated', fmtDate(entry.updated)],
        ['Licence', entry.license],
        ['Access', entry.access],
        ['Authors', (entry.authors || []).join(', ')]
      ].filter(function (r) { return r[1]; });
      slot('meta').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      slot('status').hidden = false;
      slot('status').querySelector('b').textContent = entry.status;

      if (entry.status === 'deprecated') {
        var n = slot('deprecated');
        n.hidden = false;
        n.innerHTML = 'This entry is deprecated and kept for the record.' + (entry.replaced_by
          ? ' It is replaced by <a href="' + esc(entryHref(reg.key, { id: entry.replaced_by })) + (example ? '&src=example' : '') + '">' + esc(entry.replaced_by) + '</a>.' : '');
      }

      var props = (schema.$defs[reg.card] || {}).properties || {};
      var card = entry.card || {};
      slot('card-heading').textContent = 'The ' + reg.singular + ' card.';
      slot('card').innerHTML = Object.keys(props).map(function (key) {
        var f = resolve(schema, props[key]);
        var body = card[key] ? prose(card[key]) : '<p class="missing">Not documented.</p>';
        return '<div class="rule"><strong>' + esc(f.title) + '</strong><div class="rule-body">' + body + '</div></div>';
      }).join('');
      slot('card-section').hidden = false;

      if (entry.citation) {
        slot('citation').textContent = entry.citation;
        slot('cite-section').hidden = false;
        var btn = page.querySelector('[data-copy]');
        btn.addEventListener('click', function () {
          var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy citation'; }, 1600); };
          if (navigator.clipboard) navigator.clipboard.writeText(entry.citation).then(done, function () {});
        });
      }
    })
    .catch(function () { notFound(null); });
})();
