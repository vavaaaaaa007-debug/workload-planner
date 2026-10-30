(function () {
'use strict';
const TASKS = [
 {id:'omni_short',name:'Flow-omini',sub:'一分钟以内',quota:50,icon:'O',tone:''},
 {id:'omni_long',name:'Flow-omini',sub:'一分钟以上',quota:25,icon:'O',tone:''},
 {id:'batch_short',name:'Flow-批量',sub:'一分钟以内',quota:80,icon:'B',tone:'purple'},
 {id:'batch_long',name:'Flow-批量',sub:'一分钟以上',quota:50,icon:'B',tone:'purple'},
 {id:'splice',name:'拼接视频',sub:'按完成数量录入',quota:80,icon:'拼',tone:'green'},
 {id:'edit',name:'自媒体剪辑',sub:'按完成数量录入',quota:50,icon:'剪',tone:'green'},
 {id:'sentence',name:'逐字出句',sub:'按完成数量录入',quota:140,icon:'字',tone:'purple'},
 {id:'intro',name:'开场口播',sub:'原式 ÷2÷80，等价 ÷160',quota:160,icon:'口',tone:'green'}
];
const FLOW_TIERS = {batch_short:{high:2400,medium:1800,low:1200},omni_short:{high:1500,medium:1200,low:900},batch_long:{high:750,medium:360,low:150},omni_long:{high:300,medium:240,low:150}};
const DERIVED_RATIO={medium:0.7075,low:0.45};
const round10=x=>Math.round(x/10)*10;
function derivedTiers(days){const o={};for(const t of TASKS){if(FLOW_TIERS[t.id])continue;const high=t.quota*days;o[t.id]={high,medium:round10(high*DERIVED_RATIO.medium),low:round10(high*DERIVED_RATIO.low)};}return o;}
const FLOW_DAILY_TIERS = {batch_short:{high:80,medium:60,low:40},omni_short:{high:50,medium:40,low:30},batch_long:{high:25,medium:12,low:5},omni_long:{high:15,medium:8,low:5}};
const STORE_KEY = 'workload-planner-v1';
const MONTH_BASIS = 'workload';
const math = window.WorkloadMath;
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (n, digits=4) => Number.isFinite(n) ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:digits}).format(n) : '—';
const pct = (r) => !Number.isFinite(r) ? '—' : (r>0 && r<0.0001 ? '<0.01%' : r<1 && r>0.9999 ? '>99.99%' : num(r*100,2)+'%');
const text = (id,value) => { const el=$(id); if(el)el.textContent=value; };
const escapeHTML = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const taskName = (t) => t.name + (t.id.startsWith('omni_') || t.id.startsWith('batch_') ? ' · '+t.sub : '');
const isObject = (x) => x!==null && typeof x==='object' && !Array.isArray(x);
const positive = (x) => String(x).trim()!=='' && Number.isFinite(Number(x)) && Number(x)>0;
const quantityOK = (x) => x==='' || (Number.isSafeInteger(Number(x)) && Number(x)>=0);
const dateOK = (s) => {
 if(typeof s!=='string'||!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(s)||Number(s.slice(0,4))<1)return false;
 const [y,m,d]=s.split('-').map(Number);const leap=y%4===0&&(y%100!==0||y%400===0);
 return d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
};
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function defaultMonth(key=math.getCycleKey(today())){return {dailyQuotas:Object.fromEntries(TASKS.map(t=>[t.id,String(t.quota)])),target:'',plannedDays:String(math.getCycleRange(key).dates.length),remainingDays:'',remainingMode:'auto',daysOff:{},targetLinked:false,defaultDailyTarget:'100',basis:MONTH_BASIS,thresholds:Object.fromEntries(TASKS.map(t=>[t.id,FLOW_TIERS[t.id]?clone(FLOW_TIERS[t.id]):derivedTiers(30)[t.id]]))};}
function freshState(){return {version:3,dailyTargets:{},activeDate:today(),followToday:true,closedDates:{},hiddenTasks:{},derivedTiersV1:true,tab:'day',months:{},records:{}};}
let state=freshState(),realState=null,demo=false,showAllNeeds=false,pendingImport=null,toastTimer=null,storageOK=true;
try { const stored=window.NativeWorkload ? window.NativeWorkload.initialState : localStorage.getItem(STORE_KEY); if(stored)state=cleanState(typeof stored==='string'?JSON.parse(stored):stored); } catch(e){storageOK=false;}
if(state.followToday)state.activeDate=today();
let lastPersistableState=JSON.stringify(state);
function month(){return math.getCycleKey(state.activeDate);}function cycleLabel(key){const p=String(key).split('-'),y=Number(p[0]),m=Number(p[1]);return m===12?String(y+1).padStart(4,'0')+'-01':String(y).padStart(4,'0')+'-'+String(m+1).padStart(2,'0');}function cycleKeyFromLabel(label){const p=String(label).split('-'),y=Number(p[0]),m=Number(p[1]);return m===1?String(y-1).padStart(4,'0')+'-12':String(y).padStart(4,'0')+'-'+String(m-1).padStart(2,'0');}
function range(){return math.getCycleRange(month());}
function actualRecords(){return Object.fromEntries(Object.entries(state.records).filter(([date])=>date<=today()));}
function remainingUnfilled(){return config().remainingMode==='manual'&&config().remainingDays==='';}
function remainingCount(){const c=config();if(c.remainingMode==='manual')return c.remainingDays===''?0:Number(c.remainingDays);return range().dates.filter(d=>d>=today()&&!c.daysOff[d]&&!(d===today()&&state.closedDates[d])).length;}
function rangeLabel(){const r=range();return r.start.replaceAll('-','/')+' — '+r.end.replaceAll('-','/');}
function config(){const key=month();if(!state.months[key]){const base=defaultMonth(key),previous=Object.keys(state.months).filter(k=>k<key).sort().reverse()[0];if(previous){const prior=state.months[previous];base.dailyQuotas=clone(prior.dailyQuotas);base.thresholds=clone(prior.thresholds);base.targetLinked=prior.targetLinked;base.defaultDailyTarget=prior.defaultDailyTarget||'100';base.target=prior.targetLinked?String(Number(base.plannedDays)*Number(base.defaultDailyTarget)/100):prior.target;}state.months[key]=base;}return state.months[key];}
function categories(){return TASKS.map(t=>({id:t.id,name:taskName(t),quota:t.quota}));}
function dailyGoal(date=state.activeDate){return state.dailyTargets[date]??config().defaultDailyTarget??'100';}
function dailyGoalAnalysis(){return math.analyze(categories(),dailyQuantities(),positive(dailyGoal())?Number(dailyGoal())/100:NaN);}
function elapsedDays(){return range().dates.filter(d=>d<=today()&&!config().daysOff[d]).length;}
function dailyQuantities(){return state.activeDate>today()?{}:state.records[state.activeDate]||{};}
function save(){
 if(demo){text('save-status','示例模式：不会覆盖自己的记录');return;}
 try {cleanState(state);lastPersistableState=JSON.stringify(state);if(window.NativeWorkload){window.webkit.messageHandlers.native.postMessage({action:'saveState',payload:JSON.stringify(state)});text('save-status','正在保存到本机…');}else{localStorage.setItem(STORE_KEY,JSON.stringify(state));text('save-status','已自动保存 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' · 可导出备份');}storageOK=true;}
 catch(e){storageOK=false;text('save-status','输入无效，本次修改未保存；请修正后继续。');}
}
function toast(message){clearTimeout(toastTimer);text('toast',message);$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},3300);}
function cleanState(data){
 if(!isObject(data)||![1,2,3].includes(data.version)||!isObject(data.months)||!isObject(data.records))throw Error('这不是有效的工作量助手备份。');
 if(Object.keys(data.months).length>2400||Object.keys(data.records).length>80000)throw Error('备份中的记录过多。');
 const clean=freshState();clean.activeDate=dateOK(data.activeDate)?data.activeDate:today();clean.tab=['day','month','calendar','effect','help'].includes(data.tab)?data.tab:'day';clean.followToday=data.followToday!==false;clean.dailyTargets={};if(isObject(data.dailyTargets))for(const[d,v]of Object.entries(data.dailyTargets)){if(!dateOK(d)||!(v===''||positive(v)))throw Error('当天总目标须填写正数。');clean.dailyTargets[d]=String(v);}clean.hiddenTasks=isObject(data.hiddenTasks)?Object.fromEntries(Object.entries(data.hiddenTasks).filter(([id,v])=>TASKS.some(t=>t.id===id)&&v===true)):{};clean.closedDates=isObject(data.closedDates)?Object.fromEntries(Object.entries(data.closedDates).filter(([d,v])=>dateOK(d)&&v===true)):{};
 for(const [key,value] of Object.entries(data.months)){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)||Number(key.slice(0,4))<1||!isObject(value)||!isObject(value.dailyQuotas))throw Error('备份中的月份设置不完整。');
  const c=defaultMonth(key);for(const t of TASKS){const v=value.dailyQuotas[t.id];if(!positive(v))throw Error(key+'的折算参数无效。');c.dailyQuotas[t.id]=String(v);}
  if(value.target!==''&&!positive(value.target))throw Error(key+'的月总目标无效。');
  if(value.remainingDays!==''&&(!Number.isFinite(Number(value.remainingDays))||Number(value.remainingDays)<0))throw Error(key+'的剩余工作天数无效。');
  c.target=String(value.target??'');c.remainingDays=String(value.remainingDays??'');c.basis='workload';c.plannedDays=String(value.plannedDays??c.plannedDays);c.remainingMode=value.remainingMode==='manual'?'manual':'auto';c.targetLinked=value.targetLinked===true;c.defaultDailyTarget=positive(value.defaultDailyTarget)?String(value.defaultDailyTarget):'100';c.daysOff=isObject(value.daysOff)?Object.fromEntries(Object.entries(value.daysOff).filter(([d,v])=>dateOK(d)&&math.getCycleKey(d)===key&&v===true)):{};if(!positive(c.plannedDays))throw Error(cycleLabel(key)+'的计划工作天数无效。');if(isObject(value.thresholds)){for(const t of TASKS){if(!isObject(value.thresholds[t.id]))continue;for(const tier of ['high','medium','low']){const v=value.thresholds[t.id][tier]??'';if(v!==''&&!positive(v))throw Error(key+'的等级月标准无效。');c.thresholds[t.id][tier]=String(v);}}}if(data.derivedTiersV1!==true)for(const t of TASKS){if(FLOW_TIERS[t.id])continue;const th=c.thresholds[t.id];if(!positive(th.high)&&!positive(th.medium)&&!positive(th.low))c.thresholds[t.id]=clone(derivedTiers(30)[t.id]);}clean.months[key]=c;
 }
 for(const [date,record] of Object.entries(data.records)){
  if(!dateOK(date)||!isObject(record))throw Error('备份包含无效的日期或数量记录。');
  const q={};for(const t of TASKS){const v=record[t.id]??'';if(!quantityOK(v))throw Error(date+'的完成数量无效。');q[t.id]=v===''?'':String(Number(v));}
  clean.records[date]=q;
  const k=math.getCycleKey(date);if(!clean.months[k])clean.months[k]=defaultMonth(k);
 }
 return clean;
}
function renderRows(){
 const c=config(),q=dailyQuantities();
 const label=t=>'<div class="task-label"><span class="task-icon '+t.tone+'" aria-hidden="true">'+t.icon+'</span><div><div class="task-name">'+t.name+'</div><div class="task-sub">'+t.sub+'</div></div></div>';
 $('day-rows').innerHTML=TASKS.filter(t=>!state.hiddenTasks[t.id]).map(t=>'<tr><td>'+label(t)+'</td><td data-label="已完成数量"><input type="number" min="0" step="1" inputmode="numeric" data-kind="quantity" data-id="'+t.id+'" value="'+escapeHTML(q[t.id]??'')+'" placeholder="0" aria-label="'+escapeHTML(taskName(t))+'已完成数量"></td><td data-label="折算工作量"><div class="row-result" id="day-result-'+t.id+'">0</div><div class="row-detail" id="day-detail-'+t.id+'">份工作量</div></td></tr>').join('');
 updateFilterLabel();
 $('month-rows').innerHTML=TASKS.filter(t=>!state.hiddenTasks[t.id]).map(t=>'<tr><td>'+label(t)+'</td><td data-label="本期累计"><div class="row-result" id="month-qty-'+t.id+'">0</div></td><td data-label="独做该类的月目标"><div class="row-result" id="month-target-'+t.id+'">—</div></td><td data-label="月目标占比"><div class="row-result" id="month-result-'+t.id+'">—</div><div class="row-detail" id="month-detail-'+t.id+'"></div></td></tr>').join('');
 $('effect-rows').innerHTML=TASKS.map(t=>'<tr><td><div class="task-name">'+escapeHTML(taskName(t))+'</div></td>'+['high','medium','low'].map((tier,i)=>'<td data-label="'+['优 ≥','良 ≥','中 ≥'][i]+'"><input type="number" min="0.000001" step="any" inputmode="decimal" data-kind="effect" data-id="'+t.id+'" data-tier="'+tier+'" value="'+escapeHTML(c.thresholds[t.id][tier])+'" placeholder="待填写" aria-label="'+escapeHTML(taskName(t))+' '+['优','良','中'][i]+'月标准"></td>').join('')+'</tr>').join('');
 $('daily-total-target').value=dailyGoal();
 $('rules-content').innerHTML=TASKS.map(t=>'<div class="rules-row"><span>'+escapeHTML(taskName(t))+'</span><strong>'+(t.id==='intro'?'数量 ÷ 2 ÷ 80':'数量 ÷ '+t.quota)+'</strong></div>').join('');
}

function renderAll(){
 const c=config();
 $('effect-card').hidden=state.tab!=='effect';$('planned-days').value=c.plannedDays;
 $('record-date').value=state.activeDate;$('month-select').value=cycleLabel(month());$('target-days').value=c.target;$('remaining-days').value=c.remainingMode==='auto'?remainingCount():c.remainingDays;$('remaining-days').readOnly=c.remainingMode==='auto';$('auto-remaining').checked=c.remainingMode==='auto';$('today-open').checked=!state.closedDates[today()];$('follow-today').checked=state.followToday;$('plan-grade').hidden=!monthView();
 text('today-visible',today().replaceAll('-','/'));text('cycle-visible',rangeLabel());
 
 $('target-days').placeholder=c.basis==='count'?'例如 900':'例如 22';
 $('demo-banner').hidden=!demo;$('demo-button').textContent=demo?'示例模式':'查看示例';
 for(const key of TAB_KEYS){$('tab-'+key).setAttribute('aria-selected',String(state.tab===key));$('tab-'+key).tabIndex=state.tab===key?0:-1;}
 $('calendar-card').hidden=state.tab!=='calendar';$('help-panel').hidden=state.tab!=='help';$('process-details').hidden=state.tab==='calendar'||state.tab==='help';document.querySelector('.side-column').hidden=state.tab==='help';document.querySelector('.layout').classList.toggle('single',state.tab==='help');document.querySelector('.period-banner').hidden=state.tab==='help';$('history-card').hidden=monthView()||state.tab==='help';$('calendar-cycle').value=cycleLabel(month());
 $('day-panel').hidden=state.tab!=='day';$('month-panel').hidden=state.tab!=='month';
 text('page-title',{calendar:'周期日历',day:'每日工作量',month:'本期计划',effect:'本月效果评价',help:'使用说明'}[state.tab]);
 text('page-subtitle',{calendar:'查看每日完成量与工作安排。',day:'填写完成数量，自动折算汇总。',month:'查看目标差距、累计工作量和每日补量。',effect:'查看本月评级，设置优／良／中月标准。',help:'软件的用法与计算规则。'}[state.tab]);
 renderRows();document.querySelectorAll('[data-kind="quantity"]').forEach(el=>el.disabled=state.activeDate>today());text('daily-record-hint',state.activeDate>today()?'未来日期仅用于安排工作；实际产量请在当天录入。':state.activeDate===today()?'今天的记录会保留在今天；换日后自动显示新一天。':'正在查看 '+state.activeDate+' 的记录，可修改并重新计算。');updateResults();
 if(!storageOK)text('save-status','未能自动保存到本机，请使用“导出备份”保存记录');
 if(demo)text('save-status','示例模式：不会覆盖自己的记录');
}
function monthAnalysis(){
 const c=config();const cats=c.basis==='count'?categories().map(t=>({...t,quota:1})):categories();
 return math.calculateCycle(cats,actualRecords(),month(),c.target,remainingCount());
}
function getTotals(){
 const totals=Object.fromEntries(TASKS.map(t=>[t.id,0]));
 for(const [date,record] of Object.entries(state.records))if(date>=range().start&&date<=range().end&&date<=today())for(const t of TASKS){const v=Number(record[t.id]||0);totals[t.id]+=Number.isFinite(v)?v:0;}
 return totals;
}
function updateResults(){
 const cats=categories(),day=math.analyze(cats,dailyQuantities(),1),monthly=monthAnalysis(),c=config();
 const cycleWork=math.calculateCycle(cats,actualRecords(),month(),1,remainingCount());
 const formulaPeriod=cycleWork.valid&&elapsedDays()>0?math.analyze(cats,cycleWork.quantities,elapsedDays()):{valid:false,errors:cycleWork.errors||[]};
 const active=monthView()?formulaPeriod:day,goal=monthView()?monthly:dailyGoalAnalysis(),totals=getTotals();
 document.querySelectorAll('[data-kind="quantity"]').forEach(el=>el.setAttribute('aria-invalid',String(!quantityOK(el.value))));
 document.querySelectorAll('[data-kind="quota"]').forEach(el=>el.setAttribute('aria-invalid',String(!positive(el.value))));
 $('target-days').setAttribute('aria-invalid',String(!positive(c.target)));
 $('remaining-days').setAttribute('aria-invalid',String(c.remainingDays!==''&&(!Number.isFinite(remainingCount())||remainingCount()<0)));
 let errors=monthView()?(cycleWork.valid?[]:cycleWork.errors):(day.valid?[]:day.errors);
 if(monthView()&&c.target!==''&&!positive(c.target))errors.push('本期总目标须填写正数。');
 if(state.tab==='day'&&dailyGoal()!==''&&!positive(dailyGoal()))errors.push('当天总目标须填写正数。');
 $('daily-total-target').setAttribute('aria-invalid',String(dailyGoal()!==''&&!positive(dailyGoal())));
 if(state.tab==='help')errors=[];$('global-errors').hidden=errors.length===0;text('global-errors',errors.join(' '));
 for(const t of TASKS){
  const row=day.rows.find(x=>x.id===t.id);text('day-result-'+t.id,day.valid?num(row.workload):'—');text('day-detail-'+t.id,day.valid?'份工作量':'请检查完成数量');
  text('month-qty-'+t.id,num(totals[t.id],0));
  const full=positive(c.target)&&positive(c.dailyQuotas[t.id])?Number(c.target)*t.quota:null;
  text('month-target-'+t.id,full===null?'—':num(full,4));
  const mr=monthly.rows.find(x=>x.id===t.id);text('month-result-'+t.id,monthly.valid?pct(mr.ratio):'—');
  
 }
 updateMonthlyStats(monthly,c,cycleWork);
 text('summary-title',monthView()?'平均日完成率':'日完成率');text('summary-period',monthView()?cycleLabel(month()):state.activeDate.slice(5).replace('-',' / '));
 const ringRate=active.valid?active.completion:NaN,ringOK=Number.isFinite(ringRate);
 text('completion-rate',ringOK?pct(ringRate):'—');
 $('progress-ring').style.setProperty('--progress',ringOK?Math.max(0,Math.min(100,ringRate*100))+'%':'0%');
 $('progress-ring').setAttribute('aria-valuenow',String(ringOK?Math.max(0,Math.min(100,ringRate*100)):0));
 $('progress-ring').setAttribute('aria-valuetext',ringOK?'实际完成率'+pct(ringRate):'请填写有效数据');
 text('ring-caption',monthView()?'折算结果 ÷ '+elapsedDays()+'个统计工作日':'折算结果 ÷ 1天');
 
 text('summary-message',monthView()?(active.valid?'本期平均每日完成 '+pct(active.completion):'暂无实际统计工作日'):(day.valid&&goal.valid?'公式完成 '+pct(day.completion)+' · 当天目标 '+num(Number(dailyGoal()))+(goal.remainingWorkload===0?'，已达到目标':'，还差 '+num(goal.remainingWorkload*100,2)+'个百分点'):(day.valid?'日完成率 '+pct(day.completion)+' · 个人目标未设置':'请检查完成数量')));
 text('metric-done-label',monthView()?'本期累计工作量':'已完成工作量');
 $('metric-done').innerHTML=active.valid?escapeHTML(num(active.totalWorkload))+'<small>份</small>':'—';
 $('metric-left').innerHTML=goal.valid?escapeHTML(num(monthView()?goal.remainingWorkload/goal.targetDays*100:goal.remainingWorkload*100,2))+'<small>'+(monthView()?'%':'个百分点')+'</small>':'—';
 text('mini-month-rate',monthly.valid?pct(monthly.completion):'待设置');
 $('mini-month-bar').style.width=monthly.valid?Math.max(0,Math.min(100,monthly.completion*100))+'%':'0%';
 text('mini-month-desc',monthly.valid?'本月总目标 '+num(Number(c.target))+(c.basis==='count'?'个':'份工作量')+' · 还差 '+num(monthly.remainingWorkload)+(c.basis==='count'?'个':'份工作量'):'先在“本月计划”填写一个月总目标');
 renderNeeds(day,monthly);updateMix(day,monthly);renderProcess(day,monthly);renderHistory(cats);renderEffect();renderCalendar();if(config().remainingMode==='auto')$('remaining-days').value=remainingCount();
}
function updateMonthlyStats(result,c,cycleWork){
 const countMode=c.basis==='count';
 text('month-stat1-label',countMode?'本月累计数量':'累计折算工作量');
 text('month-stat1',cycleWork.valid?num(cycleWork.totalWorkload):'—');text('month-stat1-unit',countMode?'个':'份工作量');
 text('month-stat2',result.valid?num(result.remainingWorkload):'—');text('month-stat2-unit',countMode?'个':'份工作量');
 if(!result.valid){text('month-stat3','—');text('month-stat3-unit','先填写本月总目标');}
 else if(remainingUnfilled()){text('month-stat3','待填写');text('month-stat3-unit','填写剩余工作天数后计算');}
 else if(remainingCount()===0){text('month-stat3',result.remainingWorkload===0?'已完成':'尚有缺口');text('month-stat3-unit','剩余工作日为0，不分摊');}
 else{text('month-stat3',countMode?num(result.dailyRequiredWorkload):pct(result.dailyRequiredWorkload));text('month-stat3-unit',countMode?'个 / 天':'标准满额 / 天');}
}
function renderNeeds(day,monthly){
 const c=config(),inMonth=monthView(),result=inMonth?gradeResult():dailyGoalAnalysis();
 text('plan-title',inMonth?'每日补量':'当天补量');text('plan-badge',inMonth?'每天任选一种':'任选一种');
 text('plan-intro',inMonth?'每天任选一种；按剩余工作日平均分摊，向上取整。':'任选一种即可，不需要每项都做。');
 let message='';
 if(!result.valid)message=inMonth?'先补充有产出任务的三档月标准，再计算评级补量。':'请先检查完成数量与当天总目标。';
 else if(inMonth&&remainingUnfilled())message='填写“剩余可工作天数”，即可看到每天的建议数量。';
 else if(inMonth&&remainingCount()===0)message=result.remainingWorkload===0?'本月目标已完成，无需补量。':'本月仍有缺口，但剩余工作日为0。请调整目标或可工作天数。';
 else if(result.remainingWorkload===0)message='已达到目标，无需补量。';
 if(message){$('needs-list').innerHTML='<div class="empty-state">'+escapeHTML(message)+'</div>';$('needs-toggle').hidden=true;return;}
 const needs=inMonth?result.dailySingleTaskNeeds:result.singleTaskNeeds;
 const order=['omni_short','splice','batch_short','omni_long','batch_long','edit','sentence','intro'].filter(id=>needs[id]!==null&&needs[id]!==undefined);
 const selected=showAllNeeds?order:order.slice(0,3);
 $('needs-list').innerHTML=selected.map(id=>{const t=TASKS.find(x=>x.id===id);return '<div class="need-row"><span>'+escapeHTML(taskName(t))+'</span><strong><b>'+num(needs[id],0)+'</b>个'+(inMonth?'/天':'')+'</strong></div>';}).join('');
 $('needs-toggle').hidden=order.length<=3;text('needs-toggle',showAllNeeds?'收起部分任务 ↑':'展开全部可用任务 ↓');
}
function updateMix(day,monthly){
 const c=config(),inMonth=monthView(),active=inMonth?gradeResult():day,q1=$('mix-qty1').value,q2=$('mix-qty2').value;
 if(!active.valid){text('mix-result','填写完成数量、个人目标及月标准后试算。');return;}
 if(!quantityOK(q1)||!quantityOK(q2)){text('mix-result','计划数量请填写0或正整数。');return;}
 if(inMonth&&(remainingUnfilled()||remainingCount()<=0)){text('mix-result','没有剩余工作日，暂不能分摊每天的安排。');return;}
 const plan={};plan[$('mix-task1').value]=Number(q1||0);plan[$('mix-task2').value]=(plan[$('mix-task2').value]||0)+Number(q2||0);
 let projected;
 if(inMonth){
  const tier=$('plan-grade').value;
  if(Object.entries(plan).some(([id,q])=>q>0&&!positive(c.thresholds[id][tier]))){text('mix-result','先填写所选任务对应的月度评级标准。');return;}
  const delta=Object.entries(plan).reduce((sum,[id,q])=>sum+(q===0?0:q/Number(c.thresholds[id][tier])),0);
  projected=active.completion+delta*remainingCount();
 }else{
  const merged={...dailyQuantities()};for(const[id,q]of Object.entries(plan))merged[id]=Number(merged[id]||0)+q;
  const calculated=math.analyze(categories(),merged,1);if(!calculated.valid){text('mix-result','计划数量超出计算范围。');return;}projected=calculated.completion;
 }
 const reached=projected>=(inMonth?1:Number(dailyGoal())/100)-Number.EPSILON*8;
 text('mix-result',inMonth?'若剩余每天都按此追加，该评级档预计完成 '+pct(projected)+(reached?'，可达到所选档位。':'，还需增加每天的数量。'):'追加后这一天预计完成 '+pct(projected)+(reached?'，可以达到当天总目标。':'，尚未达到当天总目标。'));
}

function renderProcess(day,monthly){
 const inMonth=monthView(),result=inMonth?math.calculateCycle(categories(),actualRecords(),month(),1,remainingCount()):day,c=config();let lines=[];
 if(!result.valid){lines=[inMonth?'请先填写本期总目标，并检查数量记录。':'请检查完成数量，修正后显示完整计算过程。'];}
 else{
  const days=inMonth?elapsedDays():1;
  lines.push(inMonth?'【'+rangeLabel()+' 周期计算过程】':'【'+state.activeDate+' 每日计算过程】');
  for(const row of result.rows)lines.push(row.name+'：'+num(row.quantity,0)+(row.id==='intro'?' ÷ 2 ÷ 80':' ÷ '+num(row.quota))+' = '+num(row.workload,6));
  lines.push('','结果 = '+result.rows.map(x=>num(x.quantity,0)+(x.id==='intro'?' ÷ 2 ÷ 80':' ÷ '+num(x.quota))).join(' + ')+'\n     = '+result.rows.map(x=>num(x.workload,6)).join(' + ')+' = '+num(result.totalWorkload,6));
  lines.push('统计天数 = '+days+'天');
  lines.push(days>0?'X% = 结果 ÷ 天数 = '+num(result.totalWorkload,6)+' ÷ '+days+' = '+pct(result.totalWorkload/days):'统计天数为0，暂不计算平均完成率。');
  if(inMonth){
   lines.push('','【本期设置】','计划工作天数 = '+(c.plannedDays||'未填')+'天'+(c.targetLinked?'；本期总目标由计划工作天数生成：'+c.plannedDays+' × '+(c.defaultDailyTarget||100)+'% = '+num(Number(c.target))+'份':''),'统计天数 = '+elapsedDays()+'天（本期已过工作日，含今天；休息日已排除）','剩余可工作天数 = '+(remainingUnfilled()?'未填写':num(remainingCount())+'天')+'（'+(c.remainingMode==='auto'?'按日历自动计算，今天'+(state.closedDates[today()]?'不计入':'计入'):'手动填写')+'）');
   if(monthly.valid){lines.push('','本期总目标 = '+num(Number(c.target))+'份工作量');lines.push('本期目标进度 = '+num(result.totalWorkload,6)+' ÷ '+num(Number(c.target))+' = '+pct(monthly.completion));lines.push('还差 = '+num(monthly.remainingWorkload,6)+'份工作量');if(remainingCount()>0)lines.push('平均每天需完成 = '+num(monthly.remainingWorkload,6)+' ÷ '+num(remainingCount())+' = '+num(monthly.dailyRequiredWorkload,6)+'份工作量');}else lines.push('','本期个人目标未设置；公式完成率与等级标准仍按实际数量计算。');
  }else{
   const g=dailyGoalAnalysis();
   if(g.valid){lines.push('','当天总定额目标 = '+num(Number(dailyGoal()))+'（100＝1份工作量；只用来和上面的X%比较，不改变原公式）');lines.push('距目标还差 = max('+num(Number(dailyGoal()))+' − '+num(day.completion*100,4)+', 0) = '+num(g.remainingWorkload*100,4)+'个百分点');lines.push('','若接下来只补做某一类任务（任选一种）：');for(const row of g.rows)lines.push(row.name+'：向上取整('+num(g.remainingWorkload,6)+' × '+num(row.quota)+') = '+num(g.singleTaskNeeds[row.id],0)+'个');}
  }
  lines.push('','说明：原式中的“++”按一个加号处理。开场口播按数量÷2÷80计算，等价于÷160。','显示值经过四舍五入；补量按精确分数计算后向上取整。');
 }
 text('calculation-process',lines.join('\n'));
}

function activity(record){return TASKS.some(t=>String(record[t.id]??'').trim()!==''&&(!quantityOK(record[t.id])||Number(record[t.id])>0));}
function renderHistory(cats){
 const dates=Object.keys(state.records).filter(d=>d>=range().start&&d<=range().end&&d<=today()&&activity(state.records[d])).sort().reverse();
 text('history-count',dates.length+'天');
 $('history-list').innerHTML=dates.length?dates.map(date=>{const r=math.analyze(cats,state.records[date],1),nonzero=TASKS.filter(t=>Number(state.records[date][t.id])>0).length;return '<button type="button" class="history-row" data-open-date="'+date+'" title="点击查看 / 编辑这一天"><span class="history-date">'+escapeHTML(date.slice(5).replace('-','月')+'日')+'</span><strong class="history-progress">'+(r.valid?pct(r.completion):'—')+'</strong><span class="history-desc">'+nonzero+'类任务 · '+(r.valid?num(r.totalWorkload)+'份工作量':'请检查输入')+'</span></button>';}).join(''):'<div class="empty-state">本期暂无完成记录。</div>';
}
function setupMix(){
 const options=TASKS.map(t=>'<option value="'+t.id+'">'+escapeHTML(taskName(t))+'</option>').join('');
 $('mix-task1').innerHTML=options;$('mix-task2').innerHTML=options;$('mix-task2').value='splice';
}
function resetMix(){for(const id of ['mix-qty1','mix-qty2'])$(id).value='0';}
const TAB_KEYS=['calendar','day','month','effect','help'];
const monthView=()=>state.tab==='month'||state.tab==='effect';
function switchTab(tab){state.tab=tab;showAllNeeds=false;resetMix();save();renderAll();}
function goDate(date,follow=false){if(!dateOK(date))return;state.activeDate=date;state.followToday=follow;showAllNeeds=false;resetMix();save();renderAll();}
function exportBackup(){
 if(window.NativeWorkload){try{cleanState(state);}catch(e){toast('请先修正无效输入，再导出备份。');return;}window.webkit.messageHandlers.native.postMessage({action:'exportBackup',payload:JSON.stringify(state,null,2),filename:'工作量备份-'+cycleLabel(month())+'.json'});return;}
 if(!demo){try{cleanState(state);}catch(e){toast('请先修正无效输入，再导出备份。');return;}}
 const data=JSON.stringify(state,null,2),blob=new Blob([data],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='工作量备份-'+cycleLabel(month())+(demo?'-示例':'')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已生成，请保留下载的JSON文件。');
}
function loadDemo(){
 if(demo){toast('当前已经是示例模式。');return;}
 realState=clone(state);demo=true;state=freshState();state.activeDate=today();state.months[month()]=defaultMonth(month());state.dailyTargets[state.activeDate]='100';config().target='22';config().remainingDays='5';config().remainingMode='manual';state.records[state.activeDate]={omni_short:'3',splice:'20'};showAllNeeds=false;setupMix();renderAll();toast('已载入你的例子：3个omni＋20个拼接，原公式完成31%。');
}
function exitDemo(){if(!demo)return;state=realState;realState=null;demo=false;resetMix();renderAll();text('save-status','已返回自己的记录 · 数据保存在本机');}
for(const key of TAB_KEYS){$('tab-'+key).addEventListener('click',()=>switchTab(key));$('tab-'+key).addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const dir=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;switchTab(TAB_KEYS[(TAB_KEYS.indexOf(state.tab)+dir+TAB_KEYS.length)%TAB_KEYS.length]);$('tab-'+state.tab).focus();}});}
$('record-date').addEventListener('change',e=>goDate(e.target.value));
$('month-select').addEventListener('change',e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){const k=cycleKeyFromLabel(e.target.value);goDate(k===math.getCycleKey(today())?today():k+'-23');}});
document.querySelector('.main-column').addEventListener('input',e=>{
 const el=e.target,kind=el.dataset.kind,id=el.dataset.id;if(!kind)return;
 if(kind==='quantity'){if(state.activeDate>today())return;if(!state.records[state.activeDate])state.records[state.activeDate]={};state.records[state.activeDate][id]=el.value;if(state.dailyTargets[state.activeDate]===undefined)state.dailyTargets[state.activeDate]=config().defaultDailyTarget||'100';}
 else if(kind==='quota'){config().dailyQuotas[id]=el.value;document.querySelectorAll('[data-kind="quota"][data-id="'+id+'"]').forEach(other=>{if(other!==el)other.value=el.value;});}
 else if(kind==='effect'){config().thresholds[id][el.dataset.tier]=el.value;}
 save();updateResults();
});
$('target-days').addEventListener('input',e=>{config().target=e.target.value;config().targetLinked=false;save();updateResults();});
$('remaining-days').addEventListener('input',e=>{config().remainingDays=e.target.value;config().remainingMode='manual';save();updateResults();});
for(const id of ['mix-task1','mix-task2','mix-qty1','mix-qty2'])$(id).addEventListener('input',()=>updateMix(math.analyze(categories(),dailyQuantities(),1),monthAnalysis()));
$('needs-toggle').addEventListener('click',()=>{showAllNeeds=!showAllNeeds;renderNeeds(math.analyze(categories(),dailyQuantities(),1),monthAnalysis());});
$('history-list').addEventListener('click',e=>{const b=e.target.closest('[data-open-date]');if(b){state.tab='day';goDate(b.dataset.openDate);$('day-panel').scrollIntoView({behavior:'smooth',block:'start'});}});
let filterPending=null,filterAnchor=null;
function updateFilterLabel(){const n=TASKS.filter(t=>!state.hiddenTasks[t.id]).length;document.querySelectorAll('[data-filter-toggle]').forEach(b=>{b.textContent=(n===TASKS.length?'任务类型':'任务类型 ('+n+'/'+TASKS.length+')')+' ▾';b.classList.toggle('active',n!==TASKS.length);});}
function renderFilterList(){$('filter-list').innerHTML=TASKS.map(t=>'<button type="button" class="filter-item'+(filterPending[t.id]?'':' on')+'" data-filter-task="'+t.id+'" role="checkbox" aria-checked="'+(!filterPending[t.id])+'"><span class="chk" aria-hidden="true">✓</span>'+escapeHTML(taskName(t))+'</button>').join('');}
function openFilter(btn){filterAnchor=btn;filterPending={...state.hiddenTasks};renderFilterList();const r=btn.getBoundingClientRect(),pop=$('filter-pop');pop.hidden=false;pop.style.top=Math.max(8,Math.min(r.bottom+6,window.innerHeight-pop.offsetHeight-8))+'px';pop.style.left=Math.max(8,Math.min(r.left,window.innerWidth-pop.offsetWidth-8))+'px';btn.setAttribute('aria-expanded','true');}
function closeFilter(){$('filter-pop').hidden=true;document.querySelectorAll('[data-filter-toggle]').forEach(b=>b.setAttribute('aria-expanded','false'));}
$('filter-pop').addEventListener('click',e=>{e.stopPropagation();const b=e.target.closest('[data-filter-task]');if(!b)return;const id=b.dataset.filterTask;if(filterPending[id])delete filterPending[id];else filterPending[id]=true;renderFilterList();});
$('filter-cancel').addEventListener('click',closeFilter);
$('filter-ok').addEventListener('click',()=>{state.hiddenTasks=filterPending;closeFilter();save();renderRows();updateResults();});
document.addEventListener('click',e=>{const b=e.target.closest('[data-filter-toggle]');if(b){const same=!$('filter-pop').hidden&&filterAnchor===b;closeFilter();if(!same)openFilter(b);return;}if(!$('filter-pop').hidden)closeFilter();});
window.addEventListener('resize',()=>{if(!$('filter-pop').hidden)closeFilter();});window.addEventListener('scroll',e=>{if(!$('filter-pop').hidden&&!$('filter-pop').contains(e.target))closeFilter();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('filter-pop').hidden){closeFilter();if(filterAnchor)filterAnchor.focus();}});
$('demo-button').addEventListener('click',loadDemo);$('exit-demo').addEventListener('click',exitDemo);
$('export-button').addEventListener('click',exportBackup);
$('copy-process').addEventListener('click',async()=>{const report=$('calculation-process').textContent;if(window.NativeWorkload){window.webkit.messageHandlers.native.postMessage({action:'copyText',text:report});return;}try{if(!navigator.clipboard)throw Error();await navigator.clipboard.writeText(report);toast('计算过程已复制。');}catch(e){$('report-text').value=report;$('report-dialog').showModal();$('report-text').focus();$('report-text').select();}});
$('close-report').addEventListener('click',()=>$('report-dialog').close());
$('import-button').addEventListener('click',()=>{if(demo){toast('请先返回自己的记录，再导入备份。');return;}if(window.NativeWorkload){window.webkit.messageHandlers.native.postMessage({action:'importBackup'});}else{$('import-file').click();}});
$('import-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>5*1024*1024){toast('请选择小于5MB的备份文件。');return;}try{pendingImport=cleanState(JSON.parse(await file.text()));$('import-dialog').showModal();}catch(error){toast(error.message||'备份读取失败，请选择本软件导出的JSON文件。');}});
$('cancel-import').addEventListener('click',()=>{pendingImport=null;$('import-dialog').close();});
$('confirm-import').addEventListener('click',()=>{if(pendingImport){state=pendingImport;pendingImport=null;save();resetMix();renderAll();toast('备份已导入。');}$('import-dialog').close();});

function effectAnalysis(){
 const base=math.calculateCycle(categories().map(t=>({...t,quota:1})),actualRecords(),month(),1,0);
 if(!base.valid)return {valid:false,errors:['本月数量记录有误，请先检查。'],rates:{}};
 return math.evaluateEffectiveness(TASKS.map(t=>({id:t.id,name:taskName(t),...config().thresholds[t.id]})),base.quantities);
}
function renderEffect(){
 const result=effectAnalysis();renderGradePlans();text('effect-badge',result.valid?result.label:'待设置标准');
 document.querySelectorAll('[data-effect]').forEach(el=>el.classList.toggle('active',result.valid&&el.dataset.effect===result.level));
 text('effect-status',result.valid?'':result.errors.join(' '));
 document.querySelectorAll('[data-kind="effect"]').forEach(el=>el.setAttribute('aria-invalid',String(el.value!==''&&!positive(el.value))));
 if(monthView()){
  const lines=['','【本月等级标准】'];
  if(!result.valid)lines.push(result.errors.join(' '));
  else{
   for(const [tier,label] of [['high','优'],['medium','良'],['low','中']]){
    const terms=TASKS.filter(t=>positive(config().thresholds[t.id][tier])).map(t=>num(getTotals()[t.id],0)+'÷'+num(Number(config().thresholds[t.id][tier])));
    lines.push(label+'档 = '+terms.join(' + ')+' = '+pct(result.rates[tier]));
   }
   lines.push('取达到100%的最高档 → '+result.label);
  }
  $('calculation-process').textContent+=lines.join('\n');
 }
}
$('planned-days').addEventListener('input',e=>{config().plannedDays=e.target.value;save();});
$('generate-month-target').addEventListener('click',()=>{if(!positive(config().plannedDays)){toast('请先填写大于0的计划工作天数。');return;}config().target=String(Number(config().plannedDays)*Number(config().defaultDailyTarget||100)/100);config().targetLinked=true;$('target-days').value=config().target;save();updateResults();toast('已生成月总目标；各类换算数量已同步更新。');});
$('generate-effect').addEventListener('click',()=>{if(!positive(config().plannedDays)){toast('请先填写计划工作天数。');return;}for(const [id,tiers] of Object.entries(FLOW_DAILY_TIERS))for(const tier of ['high','medium','low'])config().thresholds[id][tier]=String(tiers[tier]*Number(config().plannedDays));const dt=derivedTiers(Number(config().plannedDays));for(const [id,tiers] of Object.entries(dt))for(const tier of ['high','medium','low'])config().thresholds[id][tier]=String(tiers[tier]);save();renderAll();toast('已按计划工作天数，生成8类任务的月标准。');});


function cycleQuantities(){return math.calculateCycle(categories().map(t=>({...t,quota:1})),actualRecords(),month(),1,0);}
function gradePlans(){const total=cycleQuantities();if(!total.valid)return {valid:false,errors:total.errors};return math.planEffectiveness(TASKS.map(t=>({id:t.id,name:taskName(t),...config().thresholds[t.id]})),total.quantities,remainingCount());}
function gradeResult(){const p=gradePlans(),g=$('plan-grade').value;if(!p.valid)return {valid:false,errors:p.errors};return {valid:true,completion:p[g].completion,remainingWorkload:p[g].remainingRatio,dailySingleTaskNeeds:p[g].dailySingleTaskNeeds,singleTaskNeeds:p[g].totalSingleTaskNeeds};}
function renderGradePlans(){
 const r=effectAnalysis();
 if(!r.valid){$('grade-plans').innerHTML='';return;}
 const days=remainingCount();
 $('grade-plans').innerHTML=[['high','优'],['medium','良'],['low','中']].map(([key,label])=>{
  const rate=r.rates[key],left=Math.max(0,1-rate);
  const desc=left===0?'已达到':'还差 '+pct(left)+(days>0?' · 每天 '+pct(left/days):'');
  return '<div class="tier'+(r.level===key?' active':'')+'"><h4><span>'+label+'档进度</span></h4><strong>'+pct(rate)+'</strong><small>'+escapeHTML(desc)+'</small></div>';
 }).join('');
}
function renderCalendar(){
 const r=range(),c=config(),now=today();text('calendar-range',rangeLabel());
 const workdays=r.dates.filter(d=>!c.daysOff[d]).length;text('calendar-summary',workdays+'个工作日 · 剩余 '+num(remainingCount())+'天'+(c.remainingMode==='manual'?'（手填）':'（日历）'));
 const weekday=(new Date(r.start+'T12:00:00').getDay()+6)%7;
 let html='<div class="cal-blank"></div>'.repeat(weekday);
 for(const date of r.dates){
  const q=state.records[date]||{},hasRecord=Object.prototype.hasOwnProperty.call(state.records,date)&&TASKS.some(t=>String(q[t.id]??'').trim()!==''),future=date>now;
  const d=math.analyze(categories(),q,Number(dailyGoal(date))/100);let amount='未记录',left='点击查看';
  if(future){amount='待开始';left='可安排休息';}
  else if(hasRecord){amount=d.valid?num(d.totalWorkload,2)+'份':'输入有误';left=d.valid?'还差 '+num(d.remainingWorkload*100,1)+'%' :'请检查记录';}
  if(c.daysOff[date]&&!hasRecord&&!future){amount='休息日';left='不计工作日';}
  const cls=['cal-cell',date===state.activeDate?'selected':'',date===now?'today':'',c.daysOff[date]?'off':'',future?'future':''].join(' ');
  html+='<div class="'+cls+'"><button class="cal-main" data-cal-date="'+date+'" aria-label="查看'+date+'记录"><span class="cal-date">'+(date===r.start||date.slice(8)==='01'?date.slice(5).replace('-','/'):date.slice(8).replace(/^0/,''))+'<i>'+(date===now?'今':'')+'</i></span><span class="cal-amount">'+escapeHTML(amount)+'</span><span class="cal-left">'+escapeHTML(left)+'</span></button><label class="cal-rest"><input type="checkbox" data-rest-date="'+date+'" '+(c.daysOff[date]?'checked':'')+' aria-label="'+date+'设为休息日">休息</label></div>';
 }
 $('calendar-grid').innerHTML=html;
}
$('calendar-grid').addEventListener('click',e=>{const b=e.target.closest('[data-cal-date]');if(b){state.tab='day';goDate(b.dataset.calDate);$('day-panel').scrollIntoView({behavior:'smooth',block:'start'});}});
$('calendar-grid').addEventListener('change',e=>{const date=e.target.dataset.restDate;if(!date)return;const c=config();if(e.target.checked)c.daysOff[date]=true;else delete c.daysOff[date];c.plannedDays=String(range().dates.filter(d=>!c.daysOff[d]).length);$('planned-days').value=c.plannedDays;if(c.targetLinked){c.target=String(Number(c.plannedDays)*Number(c.defaultDailyTarget||100)/100);$('target-days').value=c.target;}save();updateResults();});
$('auto-remaining').addEventListener('change',e=>{const current=remainingCount();config().remainingMode=e.target.checked?'auto':'manual';if(!e.target.checked)config().remainingDays=String(current);save();renderAll();});
$('today-open').addEventListener('change',e=>{if(e.target.checked)delete state.closedDates[today()];else state.closedDates[today()]=true;save();updateResults();});
$('follow-today').addEventListener('change',e=>{state.followToday=e.target.checked;if(e.target.checked)goDate(today(),true);else save();});
$('back-today').addEventListener('click',()=>goDate(today(),true));
$('plan-grade').addEventListener('change',()=>{resetMix();updateResults();});
window.getNativeState=function(){const current=demo?realState:state;try{cleanState(current);return JSON.stringify(current);}catch(e){return lastPersistableState;}};
window.nativeSaveResult=function(ok,message){storageOK=ok;text('save-status',ok?'已保存到本机 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' · 可导出备份':'保存失败：'+message+'，请导出备份');};
window.nativeNotice=message=>toast(message);
window.receiveNativeImport=function(json){try{pendingImport=cleanState(JSON.parse(json));$('import-dialog').showModal();}catch(e){toast(e.message||'备份无效。');}};

$('calendar-cycle').addEventListener('change',e=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)){const k=cycleKeyFromLabel(e.target.value);goDate(k===math.getCycleKey(today())?today():k+'-23');}});
function moveCycle(delta){const [y,m]=month().split('-').map(Number),d=new Date(y,m-1+delta,23,12);goDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-23');}
$('cycle-prev').addEventListener('click',()=>moveCycle(-1));$('cycle-next').addEventListener('click',()=>moveCycle(1));

let lastKnownToday=today();function checkDate(){const now=today();if(now!==lastKnownToday){lastKnownToday=now;if(state.followToday)goDate(now,true);else renderAll();}}
window.addEventListener('focus',checkDate);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDate();});setInterval(checkDate,30000);


$('daily-total-target').addEventListener('input',e=>{state.dailyTargets[state.activeDate]=e.target.value;if(positive(e.target.value))config().defaultDailyTarget=e.target.value;save();updateResults();});
$('rules-button').addEventListener('click',()=>$('rules-dialog').showModal());$('close-rules').addEventListener('click',()=>$('rules-dialog').close());

setupMix();renderAll();
})();
