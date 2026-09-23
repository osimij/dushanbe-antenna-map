const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const code = fs.readFileSync('map-background.js', 'utf8');
function setup(key='test-key', config={}) {
  const layers=[], scripts=[], timers=new Map(), classes=new Set();
  const container={dataset:{}, classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}};
  let ready=0, error='', label;
  const makeLayer = provider => {
    const callbacks={};
    const layer={provider,_tiles:{a:{el:{complete:true,naturalWidth:256}}},
      on(name,fn){callbacks[name]=fn;return this;}, once(name,fn){return this.on(name,fn);},
      addTo(){layers.push(this);return this;}, emit(name,data={}){callbacks[name]?.(data);}};
    return layer;
  };
  const mapEvents={};
  const map={getContainer:()=>container, removeLayer:l=>layers.splice(layers.indexOf(l),1), once(name,fn){mapEvents[name]=fn;}};
  const window={MAP_CONFIG:{googleMapsApiKey:key,...config}};
  const context={window,URLSearchParams,console,
    setTimeout:fn=>{timers.set(1,fn);return 1;},clearTimeout:id=>timers.delete(id),
    document:{createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}},
    L:{control:()=>({addTo(){this.onAdd();}}),DomUtil:{create:()=>label={setAttribute(){}}},
      tileLayer:()=>makeLayer('osm'),dgisLayer:()=>makeLayer('2gis'),gridLayer:{googleMutant:()=>makeLayer('google')}}};
  vm.runInNewContext(code,context);window.addMapBackground(map,{onReady:()=>ready++,onError:m=>error=m});
  return {window,layers,scripts,timers,container,classes,mapEvents,get label(){return label.textContent;},get ready(){return ready;},get error(){return error;}};
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
const dgis={provider:'2gis',dgisApiKey:'test-2gis-key'};
test('2GIS is the preferred provider and a successful load never requests Google',()=>{
  const s=setup('test-google-key',dgis);
  assert.equal(s.scripts[0].src,'https://mapgl.2gis.com/api/js/v1');
  s.scripts[0].onload();s.layers[0].emit('load');
  assert.equal(s.container.dataset.mapProvider,'2gis');assert.equal(s.label,'2GIS');
  assert.equal(s.scripts.length,1);assert.equal(s.ready,1);assert.equal(s.timers.size,0);
});
test('2GIS rejection removes its layer and identifies the Google fallback',()=>{
  const s=setup('test-google-key',dgis);s.scripts[0].onload();
  const rejected=s.layers[0];rejected.emit('error',{reason:'invalidtilekey'});
  s.window.initGoogleMapBackground();s.layers[0].emit('load');
  rejected.emit('load');rejected.emit('error',{reason:'invalidtilekey'});
  assert.equal(s.layers.length,1);assert.equal(s.layers[0].provider,'google');
  assert.equal(s.container.dataset.mapProvider,'google');assert.match(s.label,/ключ 2GIS не принят/);
  assert.equal(s.scripts.length,2);
});
test('2GIS timeout ignores a late SDK and reaches OpenStreetMap if Google also fails',()=>{
  const s=setup('test-google-key',dgis);s.timers.get(1)();s.scripts[0].onload();
  s.scripts[1].onerror();
  assert.equal(s.layers.length,1);assert.equal(s.layers[0].provider,'osm');
  assert.match(s.label,/2GIS временно недоступен/);
});
test('missing 2GIS key with no Google key uses an explicitly labelled OpenStreetMap',()=>{
  const s=setup('',{provider:'2gis',dgisApiKey:''});
  assert.equal(s.scripts.length,0);assert.equal(s.layers[0].provider,'osm');
  assert.match(s.label,/ключ 2GIS не принят/);
});
test('2GIS failure after a successful load still recovers, and unload blocks late callbacks',()=>{
  const s=setup('',dgis);s.scripts[0].onload();s.layers[0].emit('load');
  s.layers[0].emit('error',{reason:'webglcontextlost'});
  assert.equal(s.container.dataset.mapProvider,'openstreetmap');assert.equal(s.layers.length,1);
  const unloaded=setup('',dgis);unloaded.mapEvents.unload();unloaded.scripts[0].onload();
  assert.equal(unloaded.layers.length,0);assert.equal(unloaded.timers.size,0);
});
