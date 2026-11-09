// Install Playwright and its browsers, then run: node tests/browser/scroll.cjs
// BROWSERS=chromium and CHROMIUM_PATH=/usr/bin/chromium allow a system browser.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const playwright=require('playwright');
const root=path.resolve(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
// Reuse the existing deterministic weather fixture without executing its tests.
const unit=fs.readFileSync(path.join(root,'tests/rain-conflicts.test.cjs'),'utf8');
const fixture=vm.runInNewContext(unit.slice(unit.indexOf('function fixture('),unit.indexOf('\nfunction setup('))+'\nfixture()',{Date});
const bootstrap=app.slice(0,app.indexOf(' const saved=safeLoad();'))+`
 localISO=()=> '2026-10-25T12:30';
 window.renderFixture=value=>{payload=value;render(value)};
 })();`;
for(const name of (process.env.BROWSERS||'chromium,firefox,webkit').split(',')){
 test(name+' forecast scrolling',async()=>{
  const browser=await playwright[name].launch({headless:true,...(name==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}: {})});
  try{
   console.log(name+' '+browser.version());
   for(const width of [390,1024])for(const reducedMotion of ['reduce','no-preference']){
    const page=await browser.newPage({viewport:{width,height:640},reducedMotion});
    await page.route('**/*',route=>route.abort());
    await page.setContent(html);await page.addStyleTag({content:css});await page.addScriptTag({content:bootstrap});
    await page.evaluate(value=>{
     window.renderFixture(value);window.scrollCalls=[];
     const native=Element.prototype.scrollIntoView;
     Element.prototype.scrollIntoView=function(options){
      // Simulate an older enum binding while still performing real native scrolling.
      if(options.behavior==='instant')throw new TypeError('Unsupported scroll behavior');
      window.scrollCalls.push(options);return native.call(this,options);
     };
    },fixture);
    const result=await page.evaluate(()=>{
     document.querySelector('[data-day]').click();
     const top=document.getElementById('detail').getBoundingClientRect().top+scrollY;
     return {position:scrollY,target:Math.min(top,document.documentElement.scrollHeight-innerHeight),css:getComputedStyle(document.documentElement).scrollBehavior};
    });
    if(reducedMotion==='reduce'){
     assert.equal(result.css,'auto');assert.ok(result.target>0);
     assert.ok(Math.abs(result.position-result.target)<=1,'reduced motion must arrive synchronously');
    }else{
     assert.equal(result.css,'smooth');assert.ok(result.position<result.target,'normal scroll starts animated');
    }
    await page.waitForFunction(target=>Math.abs(scrollY-target)<=1,result.target);
    assert.equal(await page.evaluate(()=>window.scrollCalls[0].behavior),reducedMotion==='reduce'?'auto':'smooth');
    // Collapsing does not issue another scroll. Space and Enter can reopen/switch.
    await page.evaluate(()=>document.querySelector('[data-day]').click());
    assert.equal(await page.evaluate(()=>window.scrollCalls.length),1);
    for(const key of [' ','Enter'])await page.evaluate(key=>{
     document.querySelectorAll('[data-day]')[key===' '?0:1].dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    },key);
    assert.equal(await page.evaluate(()=>window.scrollCalls.length),3);
    await page.close();
   }
  }finally{await browser.close()}
 });
}
