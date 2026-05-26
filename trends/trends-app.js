import { renderNav, hideLoadingScreen } from '../nav.jsx';
import Chart from 'chart.js/auto';

const ENDPOINT = "https://script.google.com/macros/s/AKfycbwB-RGI1lVHrUE03PkkSEYbLuiTLxE4phMBBOm81diNJtSPyUWGoB_bOlkgFIoVF4yzLQ/exec";
const REFRESH_SEC = 300;

// Read active agency from URL params — mirrors nav.jsx logic
const _trendAgency = (new URLSearchParams(window.location.search).get("agency") || "isl").toLowerCase();
const _trendAgencyNames = { isl: "Integrated Staffing", as: "Accountant Staffing", ads: "Administrative Staffing" };
const _trendAgencyName = _trendAgencyNames[_trendAgency] || "Integrated Staffing";

const TREND_QUARTERS = [
  { key: _trendAgency + "q1", label:"Q1", rangeLabel:"Sep–Nov 2025", start:new Date("2025-09-01"), end:new Date("2025-12-01"), localFallback:"./2026q1/2026-q1.json" },
  { key: _trendAgency + "q2", label:"Q2", rangeLabel:"Dec–Feb 2026", start:new Date("2025-12-01"), end:new Date("2026-03-01") },
  { key: _trendAgency + "q3", label:"Q3", rangeLabel:"Mar–May 2026", start:new Date("2026-03-01"), end:new Date("2026-06-01"), isCurrent:true },
];

const METRICS = [
  { id:"impressions", label:"Impressions",    needles:["post impressions","impressions"],                                         isPercent:false, isPace:true,  postsMultiplier:true  },
  { id:"reactions",   label:"Reactions",      needles:["reactions and likes","reactions & likes","reactions","likes"],            isPercent:false, isPace:true,  postsMultiplier:true  },
  { id:"linkclicks",  label:"Link Clicks",    needles:["post link clicks","link clicks","clicks"],                                isPercent:false, isPace:true,  postsMultiplier:true  },
  { id:"shares",      label:"Shares",         needles:["post shares","shares"],                                                   isPercent:false, isPace:true,  postsMultiplier:true  },
  { id:"comments",    label:"Comments",       needles:["comments and replies","comments & replies","comments","replies"],         isPercent:false, isPace:true,  postsMultiplier:true  },
  { id:"posts",       label:"Posts Published",needles:["posts"],                                                                  isPercent:false, isPace:true                         },
  { id:"followers",   label:"Followers",      needles:["followers total","followers (total)","followers"],                        isPercent:false, isPace:true,  baselineFromQ2:true   },
];

const $ = id => document.getElementById(id);
function nfk(s){ return String(s??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function toNumber(v){
  if(v===null||v===undefined) return null;
  if(typeof v==="number") return Number.isFinite(v)?v:null;
  const s=String(v).trim().replace(/,/g,"").replace(/\s+/g,"").replace(/%/g,"").replace(/[▲▼]/g,"").replace(/^\+/,"");
  if(!s||s==="—"||s==="-") return null;
  if(!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n=Number(s); return Number.isFinite(n)?n:null;
}
function fmt(v, isPercent){ const n=toNumber(v); if(n===null) return "—"; if(isPercent) return `${n.toFixed(2)}%`; return n>=1000?n.toLocaleString():String(Math.round(n)); }
function fmtApprox(n, isPercent){ if(n===null||!Number.isFinite(n)) return "—"; if(isPercent) return `${n.toFixed(2)}%`; return Math.round(n).toLocaleString(); }
function completion(q){ const now=new Date(); if(now>=q.end) return 1; if(now<q.start) return 0; return (now-q.start)/(q.end-q.start); }
function quarterComplete(q){ return new Date()>=q.end; }

function extractFromRows(rows, metric){
  if(!Array.isArray(rows)||!rows.length) return null;
  const map={};
  for(const r of rows){ const raw=r.field??r.Field??r.name??r.Name??""; const k=nfk(raw); if(k) map[k]=r.value??r.Value??null; }
  for(const n of metric.needles){ const k=nfk(n); if(map[k]!==undefined) return toNumber(map[k]); }
  const keys=Object.keys(map);
  for(const n of metric.needles){ const nl=nfk(n); const hit=keys.find(k=>k.includes(nl)); if(hit!==undefined) return toNumber(map[hit]); }
  return null;
}
function extractFromOverall(overall, metric){
  if(!overall||typeof overall!=="object"||Array.isArray(overall)) return null;
  const direct={impressions:"impressions",reactions:"reactions",linkclicks:"linkclicks",shares:"shares",comments:"comments",posts:"posts",followers:"followers"};
  const k=direct[metric.id]; if(k&&overall[k]!==undefined) return toNumber(overall[k]); return null;
}
function extractMetric(data, metric){
  if(!data) return null;
  if(data.quarterTotals){ const v=extractFromRows(data.quarterTotals,metric); if(v!==null) return v; }
  if(data.overall){ const v=extractFromOverall(data.overall,metric); if(v!==null) return v; }
  return null;
}

function computeAdvancedPace(current, qStart, qEnd, q2Rate, metricHistory, histBaseline=0){
  if(current===null||!Number.isFinite(current)) return null;
  const now=new Date(); const dElapsed=(now-qStart)/86400000; if(dElapsed<7) return null;
  const dTotal=(qEnd-qStart)/86400000; const dRemaining=dTotal-dElapsed;
  const simpleRate=current/dElapsed; const simpleProj=simpleRate*dTotal;
  let rollingRate=null, rollingProj=null;
  if(metricHistory.length>=2){
    const cutoff=now.getTime()-7*86400000; const windowStart=metricHistory.find(s=>s.t>=cutoff)||metricHistory[0]; const latest=metricHistory[metricHistory.length-1];
    const dt=(latest.t-windowStart.t)/86400000;
    if(dt>=1){ const vS=windowStart.val-histBaseline, vE=latest.val-histBaseline; if(Number.isFinite(vS)&&Number.isFinite(vE)&&vE>=vS){ rollingRate=(vE-vS)/dt; rollingProj=Math.max(current,current+rollingRate*dRemaining); } }
  }
  let regProj=null;
  if(metricHistory.length>=3){
    const pts=metricHistory.map(s=>({x:(s.t-qStart.getTime())/86400000,y:s.val-histBaseline})).filter(p=>p.x>=0&&Number.isFinite(p.y)&&p.y>=0);
    if(pts.length>=3){ const n=pts.length,sx=pts.reduce((a,p)=>a+p.x,0),sy=pts.reduce((a,p)=>a+p.y,0),sxy=pts.reduce((a,p)=>a+p.x*p.y,0),sx2=pts.reduce((a,p)=>a+p.x*p.x,0),den=n*sx2-sx*sx; if(den!==0){ const slope=(n*sxy-sx*sy)/den,intercept=(sy-slope*sx)/n,r=intercept+slope*dTotal; if(r>0) regProj=r; } }
  }
  let blended;
  if(regProj!==null&&rollingProj!==null) blended=0.20*simpleProj+0.40*rollingProj+0.40*regProj;
  else if(regProj!==null)                blended=0.40*simpleProj+0.60*regProj;
  else if(rollingProj!==null)            blended=0.35*simpleProj+0.65*rollingProj;
  else                                   blended=simpleProj;
  const confidence=Math.min(1,dElapsed/14);
  const projected=(q2Rate!==null&&Number.isFinite(q2Rate)&&q2Rate>0)?confidence*blended+(1-confidence)*(q2Rate*dTotal):blended;
  return {projected, dailyRate:rollingRate??simpleRate, dElapsed, dTotal};
}

function getMetricHistory(metricId){ return loadHistory().filter(s=>s.vals&&s.vals[metricId]!==undefined).map(s=>({t:s.t,val:s.vals[metricId]})); }
function applyPostsMultiplier(pace, m, q3v, postsQ3v, projectedPosts){
  if(!pace||!m.postsMultiplier||projectedPosts===null||!postsQ3v||postsQ3v<=0||q3v===null) return pace;
  const engPerPost=q3v/postsQ3v, postsMulProj=engPerPost*projectedPosts, blendedProj=0.70*pace.projected+0.30*postsMulProj;
  return{...pace,projected:blendedProj};
}

const HIST_KEY = _trendAgency + "q3_proj_history";
function storeSnapshot(d3){
  if(!d3) return; const snap={t:Date.now(),vals:{}};
  for(const m of METRICS){ if(!m.isPace) continue; const v=extractMetric(d3,m); if(v!==null) snap.vals[m.id]=v; }
  if(!Object.keys(snap.vals).length) return;
  try{ const raw=localStorage.getItem(HIST_KEY); const hist=raw?JSON.parse(raw):[]; hist.push(snap); localStorage.setItem(HIST_KEY,JSON.stringify(hist.slice(-500))); }catch(e){}
}
function loadHistory(){
  let hist=[]; try{ hist=JSON.parse(localStorage.getItem(HIST_KEY)||"[]"); }catch(e){ return []; }
  const byDay={}; for(const snap of hist){ byDay[new Date(snap.t).toDateString()]=snap; }
  return Object.values(byDay).sort((a,b)=>a.t-b.t);
}

async function fetchQ(q){
  try{
    const url=`${ENDPOINT}?report=${encodeURIComponent(q.key)}&nocache=1&t=${Date.now()}`;
    const res=await fetch(url,{cache:"no-store"}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json=await res.json(); if(json&&json.error) throw new Error(json.message||"Endpoint error"); return json;
  }catch(err){ if(q.localFallback){ try{ const r=await fetch(q.localFallback); if(r.ok) return await r.json(); }catch{} } return null; }
}

function renderProjCards(qdata, q3comp, q3done){
  const grid=$("projGrid"); if(!grid) return;
  const [d1,d2,d3]=qdata; const q3=TREND_QUARTERS[2]; const q2=TREND_QUARTERS[1]; const pct=(q3comp*100).toFixed(1);
  const postsM=METRICS.find(m=>m.id==="posts"); const postsQ3v=postsM?extractMetric(d3,postsM):null; const postsQ2v=postsM?extractMetric(d2,postsM):null;
  const postsQ2Rate=postsQ2v!==null?postsQ2v/((q2.end-q2.start)/86400000):null;
  const postsPace=postsM&&postsQ3v!==null&&!q3done?computeAdvancedPace(postsQ3v,q3.start,q3.end,postsQ2Rate,getMetricHistory("posts"),0):null;
  const projectedPosts=postsPace?postsPace.projected:null;
  grid.innerHTML=METRICS.map(m=>{
    const q1v=extractMetric(d1,m), q2v=extractMetric(d2,m), q3v=extractMetric(d3,m);
    const histBaseline=m.baselineFromQ2&&q2v!==null?q2v:0; const q3input=m.baselineFromQ2&&q2v!==null&&q3v!==null?q3v-q2v:q3v;
    const q2Rate=m.isPace?(m.baselineFromQ2&&q1v!==null&&q2v!==null?(q2v-q1v)/((q2.end-q2.start)/86400000):q2v!==null?q2v/((q2.end-q2.start)/86400000):null):null;
    let pace=m.isPace&&!q3done?computeAdvancedPace(q3input,q3.start,q3.end,q2Rate,getMetricHistory(m.id),histBaseline):null;
    pace=applyPostsMultiplier(pace,m,q3v,postsQ3v,projectedPosts);
    const projected=pace?pace.projected:null; const rateVsQ2=pace&&q2Rate?((pace.dailyRate-q2Rate)/q2Rate*100):null;
    const headlineVal=projected!==null&&m.baselineFromQ2&&q2v!==null?q2v+projected:projected;
    const headline=headlineVal!==null?fmtApprox(headlineVal,m.isPercent):fmt(q3v,m.isPercent);
    const headlineSub=headlineVal!==null?(q3done?(m.baselineFromQ2?"Q3 Projected Total":"Q3 Final"):(m.baselineFromQ2?"Projected Total · Q3":"Projected Final · Q3")):(m.baselineFromQ2?"Q3 Current Total":"Q3 Current");
    const dE=pace?Math.round(pace.dElapsed):0; const dT=pace?Math.round(pace.dTotal):92;
    const stat1Label=m.baselineFromQ2?"Q3 Net New":"Q3 to Date"; const stat1Val=m.baselineFromQ2&&q3v!==null&&q2v!==null?fmt(q3v-q2v,m.isPercent):fmt(q3v,m.isPercent);
    let stat2Val="—", stat2Cls=""; if(pace){ stat2Val=m.isPercent?`${pace.dailyRate.toFixed(3)}%/day`:`${pace.dailyRate.toFixed(1)}/day`; stat2Cls="rate"; }
    let stat3Val="—", stat3Cls="na"; if(rateVsQ2!==null){ const sign=rateVsQ2>=0?"▲ +":"▼ "; stat3Val=`${sign}${Math.abs(rateVsQ2).toFixed(1)}%`; stat3Cls=rateVsQ2>=0?"pos":"neg"; } else if(!m.isPace){ stat3Val="n/a"; }
    return `<div class="proj-card"><div class="proj-card-label">${m.label}</div><div class="proj-number">${headline}</div><div class="proj-number-sub">${headlineSub}</div><div class="proj-progress-wrap"><div class="proj-progress-track"><div class="proj-progress-fill" style="width:${Math.min(100,q3comp*100).toFixed(1)}%"></div></div><div class="proj-progress-labels"><span>Day ${dE} of ${dT}${q3done?" · complete":""}</span><span>${pct}%</span></div></div><div class="proj-stats-grid"><div class="proj-stat"><div class="proj-stat-label">${stat1Label}</div><div class="proj-stat-value">${stat1Val}</div></div><div class="proj-stat"><div class="proj-stat-label">Daily Rate</div><div class="proj-stat-value ${stat2Cls}">${stat2Val}</div></div><div class="proj-stat"><div class="proj-stat-label">Rate vs Q2</div><div class="proj-stat-value ${stat3Cls}">${stat3Val}</div></div><div class="proj-stat"><div class="proj-stat-label">Q2 Actual</div><div class="proj-stat-value">${fmt(q2v,m.isPercent)}</div></div></div></div>`;
  }).join("");
}

const charts={};
const C={q1:"rgba(100,116,139,.7)",q2:"rgba(0,61,114,.8)",q3:"rgba(0,84,154,.85)",proj:"rgba(180,130,0,.85)",area:"rgba(0,84,154,.07)"};

function buildCharts(qdata, q3comp, q3done){
  const grid=$("chartsGrid"); if(!grid) return;
  const [d1,d2,d3]=qdata; const q3=TREND_QUARTERS[2]; const q2=TREND_QUARTERS[1];
  const sub=q3done?"Quarter-over-quarter actuals":"Q1 & Q2 actuals · Q3 pace projection";
  grid.innerHTML=METRICS.map(m=>`<div class="chart-card"><div class="chart-card-title">${m.label}</div><div class="chart-card-sub">${sub}</div><div class="chart-wrap"><canvas id="chart-${m.id}"></canvas></div><div class="chart-legend" id="legend-${m.id}"></div></div>`).join("");
  const postsM=METRICS.find(m=>m.id==="posts"); const postsQ3v=postsM?extractMetric(d3,postsM):null; const postsQ2v=postsM?extractMetric(d2,postsM):null;
  const postsQ2Rate=postsQ2v!==null?postsQ2v/((q2.end-q2.start)/86400000):null;
  const postsPace=postsM&&postsQ3v!==null&&!q3done?computeAdvancedPace(postsQ3v,q3.start,q3.end,postsQ2Rate,getMetricHistory("posts"),0):null;
  const projectedPosts=postsPace?postsPace.projected:null;
  for(const m of METRICS){
    const q1v=extractMetric(d1,m), q2v=extractMetric(d2,m), q3v=extractMetric(d3,m);
    const chartQ3input=m.baselineFromQ2&&q2v!==null&&q3v!==null?q3v-q2v:q3v;
    const chartQ2Rate=q2v!==null?(m.baselineFromQ2&&q1v!==null?(q2v-q1v)/((q2.end-q2.start)/86400000):q2v/((q2.end-q2.start)/86400000)):null;
    let pace=m.isPace&&!q3done?computeAdvancedPace(chartQ3input,q3.start,q3.end,chartQ2Rate,getMetricHistory(m.id),m.baselineFromQ2&&q2v!==null?q2v:0):null;
    pace=applyPostsMultiplier(pace,m,q3v,postsQ3v,projectedPosts);
    const projected=pace?pace.projected:null; const chartQ3val=projected!==null?(m.baselineFromQ2&&q2v!==null?q2v+projected:projected):(q3v??0);
    const canvas=document.getElementById(`chart-${m.id}`); if(!canvas) continue;
    if(charts[m.id]) charts[m.id].destroy();
    const ctx=canvas.getContext("2d");
    const labels=["Q1 · Sep–Nov","Q2 · Dec–Feb",projected!==null?"Q3 · Projected":"Q3 · Mar–May"];
    const colors=[C.q1,C.q2,projected!==null?C.proj:C.q3];
    charts[m.id]=new Chart(ctx,{type:"bar",data:{labels,datasets:[{data:[q1v??0,q2v??0,chartQ3val],backgroundColor:colors,borderWidth:0,borderRadius:2,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:600,easing:"easeOutQuart"},plugins:{legend:{display:false},tooltip:{callbacks:{label(c){const v=c.parsed.y;return v===null?"":fmt(v,m.isPercent)+(c.label.includes("Projected")?" (projected)":"");}}}},scales:{x:{grid:{display:false},ticks:{font:{size:11,family:"Inter Tight, system-ui"},color:"#64748b"},border:{display:false}},y:{beginAtZero:true,grid:{color:"rgba(0,0,0,.04)"},border:{display:false,dash:[3,3]},ticks:{font:{size:11,family:"Inter Tight, system-ui"},color:"#64748b",padding:6,callback:v=>m.isPercent?`${v.toFixed(1)}%`:v>=1000?v.toLocaleString():v}}}}});
    const legendEl=document.getElementById(`legend-${m.id}`);
    if(legendEl) legendEl.innerHTML=[`<div class="legend-item"><div class="legend-dot" style="background:${C.q1}"></div>Q1 Actual</div>`,`<div class="legend-item"><div class="legend-dot" style="background:${C.q2}"></div>Q2 Actual</div>`,projected!==null?`<div class="legend-item"><div class="legend-dot" style="background:${C.proj}"></div>Q3 Projected</div>`:`<div class="legend-item"><div class="legend-dot" style="background:${C.q3}"></div>Q3 ${q3done?"Actual":"To Date"}</div>`].join("");
  }
}

function setLastUpdated(){
  const el=$("updatedAt");
  if(el) el.textContent="Updated "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
}

let isLoading=false;
async function loadAndRender(){
  if(isLoading) return; isLoading=true;
  try{
    const qdata=await Promise.all(TREND_QUARTERS.map(fetchQ)); const q3=TREND_QUARTERS[2], q3comp=completion(q3), q3done=quarterComplete(q3);
    const pct=(q3comp*100).toFixed(1);
    const pl=$("progressLabel"), pf=$("progressFill");
    if(pl) pl.textContent=`${pct}% elapsed${q3done?" · complete":""}`;
    if(pf) pf.style.width=`${Math.min(100,q3comp*100).toFixed(1)}%`;
    renderProjCards(qdata,q3comp,q3done); buildCharts(qdata,q3comp,q3done); storeSnapshot(qdata[2]); setLastUpdated(); hideLoadingScreen();
  }catch(err){ console.error("Trends load error:",err); }
  finally{ isLoading=false; }
}

// Module scripts are deferred — DOM is fully parsed when this runs.
renderNav("trends", null, null);

const _agencyNameEl = document.getElementById("trendsAgencyName");
if (_agencyNameEl) _agencyNameEl.textContent = _trendAgencyName;
document.title = `${_trendAgencyName} Trends`;

loadAndRender();
setInterval(loadAndRender, REFRESH_SEC * 1000);
