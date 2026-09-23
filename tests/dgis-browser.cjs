// Run against a local server with the configured 2GIS key and Playwright via NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8001';

(async () => {
  const browser = await chromium.launch({headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    args: ['--enable-unsafe-swiftshader']});
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'dgis-browser-'));
  const errors = [], results = [];
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1440,height:1000},
        isMobile:mobile, hasTouch:mobile, deviceScaleFactor:mobile ? 2 : 1});
      page.on('pageerror', e => errors.push(e.message));
      // Expose the map only inside this test; the production app keeps it private.
      await page.route('**/vendor/leaflet/leaflet.js', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body: await response.text() + '\nL.Map.addInitHook(function(){window.testMap=this;});'});
      });
      await page.goto(base, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.querySelector('#map').dataset.mapProvider === '2gis');
      assert.equal(await page.locator('.dgis-background').count(),1);
      assert.equal(await page.locator('script[src*="maps.googleapis.com"]').count(),0);
      const credit = await page.locator('.dgis-background a').first().evaluate(a => {
        const r=a.getBoundingClientRect();
        return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===a;
      });
      assert.equal(credit,true,'Native 2GIS credit must be visible and clickable');
      if (mobile) await page.locator('#sheetToggle').click();
      await page.locator('#search').fill('Сино 130/4');
      await page.getByRole('button',{name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
      await page.locator('#addressDetails').waitFor();
      await page.locator('#closeDetails').click();
      await page.locator('#addressDetails').waitFor({state:'hidden'});
      const alignment = async () => {
        await page.evaluate(() => { window.testCameraState = null; });
        await page.waitForFunction(() => {
          const map=window.testMap, layer=Object.values(map._layers).find(l=>l._gl);
          const center=map.getCenter(), state=[center.lat,center.lng,map.getZoom()].join(',');
          if (state!==window.testCameraState) {
            window.testCameraState=state;window.testCameraSince=performance.now();
          }
          return performance.now()-window.testCameraSince>200 && !map._animatingZoom && layer?._gl.isIdle();
        });
        return page.evaluate(() => {
          const map=window.testMap, gl=Object.values(map._layers).find(l=>l._gl)._gl;
          const c=map.getCenter();
          const points=[[c.lat,c.lng],[c.lat+.001,c.lng+.001],[c.lat-.001,c.lng-.001]];
          return Math.max(...points.map(([lat,lng])=>{
            const a=map.latLngToContainerPoint([lat,lng]),b=gl.project([lng,lat]);
            return Math.hypot(a.x-b[0],a.y-b[1]);
          }));
        });
      };
      const before = await alignment();
      console.log(JSON.stringify({mobile,stage:"selected",alignment:before}));
      assert.ok(before<1.5,`Building/map alignment: ${before}px`);
      await page.getByRole('button',{name:'Zoom in',exact:true}).click();
      await page.waitForFunction(()=>!window.testMap._animatingZoom);
      const afterZoom = await alignment();
      console.log(JSON.stringify({mobile,stage:"zoomed",alignment:afterZoom}));
      assert.ok(afterZoom<1.5,`Alignment after zoom: ${afterZoom}px`);
      const x=mobile?190:950,y=mobile?250:400;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+55,y+40,{steps:8});await page.mouse.up();
      const afterPan = await alignment();
      assert.ok(afterPan<1.5,`Alignment after panning: ${afterPan}px`);
      await page.screenshot({path:path.join(out,mobile?'mobile.png':'desktop.png')});
      await page.goto(base+'/city-map.html',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#map').dataset.mapProvider==='2gis');
      assert.equal(Number((await page.locator('#stAnt').textContent()).replace(/\D/g,'')),8282);
      assert.equal(await page.locator('.dgis-background').count(),1);
      results.push({mobile,before,afterZoom,afterPan});
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,results,screenshots:out}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
