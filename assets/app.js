/* Project Tracker System — vanilla JS single-page app on Supabase.
   Routes (hash): #/  ·  #/new  ·  #/people  ·  #/p/<id>[/overview|/reviews|/settings]  */
(() => {
"use strict";
const CFG = window.MOBER_CONFIG || {};
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const app = $("app");

// ── State ─────────────────────────────────────────────────────
const S = { me:null, profiles:[], projects:[], members:[], tasks:[], reviews:[], loaded:false,
            portfolioMine:false, taskFilter:"all", hideDone:false, expanded:new Set(), reviewWeek:null };
try { S.hideDone = localStorage.getItem("mp-hideDone")==="1"; S.portfolioMine = localStorage.getItem("mp-mine")==="1"; } catch(e){}

const STATUS = {todo:"Not started", doing:"In progress", blocked:"Blocked", done:"Done"};
const HEALTH = {green:"On track", amber:"At risk", red:"Off track"};
const PSTATUS = {planning:"Planning", active:"Active", on_hold:"On hold", done:"Done"};
const KIND = {task:"Task", output:"Output", milestone:"Milestone", review:"Review"};
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY = 864e5;

// ── Helpers ───────────────────────────────────────────────────
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parse = s => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); return new Date(y, m-1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const fmt = s => { if(!s) return "—"; const d = typeof s==="string" ? parse(s) : s; return MON[d.getMonth()]+" "+d.getDate(); };
const monday = d => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const isDone = t => t.status === "done";
const isLate = t => !isDone(t) && parse(t.due_date) < today();
const name = id => { const p = S.profiles.find(x=>x.id===id); return p ? (p.full_name || p.email) : ""; };
const projTasks = pid => S.tasks.filter(t => t.project_id === pid);
const projReviews = pid => S.reviews.filter(r => r.project_id === pid).sort((a,b)=>b.week_of.localeCompare(a.week_of));
const canEdit = p => !!S.me && (S.me.role==="admin" || [p.owner_id,p.sponsor_id,p.created_by].includes(S.me.id)
  || S.members.some(m => m.project_id===p.id && m.profile_id===S.me.id && m.role==="editor"));
const canManage = p => !!S.me && (S.me.role==="admin" || [p.owner_id,p.sponsor_id,p.created_by].includes(S.me.id));
const opts = (obj, sel) => Object.entries(obj).map(([k,v]) => `<option value="${k}" ${k===sel?"selected":""}>${esc(v)}</option>`).join("");
const peopleOpts = (sel, blank="— None —") => `<option value="">${blank}</option>` + S.profiles.slice().sort((a,b)=>(a.full_name||a.email).localeCompare(b.full_name||b.email))
  .map(p => `<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(p.full_name || p.email)}</option>`).join("");

function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast.h); toast.h=setTimeout(()=>t.hidden=true, 3200); }
function fail(e, what){ console.error(e); toast(`Couldn't ${what}. ${e && e.message ? e.message : "Try again."}`); }

function stats(p){
  const ts = projTasks(p.id), t0 = today();
  const due = ts.filter(t => parse(t.due_date) <= t0);
  const open = ts.filter(t=>!isDone(t)).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  const last = projReviews(p.id)[0];
  return { total:ts.length, done:ts.filter(isDone).length, due:due.length, dueDone:due.filter(isDone).length,
           late:ts.filter(isLate).length, blocked:ts.filter(t=>t.status==="blocked").length, next:open[0], lastReview:last,
           reviewedThisWeek: !!last && last.week_of === iso(monday(t0)) };
}
const pct = (a,b) => b ? Math.round(a/b*100) : null;

// ── Data ──────────────────────────────────────────────────────
async function loadAll(){
  const [pr, pj, mb, tk, rv] = await Promise.all([
    sb.from("profiles").select("*"),
    sb.from("projects").select("*").order("created_at"),
    sb.from("project_members").select("*"),
    sb.from("tasks").select("*").order("due_date").order("sort"),
    sb.from("reviews").select("*"),
  ]);
  for (const r of [pr,pj,mb,tk,rv]) if (r.error) throw r.error;
  S.profiles = pr.data; S.projects = pj.data; S.members = mb.data; S.tasks = tk.data; S.reviews = rv.data;
  S.me = S.profiles.find(p => p.id === S.session.user.id) || null;
  S.loaded = true;
}
function upsertLocal(list, row){ const i = list.findIndex(x=>x.id===row.id); if(i>=0) list[i]=row; else list.push(row); }
function subscribe(){
  const apply = key => payload => {
    if (payload.eventType === "DELETE") S[key] = S[key].filter(x => x.id !== payload.old.id);
    else upsertLocal(S[key], payload.new);
    if (!document.querySelector("textarea:focus, input:focus")) render();
  };
  sb.channel("project-tracker-system")
    .on("postgres_changes", {event:"*", schema:"public", table:"tasks"}, apply("tasks"))
    .on("postgres_changes", {event:"*", schema:"public", table:"reviews"}, apply("reviews"))
    .on("postgres_changes", {event:"*", schema:"public", table:"projects"}, apply("projects"))
    .subscribe();
}

// ── Router ────────────────────────────────────────────────────
function route(){
  const h = location.hash.replace(/^#\/?/, "").split("/");
  return { page: h[0] || "home", id: h[1], tab: h[2] || "tasks" };
}
function render(){
  if (!S.loaded) return;
  const r = route();
  document.querySelectorAll("[data-nav]").forEach(a => a.setAttribute("aria-current", (a.dataset.nav===r.page || (r.page==="p" && a.dataset.nav==="home")) ? "page" : "false"));
  $("meName").textContent = S.me ? (S.me.full_name || S.me.email) : "";
  if (r.page === "p") return renderProject(r.id, r.tab);
  if (r.page === "new") return renderNew();
  if (r.page === "people") return renderPeople();
  return renderPortfolio();
}
window.addEventListener("hashchange", () => {
  S.expanded.clear(); S.taskFilter="all"; S.reviewWeek=null;
  if (S.pendingOpen) { S.expanded.add(S.pendingOpen); S.pendingOpen = null; }
  render(); window.scrollTo(0,0);
});

// ── Login ─────────────────────────────────────────────────────
function renderLogin(msg){
  $("topbar").hidden = true;
  app.innerHTML = `<form class="login" id="loginForm">
    <div><span class="eyebrow">Mober</span><h1>Project Tracker System</h1></div>
    <p class="muted" style="margin:0">Sign in with your ${esc((CFG.ALLOWED_DOMAINS||[]).map(d=>"@"+d).join(" or "))} email. We'll send you a sign-in link.</p>
    <label class="f" for="loginEmail">Work email<input id="loginEmail" type="email" required autocomplete="email" placeholder="name@mober.ph"></label>
    <button class="btn" type="submit">Send sign-in link</button>
    ${msg ? `<p class="muted" style="margin:0">${esc(msg)}</p>` : ""}
  </form>`;
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("loginEmail").value.trim().toLowerCase();
    if (!(CFG.ALLOWED_DOMAINS||[]).includes(email.split("@")[1])) return renderLogin("Use your company email address.");
    const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin + location.pathname } });
    renderLogin(error ? `Couldn't send the link: ${error.message}` : `Check ${email} for your sign-in link.`);
  });
}
$("signOut").addEventListener("click", async () => { await sb.auth.signOut(); location.hash = ""; });

// ── Portfolio ─────────────────────────────────────────────────
function renderPortfolio(){
  const mine = p => S.me && ([p.owner_id,p.sponsor_id,p.created_by].includes(S.me.id) || S.members.some(m=>m.project_id===p.id && m.profile_id===S.me.id));
  const list = S.projects.filter(p => !S.portfolioMine || mine(p));
  const active = list.filter(p => p.status === "active");
  const st = active.map(stats);
  const sum = k => st.reduce((a,s)=>a+s[k],0);
  const onSched = pct(sum("dueDone"), sum("due"));
  const noReview = active.filter((p,i)=>!st[i].reviewedThisWeek).length;
  const order = {red:0, amber:1, green:2};
  const rows = list.slice().sort((a,b)=> (a.status==="active"?0:1)-(b.status==="active"?0:1) || order[a.health]-order[b.health] || a.name.localeCompare(b.name));

  app.innerHTML = `
  <div class="head">
    <div><span class="eyebrow">Portfolio · ${fmt(today())}</span><h1>All projects</h1></div>
    <div class="row-actions">
      <div class="seg" role="group" aria-label="Show"><button type="button" data-mine="0" aria-pressed="${!S.portfolioMine}">All</button><button type="button" data-mine="1" aria-pressed="${S.portfolioMine}">Mine</button></div>
      <a class="btn" href="#/new">New project</a>
    </div>
  </div>
  <section class="stats" aria-label="Summary">
    <div class="stat"><span>Active projects</span><b>${active.length}</b></div>
    <div class="stat ok"><span>On schedule</span><b>${onSched===null?"–":onSched+"%"}</b><span>of tasks due so far are done</span></div>
    <div class="stat bad"><span>Overdue tasks</span><b>${sum("late")}</b></div>
    <div class="stat bad"><span>Blocked tasks</span><b>${sum("blocked")}</b></div>
    <div class="stat"><span>No review this week</span><b>${noReview}</b><span>active projects</span></div>
  </section>
  ${rows.length ? `<div class="tablewrap"><table class="pt">
    <thead><tr><th>Project</th><th>Owner</th><th>Health</th><th>Progress</th><th class="num">On schedule</th><th class="num">Overdue</th><th class="num">Blocked</th><th>Next due</th><th>Last review</th></tr></thead>
    <tbody>${rows.map(p => { const s = stats(p), os = pct(s.dueDone, s.due);
      return `<tr>
        <td class="name"><a href="#/p/${p.id}">${p.code?esc(p.code)+" · ":""}${esc(p.name)}</a><small>${p.status!=="active"?`<span class="pill s-muted">${PSTATUS[p.status]}</span> `:""}${esc(p.goal)}</small></td>
        <td>${esc(name(p.owner_id)) || '<span class="muted">Unassigned</span>'}</td>
        <td><span class="pill h-${p.health}">${HEALTH[p.health]}</span></td>
        <td><div class="prog"><div class="bar"><i style="width:${s.total?s.done/s.total*100:0}%"></i></div><span>${s.done}/${s.total}</span></div></td>
        <td class="num">${os===null?"–":os+"%"}</td>
        <td class="num ${s.late?"bad-txt":""}">${s.late}</td>
        <td class="num ${s.blocked?"bad-txt":""}">${s.blocked}</td>
        <td>${s.next ? `<span class="${isLate(s.next)?"late":""}">${fmt(s.next.due_date)}</span> <span class="muted">${esc(s.next.title)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${s.lastReview ? `Week of ${fmt(s.lastReview.week_of)}` : '<span class="muted">None yet</span>'}${p.status==="active" && !s.reviewedThisWeek ? ' <span class="pill h-amber">Due</span>':""}</td>
      </tr>`; }).join("")}</tbody></table></div>`
  : `<div class="panel"><p class="empty">${S.portfolioMine ? "You're not on any projects yet." : "No projects yet."} <a href="#/new">Create the first one</a>.</p></div>`}`;

  app.querySelectorAll("[data-mine]").forEach(b => b.addEventListener("click", () => {
    S.portfolioMine = b.dataset.mine==="1"; try{localStorage.setItem("mp-mine", S.portfolioMine?"1":"0")}catch(e){} render();
  }));
}

// ── New project / settings form ───────────────────────────────
function projectFields(p = {}){
  return `<div class="grid cols-2">
    <label class="f" for="pName">Project name<input id="pName" required value="${esc(p.name)}" placeholder="e.g. DrayberFlex standby pool"></label>
    <label class="f" for="pCode">Short code<input id="pCode" maxlength="12" value="${esc(p.code)}" placeholder="e.g. DFX"></label>
  </div>
  <label class="f" for="pGoal">Goal (one line)<input id="pGoal" value="${esc(p.goal)}" placeholder="What does done look like?"></label>
  <label class="f" for="pDesc">Description<textarea id="pDesc">${esc(p.description)}</textarea></label>
  <div class="grid cols-4">
    <label class="f" for="pOwner">Owner<select id="pOwner">${peopleOpts(p.owner_id ?? S.me?.id)}</select></label>
    <label class="f" for="pSponsor">Sponsor<select id="pSponsor">${peopleOpts(p.sponsor_id)}</select></label>
    <label class="f" for="pStart">Start<input id="pStart" type="date" value="${esc(p.start_date || iso(monday(today())))}"></label>
    <label class="f" for="pEnd">End<input id="pEnd" type="date" value="${esc(p.end_date || "")}"></label>
  </div>
  <div class="grid cols-4">
    <label class="f" for="pStatus">Status<select id="pStatus">${opts(PSTATUS, p.status || "active")}</select></label>
    <label class="f" for="pHealth">Health<select id="pHealth">${opts(HEALTH, p.health || "green")}</select></label>
  </div>`;
}
function readProject(){
  return { name:$("pName").value.trim(), code:$("pCode").value.trim(), goal:$("pGoal").value.trim(), description:$("pDesc").value.trim(),
    owner_id:$("pOwner").value||null, sponsor_id:$("pSponsor").value||null, start_date:$("pStart").value||null, end_date:$("pEnd").value||null,
    status:$("pStatus").value, health:$("pHealth").value };
}
function renderNew(){
  app.innerHTML = `<div><a href="#/">← Portfolio</a></div><h1>New project</h1>
    <form class="panel" id="newForm">${projectFields()}<div class="row-actions"><button class="btn" type="submit">Create project</button><a class="btn ghost" href="#/">Cancel</a></div></form>`;
  $("newForm").addEventListener("submit", async e => {
    e.preventDefault();
    const row = readProject(); if (!row.name) return;
    const { data, error } = await sb.from("projects").insert(row).select().single();
    if (error) return fail(error, "create the project");
    upsertLocal(S.projects, data); location.hash = `#/p/${data.id}`;
  });
}

// ── Project shell ─────────────────────────────────────────────
function renderProject(id, tab){
  const p = S.projects.find(x => x.id === id);
  if (!p) { app.innerHTML = `<div class="panel"><p class="empty">This project doesn't exist or was deleted. <a href="#/">Back to portfolio</a></p></div>`; return; }
  const s = stats(p), os = pct(s.dueDone, s.due), edit = canEdit(p);
  const tabs = [["tasks","Tasks"],["overview","Overview"],["reviews","Weekly review"],["settings","Settings"]];
  app.innerHTML = `
    <div><a href="#/">← Portfolio</a></div>
    <div class="head">
      <div style="display:grid;gap:6px;min-width:0">
        <span class="eyebrow">${p.code?esc(p.code)+" · ":""}${PSTATUS[p.status]} · ${fmt(p.start_date)} – ${fmt(p.end_date)}</span>
        <h1>${esc(p.name)}</h1>
        ${p.goal?`<p class="muted" style="margin:0">${esc(p.goal)}</p>`:""}
        <div class="meta"><span>Owner: <b>${esc(name(p.owner_id)) || "Unassigned"}</b></span>${p.sponsor_id?`<span>Sponsor: <b>${esc(name(p.sponsor_id))}</b></span>`:""}${edit?"":'<span class="pill s-muted">View only</span>'}</div>
      </div>
      <span class="pill h-${p.health}" style="font-size:14px;padding:4px 12px">${HEALTH[p.health]}</span>
    </div>
    <section class="stats" aria-label="Project summary">
      <div class="stat ok"><span>Done</span><b>${s.done}/${s.total}</b><div class="bar"><i style="width:${s.total?s.done/s.total*100:0}%"></i></div></div>
      <div class="stat"><span>On schedule</span><b>${os===null?"–":os+"%"}</b></div>
      <div class="stat bad"><span>Overdue</span><b>${s.late}</b></div>
      <div class="stat bad"><span>Blocked</span><b>${s.blocked}</b></div>
      <div class="stat"><span>Last review</span><b style="font-size:18px">${s.lastReview?fmt(s.lastReview.week_of):"None"}</b></div>
    </section>
    <nav class="tabs" aria-label="Project">${tabs.map(([k,v])=>`<a href="#/p/${p.id}/${k}" aria-current="${k===tab?"page":"false"}">${v}</a>`).join("")}</nav>
    <div id="tabBody"></div>`;
  const body = $("tabBody");
  if (tab === "overview") return renderOverview(p, body);
  if (tab === "reviews") return renderReviews(p, body, edit);
  if (tab === "settings") return renderSettings(p, body);
  return renderTasks(p, body, edit);
}

// ── Tasks ─────────────────────────────────────────────────────
function projStart(p){ const ts = projTasks(p.id); const first = p.start_date || (ts[0] && ts.map(t=>t.due_date).sort()[0]) || iso(today()); return monday(parse(first)); }
const weekNo = (p, due) => Math.floor((parse(due) - projStart(p)) / (7*DAY)) + 1;
function weekLabel(p, w){ const a = new Date(projStart(p)); a.setDate(a.getDate()+(w-1)*7); const b = new Date(a); b.setDate(b.getDate()+4); return `${fmt(a)} – ${fmt(b)}`; }

function renderTasks(p, body, edit){
  const all = projTasks(p.id);
  const streams = [...new Set(all.map(t=>t.workstream).filter(Boolean))].sort();
  if (S.taskFilter!=="all" && !streams.includes(S.taskFilter)) S.taskFilter = "all";
  const shown = all.filter(t => (S.taskFilter==="all" || t.workstream===S.taskFilter) && (!S.hideDone || !isDone(t)))
                   .sort((a,b)=>a.due_date.localeCompare(b.due_date) || a.sort-b.sort);
  const byW = {}; shown.forEach(t => { const w = weekNo(p, t.due_date); (byW[w]=byW[w]||[]).push(t); });
  const curW = Math.floor((today() - projStart(p)) / (7*DAY)) + 1;

  body.innerHTML = `<div style="display:grid;gap:20px">
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Filter by workstream">
        <button type="button" data-f="all" aria-pressed="${S.taskFilter==="all"}">All</button>
        ${streams.map(w=>`<button type="button" data-f="${esc(w)}" aria-pressed="${S.taskFilter===w}">${esc(w)}</button>`).join("")}
      </div>
      <label style="display:inline-flex;gap:6px;align-items:center;font-size:14px;color:var(--muted)"><input type="checkbox" id="hideDone" style="width:auto" ${S.hideDone?"checked":""}> Hide done</label>
    </div>
    ${shown.length ? Object.keys(byW).map(Number).sort((a,b)=>a-b).map(w => { const l = byW[w];
      return `<section class="week"><div class="week-head"><h2>${w<1?"Before start":"Week "+w}</h2><span class="muted" style="font-size:13px">${weekLabel(p,w)}</span>${w===curW?'<span class="now">This week</span>':""}<span class="count">${l.filter(isDone).length}/${l.length} done</span></div>
        <div class="list">${l.map(t=>taskRow(t, edit)).join("")}</div></section>`; }).join("")
      : `<div class="list"><p class="empty">${all.length ? "Nothing matches this filter." : "No tasks yet." + (edit ? " Add the first one below." : "")}</p></div>`}
    ${edit ? `<form class="panel" id="addTask">
      <h3>Add a task</h3>
      <div class="grid cols-3">
        <label class="f" for="tTitle" style="grid-column:1/-1">Task<input id="tTitle" required placeholder="What needs to happen?"></label>
        <label class="f" for="tStream">Workstream<input id="tStream" list="streamList" value="${esc(S.taskFilter!=="all"?S.taskFilter:"")}"><datalist id="streamList">${streams.map(w=>`<option value="${esc(w)}">`).join("")}</datalist></label>
        <label class="f" for="tAssignee">Assignee<select id="tAssignee">${peopleOpts(null, "— Nobody —")}</select></label>
        <label class="f" for="tPartner">Working with<input id="tPartner" placeholder="e.g. Jing, Daryl"></label>
        <label class="f" for="tDue">Due<input id="tDue" type="date" required value="${iso(today())}"></label>
        <label class="f" for="tKind">Type<select id="tKind">${opts(KIND,"task")}</select></label>
      </div>
      <div><button class="btn" type="submit">Add task</button></div>
    </form>` : ""}
  </div>`;

  body.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => { S.taskFilter = b.dataset.f; render(); }));
  $("hideDone").addEventListener("change", e => { S.hideDone = e.target.checked; try{localStorage.setItem("mp-hideDone", S.hideDone?"1":"0")}catch(_){} render(); });
  body.addEventListener("click", e => taskClick(e, p));
  body.addEventListener("change", e => { if (e.target.dataset.act==="status") saveTask(e.target.closest(".task").dataset.id, {status:e.target.value}); });
  const f = $("addTask");
  if (f) f.addEventListener("submit", async e => {
    e.preventDefault();
    const row = { project_id:p.id, title:$("tTitle").value.trim(), workstream:$("tStream").value.trim(), partner:$("tPartner").value.trim(),
                  assignee_id:$("tAssignee").value||null, due_date:$("tDue").value, kind:$("tKind").value, sort:all.length+1 };
    if (!row.title || !row.due_date) return;
    const { data, error } = await sb.from("tasks").insert(row).select().single();
    if (error) return fail(error, "add the task");
    upsertLocal(S.tasks, data); toast("Task added"); render();
  });
}
function taskRow(t, edit){
  const open = S.expanded.has(t.id), late = isLate(t);
  const kind = t.kind!=="task" ? `<span class="kind ${t.kind}">${KIND[t.kind]}</span>` : "";
  return `<div class="task ${isDone(t)?"done":""}" data-id="${t.id}">
    <div class="trow">
      <button type="button" class="check" data-act="toggle" aria-pressed="${isDone(t)}" ${edit?"":"disabled"} aria-label="Mark done: ${esc(t.title)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button>
      <div class="tmain">
        <button type="button" class="ttitle" data-act="expand" aria-expanded="${open}">${esc(t.title)}</button>
        <div class="meta">${kind}${t.workstream?`<b>${esc(t.workstream)}</b>`:""}${t.assignee_id?`<span>${esc(name(t.assignee_id))}</span>`:""}${t.partner?`<span>With ${esc(t.partner)}</span>`:""}<span class="${late?"late":""}">${late?"Overdue · ":"Due "}${fmt(t.due_date)}</span>${t.note?"<span>· Notes</span>":""}</div>
      </div>
      <select class="status" data-act="status" data-s="${t.status}" aria-label="Status" ${edit?"":"disabled"}>${opts(STATUS, t.status)}</select>
    </div>
    ${open ? `<div class="detail">
      <label class="f" for="n-${t.id}">Notes<textarea id="n-${t.id}" ${edit?"":"readonly"} placeholder="Progress, blockers, numbers">${esc(t.note)}</textarea></label>
      ${edit ? `<div class="grid cols-3">
        <label class="f" for="d-${t.id}">Due<input id="d-${t.id}" type="date" value="${t.due_date}"></label>
        <label class="f" for="a-${t.id}">Assignee<select id="a-${t.id}">${peopleOpts(t.assignee_id, "— Nobody —")}</select></label>
        <label class="f" for="w-${t.id}">Working with<input id="w-${t.id}" value="${esc(t.partner)}"></label>
      </div>
      <div class="row-actions"><button type="button" class="btn ghost" data-act="save">Save</button><button type="button" class="btn danger" data-act="delete">Delete task</button>
      <span class="muted" style="font-size:13px">Updated ${new Date(t.updated_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}${t.done_at?` · Done ${fmt(new Date(t.done_at))}`:""}</span></div>` : ""}
    </div>` : ""}
  </div>`;
}
async function saveTask(id, patch){
  const t = S.tasks.find(x=>x.id===id); if (!t) return;
  const before = {...t}; Object.assign(t, patch); render();
  const { data, error } = await sb.from("tasks").update(patch).eq("id", id).select().single();
  if (error) { Object.assign(t, before); render(); return fail(error, "save the task"); }
  upsertLocal(S.tasks, data); render();
}
async function taskClick(e, p){
  const el = e.target.closest("[data-act]"); if (!el || el.tagName==="SELECT") return;
  const row = el.closest(".task"); if (!row) return;
  const id = row.dataset.id, t = S.tasks.find(x=>x.id===id), act = el.dataset.act;
  if (act==="toggle") saveTask(id, {status: isDone(t) ? "todo" : "done"});
  if (act==="expand") { S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); render(); }
  if (act==="save") saveTask(id, { note:$("n-"+id).value, due_date:$("d-"+id).value || t.due_date, assignee_id:$("a-"+id).value||null, partner:$("w-"+id).value.trim() });
  if (act==="delete") {
    if (el.dataset.confirm!=="1") { el.dataset.confirm="1"; el.textContent="Click again to delete"; return; }
    const { error } = await sb.from("tasks").delete().eq("id", id);
    if (error) return fail(error, "delete the task");
    S.tasks = S.tasks.filter(x=>x.id!==id); S.expanded.delete(id); toast("Task deleted"); render();
  }
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview(p, body){
  const ts = projTasks(p.id), t0 = today();
  body.innerHTML = `<div style="display:grid;gap:18px">
    <section class="panel chart"><h2>Planned vs done</h2><p class="sub">Tasks due by each date against tasks completed</p>
      <div class="legend"><span><i style="background:var(--muted)"></i>Planned</span><span><i style="background:var(--green)"></i>Done</span></div><div id="burn"></div></section>
    <div class="two">
      <section class="panel"><h2>By workstream</h2><div class="legend"><span><i class="seg-done"></i>Done</span><span><i class="seg-doing"></i>In progress</span><span><i class="seg-blocked"></i>Blocked</span></div><div id="byStream" style="display:grid;gap:10px"></div></section>
      <section class="panel"><h2>By week</h2><div id="byWeek" style="display:grid;gap:10px"></div></section>
    </div>
    <div class="two">
      <section class="panel"><h2>Needs attention</h2><div id="attention" class="att"></div></section>
      <section class="panel"><h2>Open tasks by person</h2><div style="overflow-x:auto"><table class="mini"><thead><tr><th>Person</th><th>Open</th><th>Overdue</th></tr></thead><tbody id="byWho"></tbody></table></div></section>
    </div></div>`;
  if (!ts.length) { $("burn").innerHTML = '<p class="empty">No tasks yet.</p>'; }
  else drawBurn(p, ts);

  const seg = l => { const n=l.length||1, c=s=>l.filter(t=>t.status===s).length;
    return `<div class="stack"><span class="seg-done" style="width:${c("done")/n*100}%"></span><span class="seg-doing" style="width:${c("doing")/n*100}%"></span><span class="seg-blocked" style="width:${c("blocked")/n*100}%"></span></div>`; };
  const groups = (keyFn) => { const g = {}; ts.forEach(t => { const k = keyFn(t); (g[k]=g[k]||[]).push(t); }); return g; };
  const gs = groups(t => t.workstream || "Other");
  $("byStream").innerHTML = Object.keys(gs).sort().map(k => `<div class="srow"><span class="lbl" title="${esc(k)}">${esc(k)}</span>${seg(gs[k])}<span class="num muted">${gs[k].filter(isDone).length}/${gs[k].length}</span></div>`).join("") || '<p class="sub">No tasks yet.</p>';
  const gw = groups(t => weekNo(p, t.due_date)), curW = Math.floor((t0 - projStart(p)) / (7*DAY)) + 1;
  $("byWeek").innerHTML = Object.keys(gw).map(Number).sort((a,b)=>a-b).map(w => `<div class="srow"><span class="lbl" ${w===curW?'style="font-weight:700;color:var(--navy)"':""}>${w<1?"Before":"W"+w} · ${weekLabel(p,w).split(" – ")[0]}</span>${seg(gw[w])}<span class="num muted">${gw[w].filter(isDone).length}/${gw[w].length}</span></div>`).join("") || '<p class="sub">No tasks yet.</p>';

  const att = ts.filter(t => isLate(t) || t.status==="blocked").sort((a,b)=>a.due_date.localeCompare(b.due_date));
  $("attention").innerHTML = att.length ? att.map(t => `<a href="#/p/${p.id}/tasks" data-open="${t.id}"><span><b>${esc(t.title)}</b><small>${esc(t.workstream)}${t.partner?" · "+esc(t.partner):""} · due ${fmt(t.due_date)}</small></span><span class="pill h-red">${t.status==="blocked"?"Blocked":"Overdue"}</span></a>`).join("") : '<p class="sub">Nothing overdue or blocked.</p>';
  $("attention").addEventListener("click", e => { const a = e.target.closest("[data-open]"); if (a) S.pendingOpen = a.dataset.open; });

  const who = {};
  ts.filter(t=>!isDone(t)).forEach(t => {
    const names = [t.assignee_id ? name(t.assignee_id) : "", ...t.partner.split(",")].map(s=>s.trim()).filter(Boolean);
    (names.length ? names : ["Unassigned"]).forEach(n => { who[n]=who[n]||{o:0,l:0}; who[n].o++; if (isLate(t)) who[n].l++; });
  });
  const rows = Object.entries(who).sort((a,b)=>b[1].l-a[1].l || b[1].o-a[1].o);
  $("byWho").innerHTML = rows.length ? rows.map(([n,v]) => `<tr><td>${esc(n)}</td><td>${v.o}</td><td class="${v.l?"bad-txt":""}">${v.l}</td></tr>`).join("") : '<tr><td colspan="3">No open tasks.</td></tr>';
}
function drawBurn(p, ts){
  const host = $("burn"), W = Math.max(300, host.clientWidth || 700), H = 230, L = 34, R = 14, T = 12, B = 28;
  const start = projStart(p), dues = ts.map(t=>parse(t.due_date));
  const end = p.end_date ? parse(p.end_date) : new Date(Math.max(...dues));
  const days = Math.max(7, Math.round((end - start)/DAY)), x = d => L + (d/days)*(W-L-R);
  const maxY = Math.max(1, ts.length), y = v => T + (1 - v/maxY)*(H-T-B);
  const cum = (dates, upto) => { const s = dates.map(d=>Math.round((d-start)/DAY)).sort((a,b)=>a-b); const pts=[]; let c=0,i=0;
    for (let d=0; d<=upto; d++){ while(i<s.length && s[i]<=d){c++;i++;} pts.push([d,c]); } return pts; };
  const t0 = today(), todayD = Math.min(days, Math.max(0, Math.round((t0-start)/DAY)));
  const plan = cum(dues, days), act = cum(ts.filter(isDone).map(t => t.done_at ? new Date(t.done_at) : parse(t.due_date)), todayD);
  const path = pts => pts.map((q,i)=>(i?"L":"M")+x(q[0]).toFixed(1)+" "+y(q[1]).toFixed(1)).join("");
  const step = Math.max(1, Math.ceil(maxY/5));
  let g = ""; for (let v=0; v<=maxY; v+=step) g += `<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}</text>`;
  const weeks = Math.ceil(days/7); let xl = ""; const every = Math.ceil(weeks/10);
  for (let w=0; w<=weeks; w+=every) xl += `<text x="${x(Math.min(w*7,days))}" y="${H-8}" text-anchor="middle">W${w+1}</text>`;
  const last = act[act.length-1] || [0,0];
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Planned versus done: ${plan[todayD]?.[1] ?? 0} planned by today, ${last[1]} done">${g}${xl}
    ${t0>=start ? `<line x1="${x(todayD)}" x2="${x(todayD)}" y1="${T}" y2="${H-B}" stroke="var(--yellow)" stroke-width="2" stroke-dasharray="4 3"/><text x="${x(todayD)+4}" y="${T+10}">Today</text>` : ""}
    <path d="${path(plan)}" fill="none" stroke="var(--muted)" stroke-width="2"/><path d="${path(act)}" fill="none" stroke="var(--green)" stroke-width="3"/>
    <circle cx="${x(last[0])}" cy="${y(last[1])}" r="4.5" fill="var(--green)"/><text x="${Math.min(x(last[0])+8, W-R-60)}" y="${y(last[1])-8}" style="fill:var(--green);font-weight:700">${last[1]} done</text></svg>`;
}

// ── Weekly review ─────────────────────────────────────────────
function renderReviews(p, body, edit){
  const thisMon = iso(monday(today()));
  const week = S.reviewWeek || thisMon;
  const r = S.reviews.find(x => x.project_id===p.id && x.week_of===week) || {};
  const ts = projTasks(p.id), wStart = parse(week), wEnd = new Date(wStart.getTime()+7*DAY);
  const doneWk = ts.filter(t => t.done_at && new Date(t.done_at) >= wStart && new Date(t.done_at) < wEnd).length;
  const dueWk = ts.filter(t => parse(t.due_date) >= wStart && parse(t.due_date) < wEnd);
  const weeksOpts = []; for (let i=0;i<8;i++){ const d=new Date(monday(today())); d.setDate(d.getDate()-7*i); weeksOpts.push(iso(d)); }
  if (!weeksOpts.includes(week)) weeksOpts.push(week);
  const history = projReviews(p.id);
  const field = (id, label, val, ph) => `<label class="f" for="${id}">${label}<textarea id="${id}" ${edit?"":"readonly"} placeholder="${ph}">${esc(val)}</textarea></label>`;

  body.innerHTML = `<div style="display:grid;gap:18px">
    <form class="panel" id="revForm">
      <div class="head"><h2>Week of ${fmt(week)}</h2>
        <label class="f" for="rWeek" style="width:auto">Week<select id="rWeek" style="width:auto">${weeksOpts.map(w=>`<option value="${w}" ${w===week?"selected":""}>Week of ${fmt(w)}${w===thisMon?" (this week)":""}</option>`).join("")}</select></label></div>
      <p class="sub">This week: ${doneWk} tasks done · ${dueWk.filter(isDone).length}/${dueWk.length} due this week done · ${ts.filter(isLate).length} overdue · ${ts.filter(t=>t.status==="blocked").length} blocked</p>
      <label class="f" for="rHealth" style="max-width:220px">Health<select id="rHealth" ${edit?"":"disabled"}>${opts(HEALTH, r.health || p.health)}</select></label>
      ${field("rSummary","Summary",r.summary,"Where the project stands in two or three lines")}
      <div class="grid cols-2">${field("rWins","Wins",r.wins,"What moved forward")}${field("rIssues","Issues and risks",r.issues,"What is stuck, and what help is needed")}</div>
      <div class="grid cols-2">${field("rDecisions","Decisions",r.decisions,"What was decided, and by whom")}${field("rNext","Next week",r.next_steps,"The few things that must happen next")}</div>
      ${edit ? `<div class="row-actions"><button class="btn" type="submit">${r.id?"Update review":"Save review"}</button>${r.updated_at?`<span class="muted" style="font-size:13px">Saved by ${esc(name(r.author_id))} · ${new Date(r.updated_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>`:""}</div>` : ""}
    </form>
    <section style="display:grid;gap:10px"><h2>Past reviews</h2>
      ${history.length ? history.map(h => `<details class="rev"><summary>Week of ${fmt(h.week_of)} <span class="pill h-${h.health}">${HEALTH[h.health]}</span> <span class="muted" style="font-weight:400">${esc(name(h.author_id))}</span></summary>
        <dl>${[["Summary",h.summary],["Wins",h.wins],["Issues and risks",h.issues],["Decisions",h.decisions],["Next week",h.next_steps]].filter(([,v])=>v).map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></details>`).join("")
        : '<p class="muted">No reviews yet.</p>'}
    </section></div>`;

  $("rWeek").addEventListener("change", e => { S.reviewWeek = e.target.value; render(); });
  $("revForm").addEventListener("submit", async e => {
    e.preventDefault();
    const row = { project_id:p.id, week_of:week, health:$("rHealth").value, summary:$("rSummary").value.trim(), wins:$("rWins").value.trim(),
                  issues:$("rIssues").value.trim(), decisions:$("rDecisions").value.trim(), next_steps:$("rNext").value.trim(), author_id:S.me?.id };
    const { data, error } = await sb.from("reviews").upsert(row, { onConflict:"project_id,week_of" }).select().single();
    if (error) return fail(error, "save the review");
    upsertLocal(S.reviews, data);
    if (week >= (projReviews(p.id)[0]?.week_of || "")) p.health = data.health;
    toast("Review saved"); render();
  });
}

// ── Settings ──────────────────────────────────────────────────
function renderSettings(p, body){
  const manage = canManage(p);
  const mem = S.members.filter(m => m.project_id === p.id);
  body.innerHTML = `<div style="display:grid;gap:18px">
    <form class="panel" id="setForm"><h2>Project details</h2>${projectFields(p)}
      ${manage ? `<div class="row-actions"><button class="btn" type="submit">Save changes</button></div>` : `<p class="sub">Only the owner, sponsor or an admin can change these.</p>`}</form>
    <section class="panel"><h2>Team</h2><p class="sub">Editors can update tasks and write reviews. Everyone at Mober can view.</p>
      <table class="mini"><thead><tr><th>Person</th><th>Access</th></tr></thead><tbody>
        ${[[p.owner_id,"Owner"],[p.sponsor_id,"Sponsor"]].filter(([id])=>id).map(([id,r])=>`<tr><td>${esc(name(id))}</td><td>${r}</td></tr>`).join("")}
        ${mem.map(m => `<tr><td>${esc(name(m.profile_id))}</td><td>${manage ? `<select data-mrole="${m.profile_id}" style="width:auto">${opts({editor:"Editor",viewer:"Viewer"}, m.role)}</select> <button type="button" class="linkbtn" data-mdel="${m.profile_id}">Remove</button>` : (m.role==="editor"?"Editor":"Viewer")}</td></tr>`).join("")}
      </tbody></table>
      ${manage ? `<form class="row-actions" id="memForm"><select id="mPerson" style="max-width:260px" aria-label="Person">${peopleOpts(null, "Add a person…")}</select><select id="mRole" style="width:auto" aria-label="Access">${opts({editor:"Editor",viewer:"Viewer"},"editor")}</select><button class="btn ghost" type="submit">Add</button></form>` : ""}
    </section>
    ${S.me?.role==="admin" ? `<section class="panel"><h2>Delete project</h2><p class="sub">Removes the project with all its tasks and reviews. This can't be undone.</p><div><button type="button" class="btn danger" id="delProj">Delete project</button></div></section>` : ""}
  </div>`;
  if (!manage) body.querySelectorAll("#setForm input, #setForm select, #setForm textarea").forEach(el => el.disabled = true);

  $("setForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!manage) return;
    const row = readProject(); if (!row.name) return;
    const { data, error } = await sb.from("projects").update(row).eq("id", p.id).select().single();
    if (error) return fail(error, "save the project");
    upsertLocal(S.projects, data); toast("Project saved"); render();
  });
  const mf = $("memForm");
  if (mf) mf.addEventListener("submit", async e => {
    e.preventDefault(); const pid = $("mPerson").value; if (!pid) return;
    const row = { project_id:p.id, profile_id:pid, role:$("mRole").value };
    const { error } = await sb.from("project_members").upsert(row);
    if (error) return fail(error, "add the person");
    S.members = S.members.filter(m => !(m.project_id===p.id && m.profile_id===pid)).concat(row); render();
  });
  body.querySelectorAll("[data-mrole]").forEach(s => s.addEventListener("change", async () => {
    const { error } = await sb.from("project_members").update({ role:s.value }).match({ project_id:p.id, profile_id:s.dataset.mrole });
    if (error) return fail(error, "change access");
    const m = S.members.find(m => m.project_id===p.id && m.profile_id===s.dataset.mrole); if (m) m.role = s.value; toast("Access updated");
  }));
  body.querySelectorAll("[data-mdel]").forEach(b => b.addEventListener("click", async () => {
    const { error } = await sb.from("project_members").delete().match({ project_id:p.id, profile_id:b.dataset.mdel });
    if (error) return fail(error, "remove the person");
    S.members = S.members.filter(m => !(m.project_id===p.id && m.profile_id===b.dataset.mdel)); render();
  }));
  const del = $("delProj");
  if (del) del.addEventListener("click", async () => {
    if (del.dataset.confirm!=="1") { del.dataset.confirm="1"; del.textContent="Click again to delete for good"; return; }
    const { error } = await sb.from("projects").delete().eq("id", p.id);
    if (error) return fail(error, "delete the project");
    S.projects = S.projects.filter(x=>x.id!==p.id); S.tasks = S.tasks.filter(t=>t.project_id!==p.id); location.hash = "#/";
  });
}

// ── People ────────────────────────────────────────────────────
function renderPeople(){
  const admin = S.me?.role === "admin";
  const list = S.profiles.slice().sort((a,b)=>(a.full_name||a.email).localeCompare(b.full_name||b.email));
  app.innerHTML = `<div class="head"><div><span class="eyebrow">Team</span><h1>People</h1></div></div>
    <form class="panel" id="meForm"><h2>Your profile</h2>
      <div class="grid cols-2"><label class="f" for="meFull">Name<input id="meFull" value="${esc(S.me?.full_name)}"></label><label class="f" for="meTitle">Title<input id="meTitle" value="${esc(S.me?.title)}" placeholder="e.g. Head of Operations Readiness"></label></div>
      <div><button class="btn" type="submit">Save</button></div></form>
    <section class="panel"><h2>Everyone who has signed in</h2><p class="sub">People appear here after their first sign-in. ${admin?"Admins can change roles.":""}</p>
      <div style="overflow-x:auto"><table class="mini"><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>
      ${list.map(p => `<tr><td><b>${esc(p.full_name || p.email)}</b><br><span class="muted" style="font-size:13px">${esc(p.title ? p.title+" · " : "")}${esc(p.email)}</span></td>
        <td>${admin && p.id!==S.me.id ? `<select data-prole="${p.id}" style="width:auto">${opts({member:"Member",admin:"Admin"}, p.role)}</select>` : (p.role==="admin"?"Admin":"Member")}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  $("meForm").addEventListener("submit", async e => {
    e.preventDefault();
    const patch = { full_name:$("meFull").value.trim(), title:$("meTitle").value.trim() };
    const { data, error } = await sb.from("profiles").update(patch).eq("id", S.me.id).select().single();
    if (error) return fail(error, "save your profile");
    upsertLocal(S.profiles, data); S.me = data; toast("Profile saved"); render();
  });
  app.querySelectorAll("[data-prole]").forEach(s => s.addEventListener("change", async () => {
    const { data, error } = await sb.from("profiles").update({ role:s.value }).eq("id", s.dataset.prole).select().single();
    if (error) return fail(error, "change the role");
    upsertLocal(S.profiles, data); toast("Role updated");
  }));
}

// ── Boot ──────────────────────────────────────────────────────
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (route().tab==="overview") render(); }, 200); });

async function start(session){
  S.session = session;
  if (!session) { S.loaded = false; return renderLogin(); }
  $("topbar").hidden = false;
  try { await loadAll(); }
  catch (e) { app.innerHTML = `<div class="panel"><p class="empty">Couldn't load projects: ${esc(e.message)}. Check config.js and that schema.sql has been run.</p></div>`; return; }
  if (!S.me) { app.innerHTML = `<div class="panel"><p class="empty">Your account has no profile yet. Ask an admin to check that schema.sql was run before you signed in.</p></div>`; return; }
  subscribe(); render();
}
if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  app.innerHTML = `<div class="panel"><h2>Almost there</h2><p>Add your Supabase URL and anon key to <code>config.js</code>. See README.md, step 3.</p></div>`;
} else {
  let started = false;
  sb.auth.onAuthStateChange((_evt, session) => {
    const changed = (session?.user?.id || null) !== (S.session?.user?.id || null);
    if (!started || changed) { started = true; start(session); }
  });
}
})();
