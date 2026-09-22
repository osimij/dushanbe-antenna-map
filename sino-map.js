/* Sino's installation register: exact address matches and an explicit review queue. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const fmt = (n) => n.toLocaleString('ru-RU');
  const normalize = (s) => String(s).toLowerCase().replace(/[ёӣӯқҳҷ]/g, c => ({ё:'е',ӣ:'и',ӯ:'у',қ:'к',ҳ:'х',ҷ:'ч'}[c])).replace(/\s+/g, ' ').trim();
  const mobile = () => matchMedia('(max-width: 720px)').matches;
  const reasons = {
    missing_house: 'В реестре нет номера дома', block_unverified: 'Нужно уточнить корпус / блок Б-1',
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
  const entries = [...groups.values()].sort((a,b) => b.modules.length - a.modules.length || a.title.localeCompare(b.title, 'ru'));
  for (const group of entries) {
    group.search = normalize(group.title + ' ' + group.modules.flatMap(m => [m.id, ...m.sources.map(s => s.address)]).join(' '));
  }
  let query = '', status = 'all', tab = 'addresses';
  let map, boundary, markerLayer, towerLayer, radiusLayer;
  const markers = new Map();
  const mappedGroups = entries.filter(g => g.status === 'matched');
  const coords = mappedGroups.map(g => [g.building.lat, g.building.lng]);
  const summary = SINO_DATA.summary;
  $('stAnt').textContent = $('shAnt').textContent = fmt(summary.modules);
  $('stMapped').textContent = fmt(summary.mapped);
  $('stPending').textContent = fmt(summary.pending);
  $('stBuildings').textContent = fmt(mappedGroups.length);
  $('nAddresses').textContent = fmt(entries.length);
  $('sourceNote').textContent = `Точки — найденные здания. При приближении видно число модулей. Ещё ${fmt(summary.idIssues)} строк с неполным или ошибочным ID — в «Уточнить».`;

  function matchQuery(value) {
    return query.split(/\s+/).every(part => value.includes(part));
  }
  function visibleGroups() {
    return entries.filter(g => matchQuery(g.search) && (status === 'all' || (status === 'mapped') === (g.status === 'matched')));
  }
  function sourceText(source) {
    return `${SINO_DATA.files[source.file]} · ${source.sheet} · строка ${source.row}`;
  }
  function gatewayText(module) {
    const h = GATEWAYS[module.gateway];
    return h ? `<span class="gateway-tag" style="background:${h.color}"></span>${esc(h.name)}<small>${esc(h.gatewayId)}</small>` : 'Нет в списке вышек';
  }
  function openDetails(group) {
    const b = group.building;
    $('detailsContent').innerHTML = `<h2 id="detailsTitle">${esc(group.title)}</h2>`
      + `<p>${fmt(group.modules.length)} модулей. ${group.status === 'matched' ? 'Адрес здания найден в 2GIS и находится в районе Сино.' : esc(reasons[group.status]) + '. Точка на карте не ставится до уточнения.'}</p>`
      + (group.status === 'matched' ? `<p>${esc(b.mapAddress)} · ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}</p><div class="detail-actions"><a href="${esc(b.url)}" target="_blank" rel="noopener">Здание в 2GIS ↗</a><a href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}" target="_blank" rel="noopener">Google Maps ↗</a></div>` : '')
      + '<table class="module-table"><thead><tr><th>Module ID</th><th>Адрес в реестре</th><th>Вышка</th></tr></thead><tbody>'
      + group.modules.map(m => `<tr><td>${esc(m.id)}</td><td>${m.sources.map(s => `${esc(s.address)}<small>${esc(sourceText(s))}</small>`).join('<br>')}</td><td>${gatewayText(m)}</td></tr>`).join('') + '</tbody></table>';
    $('addressDetails').showModal();
  }
  function openIssue(issue) {
    $('detailsContent').innerHTML = `<h2 id="detailsTitle">Нужно уточнить Module ID</h2><p>${esc(issue.address)}</p><p class="issue-id">Запись в источнике: <b>${esc(issue.rawModule)}</b></p><p>${esc(sourceText(issue))}</p><p>Неполный или ошибочный ID сохранён как в источнике. Полные ID из этой строки учтены отдельно; недостающие цифры не добавлялись.</p>`;
    $('addressDetails').showModal();
  }
  function selectGroup(group) {
    if (group.status === 'matched' && map) {
      const b = group.building;
      map.setView([b.lat, b.lng], 17, {animate: false});
    }
    openDetails(group);
  }
  function renderList() {
    $('list').replaceChildren();
    const fragment = document.createDocumentFragment();
    if (tab === 'gateways') {
      const matches = GATEWAYS.map((h,i) => ({h,i})).filter(({h}) => matchQuery(normalize(`${h.name} ${h.gatewayId} ${h.addr}`)));
      for (const {h,i} of matches) {
        const modules = SINO_DATA.modules.filter(m => m.gateway === i);
        const el = document.createElement('button'); el.className = 'item'; el.type = 'button';
        el.innerHTML = `<div class="swatch" style="background:${h.color}"></div><div class="body"><div class="name">${esc(h.name)}</div><div class="meta">${esc(h.gatewayId)}<br>${esc(h.addr)}</div></div><div class="cnt">${fmt(modules.length)}<small>в реестре</small></div>`;
        el.onclick = () => openTower(i); fragment.appendChild(el);
      }
      $('listNote').textContent = 'Связи модулей из Meters_per_Gateway';
    } else {
      const shown = visibleGroups();
      for (const group of shown) {
        const el = document.createElement('button'); el.className = 'item'; el.type = 'button';
        const mapped = group.status === 'matched';
        el.innerHTML = `<div class="swatch" style="background:${mapped ? '#1677e8' : '#b27623'}"></div><div class="body"><div class="name">${esc(group.title)}</div><div class="meta${mapped ? '' : ' pending-label'}">${mapped ? esc(group.building.mapAddress) : esc(reasons[group.status])}</div></div><div class="cnt">${fmt(group.modules.length)}<small>модулей</small></div>`;
        el.onclick = () => selectGroup(group); fragment.appendChild(el);
      }
      const issues = status !== 'mapped' ? SINO_DATA.idIssues.filter(i => matchQuery(normalize(i.address + ' ' + i.rawModule))) : [];
      for (const issue of issues) {
        const el = document.createElement('button'); el.className = 'item'; el.type = 'button';
        el.innerHTML = `<div class="body"><div class="name">${esc(issue.address)}</div><div class="meta pending-label">Уточнить ID: ${esc(issue.rawModule)}</div></div>`;
        el.onclick = () => openIssue(issue); fragment.appendChild(el);
      }
      $('listNote').textContent = `${fmt(shown.length)} адресов${issues.length ? ` · ${fmt(issues.length)} строк с ошибками ID` : ''}`;
    }
    if (!fragment.childNodes.length) {
      const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Ничего не найдено'; fragment.appendChild(empty);
    }
    $('list').appendChild(fragment);
    $('reset').style.display = query || status !== 'all' ? 'block' : 'none';
  }
  function updateMarkers() {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    const visible = new Set(visibleGroups().filter(g => g.status === 'matched').map(g => g.key));
    for (const [key, marker] of markers) if (visible.has(key)) markerLayer.addLayer(marker);
  }
  function openTower(i) {
    if (!map) return;
    const h = GATEWAYS[i];
    map.setView([h.lat,h.lng], 15, {animate:false});
    L.popup().setLatLng([h.lat,h.lng]).setContent(`<div class="tower-popup"><b>${esc(h.name)}</b><p>${esc(h.addr)}</p><p>${esc(h.gatewayId)}</p></div>`).openOn(map);
  }
  function buildingIcon(group) {
    const gateways = [...new Set(group.modules.map(m => m.gateway))];
    const color = gateways.length === 1 ? GATEWAYS[gateways[0]]?.color || '#63666f' : '#1d1d1f';
    const zoom = map.getZoom();
    const size = zoom < 12 ? 7 : zoom < 14 ? 10 : zoom < 16 ? 16 : 30;
    return L.divIcon({className:'building-dot',html:`<span style="display:block;height:100%;border-radius:50%;background:${color};line-height:${size-4}px">${zoom >= 16 ? group.modules.length : ''}</span>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});
  }
  function showError(message) { $('mapError').textContent = message; $('mapError').classList.add('show'); }
  function padding() {
    if (!mobile()) return {paddingTopLeft: [document.body.classList.contains('panel-hidden') ? 40 : 415, 65], paddingBottomRight: [40,40]};
    return {paddingTopLeft:[18,$('mapError').classList.contains('show') ? $('mapError').getBoundingClientRect().bottom + 10 : 35], paddingBottomRight:[18,document.body.classList.contains('sheet-collapsed') ? 95 : $('panel').getBoundingClientRect().height + 16]};
  }
  function fitAll() { if (map && coords.length) map.fitBounds(coords, {...padding(), maxZoom:14.5, animate:false}); }
  function updateControlPadding() {
    $('map').style.setProperty('--map-control-bottom', `${mobile() ? document.body.classList.contains('sheet-collapsed') ? 80 : $('panel').getBoundingClientRect().height + 8 : 14}px`);
  }
  function setSheet(collapsed) { document.body.classList.toggle('sheet-collapsed', collapsed); $('sheetToggle').setAttribute('aria-expanded', String(!collapsed)); requestAnimationFrame(updateControlPadding); }
  if (mobile()) setSheet(true);
  try {
    map = L.map('map', {center:[38.57,68.74], zoom:13, minZoom:8, maxZoom:20, zoomSnap:.5, preferCanvas:true, zoomControl:false, attributionControl:false});
    L.control.zoom({position:'bottomright'}).addTo(map);
    L.control.scale({position:'bottomright', imperial:false}).addTo(map);
    L.control.attribution({position:'topright', prefix:false}).addAttribution('<a href="https://2gis.tj/ru/dushanbe/geo/70030077013570949" target="_blank" rel="noopener">Адреса и граница: 2GIS</a>').addTo(map);
    addMapBackground(map, {onError: showError, onReady: () => $('mapError').classList.remove('show')});
    boundary = L.polygon(SINO_DATA.district.ring.map(([lng,lat]) => [lat,lng]), {color:'#587997',weight:1.5,dashArray:'5 5',fillColor:'#c3d6e7',fillOpacity:.08,interactive:false}).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    towerLayer = L.layerGroup().addTo(map);
    radiusLayer = L.layerGroup();
    for (const group of mappedGroups) {
      const count = group.modules.length;
      const marker = L.marker([group.building.lat,group.building.lng], {title:`${group.title} · ${count} модулей`,
        icon:buildingIcon(group)});
      marker.bindTooltip(`${esc(group.title)} · ${count} модулей`, {direction:'top'});
      marker.on('click', () => openDetails(group)); markers.set(group.key,marker);
    }
    GATEWAYS.forEach((h,i) => {
      const marker = L.marker([h.lat,h.lng], {title:h.name,icon:L.divIcon({className:'tower-dot',html:`<span style="color:${h.color}">▲${i+1}</span>`,iconSize:[34,28],iconAnchor:[17,14]})});
      marker.on('click',()=>openTower(i)); towerLayer.addLayer(marker);
      radiusLayer.addLayer(L.circle([h.lat,h.lng],{radius:9000,color:h.color,weight:1,fillOpacity:.025,interactive:false}));
    });
    updateMarkers(); fitAll(); updateControlPadding();
    const updateIcons = () => mappedGroups.forEach(g => {
      const marker = markers.get(g.key); marker.setIcon(buildingIcon(g));
      marker.getElement()?.setAttribute('aria-label', `${g.title} · ${g.modules.length} модулей`);
    });
    updateIcons();
    map.on('zoomend', updateIcons);
    new ResizeObserver(() => {map.invalidateSize();updateControlPadding();}).observe($('map'));
    $('tgBoundary').onchange = e => e.target.checked ? boundary.addTo(map) : boundary.remove();
    $('tgHubs').onchange = e => e.target.checked ? towerLayer.addTo(map) : towerLayer.remove();
    $('tgRadius').onchange = e => e.target.checked ? radiusLayer.addTo(map) : radiusLayer.remove();
  } catch (error) { console.error(error); showError('Не удалось запустить карту. Адреса доступны в списке.'); }
  $('search').oninput = e => {query = normalize(e.target.value);renderList();updateMarkers();};
  function setStatus(next) {
    status = next;
    document.querySelectorAll('[data-status]').forEach(b => {b.classList.toggle('on',b.dataset.status === next);b.setAttribute('aria-pressed',String(b.dataset.status === next));});
    renderList();updateMarkers();
  }
  document.querySelectorAll('[data-status]').forEach(b => b.onclick = () => setStatus(b.dataset.status));
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('on',t===b));renderList();});
  $('reset').onclick = () => {query='';$('search').value='';setStatus('all');fitAll();};
  $('fit').onclick = () => {if(mobile())setSheet(true);fitAll();};
  $('closeDetails').onclick = () => $('addressDetails').close();
  $('addressDetails').addEventListener('click', e => {if(e.target === $('addressDetails')) {const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('panelHide').onclick = () => {document.body.classList.add('panel-hidden');updateControlPadding();};
  $('panelOpen').onclick = () => {document.body.classList.remove('panel-hidden');updateControlPadding();};
  $('sheetToggle').onclick = () => setSheet(!document.body.classList.contains('sheet-collapsed'));
  $('exportCsv').onclick = () => {
    const rows = [['module_id','status','original_address','map_address','lat','lng','building_reference','gateway_id','source_file','source_sheet','source_row','raw_id_issue']];
    for (const m of SINO_DATA.modules) {
      const b = m.status === 'matched' ? buildings.get(m.key) : null;
      for (const s of m.sources) rows.push([m.id,m.status,s.address,b?.mapAddress||'',b?.lat??'',b?.lng??'',b?.url||'',GATEWAYS[m.gateway]?.gatewayId||'',SINO_DATA.files[s.file],s.sheet,s.row,'']);
    }
    for (const issue of SINO_DATA.idIssues) rows.push(['','invalid_or_shortened_id',issue.address,'','','','','',SINO_DATA.files[issue.file],issue.sheet,issue.row,issue.rawModule]);
    const csv = rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='sino-module-addresses.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  renderList();
})();
