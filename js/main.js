(() => {
  const $ = (sel) => document.querySelector(sel);

  const API_URL = "https://script.google.com/macros/s/AKfycbzOYpBhtwhDzV_Yph3mjAoybsrNY71wd1beVUBCDv0Ezy7I6AHZNyO1akedpOYurp3jvQ/exec";

  const state = {
    lang: "ru",
    grade: 11,
    version: window.CFE?.TEST_VERSION || "cfe_full_unknown",
    answers: {},
    cr: {},
    cases: ["", "", ""],
    computed: null,
    full_prompt: "",
    short_prompt: "",
    session_id: null,

    catalog: null,
    catalog_loaded: false,
    catalog_error: null,
    catalog_warnings: [],
    show_scoring_details: false
  };

  const screens = ["start", "test", "cr", "cases", "result"];
  function showScreen(name) {
    for (const s of screens) {
      const el = $(`#screen-${s}`);
      if (!el) continue;
      el.classList.toggle("is-active", s === name);
    }
  }

  const LS_KEY = "cfe_full_state_v1";
  const CATALOG_CACHE_KEY = "cfe_catalog_cache_v2";
  const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

  function autosave_() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        lang: state.lang,
        grade: state.grade,
        version: state.version,
        answers: state.answers,
        cr: state.cr,
        cases: state.cases,
        session_id: state.session_id
      }));
    } catch (_) {}
  }

  function autoload_() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s !== "object") return;
      state.lang = s.lang || state.lang;
      state.grade = s.grade || state.grade;
      state.version = s.version || state.version;
      state.answers = s.answers || state.answers;
      state.cr = s.cr || state.cr;
      state.cases = s.cases || state.cases;
      state.session_id = s.session_id || state.session_id;
    } catch (_) {}
  }
  autoload_();

  $("#btn-lang-ru")?.addEventListener("click", () => { state.lang = "ru"; autosave_(); });
  $("#btn-lang-kg")?.addEventListener("click", () => { state.lang = "kg"; autosave_(); });
  $("#btn-grade-9")?.addEventListener("click", () => { state.grade = 9; autosave_(); });
  $("#btn-grade-11")?.addEventListener("click", () => { state.grade = 11; autosave_(); });

  $("#btn-start")?.addEventListener("click", () => {
    renderTest();
    showScreen("test");
  });

  function renderTest() {
    const qs = window.CFE?.QUESTIONS || [];
    const container = $("#test-container");
    if (!container) return;
    container.innerHTML = "";
    updateProgress_(qs);

    for (const q of qs) {
      const wrap = document.createElement("div");
      wrap.className = "card mt";

      const title = document.createElement("div");
      title.innerHTML = `<b>${q.id}.</b> ${state.lang === "kg" ? q.text_kg : q.text_ru}`;
      wrap.appendChild(title);

      const row = document.createElement("div");
      row.className = "row mt";

      for (let v = 1; v <= 5; v++) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.type = "button";
        btn.textContent = String(v);
        if (state.answers[q.id] === v) btn.classList.add("btn-primary");

        btn.addEventListener("click", () => {
          state.answers[q.id] = v;
          [...row.querySelectorAll("button")].forEach(b => b.classList.remove("btn-primary"));
          btn.classList.add("btn-primary");
          updateProgress_(qs);
          autosave_();
        });

        row.appendChild(btn);
      }

      wrap.appendChild(row);
      container.appendChild(wrap);
    }
  }

  function updateProgress_(qs) {
    const answered = Object.keys(state.answers || {}).length;
    $("#test-progress") && ($("#test-progress").textContent = `Ответов: ${answered}/${qs.length}`);
  }

  $("#btn-test-next")?.addEventListener("click", () => { renderCR(); showScreen("cr"); });
  $("#btn-cr-next")?.addEventListener("click", () => { renderCases(); showScreen("cases"); });

  $("#btn-cases-finish")?.addEventListener("click", async () => {
    computeDeterministic_();
    renderResult();
    showScreen("result");

    await ensureCatalogLoaded_();
    computeCatalogTopIntoComputed_();
    rebuildPrompts_();
    renderResult();
  });

  function injectInputStyle_() {
    if (document.getElementById("cfe-input-style")) return;
    const st = document.createElement("style");
    st.id = "cfe-input-style";
    st.textContent = `
      .input { width: 100%; border-radius: 12px; padding: 10px; border: 1px solid #2f3442; background: #0f1117; color: #e8e8e8; }
      .grid { display:grid; grid-template-columns: 1fr; gap: 10px; }
      @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; } }
      .kv { display:flex; justify-content: space-between; gap: 10px; padding: 10px; border: 1px solid #262a35; border-radius: 12px; background:#111521; }
      .kv b { font-weight: 700; }
      .pill { display:inline-flex; align-items:center; gap:8px; border:1px solid #2f3442; background:#0f1117; border-radius:999px; padding:8px 12px; }
      .pill b { font-weight:700; }
      .mini { font-size: 14px; opacity: 0.85; }
      .stack { display:flex; flex-direction:column; gap:8px; }
      textarea { width: 100%; border-radius: 12px; padding: 10px; border: 1px solid #2f3442; background: #0f1117; color: #e8e8e8; }
      .warn { border:1px solid #534200; background:#1b1600; padding:10px; border-radius:12px; }
      .ok { border:1px solid #114d2b; background:#071b10; padding:10px; border-radius:12px; }
      .muted { opacity:0.8; }
      .rowgap { display:flex; gap:10px; flex-wrap:wrap; }
    `;
    document.head.appendChild(st);
  }

  function renderCR() {
    const el = $("#cr-container");
    if (!el) return;
    injectInputStyle_();
    el.innerHTML = `
      <div class="card">
        <label>Имя</label>
        <input id="cr-name" class="input" type="text" />
        <label class="mt">Пол (М / Ж)</label>
        <div class="rowgap mt">
          <button id="cr-g-m" class="btn" type="button">М</button>
          <button id="cr-g-f" class="btn" type="button">Ж</button>
        </div>
        <label class="mt">Город/село</label>
        <input id="cr-city" class="input" type="text" />
      </div>
    `;
    const nameEl = $("#cr-name"), cityEl = $("#cr-city");
    if (nameEl) nameEl.value = state.cr?.name || "";
    if (cityEl) cityEl.value = state.cr?.city || "";

    nameEl?.addEventListener("input", () => { state.cr.name = nameEl.value.trim(); autosave_(); });
    cityEl?.addEventListener("input", () => { state.cr.city = cityEl.value.trim(); autosave_(); });

    const gm = $("#cr-g-m"), gf = $("#cr-g-f");
    const mark = () => {
      gm?.classList.toggle("btn-primary", state.cr.gender === "М");
      gf?.classList.toggle("btn-primary", state.cr.gender === "Ж");
    };
    gm?.addEventListener("click", () => { state.cr.gender = "М"; mark(); autosave_(); });
    gf?.addEventListener("click", () => { state.cr.gender = "Ж"; mark(); autosave_(); });
    mark();
  }

  function renderCases() {
    const el = $("#cases-container");
    if (!el) return;
    injectInputStyle_();
    el.innerHTML = `
      <div class="card">
        <label>Кейс 1</label><textarea id="case-1" rows="5"></textarea>
        <label class="mt">Кейс 2</label><textarea id="case-2" rows="5"></textarea>
        <label class="mt">Кейс 3</label><textarea id="case-3" rows="5"></textarea>
      </div>
    `;
    const c1=$("#case-1"), c2=$("#case-2"), c3=$("#case-3");
    if (c1) c1.value = state.cases[0] || "";
    if (c2) c2.value = state.cases[1] || "";
    if (c3) c3.value = state.cases[2] || "";

    c1?.addEventListener("input",()=>{ state.cases[0]=c1.value; autosave_(); });
    c2?.addEventListener("input",()=>{ state.cases[1]=c2.value; autosave_(); });
    c3?.addEventListener("input",()=>{ state.cases[2]=c3.value; autosave_(); });
  }

  const clamp_ = (v,a,b)=>Math.max(a,Math.min(b,v));
  const parseJSON_ = (s)=>{ try { return JSON.parse(s); } catch(_) { return null; } };

  function normalizeTo100_(avg1to5) {
    const x = Number(avg1to5);
    if (!Number.isFinite(x)) return 0;
    return clamp_(Math.round(((x-1)/4)*100),0,100);
  }

  function scoreAnswer_(v, rev) {
    const n = Number(v);
    if (!Number.isFinite(n) || n<1 || n>5) return null;
    return rev ? (6-n) : n;
  }

  function computeBlocks_(answers) {
    const qs = window.CFE?.QUESTIONS || [];
    const sums={}, counts={};
    for (const b of (window.CFE?.BLOCKS||[])) { sums[b]=0; counts[b]=0; }
    for (const q of qs) {
      const scored = scoreAnswer_(answers[q.id], !!q.rev);
      if (scored==null) continue;
      if (!sums.hasOwnProperty(q.block)) continue;
      sums[q.block]+=scored; counts[q.block]+=1;
    }
    const blocks100={}, blocksAvg={};
    for (const b of Object.keys(sums)) {
      const c = counts[b];
      const avg = c>0 ? (sums[b]/c) : 0;
      blocksAvg[b]=avg;
      blocks100[b]=c>0 ? normalizeTo100_(avg) : 0;
    }
    return { blocks100, blocksAvg, counts };
  }

  function computeRoles_(answers) {
    const qs = window.CFE?.QUESTIONS || [];
    const roleSums={}, roleCounts={};
    for (const r of (window.CFE?.ROLES||[])) { roleSums[r.key]=0; roleCounts[r.key]=0; }

    for (const q of qs) {
      if (q.block!=="RP" || !q.role) continue;
      const scored = scoreAnswer_(answers[q.id], !!q.rev);
      if (scored==null) continue;
      roleSums[q.role]+=scored; roleCounts[q.role]+=1;
    }

    const roles100={}, rolesAvg={};
    for (const k of Object.keys(roleSums)) {
      const c = roleCounts[k];
      const avg = c>0 ? (roleSums[k]/c) : 0;
      rolesAvg[k]=avg;
      roles100[k]=c>0 ? normalizeTo100_(avg) : 0;
    }

    const sorted = Object.keys(roles100).map(k=>({key:k,score:roles100[k]})).sort((a,b)=>b.score-a.score);
    const top2 = sorted.slice(0,2);
    const third = sorted[2];
    const picked=[...top2];
    if (third && top2[1] && third.score >= (top2[1].score-8)) picked.push(third);

    return { roles100, rolesAvg, roleCounts, sorted, picked };
  }

  function computeWeightedIndex_(blocks100) {
    const CA=blocks100.CA??0, RP=blocks100.RP??0, EP=blocks100.EP??0, MC=blocks100.MC??0,
          ER=blocks100.ER??0, LR=blocks100.LR??0, CR=blocks100.CR??0, EF=blocks100.EF??0, MR=blocks100.MR??0;
    const g1=(CA+RP)/2, g2=(EP+MC)/2, g3=(ER+LR)/2, g4=(CR+EF)/2;
    return clamp_(Math.round(0.40*g1+0.20*g2+0.15*g3+0.15*g4+0.10*MR),0,100);
  }

  function roleName_(key) {
    const r = (window.CFE?.ROLES||[]).find(x=>x.key===key);
    if (!r) return key;
    return state.lang==="kg" ? r.name_kg : r.name_ru;
  }

  function stddev_(arr) {
    if (!arr.length) return 0;
    const m=arr.reduce((a,b)=>a+b,0)/arr.length;
    const v=arr.reduce((a,b)=>a+(b-m)*(b-m),0)/arr.length;
    return Math.sqrt(v);
  }

  function computeConfidence_(answered,total,blocks100,cases) {
    const completion = total>0 ? Math.round((answered/total)*100) : 0;
    const values=Object.values(blocks100||{}).filter(v=>Number.isFinite(v));
    const consistency = clamp_(Math.round(100 - stddev_(values)*2),0,100);
    const caseScore = Math.round(((cases||[]).filter(t=>(t||"").trim().length>=50).length/3)*100);
    const confidence = clamp_(Math.round(0.4*completion+0.4*consistency+0.2*caseScore),0,100);
    return { completion_score:completion, consistency_score:consistency, case_score:caseScore, confidence };
  }

  function computePCI_(weighted_index,confidence,blocks100) {
    const CR=blocks100.CR??0, MR=blocks100.MR??0, EF=blocks100.EF??0;
    const feasibility=Math.round((CR+MR+EF)/3);
    const pci_raw=clamp_(Math.round(0.6*weighted_index+0.4*feasibility),0,100);
    const pci=clamp_(Math.round(pci_raw*(confidence/100)),0,100);
    return { feasibility, pci_raw, pci };
  }

  function hasRole_(picked,key){ return (picked||[]).some(x=>x.key===key); }

  function computeClusters_(blocks100,rolesPicked){
    const CA=blocks100.CA??0, LR=blocks100.LR??0, EP=blocks100.EP??0, MR=blocks100.MR??0, EF=blocks100.EF??0;
    const practicalOK=(EF>=55)&&(hasRole_(rolesPicked,"TEC")||hasRole_(rolesPicked,"ORG"));
    const academicOK=(CA>=60)&&(LR>=55)&&hasRole_(rolesPicked,"SYS");
    const remoteOK=(MR>=70)&&(LR>=60)&&(EP>=55);

    const kg1={key:"KG1",name_ru:"KG-1: Практический путь",name_kg:"KG-1: Практикалык жол",
      why_ru:"Быстрее в навыки → портфолио/практика → первые деньги.",why_kg:"Тез көндүм → портфолио/практика → алгачкы киреше."};
    const kg2={key:"KG2",name_ru:"KG-2: Академический путь",name_kg:"KG-2: Академиялык жол",
      why_ru:"Фундамент + системная подготовка → сильная база на будущее.",why_kg:"Негиз + системдүү даярдык → күчтүү база."};
    const remote={key:"REMOTE",name_ru:"Remote: международный трек",name_kg:"Remote: эл аралык трек",
      why_ru:"Фокус на навыки, рынок и удалённые форматы работы.",why_kg:"Көндүм, рынок жана удалёнка форматы."};

    const order=[];
    if (practicalOK && !academicOK) order.push(kg1,kg2);
    else if (!practicalOK && academicOK) order.push(kg2,kg1);
    else {
      const pScore=EF+(hasRole_(rolesPicked,"TEC")?10:0)+(hasRole_(rolesPicked,"ORG")?10:0);
      const aScore=CA+LR+(hasRole_(rolesPicked,"SYS")?15:0);
      order.push(pScore>=aScore?kg1:kg2);
      order.push(pScore>=aScore?kg2:kg1);
    }
    const clusters=[...order];
    if (remoteOK) clusters.push(remote);
    return { clusters, remote_ok: remoteOK };
  }

  function topBlocks_(blocks100,n=3){
    return Object.keys(blocks100||{}).map(k=>({key:k,score:blocks100[k]??0})).sort((a,b)=>b.score-a.score).slice(0,n);
  }

  function bottomBlocks_(blocks100,n=2){
    return Object.keys(blocks100||{}).map(k=>({key:k,score:blocks100[k]??0})).sort((a,b)=>a.score-b.score).slice(0,n);
  }

  function buildPassportStruct_(c){
    const blocks=c.blocks||{};
    return {
      version: state.version,
      lang: state.lang,
      grade: state.grade,
      name: state.cr?.name||"",
      gender: state.cr?.gender||"",
      city: state.cr?.city||"",
      answered: `${c.answered_count}/${c.total_questions}`,
      weighted_index: c.weighted_index,
      confidence: c.confidence,
      feasibility: c.feasibility,
      pci: c.pci,
      blocks,
      top_blocks: topBlocks_(blocks,3),
      weak_blocks: bottomBlocks_(blocks,2),
      roles_picked: (c.roles_picked||[]).map(r=>({key:r.key,name:roleName_(r.key),score:r.score})),
      clusters: (c.clusters||[]).map(cl=>({
        key: cl.key,
        name: state.lang==="kg" ? cl.name_kg : cl.name_ru,
        why: state.lang==="kg" ? cl.why_kg : cl.why_ru
      })),
      cases: [(state.cases[0]||"").trim(),(state.cases[1]||"").trim(),(state.cases[2]||"").trim()],
      catalog_top_directions: c.catalog_top_directions || [],
      catalog_top_professions: c.catalog_top_professions || []
    };
  }

  function passportText_(ps){
    const L=[];
    L.push("CFE ENGINE PASSPORT");
    L.push(`version: ${ps.version}`);
    L.push(`lang: ${ps.lang} | grade: ${ps.grade}`);
    L.push(`name: ${ps.name||"-"} | gender: ${ps.gender||"-"} | city: ${ps.city||"-"}`);
    L.push(`answered: ${ps.answered}`);
    L.push("");
    L.push("INDEXES");
    L.push(`weighted_index: ${ps.weighted_index}`);
    L.push(`confidence: ${ps.confidence}`);
    L.push(`feasibility: ${ps.feasibility}`);
    L.push(`PCI: ${ps.pci}`);
    L.push("");
    L.push("TOP DIRECTIONS (catalog)");
    for (const d of (ps.catalog_top_directions||[])) L.push(`- ${d.direction}: ${d.score}`);
    L.push("");
    L.push("TOP PROFESSIONS (catalog)");
    for (const p of (ps.catalog_top_professions||[]).slice(0,15)) L.push(`- ${p.name_ru}: ${p.score.final}`);
    L.push("");
    L.push("CASES");
    L.push(`1) ${ps.cases[0]||"-"}`);
    L.push(`2) ${ps.cases[1]||"-"}`);
    L.push(`3) ${ps.cases[2]||"-"}`);
    return L.join("\n");
  }

  function buildFullPrompt_(ps){
    return [
      `Ты — карьерный аналитик для подростков Кыргызстана.`,
      `Используй только PASSPORT_STRUCT.`,
      `Не выдумывай.`,
      `PASSPORT_STRUCT:`,
      JSON.stringify(ps, null, 2)
    ].join("\n");
  }

  function buildShortPrompt_(ps){
    return [
      `Короткий разбор по PASSPORT_STRUCT.`,
      JSON.stringify(ps)
    ].join("\n");
  }

  function rebuildPrompts_(){
    if (!state.computed?.passport_struct) return;
    const ps = state.computed.passport_struct;
    state.full_prompt = buildFullPrompt_(ps);
    state.short_prompt = buildShortPrompt_(ps);
  }

  function loadCatalogFromCache_(){
    try {
      const raw=localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const obj=JSON.parse(raw);
      if (!obj || !obj.ts || !Array.isArray(obj.items)) return null;
      if ((Date.now()-obj.ts) > CATALOG_CACHE_TTL_MS) return null;
      return obj;
    } catch(_) { return null; }
  }

  function saveCatalogToCache_(items, warnings){
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ts:Date.now(), items, warnings})); } catch(_) {}
  }

  async function fetchCatalog_(){
    if (!API_URL || API_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) throw new Error("API_URL not set");
    try {
      const res = await fetch(API_URL, {
        method:"POST",
        headers: {"Content-Type":"text/plain;charset=UTF-8"},
        body: JSON.stringify({ action:"get_catalog_professions" })
      });
      const js = await res.json();
      if (js && js.ok) return js.items || [];
      throw new Error("catalog: bad response");
    } catch (e) {
      const url = `${API_URL}?action=get_catalog_professions`;
      const res = await fetch(url, { method:"GET" });
      const js = await res.json();
      if (js && js.ok) return js.items || [];
      throw new Error("catalog: cannot fetch");
    }
  }

  function normalizeCatalogItemV1_(row, rowIndex, seenIds){
    const warnings = [];
    const id = String(row.id || "").trim();
    const name_ru = String(row.name_ru || "").trim();

    if (!id) {
      warnings.push(`Строка ${rowIndex}: пустой id`);
      return { item: null, warnings };
    }
    if (seenIds.has(id)) {
      warnings.push(`Строка ${rowIndex}: duplicate id "${id}"`);
      return { item: null, warnings };
    }
    if (!name_ru) {
      warnings.push(`Строка ${rowIndex}: пустой name_ru`);
      return { item: null, warnings };
    }

    const rawTargets = String(row.blocks_target_json || "").trim();
    const rawRoleWeights = String(row.roles_weight_json || "").trim();

    const blocks_target = parseJSON_(rawTargets);
    if (!blocks_target || typeof blocks_target !== "object") {
      warnings.push(`Строка ${rowIndex}: invalid blocks_target_json`);
      return { item: null, warnings };
    }

    const BLOCKS = window.CFE?.BLOCKS || ["CA","RP","EP","MC","ER","LR","CR","MR","EF"];
    const missingBlocks = BLOCKS.filter(b => !Number.isFinite(Number(blocks_target[b])));
    if (missingBlocks.length) {
      warnings.push(`Строка ${rowIndex}: missing block targets [${missingBlocks.join(", ")}]`);
      return { item: null, warnings };
    }

    const roles_weight = rawRoleWeights ? parseJSON_(rawRoleWeights) : {};
    if (rawRoleWeights && (!roles_weight || typeof roles_weight !== "object")) {
      warnings.push(`Строка ${rowIndex}: invalid roles_weight_json`);
      return { item: null, warnings };
    }

    const item = {
      id,
      name_ru,
      name_kg: String(row.name_kg || "").trim(),
      direction: String(row.direction || "").trim() || "Без категории",
      kg: String(row.kg || "").trim().toUpperCase(),
      remote_ok: String(row.remote_ok || "").toUpperCase() === "TRUE",
      roles_csv: String(row.roles_csv || "").trim(),
      clusters_csv: String(row.clusters_csv || "").trim(),
      blocks_target,
      roles_weight,
      notes: String(row.notes || "")
    };

    const clusters = new Set();
    if (item.kg === "KG1" || item.kg === "KG2") clusters.add(item.kg);
    if (item.remote_ok) clusters.add("REMOTE");
    if (item.clusters_csv) item.clusters_csv.split(",").map(s=>s.trim()).filter(Boolean).forEach(x=>clusters.add(x.toUpperCase()));
    item.clusters = [...clusters];

    item.roles = item.roles_csv
      ? item.roles_csv.split(",").map(s=>s.trim()).filter(Boolean).map(x=>x.toUpperCase())
      : [];

    seenIds.add(id);
    return { item, warnings };
  }

  async function ensureCatalogLoaded_(){
    if (state.catalog_loaded && Array.isArray(state.catalog)) return;
    state.catalog_error = null;
    state.catalog_warnings = [];

    const cached = loadCatalogFromCache_();
    if (cached) {
      state.catalog = cached.items;
      state.catalog_warnings = cached.warnings || [];
      state.catalog_loaded = true;
      return;
    }

    try {
      const rows = await fetchCatalog_();
      const items = [];
      const warnings = [];
      const seenIds = new Set();

      rows.forEach((r, idx) => {
        const res = normalizeCatalogItemV1_(r, idx + 2, seenIds);
        if (res.warnings.length) warnings.push(...res.warnings);
        if (res.item) items.push(res.item);
      });

      state.catalog = items;
      state.catalog_loaded = true;
      state.catalog_warnings = warnings;
      saveCatalogToCache_(items, warnings);
    } catch (e) {
      state.catalog = null;
      state.catalog_loaded = true;
      state.catalog_error = String(e);
    }
  }

  function scoreByTargets_(userBlocks, targets){
    const keys = window.CFE?.BLOCKS || Object.keys(userBlocks||{});
    let sum=0,cnt=0;
    for (const k of keys) {
      const u = Number(userBlocks?.[k]);
      const t = Number(targets?.[k]);
      if (!Number.isFinite(u) || !Number.isFinite(t)) continue;
      sum += Math.abs(u - t);
      cnt++;
    }
    if (!cnt) return 0;
    return clamp_(Math.round(100 - (sum/cnt)),0,100);
  }

  function scoreRolesByWeights_(userRolesPicked, weights){
    if (!weights || !userRolesPicked?.length) return 50;
    let sum=0,cnt=0;
    for (const r of userRolesPicked) {
      const v = Number(weights[r.key]);
      if (!Number.isFinite(v)) continue;
      const vv = v<=1 ? Math.round(v*100) : clamp_(Math.round(v),0,100);
      sum += vv; cnt++;
    }
    if (!cnt) return 50;
    return clamp_(Math.round(sum/cnt),0,100);
  }

  function scoreClusters_(userClusters, profClusters){
    const u = new Set((userClusters||[]).map(x=>String(x.key||x).toUpperCase()));
    const p = new Set((profClusters||[]).map(x=>String(x).toUpperCase()));
    let inter=0;
    u.forEach(x=>{ if (p.has(x)) inter++; });
    if (inter>0) return 100;
    if (u.has("REMOTE") && p.has("REMOTE")) return 85;
    return 40;
  }

  function scoreProfessionV1_(computed, item){
    const sBlocks = scoreByTargets_(computed.blocks || {}, item.blocks_target);
    const sRoles  = scoreRolesByWeights_(computed.roles_picked || [], item.roles_weight || {});
    const sClus   = scoreClusters_(computed.clusters || [], item.clusters || []);
    const final = Math.round(0.60*sBlocks + 0.25*sRoles + 0.15*sClus);
    return { final: clamp_(final,0,100), blocks:sBlocks, roles:sRoles, clusters:sClus };
  }

  function computeCatalogTopIntoComputed_(){
    if (!state.computed) return;
    if (!state.catalog_loaded || !Array.isArray(state.catalog)) return;

    const scored = state.catalog.map(item => ({
      item,
      score: scoreProfessionV1_(state.computed, item)
    })).filter(x => x.score.final > 0)
      .sort((a,b)=>b.score.final-a.score.final);

    const topProf = scored.slice(0,15).map(x => ({
      id: x.item.id,
      name_ru: x.item.name_ru,
      name_kg: x.item.name_kg,
      direction: x.item.direction,
      score: x.score
    }));

    const dirMap = new Map();
    for (const x of scored) {
      const d = x.item.direction || "Без категории";
      if (!dirMap.has(d)) dirMap.set(d, { direction:d, sum:0, cnt:0, best:0 });
      const g = dirMap.get(d);
      g.sum += x.score.final;
      g.cnt++;
      g.best = Math.max(g.best, x.score.final);
    }

    const topDir = [...dirMap.values()].map(g => ({
      direction: g.direction,
      score: Math.round(0.7*(g.sum/g.cnt) + 0.3*g.best)
    })).sort((a,b)=>b.score-a.score).slice(0,7);

    state.computed.catalog_top_professions = topProf;
    state.computed.catalog_top_directions = topDir;
    state.computed.passport_struct = buildPassportStruct_(state.computed);
  }

  function computeDeterministic_(){
    const qs = window.CFE?.QUESTIONS || [];
    const answered = Object.keys(state.answers || {}).length;

    const { blocks100, blocksAvg, counts } = computeBlocks_(state.answers);
    const weighted_index = computeWeightedIndex_(blocks100);
    const rolesRes = computeRoles_(state.answers);
    const conf = computeConfidence_(answered, qs.length, blocks100, state.cases);
    const pciRes = computePCI_(weighted_index, conf.confidence, blocks100);
    const clustersRes = computeClusters_(blocks100, rolesRes.picked);

    const c = {
      blocks: blocks100,
      blocks_avg_1to5: blocksAvg,
      blocks_counts: counts,
      weighted_index,
      roles: rolesRes.roles100,
      roles_avg_1to5: rolesRes.rolesAvg,
      roles_counts: rolesRes.roleCounts,
      roles_sorted: rolesRes.sorted,
      roles_picked: rolesRes.picked,
      completion_score: conf.completion_score,
      consistency_score: conf.consistency_score,
      case_score: conf.case_score,
      confidence: conf.confidence,
      feasibility: pciRes.feasibility,
      pci_raw: pciRes.pci_raw,
      pci: pciRes.pci,
      clusters: clustersRes.clusters,
      remote_ok: clustersRes.remote_ok,
      answered_count: answered,
      total_questions: qs.length,
      catalog_top_directions: [],
      catalog_top_professions: []
    };

    c.passport_struct = buildPassportStruct_(c);
    state.computed = c;
    state.full_prompt = buildFullPrompt_(c.passport_struct);
    state.short_prompt = buildShortPrompt_(c.passport_struct);

    autosave_();
  }

  function renderResult(){
    const el = $("#result-container");
    if (!el) return;
    injectInputStyle_();

    const c = state.computed || {};
    const answered = c.answered_count ?? Object.keys(state.answers||{}).length;
    const blocks = c.blocks || {};
    const order = window.CFE?.BLOCKS || Object.keys(blocks);

    const blockItems = order.map(b => `<div class="kv"><span><b>${b}</b></span><span>${blocks[b] ?? 0}</span></div>`).join("");
    const roles = (c.roles_picked||[]).map(r => `<span class="pill"><b>${escapeHtml_(roleName_(r.key))}</b> ${r.score}</span>`).join(" ");
    const clusters = (c.clusters||[]).map(cl => {
      const title = state.lang==="kg" ? cl.name_kg : cl.name_ru;
      const why = state.lang==="kg" ? cl.why_kg : cl.why_ru;
      return `<div class="kv"><span><b>${escapeHtml_(title)}</b><div class="mini">${escapeHtml_(why)}</div></span><span>✅</span></div>`;
    }).join("");

    const catalogStatus = !state.catalog_loaded
      ? `<div class="mini muted">Каталог загружается…</div>`
      : state.catalog_error
        ? `<div class="warn mini">❌ catalog_professions: ${escapeHtml_(state.catalog_error)}</div>`
        : `<div class="ok mini">✅ Каталог валиден: ${Array.isArray(state.catalog)?state.catalog.length:0} строк</div>`;

    const warningsHTML = state.catalog_warnings?.length
      ? `<div class="warn mini mt">⚠️ Пропущено строк: ${state.catalog_warnings.length}<br>${state.catalog_warnings.slice(0,10).map(w=>escapeHtml_(w)).join("<br>")}</div>`
      : "";

    const dirs = c.catalog_top_directions || [];
    const profs = c.catalog_top_professions || [];

    const dirHTML = dirs.length
      ? dirs.map(d => `<div class="kv"><span><b>${escapeHtml_(d.direction)}</b></span><span>${d.score}</span></div>`).join("")
      : `<div class="mini muted">Нет валидных направлений</div>`;

    const profHTML = profs.length
      ? profs.slice(0,15).map(p => {
          const nm = (state.lang==="kg" && p.name_kg) ? p.name_kg : p.name_ru;
          const details = state.show_scoring_details
            ? `<div class="mini muted">match: blocks ${p.score.blocks} · roles ${p.score.roles} · clusters ${p.score.clusters}</div>`
            : "";
          return `<div class="kv"><span><b>${escapeHtml_(nm)}</b><div class="mini">${escapeHtml_(p.direction||"")}</div>${details}</span><span>${p.score.final}</span></div>`;
        }).join("")
      : `<div class="mini muted">Нет валидных профессий</div>`;

    el.innerHTML = `
      <div class="card">
        <h3>Result</h3>
        <div class="mini">Ответов: ${answered}/${c.total_questions || 55}</div>
        <div class="mt"><b>Weighted index:</b> ${c.weighted_index ?? 0}</div>
        <div class="mt"><b>Confidence:</b> ${c.confidence ?? 0}</div>
        <div class="mt"><b>Feasibility:</b> ${c.feasibility ?? 0}</div>
        <div class="mt"><b>PCI:</b> ${c.pci ?? 0}</div>
      </div>

      <div class="card mt">
        <h3>Catalog status</h3>
        ${catalogStatus}
        ${warningsHTML}
        <div class="rowgap mt">
          <button id="btn-refresh-catalog" class="btn" type="button">Обновить каталог</button>
          <button id="btn-toggle-details" class="btn" type="button">${state.show_scoring_details ? "Скрыть детали" : "Показать детали"}</button>
        </div>
      </div>

      <div class="card mt"><h3>Clusters</h3><div class="stack mt">${clusters}</div></div>
      <div class="card mt"><h3>Roles</h3><div class="rowgap mt">${roles}</div></div>
      <div class="card mt"><h3>Blocks</h3><div class="grid mt">${blockItems}</div></div>
      <div class="card mt"><h3>TOP направления (catalog)</h3><div class="stack mt">${dirHTML}</div></div>
      <div class="card mt"><h3>TOP профессии (catalog)</h3><div class="stack mt">${profHTML}</div></div>
    `;

    $("#btn-refresh-catalog")?.addEventListener("click", async () => {
      try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch(_) {}
      state.catalog_loaded=false;
      state.catalog=null;
      state.catalog_error=null;
      state.catalog_warnings=[];
      renderResult();
      await ensureCatalogLoaded_();
      computeCatalogTopIntoComputed_();
      rebuildPrompts_();
      renderResult();
    });

    $("#btn-toggle-details")?.addEventListener("click", () => {
      state.show_scoring_details = !state.show_scoring_details;
      renderResult();
    });

    const passportEl = $("#passport-text");
    if (passportEl) passportEl.value = passportText_(c.passport_struct || {});
  }

  function escapeHtml_(s){
    return String(s??"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  const copyText = (t)=>navigator.clipboard.writeText(t);
  $("#btn-copy-passport")?.addEventListener("click", () => copyText($("#passport-text")?.value || ""));
  $("#btn-copy-full")?.addEventListener("click", () => copyText(state.full_prompt || ""));
  $("#btn-copy-short")?.addEventListener("click", () => copyText(state.short_prompt || ""));

  async function submitFull(){
    const statusEl = $("#submit-status");
    if (!statusEl) return;

    if (!API_URL || API_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
      statusEl.textContent = "❌ API_URL не заполнен";
      return;
    }
    statusEl.textContent = "Отправляю…";

    if (!state.session_id) state.session_id = "sess_" + Date.now();

    if (!state.catalog_loaded) await ensureCatalogLoaded_();
    computeCatalogTopIntoComputed_();
    rebuildPrompts_();

    const payload = {
      action: "submit_full",
      session_id: state.session_id,
      version: state.version,
      lang: state.lang,
      grade: state.grade,
      name: state.cr?.name || "",
      gender: state.cr?.gender || "",
      answers_json: JSON.stringify(state.answers || {}),
      cr_json: JSON.stringify(state.cr || {}),
      cases_json: JSON.stringify(state.cases || []),
      computed_json: JSON.stringify(state.computed || {}),
      passport_text: $("#passport-text")?.value || "",
      full_prompt: state.full_prompt || "",
      short_prompt: state.short_prompt || "",
      user_agent: navigator.userAgent,
      page_url: location.href
    };

    try {
      const res = await fetch(API_URL, {
        method:"POST",
        headers: {"Content-Type":"text/plain;charset=UTF-8"},
        body: JSON.stringify(payload)
      });
      const js = await res.json();
      if (!js.ok) {
        statusEl.textContent = "❌ API error: " + (js.error||"unknown");
        return;
      }
      statusEl.textContent = "✅ Отправлено. Session: " + js.session_id;
      autosave_();
    } catch (e) {
      statusEl.textContent = "❌ Ошибка: " + String(e);
    }
  }
  $("#btn-submit")?.addEventListener("click", submitFull);

  showScreen("start");
})();
