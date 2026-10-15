"use client";
import {useState} from "react";
export default function ChangePassword() {
 const [oldPassword,setOld]=useState("");
 const [newPassword,setNew]=useState("");
 const [confirm,setConfirm]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function submit(e:React.FormEvent<HTMLFormElement>) {
  e.preventDefault();setMessage("");
  if(newPassword.length<5||newPassword.length>128||new TextEncoder().encode(newPassword).length>256){setMessage("Пароль должен содержать от 5 до 128 символов.");return;}
  if(newPassword!==confirm){setMessage("Новые пароли не совпадают.");return;}
  if(oldPassword===newPassword){setMessage("Новый пароль должен отличаться от старого.");return;}
  setBusy(true);
  try {
   const r=await fetch("/api/test/change-password",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword,newPassword})});
   const data=await r.json();
   if(r.ok&&data.ok){setOld("");setNew("");setConfirm("");setMessage("Пароль изменён. Все прежние сессии завершены. Войди с новым паролем.");return;}
   const messages:Record<string,string>={unauthorized:"Необходимо войти в тестовый аккаунт.",invalid_credentials:"Текущий пароль неверный.",too_many_attempts:"Слишком много попыток. Попробуй позже.",invalid_password:"Проверь длину нового пароля.",retry_required:"Данные изменились. Войди заново и повтори.",forbidden:"Недопустимый источник запроса.",not_available:"Функция недоступна.",unavailable:"Ошибка сервера. Попробуй позже."};
   setMessage(messages[data.error]||"Не удалось изменить пароль.");
  } catch {setMessage("Ошибка соединения.");}
  finally {setBusy(false);}
 }
 return <main style={{maxWidth:440,margin:"50px auto",padding:24}}>
  <h1>Смена тестового пароля</h1>
  <p>Для ADMIN и участников Footy. Минимум 5 символов, максимум 128. Используй отдельный пароль, не от рабочего сайта.</p>
  <form onSubmit={submit} style={{display:"grid",gap:14}}>
   <label>Текущий пароль<input required type="password" autoComplete="current-password" value={oldPassword} onChange={e=>setOld(e.target.value)} style={{display:"block",width:"100%"}}/></label>
   <label>Новый пароль<input required type="password" autoComplete="new-password" minLength={5} maxLength={128} value={newPassword} onChange={e=>setNew(e.target.value)} style={{display:"block",width:"100%"}}/></label>
   <label>Повтори новый пароль<input required type="password" autoComplete="new-password" minLength={5} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} style={{display:"block",width:"100%"}}/></label>
   <button disabled={busy} type="submit">{busy?"Изменение…":"Сменить пароль"}</button>
  </form>
  <p role="status">{message}</p>
  <p><a href="/test-participant-login">Войти в тестовый Footy</a></p>
 </main>;
}
