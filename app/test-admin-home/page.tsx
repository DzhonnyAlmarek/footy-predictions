"use client";
import {useEffect,useState} from "react";
type Stats={stages:number;importedMatches:number;newMatches:number;resultOverrides:number;calendarEdits:number;participants:number};
const sections=[
 {title:"Результаты матчей",description:"Ввод и отмена тестовых результатов импортированных матчей",href:"/test-admin-results"},
 {title:"Новые матчи",description:"Создание, изменение и скрытие тестовых матчей",href:"/test-admin-calendar"},
 {title:"Импортированный календарь",description:"Изменение дат, команд и туров в песочнице",href:"/test-admin-calendar-imported"},
 {title:"Единый календарь",description:"Просмотр импортированных и новых тестовых матчей",href:"/test-admin-calendar-all"}
];
export default function TestAdminHome(){
 const [stats,setStats]=useState<Stats|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/test/admin/dashboard",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(r.status===403?"Доступ только для ADMIN. Войди под ADMIN.":d.error||"Ошибка");setStats(d.summary);}).catch(e=>setError(e instanceof Error?e.message:"Ошибка")).finally(()=>setLoading(false));},[]);
 return <main style={{maxWidth:920,margin:"32px auto",padding:"0 18px 45px"}}>
 <h1>Footy · административный кабинет</h1><p style={{fontWeight:700,color:"#214f98"}}>ADMIN · Управление тестовой площадкой</p><p>Изолированная тестовая среда Neon. Изменения применяются только в footy_sandbox, рабочий Supabase не затрагивается.</p>
 <p><a href="/test-participant-home">← Кабинет участника</a></p>
 {loading&&<p>Проверка доступа ADMIN и загрузка…</p>}
 {error&&<p role="alert" style={{color:"#a12727"}}>{error} <a href="/test-participant-login?next=%2Ftest-admin-home">Вход</a></p>}
 {stats&&<><section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,margin:"24px 0"}}>
 {([["Этапы",stats.stages],["Участники",stats.participants],["Импортированные матчи",stats.importedMatches],["Новые тестовые матчи",stats.newMatches],["Изменения календаря",stats.calendarEdits],["Тестовые результаты",stats.resultOverrides]] as [string,number][]).map(([label,value])=><div key={label} style={{padding:14,borderRadius:11,border:"1px solid #cfdced",background:"#f5f8ff"}}><strong style={{display:"block",fontSize:25}}>{value}</strong><span style={{fontSize:12,color:"#66758a"}}>{label}</span></div>)}</section>
 <h2>Доступные инструменты управления</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:12}}>{sections.map(s=><a key={s.href} href={s.href} style={{display:"block",padding:17,border:"1px solid #cfdced",borderRadius:12,textDecoration:"none",color:"#1c3657"}}><strong>{s.title} →</strong><p style={{fontSize:13,color:"#62748a"}}>{s.description}</p></a>)}</div>
 <h2 style={{marginTop:30}}>Пока не реализовано</h2><p>Управление этапами и турами, командами, учётными записями, публикацией, резервными копиями и переносом фоновых задач пока не подключено к Neon как полноценная административная система.</p>
 </>}
 </main>;
}