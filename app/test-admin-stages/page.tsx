"use client";
import {useEffect,useMemo,useState} from "react";
type Stage={id:string;name:string;status:string;is_current:boolean};
type Tour={id:string;stage_id:string;tour_no:string;name:string|null};
export default function AdminStages(){
 const [stages,setStages]=useState<Stage[]>([]);
 const [tours,setTours]=useState<Tour[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [filter,setFilter]=useState("");
 useEffect(()=>{
  fetch("/api/test/admin/calendar",{credentials:"same-origin",cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(r.status===403?"Доступ разрешён только ADMIN":d.error||"Ошибка загрузки");return d;})
   .then(d=>{setStages(d.stages||[]);setTours(d.tours||[]);})
   .catch(e=>setError(e instanceof Error?e.message:"Ошибка"))
   .finally(()=>setLoading(false));
 },[]);
 const visible=useMemo(()=>stages.filter(s=>s.name.toLowerCase().includes(filter.toLowerCase())),[stages,filter]);
 return <main style={{maxWidth:980,margin:"32px auto",padding:"0 18px 50px"}}>
  <h1>Этапы и туры</h1>
  <p>Импортированные данные Neon. Пока только просмотр: изменение этапов и туров будет доступно после проверки изолированной схемы.</p>
  {loading&&<p>Загрузка этапов и туров…</p>}
  {error&&<p role="alert" style={{color:"#a12727"}}>{error}</p>}
  {!loading&&!error&&<><p>Этапов: <strong>{stages.length}</strong> · Туров: <strong>{tours.length}</strong></p>
   <label>Поиск этапа <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Название этапа" style={{display:"block",padding:9,width:"100%",maxWidth:400,marginTop:5}} /></label>
   {visible.map(stage=><section key={stage.id} style={{border:"1px solid #cfdced",borderRadius:12,padding:18,marginTop:15}}>
    <h2 style={{margin:"0 0 8px",fontSize:20}}>{stage.name}</h2>
    <p style={{fontSize:13,color:"#5a6a80"}}>Статус: {stage.status} {stage.is_current?"· Текущий этап":""} · Туров: {tours.filter(t=>t.stage_id===stage.id).length}</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {tours.filter(t=>t.stage_id===stage.id).map(t=><span key={t.id} style={{border:"1px solid #d3ddec",borderRadius:7,padding:"7px 10px",background:"#f7faff",fontSize:13}}>{t.name||"Тур "+t.tour_no}</span>)}
    </div>
   </section>)}
   {visible.length===0&&<p>Этапы не найдены.</p>}
  </>}
 </main>;
}
