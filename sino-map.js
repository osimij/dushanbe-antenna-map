/* Final installation register: exact building matches and an explicit review queue. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const fmt = Intl.NumberFormat('ru-RU').format;
  const normalize = (s) => String(s).toLowerCase().replace(/[ёӣӯқҳҷ]/g, c => ({ё:'е',ӣ:'и',ӯ:'у',қ:'к',ҳ:'х',ҷ:'ч'}[c])).replace(/\s+/g, ' ').trim();
  const mobileQuery = matchMedia('(max-width: 720px)');
  const mobile = () => mobileQuery.matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reasons = {
    missing_house: 'В реестре нет номера дома', block_unverified: 'Нужно уточнить корпус / блок',
    not_found: 'Точный дом не найден в каталоге', outside_sino: 'Найденный адрес находится за границей Сино',
    ambiguous: 'Этому адресу соответствует несколько зданий', id_conflict: 'Один ID указан по разным адресам',
  };
  const buildings = new Map(SINO_DATA.buildings.map(b => [b.key, b]));
  const groups = new Map();
  for (const module of SINO_DATA.modules) {
    const b = buildings.get(module.key);
    // One marker per physical building. Multiple modules never scatter into neighbouring houses.
    const key = module.status === 'matched' ? b.buildingId : module.key || `conflict:${module.id}`;
    if (!groups.has(key)) groups.set(key, {key, building: b, status: module.status, modules: [],
      title: b ? [b.street, b.house].filter(Boolean).join(', ') : `Module ID ${module.id}`});
    groups.get(key).modules.push(module);
  }
  const byTitle = new Intl.Collator('ru').compare;
  const entries = [...groups.values()].sort((a,b) => b.modules.length - a.modules.length || byTitle(a.title, b.title));
  entries.forEach((group, i) => {
    group.idx = i;
    group.search = normalize(group.title + ' ' + group.modules.flatMap(m => [m.id, ...m.sources.map(s => s.address)]).join(' '));
  });
  const mappedGroups = entries.filter(g => g.status === 'matched');
  for (const group of mappedGroups) {
    const gateways = new Set(group.modules.map(m => m.gateway));
    group.color = gateways.size === 1 ? GATEWAYS[[...gateways][0]]?.color || '#63666f' : '#1d1d1f';
  }
  const gatewayCounts = GATEWAYS.map(() => 0);
  for (const m of SINO_DATA.modules) if (m.gateway >= 0 && m.gateway < gatewayCounts.length) gatewayCounts[m.gateway]++;
  const issueSearch = SINO_DATA.idIssues.map(i => normalize(i.address + ' ' + i.rawModule));
  const towerSearch = GATEWAYS.map(h => normalize(`${h.name} ${h.gatewayId} ${h.addr}`));

  let query = '', parts = [], status = 'all', tab = 'addresses', selected = null, cache = null;
  let map, renderer, boundary, dotsLayer, towerLayer, radiusLayer, sheet;
  const summary = SINO_DATA.summary;
  $('stAnt').textContent = $('shAnt').textContent = fmt(summary.modules);
  $('stMapped').textContent = fmt(summary.mapped);
  $('stPending').textContent = fmt(summary.pending);
  $('stBuildings').textContent = fmt(mappedGroups.length);
  $('nAddresses').textContent = fmt(entries.length);
  $('sourceNote').textContent = `${fmt(summary.declaredModules)} модулей по реестру · ${fmt(summary.sourceRecords)} записей. ${fmt(summary.modules)} уникальных полных ID; ${fmt(summary.duplicateOccurrences)} повторов. Ещё ${fmt(summary.unrecognizedModules)} из заявленного количества требуют сверки (${fmt(summary.idIssues)} строк). Точки — здания с точным совпадением адреса.`;

  const matchQuery = (value) => parts.every(part => value.includes(part));
  function visibleGroups() {
    if (!cache) cache = entries.filter(g => (status === 'all' || (status === 'mapped') === (g.status === 'matched')) && matchQuery(g.search));
    return cache;
  }
  function sourceText(source) {
    return `${SINO_DATA.files[source.file]} · ${source.sheet} · строка ${source.row}`;
  }
  function gatewayText(module) {
    const h = GATEWAYS[module.gateway];
    return h ? `<span class="gateway-tag" style="background:${h.color}"></span>${esc(h.name)}<small>${esc(h.gatewayId)}</small>` : 'Нет в списке вышек';
  }

  /* ─────────────── details: centred dialog on desktop, swipeable sheet on phones ─────────────── */
  const dialog = $('addressDetails');
  function showDetails(html) {
    // On phones the list sheet is about to collapse; don't hand focus back to an off-screen row.
    if (mobile()) document.activeElement?.blur?.();
    $('detailsContent').innerHTML = html;
    $('detailsContent').scrollTop = 0;
    dialog.classList.remove('closing');
    dialog.style.transform = '';
    if (!dialog.open) dialog.showModal();
  }
  function closeDetails() {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    if (UI.reduceMotion()) { dialog.close(); return; }
    dialog.classList.add('closing');
    const done = () => { if (dialog.classList.contains('closing')) dialog.close(); };
    dialog.addEventListener('animationend', function end(e) {
      if (e.target !== dialog || e.pseudoElement) return;
      dialog.removeEventListener('animationend', end); done();
    });
    setTimeout(done, 450);
  }
  dialog.addEventListener('close', () => { dialog.classList.remove('closing', 'dragging'); dialog.style.transform = ''; });
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeDetails(); });
  dialog.addEventListener('click', e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDetails();
  });
  $('closeDetails').onclick = closeDetails;
  UI.dragY($('detailsBar'), {
    enabled: (e) => mobile() && !e.target.closest('button'),
    start() { dialog.classList.add('dragging'); },
    move(dy) { dialog.style.transform = `translateY(${dy > 0 ? dy : -UI.rubber(-dy) / 3}px)`; },
    end(dy, v) {
      dialog.classList.remove('dragging');
      if (dy > dialog.offsetHeight * .22 || v > .45) { closeDetails(); return; }
      dialog.style.transition = 'transform .3s var(--ease)';
      dialog.style.transform = '';
      setTimeout(() => { dialog.style.transition = ''; }, 320);
    },
  });

  function openDetails(group) {
    const b = group.building;
    showDetails(`<h2 id="detailsTitle">${esc(group.title)}</h2>`
      + `<p>${fmt(group.modules.length)} модулей. ${group.status === 'matched' ? 'Точный адрес здания найден в 2GIS.' : esc(reasons[group.status]) + '. Точка на карте не ставится до уточнения.'}</p>`
      + (group.status === 'matched' ? `<p class="detail-meta">${esc(b.mapAddress)} · ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}</p><div class="detail-actions"><a href="${esc(b.url)}" target="_blank" rel="noopener">Здание в 2GIS ↗</a><a href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}" target="_blank" rel="noopener">Google Maps ↗</a></div>` : '')
      + '<table class="module-table"><thead><tr><th>Module ID</th><th>Адрес в реестре</th><th>Вышка</th></tr></thead><tbody>'
      + group.modules.map(m => `<tr><td>${esc(m.id)}</td><td>${m.sources.map(s => `${esc(s.address)}<small>${esc(sourceText(s))}</small>`).join('<br>')}</td><td>${gatewayText(m)}</td></tr>`).join('') + '</tbody></table>');
  }
  function openIssue(issue) {
    showDetails(`<h2 id="detailsTitle">Нужно уточнить Module ID</h2><p>${esc(issue.address)}</p><p class="issue-id">Запись в источнике: <b>${esc(issue.rawModule)}</b></p><p class="detail-meta">${esc(sourceText(issue))}</p><p>По реестру: ${fmt(issue.declaredCount)}. Распознано полных ID: ${fmt(issue.recognizedCount)}. Полные ID учтены отдельно; недостающие цифры не добавлялись.</p>`);
  }

  /* ─────────────── camera: glide to places, keep them clear of the panel and sheets ─────────────── */
  function visibleArea() {
    const size = map.getSize(), area = {left: 0, top: 0, right: size.x, bottom: size.y};
    if (mobile()) {
      const covered = dialog.open ? dialog.offsetHeight : sheet.collapsed() ? sheet.peek() : $('panel').offsetHeight;
      area.bottom = Math.max(size.y * .3, size.y - covered);
      if ($('mapError').classList.contains('show')) area.top = Math.min(area.bottom - 60, $('mapError').offsetTop + $('mapError').offsetHeight);
    } else if (!document.body.classList.contains('panel-hidden')) {
      area.left = $('panel').offsetLeft + $('panel').offsetWidth;
    }
    return area;
  }
  function moveTo(center, zoom) {
    if (UI.reduceMotion()) { map.setView(center, zoom, {animate: false}); return; }
    const size = map.getSize(), z0 = map.getZoom();
    const dist = map.project(center, z0).distanceTo(map.project(map.getCenter(), z0));
    // Short hops use Leaflet's compositor zoom/pan; longer ones get a smooth fly-over.
    if (Math.abs(zoom - z0) <= 3 && dist < Math.max(size.x, size.y)) map.setView(center, zoom, {animate: true, duration: .35});
    else map.flyTo(center, zoom, {duration: Math.min(1.1, .55 + dist / 4000)});
  }
  function focusOn(latlng, zoom) {
    if (map.dgisView?.active) { map.dgisView.focus(L.latLng(latlng), zoom, visibleArea()); return; }
    const a = visibleArea(), size = map.getSize();
    const offset = L.point((a.left + a.right - size.x) / 2, (a.top + a.bottom - size.y) / 2);
    moveTo(map.unproject(map.project(latlng, zoom).subtract(offset), zoom), zoom);
  }
  function revealIfCovered(latlng) {
    const p = map.dgisView?.active ? L.point(map.dgisView.project(latlng)) : map.latLngToContainerPoint(latlng), a = visibleArea();
    if (p.y > a.bottom - 36 || p.y < a.top + 24 || p.x < a.left + 24 || p.x > a.right - 24) focusOn(latlng, map.getZoom());
  }
  function fitPadding() {
    const a = visibleArea(), size = map.getSize();
    return {paddingTopLeft: [a.left + (mobile() ? 20 : 40), a.top + (mobile() ? 30 : 60)], paddingBottomRight: [size.x - a.right + (mobile() ? 20 : 40), size.y - a.bottom + (mobile() ? 20 : 40)]};
  }
  function fitTo(latlngs, animate) {
    if (!map || !latlngs.length) return;
    if (map.dgisView?.active) {
      const area = visibleArea();
      map.dgisView.fit(L.latLngBounds(latlngs), {left: area.left + 24, right: area.right - 24, top: area.top + 30, bottom: area.bottom - 24}, animate);
      return;
    }
    map.dgisView?.reset();
    const bounds = L.latLngBounds(latlngs), options = {...fitPadding(), maxZoom: latlngs.length === 1 ? 17 : 14.5};
    if (animate && !UI.reduceMotion()) map.flyToBounds(bounds, {...options, duration: .7});
    else map.fitBounds(bounds, {...options, animate: false});
  }
  const allCoords = mappedGroups.map(g => [g.building.lat, g.building.lng]);
  const fitAll = (animate) => fitTo(allCoords, animate);

  /* ─────────────── building dots: one canvas, count labels when zoomed in ─────────────── */
  const labelFont = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dotRadius = (zoom) => zoom < 12 ? 3.5 : zoom < 14 ? 5 : zoom < 16 ? 8 : 15;
  let setSelected = () => {};

  function setupMap() {
    const BuildingDot = L.CircleMarker.extend({
      _updateBounds() {
        const r = this._radius + 7 + this._clickTolerance();
        this._pxBounds = new L.Bounds(this._point.subtract([r, r]), this._point.add([r, r]));
      },
      _updatePath() {
        const r = this._renderer;
        if (!r._drawing || this._empty()) return;
        const ctx = r._ctx, p = this._point, radius = Math.round(this._radius);
        ctx.globalAlpha = 1;
        if (this.selected) {
          ctx.beginPath(); ctx.arc(p.x, p.y, radius + 6, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(0, 122, 255, .24)'; ctx.fill();
        }
        // A soft rim keeps white-bordered dots readable on light streets without canvas shadows.
        ctx.beginPath(); ctx.arc(p.x, p.y + .6, radius + 1.6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 0, 0, .2)'; ctx.fill();
        r._updateCircle(this);
        if (this.label) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = labelFont;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(this.label, p.x, p.y + .5);
        }
      },
    });

    renderer = UI.nearestCanvas({padding: touch ? .3 : .15, tolerance: touch ? 9 : 1});
    map = L.map('map', {
      center: [38.57, 68.74], zoom: 13, minZoom: 8, maxZoom: 20,
      // Raster fallbacks snap; DgisView enables continuous native vector zoom.
      zoomSnap: touch ? 1 : .5, bounceAtZoomLimits: false,
      renderer, zoomControl: false, attributionControl: false,
    });
    L.control.zoom({position: 'bottomright'}).addTo(map);
    L.control.scale({position: 'bottomright', imperial: false}).addTo(map);
    L.control.attribution({position: 'topright', prefix: false}).addAttribution('<a href="https://2gis.tj/ru/dushanbe/geo/70030077013570949" target="_blank" rel="noopener">Адреса и граница: 2GIS</a>').addTo(map);
    addMapBackground(map, {onError: showError, onReady: () => $('mapError').classList.remove('show')});

    // Resize dots before Leaflet re-projects and redraws them after a zoom.
    let radius = dotRadius(map.getZoom()), label = false;
    map.on('zoomend', () => {
      const z = map.getZoom(), next = dotRadius(z), nextLabel = z >= 16;
      if (next === radius && nextLabel === label) return;
      radius = next; label = nextLabel;
      for (const g of mappedGroups) {
        g.dot.options.radius = g.dot._radius = radius;
        g.dot.label = label ? String(g.modules.length) : '';
      }
    });

    boundary = L.polygon(SINO_DATA.district.ring.map(([lng,lat]) => [lat,lng]), {color:'#587997', weight:1.5, dashArray:'5 5', fillColor:'#c3d6e7', fillOpacity:.08, interactive:false}).addTo(map);
    dotsLayer = L.featureGroup().addTo(map);
    towerLayer = L.layerGroup().addTo(map);
    radiusLayer = L.layerGroup();
    for (const group of mappedGroups) {
      group.dot = new BuildingDot([group.building.lat, group.building.lng], {
        radius, color: '#fff', weight: 2, opacity: 1, fillColor: group.color, fillOpacity: 1, bubblingMouseEvents: false,
      });
      group.dot.group = group;
    }
    dotsLayer.on('click', e => selectGroup(e.layer.group, true));
    if (canHover) {
      const tip = L.tooltip({direction: 'top', className: 'building-tip', opacity: 1});
      dotsLayer.on('mouseover', e => {
        const dot = e.layer;
        tip.options.offset = [0, -dot.getRadius() - 5];
        tip.setLatLng(dot.getLatLng()).setContent(`${esc(dot.group.title)} · <b>${fmt(dot.group.modules.length)}</b> модулей`);
        map.openTooltip(tip);
      });
      dotsLayer.on('mouseout', () => map.closeTooltip(tip));
      map.on('movestart', () => map.closeTooltip(tip));
    }
    GATEWAYS.forEach((h,i) => {
      const marker = L.marker([h.lat,h.lng], {title:h.name, icon:L.divIcon({className:'tower-dot', html:`<span style="color:${h.color}">▲${i+1}</span>`, iconSize:[34,28], iconAnchor:[17,14]})});
      marker.on('click', () => openTower(i, true)); towerLayer.addLayer(marker);
      radiusLayer.addLayer(L.circle([h.lat,h.lng], {radius:9000, color:h.color, weight:1, fillOpacity:.025, interactive:false}));
    });

    setSelected = (group) => {
      const previous = selected;
      selected = group;
      if (previous?.dot) { previous.dot.selected = false; previous.dot.redraw(); }
      if (group?.dot) {
        group.dot.selected = true;           // stays marked even while a filter hides it
        if (map.hasLayer(group.dot)) { group.dot.bringToFront(); group.dot.redraw(); }
      }
      for (const el of $('list').querySelectorAll('.item.active')) el.classList.remove('active');
      if (group) $('list').querySelector(`[data-g="${group.idx}"]`)?.classList.add('active');
      map.fire('datachange');
    };
    // Canvas layers draw in insertion order: coverage circles, then the boundary, then buildings.
    const restack = () => {
      if (map.hasLayer(boundary)) boundary.bringToBack();
      radiusLayer.eachLayer(c => map.hasLayer(c) && c.bringToBack());
    };
    $('tgBoundary').onchange = e => { e.target.checked ? boundary.addTo(map) : boundary.remove(); restack(); };
    $('tgHubs').onchange = e => e.target.checked ? towerLayer.addTo(map) : towerLayer.remove();
    $('tgRadius').onchange = e => { e.target.checked ? radiusLayer.addTo(map) : radiusLayer.remove(); restack(); };
    map.on('click', () => { if (mobile() && !sheet.collapsed()) sheet.set(true); });

    updateMarkers(); fitAll(false); updateControlPadding();
    let resizeFrame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { map.invalidateSize({pan: false}); updateControlPadding(); });
    }).observe($('map'));
  }

  function updateMarkers() {
    if (!dotsLayer) return;
    const want = new Set();
    for (const g of visibleGroups()) if (g.dot) want.add(g.dot);
    // Only touch the dots that changed; the canvas redraws once on the next frame.
    dotsLayer.eachLayer(dot => { if (!want.has(dot)) dotsLayer.removeLayer(dot); });
    for (const dot of want) if (!dotsLayer.hasLayer(dot)) dotsLayer.addLayer(dot);
    if (selected?.dot && dotsLayer.hasLayer(selected.dot)) selected.dot.bringToFront();
    map.getContainer().dataset.visibleBuildings = String(want.size);
  }

  function selectGroup(group, fromMap) {
    setSelected(group);
    if (mobile() && !sheet.collapsed()) sheet.set(true);
    openDetails(group);
    if (group.status !== 'matched' || !map) return;
    const latlng = L.latLng(group.building.lat, group.building.lng);
    if (!fromMap) focusOn(latlng, Math.min(18, Math.max(17, map.getZoom())));
    else if (mobile()) revealIfCovered(latlng);
  }
  function openTower(i, fromMap) {
    if (!map) return;
    const h = GATEWAYS[i], latlng = L.latLng(h.lat, h.lng);
    if (!fromMap && mobile()) sheet.set(true);
    const peek = mobile() ? sheet.peek() : 0;
    L.popup({autoPan: fromMap, autoPanPaddingTopLeft: [20, 20], autoPanPaddingBottomRight: [20, peek + 20], offset: [0, -14]})
      .setLatLng(latlng).setContent(`<div class="tower-popup"><b>${esc(h.name)}</b><p>${esc(h.addr)}</p><p>${esc(h.gatewayId)}</p><p><b>${fmt(gatewayCounts[i])}</b> модулей в новом реестре</p><p>Связи с вышками — по исходному списку ID.</p></div>`).openOn(map);
    if (!fromMap) focusOn(latlng, Math.max(15, Math.min(map.getZoom(), 17)));
  }
  function showError(message) { $('mapError').textContent = message; $('mapError').classList.add('show'); }
  function updateControlPadding() {
    if (!map) return;
    const bottom = mobile() ? (sheet.collapsed() ? sheet.peek() + 14 : $('panel').offsetHeight + 8) : 14;
    $('map').style.setProperty('--map-control-bottom', `${bottom}px`);
  }

  /* ─────────────── list: rendered a page at a time as you scroll ─────────────── */
  const list = $('list');
  const PAGE = 50;
  let rows = [], shownRows = 0;
  const sentinel = document.createElement('div');
  sentinel.className = 'list-more';
  // The next page loads well before the end comes into view, whichever element is scrolling.
  let pager;
  function makePager() {
    pager?.disconnect();
    pager = new IntersectionObserver(found => { if (found.some(e => e.isIntersecting)) appendRows(); },
      {root: UI.panelScrolls.matches ? $('panel') : list, rootMargin: '0px 0px 700px 0px'});
    if (sentinel.isConnected) pager.observe(sentinel);
  }
  makePager();
  UI.panelScrolls.addEventListener('change', makePager);

  function rowHtml(row, i) {
    if (row.tower != null) {
      const h = GATEWAYS[row.tower];
      return `<button type="button" class="item" data-i="${i}"><div class="swatch" style="background:${h.color}"></div><div class="body"><div class="name">${esc(h.name)}</div><div class="meta">${esc(h.gatewayId)}<br>${esc(h.addr)}</div></div><div class="cnt">${fmt(gatewayCounts[row.tower])}<small>модулей в реестре</small></div></button>`;
    }
    if (row.issue) {
      return `<button type="button" class="item" data-i="${i}"><div class="body"><div class="name">${esc(row.issue.address)}</div><div class="meta pending-label">Уточнить ID: ${esc(row.issue.rawModule)}</div></div></button>`;
    }
    const g = row.group, mapped = g.status === 'matched';
    return `<button type="button" class="item${g === selected ? ' active' : ''}" data-i="${i}" data-g="${g.idx}"><div class="swatch" style="background:${mapped ? '#1677e8' : '#b27623'}"></div><div class="body"><div class="name">${esc(g.title)}</div><div class="meta${mapped ? '' : ' pending-label'}">${mapped ? esc(g.building.mapAddress) : esc(reasons[g.status])}</div></div><div class="cnt">${fmt(g.modules.length)}<small>модулей</small></div></button>`;
  }
  function appendRows() {
    pager.unobserve(sentinel);
    sentinel.remove();
    const end = Math.min(shownRows + PAGE, rows.length);
    let html = '';
    for (let i = shownRows; i < end; i++) html += rowHtml(rows[i], i);
    list.insertAdjacentHTML('beforeend', html);
    shownRows = end;
    if (shownRows < rows.length) { list.appendChild(sentinel); pager.observe(sentinel); }
  }
  function renderList(animate) {
    if (tab === 'gateways') {
      rows = GATEWAYS.map((h, i) => ({tower: i})).filter(r => matchQuery(towerSearch[r.tower]));
      $('listNote').textContent = `${fmt(gatewayCounts.reduce((sum, count) => sum + count, 0))} модулей связаны с вышками по ID`;
    } else {
      const shown = visibleGroups();
      rows = shown.map(group => ({group}));
      let issues = 0;
      if (status !== 'mapped') SINO_DATA.idIssues.forEach((issue, i) => { if (matchQuery(issueSearch[i])) { rows.push({issue}); issues++; } });
      $('listNote').textContent = `${fmt(shown.length)} адресов${issues ? ` · ${fmt(issues)} строк с ошибками ID` : ''}`;
    }
    list.textContent = '';
    list.scrollTop = 0;
    shownRows = 0;
    if (rows.length) appendRows();
    else list.innerHTML = '<div class="empty">Ничего не найдено</div>';
    if (animate && !UI.reduceMotion()) list.animate([{opacity: .3}, {opacity: 1}], {duration: 200, easing: 'ease-out'});
    $('reset').style.display = query || status !== 'all' ? 'block' : 'none';
  }
  list.addEventListener('click', e => {
    const item = e.target.closest('.item');
    const row = item && rows[Number(item.dataset.i)];
    if (!row) return;
    if (row.tower != null) openTower(row.tower, false);
    else if (row.issue) openIssue(row.issue);
    else selectGroup(row.group, false);
  });

  /* ─────────────── search and filters ─────────────── */
  let searchTimer = 0, lastSearch = 0;
  // Applies typed text that is still waiting on the debounce; true when the query changed.
  function syncQuery() {
    clearTimeout(searchTimer);
    const next = normalize($('search').value);
    if (next === query) return false;
    query = next; parts = query ? query.split(' ') : []; cache = null;
    return true;
  }
  function runSearch() {
    lastSearch = performance.now();
    if (syncQuery()) { renderList(false); updateMarkers(); }
  }
  // The first keystroke answers at once; fast typing is coalesced so the list never stutters.
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (performance.now() - lastSearch > 180) runSearch();
    else searchTimer = setTimeout(runSearch, 120);
  });
  // When the whole sheet scrolls, bring the search box to the top so results appear right below it.
  $('search').addEventListener('focus', () => {
    if (!UI.panelScrolls.matches) return;
    const panel = $('panel'), top = document.querySelector('#panel .controls').offsetTop - (mobile() ? $('sheetToggle').offsetHeight : 0);
    if (Math.abs(panel.scrollTop - top) > 4) UI.scrollTo(panel, top);
  });
  $('search').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || tab !== 'addresses') return;
    e.preventDefault(); runSearch();
    const shown = visibleGroups();
    if (!shown.length) return;
    e.target.blur();
    // One result — or one building among review entries — opens it; several buildings are framed.
    const mapped = shown.filter(g => g.status === 'matched');
    if (shown.length === 1 || mapped.length === 1) { selectGroup(shown.length === 1 ? shown[0] : mapped[0], false); return; }
    if (mapped.length && map) {
      if (mobile()) sheet.set(true);
      fitTo(mapped.map(g => [g.building.lat, g.building.lng]), true);
    }
  });
  function setStatus(next) {
    syncQuery();
    status = next; cache = null;
    document.querySelectorAll('[data-status]').forEach(b => {b.classList.toggle('on', b.dataset.status === next); b.setAttribute('aria-pressed', String(b.dataset.status === next));});
    renderList(true); updateMarkers();
  }
  document.querySelectorAll('[data-status]').forEach(b => b.onclick = () => { if (status !== b.dataset.status) setStatus(b.dataset.status); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    if (tab === b.dataset.tab) return;
    if (syncQuery()) updateMarkers();
    tab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(t => t.classList.toggle('on', t === b));
    renderList(true);
  });
  $('reset').onclick = () => { $('search').value = ''; runSearch(); setSelected(null); setStatus('all'); fitAll(true); };
  $('fit').onclick = () => { if (mobile()) sheet.set(true); fitAll(true); };

  /* ─────────────── panel (desktop) and bottom sheet (phones) ─────────────── */
  sheet = UI.bottomSheet({
    panel: $('panel'), toggle: $('sheetToggle'), handles: [$('sheetToggle'), document.querySelector('#panel .head')],
    enabled: (e) => mobile() && !e.target.closest('a, input'), onChange: updateControlPadding,
  });
  $('panelHide').onclick = () => document.body.classList.add('panel-hidden');
  $('panelOpen').onclick = () => document.body.classList.remove('panel-hidden');
  mobileQuery.addEventListener('change', () => { if (mobile()) sheet.set(true); else updateControlPadding(); });
  // The page never scrolls; undo any scroll the browser makes to reveal a focused element.
  addEventListener('scroll', () => { if ((scrollX || scrollY) && !document.activeElement?.matches('input')) scrollTo(0, 0); });
  if (mobile()) sheet.set(true);

  $('exportCsv').onclick = () => {
    const out = [['module_id','status','original_address','map_address','lat','lng','building_reference','gateway_id','source_file','source_sheet','source_row','raw_id_issue']];
    for (const m of SINO_DATA.modules) {
      const b = m.status === 'matched' ? buildings.get(m.key) : null;
      for (const s of m.sources) out.push([m.id,m.status,s.address,b?.mapAddress||'',b?.lat??'',b?.lng??'',b?.url||'',GATEWAYS[m.gateway]?.gatewayId||'',SINO_DATA.files[s.file],s.sheet,s.row,'']);
    }
    for (const issue of SINO_DATA.idIssues) out.push(['','invalid_or_shortened_id',issue.address,'','','','','',SINO_DATA.files[issue.file],issue.sheet,issue.row,issue.rawModule]);
    // Neutralize spreadsheet formulas in source text when an administrator opens CSV.
    const csv = out.map(row=>row.map(value=>'"'+String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='final-module-addresses.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  try { setupMap(); }
  catch (error) { console.error(error); map = null; showError('Не удалось запустить карту. Адреса доступны в списке.'); }
  renderList(false);
})();
