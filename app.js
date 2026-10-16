(() => {
'use strict';
const LAT=36.8243, LON=22.2811, ZONE='Europe/Athens', CACHE_KEY='mani-weather-live-v4';
const mainFields={current:'temperature_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m', hourly:'temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m', daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset'};
const el=id=>document.getElementById(id);
const fmt=(v,d=0)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
const probability=(v)=>Number.isFinite(v)?Math.round(v)+'%':'N/A';
function dayProbability(d,h,i){const direct=d.precipitation_probability_max?.[i];if(Number.isFinite(direct))return direct;const date=d.time?.[i];if(!date)return null;const values=(h.time||[]).flatMap((t,j)=>t.startsWith(date)&&Number.isFinite(h.precipitation_probability?.[j])?[h.precipitation_probability[j]]:[]);return values.length?Math.max(...values):null;}
function icon(code, day=true, rainChance=null){
 if(code>=95)return '⛈️';
 if(code>=80&&code<=82)return day?'🌦️':'🌧️';
 if(code>=51&&code<=67)return '🌧️';
 if(code>=71&&code<=86)return '🌨️';
 // Chance changes only the icon, never the forecasted rainfall or probability.
 if(Number.isFinite(rainChance)&&rainChance>=60)return '🌧️';
 if(Number.isFinite(rainChance)&&rainChance>=40)return day?'🌦️':'☁️💧';
 if(code==null)return day?'⛅':'🌙☁️';
 if(code<=1)return day?'☀️':'🌙';
 if(code<=3)return day?'⛅':'🌙☁️';
 return '☁️';
}
function isDayAt(localTime,daily){
 const day=localTime?.slice(0,10), i=daily.time?.indexOf(day)??-1;
 const sunrise=i>=0?daily.sunrise?.[i]:null, sunset=i>=0?daily.sunset?.[i]:null;
 if(sunrise&&sunset)return localTime>=sunrise&&localTime<sunset;
 // Approximation only for previously cached forecasts without sunrise/sunset.
 const hour=Number(localTime?.slice(11,13));return Number.isFinite(hour)&&hour>=7&&hour<19;
}
function description(code){if(code==null)return'Forecast available';if(code<=1)return'Mostly clear';if(code<=3)return'Partly cloudy';if(code<=48)return'Cloudy or foggy';if(code>=95)return'Thunderstorms';if(code>=80&&code<=82)return'Showers';if(code>=51&&code<=67)return'Rain or drizzle';if(code>=71&&code<=86)return'Snow';return'Variable skies'}
const athensDate=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const athensClock=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false});
function localISO(){const datestr=athensDate.format(new Date());const hh=athensClock.format(new Date());return datestr+'T'+hh}
function labelDate(s,weekday='short'){return new Intl.DateTimeFormat('en-GB',{weekday,day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(s.slice(0,10)+'T12:00:00Z'))}
function buildUrl(model,fields){const u=new URL('https://api.open-meteo.com/v1/forecast');const params={latitude:LAT,longitude:LON,timezone:ZONE,forecast_days:5,wind_speed_unit:'kmh',precipitation_unit:'mm',models:model,...fields};Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));return u.toString()}
async function request(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);try{const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});if(!r.ok)throw Error('Forecast API returned '+r.status);const a=await r.json();if(a.error)throw Error(a.reason||'Forecast provider error');return a}finally{clearTimeout(timer)}}
function safeSave(payload){try{localStorage.setItem(CACHE_KEY,JSON.stringify(payload))}catch(e){}}
function safeLoad(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&x.data&&x.savedAt?x:null}catch(e){return null}}
let payload=null,selectedDay=-1,updating=false;
function setStatus(message,style){el('status').innerHTML='<span class="dot '+(style||'')+'"></span><span>'+message+'</span>'}
function modelAtCurrent(hourly,current){if(!hourly?.time?.length)return null;const point=current?.time||localISO();let best=0;for(let i=0;i<hourly.time.length;i++){if(hourly.time[i]<=point)best=i;else break}return best}
function nextHourIndex(hourly){const t=localISO().slice(0,13)+':00';let idx=hourly.time.findIndex(x=>x>=t);return idx<0?hourly.time.length:idx}
function render(payloadData,{stale=false}={}){
 const a=payloadData.data, d=a.daily, h=a.hourly, c=a.current||{};
 if(!d?.time?.length||!h?.time?.length||d.time.length<5)throw Error('Incomplete forecast data');
 const dateToday=localISO().slice(0,10), todayIndex=d.time.indexOf(dateToday), dayIndex=todayIndex>=0?todayIndex:0;
 const usableC=Number.isFinite(c.temperature_2m),hi=modelAtCurrent(h,c),temperature=usableC?c.temperature_2m:h.temperature_2m?.[hi],wcode=usableC?c.weather_code:h.weather_code?.[hi],isDay=usableC?c.is_day:1;
 el('icon').textContent=icon(wcode,isDay===1);el('temp').textContent=fmt(temperature)+'°';el('cond').textContent=description(wcode);
 el('today').textContent='High '+fmt(d.temperature_2m_max?.[dayIndex])+'° · Low '+fmt(d.temperature_2m_min?.[dayIndex])+'°';
 el('wind').textContent='Wind '+fmt(c.wind_speed_10m)+' · gust '+fmt(c.wind_gusts_10m)+' km/h';
 el('at').textContent='Model estimate '+(c.time?.replace('T',' ')||'—')+' · not a station reading';
 el('rain').textContent=fmt(d.precipitation_sum?.[dayIndex],1)+' mm';el('chance').textContent=probability(dayProbability(d,h,dayIndex));el('maxgust').textContent=fmt(d.wind_gusts_10m_max?.[dayIndex])+' km/h';
 const nowIdx=nextHourIndex(h), hours=[];
 for(let i=nowIdx;i<Math.min(nowIdx+12,h.time.length);i++)hours.push(i);
 const vals=(key)=>hours.map(i=>h[key]?.[i]).filter(Number.isFinite);
 const sum=vals('precipitation').reduce((s,v)=>s+v,0);
 const probs=vals('precipitation_probability'),peak=probs.length?Math.max(...probs):null;
 const gusts=vals('wind_gusts_10m'),peakGust=gusts.length?Math.max(...gusts):null;
 const thunder=hours.some(i=>h.weather_code?.[i]>=95&&h.weather_code?.[i]<=99);
 const parts=[];
 if(thunder)parts.push('Possible thunderstorm');if(sum>=7)parts.push('Significant rain forecast');if(peakGust>=50)parts.push('Strong wind gusts possible');
 const risk=el('risk');risk.className='alert '+(parts.length?'':'ok');
 risk.innerHTML='<strong>'+(parts.length?'⚠ '+parts.join(' · '):'✓ No major modeled hazard in the next 12 hours')+'</strong>'+
 'Next 12 hours: '+fmt(sum,1)+' mm forecast · highest hourly rain chance '+fmt(peak)+'% · peak gust '+fmt(peakGust)+' km/h.';
 
 const group=[];for(let j=0;j<hours.length;j+=2){const ids=hours.slice(j,j+2);if(!ids.length)continue;const last=ids[ids.length-1], first=ids[0];const accum=ids.reduce((s,i)=>s+(Number.isFinite(h.precipitation?.[i])?h.precipitation[i]:0),0);const per=ids.map(i=>h.precipitation_probability?.[i]).filter(Number.isFinite);const gp=per.length?Math.max(...per):null;
 group.push({time:h.time[first].slice(11,16),at:h.time[first],temp:h.temperature_2m?.[first],code:h.weather_code?.[first],mm:accum,prob:gp})}
 el('hours').innerHTML=group.map(x=>'<div class="hour"><time>'+x.time+'</time><span class="glyph">'+icon(x.code,isDayAt(x.at,d),x.prob)+'</span><div class="htemp">'+fmt(x.temp)+'°</div><div class="hprob">'+fmt(x.prob)+'%</div><div class="hmm">'+fmt(x.mm,1)+'mm</div></div>').join('')||'<div>Hourly forecast unavailable</div>';
 el('days').innerHTML=d.time.slice(0,5).map((date,i)=>'<tr data-day="'+i+'" tabindex="0" role="button" aria-label="See '+labelDate(date)+' hourly details" aria-selected="'+(i===selectedDay)+'"><td><span class="symbol">'+icon(d.weather_code?.[i])+'</span>'+labelDate(date).split(',')[0]+'</td><td>'+fmt(d.temperature_2m_max?.[i])+'° / '+fmt(d.temperature_2m_min?.[i])+'°</td><td>'+fmt(d.precipitation_probability_max?.[i])+'% <span class="small">· '+fmt(d.precipitation_sum?.[i],1)+'mm</span></td><td>'+fmt(d.wind_gusts_10m_max?.[i])+'</td></tr>').join('');
 el('days').querySelectorAll('tr[data-day]').forEach(row=>{const click=()=>{const x=Number(row.dataset.day);selectedDay=x===selectedDay?-1:x;renderDetail(d,h,payloadData);el('days').querySelectorAll('tr[data-day]').forEach(y=>y.setAttribute('aria-selected',y.dataset.day===String(selectedDay)?'true':'false'))};row.addEventListener('click',click);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})});
 renderDetail(d,h,payloadData);
 const fetched=new Date(payloadData.savedAt), stamp=athensClock.format(fetched);
 el('stamp').textContent=(stale?'Saved forecast · last fetched ':'Checked at ')+stamp+' Greek time · '+new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'numeric',month:'short'}).format(fetched);
 setStatus(stale?'Offline or service unavailable · showing saved forecast':'Forecast updated successfully',stale?'error':'');
 }
function renderDetail(d,h,forecast){const box=el('detail');if(selectedDay<0||!d.time[selectedDay]){box.classList.add('hidden');box.innerHTML='';return}const dt=d.time[selectedDay],matches=h.time.map((t,i)=>t.startsWith(dt)?i:-1).filter(i=>i>=0);let arr=[];
 for(let j=0;j<matches.length;j+=3){const ix=matches.slice(j,j+3),ps=ix.map(i=>h.precipitation_probability?.[i]).filter(Number.isFinite),gusts=ix.map(i=>h.wind_gusts_10m?.[i]).filter(Number.isFinite);let mm=ix.reduce((a,i)=>a+(Number.isFinite(h.precipitation?.[i])?h.precipitation[i]:0),0);arr.push({t:h.time[ix[0]].slice(11,16),at:h.time[ix[0]],c:h.weather_code?.[ix[0]],temp:h.temperature_2m?.[ix[0]],p:ps.length?Math.max(...ps):null,mm,g:gusts.length?Math.max(...gusts):null})}
 box.classList.remove('hidden');box.innerHTML='<div class="detailhead">'+labelDate(dt,'long')+' · three-hour periods</div><div class="detailnote">Tap the day again to close. Rain chance is the highest hourly chance within each block, and mm is the sum for that block.</div><div class="detailrows">'+arr.map(x=>'<div class="detailcell"><strong>'+x.t+'</strong>'+icon(x.c,isDayAt(x.at,d),x.p)+' '+fmt(x.temp)+'°<br>'+probability(x.p)+' rain<br>'+fmt(x.mm,1)+' mm<br>gust '+fmt(x.g)+'</div>').join('')+'</div>'+modelComparison(forecast,dt)}
function modelComparison(x,date){
 const entries=[['ECMWF IFS',x?.ecmwf],['ICON Europe',x?.icon],['GFS',x?.gfs]];
 const rows=entries.map(([name,data])=>{const i=data?.daily?.time?.indexOf(date)??-1;const mm=i>=0?data.daily.precipitation_sum?.[i]:null;return {name,mm:Number.isFinite(mm)?mm:null}});
 const valid=rows.filter(r=>r.mm!==null), values=valid.map(r=>r.mm);
 let interpretation='Not enough model data for a meaningful comparison.';
 if(valid.length>=2){const low=Math.min(...values),high=Math.max(...values),spread=high-low;
 if(high<0.5)interpretation='Available models agree on little or no measurable rainfall.';
 else if(low<0.5&&high>=2)interpretation='Models disagree on whether appreciable rain will occur. Confidence is limited.';
 else if(spread>=5||high>=2&&low>0&&high/low>=3)interpretation='Models differ substantially on rainfall amounts. Treat the totals cautiously.';
 else interpretation='Available models give broadly similar rainfall amounts.';
 }
 return '<div class="modelcompare"><div class="detailhead">Rainfall · model comparison</div>'+rows.map(r=>'<div class="modelrow"><span class="modelname">'+r.name+'</span><span class="modelvalue">'+(r.mm===null?'Not available':fmt(r.mm,1)+' mm')+'</span></div>').join('')+'<div class="modelnote">'+interpretation+' '+valid.length+' of 3 model feeds available. These are deterministic forecasts, not ensemble probabilities; rainfall amounts do not represent rain chances.</div></div>';
}
function renderModels(x){const b=x.icon, c=x.ecmwf, box=el('models');let result='';const date=x.data.daily.time?.[1]||'';for(const [name,r] of [['ICON-EU',b],['ECMWF IFS',c]]){const value=r?.daily?.precipitation_sum?.[r.daily.time?.indexOf(date)];result+='<div class="modelrow"><span class="modelname">'+name+' · tomorrow</span><span class="modelvalue">'+fmt(value,1)+' mm</span></div>'}const x1=b?.daily?.precipitation_sum?.[b.daily.time?.indexOf(date)],x2=c?.daily?.precipitation_sum?.[c.daily.time?.indexOf(date)],good=Number.isFinite(x1)&&Number.isFinite(x2);
 result+='<div class="modelnote">'+(good?(Math.abs(x1-x2)>=5?'Models differ by '+fmt(Math.abs(x1-x2),1)+' mm. Treat tomorrow’s rainfall amount with caution.':'These two models give broadly similar rainfall totals for tomorrow.'):'One or both model feeds are unavailable. No comparison is inferred.')+' These are deterministic forecasts, not ensemble probabilities.</div>';box.innerHTML=result}

const RADAR_API='https://api.rainviewer.com/public/weather-maps.json';
let radarFrames=[],radarIndex=-1,radarLastChecked=0,radarBusy=false;
function radarClock(sec){return new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sec*1000));}
function showRadarFrame(){
 const frame=radarFrames[radarIndex];if(!frame)return;
 const age=Math.round((Date.now()-frame.time*1000)/60000);
 el('radarPrev').disabled=radarIndex===0;
 el('radarNext').disabled=radarIndex===radarFrames.length-1;
 el('radarFrameTime').textContent=radarClock(frame.time)+' Greek time';
 el('radarStatus').textContent='Radar image about '+Math.max(0,age)+' minutes old · not a live observation at your property.';
 const img=el('radarImage');
 el('radarMap').classList.add('hidden');
 img.onload=()=>{el('radarMap').classList.remove('hidden');};
 img.onerror=()=>{el('radarMap').classList.add('hidden');el('radarStatus').textContent='Radar image unavailable for this frame. Coverage is not confirmed.';};
 // Only a trusted host is used; frame paths are validated before they reach here.
 img.src='https://tilecache.rainviewer.com'+frame.path+'/512/7/'+LAT+'/'+LON+'/2/0_0.png';
}
async function refreshRadar(force=false){
 if(!el('radarPanel').open||radarBusy)return;
 if(!force&&radarLastChecked&&Date.now()-radarLastChecked<9*60*1000)return;
 radarBusy=true;el('radarStatus').textContent='Checking radar imagery…';
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);
 try{
  const response=await fetch(RADAR_API,{signal:ctl.signal,cache:'no-store'});
  if(!response.ok)throw Error('radar service unavailable');
  const manifest=await response.json();
  if(manifest.host!=='https://tilecache.rainviewer.com')throw Error('unrecognised radar image host');
  const frames=(manifest.radar?.past||[]).filter(f=>Number.isInteger(f.time)&&/^\\/v2\\/radar\\/[a-z0-9]+$/i.test(f.path)&&f.time*1000<Date.now()+300000).slice(-6);
  if(!frames.length)throw Error('no recent radar frames');
  if(Date.now()-frames[frames.length-1].time*1000>45*60*1000)throw Error('radar images are too old');
  radarFrames=frames;radarIndex=frames.length-1;radarLastChecked=Date.now();showRadarFrame();
 }catch(err){
  radarLastChecked=0;radarFrames=[];radarIndex=-1;
  el('radarMap').classList.add('hidden');
  el('radarPrev').disabled=true;el('radarNext').disabled=true;
  el('radarFrameTime').textContent='—';
  el('radarStatus').textContent='Recent radar unavailable ('+(err.name==='AbortError'?'request timed out':err.message||'connection problem')+'). This does not mean it is dry.';
 }finally{clearTimeout(timeout);radarBusy=false;}
}
el('radarPanel').addEventListener('toggle',()=>{if(el('radarPanel').open)refreshRadar()});
el('radarPrev').addEventListener('click',()=>{if(radarIndex>0){radarIndex--;showRadarFrame()}});
el('radarNext').addEventListener('click',()=>{if(radarIndex<radarFrames.length-1){radarIndex++;showRadarFrame()}});
setInterval(()=>{if(!document.hidden&&el('radarPanel').open)refreshRadar()},2*60*1000);

async function refresh(){if(updating)return;updating=true;const btn=el('refresh');btn.disabled=true;btn.innerHTML='<span class="spin">↻</span>';el('error').classList.add('hidden');setStatus('Checking current forecast…','busy');
 try{const f=await Promise.allSettled([request(buildUrl('best_match',mainFields)),request(buildUrl('icon_eu',{daily:'precipitation_sum'})),request(buildUrl('ecmwf_ifs025',{daily:'precipitation_sum'})),request(buildUrl('gfs_global',{daily:'precipitation_sum'}))]);if(f[0].status!=='fulfilled')throw f[0].reason||Error('Forecast service unavailable');const a=f[0].value;if(!a.daily?.time||!a.hourly?.time)throw Error('Incomplete forecast data');
 payload={data:a,icon:f[1].status==='fulfilled'?f[1].value:null,ecmwf:f[2].status==='fulfilled'?f[2].value:null,gfs:f[3].status==='fulfilled'?f[3].value:null,savedAt:new Date().toISOString()};safeSave(payload);render(payload);}
 catch(err){const cached=safeLoad();if(cached){try{payload=cached;render(payload,{stale:true})}catch(e){setStatus('Weather data unavailable','error')}}else{setStatus('Unable to connect to weather service','error');el('stamp').textContent='Could not retrieve live data';}el('error').textContent='Live forecast not available: '+(err.name==='AbortError'?'connection timed out':(err.message||'network error'))+'. '+(cached?'Displaying saved data, which may be outdated.':'Check connectivity and press refresh.');el('error').classList.remove('hidden');}
 finally{updating=false;btn.disabled=false;btn.textContent='↻'}}
 el('refresh').addEventListener('click',()=>{refresh();refreshRadar(true)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&payload&&Date.now()-Date.parse(payload.savedAt)>20*60*1000)refresh()});
 setInterval(()=>{if(!document.hidden&&(!payload||Date.now()-Date.parse(payload.savedAt)>30*60*1000))refresh()},5*60*1000);
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
 refresh();
})();