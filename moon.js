(() => {
'use strict';
const A=window.Astronomy, ZONE='Europe/Athens', LAT=36.8243, LON=22.2811, HOUR=3600000;
const el=id=>document.getElementById(id);
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const calendar=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const shortDate=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'numeric',month:'short'});
const observer=A?new A.Observer(LAT,LON,0):null;
let forecast=null, cachedNight=null;
function position(body,date){const eq=A.Equator(body,date,observer,true,true);return A.Horizon(date,observer,eq.ra,eq.dec,'normal');}
function event(body,direction,start,days){return A.SearchRiseSet(body,observer,direction,start,days)?.date||null;}
function eventText(date,base){return date?clock.format(date)+(calendar.format(date)!==calendar.format(base)?' · '+shortDate.format(date):''):'Not in this passage';}
function phaseName(angle){
 if(angle<5||angle>=355)return 'New Moon';
 if(angle<85)return 'Waxing crescent';if(angle<95)return 'First quarter';
 if(angle<175)return 'Waxing gibbous';if(angle<185)return 'Full Moon';
 if(angle<265)return 'Waning gibbous';if(angle<275)return 'Last quarter';return 'Waning crescent';
}
function moonGraphic(fraction,waxing){
 const points=[],r=26,c=32,sign=waxing?1:-1;
 for(let i=0;i<=60;i++){const y=-r+2*r*i/60;points.push([c+sign*Math.sqrt(Math.max(0,r*r-y*y)),c+y]);}
 for(let i=60;i>=0;i--){const y=-r+2*r*i/60;points.push([c+sign*(1-2*fraction)*Math.sqrt(Math.max(0,r*r-y*y)),c+y]);}
 const path='M'+points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join('L')+'Z';
 return '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false"><defs><clipPath id="moon-lit"><path d="'+path+'"/></clipPath></defs><circle cx="32" cy="32" r="26" fill="#233e51" stroke="#69899c" stroke-width=".8"/><path d="'+path+'" fill="#eee7cf"/><g clip-path="url(#moon-lit)" fill="#78858b" opacity=".19"><circle cx="42" cy="22" r="7"/><circle cx="25" cy="39" r="5"/><circle cx="43" cy="43" r="4"/><circle cx="20" cy="20" r="3"/></g></svg>';
}
function nightFor(now){
 // Anchor to solar events, so the ongoing night survives midnight and DST changes.
 if(cachedNight&&now>=cachedNight.validFrom&&now<cachedNight.end)return cachedNight;
 const nextRise=event('Sun',1,now,2),nextSet=event('Sun',-1,now,2);
 if(!nextRise||!nextSet)throw Error('Solar events unavailable');
 const start=nextRise<nextSet?event('Sun',-1,now,-2):nextSet;
 const end=event('Sun',1,new Date(+start+1000),2);
 const previousRise=event('Moon',1,start,-2),previousSet=event('Moon',-1,start,-2);
 const upAtSunset=previousRise&&previousSet&&previousRise>previousSet;
 const rise=upAtSunset?previousRise:event('Moon',1,start,2);
 const set=rise?event('Moon',-1,new Date(+rise+1000),2):null;
 const darkStart=A.SearchAltitude('Sun',observer,-1,start,1,-6)?.date||start;
 const darkEnd=A.SearchAltitude('Sun',observer,1,darkStart,1,-6)?.date||end;
 // Include every moon-up interval, even if there is a set then a rise in one night.
 const events=[];
 for(const direction of [1,-1]){
  let cursor=start;
  for(let i=0;i<3;i++){const t=event('Moon',direction,cursor,2);if(!t||t>=end)break;events.push({time:t,direction});cursor=new Date(+t+1000);}
 }
 events.sort((a,b)=>a.time-b.time);
 const intervals=[];let opened=upAtSunset?start:null;
 for(const e of events){if(e.direction===1)opened=e.time;else if(opened){intervals.push([opened,e.time]);opened=null;}}
 if(opened)intervals.push([opened,end]);
 cachedNight={validFrom:new Date(Math.min(+now,+start)),start,end,rise,set,darkStart,darkEnd,intervals};return cachedNight;
}
function cloudAt(date,now){
 if(!forecast||forecast.stale||!Number.isFinite(Date.parse(forecast.savedAt))||now-Date.parse(forecast.savedAt)>HOUR||Date.parse(forecast.savedAt)>+now+5*60000)return null;
 const h=forecast.hourly,key=calendar.format(date)+'T'+clock.format(date).slice(0,2)+':00';
 const i=h?.time?.indexOf(key)??-1,value=i<0?null:h.cloud_cover?.[i];
 return Number.isFinite(value)&&value>=0&&value<=100?value:null;
}
function compass(azimuth){return ['N','NE','E','SE','S','SW','W','NW'][Math.round(azimuth/45)%8];}
function viewingSamples(night,now){
 const samples=[];
 for(let t=Math.ceil(Math.max(+now,+night.darkStart)/HOUR)*HOUR;t<+night.darkEnd;t+=HOUR){
  const date=new Date(t),pos=position('Moon',date);
  if(pos.altitude>0)samples.push({date,altitude:pos.altitude,azimuth:pos.azimuth,cloud:cloudAt(date,now)});
 }
 return samples;
}
function render(now=new Date()){
 if(!A)throw Error('Astronomy library unavailable');
 const night=nightFor(now),reference=new Date(Math.max(+now,+night.start));
 const angle=A.MoonPhase(reference),fraction=A.Illumination('Moon',reference).phase_fraction;
 el('moonGraphic').innerHTML=moonGraphic(fraction,angle<180);
 el('moonPhase').textContent=phaseName(angle);
 el('moonIllumination').textContent=Math.round(fraction*100)+'% illuminated';
 el('moonRise').textContent=eventText(night.rise,night.start);
 el('moonSet').textContent=eventText(night.set,night.start);
 el('moonNightLabel').textContent=shortDate.format(night.start)+' – '+shortDate.format(night.end)+' · Greek time';
 const pos=position('Moon',now);
 el('moonNow').textContent=pos.altitude>0?'Now: '+compass(pos.azimuth)+' · '+Math.round(pos.altitude)+'° above the horizon':'Now: below the horizon';
 const remaining=night.intervals.map(([a,b])=>[new Date(Math.max(+a,+now)),b]).filter(([a,b])=>a<b);
 el('moonWindow').textContent=remaining.length?'Above the horizon '+remaining.map(([a,b])=>eventText(a,night.start)+'–'+eventText(b,night.start)).join(' and ')+'.': 'No remaining time above the horizon between sunset and sunrise.';
 const samples=viewingSamples(night,now),usable=samples.filter(s=>s.altitude>=10&&s.cloud!==null);
 const best=usable.reduce((a,b)=>!a||b.cloud<a.cloud?b:a,null);
 let outlook;
 if(!remaining.length)outlook='The Moon is below the horizon for the rest of this night.';
 else if(!samples.length)outlook='Only a short or twilight viewing window remains.';
 else if(fraction<.04)outlook='A very thin or new Moon: difficult to see, even with clear skies.';
 else if(!samples.some(s=>s.altitude>=10))outlook='The Moon stays low during the remaining dark hours; the horizon may hide it.';
 else if(!best)outlook='Cloud outlook unavailable — showing astronomy only.';
 else outlook=(best.cloud<=30?'Promising cloud conditions':best.cloud<=70?'Some cloud breaks possible':'Cloud may obscure the Moon')+' around '+eventText(best.date,night.start)+'. Clearest sampled hour: '+Math.round(best.cloud)+'% cloud forecast.';
 el('moonOutlook').textContent=outlook;
 const indices=new Set(samples.length?[0,Math.floor((samples.length-1)/2),samples.length-1]:[]);
 if(best)indices.add(samples.indexOf(best));
 el('moonHours').innerHTML=[...indices].sort((a,b)=>a-b).map(i=>{const s=samples[i];return '<div class="moon-hour"><time>'+eventText(s.date,night.start)+'</time><span>'+compass(s.azimuth)+' · '+Math.round(s.altitude)+'° high</span><span>'+(s.cloud===null?'Cloud data unavailable':Math.round(s.cloud)+'% cloud')+'</span></div>';}).join('');
 el('moonPhaseTime').textContent='Phase at '+eventText(reference,night.start)+' Greek time. The drawing shows the lit fraction, not the Moon’s tilt in the sky.';
}
function safeRender(){try{render()}catch(error){el('moonPhase').textContent='Moon information unavailable';el('moonIllumination').textContent='Please reload the page';el('moonOutlook').textContent='The lunar calculation could not be completed.';}}
window.ManiMoon={setForecast(data,{stale=false}={}){forecast={hourly:data.data?.hourly,savedAt:data.savedAt,stale};safeRender();}};
el('moonPanel').addEventListener('toggle',()=>{if(el('moonPanel').open)safeRender();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)safeRender();});
window.addEventListener('offline',()=>{if(forecast)forecast.stale=true;safeRender();});
setInterval(()=>{if(!document.hidden)safeRender();},60000);
safeRender();
})();
