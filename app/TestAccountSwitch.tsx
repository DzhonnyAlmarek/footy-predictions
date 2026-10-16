"use client";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";

const links=[
 {href:"/test-admin-home",label:"Обзор"},
 {href:"/test-admin-results",label:"Результаты"},
 {href:"/test-admin-calendar",label:"Новые матчи"},
 {href:"/test-admin-calendar-imported",label:"Импортированный календарь"},
 {href:"/test-admin-calendar-all",label:"Все матчи"},
 {href:"/test-participant-home",label:"Кабинет участника"}
];
export default function TestAccountSwitch(){
 const pathname=usePathname();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [username,setUsername]=useState("");
 const show=!!pathname?.startsWith("/test-") && pathname!=="/test-participant-login" && pathname!=="/test-login";
 const isAdminPage=!!pathname?.startsWith("/test-admin-");
 useEffect(()=>{
  if(!show)return;
  let active=true;
  fetch("/api/test/participant-session",{credentials:"same-origin",cache:"no-store"})
   .then(r=>r.ok?r.json():null)
   .then(d=>{if(active)setUsername(d?.authenticated&&typeof d.username==="string"?d.username:"");})
   .catch(()=>{if(active)setUsername("");});
  return()=>{active=false};
 },[show,pathname]);
 if(!show)return null;
 async function logout(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/test/participant-logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw new Error("Не удалось завершить сессию. Повтори попытку.");
   window.location.replace("/test-participant-login");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка выхода");setBusy(false);}
 }
 return <header style={{padding:"12px max(18px,calc((100% - 1050px)/2))",borderBottom:"1px solid #dbe3ee",background:isAdminPage?"#eaf1ff":"#f8fafc",color:"#172b4d"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
   <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
    <strong>Footy · {isAdminPage?"Панель администратора":"Тестовый кабинет"}</strong>
    {username&&<span style={{fontSize:13,border:"1px solid #b9c8dc",borderRadius:20,padding:"4px 10px",background:"#fff"}}>{username==="ADMIN"?"ADMIN · Администратор":"Участник: "+username}</span>}
    <span style={{fontSize:12,color:"#51627b"}}>Neon · тестовая среда</span>
   </div>
   <button type="button" onClick={logout} disabled={busy} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #9eb2d2",background:"#fff",cursor:"pointer"}}>{busy?"Выход…":"Выйти / сменить пользователя"}</button>
  </div>
  {isAdminPage&&<nav aria-label="Разделы администрирования" style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
   {links.map(link=><a key={link.href} href={link.href} aria-current={pathname===link.href?"page":undefined} style={{fontSize:13,padding:"7px 10px",borderRadius:7,textDecoration:"none",color:"#163a77",background:pathname===link.href?"#c8dcff":"#fff",border:"1px solid #c7d5ed"}}>{link.label}</a>)}
  </nav>}
  {error&&<p role="alert" style={{color:"#a12727",marginBottom:0}}>{error}</p>}
 </header>;
}
