/* UrbanProbe — mobile navigation + registry rendering (no dependencies) */
(function () {
  // Mobile nav
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

  // Registry: data/registry.json → entry lists on registry pages, counts on the index.
  // Pages work without this file: the empty state is in the HTML and is hidden only when entries exist.
  var mounts = document.querySelectorAll('[data-registry]');
  var counts = document.querySelectorAll('[data-count]');
  if (!mounts.length && !counts.length) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function visible(list) { return (list || []).filter(function (e) { return e.status !== 'draft'; }); }

  function renderList(mount, entries) {
    var empty = mount.querySelector('.empty');
    if (!entries.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var html = entries.map(function (e) {
      var tags = (e.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
      var status = esc(e.status || 'released');
      return '<a class="entry" href="' + esc(e.url || '#') + '">' +
        '<div><h3>' + esc(e.title) + '</h3><p>' + esc(e.summary) + '</p>' +
        (tags ? '<div class="tags">' + tags + '</div>' : '') + '</div>' +
        '<span class="badge ' + status + '">' + status + (e.version ? ' · ' + esc(e.version) : '') + '</span></a>';
    }).join('');
    var list = document.createElement('div');
    list.className = 'registry';
    list.innerHTML = html;
    mount.insertBefore(list, mount.firstChild);
  }

  function apply(data) {
    mounts.forEach(function (m) { renderList(m, visible(data[m.getAttribute('data-registry')])); });
    counts.forEach(function (c) {
      var n = visible(data[c.getAttribute('data-count')]).length;
      c.textContent = n ? n + (n === 1 ? ' entry' : ' entries') : 'Open registry';
    });
  }

  fetch('data/registry.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(apply)
    .catch(function () { apply({}); });
})();
