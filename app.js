(() => {
'use strict';
const LAT=36.8878, LON=22.2316, ZONE='Europe/Athens', CACHE_KEY='mani-weather-live-v3';
const mainFields={current:'temperature_2m,weather_code,is_day,wind_speed_10m,wind_gusts_10m', hourly:'temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_gusts_10m', daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max'};
const el=id=>document.getElementById(id);
const fmt=(v,d=0)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
function icon(code, day=true){if(code==null)return '⛅';if(code<=1)return day?'☀️':'🌙';if(code<=3)return day?'⛅':'☁️';if(code<=48)return '☁️';if(code>=95)return '⛈️';if(code>=80&&code<=82)return '🌦️';if(code>=51&&code<=67)return '🌧️';if(code>=71&&code<=86)return '🌨️';return '☁️'}
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
 el('rain').textContent=fmt(d.precipitation_sum?.[dayIndex],1)+' mm';el('chance').textContent=fmt(d.precipitation_probability_max?.[dayIndex])+'%';el('maxgust').textContent=fmt(d.wind_gusts_10m_max?.[dayIndex])+' km/h';
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
 el('nextNote').textContent='Greek time · next 12 hours';
 const group=[];for(let j=0;j<hours.length;j+=2){const ids=hours.slice(j,j+2);if(!ids.length)continue;const last=ids[ids.length-1], first=ids[0];const accum=ids.reduce((s,i)=>s+(Number.isFinite(h.precipitation?.[i])?h.precipitation[i]:0),0);const per=ids.map(i=>h.precipitation_probability?.[i]).filter(Number.isFinite);const gp=per.length?Math.max(...per):null;
 group.push({time:h.time[first].slice(11,16),temp:h.temperature_2m?.[first],code:h.weather_code?.[first],mm:accum,prob:gp})}
 el('hours').innerHTML=group.map(x=>'<div class="hour"><time>'+x.time+'</time><span class="glyph">'+icon(x.code)+'</span><div class="htemp">'+fmt(x.temp)+'°</div><div class="hprob">'+fmt(x.prob)+'%</div><div class="hmm">'+fmt(x.mm,1)+'mm</div></div>').join('')||'<div>Hourly forecast unavailable</div>';
 el('days').innerHTML=d.time.slice(0,5).map((date,i)=>'<tr data-day="'+i+'" tabindex="0" role="button" aria-label="See '+labelDate(date)+' hourly details" aria-selected="'+(i===selectedDay)+'"><td><span class="symbol">'+icon(d.weather_code?.[i])+'</span>'+labelDate(date).split(',')[0]+'</td><td>'+fmt(d.temperature_2m_max?.[i])+'° / '+fmt(d.temperature_2m_min?.[i])+'°</td><td>'+fmt(d.precipitation_probability_max?.[i])+'% <span class="small">· '+fmt(d.precipitation_sum?.[i],1)+'mm</span></td><td>'+fmt(d.wind_gusts_10m_max?.[i])+'</td></tr>').join('');
 el('days').querySelectorAll('tr[data-day]').forEach(row=>{const click=()=>{const x=Number(row.dataset.day);selectedDay=x===selectedDay?-1:x;renderDetail(d,h);el('days').querySelectorAll('tr[data-day]').forEach(y=>y.setAttribute('aria-selected',y.dataset.day===String(selectedDay)?'true':'false'))};row.addEventListener('click',click);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})});
 renderDetail(d,h);renderModels(payloadData);
 const fetched=new Date(payloadData.savedAt), stamp=athensClock.format(fetched);
 el('stamp').textContent=(stale?'Saved forecast · last fetched ':'Checked at ')+stamp+' Greek time · '+new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'numeric',month:'short'}).format(fetched);
 setStatus(stale?'Offline or service unavailable · showing saved forecast':'Forecast downloaded successfully',stale?'error':'');
 }
function renderDetail(d,h){const box=el('detail');if(selectedDay<0||!d.time[selectedDay]){box.classList.add('hidden');box.innerHTML='';return}const dt=d.time[selectedDay],matches=h.time.map((t,i)=>t.startsWith(dt)?i:-1).filter(i=>i>=0);let arr=[];
 for(let j=0;j<matches.length;j+=3){const ix=matches.slice(j,j+3),ps=ix.map(i=>h.precipitation_probability?.[i]).filter(Number.isFinite),gusts=ix.map(i=>h.wind_gusts_10m?.[i]).filter(Number.isFinite);let mm=ix.reduce((a,i)=>a+(Number.isFinite(h.precipitation?.[i])?h.precipitation[i]:0),0);arr.push({t:h.time[ix[0]].slice(11,16),c:h.weather_code?.[ix[0]],temp:h.temperature_2m?.[ix[0]],p:ps.length?Math.max(...ps):null,mm,g:gusts.length?Math.max(...gusts):null})}
 box.classList.remove('hidden');box.innerHTML='<div class="detailhead">'+labelDate(dt,'long')+' · three-hour periods</div><div class="detailnote">Tap the day again to close. Rain chance is the highest hourly chance within each block, and mm is the sum for that block.</div><div class="detailrows">'+arr.map(x=>'<div class="detailcell"><strong>'+x.t+'</strong>'+icon(x.c)+' '+fmt(x.temp)+'°<br>'+fmt(x.p)+'% rain<br>'+fmt(x.mm,1)+' mm<br>gust '+fmt(x.g)+'</div>').join('')+'</div>'}
function renderModels(x){const b=x.icon, c=x.ecmwf, box=el('models');let result='';const date=x.data.daily.time?.[1]||'';for(const [name,r] of [['ICON-EU',b],['ECMWF IFS',c]]){const value=r?.daily?.precipitation_sum?.[r.daily.time?.indexOf(date)];result+='<div class="modelrow"><span class="modelname">'+name+' · tomorrow</span><span class="modelvalue">'+fmt(value,1)+' mm</span></div>'}const x1=b?.daily?.precipitation_sum?.[b.daily.time?.indexOf(date)],x2=c?.daily?.precipitation_sum?.[c.daily.time?.indexOf(date)],good=Number.isFinite(x1)&&Number.isFinite(x2);
 result+='<div class="modelnote">'+(good?(Math.abs(x1-x2)>=5?'Models differ by '+fmt(Math.abs(x1-x2),1)+' mm. Treat tomorrow’s rainfall amount with caution.':'These two models give broadly similar rainfall totals for tomorrow.'):'One or both model feeds are unavailable. No comparison is inferred.')+' These are deterministic forecasts, not ensemble probabilities.</div>';box.innerHTML=result}
async function refresh(){if(updating)return;updating=true;const btn=el('refresh');btn.disabled=true;btn.innerHTML='<span class="spin">↻</span>';el('error').classList.add('hidden');setStatus('Checking current forecast…','busy');
 try{const f=await Promise.allSettled([request(buildUrl('best_match',mainFields)),request(buildUrl('icon_eu',{daily:'precipitation_sum'})),request(buildUrl('ecmwf_ifs025',{daily:'precipitation_sum'}))]);if(f[0].status!=='fulfilled')throw f[0].reason||Error('Forecast service unavailable');const a=f[0].value;if(!a.daily?.time||!a.hourly?.time)throw Error('Incomplete forecast data');
 payload={data:a,icon:f[1].status==='fulfilled'?f[1].value:null,ecmwf:f[2].status==='fulfilled'?f[2].value:null,savedAt:new Date().toISOString()};safeSave(payload);render(payload);}
 catch(err){const cached=safeLoad();if(cached){try{payload=cached;render(payload,{stale:true})}catch(e){setStatus('Weather data unavailable','error')}}else{setStatus('Unable to connect to weather service','error');el('stamp').textContent='Could not retrieve live data';}el('error').textContent='Live forecast not available: '+(err.name==='AbortError'?'connection timed out':(err.message||'network error'))+'. '+(cached?'Displaying saved data, which may be outdated.':'Check connectivity and press refresh.');el('error').classList.remove('hidden');}
 finally{updating=false;btn.disabled=false;btn.textContent='↻'}}
 el('refresh').addEventListener('click',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&payload&&Date.now()-Date.parse(payload.savedAt)>20*60*1000)refresh()});
 setInterval(()=>{if(!document.hidden&&(!payload||Date.now()-Date.parse(payload.savedAt)>30*60*1000))refresh()},5*60*1000);
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
 refresh();
})();