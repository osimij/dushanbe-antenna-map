// Administrator flow in Chromium and WebKit (Safari engine), including small screens.
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const {chromium,webkit}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8002';
(async()=>{
  const out=await fs.mkdtemp(path.join(os.tmpdir(),'final-responsive-'));
  for(const type of [chromium,webkit]){
    const browser=await type.launch({headless:true,...(type===chromium?{executablePath:process.env.BROWSER_EXECUTABLE||chromium.executablePath(),args:['--enable-unsafe-swiftshader']}: {})});
    try {
      for(const size of [{width:1280,height:800},{width:768,height:1024},{width:360,height:640}]){
        const mobile=size.width<721,errors=[];
        const page=await browser.newPage({viewport:size,hasTouch:mobile,isMobile:mobile,acceptDownloads:true});
        page.on('pageerror',e=>errors.push(e.stack));
        await page.goto(base,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('#map').dataset.visibleBuildings);
        await page.waitForFunction(()=>document.querySelector('#map').dataset.mapProvider==='2gis',null,{timeout:45000}).catch(async error=>{
          console.error(JSON.stringify({engine:type.name(),provider:await page.locator('#map').getAttribute('data-map-provider'),errors}));throw error;
        });
        if(mobile)await page.locator('#sheetToggle').click();
        await page.locator('#search').fill('3033260');
        await page.locator('#search').press('Enter');
        await page.locator('#addressDetails').waitFor();
        assert.ok((await page.locator('#detailsContent').innerText()).includes('final-dataset.xlsx'));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.equal(await page.locator('#addressDetails').evaluate(el=>el.scrollWidth>el.clientWidth),false);
        await page.screenshot({path:path.join(out,`${type.name()}-${size.width}-details.png`)});
        await page.locator('#closeDetails').click();
        await page.locator('#addressDetails').waitFor({state:'hidden'});
        if(mobile)await page.locator('#sheetToggle').click();
        await page.locator('#search').fill('no-such-module-000');
        await page.locator('.empty').waitFor();
        await page.locator('#reset').click();
        await page.locator('[data-status="pending"]').click();
        await page.waitForFunction(()=>document.querySelector('#map').dataset.visibleBuildings==='0');
        const downloadEvent=page.waitForEvent('download');
        await page.locator('#exportCsv').click();
        const download=await downloadEvent;
        const csv=await fs.readFile(await download.path(),'utf8');
        assert.ok(csv.includes('final-dataset.xlsx') && !csv.includes('реестрза марта-2026.xlsx'));
        await page.screenshot({path:path.join(out,`${type.name()}-${size.width}-review.png`)});
        assert.deepEqual(errors,[]);
        console.log(JSON.stringify({engine:type.name(),viewport:size,passed:true}));
        await page.close();
      }
    } finally {await browser.close();}
  }
  console.log(JSON.stringify({screenshots:out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
