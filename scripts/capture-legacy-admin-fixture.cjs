// Offline visual fixture for the legacy /admin layout.
// Uses actual project CSS and navigation labels. No server, credentials, cookies or DB.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
fs.mkdirSync("ui-preview", { recursive: true });
const layout = fs.readFileSync("app/admin/layout.tsx","utf8");
const css = fs.readFileSync("app/globals.css","utf8");
const links = [...layout.matchAll(/href:\s*"(\/admin[^"]*)",\s*label:\s*"([^"]+)"/g)]
  .map(([,href,label])=>({href,label}));
if (links.length < 6) throw Error("Unable to extract real admin navigation");
const escape = s=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nav = links.map(({href,label})=>`<a class="pill" href="${escape(href)}">${escape(label)}</a>`).join("");
const tileData = [
 ["Текущая таблица","Этап → матчи + прогнозы участников"],
 ["Этапы / Туры / Матчи","Создание, редактирование, удаление"],
 ["Результаты","Ввод результатов"],
 ["🟨 Золотой свисток","Итоги номинации и место участников"],
 ["Команды","Создать / редактировать / удалить команды"],
 ["Пользователи","Создать / редактировать / удалить пользователей, сброс пароля"]
];
const tiles = tileData.map(([a,b])=>`<section class="card cardBody"><div style="font-weight:950;font-size:18px">${escape(a)}</div><p style="margin-top:6px;font-weight:800">${escape(b)}</p></section>`).join("");
const pages = {
 home: '<h1>Админ-панель</h1><div class="pageMeta">Выберите раздел</div><div style="display:grid;gap:14px;margin-top:16px;max-width:920px">'+tiles+'</div>',
 stages: '<h1>Этапы</h1><p>Выберите текущий этап вручную (⭐).</p><details style="margin-top:18px"><summary>＋ Создать новый этап</summary></details><section class="card cardBody" style="margin-top:24px"><b>Этап #1 • Этап 2026 ⭐</b><p>Статус: Опубликован</p><p>Матчей в этапе: 56</p><p>Открыть →</p></section>',
 users: '<h1>Пользователи</h1><p>Создание / редактирование / удаление</p><section class="card cardBody" style="margin-top:18px"><b>Демонстрационный участник</b><p>Роль: user</p></section>',
 matches: '<h1>Тур 31 — Матчи</h1><p>← Назад к турам</p><details style="margin-top:18px"><summary>＋ Создать матч</summary></details><section class="card cardBody" style="margin-top:24px"><b>Спартак — Зенит</b><p>Дата и время матча: демонстрационные</p></section>'
};
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try {
  for(const [name,width,height] of [["desktop",1440,900],["mobile",390,844]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   for(const [section,body] of Object.entries(pages)){
    const html=`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div class="page"><p style="font-size:12px;margin-bottom:12px">ИЗОЛИРОВАННЫЙ МАКЕТ • НЕ ЖИВЫЕ ДАННЫЕ</p><nav class="adminTopNav" aria-label="Разделы администрирования">${nav}<a class="pill" href="#">Выйти</a></nav><div class="adminContent" style="margin-top:16px"><main class="page">${body}</main></div></div></body></html>`;
    await page.setContent(html);
    const metrics=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:document.documentElement.scrollWidth}));
    console.log("ADMIN_VISUAL_FIXTURE "+name+"-"+section+" "+JSON.stringify(metrics));
    if(metrics.width>metrics.viewport+2) throw Error("Horizontal overflow: "+name+"-"+section);
    await page.screenshot({path:path.join("ui-preview",name+"-legacy-admin-"+section+".png"),fullPage:true,animations:"disabled"});
   }
   await page.close();
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
