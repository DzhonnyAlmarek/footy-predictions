// Capture the REAL Next.js UI using synthetic browser-level API responses only.
// No DB credentials, live network endpoints, or writes to the application.
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("ui-preview", {recursive:true});
const exampleDate = new Date(Date.now()+2*86400000).toISOString();
const exampleDate2 = new Date(Date.now()+4*86400000).toISOString();
const matches = [
{match_id:"101",kickoff_at:exampleDate,home_team:"Спартак",away_team:"Зенит",home_pred:2,away_pred:1,home_score:null,away_score:null,predictions_open:true},
{match_id:"102",kickoff_at:exampleDate2,home_team:"ЦСКА",away_team:"Локомотив",home_pred:null,away_pred:null,home_score:null,away_score:null,predictions_open:true},
{match_id:"103",kickoff_at:new Date(Date.now()-86400000).toISOString(),home_team:"Краснодар",away_team:"Динамо",home_pred:1,away_pred:1,home_score:1,away_score:1,predictions_open:false}
];
const rank = [
{username:"Сергей",points:"48.50",bonus_points:"1.50",scored_predictions:19},
{username:"Алексей",points:"45.00",bonus_points:"0.50",scored_predictions:20},
{username:"КЕН",points:"42.75",bonus_points:"1.00",scored_predictions:18},
{username:"Мария",points:"41.00",bonus_points:"0.50",scored_predictions:20}
];
const admin = {
teams:[{id:"1",name:"Спартак"},{id:"2",name:"Зенит"},{id:"3",name:"ЦСКА"}],
tournaments:[{id:"1",name:"Премьер-лига"}],
stages:[{id:"1",name:"Этап 2026",status:"draft"}],
tours:[{id:"31",stage_id:"1",name:"Тур 31",tour_no:31}],
matches:[{id:"101",kickoff_at:exampleDate,deadline_at:exampleDate,status:"scheduled",home_score:null,away_score:null,home_team:"Спартак",away_team:"Зенит",home_team_id:"1",away_team_id:"2",admin_created:true}],
writes_enabled:false,result_writes_enabled:false
};
function respond(path, role){
 if(path==="/api/cutover/session") return role==="guest"?[401,{authenticated:false}]:[200,{authenticated:true,username:role==="admin"?"ADMIN":"КЕН",role}];
 if(path==="/api/cutover/participants")return [200,{participants:["КЕН","ADMIN","Сергей","Алексей"]}];
 if(path==="/api/cutover/my-predictions")return [200,{predictions:matches.filter(m=>m.home_pred!==null)}];
 if(path==="/api/cutover/schedule")return [200,{matches}];
 if(path==="/api/cutover/save-prediction")return [200,{enabled:false}];
 if(path==="/api/cutover/leaderboard")return [200,{leaderboard:rank}];
 if(path==="/api/cutover/grand-prix")return [200,{seasons:[{id:"1",name:"Гран-при 2026"}],ratings:[{season_id:"1",username:"Сергей",points:"72.00",scored_rounds:8},{season_id:"1",username:"КЕН",points:"64.25",scored_rounds:8}]}];
 if(path==="/api/cutover/golden-whistle")return [200,{stage:{id:"1",name:"Этап 2026"},available_stages:[{id:"1",name:"Этап 2026",status:"locked"}],penalty_matches:5,leaderboard:[{username:"КЕН",points:4.5,main_place:3},{username:"Сергей",points:2,main_place:1}]}];
 if(path==="/api/cutover/admin")return role==="admin"?[200,admin]:[403,{ok:false}];
 return [404,{ok:false}];
}
async function snap(page,name){await page.screenshot({path:"ui-preview/"+name+".png",fullPage:true,animations:"disabled"});console.log("CAPTURED "+name);}
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 try {
  const desktop=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:"reduce"});
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  for(const [context,prefix] of [[desktop,"desktop"],[mobile,"mobile"]]){
   const page=await context.newPage();
   let role="guest";
   await page.route("**/api/cutover/**",async(route)=>{
     const u=new URL(route.request().url());const [status,body]=respond(u.pathname,role);
     await route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
   });
   page.on("pageerror",e=>console.error("BROWSER ERROR "+prefix+" "+e.message));
   await page.goto("http://127.0.0.1:3100/cutover-participant",{waitUntil:"domcontentloaded"});
   await page.getByText("Вход в турнир").waitFor({timeout:20000});
   await snap(page,prefix+"-login");
   role="user";
   await page.reload({waitUntil:"domcontentloaded"});
   await page.getByText("БЛИЖАЙШИЕ МАТЧИ").waitFor({timeout:20000});
   await page.getByText("Спартак").first().waitFor({timeout:20000});
   await snap(page,prefix+"-matches");
   const tabs=[["Рейтинг","ranking"],["Золотой свисток","whistle"],["Гран-при","grand-prix"],["Мои прогнозы","predictions"]];
   for(const [label,filename] of tabs){await page.getByRole("button",{name:label,exact:true}).click();await page.waitForTimeout(250);await snap(page,prefix+"-"+filename);}
   role="admin";
   await page.reload({waitUntil:"domcontentloaded"});
   await page.getByRole("button",{name:"Администрирование"}).waitFor({timeout:20000});
   await page.getByRole("button",{name:"Администрирование"}).click();
   await page.getByText("Панель администратора").waitFor({timeout:20000});
   await snap(page,prefix+"-admin");
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
