// Live 2GIS camera/selection regression. Requires Playwright and the configured key.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8001';
(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
    args:['--enable-unsafe-swiftshader']});
  const errors = [];
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({viewport:mobile ? {width:390,height:844} : {width:1440,height:1000},
        isMobile:mobile, hasTouch:mobile, reducedMotion:'reduce'});
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/vendor/leaflet/leaflet.js', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body:await response.text()+'\nL.Map.addInitHook(function(){window.testMap=this;});'});
      });
      await page.goto(base, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.testMap?.dgisView);
      if (mobile) await page.locator('#sheetToggle').click();
      await page.locator('#search').fill('Сино 130/4');
      await page.getByRole('button', {name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
      await page.locator('#closeDetails').click();
      await page.getByRole('button', {name:'Включить 3D',exact:true}).click();
      await page.getByRole('button', {name:'Повернуть карту вправо',exact:true}).click();
      await page.waitForFunction(() => testMap.dgisView.gl.isIdle());
      assert.equal(await page.evaluate(() => testMap.dgisView.gl.getPitch()),45);
      assert.equal(await page.evaluate(() => testMap.dgisView.gl.getRotation()),30);
      assert.equal(await page.evaluate(() => testMap.dgisView.layers.size),1);
      const point = await page.evaluate(() => {
        const v=testMap.dgisView, dot=[...v.layers.values()][0];return v.project(dot.getLatLng());
      });
      await page.mouse.click(...point);
      await page.locator('#addressDetails').waitFor();
      assert.match(await page.locator('#detailsTitle').textContent(),/130\/4/);
      await page.locator('#closeDetails').click();
      await page.getByRole('button', {name:'Север сверху',exact:true}).click();
      assert.equal(await page.evaluate(() => testMap.dgisView.gl.getRotation()),0);
      await page.getByRole('button', {name:'Вернуться к 2D',exact:true}).click();
      assert.equal(await page.evaluate(() => testMap.dgisView.active),false);
      assert.equal(await page.evaluate(() => testMap.dragging.enabled()),true);
      assert.equal(await page.evaluate(() => testMap.dgisView.gl.getPitch()),0);
      if (!mobile) {
        await page.keyboard.down('Control');
        await page.mouse.move(850,400); await page.mouse.down();
        await page.mouse.move(1010,460,{steps:12}); await page.mouse.up();
        await page.keyboard.up('Control');
        assert.equal(await page.evaluate(() => testMap.dgisView.active),true);
        await page.waitForFunction(() => Math.abs(testMap.dgisView.gl.getRotation())>5);
        await page.evaluate(() => testMap.dgisView.reset());
      }
      // Search remains connected to the native camera after tilting.
      await page.getByRole('button', {name:'Включить 3D',exact:true}).click();
      if (mobile) {
        const cdp=await page.context().newCDPSession(page);
        const points=angle => [-1,1].map((side,i) => ({id:i+1,x:190+side*65*Math.cos(angle),y:250+side*65*Math.sin(angle)}));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(0)});
        for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(i*.08)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await page.waitForFunction(() => Math.abs(testMap.dgisView.gl.getRotation())>5);
        await cdp.detach();
      }
      if (mobile) await page.locator('#sheetToggle').click();
      await page.getByRole('button', {name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
      await page.locator('#addressDetails').waitFor();
      await page.locator('#closeDetails').click();
      await page.waitForFunction(() => testMap.dgisView.gl.isIdle());
      const centered = await page.evaluate(() => {
        const v=testMap.dgisView,p=v.project([...v.layers.values()][0].getLatLng());
        return p[0]>0 && p[0]<innerWidth && p[1]>0 && p[1]<innerHeight;
      });
      assert.ok(centered,'Search must bring the building into view while tilted');
      if (!mobile) await page.screenshot({path:path.join(os.tmpdir(),'map-3d-ready.png')});
      // Existing filters must also update the native dots.
      if (mobile) await page.locator('#sheetToggle').click();
      await page.locator('#search').fill('zzzz-nothing');
      await page.waitForFunction(() => testMap.dgisView.layers.size===0);
      await page.goto(base+'/city-map.html', {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.testMap?.dgisView);
      await page.getByRole('button', {name:'Включить 3D',exact:true}).click();
      await page.waitForFunction(() => testMap.dgisView.layers.size===8282);
      await page.evaluate(mobile => {
        const v=testMap.dgisView, dot=[...v.layers.values()][0];
        v.focus(dot.getLatLng(),18,{left:mobile?0:420,top:100,right:innerWidth,bottom:mobile?600:innerHeight});
      }, mobile);
      await page.waitForFunction(() => testMap.dgisView.gl.isIdle());
      const cityPoint=await page.evaluate(() => {
        const v=testMap.dgisView;return v.project([...v.layers.values()][0].getLatLng());
      });
      await page.mouse.click(...cityPoint);
      await page.locator('.dgis-native-popup').waitFor();
      await page.locator('.dgis-native-popup .popup-close').click();
      await page.locator('.dgis-native-popup').waitFor({state:'hidden'});
      // A provider failure in 3D must restore Leaflet interaction and remove the compass.
      await page.evaluate(() => testMap.dgisView.layer.fire('error',{reason:'webglcontextlost'}));
      await page.waitForFunction(() => !testMap.dgisView);
      assert.equal(await page.locator('.dgis-compass').count(),0);
      assert.equal(await page.evaluate(() => testMap.dragging.enabled()),true);
      assert.equal(await page.locator('.dgis-interactive').count(),0);
      console.log(JSON.stringify({mobile,passed:true,features:['tilt','rotation',mobile?'two-finger rotation':'Ctrl-drag','building click','north reset','2D reset','search','filter','city popup','failure recovery']}));
      await page.close();
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
