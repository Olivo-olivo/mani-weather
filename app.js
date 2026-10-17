(() => {
'use strict';
const LAT=36.8243, LON=22.2811, ZONE='Europe/Athens', CACHE_KEY='mani-weather-live-v4', REFRESH_MS=10*60*1000;
const mainFields={current:'temperature_2m,relative_humidity_2m,weather_code,is_day,precipitation,wind_speed_10m,wind_gusts_10m', hourly:'temperature_2m,relative_humidity_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m', daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset'};
const el=id=>document.getElementById(id);
const fmt=(v,d=0)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
const probability=(v)=>Number.isFinite(v)?Math.round(v)+'%':'N/A';
function dayProbability(d,h,i){
 const date=d.time?.[i], slots=(h.time||[]).flatMap((t,j)=>date&&t.startsWith(date)?[j]:[]);
 const values=slots.map(j=>hourValue(h,'precipitation_probability',j));
 if(slots.length&&values.every(Number.isFinite))return Math.max(...values);
 const direct=d.precipitation_probability_max?.[i];
 if(Number.isFinite(direct))return direct;
 const available=values.filter(Number.isFinite);return available.length?Math.max(...available):null;
}
function remainingDayProbability(h,now=localISO()){
 const date=now.slice(0,10), start=now.slice(0,13)+':00';
 const values=(h.time||[]).flatMap((t,i)=>t.startsWith(date)&&t>=start?[hourValue(h,'precipitation_probability',i)]:[]);
 // Never fall back to the full-day maximum: it can include rain that has passed.
 return values.length&&values.every(Number.isFinite)?Math.max(...values):null;
}
// Accumulations, probabilities and gusts describe the hour ending at the API timestamp.
function hourValue(h,key,i){return i+1<h.time.length?h[key]?.[i+1]:null;}
function sumValues(values){return values.length&&values.every(Number.isFinite)?values.reduce((s,v)=>s+v,0):null;}
function periodCode(h,ids){
 const rank=c=>c>=95?5:c>=71&&c<=86&&!(c>=80&&c<=82)?4:c>=51&&c<=67||c>=80&&c<=82?3:c>=45&&c<=48?2:1;
 const codes=ids.map(i=>h.weather_code?.[i]).filter(Number.isFinite);
 return codes.length?codes.reduce((a,b)=>rank(b)>rank(a)||rank(b)===rank(a)&&b>a?b:a):null;
}
function icon(code, day=true, rainChance=null, rainMm=null){
 if(code>=95)return '⛈️';
 if(code>=80&&code<=82)return day?'🌦️':'🌧️';
 if(code>=51&&code<=67)return '🌧️';
 if(code>=71&&code<=86)return '🌨️';
 // Represent measurable precipitation even when the weather code says dry.
 if(Number.isFinite(rainMm)&&rainMm>0)return day?'🌦️':'🌧️';
 // Chance changes only the icon, never the forecasted rainfall or probability.
 if(Number.isFinite(rainChance)&&rainChance>=60)return '🌧️';
 if(Number.isFinite(rainChance)&&rainChance>=40)return day?'🌦️':'☁️💧';
 if(code==null)return day?'⛅':'🌙☁️';
 if(code<=1)return day?'☀️':'🌙';
 if(code===2)return day?'⛅':'🌙☁️';
 return '☁️';
}
function isDayAt(localTime,daily){
 const day=localTime?.slice(0,10), i=daily.time?.indexOf(day)??-1;
 const sunrise=i>=0?daily.sunrise?.[i]:null, sunset=i>=0?daily.sunset?.[i]:null;
 if(sunrise&&sunset)return localTime>=sunrise&&localTime<sunset;
 // Approximation only for previously cached forecasts without sunrise/sunset.
 const hour=Number(localTime?.slice(11,13));return Number.isFinite(hour)&&hour>=7&&hour<19;
}
function description(code){if(code==null)return'Forecast available';if(code===0)return'Clear skies';if(code===1)return'Mostly clear';if(code===2)return'Partly cloudy';if(code===3)return'Overcast';if(code===45||code===48)return'Fog';if(code>=95)return'Thunderstorms';if(code>=80&&code<=82)return'Showers';if(code>=51&&code<=67)return'Rain or drizzle';if(code>=71&&code<=86)return'Snow';return'Variable skies'}
const athensDate=new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const athensClock=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false});
function localISO(){const datestr=athensDate.format(new Date());const hh=athensClock.format(new Date());return datestr+'T'+hh}
function labelDate(s,weekday='short'){return new Intl.DateTimeFormat('en-GB',{weekday,day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(s.slice(0,10)+'T12:00:00Z'))}
function buildUrl(model,fields){const u=new URL('https://api.open-meteo.com/v1/forecast');const params={latitude:LAT,longitude:LON,timezone:ZONE,forecast_days:6,wind_speed_unit:'kmh',precipitation_unit:'mm',models:model,...fields};Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));return u.toString()}
async function request(url){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);try{const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});if(!r.ok)throw Error('Forecast API returned '+r.status);const a=await r.json();if(a.error)throw Error(a.reason||'Forecast provider error');return a}finally{clearTimeout(timer)}}
function safeSave(payload){try{localStorage.setItem(CACHE_KEY,JSON.stringify(payload))}catch(e){}}
function safeLoad(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&x.data&&Number.isFinite(Date.parse(x.savedAt))?x:null}catch(e){return null}}
let payload=null,selectedDay=-1,updating=false;
function setStatus(message,style){el('status').innerHTML='<span class="dot '+(style||'')+'"></span><span>'+message+'</span>'}
function modelAtCurrent(hourly,current){if(!hourly?.time?.length)return null;const point=current?.time||localISO();let best=null;for(let i=0;i<hourly.time.length;i++){if(hourly.time[i]<=point)best=i;else break}return best}
function wetCode(code){return Number.isFinite(code)&&((code>=51&&code<=86)||(code>=95&&code<=99));}
function currentSummary(c,h,d){
 const at=c.time||localISO(), i=modelAtCurrent(h,{time:at});
 // Do not borrow rain guidance from another date or an expired hourly range.
 const sameHour=i!==null&&h.time[i].slice(0,13)===at.slice(0,13);
 const hourlyCode=sameHour?h.weather_code?.[i]:null;
 const chance=sameHour?hourValue(h,'precipitation_probability',i):null;
 const day=c.is_day===0?false:c.is_day===1?true:isDayAt(at,d);
 const code=Number.isFinite(c.weather_code)?c.weather_code:hourlyCode;
 if(wetCode(code))return {glyph:icon(code,day),text:description(code)};
 if(Number.isFinite(c.precipitation)&&c.precipitation>0)return {glyph:'🌧️',text:'Rain or drizzle'};
 // An hourly prediction is guidance for the hour, not an observation of rain now.
 if(wetCode(hourlyCode))return {glyph:icon(hourlyCode,day),text:hourlyCode>=95?'Thunderstorms possible this hour':description(hourlyCode)+' forecast this hour'};
 if(Number.isFinite(chance)&&chance>=40)return {glyph:icon(code,day,chance),text:chance>=60?'Rain likely this hour':'Rain possible this hour'};
 return {glyph:icon(code,day),text:description(code)};
}
function nextHourIndex(hourly){const t=localISO().slice(0,13)+':00';let idx=hourly.time.findIndex(x=>x>=t);return idx<0?hourly.time.length:idx}
function render(payloadData,{stale=false}={}){
 const a=payloadData.data, d=a.daily, h=a.hourly, c=a.current||{};
 if(!d?.time?.length||!h?.time?.length||d.time.length<5)throw Error('Incomplete forecast data');
 const dateToday=localISO().slice(0,10), todayIndex=d.time.indexOf(dateToday), dayIndex=todayIndex>=0?todayIndex:0;
 const usableC=Number.isFinite(c.temperature_2m),hi=modelAtCurrent(h,c),temperature=usableC?c.temperature_2m:h.temperature_2m?.[hi],summary=currentSummary(c,h,d);
 el('icon').textContent=summary.glyph;el('temp').textContent=fmt(temperature)+'°';el('cond').textContent=summary.text;
 el('today').textContent='High '+fmt(d.temperature_2m_max?.[dayIndex])+'° · Low '+fmt(d.temperature_2m_min?.[dayIndex])+'°';
 el('wind').textContent='Wind '+fmt(c.wind_speed_10m)+' · gust '+fmt(c.wind_gusts_10m)+' km/h';
 const humidityAt=c.time||localISO(),humidity=Number.isFinite(c.relative_humidity_2m)?c.relative_humidity_2m:hi!==null&&h.time[hi].slice(0,13)===humidityAt.slice(0,13)?h.relative_humidity_2m?.[hi]:null;
 el('humidity').textContent='Humidity '+fmt(humidity)+'%';
 el('at').textContent='Model estimate '+(c.time?.replace('T',' ')||'—')+' · not a station reading';
 el('rain').textContent=fmt(d.precipitation_sum?.[dayIndex],1)+' mm';el('chance').textContent=probability(remainingDayProbability(h));el('maxgust').textContent=fmt(d.wind_gusts_10m_max?.[dayIndex])+' km/h';
 const nowIdx=nextHourIndex(h), hours=[];
 for(let i=nowIdx;i<Math.min(nowIdx+12,h.time.length);i++)hours.push(i);
 const vals=(key)=>hours.map(i=>key==='weather_code'?h[key]?.[i]:hourValue(h,key,i)).filter(Number.isFinite);
 const sum=sumValues(hours.map(i=>hourValue(h,'precipitation',i)));
 const probs=vals('precipitation_probability'),peak=probs.length?Math.max(...probs):null;
 const gusts=vals('wind_gusts_10m'),peakGust=gusts.length?Math.max(...gusts):null;
 const thunder=hours.some(i=>h.weather_code?.[i]>=95&&h.weather_code?.[i]<=99);
 const parts=[];
 if(thunder)parts.push('Possible thunderstorm');if(sum>=7)parts.push('Significant rain forecast');if(peakGust>=50)parts.push('Strong wind gusts possible');
 const complete=hours.length===12&&sum!==null&&vals('weather_code').length===12&&gusts.length===12;
 const risk=el('risk');risk.className='alert '+(parts.length?'':complete?'ok':'info');
 risk.innerHTML='<strong>'+(parts.length?'⚠ '+parts.join(' · '):complete?'✓ No major modeled hazard in the next 12 hours':'Forecast incomplete · hazards cannot be fully assessed')+'</strong>'+
 'Next 12 hours: '+fmt(sum,1)+' mm forecast · highest hourly rain chance '+probability(peak)+' · peak gust '+fmt(peakGust)+' km/h.';
 
 const group=[];for(let j=0;j<hours.length;j+=2){const ids=hours.slice(j,j+2);if(!ids.length)continue;const first=ids[0];const accum=sumValues(ids.map(i=>hourValue(h,'precipitation',i)));const per=ids.map(i=>hourValue(h,'precipitation_probability',i)).filter(Number.isFinite);const gp=per.length?Math.max(...per):null;
 group.push({time:h.time[first].slice(11,16),at:h.time[first],temp:h.temperature_2m?.[first],code:periodCode(h,ids),mm:accum,prob:gp})}
 el('hours').innerHTML=group.map(x=>'<div class="hour"><time>'+x.time+'</time><span class="glyph">'+icon(x.code,isDayAt(x.at,d),x.prob,x.mm)+'</span><div class="htemp">'+fmt(x.temp)+'°</div><div class="hprob">'+probability(x.prob)+'</div><div class="hmm">'+fmt(x.mm,1)+'mm</div></div>').join('')||'<div>Hourly forecast unavailable</div>';
 el('days').innerHTML=d.time.slice(0,5).map((date,i)=>'<tr data-day="'+i+'" tabindex="0" role="button" aria-expanded="'+(i===selectedDay)+'" aria-controls="detail" aria-label="See '+labelDate(date)+' hourly details"><td><span class="symbol">'+icon(d.weather_code?.[i],true,dayProbability(d,h,i),d.precipitation_sum?.[i])+'</span>'+labelDate(date).split(',')[0]+'</td><td>'+fmt(d.temperature_2m_max?.[i])+'° / '+fmt(d.temperature_2m_min?.[i])+'°</td><td>'+probability(dayProbability(d,h,i))+' <span class="small">· '+fmt(d.precipitation_sum?.[i],1)+'mm</span></td><td>'+fmt(d.wind_gusts_10m_max?.[i])+'</td></tr>').join('');
 el('days').querySelectorAll('tr[data-day]').forEach(row=>{const click=()=>{const x=Number(row.dataset.day);selectedDay=x===selectedDay?-1:x;renderDetail(d,h,payloadData);el('days').querySelectorAll('tr[data-day]').forEach(y=>y.setAttribute('aria-expanded',y.dataset.day===String(selectedDay)?'true':'false'))};row.addEventListener('click',click);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})});
 renderDetail(d,h,payloadData);
 const fetched=new Date(payloadData.savedAt), stamp=athensClock.format(fetched);
 el('stamp').textContent=(stale?'Saved forecast · last fetched ':'Checked at ')+stamp+' Greek time · '+new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'numeric',month:'short'}).format(fetched);
 setStatus(stale?'Offline or service unavailable · showing saved forecast':'Forecast updated successfully',stale?'error':'');
 }
// Detail cards cover three hours in the forecast's Greek local time.
function isPastDetailPeriod(at,now=localISO()){
 return at.slice(0,10)===now.slice(0,10)&&Number(at.slice(11,13))+3<=Number(now.slice(11,13));
}
function updatePastDetailPeriods(){
 const now=localISO();
 el('detail').querySelectorAll('.detailcell[data-period]').forEach(cell=>cell.classList.toggle('past',isPastDetailPeriod(cell.dataset.period,now)));
}
function renderDetail(d,h,forecast){const box=el('detail');if(selectedDay<0||!d.time[selectedDay]){box.classList.add('hidden');box.innerHTML='';return}const now=localISO(),dt=d.time[selectedDay],matches=h.time.map((t,i)=>t.startsWith(dt)?i:-1).filter(i=>i>=0);let arr=[];
 for(let j=0;j<matches.length;j+=3){const ix=matches.slice(j,j+3),ps=ix.map(i=>hourValue(h,'precipitation_probability',i)).filter(Number.isFinite),gusts=ix.map(i=>hourValue(h,'wind_gusts_10m',i)).filter(Number.isFinite);let mm=sumValues(ix.map(i=>hourValue(h,'precipitation',i)));arr.push({t:h.time[ix[0]].slice(11,16),at:h.time[ix[0]],c:periodCode(h,ix),temp:h.temperature_2m?.[ix[0]],p:ps.length?Math.max(...ps):null,mm,g:gusts.length?Math.max(...gusts):null})}
 box.classList.remove('hidden');box.innerHTML='<div class="detailhead">'+labelDate(dt,'long')+' · three-hour periods</div><div class="detailnote">Tap the day again to close. Rain chance is the highest hourly chance within each block, and mm is the sum for that block.</div><div class="detailrows">'+arr.map(x=>'<div class="detailcell'+(isPastDetailPeriod(x.at,now)?' past':'')+'" data-period="'+x.at+'"><strong>'+x.t+'</strong>'+icon(x.c,isDayAt(x.at,d),x.p,x.mm)+' '+fmt(x.temp)+'°<br>'+probability(x.p)+' rain<br>'+fmt(x.mm,1)+' mm<br>gust '+fmt(x.g)+'</div>').join('')+'</div>'+modelComparison(forecast,dt)}
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
 return '<div class="modelcompare"><div class="detailhead">Rainfall · model comparison</div>'+rows.map(r=>'<div class="modelrow"><span class="modelname">'+r.name+'</span><span class="modelvalue">'+(r.mm===null?'Not available':fmt(r.mm,1)+' mm')+'</span></div>').join('')+'<div class="modelnote">'+interpretation+' '+valid.length+' of 3 model feeds available. <span class="model-methodology">These are deterministic forecasts, not ensemble probabilities; rainfall amounts do not represent rain chances.</span></div></div>';
}
const RADAR_API='https://api.rainviewer.com/public/weather-maps.json';
let radarFrames=[],radarIndex=-1,radarLastChecked=0,radarBusy=false;
function radarClock(sec){return new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sec*1000));}
function ensureRadarBaseMap(){
 const base=el('radarBasemap');
 if(base.dataset.ready==='1')return;
 // RainViewer 512px images are hi-DPI at z=7; displayed at 512 CSS px
 // they match the geographic scale of standard 256px OSM tiles at z=8.
 const zoom=8, size=256, world=size*Math.pow(2,zoom);
 const lat=LAT*Math.PI/180;
 const centerX=(LON+180)/360*world;
 const centerY=(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*world;
 const map=el('radarMap');
 const halfW=Math.min(256,Math.ceil(map.clientWidth/2)+1);
 const halfH=Math.min(256,Math.ceil(map.clientHeight/2)+1);
 const minX=Math.floor((centerX-halfW)/size), maxX=Math.floor((centerX+halfW-1)/size);
 const minY=Math.floor((centerY-halfH)/size), maxY=Math.floor((centerY+halfH-1)/size);
 const fragment=document.createDocumentFragment();
 const warning=el('radarBasemapWarning');let loaded=0,failed=0,requested=0;
 warning.classList.add('hidden');
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
  if(x<0||y<0||x>=Math.pow(2,zoom)||y>=Math.pow(2,zoom))continue;
  const tile=document.createElement('img');
  tile.alt='';tile.decoding='async';
  tile.referrerPolicy='strict-origin-when-cross-origin';
  tile.onload=()=>{loaded++;warning.classList.add('hidden');};
  tile.onerror=()=>{failed++;if(failed===requested&&loaded===0)warning.classList.remove('hidden');};
  requested++;
  tile.src='https://tile.openstreetmap.org/'+zoom+'/'+x+'/'+y+'.png';
  tile.style.left=(x*size-centerX+256)+'px';
  tile.style.top=(y*size-centerY+256)+'px';
  fragment.appendChild(tile);
 }
 base.appendChild(fragment);
 if(!requested)warning.classList.remove('hidden');
 base.dataset.ready='1';
}
function showRadarFrame(){
 const frame=radarFrames[radarIndex];if(!frame)return;
 const age=Math.round((Date.now()-frame.time*1000)/60000);
 el('radarPrev').disabled=radarIndex===0;
 el('radarNext').disabled=radarIndex===radarFrames.length-1;
 el('radarFrameTime').textContent=radarClock(frame.time)+' Greek time';
 el('radarStatus').textContent='Radar image about '+Math.max(0,age)+' minutes old · not a live observation at your property.';
 const img=el('radarImage');
 el('radarMap').classList.add('hidden');
 img.onload=()=>{el('radarMap').classList.remove('hidden');ensureRadarBaseMap();};
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
  const frames=(manifest.radar?.past||[]).filter(f=>Number.isInteger(f.time)&&new RegExp('^/v2/radar/[a-z0-9]+$','i').test(f.path)&&f.time*1000<Date.now()+300000).slice(-6);
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
 const next={data:a,icon:f[1].status==='fulfilled'?f[1].value:null,ecmwf:f[2].status==='fulfilled'?f[2].value:null,gfs:f[3].status==='fulfilled'?f[3].value:null,savedAt:new Date().toISOString()};render(next);payload=next;safeSave(payload);}
 catch(err){const cached=safeLoad()||payload;if(cached){try{payload=cached;render(payload,{stale:true})}catch(e){setStatus('Weather data unavailable','error')}}else{setStatus('Unable to connect to weather service','error');el('stamp').textContent='Could not retrieve live data';}el('error').textContent='Live forecast not available: '+(err.name==='AbortError'?'connection timed out':(err.message||'network error'))+'. '+(cached?'Displaying saved data, which may be outdated.':'Check connectivity and press refresh.');el('error').classList.remove('hidden');}
 finally{updating=false;btn.disabled=false;btn.textContent='↻'}}
 el('refresh').addEventListener('click',()=>{refresh();refreshRadar(true)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){updatePastDetailPeriods();if(!payload||Date.now()-Date.parse(payload.savedAt)>=REFRESH_MS)refresh()}});
 setInterval(()=>{if(document.hidden)return;updatePastDetailPeriods();if(payload)el('chance').textContent=probability(remainingDayProbability(payload.data.hourly));if(!payload||Date.now()-Date.parse(payload.savedAt)>=REFRESH_MS)refresh()},60*1000);
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
 refresh();
})();
