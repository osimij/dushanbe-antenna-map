// Run with Playwright available via NODE_PATH. No map key is required for these checks.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
// Building dots are drawn on one canvas; the map exposes how many are currently shown.
const shownBuildings = (page, n) => page.waitForFunction(n => document.querySelector('#map').dataset.visibleBuildings === String(n), n);
// The list renders a page at a time; scroll to the end so every row is in the DOM.
const wholeList = page => page.locator('#list').evaluate(async list => {
  for (let i = 0; i < 200 && list.querySelector('.list-more'); i++) {
    list.scrollTop = list.scrollHeight;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  return list.textContent;
});

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || chromium.executablePath()});
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'sino-browser-'));
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}, acceptDownloads:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.argv[2] || 'http://localhost:8000', {waitUntil:'domcontentloaded'});
    const expected=await page.evaluate(()=>({summary:SINO_DATA.summary, sample:SINO_DATA.modules.find(m=>m.status==='matched'&&m.key==='Абуали ибн Сино|130/4'), mappedBuildingIds:SINO_DATA.modules.filter(m=>m.status==='matched').map(m=>SINO_DATA.buildings.find(b=>b.key===m.key).buildingId)}));
    await shownBuildings(page,new Set(expected.mappedBuildingIds).size);
    assert.equal(Number((await page.locator('#stMapped').textContent()).replace(/\D/g,'')),expected.summary.mapped);
    await page.locator('#search').fill('Сино 130/4');
    await shownBuildings(page,1);
    await page.getByRole('button',{name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
    assert.equal(await page.locator('#detailsTitle').textContent(),'Абуали ибн Сино, 130/4');
    assert.ok((await page.locator('#detailsContent').textContent()).includes('38.562246, 68.757410'));
    assert.ok((await page.locator('#detailsContent').textContent()).includes('реестрза марта-2026.xlsx'));
    await page.screenshot({path:path.join(out,'details.png')});
    await page.keyboard.press('Escape');
    await page.locator('#addressDetails').waitFor({state:'hidden'});
    await page.locator('#search').fill(expected.sample.id);
    await shownBuildings(page,1);
    assert.ok((await page.locator('#list').textContent()).includes('130/4'));
    await page.locator('#search').fill('');
    await page.locator('[data-status="pending"]').click();
    await shownBuildings(page,0);
    assert.ok((await wholeList(page)).includes('Один ID указан по разным адресам'));
    await page.locator('[data-status="mapped"]').click();
    const mappedList = await wholeList(page);
    assert.ok(!mappedList.includes('Уточнить ID:'));
    assert.equal(await page.locator('#list .item').count(),expected.summary.buildings);
    await page.locator('[data-status="all"]').click();
    const downloadEvent=page.waitForEvent('download');await page.locator('#exportCsv').click();
    const download=await downloadEvent;const csv=await fs.readFile(await download.path(),'utf8');
    assert.ok(csv.includes('"3033260","matched","к. Сино 130/4 кв 45"'));
    assert.ok(csv.includes('"38.562246","68.75741"'));
    assert.ok(csv.includes('"id_conflict"'));
    assert.ok(csv.includes('"invalid_or_shortened_id"'));
    await page.screenshot({path:path.join(out,'desktop.png')});
    await page.locator('[data-tab="gateways"]').click();
    assert.equal(await page.locator('#list .item').count(),8);
    await page.locator('#list .item').first().click();await page.locator('.tower-popup').waitFor();
    await page.locator('.city-link').click();await page.waitForLoadState('domcontentloaded');
    assert.equal(Number((await page.locator('#stAnt').textContent()).replace(/\D/g,'')),8282);
    assert.deepEqual(errors,[]);
    const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(process.argv[2] || 'http://localhost:8000', {waitUntil:'domcontentloaded'});
    assert.equal(await phone.locator('#sheetToggle').getAttribute('aria-expanded'),'false');
    await phone.locator('#sheetToggle').click();
    await phone.locator('#search').fill('Сино 130/4');
    await phone.getByRole('button',{name:/^Абуали ибн Сино, 130\/4 проспект/}).click();
    await phone.locator('#addressDetails').waitFor();
    // Choosing an address folds the list away so the map shows the building above the details sheet.
    assert.equal(await phone.locator('#sheetToggle').getAttribute('aria-expanded'),'false');
    const overflow=await phone.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth,dialog:document.querySelector('#addressDetails').scrollWidth>document.querySelector('#addressDetails').clientWidth}));
    assert.deepEqual(overflow,{page:false,dialog:false});
    await phone.screenshot({path:path.join(out,'mobile-details.png')});
    await phone.locator('#closeDetails').click();
    await phone.locator('#addressDetails').waitFor({state:'hidden'});
    await phone.locator('#sheetToggle').click();
    await phone.waitForFunction(()=>document.querySelector('#panel').getBoundingClientRect().bottom <= innerHeight + 1);
    await phone.locator('#reset').click();await phone.locator('#sheetToggle').click();
    await phone.waitForFunction(()=>document.querySelector('#panel').getBoundingClientRect().top >= innerHeight - 70);
    await phone.screenshot({path:path.join(out,'mobile.png')});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,summary:expected.summary,screenshots:out,csvSourceRows:csv.split('\r\n').length-1}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
