// Majordome 3.0 — One‑Paste (compact)
const SH={params:'paramètres',pos:'positions',log:'journal_actions',sig:'signaux',rep:'rapports_index',tasks:'tâches',pol:'policies',met:'metrics'};
const TZ='Europe/Paris'; const iso=()=>Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd'T'HH:mm:ssXXX"); const today=()=>Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd');
const sh=n=>SpreadsheetApp.getActive().getSheetByName(n);
function gp(k){const r=sh(SH.params).getRange(1,1,Math.max(1,sh(SH.params).getLastRow()),2).getValues();const m=Object.fromEntries(r.filter(x=>x[0]!==''));return m[k]||'';}
function sp(k,v){const s=sh(SH.params),r=s.getRange(1,1,Math.max(1,s.getLastRow()),2).getValues();for(let i=0;i<r.length;i++)if(r[i][0]===k){s.getRange(i+1,2).setValue(v);return}s.appendRow([k,v]);}
const ok=o=>ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
function auth_(t){if(!gp('API_TOKEN')||t!==gp('API_TOKEN'))throw new Error('UNAUTHORIZED');}
function log(origin,action,actif,det,etat,msg,idk){sh(SH.log).appendRow([iso(),origin||'',action||'',actif||'',JSON.stringify(det||{}),etat||'',msg||'',idk||'']);}
function dup(idk){if(!idk)return false;const s=sh(SH.log),lr=s.getLastRow();if(lr<2)return false;return s.getRange(2,8,lr-1,1).getValues().flat().includes(idk);}

function doPost(e){try{const route=e?.parameter?.route||'';const body=JSON.parse(e?.postData?.contents||'{}');auth_(e?.parameter?.token||body?.token||'');
  if(route==='init')return init_(); if(route==='install_triggers')return install_();
  if(route==='orchestrate')return orchestrate_(body); if(route==='signal')return signal_(body);
  if(route==='watch_summary')return watch_(); if(route==='brief_daily')return brief_(); if(route==='report')return report_();
  if(route==='notify_sms')return notify_sms_(body); if(route==='notify_tg')return notify_tg_(body); if(route==='notify_both')return notify_both_(body);
  return ok({ok:false,error:'route?'});}catch(err){return ok({ok:false,error:String(err)})}}

// ==== INIT & TRIGGERS ====
function init_(){const ss=SpreadsheetApp.getActive(),schema={
  'paramètres':['clé','valeur'],
  'positions':['actif','statut','qty','entry','sl','tp','roe','atr','trailing','timeframe','updated_at'],
  'journal_actions':['ts','origin','action','actif','details_json','état','message','idempotency_key'],
  'signaux':['ts','actif','tf','type','rr','entry','sl','tp','riskPct','commentaire'],
  'rapports_index':['date','lien','statut'],
  'tâches':['espace','titre','due','recur','eisenhower','status'],
  'policies':['clé','valeur'],
  'metrics':['date','pnl_day','winrate_30d','maxDD_30d','exposure','notes']
};
  Object.keys(schema).forEach(n=>{let s=ss.getSheetByName(n);if(!s)s=ss.insertSheet(n);s.clear();s.getRange(1,1,1,schema[n].length).setValues([schema[n]]);});
  sp('mode','SIMU'); sp('API_TOKEN',Utilities.getUuid().replace(/-/g,'')); sp('mission_target',600000); sp('mission_progress',0); sp('equity',10000);
  return ok({ok:true,token:gp('API_TOKEN')});
}
function install_(){ScriptApp.getProjectTriggers().forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('brief_').timeBased().atHour(8).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('adjust_').timeBased().everyHours(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('housekeep_').timeBased().atHour(3).everyDays(1).inTimezone(TZ).create();
  return ok({ok:true});
}

// ==== CORE ====
function orchestrate_(b){const mode=gp('mode')||'SIMU',idk=b.idempotencyKey||`${b.origin}-${b.actif}-${b.action}-${iso()}`; if(dup(idk))return ok({ok:true,mode,dedup:true});
  try{log(b.origin,'orchestrate',b.actif,b,'OK','reçu',idk);
    if(mode!=='LIVE') simu_(b); /* else callBitget_({...b,kind:'manage'}); */
    return ok({ok:true,mode});
  }catch(err){log(b.origin,'orchestrate',b.actif,b,'ERR',String(err),idk);return ok({ok:false,error:String(err)});}
}
function simu_(b){const s=sh(SH.pos),lr=s.getLastRow(); if(lr<2)return; const data=s.getRange(1,1,lr,s.getLastColumn()).getValues(), head=data.shift();
  const idx=Object.fromEntries(head.map((h,i)=>[h,i]));
  for(let i=0;i<data.length;i++){ if(String(data[i][idx.actif])===String(b.actif)&&String(data[i][idx.statut])!=='fermé'){
    if(b.action==='close'){data[i][idx.statut]='fermé';data[i][idx.qty]=0;}
    if(b.action==='reduce'){data[i][idx.qty]=Math.max(0,Number(data[i][idx.qty])*(1-(Number(b.qty)||0)));} 
    if(b.action==='trail'){data[i][idx.trailing]=Number(b.trailPct||data[i][idx.trailing]||0);}
    data[i][idx.updated_at]=iso(); s.getRange(i+2,1,1,head.length).setValues([data[i]]); break;}}}

function signal_(s){const A={actif:s.symbol||s.actif||'',type:s.side||s.type||'',tf:s.tf||s.interval||'',
  entry:Number(s.entry||0),sl:Number(s.stopLoss||s.sl||0),tp:Number(s.takeProfit||s.tp||0),
  riskPct:Number(s.riskPct||0),rr:Number(s.rr||s.score||0),source:s.source||'TV'};
  sh(SH.sig).appendRow([iso(),A.actif,A.tf,A.type,A.rr,A.entry,A.sl,A.tp,A.riskPct,A.source]);
  if((gp('mode')||'SIMU')!=='LIVE'){const ps=sh(SH.pos),risk=Math.max(Math.abs(A.entry-A.sl),1e-8),eq=Number(gp('equity')||10000),qty=(eq*(A.riskPct/100))/risk;
    ps.appendRow([A.actif,'ouvert',qty,A.entry,A.sl,A.tp,0,'','',A.tf,iso()]);}
  /* else callBitget_({kind:'entry',symbol:A.actif,side:A.type==='BUY'?'long':'short',entry:A.entry,sl:A.sl,tp:A.tp}); */
  return ok({ok:true,received:A});
}

// ==== BRIEF, WATCH & MAINTENANCE ====
function watch_(){const pct=Number(gp('mission_progress')||0)*100/Number(gp('mission_target')||600000); return ok({todayTasks:0,alertsCount:0,missionPct:pct});}
function brief_(){return ok({date:today(),agenda:['08:30 Brief','10:00 RDV','16:30 Check énergie'],priorities:['Tâche boutique','Action trading','Dossier fiscal'],
  mission:{target:Number(gp('mission_target')||600000),progress:Number(gp('mission_progress')||0)},trading:{alerts:0,policies:{}},tips:sug_()});}
function report_(){sh(SH.rep).appendRow([today(),'à générer','OK']); return ok({ok:true});}
function adjust_(){return ok({ok:true});}
function housekeep_(){return ok({ok:true});}
function sug_(){const S=[],t=Number(gp('mission_target')||600000),p=Number(gp('mission_progress')||0); if(p>0)S.push(`🎯 Mission 600k: ${(100*p/t).toFixed(1)}%. Verrouiller 20% ?`); return S;}

// ===== ALERTES PERSONNELLES (stubs activables plus tard) =====
function notify_sms_(b){return ok({ok:true})}
function notify_tg_(b){return ok({ok:true})}
function notify_both_(b){return ok({ok:true})}

// Placeholder LIVE
function callBitget_(o){ throw new Error('LIVE non configuré (ajoute tes clés et la signature HMAC)'); }
