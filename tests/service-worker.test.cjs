// Deterministic lifecycle simulation; real browser upgrades remain an integration check.
// Run with: node --test tests/service-worker.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const scope='https://example.test/mani-weather/';
const url=relative=>new URL(relative,scope).href;
function setup(){
 const events={},stores=new Map([['mani-weather-shell-v37',new Map([[url('./index.html'),'old shell']])],['unrelated-cache',new Map()]]);
 let failInstall=false,online=true,skipped=0,claimed=0;
 const key=request=>typeof request==='string'?url(request):request.url;
 const context={URL,Response,AbortController,setTimeout,clearTimeout,
  self:{registration:{scope},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:()=>{skipped++},clients:{claim:()=>{claimed++}}},
  caches:{keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
   if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
   return {addAll:async assets=>{if(failInstall)throw Error('asset unavailable');for(const asset of assets)store.set(url(asset),asset)},
    match:async request=>store.has(key(request))?new Response(store.get(key(request))):undefined};
  }},fetch:async()=>{if(!online)throw Error('offline');return new Response('network version')}};
 vm.runInNewContext(source,context);
 return {stores,events,setFailInstall:value=>failInstall=value,setOnline:value=>online=value,skipped:()=>skipped,claimed:()=>claimed,
  lifecycle:async name=>{let pending;events[name]({waitUntil:p=>pending=p});return pending},
  request:async(requestURL,mode='cors',method='GET')=>{let response;events.fetch({request:{url:requestURL,mode,method},respondWith:p=>response=p});return response}};
}
test('successful install and activation replace v37 while retaining unrelated caches',async()=>{
 const s=setup();await s.lifecycle('install');assert.equal(s.skipped(),1);
 assert.ok(s.stores.has('mani-weather-shell-v37'));assert.ok(s.stores.get('mani-weather-shell-v38').has(url('./app.js?v=33')));
 await s.lifecycle('activate');assert.equal(s.claimed(),1);assert.equal(s.stores.has('mani-weather-shell-v37'),false);assert.ok(s.stores.has('unrelated-cache'));
 s.setOnline(false);assert.match(await (await s.request(url('./'),'navigate')).text(),/^\.\/$/);
 assert.equal(await (await s.request(url('./app.js?v=33'))).text(),'./app.js?v=33');
});
test('failed install never skips waiting or removes the previous working shell',async()=>{
 const s=setup();s.setFailInstall(true);await assert.rejects(s.lifecycle('install'),/asset unavailable/);
 assert.equal(s.skipped(),0);assert.equal(s.claimed(),0);assert.equal(s.stores.get('mani-weather-shell-v37').get(url('./index.html')),'old shell');
});
test('forecast API, unrelated paths and POST requests bypass service-worker caching',async()=>{
 const s=setup();s.setOnline(false);
 for(const [target,mode,method] of [['https://api.open-meteo.com/v1/forecast','cors','GET'],[url('../other/app.js'),'cors','GET'],[url('./not-preloaded.js'),'cors','GET'],[url('./'),'navigate','POST']])assert.equal(await s.request(target,mode,method),undefined);
 assert.equal(s.stores.has('mani-weather-shell-v38'),false);
});
test('shell is network-first, with offline navigation fallback and no API entries',async()=>{
 const s=setup();await s.lifecycle('install');assert.equal(await (await s.request(url('./app.js?v=33'))).text(),'network version');
 s.setOnline(false);assert.equal(await (await s.request(url('./unknown-page'),'navigate')).text(),'./index.html');
 for(const store of s.stores.values())assert.ok([...store.keys()].every(key=>!key.includes('open-meteo')));
});
test('missing offline shell returns an explicit unavailable response',async()=>{
 const s=setup();s.setOnline(false);const response=await s.request(url('./'),'navigate');assert.equal(response.status,503);
});
test('all page scripts and stylesheet URLs match the precache manifest',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [,asset] of html.matchAll(/(?:src|href)="(\.\/[^" ]+\.(?:js|css)(?:\?v=\d+)?)"/g))assert.ok(source.includes("'"+asset+"'"),asset);
});
function setupPwa(controlled){
 const events={},documentEvents={},swEvents={};let reloads=0,updates=0,registration;
 const node={addEventListener(){},setAttribute(){}};
 const context={document:{hidden:false,getElementById:()=>node,addEventListener:(name,fn)=>documentEvents[name]=fn},
  window:{isSecureContext:true,matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener:(name,fn)=>events[name]=fn,location:{reload:()=>reloads++}},
  navigator:{serviceWorker:{controller:controlled?{}:null,addEventListener:(name,fn)=>swEvents[name]=fn,register:async(...args)=>{registration=args;return {update:async()=>updates++}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'pwa.js'),'utf8'),context);
 return {context,swEvents,documentEvents,reloads:()=>reloads,updates:()=>updates,registration:()=>registration};
}
test('controller updates reload an existing installation at most once',async()=>{
 const s=setupPwa(true);await new Promise(resolve=>setImmediate(resolve));
 s.swEvents.controllerchange();s.swEvents.controllerchange();assert.equal(s.reloads(),1);
 assert.equal(s.registration()[1].updateViaCache,'none');
 s.documentEvents.visibilitychange();assert.equal(s.updates(),1);
});
test('first installation claim does not cause an unnecessary reload',()=>{
 const s=setupPwa(false);s.swEvents.controllerchange();assert.equal(s.reloads(),0);
});
