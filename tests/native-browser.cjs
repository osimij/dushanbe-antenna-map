// Real 2GIS rendering, continuous wheel/pinch gestures and native marker picking.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8002';
const idle = page => page.waitForFunction(() => testMap.dgisView.gl.isIdle());
(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.BROWSER_EXECUTABLE || chromium.executablePath(), args:['--enable-unsafe-swiftshader']});
  const out = await fs.mkdtemp(path.join(os.tmpdir(),'final-native-'));
  const errors=[], results=[];
  try {
    for (const device of [
      {name:'desktop',width:1440,height:1000,touch:false},
      {name:'tablet',width:820,height:1180,touch:true},
      {name:'phone',width:390,height:844,touch:true},
      {name:'landscape',width:844,height:390,touch:true},
    ]) {
      const mobile = device.width <= 720;
      const page=await browser.newPage({viewport:{width:device.width,height:device.height},hasTouch:device.touch,isMobile:device.touch});
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/vendor/leaflet/leaflet.js',async route=>{
        const response=await route.fetch();
        await route.fulfill({response,body:await response.text()+'\nL.Map.addInitHook(function(){window.testMap=this;});'});
      });
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>testMap?.dgisView?.active && document.querySelector('#map').dataset.mapProvider==='2gis');
      assert.equal(await page.locator('.dgis-background').count(),1);
      assert.equal(await page.evaluate(()=>testMap.scrollWheelZoom.enabled()),false,'Only the native camera may handle wheel events');
      assert.equal(await page.evaluate(()=>testMap.options.zoomSnap),0);
      if(mobile) await page.locator('#sheetToggle').click();
      await page.locator('#search').fill('Сино 130/4');
      await page.getByRole('button',{name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
      await page.locator('#closeDetails').click();
      await page.locator('#addressDetails').waitFor({state:'hidden'});
      await idle(page);
      const clickBuilding=async()=>{
        await idle(page);
        const p=await page.evaluate(()=>{
          const v=testMap.dgisView;return v.project([...v.layers.values()][0].getLatLng());
        });
        assert.ok(p[0]>0 && p[0]<device.width && p[1]>0 && p[1]<device.height);
        await page.mouse.click(...p);
        await page.locator('#addressDetails').waitFor();
        assert.match(await page.locator('#detailsTitle').textContent(),/130\/4/);
        await page.locator('#closeDetails').click();
        await page.locator('#addressDetails').waitFor({state:'hidden'});
      };
      await clickBuilding();
      const center=await page.evaluate(()=>testMap.dgisView.project([...testMap.dgisView.layers.values()][0].getLatLng()));
      let gesture;
      if(!device.touch) {
        await page.evaluate(()=>{
          window.zoomSamples=[];window.sampleZoom=true;
          const sample=()=>{zoomSamples.push(testMap.dgisView.gl.getZoom());if(sampleZoom)requestAnimationFrame(sample);};sample();
        });
        await page.mouse.move(...center);
        for(let i=0;i<18;i++){await page.mouse.wheel(0,-5);await page.waitForTimeout(20);}
        await idle(page);
        gesture=await page.evaluate(()=>{
          sampleZoom=false;
          const changes=zoomSamples.slice(1).map((z,i)=>z-zoomSamples[i]);
          return {distinct:new Set(zoomSamples.map(z=>z.toFixed(4))).size,delta:zoomSamples.at(-1)-zoomSamples[0],largestStep:Math.max(...changes.map(Math.abs))};
        });
        assert.ok(gesture.distinct>10,'Trackpad zoom must produce continuous intermediate frames');
        assert.ok(gesture.delta>0.1 && gesture.largestStep<0.5,JSON.stringify(gesture));
      } else {
        const cdp=await page.context().newCDPSession(page);
        const before=await page.evaluate(()=>testMap.dgisView.gl.getZoom());
        const points=distance=>[-1,1].map((side,i)=>({id:i+1,x:center[0]+side*distance,y:center[1]}));
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(30)});
        for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(30+i*3)});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await idle(page);
        gesture={delta:await page.evaluate(()=>testMap.dgisView.gl.getZoom())-before};
        assert.ok(gesture.delta>0.2,JSON.stringify(gesture));
        await cdp.detach();
      }
      await clickBuilding();
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      await idle(page);await clickBuilding();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,device.name+'.png')});
      results.push({device:device.name,gesture});
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,results,screenshots:out}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
