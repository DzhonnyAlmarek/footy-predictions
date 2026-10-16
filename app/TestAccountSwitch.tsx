"use client";
import {usePathname} from "next/navigation";
import {useState} from "react";

export default function TestAccountSwitch(){
 const pathname=usePathname();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 if(!pathname?.startsWith("/test-") || pathname==="/test-participant-login" || pathname==="/test-login")return null;
 async function logout(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/test/participant-logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
   if(!response.ok)throw new Error("Не удалось завершить сессию. Повтори попытку.");
   window.location.replace("/test-participant-login");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка выхода");setBusy(false);}
 }
 return <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,padding:"10px 18px",borderBottom:"1px solid #dbe3ee",flexWrap:"wrap"}}>
 {error&&<span role="alert">{error}</span>}
 <button type="button" onClick={logout} disabled={busy} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #b9c8dc",cursor:"pointer"}}>{busy?"Выход…":"Выйти / сменить пользователя"}</button>
 </div>;
}
