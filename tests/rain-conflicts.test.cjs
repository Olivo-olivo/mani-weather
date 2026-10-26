// Run with: node --test tests/rain-conflicts.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function fixture({code=61,p=0,mm=0,currentCode=code,currentMm=mm}={}){
 const dates=Array.from({length:6},(_,i)=>'2026-10-'+(25+i));
 const time=dates.flatMap(date=>Array.from({length:24},(_,h)=>date+'T'+String(h).padStart(2,'0')+':00'));
 const hourly={time};
 for(const [key,value] of Object.entries({weather_code:code,precipitation_probability:p,precipitation:mm,temperature_2m:20,wind_speed_10m:5,wind_gusts_10m:10,wind_direction_10m:90}))hourly[key]=time.map(()=>value);
 const daily={time:dates};
 for(const [key,value] of Object.entries({weather_code:code,precipitation_probability_max:p,precipitation_sum:mm*24,temperature_2m_max:22,temperature_2m_min:16,wind_gusts_10m_max:10}))daily[key]=dates.map(()=>value);
 return {savedAt:new Date().toISOString(),data:{hourly,daily,current:{time:'2026-10-25T12:30',weather_code:currentCode,precipitation:currentMm,temperature_2m:20,is_day:1}}};
}

function setup(){
 const nodes=new Map(),events={},timers=[];
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g)){
  const classes=new Set();let content='';
  nodes.set(id,{classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},toggle(x,on){if(on)classes.add(x);else classes.delete(x)}},
   get innerHTML(){return content},set innerHTML(x){content=x},get textContent(){return content.replace(/<[^>]*>/g,'')},set textContent(x){content=String(x)},
   querySelectorAll(){return []},addEventListener(){},setAttribute(){}});
 }
 const document={hidden:false,getElementById:id=>nodes.get(id),addEventListener:(event,fn)=>events[event]=fn};
 let feed=fixture().data;
 const context={document,window:{addEventListener:(event,fn)=>events[event]=fn},navigator:{onLine:true},Intl,Date,URL,AbortController,
  setTimeout,clearTimeout,setInterval:(fn,ms)=>timers.push({fn,ms}),localStorage:{getItem(){return null},setItem(){}},
  fetch:async()=>({ok:true,json:async()=>structuredClone(feed)})};
 vm.createContext(context);
 // Keep the production event handlers; expose functions instead of starting network I/O.
 const end=source.indexOf(' const saved=safeLoad();');assert.ok(end>0);
 vm.runInContext(source.slice(0,end)+`
 let testNow='2026-10-25T12:30';localISO=()=>testNow;
 globalThis.api={icon,currentSummary,rainConflict,render,refresh,updateMainRainChance,
  setNow(value){testNow=value},setPayload(value){payload=value},selectDay(value){selectedDay=value}};
 })();`,context);
 return {a:context.api,nodes,events,document,tick:timers.find(t=>t.ms===60000).fn,setFeed(value){feed=value}};
}
const shown=(s,id)=>!s.nodes.get(id).classList.contains('hidden');
function render(s,f){s.a.setPayload(f);s.a.render(f);}

for(const input of [{code:61},{code:0,mm:0.1},{code:0,mm:0.001},{code:61,p:0.4}]){
 test('zero display conflict in all four views: '+JSON.stringify(input),()=>{
  const s=setup(),f=fixture(input);s.a.selectDay(0);render(s,f);
  for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.ok(shown(s,id),id);
  assert.match(s.nodes.get('chance').innerHTML,/0%<span aria-describedby="mainRainConflict">\*<\/span>/);
  for(const [id,note] of [['hours','hoursRainConflict'],['days','daysRainConflict'],['detail','detailRainConflict']])assert.ok(s.nodes.get(id).innerHTML.includes('aria-describedby="'+note+'"'));
  assert.match(s.nodes.get('detail').innerHTML,/Forecast signals disagree/);
  assert.equal(s.nodes.get('icon').innerHTML,'🌧️');
 });
}
test('hourly wet code is explained when current code is dry',()=>{
 const s=setup();render(s,fixture({code:61,currentCode:0}));
 assert.ok(shown(s,'mainRainConflict'));assert.equal(s.nodes.get('cond').textContent,'Rain or drizzle forecast this hour');
});
for(const [p,glyph,word] of [[40,'🌦️','possible'],[60,'🌧️','likely']]){
 test(p+'% with a dry code preserves probability-led icons without conflict notes',()=>{
  const s=setup();render(s,fixture({code:0,p}));
  assert.equal(s.nodes.get('icon').innerHTML,glyph);assert.equal(s.nodes.get('chance').textContent,p+'%');
  assert.equal(s.nodes.get('cond').textContent,'Rain '+word+' this hour');
  for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.equal(shown(s,id),false);
  assert.ok(s.nodes.get('hours').innerHTML.includes(glyph));assert.ok(s.nodes.get('days').innerHTML.includes(glyph));
 });
}
test('missing probability stays N/A without a zero-conflict marker',()=>{
 const s=setup();s.a.selectDay(0);render(s,fixture({p:null}));
 assert.equal(s.nodes.get('chance').textContent,'N/A');
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.equal(shown(s,id),false);
 assert.doesNotMatch(s.nodes.get('detail').innerHTML,/aria-describedby="detailRainConflict"/);
});
test('dry zero and rounded one percent do not trigger conflicts',()=>{
 const s=setup();
 for(const input of [{code:0,p:0},{code:61,p:0.5}]){
  render(s,fixture(input));
  for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.equal(shown(s,id),false);
 }
});
test('expired hourly wet code is not borrowed for the main explanation',()=>{
 const s=setup(),f=fixture({code:61,currentCode:0});f.data.current.time='2026-10-24T12:30';render(s,f);
 assert.equal(s.nodes.get('icon').innerHTML,'☀️');assert.equal(shown(s,'mainRainConflict'),false);
});
test('minute timer and return to tab update the main marker at hour rollover',()=>{
 const s=setup(),f=fixture({code:0,p:0});f.data.hourly.precipitation_probability[13]=60;render(s,f);
 assert.equal(s.nodes.get('chance').textContent,'60%');assert.equal(s.nodes.get('icon').innerHTML,'🌧️');
 s.a.setNow('2026-10-25T13:01');s.tick();
 assert.equal(s.nodes.get('chance').textContent,'0%*');assert.ok(shown(s,'mainRainConflict'));
 s.document.hidden=true;s.a.setNow('2026-10-25T12:59');s.tick();assert.ok(shown(s,'mainRainConflict'));
 s.document.hidden=false;s.events.visibilitychange();
 assert.equal(s.nodes.get('chance').textContent,'60%');assert.equal(shown(s,'mainRainConflict'),false);
});
test('a successful refresh clears all resolved notes and markers',async()=>{
 const s=setup();s.a.selectDay(0);render(s,fixture());s.setFeed(fixture({code:0}).data);await s.a.refresh();
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict']){assert.equal(shown(s,id),false);assert.equal(s.nodes.get(id).textContent,'');}
 for(const id of ['chance','hours','days','detail'])assert.doesNotMatch(s.nodes.get(id).innerHTML,/aria-describedby="(?:main|hours|days|detail)RainConflict"/);
 assert.equal(s.nodes.get('icon').innerHTML,'☀️');
});
test('saved forecasts and absent current data can still explain hourly conflicts',()=>{
 const s=setup(),f=fixture();f.data.current=null;
 s.a.render(f,{stale:true});assert.ok(shown(s,'mainRainConflict'));assert.match(s.nodes.get('status').textContent,/Saved forecast/);
});
test('snow and thunderstorm symbols survive zero-probability explanations',()=>{
 for(const [code,glyph] of [[71,'🌨️'],[95,'⛈️']]){const s=setup();render(s,fixture({code}));assert.equal(s.nodes.get('icon').innerHTML,glyph);assert.ok(shown(s,'mainRainConflict'));}
});
test('page and service-worker asset versions match',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const appURL=html.match(/src="(\.\/app\.js\?v=\d+)"/)[1];
 assert.ok(sw.includes("'"+appURL+"'"));assert.ok(sw.includes('mani-weather-shell-v39'));
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.ok(html.includes('id="'+id+'" class="detailnote hidden"'));
});



