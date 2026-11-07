const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const A=require('../vendor/astronomy-2.1.19.min.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../moon.js'),'utf8');
function setup(iso,astronomy=A){
 let now=iso;const nodes=new Map(),events={};
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]},addEventListener(){}});return nodes.get(id)};
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}}
 vm.runInNewContext(source,{Date:Clock,Intl,window:{Astronomy:astronomy,addEventListener:(k,v)=>events[k]=v},document:{getElementById:node,addEventListener:(k,v)=>events[k]=v},setInterval(){}});
 return {node,at(iso){now=iso;events.visibilitychange()}};
}
test('solar times show the same Greek calendar day before sunrise and after sunset, offline',()=>{
 const s=setup('2026-11-07T22:30:00Z'); // 00:30 on November 8 in Greece.
 for(const name of ['sunrise','sunset'])assert.match(s.node(name+'Time').datetime,/^2026-11-08T/);
 const rise=s.node('sunriseTime').textContent,set=s.node('sunsetTime').textContent;
 s.at('2026-11-08T20:00:00Z');assert.equal(s.node('sunriseTime').textContent,rise);assert.equal(s.node('sunsetTime').textContent,set);
 s.at('2026-11-08T22:30:00Z');assert.match(s.node('sunriseTime').datetime,/^2026-11-09T/);
 assert.match(s.node('sunriseTime')['aria-label'],/Sunrise .* Greek time/);
});
test('sunrise and sunset clocks use the Athens DST offset on both changeover dates',()=>{
 for(const [iso,offset] of [['2026-03-29T00:30:00Z',3],['2026-10-25T00:30:00Z',2]]){
  const s=setup(iso);
  for(const name of ['sunrise','sunset']){
   const n=s.node(name+'Time'),d=new Date(n.datetime);
   const expected=String((d.getUTCHours()+offset)%24).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');
   assert.equal(n.textContent,expected);
  }
 }
});
test('missing astronomy shows unavailable times without leaving a previous datetime',()=>{
 const s=setup('2026-11-07T12:00:00Z',null);
 for(const name of ['sunrise','sunset']){assert.equal(s.node(name+'Time').textContent,'—:—');assert.equal(s.node(name+'Time').datetime,undefined)}
});
