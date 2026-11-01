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
 globalThis.api={icon,currentSummary,rainConflict,chanceWithZeroAmount,render,refresh,updateMainRainChance,
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
  assert.equal(s.nodes.get('icon').innerHTML,'<img class="weather-symbol" src="./icons/weather/rain.svg?v=2" alt="Rain" width="64" height="64">');
 });
}
test('hourly wet code is explained when current code is dry',()=>{
 const s=setup();render(s,fixture({code:61,currentCode:0}));
 assert.ok(shown(s,'mainRainConflict'));assert.equal(s.nodes.get('cond').textContent,'Rain or drizzle forecast this hour');
});
for(const [p,glyph,word] of [[40,'<img class="weather-symbol" src="./icons/weather/partly-cloudy-day-rain.svg?v=2" alt="Showers" width="64" height="64">','possible'],[60,'<img class="weather-symbol" src="./icons/weather/rain.svg?v=2" alt="Rain" width="64" height="64">','likely']]){
 test(p+'% with a dry code preserves probability-led icons and explains the zero amount',()=>{
  const s=setup();render(s,fixture({code:0,p}));
  assert.equal(s.nodes.get('icon').innerHTML,glyph);assert.equal(s.nodes.get('chance').textContent,p+'%*');
  assert.equal(s.nodes.get('cond').textContent,'Rain '+word+' this hour');
  for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict']){assert.ok(shown(s,id));assert.match(s.nodes.get(id).textContent,/Rain is still possible with 0.0 mm forecast/);}
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
 assert.equal(s.nodes.get('icon').innerHTML,'<img class="weather-symbol" src="./icons/weather/clear-day.svg?v=2" alt="Clear skies" width="64" height="64">');assert.equal(shown(s,'mainRainConflict'),false);
});
test('minute timer and return to tab update the main marker at hour rollover',()=>{
 const s=setup(),f=fixture({code:0,p:0});f.data.hourly.precipitation_probability[13]=60;render(s,f);
 assert.equal(s.nodes.get('chance').textContent,'60%*');assert.equal(s.nodes.get('icon').innerHTML,'<img class="weather-symbol" src="./icons/weather/rain.svg?v=2" alt="Rain" width="64" height="64">');
 s.a.setNow('2026-10-25T13:01');s.tick();
 assert.equal(s.nodes.get('chance').textContent,'0%*');assert.ok(shown(s,'mainRainConflict'));
 s.document.hidden=true;s.a.setNow('2026-10-25T12:59');s.tick();assert.ok(shown(s,'mainRainConflict'));
 s.document.hidden=false;s.events.visibilitychange();
 assert.equal(s.nodes.get('chance').textContent,'60%*');assert.ok(shown(s,'mainRainConflict'));assert.match(s.nodes.get('mainRainConflict').textContent,/Rain is still possible/);
});
test('a successful refresh clears all resolved notes and markers',async()=>{
 const s=setup();s.a.selectDay(0);render(s,fixture());s.setFeed(fixture({code:0}).data);await s.a.refresh();
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict']){assert.equal(shown(s,id),false);assert.equal(s.nodes.get(id).textContent,'');}
 for(const id of ['chance','hours','days','detail'])assert.doesNotMatch(s.nodes.get(id).innerHTML,/aria-describedby="(?:main|hours|days|detail)RainConflict"/);
 assert.equal(s.nodes.get('icon').innerHTML,'<img class="weather-symbol" src="./icons/weather/clear-day.svg?v=2" alt="Clear skies" width="64" height="64">');
});
test('saved forecasts and absent current data can still explain hourly conflicts',()=>{
 const s=setup(),f=fixture();f.data.current=null;
 s.a.render(f,{stale:true});assert.ok(shown(s,'mainRainConflict'));assert.match(s.nodes.get('status').textContent,/Saved forecast/);
});
test('snow and thunderstorm symbols survive zero-probability explanations',()=>{
 for(const [code,glyph] of [[71,'<img class="weather-symbol" src="./icons/weather/snow.svg?v=2" alt="Snow" width="64" height="64">'],[95,'<img class="weather-symbol" src="./icons/weather/thunderstorms-rain.svg?v=2" alt="Thunderstorms" width="64" height="64">']]){const s=setup();render(s,fixture({code}));assert.equal(s.nodes.get('icon').innerHTML,glyph);assert.ok(shown(s,'mainRainConflict'));}
});
test('page and service-worker asset versions match',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const appURL=html.match(/src="(\.\/app\.js\?v=\d+)"/)[1];
 assert.ok(sw.includes("'"+appURL+"'"));assert.ok(sw.includes('mani-weather-shell-v45'));
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.ok(html.includes('id="'+id+'" class="detailnote hidden"'));
});




test('day and night artwork preserves dry, wet and probability-led choices',()=>{
 const {a}=setup();
 for(const [code,day,p,mm,name] of [
  [0,true,null,null,'clear-day'],[1,false,null,null,'clear-night'],
  [2,true,null,null,'partly-cloudy-day'],[2,false,null,null,'partly-cloudy-night'],
  [null,false,null,null,'partly-cloudy-night'],[3,true,null,null,'cloudy'],
  [45,false,null,null,'cloudy'],[80,true,0,0,'partly-cloudy-day-rain'],
  [80,false,0,0,'rain'],[61,true,0,0,'rain'],[71,true,0,0,'snow'],
  [95,false,0,0,'thunderstorms-rain'],[0,false,40,0,'partly-cloudy-night-rain'],
  [0,false,60,0,'rain'],[0,true,0,0.001,'partly-cloudy-day-rain']
 ])assert.match(a.icon(code,day,p,mm),new RegExp('/'+name+'\\.svg\\?v=2"'));
});
test('every weather asset exists, is static and is available in the offline shell',()=>{
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 const names=[...source.matchAll(/weatherSymbol\('([^']+)'/g)].map(m=>m[1]);
 assert.equal(new Set(names).size,10);
 for(const name of new Set(names)){
  const relative='./icons/weather/'+name+'.svg';
  const svg=fs.readFileSync(path.join(root,relative),'utf8');
  assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/<(?:script|animate|animateTransform|foreignObject)\b/);
  assert.ok(sw.includes("'"+relative+"?v=2'"),relative);
 }
});

for(const p of [65,68])test(p+'% and zero mm are explained in every forecast view without changing data',()=>{
 const s=setup(),f=fixture({code:0,p}),before=JSON.stringify(f);s.a.selectDay(0);render(s,f);
 assert.equal(JSON.stringify(f),before);
 assert.equal(s.nodes.get('chance').textContent,p+'%*');assert.equal(s.nodes.get('rain').textContent,'0.0 mm');
 for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.match(s.nodes.get(id).textContent,/very small amounts may round down to zero/);
 for(const [id,note] of [['hours','hoursRainConflict'],['days','daysRainConflict'],['detail','detailRainConflict']])assert.ok(s.nodes.get(id).innerHTML.includes('aria-describedby="'+note+'"'));
 assert.match(s.nodes.get('detail').innerHTML,/Rain is still possible with 0.0 mm forecast/);
});
test('zero-amount explanation follows rounding and requires valid substantial probability',()=>{
 const {a}=setup();
 for(const mm of [0,0.001,0.049])assert.equal(a.chanceWithZeroAmount({p:65,mm}),true);
 for(const mm of [0.05,0.1,null,undefined,NaN,-0.01])assert.equal(a.chanceWithZeroAmount({p:65,mm}),false);
 for(const p of [0,39.9,null,undefined,NaN,101])assert.equal(a.chanceWithZeroAmount({p,mm:0}),false);
 assert.equal(a.chanceWithZeroAmount({p:40,mm:0}),true);
});
test('mixed periods explain both directions of disagreement',()=>{
 const s=setup(),f=fixture({code:0,p:65});s.a.selectDay(0);
 f.data.hourly.weather_code.fill(61,12,15);f.data.hourly.precipitation_probability.fill(0,13,16);
 render(s,f);
 for(const id of ['hoursRainConflict','daysRainConflict']){
  assert.match(s.nodes.get(id).textContent,/Rain is still possible/);
 }
 for(const text of [s.nodes.get('hoursRainConflict').textContent,s.nodes.get('detail').innerHTML]){
  assert.match(text,/Forecast signals disagree/);assert.match(text,/Rain is still possible/);
 }
});
test('new notes clear when amounts become nonzero or probability drops',()=>{
 const s=setup();s.a.selectDay(0);render(s,fixture({code:0,p:68}));
 for(const f of [fixture({code:0,p:68,mm:0.1}),fixture({code:0,p:10})]){
  render(s,f);for(const id of ['mainRainConflict','hoursRainConflict','daysRainConflict'])assert.equal(shown(s,id),false);
  assert.doesNotMatch(s.nodes.get('detail').innerHTML,/detailRainConflict/);
 }
});
test('minute update clears the new note when the rainy hour has passed',()=>{
 const s=setup(),f=fixture({code:0,p:0});f.data.hourly.precipitation_probability[13]=68;f.data.current.time='2026-10-25T11:30';render(s,f);
 assert.match(s.nodes.get('mainRainConflict').textContent,/Rain is still possible/);
 s.a.setNow('2026-10-25T13:01');s.tick();assert.equal(shown(s,'mainRainConflict'),false);assert.equal(s.nodes.get('chance').textContent,'0%');
});
test('saved forecasts retain the explanation and saved-data warning',()=>{
 const s=setup();s.a.render(fixture({code:0,p:65}),{stale:true});
 assert.match(s.nodes.get('mainRainConflict').textContent,/Rain is still possible/);assert.match(s.nodes.get('status').textContent,/Saved forecast/);
});
