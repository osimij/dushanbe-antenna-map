const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const code = fs.readFileSync('map-background.js', 'utf8');
function setup(key='test-key') {
  const layers=[], scripts=[], timers=new Map(), classes=new Set();
  const container={dataset:{}, classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}};
  let ready=0, error='', label;
  const makeLayer = provider => {
    const callbacks={};
    const layer={provider,_tiles:{a:{el:{complete:true,naturalWidth:256}}},
      on(name,fn){callbacks[name]=fn;return this;}, once(name,fn){return this.on(name,fn);},
      addTo(){layers.push(this);return this;}, emit(name){callbacks[name]?.();}};
    return layer;
  };
  const map={getContainer:()=>container, removeLayer:l=>layers.splice(layers.indexOf(l),1), once(){}};
  const window={MAP_CONFIG:{googleMapsApiKey:key}};
  const context={window,URLSearchParams,console,
    setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id),
    document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},
    L:{control:()=>({addTo(){this.onAdd();}}),DomUtil:{create:()=>label={setAttribute(){}}},
      tileLayer:()=>makeLayer('osm'),gridLayer:{googleMutant:()=>makeLayer('google')}}};
  vm.runInNewContext(code,context);window.addMapBackground(map,{onReady:()=>ready++,onError:m=>error=m});
  return {window,layers,scripts,timers,container,classes,get label(){return label.textContent;},get ready(){return ready;},get error(){return error;}};
}
test('no key makes no Google request and explicitly identifies the fallback',()=>{
  const s=setup('');assert.equal(s.scripts.length,0);assert.equal(s.container.dataset.mapProvider,'openstreetmap');
  assert.match(s.label,/Google ещё не подключён/);s.layers[0].emit('load');assert.equal(s.ready,1);
});
test('successful Google load uses one map and clears startup timeout',()=>{
  const s=setup();assert.equal(s.scripts.length,1);const url=new URL(s.scripts[0].src);
  assert.equal(url.hostname,'maps.googleapis.com');assert.equal(url.searchParams.get('loading'),'async');
  s.window.initGoogleMapBackground();assert.equal(s.layers.length,1);s.layers[0].emit('load');
  assert.equal(s.container.dataset.mapProvider,'google');assert.equal(s.timers.size,0);assert.equal(s.ready,1);
});
test('rejected key removes Google and keeps a working labelled fallback',()=>{
  const s=setup();s.window.initGoogleMapBackground();s.window.gm_authFailure();s.window.gm_authFailure();
  assert.equal(s.layers.length,1);assert.equal(s.layers[0].provider,'osm');assert.equal(s.classes.has('google-map-active'),false);
  assert.match(s.label,/Google временно недоступен/);s.layers[0].emit('load');assert.equal(s.ready,1);
});
test('network failure and late callback cannot replace the fallback with a broken Google map',()=>{
  const s=setup();s.scripts[0].onerror();s.window.initGoogleMapBackground();
  assert.equal(s.layers.length,1);assert.equal(s.layers[0].provider,'osm');
});
test('startup timeout falls back, and incomplete fallback images do not hide errors',()=>{
  const s=setup();s.timers.get(1)();s.window.initGoogleMapBackground();
  const layer=s.layers[0];layer._tiles.a.el.naturalWidth=0;layer.emit('tileerror');layer.emit('load');
  assert.equal(s.ready,0);assert.match(s.error,/Не удалось/);
});
