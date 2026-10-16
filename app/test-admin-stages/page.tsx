"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
type Stage={id:string;name:string;status:string;is_current:boolean;matches_required:number};
type Tour={id:string;stage_id:string;tour_no:string;name:string|null};
type StageDraft={draft_id:string;name:string;status:string;matches_required:number};
type StageEdit={stage_id:string;name:string};
type TourDraft={draft_id:string;imported_stage_id:string|null;draft_stage_id:string|null;tour_no:string;name:string|null};
type TourEdit={tour_id:string;name:string|null};
type Data={stages:Stage[];tours:Tour[];stageDrafts:StageDraft[];stageEdits:StageEdit[];tourDrafts:TourDraft[];tourEdits:TourEdit[];writeEnabled:boolean;overlayReady:boolean};
const field={padding:9,border:"1px solid #b9c8dc",borderRadius:7};
export default function AdminStages(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[filter,setFilter]=useState("");
 const [stageName,setStageName]=useState(""),[matches,setMatches]=useState("56");
 const [tourStage,setTourStage]=useState(""),[tourNo,setTourNo]=useState(""),[tourName,setTourName]=useState("");
 const load=useCallback(async()=>{const r=await fetch("/api/test/admin/stages-tours",{credentials:"same-origin",cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(r.status===403?"Доступ только ADMIN":d.error||"Ошибка загрузки");setData(d);},[]);
 useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Ошибка")).finally(()=>setLoading(false));},[load]);
 const stages=useMemo(()=>{if(!data)return [];return [
  ...data.stages.map(s=>({...s,displayName:data.stageEdits.find(e=>e.stage_id===s.id)?.name||s.name,key:"imported:"+s.id,draft:false})),
  ...data.stageDrafts.map(s=>({...s,id:s.draft_id,is_current:false,displayName:s.name,key:"draft:"+s.draft_id,draft:true}))
 ];},[data]);
 const shown=stages.filter(s=>s.displayName.toLowerCase().includes(filter.toLowerCase()));
 async function submit(body:Record<string,unknown>,method:"POST"|"PATCH"){
  setBusy(true);setError("");setNotice("");
  try{const r=await fetch("/api/test/admin/stages-tours",{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось сохранить");await load();setNotice("Изменение сохранено только в тестовой песочнице.");return true;}
  catch(e){setError(e instanceof Error?e.message:"Ошибка");return false;}
  finally{setBusy(false);}
 }
 async function rename(kind:string,id:number,current:string){
  const next=window.prompt("Новое название",current);if(next===null||next.trim()===current)return;
  if(!next.trim()){setError("Название не может быть пустым");return;}
  await submit({kind,id,name:next.trim()},"PATCH");
 }
 return <main style={{maxWidth:980,margin:"32px auto",padding:"0 18px 50px"}}>
  <h1>Этапы и туры</h1>
  <p>Импортированные данные не изменяются. Новые записи и переименования хранятся отдельно в Neon · footy_sandbox.</p>
  {loading&&<p>Загрузка…</p>}
  {error&&<p role="alert" style={{color:"#a12727"}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#146b42"}}>{notice}</p>}
  {data&&<><p>Этапов: <strong>{stages.length}</strong> · Импортированных туров: <strong>{data.tours.length}</strong> · Новых тестовых туров: <strong>{data.tourDrafts.length}</strong></p>
  {!data.overlayReady&&<p style={{padding:12,background:"#fff4dc",borderRadius:8}}>Схема песочницы ещё не применена в этой базе. Доступен только просмотр.</p>}
  {data.overlayReady&&!data.writeEnabled&&<p>Редактирование отключено настройкой тестовой среды.</p>}
  {data.writeEnabled&&<section style={{border:"1px solid #b9c8dc",padding:18,borderRadius:12,marginBottom:22}}>
   <h2>Создать тестовый этап</h2>
   <form onSubmit={async e=>{e.preventDefault();if(await submit({kind:"stage",name:stageName,matchesRequired:Number(matches)},"POST"))setStageName("");}} style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"end"}}>
    <label>Название<br/><input required maxLength={160} style={field} value={stageName} onChange={e=>setStageName(e.target.value)}/></label>
    <label>Матчей<br/><input required type="number" min={1} max={1000} style={{...field,width:95}} value={matches} onChange={e=>setMatches(e.target.value)}/></label>
    <button disabled={busy} type="submit">Создать этап</button>
   </form>
   <h2>Создать тестовый тур</h2>
   <form onSubmit={async e=>{e.preventDefault();const draft=tourStage.startsWith("draft:");const value=Number(tourStage.split(":")[1]);if(await submit({kind:"tour",tourNo,tourName,name:tourName,importedStageId:draft?undefined:value,draftStageId:draft?value:undefined},"POST")){setTourNo("");setTourName("");}}} style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"end"}}>
    <label>Этап<br/><select required style={field} value={tourStage} onChange={e=>setTourStage(e.target.value)}><option value="">Выбери этап</option>{stages.filter(s=>s.status==="draft").map(s=><option key={s.key} value={s.key}>{s.displayName}</option>)}</select></label>
    <label>Номер тура<br/><input required maxLength={40} style={{...field,width:110}} value={tourNo} onChange={e=>setTourNo(e.target.value)}/></label>
    <label>Название<br/><input required maxLength={160} style={field} value={tourName} onChange={e=>setTourName(e.target.value)}/></label>
    <button disabled={busy} type="submit">Создать тур</button>
   </form>
  </section>}
  <label>Поиск этапа <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Название этапа" style={{...field,display:"block",width:"100%",maxWidth:400,marginTop:5}} /></label>
  {shown.map(stage=>{const tours=stage.draft?[]:data.tours.filter(t=>t.stage_id===stage.id);const drafts=data.tourDrafts.filter(t=>stage.draft?t.draft_stage_id===stage.id:t.imported_stage_id===stage.id);return <section key={stage.key} style={{border:"1px solid #cfdced",borderRadius:12,padding:18,marginTop:15}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",alignItems:"center"}}><h2 style={{margin:"0 0 8px",fontSize:20}}>{stage.displayName}{stage.draft?" · Тестовый":""}</h2>
   {data.writeEnabled&&stage.status==="draft"&&<button disabled={busy} onClick={()=>rename(stage.draft?"draft-stage":"imported-stage",Number(stage.id),stage.displayName)}>Переименовать этап</button>}</div>
   <p style={{fontSize:13,color:"#5a6a80"}}>Статус: {stage.status} {stage.is_current?"· Текущий этап":""} · Туров: {tours.length+drafts.length}</p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {tours.map(t=><span key={t.id} style={{border:"1px solid #d3ddec",borderRadius:7,padding:9,background:"#f7faff",fontSize:13}}>{data.tourEdits.find(e=>e.tour_id===t.id)?.name||t.name||"Тур "+t.tour_no} {data.writeEnabled&&stage.status==="draft"&&<button disabled={busy} onClick={()=>rename("imported-tour",Number(t.id),t.name||"Тур "+t.tour_no)}>Изменить</button>}</span>)}
    {drafts.map(t=><span key={"d"+t.draft_id} style={{border:"1px solid #b8ddc4",borderRadius:7,padding:9,background:"#f1fff4",fontSize:13}}>Тестовый тур {t.tour_no}: {t.name} {data.writeEnabled&&<button disabled={busy} onClick={()=>rename("draft-tour",Number(t.draft_id),t.name||"Тур "+t.tour_no)}>Изменить</button>}</span>)}
   </div>
  </section>;})}
  {shown.length===0&&<p>Этапы не найдены.</p>}
  </>}
 </main>;
}
