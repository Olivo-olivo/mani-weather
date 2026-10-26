// Run with: node --test tests/offline-recovery.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const HOUR=3600000,BASE=Date.parse('2026-10-26T10:30:00Z');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(savedAt=new Date(BASE).toISOString(),temperature=20){
 const dates=Array.from({length:6},(_,i)=>'2026-10-'+(26+i));
 const time=dates.flatMap(date=>Array.from({length:24},(_,h)=>date+'T'+String(h).padStart(2,'0')+':00'));
 const hourly={time},daily={time:dates};
 for(const [key,value] of Object.entries({weather_code:0,precipitation_probability:0,precipitation:0,temperature_2m:temperature,wind_speed_10m:5,wind_gusts_10m:10,wind_direction_10m:90,cloud_cover:0}))hourly[key]=time.map(()=>value);
 for(const [key,value] of Object.entries({weather_code:0,precipitation_probability_max:0,precipitation_sum:0,temperature_2m_max:22,temperature_2m_min:16,wind_gusts_10m_max:10}))daily[key]=dates.map(()=>value);
 return {savedAt,data:{hourly,daily,current:{time:'2026-10-26T12:30',weather_code:0,precipitation:0,temperature_2m:temperature,is_day:1}}};
}
function setup({cached=null,online=false,startup=false}={}){
 let now=BASE,stored=cached===null?null:JSON.stringify(cached),feed=fixture().data,fetcher=null,calls=0;
 const nodes=new Map(),events={},timers=[],moon=[];
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){
  const classes=new Set();let content='';
  nodes.set(id,{classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)}},
   get innerHTML(){return content},set innerHTML(x){content=x},get textContent(){return content.replace(/<[^>]*>/g,'')},set textContent(x){content=String(x)},
   querySelectorAll(){return []},addEventListener(){},setAttribute(){}});
 }
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const context={document:{hidden:false,getElementById:id=>nodes.get(id),addEventListener:(event,fn)=>events[event]=fn},
  window:{addEventListener:(event,fn)=>events[event]=fn,ManiMoon:{setForecast:(data,options)=>moon.push({data,options})}},navigator:{onLine:online},Intl,Date:Clock,URL,AbortController,
  setTimeout,clearTimeout,setInterval:(fn,ms)=>timers.push({fn,ms}),localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},
  fetch:async(...args)=>{calls++;return fetcher?fetcher(...args):{ok:true,json:async()=>structuredClone(feed)}}};
 vm.createContext(context);
 const end=source.indexOf(' const saved=safeLoad();');assert.ok(end>0);
 const expose='globalThis.api={usableForecast,safeLoad,render,refresh,showSavedForecast,updateVisibleForecast,setPayload(value){payload=value},selectDay(value){selectedDay=value}};';
 vm.runInContext(source.slice(0,end)+expose+(startup?source.slice(end):'})();'),context);
 return {a:context.api,context,nodes,events,moon,tick:timers.find(t=>t.ms===60000).fn,
  setTime:value=>now=value,setStored:value=>stored=value===null?null:JSON.stringify(value),getStored:()=>JSON.parse(stored),
  setFetcher:value=>fetcher=value,setFeed:value=>feed=value,getCalls:()=>calls};
}
function display(s,f){s.a.render(f);s.a.setPayload(f)}
function cleared(s){
 assert.equal(s.nodes.get('temp').textContent,'—°');assert.equal(s.nodes.get('chance').textContent,'N/A');
 assert.equal(s.nodes.get('detail').innerHTML,'');assert.doesNotMatch(s.nodes.get('days').innerHTML,/data-day/);
 assert.doesNotMatch(s.nodes.get('risk').textContent,/No major/);
 assert.equal(s.moon.at(-1).options.stale,true);assert.deepEqual(Object.keys(s.moon.at(-1).data.data),[]);
}
test('six-hour and future-skew boundaries, invalid dates and malformed storage',()=>{
 const s=setup();
 for(const [offset,valid] of [[-6*HOUR,true],[-6*HOUR-1,false],[5*60000,true],[5*60000+1,false]]){
  s.setStored(fixture(new Date(BASE+offset).toISOString()));assert.equal(!!s.a.safeLoad(),valid,String(offset));
 }
 for(const savedAt of [null,0,'not a date','2099-01-01T00:00:00Z','2000-01-01T00:00:00Z']){s.setStored(fixture(savedAt));assert.equal(s.a.safeLoad(),null)}
 s.context.localStorage.getItem=()=>'{';assert.equal(s.a.safeLoad(),null);
 s.context.localStorage.getItem=()=>{throw Error('blocked')};assert.equal(s.a.safeLoad(),null);
});
test('startup never renders an expired saved forecast',()=>{const s=setup({cached:fixture(new Date(BASE-7*HOUR).toISOString()),startup:true});cleared(s)});
test('recent saved forecast remains explicitly stale and suppresses hazard and Moon guidance',()=>{
 const s=setup({cached:fixture(new Date(BASE-HOUR).toISOString()),startup:true});
 assert.equal(s.nodes.get('temp').textContent,'20°');assert.match(s.nodes.get('status').textContent,/Saved forecast/);
 assert.match(s.nodes.get('risk').textContent,/could not be checked/);assert.equal(s.moon.at(-1).options.stale,true);
});
test('rejects forecasts without today or the current hour, regardless of recent download',()=>{
 const s=setup(),f=fixture();f.data.daily.time=f.data.daily.time.map(t=>t.replace('10-','09-'));s.setStored(f);assert.equal(s.a.safeLoad(),null);
 const g=fixture();g.data.hourly.time=g.data.hourly.time.filter(t=>t!=='2026-10-26T12:00');s.setStored(g);assert.equal(s.a.safeLoad(),null);
});
test('newest eligible copy wins; invalid disk copy cannot defeat usable memory',async()=>{
 const s=setup({cached:fixture(new Date(BASE-HOUR).toISOString(),10)});display(s,fixture(undefined,24));await s.a.refresh();assert.equal(s.nodes.get('temp').textContent,'24°');
 s.setStored(fixture(new Date(BASE-7*HOUR).toISOString(),5));await s.a.refresh();assert.equal(s.nodes.get('temp').textContent,'24°');
 s.setStored(fixture(new Date(BASE+1000).toISOString(),25));await s.a.refresh();assert.equal(s.nodes.get('temp').textContent,'25°');
});
test('failed refresh cannot resurrect expired memory with empty or expired storage',async()=>{
 for(const disk of [null,fixture(new Date(BASE-7*HOUR).toISOString())]){
  const s=setup({cached:disk});display(s,fixture());s.setTime(BASE+7*HOUR);await s.a.refresh();cleared(s);
  assert.doesNotMatch(s.nodes.get('error').textContent,/Showing a saved forecast/);
 }
});
test('minute check and tab return clear expired figures',()=>{
 for(const trigger of ['minute','visible']){
  const s=setup({online:true});display(s,fixture());s.a.selectDay(0);s.a.render(fixture());
  s.setTime(BASE+6*HOUR+1);
  // Offline prevents requests while still exercising both existing event paths.
  s.context.navigator.onLine=false;
  if(trigger==='minute')s.tick();else{s.context.document.hidden=true;s.tick();assert.equal(s.nodes.get('temp').textContent,'20°');s.context.document.hidden=false;s.events.visibilitychange()}
  cleared(s);
 }
});
test('offline event immediately replaces success and hazard reassurance',()=>{
 const s=setup({online:true});display(s,fixture());s.context.navigator.onLine=false;s.events.offline();
 assert.match(s.nodes.get('status').textContent,/Saved forecast/);assert.doesNotMatch(s.nodes.get('risk').textContent,/No major/);
 assert.equal(s.moon.at(-1).options.stale,true);
});
test('midnight drops yesterday and closes its detail panel',()=>{
 const s=setup(),time=Date.parse('2026-10-26T21:59:00Z');s.setTime(time);const f=fixture(new Date(time).toISOString());
 display(s,f);s.a.selectDay(0);s.a.render(f);s.events.offline();
 s.setTime(time+2*60000);s.tick();
 assert.doesNotMatch(s.nodes.get('days').innerHTML,/data-day="0"/);assert.match(s.nodes.get('days').innerHTML,/data-day="1"/);
 assert.equal(s.nodes.get('detail').innerHTML,'');
});
test('online event restores live display and storage after expiry',async()=>{
 const s=setup({cached:fixture(new Date(BASE-7*HOUR).toISOString()),startup:true});cleared(s);
 s.context.navigator.onLine=true;s.setFeed(fixture(undefined,26).data);s.events.online();await flush();
 assert.equal(s.nodes.get('temp').textContent,'26°');assert.match(s.nodes.get('status').textContent,/updated successfully/);
 assert.equal(s.nodes.get('error').classList.contains('hidden'),true);assert.equal(s.getStored().savedAt,new Date(BASE).toISOString());
 assert.equal(s.moon.at(-1).options.stale,false);
});
test('failed reconnect preserves original download age and only eligible data',async()=>{
 const f=fixture(new Date(BASE-HOUR).toISOString()),s=setup({cached:f,startup:true});s.context.navigator.onLine=true;
 s.setFetcher(async()=>{throw Error('network unavailable')});s.events.online();await flush();
 assert.match(s.nodes.get('status').textContent,/Saved forecast/);assert.equal(s.getStored().savedAt,f.savedAt);
 s.setTime(BASE+6*HOUR);s.events.online();await flush();cleared(s);
});
test('online during an in-flight failed request queues one recovery request',async()=>{
 const s=setup({online:true}),rejects=[];s.setFetcher(()=>new Promise((resolve,reject)=>rejects.push(reject)));
 const pending=s.a.refresh();assert.equal(s.getCalls(),4);
 s.events.online();s.events.online();s.setFetcher(null);for(const reject of rejects)reject(Error('old request failed'));
 await pending;await flush();assert.equal(s.getCalls(),8);assert.match(s.nodes.get('status').textContent,/updated successfully/);
});
test('failed optional models do not block recovery; failed storage does not undo live success',async()=>{
 const s=setup({online:true});s.context.localStorage.setItem=()=>{throw Error('quota')};
 s.setFetcher(async url=>{if(!url.includes('models=best_match'))throw Error('optional model unavailable');return {ok:true,json:async()=>fixture().data}});
 await s.a.refresh();assert.match(s.nodes.get('status').textContent,/updated successfully/);
});

test('expired figures disappear before an in-flight refresh completes',async()=>{
 const s=setup({online:true});display(s,fixture());s.setTime(BASE+6*HOUR+1);
 const releases=[];s.setFetcher(()=>new Promise(resolve=>releases.push(resolve)));
 const pending=s.a.refresh();cleared(s);assert.equal(s.getCalls(),4);
 for(const release of releases)release({ok:true,json:async()=>fixture().data});
 await pending;assert.match(s.nodes.get('status').textContent,/updated successfully/);
});
test('a malformed new response clears partial output and falls back without saving it',async()=>{
 const s=setup({online:true,cached:fixture(new Date(BASE-HOUR).toISOString(),18)}),bad=fixture();
 bad.data.current.time={};s.setFeed(bad.data);await s.a.refresh();
 assert.equal(s.nodes.get('temp').textContent,'18°');assert.match(s.nodes.get('status').textContent,/Saved forecast/);
 assert.equal(s.getStored().data.current.temperature_2m,18);
});
