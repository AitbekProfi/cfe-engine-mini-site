(() => {
  const $ = (sel) => document.querySelector(sel);

  // === CFE Engine API (Google Apps Script Web App) ===
  const API_URL = "https://script.google.com/macros/s/AKfycby-RHZI3fRO9JaMmgUeWtMdAoPzeBQ3Lb1zawS65fyItLSSzqePFnjlE8xrWkP-fCPNMQ/exec"; // https://script.google.com/macros/s/.../exec

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

    catalog: null,           // normalized catalog items
    catalog_loaded: false,
    catalog_error: null
  };

  // -------- screen router --------
  const screens = ["start", "test", "cr", "cases", "result"];
  function showScreen(name) {
    for (const s of screens) {
      const el = $(`#screen-${s}`);
      if (!el) continue;
      el.classList.toggle("is-active", s === name);
    }
  }

  // -------- autosave (localStorage) --------
  const LS_KEY = "cfe_full_state_v1";
  const CATALOG_CACHE_KEY = "cfe_catalog_cache_v1";
  const CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

  function autosave_() {
    try {
      const toSave = {
        lang: state.lang,
        grade: state.grade,
        version: state.version,
        answers: state.answers,
        cr: state.cr,
        cases: state.cases,
        session_id: state.session_id
      };
      localStorage.setItem(LS_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  function autoload_() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return;

      state.lang = saved.lang || state.lang;
      state.grade = saved.grade || state.grade;
      state.version = saved.version || state.version;
      state.answers = saved.answers || state.answers;
      state.cr = saved.cr || state.cr;
      state.cases = saved.cases || state.cases;
      state.session_id = saved.session_id || state.session_id;
    } catch (_) {}
  }

  autoload_();

  // -------- Start controls --------
  $("#btn-lang-ru")?.addEventListener("click", () => { state.lang = "ru"; autosave_(); });
  $("#btn-lang-kg")?.addEventListener("click", () => { state.lang = "kg"; autosave_(); });
  $("#btn-grade-9")?.addEventListener("click", () => { state.grade = 9; autosave_(); });
  $("#btn-grade-11")?.addEventListener("click", () => { state.grade = 11; autosave_(); });

  $("#btn-start")?.addEventListener("click", () => {
    renderTest();
    showScreen("test");
  });

  // -------- Test render --------
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
    const progressEl = $("#test-progress");
    if (progressEl) progressEl.textContent = `Ответов: ${answered}/${qs.length}`;
  }

  // -------- navigation buttons --------
  $("#btn-test-next")?.addEventListener("click", () => {
    const qs = window.CFE?.QUESTIONS || [];
    const answered = Object.keys(state.answers || {}).length;
    if (answered < Math.min(20, qs.length)) {
      alert("Ты ответил(а) очень мало. Лучше пройти спокойно — так будет точнее 🙂");
    }
    renderCR();
    showScreen("cr");
  });

  $("#btn-cr-next")?.addEventListener("click", () => {
    renderCases();
    showScreen("cases");
  });

  $("#btn-cases-finish")?.addEventListener("click", async () => {
    computeDeterministic_(); // includes passport+prompts
    renderResult();          // immediate render
    showScreen("result");
    // load catalog in background and re-render results when ready
    await ensureCatalogLoaded_();
    renderResult();
  });

  // -------- minimal input CSS --------
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
      .warn { border:1px solid #534200; background:#1b1600; }
      .ok { border:1px solid #114d2b; background:#071b10; }
      .muted { opacity:0.8; }
    `;
    document.head.appendChild(st);
  }

  // -------- CR screen --------
  function renderCR() {
    const el = $("#cr-container");
    if (!el) return;

    injectInputStyle_();

    el.innerHTML = `
      <div class="card">
        <label>Имя</label>
        <input id="cr-name" class="input" type="text" placeholder="Например: Айбек" />

        <label class="mt">Пол (М / Ж)</label>
        <div class="row">
          <button id="cr-g-m" class="btn" type="button">М</button>
          <button id="cr-g-f" class="btn" type="button">Ж</button>
        </div>

        <label class="mt">Город/село</label>
        <input id="cr-city" class="input" type="text" placeholder="Например: Бишкек" />
      </div>
    `;

    const nameEl = $("#cr-name");
    const cityEl = $("#cr-city");
    if (nameEl) nameEl.value = state.cr?.name || "";
    if (cityEl) cityEl.value = state.cr?.city || "";

    nameEl?.addEventListener("input", () => { state.cr.name = nameEl.value.trim(); autosave_(); });
    cityEl?.addEventListener("input", () => { state.cr.city = cityEl.value.trim(); autosave_(); });

    const gm = $("#cr-g-m");
    const gf = $("#cr-g-f");

    function markGender_() {
      gm?.classList.toggle("btn-primary", state.cr.gender === "М");
      gf?.classList.toggle("btn-primary", state.cr.gender === "Ж");
    }

    gm?.addEventListener("click", () => { state.cr.gender = "М"; markGender_(); autosave_(); });
    gf?.addEventListener("click", () => { state.cr.gender = "Ж"; markGender_(); autosave_(); });

    markGender_();
  }

  // -------- Cases screen --------
  function renderCases() {
    const el = $("#cases-container");
    if (!el) return;

    injectInputStyle_();

    el.innerHTML = `
      <div class="card">
        <label>Кейс 1: опиши ситуацию и что ты сделал(а)</label>
        <textarea id="case-1" rows="5" placeholder="Текст..."></textarea>

        <label class="mt">Кейс 2: когда было сложно — как ты справился(ась)</label>
        <textarea id="case-2" rows="5" placeholder="Текст..."></textarea>

        <label class="mt">Кейс 3: что у тебя получается лучше всего</label>
        <textarea id="case-3" rows="5" placeholder="Текст..."></textarea>
      </div>
    `;

    const c1 = $("#case-1");
    const c2 = $("#case-2");
    const c3 = $("#case-3");

    if (c1) c1.value = state.cases[0] || "";
    if (c2) c2.value = state.cases[1] || "";
    if (c3) c3.value = state.cases[2] || "";

    c1?.addEventListener("input", () => { state.cases[0] = c1.value; autosave_(); });
    c2?.addEventListener("input", () => { state.cases[1] = c2.value; autosave_(); });
    c3?.addEventListener("input", () => { state.cases[2] = c3.value; autosave_(); });
  }

  // ======================================
  // Deterministic scoring core
  // ======================================

  function scoreAnswer_(v, rev) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 5) return null;
    return rev ? (6 - n) : n;
  }

  function clamp_(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function normalizeTo100_(avg1to5) {
    const x = Number(avg1to5);
    if (!Number.isFinite(x)) return 0;
    const y = ((x - 1) / 4) * 100;
    return clamp_(Math.round(y), 0, 100);
  }

  function computeBlocks_(answers) {
    const qs = window.CFE?.QUESTIONS || [];
    const sums = {};
    const counts = {};
    for (const b of (window.CFE?.BLOCKS || [])) {
      sums[b] = 0;
      counts[b] = 0;
    }

    for (const q of qs) {
      const raw = answers[q.id];
      const scored = scoreAnswer_(raw, !!q.rev);
      if (scored === null) continue;
      if (!sums.hasOwnProperty(q.block)) continue;

      sums[q.block] += scored;
      counts[q.block] += 1;
    }

    const blocks100 = {};
    const blocksAvg = {};
    for (const b of Object.keys(sums)) {
      const c = counts[b];
      const avg = c > 0 ? (sums[b] / c) : 0;
      blocksAvg[b] = avg;
      blocks100[b] = c > 0 ? normalizeTo100_(avg) : 0;
    }

    return { blocks100, blocksAvg, counts };
  }

  function computeRoles_(answers) {
    const qs = window.CFE?.QUESTIONS || [];
    const roleSums = {};
    const roleCounts = {};

    for (const r of (window.CFE?.ROLES || [])) {
      roleSums[r.key] = 0;
      roleCounts[r.key] = 0;
    }

    for (const q of qs) {
      if (q.block !== "RP") continue;
      if (!q.role) continue;

      const raw = answers[q.id];
      const scored = scoreAnswer_(raw, !!q.rev);
      if (scored === null) continue;

      if (!roleSums.hasOwnProperty(q.role)) {
        roleSums[q.role] = 0;
        roleCounts[q.role] = 0;
      }

      roleSums[q.role] += scored;
      roleCounts[q.role] += 1;
    }

    const roles100 = {};
    const rolesAvg = {};
    for (const k of Object.keys(roleSums)) {
      const c = roleCounts[k];
      const avg = c > 0 ? (roleSums[k] / c) : 0;
      rolesAvg[k] = avg;
      roles100[k] = c > 0 ? normalizeTo100_(avg) : 0;
    }

    const sorted = Object.keys(roles100)
      .map(k => ({ key: k, score: roles100[k] }))
      .sort((a,b) => b.score - a.score);

    const top2 = sorted.slice(0, 2);
    const third = sorted[2];
    const picked = [...top2];
    if (third && top2[1] && third.score >= (top2[1].score - 8)) {
      picked.push(third);
    }

    return { roles100, rolesAvg, roleCounts, sorted, picked };
  }

  function computeWeightedIndex_(blocks100) {
    const CA = blocks100.CA ?? 0;
    const RP = blocks100.RP ?? 0;
    const EP = blocks100.EP ?? 0;
    const MC = blocks100.MC ?? 0;
    const ER = blocks100.ER ?? 0;
    const LR = blocks100.LR ?? 0;
    const CR = blocks100.CR ?? 0;
    const EF = blocks100.EF ?? 0;
    const MR = blocks100.MR ?? 0;

    const g1 = (CA + RP) / 2; // 40%
    const g2 = (EP + MC) / 2; // 20%
    const g3 = (ER + LR) / 2; // 15%
    const g4 = (CR + EF) / 2; // 15%

    const idx = (0.40 * g1) + (0.20 * g2) + (0.15 * g3) + (0.15 * g4) + (0.10 * MR);
    return clamp_(Math.round(idx), 0, 100);
  }

  function roleName_(key) {
    const r = (window.CFE?.ROLES || []).find(x => x.key === key);
    if (!r) return key;
    return state.lang === "kg" ? r.name_kg : r.name_ru;
  }

  // -------- Confidence --------
  function stddev_(arr) {
    if (!arr || arr.length === 0) return 0;
    const mean = arr.reduce((a,b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a,b) => a + (b - mean) * (b - mean), 0) / arr.length;
    return Math.sqrt(variance);
  }

  function computeConsistency_(blocks100) {
    const values = Object.values(blocks100 || {}).filter(v => Number.isFinite(v));
    if (values.length === 0) return 0;
    const sd = stddev_(values);
    const score = 100 - (sd * 2);
    return clamp_(Math.round(score), 0, 100);
  }

  function computeCaseScore_(cases) {
    let count = 0;
    for (const c of (cases || [])) {
      if ((c || "").trim().length >= 50) count++;
    }
    return Math.round((count / 3) * 100);
  }

  function computeConfidence_(answered, total, blocks100, cases) {
    const completion_score = total > 0 ? Math.round((answered / total) * 100) : 0;
    const consistency_score = computeConsistency_(blocks100);
    const case_score = computeCaseScore_(cases);

    const confidence = Math.round(
      0.4 * completion_score +
      0.4 * consistency_score +
      0.2 * case_score
    );

    return {
      completion_score,
      consistency_score,
      case_score,
      confidence: clamp_(confidence, 0, 100)
    };
  }

  // -------- PCI --------
  function computePCI_(weighted_index, confidence, blocks100) {
    const CR = blocks100.CR ?? 0;
    const MR = blocks100.MR ?? 0;
    const EF = blocks100.EF ?? 0;

    const feasibility = Math.round((CR + MR + EF) / 3);
    const pci_raw = (0.6 * weighted_index) + (0.4 * feasibility);
    const pci = Math.round(pci_raw * (confidence / 100));

    return {
      feasibility,
      pci_raw: clamp_(Math.round(pci_raw), 0, 100),
      pci: clamp_(pci, 0, 100)
    };
  }

  // -------- Clusters --------
  function hasRole_(rolesPicked, key) {
    return (rolesPicked || []).some(x => x.key === key);
  }

  function computeClusters_(blocks100, rolesPicked) {
    const CA = blocks100.CA ?? 0;
    const LR = blocks100.LR ?? 0;
    const EP = blocks100.EP ?? 0;
    const MR = blocks100.MR ?? 0;
    const EF = blocks100.EF ?? 0;

    const practicalOK = (EF >= 55) && (hasRole_(rolesPicked, "TEC") || hasRole_(rolesPicked, "ORG"));
    const academicOK = (CA >= 60) && (LR >= 55) && hasRole_(rolesPicked, "SYS");
    const remoteOK = (MR >= 70) && (LR >= 60) && (EP >= 55);

    const kg1 = {
      key: "KG1",
      name_ru: "KG-1: Практический путь",
      name_kg: "KG-1: Практикалык жол",
      why_ru: "Быстрее в навыки → портфолио/практика → первые деньги.",
      why_kg: "Тез көндүм → портфолио/практика → алгачкы киреше."
    };

    const kg2 = {
      key: "KG2",
      name_ru: "KG-2: Академический путь",
      name_kg: "KG-2: Академиялык жол",
      why_ru: "Фундамент + системная подготовка → сильная база на будущее.",
      why_kg: "Негиз + системдүү даярдык → күчтүү база."
    };

    const remote = {
      key: "REMOTE",
      name_ru: "Remote: международный трек",
      name_kg: "Remote: эл аралык трек",
      why_ru: "Фокус на навыки, рынок и удалённые форматы работы.",
      why_kg: "Көндүм, рынок жана удалёнка форматы."
    };

    const kgOrder = [];
    if (practicalOK && !academicOK) kgOrder.push(kg1, kg2);
    else if (!practicalOK && academicOK) kgOrder.push(kg2, kg1);
    else {
      const practicalScore = (EF + (hasRole_(rolesPicked, "TEC") ? 10 : 0) + (hasRole_(rolesPicked, "ORG") ? 10 : 0));
      const academicScore = (CA + LR + (hasRole_(rolesPicked, "SYS") ? 15 : 0));
      kgOrder.push(practicalScore >= academicScore ? kg1 : kg2);
      kgOrder.push(practicalScore >= academicScore ? kg2 : kg1);
    }

    const clusters = [...kgOrder];
    if (remoteOK) clusters.push(remote);

    return { clusters, remoteOK, practicalOK, academicOK };
  }

  // -------- Passport + Prompts --------
  function topBlocks_(blocks100, n = 3) {
    const arr = Object.keys(blocks100 || {}).map(k => ({ key: k, score: blocks100[k] ?? 0 }));
    arr.sort((a,b) => b.score - a.score);
    return arr.slice(0, n);
  }

  function bottomBlocks_(blocks100, n = 2) {
    const arr = Object.keys(blocks100 || {}).map(k => ({ key: k, score: blocks100[k] ?? 0 }));
    arr.sort((a,b) => a.score - b.score);
    return arr.slice(0, n);
  }

  function buildPassportStruct_(computed) {
    const blocks = computed.blocks || {};
    const rolesPicked = computed.roles_picked || [];
    const clusters = computed.clusters || [];

    return {
      version: state.version,
      lang: state.lang,
      grade: state.grade,
      name: state.cr?.name || "",
      gender: state.cr?.gender || "",
      city: state.cr?.city || "",
      answered: `${computed.answered_count}/${computed.total_questions}`,
      weighted_index: computed.weighted_index,
      confidence: computed.confidence,
      feasibility: computed.feasibility,
      pci: computed.pci,
      blocks,
      top_blocks: topBlocks_(blocks, 3),
      weak_blocks: bottomBlocks_(blocks, 2),
      roles_picked: rolesPicked.map(r => ({ key: r.key, name: roleName_(r.key), score: r.score })),
      clusters: clusters.map(c => ({
        key: c.key,
        name: state.lang === "kg" ? c.name_kg : c.name_ru,
        why: state.lang === "kg" ? c.why_kg : c.why_ru
      })),
      cases: [
        (state.cases[0] || "").trim(),
        (state.cases[1] || "").trim(),
        (state.cases[2] || "").trim()
      ]
    };
  }

  function passportText_(ps) {
    const lines = [];
    lines.push(`CFE ENGINE PASSPORT`);
    lines.push(`version: ${ps.version}`);
    lines.push(`lang: ${ps.lang} | grade: ${ps.grade}`);
    lines.push(`name: ${ps.name || "-"} | gender: ${ps.gender || "-"} | city: ${ps.city || "-"}`);
    lines.push(`answered: ${ps.answered}`);
    lines.push(``);
    lines.push(`INDEXES`);
    lines.push(`weighted_index: ${ps.weighted_index}`);
    lines.push(`confidence: ${ps.confidence}`);
    lines.push(`feasibility: ${ps.feasibility}`);
    lines.push(`PCI: ${ps.pci}`);
    lines.push(``);
    lines.push(`ROLES (top 2–3)`);
    for (const r of ps.roles_picked) lines.push(`- ${r.name}: ${r.score}`);
    lines.push(``);
    lines.push(`CLUSTERS`);
    for (const c of ps.clusters) lines.push(`- ${c.name} — ${c.why}`);
    lines.push(``);
    lines.push(`BLOCKS (0–100)`);
    for (const k of (window.CFE?.BLOCKS || Object.keys(ps.blocks))) lines.push(`${k}: ${ps.blocks[k] ?? 0}`);
    lines.push(``);
    lines.push(`TOP BLOCKS`);
    for (const t of ps.top_blocks) lines.push(`- ${t.key}: ${t.score}`);
    lines.push(`WEAK BLOCKS`);
    for (const w of ps.weak_blocks) lines.push(`- ${w.key}: ${w.score}`);
    lines.push(``);
    lines.push(`CASES`);
    lines.push(`1) ${ps.cases[0] || "-"}`);
    lines.push(`2) ${ps.cases[1] || "-"}`);
    lines.push(`3) ${ps.cases[2] || "-"}`);
    return lines.join("\n");
  }

  function buildFullPrompt_(ps) {
    return [
      `Ты — карьерный аналитик для подростков Кыргызстана. Пиши простым, дружелюбным, но чётким языком.`,
      `ВАЖНО: ничего не выдумывай. Используй ТОЛЬКО данные из PASSPORT_STRUCT и текст кейсов.`,
      `Если данных не хватает — так и скажи.`,
      ``,
      `ЗАДАЧА:`,
      `1) Короткий вывод на 5–7 строк: кто это по профилю, где сильнее всего, где риски.`,
      `2) Объясни роли (2–3) и что они значат на практике.`,
      `3) Объясни 2 KG-кластера (и Remote если есть): что это за путь, кому подходит, первые шаги.`,
      `4) Дай 5 конкретных шагов на 7 дней.`,
      `5) Дай списки: 7 направлений, 15 профессий, 5 "не подходит сейчас" и почему (по weak_blocks).`,
      `6) Как повысить confidence/PCI.`,
      ``,
      `PASSPORT_STRUCT (JSON):`,
      JSON.stringify(ps, null, 2)
    ].join("\n");
  }

  function buildShortPrompt_(ps) {
    return [
      `Короткий разбор (до 12 строк) по PASSPORT_STRUCT.`,
      `Ничего не выдумывай.`,
      `Дай: роли, кластеры, 5 направлений, 5 шагов на неделю.`,
      `PASSPORT_STRUCT:`,
      JSON.stringify(ps)
    ].join("\n");
  }

  // ======================================
  // Catalog Professions: load + normalize + score
  // ======================================

  function isObj_(x) { return x && typeof x === "object" && !Array.isArray(x); }

  function parseMaybeJSON_(s) {
    try { return JSON.parse(s); } catch (_) { return null; }
  }

  function csvToRows_(csv) {
    // супер простой CSV (без экзотики). Хватит для аварийного случая.
    const lines = String(csv || "").trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const headers = lines[0].split(",").map(x => x.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(x => x.trim());
      const obj = {};
      headers.forEach((h, idx) => obj[h] = cols[idx] ?? "");
      rows.push(obj);
    }
    return rows;
  }

  function normalizeCatalogPayload_(payload) {
    // payload может быть:
    // - {ok:true, items:[...]}
    // - {ok:true, headers:[...], rows:[[...],[...]]}
    // - {ok:true, rows:[{...},{...}]}
    // - прям массив
    // - csv текст
    if (!payload) return [];

    if (typeof payload === "string") {
      const maybe = parseMaybeJSON_(payload);
      if (maybe) return normalizeCatalogPayload_(maybe);
      const rows = csvToRows_(payload);
      return rows || [];
    }

    if (Array.isArray(payload)) return payload;

    if (isObj_(payload)) {
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.rows) && Array.isArray(payload.headers)) {
        const headers = payload.headers;
        return payload.rows.map(r => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = Array.isArray(r) ? r[i] : r[h]);
          return obj;
        });
      }
      if (Array.isArray(payload.rows)) return payload.rows;
      if (payload.data) return normalizeCatalogPayload_(payload.data);
    }
    return [];
  }

  function num_(x, def = 0) {
    const n = Number(String(x).replace(",", "."));
    return Number.isFinite(n) ? n : def;
  }

  function pickFirst_(obj, keys) {
    for (const k of keys) {
      if (obj && obj[k] != null && obj[k] !== "") return obj[k];
      // allow case-insensitive
      const kk = Object.keys(obj || {}).find(z => z.toLowerCase() === String(k).toLowerCase());
      if (kk && obj[kk] != null && obj[kk] !== "") return obj[kk];
    }
    return null;
  }

  function extractProfile_(row) {
    // Понимаем 3 формата:
    // 1) profile_json / profile / data_json
    // 2) отдельные поля CA..EF и SYS..HEL
    // 3) отдельные поля blocks_CA, role_SYS, etc.
    const profileRaw = pickFirst_(row, ["profile_json","profile","data_json","json"]);
    const profile = profileRaw ? (typeof profileRaw === "string" ? parseMaybeJSON_(profileRaw) : profileRaw) : null;

    const blocks = {};
    const roles = {};
    const clusters = new Set();

    const BLOCKS = window.CFE?.BLOCKS || ["CA","RP","EP","MC","ER","LR","CR","MR","EF"];
    const ROLE_KEYS = (window.CFE?.ROLES || []).map(r => r.key);

    if (profile && isObj_(profile)) {
      // profile.blocks could exist
      if (isObj_(profile.blocks)) {
        for (const b of BLOCKS) blocks[b] = num_(profile.blocks[b], null);
      }
      if (isObj_(profile.roles)) {
        for (const rk of ROLE_KEYS) roles[rk] = num_(profile.roles[rk], null);
      }
      if (Array.isArray(profile.clusters)) profile.clusters.forEach(c => clusters.add(String(c)));
      if (profile.cluster) clusters.add(String(profile.cluster));
      if (profile.remote === true || String(profile.remote).toLowerCase() === "true") clusters.add("REMOTE");
    }

    // blocks by direct keys
    for (const b of BLOCKS) {
      if (blocks[b] == null) {
        const v = pickFirst_(row, [b, `block_${b}`, `blocks_${b}`, `${b}_score`, `${b}_target`, `${b}_w`, `w_${b}`]);
        if (v != null) blocks[b] = num_(v, null);
      }
    }

    // roles by direct keys
    for (const rk of ROLE_KEYS) {
      if (roles[rk] == null) {
        const v = pickFirst_(row, [rk, `role_${rk}`, `roles_${rk}`, `${rk}_score`, `${rk}_w`]);
        if (v != null) roles[rk] = num_(v, null);
      }
    }

    // cluster flags
    const cl = pickFirst_(row, ["cluster","clusters","track","path"]);
    if (cl) {
      String(cl).split(/[;|,]/).map(s => s.trim()).filter(Boolean).forEach(x => clusters.add(x));
    }
    const kg = pickFirst_(row, ["kg","KG","market"]);
    if (kg) clusters.add(String(kg));
    const remoteFlag = pickFirst_(row, ["remote","is_remote","Remote"]);
    if (remoteFlag && String(remoteFlag).toLowerCase() === "true") clusters.add("REMOTE");

    return {
      blocks,
      roles,
      clusters: [...clusters]
    };
  }

  function normalizeCatalogItem_(row, idx) {
    const id = pickFirst_(row, ["id","ID","uid","code"]) ?? String(idx + 1);
    const name = pickFirst_(row, ["name_ru","name","profession_ru","title_ru","profession"]) ?? `Profession ${id}`;
    const name_kg = pickFirst_(row, ["name_kg","title_kg","profession_kg"]) ?? "";
    const direction = pickFirst_(row, ["direction","field","area","category","cluster_group","group"]) ?? "";
    const region = pickFirst_(row, ["region","country","market_region"]) ?? "KG";

    const prof = extractProfile_(row);

    return {
      id: String(id),
      name_ru: String(name),
      name_kg: String(name_kg || ""),
      direction: String(direction || ""),
      region: String(region || ""),
      profile: prof,
      raw: row
    };
  }

  async function fetchCatalog_() {
    if (!API_URL || API_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
      throw new Error("API_URL not set");
    }

    // Пытаемся двумя action (fallback)
    const actions = ["get_catalog_professions", "catalog_professions"];

    for (const action of actions) {
      try {
        const payload = { action };
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify(payload)
        });
        const text = await res.text();
        const maybeJson = parseMaybeJSON_(text);
        const data = maybeJson ?? text;

        if (maybeJson && maybeJson.ok === false) {
          // пробуем другой action
          continue;
        }

        return data;
      } catch (e) {
        // пробуем другой action
        continue;
      }
    }

    throw new Error("Cannot load catalog (both actions failed)");
  }

  function loadCatalogFromCache_() {
    try {
      const raw = localStorage.getItem(CATALOG_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !Array.isArray(obj.items)) return null;
      if ((Date.now() - obj.ts) > CATALOG_CACHE_TTL_MS) return null;
      return obj.items;
    } catch (_) {
      return null;
    }
  }

  function saveCatalogToCache_(items) {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
    } catch (_) {}
  }

  async function ensureCatalogLoaded_() {
    if (state.catalog_loaded) return;
    state.catalog_error = null;

    const cached = loadCatalogFromCache_();
    if (cached) {
      state.catalog = cached;
      state.catalog_loaded = true;
      return;
    }

    try {
      const data = await fetchCatalog_();
      const rows = normalizeCatalogPayload_(data);
      const items = rows.map((r, i) => normalizeCatalogItem_(r, i));
      state.catalog = items;
      state.catalog_loaded = true;
      saveCatalogToCache_(items);
    } catch (e) {
      state.catalog_error = String(e);
      state.catalog_loaded = true;
      state.catalog = null;
    }
  }

  function dotScoreBlocks_(userBlocks, profBlocks) {
    // If profBlocks gives targets (0..100), score by distance.
    // If profBlocks gives weights (0..1 or 0..100), score by dot product.
    const keys = window.CFE?.BLOCKS || Object.keys(userBlocks || {});
    let hasTargets = false;
    for (const k of keys) {
      const v = profBlocks?.[k];
      if (v != null && num_(v, null) != null && num_(v) > 1.5) { // likely 0..100
        hasTargets = true; break;
      }
    }

    if (hasTargets) {
      // distance-based: 100 - mean(|u - t|)
      let sum = 0, cnt = 0;
      for (const k of keys) {
        const u = num_(userBlocks?.[k], null);
        const t = num_(profBlocks?.[k], null);
        if (u == null || t == null) continue;
        sum += Math.abs(u - t);
        cnt++;
      }
      if (cnt === 0) return 0;
      const meanDist = sum / cnt; // 0..100
      return clamp_(Math.round(100 - meanDist), 0, 100);
    }

    // weights-based: normalize weights, then dot with user blocks (0..100)
    let wsum = 0;
    for (const k of keys) {
      const w = num_(profBlocks?.[k], 0);
      wsum += w;
    }
    if (wsum <= 0) return 0;

    let score = 0;
    for (const k of keys) {
      const u = num_(userBlocks?.[k], 0);
      const w = num_(profBlocks?.[k], 0);
      score += (u * (w / wsum));
    }
    return clamp_(Math.round(score), 0, 100);
  }

  function rolesMatch_(userRolesPicked, profRoles) {
    // profRoles: weights or targets
    if (!userRolesPicked || userRolesPicked.length === 0) return 0;
    const pickedKeys = userRolesPicked.map(x => x.key);
    let sum = 0, cnt = 0;

    for (const k of pickedKeys) {
      const v = num_(profRoles?.[k], null);
      if (v == null) continue;
      // if v is 0..1, map -> 0..100
      const vv = v <= 1 ? Math.round(v * 100) : clamp_(Math.round(v), 0, 100);
      sum += vv;
      cnt++;
    }
    if (cnt === 0) return 50; // neutral if no data
    return clamp_(Math.round(sum / cnt), 0, 100);
  }

  function clusterMatch_(userClusters, profClusters) {
    if (!Array.isArray(userClusters) || userClusters.length === 0) return 0;
    if (!Array.isArray(profClusters) || profClusters.length === 0) return 50;

    const u = new Set(userClusters.map(x => String(x).toUpperCase()));
    const p = new Set(profClusters.map(x => String(x).toUpperCase()));

    // strong match if any intersection
    let inter = 0;
    u.forEach(x => { if (p.has(x)) inter++; });

    if (inter > 0) return 100;
    // partial: remote compatibility if user has REMOTE and prof says remote somewhere
    if (u.has("REMOTE") && (p.has("REMOTE") || p.has("INTL") || p.has("INTERNATIONAL"))) return 85;
    return 40;
  }

  function scoreProfession_(user, item) {
    const userBlocks = user.blocks || {};
    const userRolesPicked = user.roles_picked || [];
    const userClusters = (user.clusters || []).map(c => c.key || c);

    const profBlocks = item.profile?.blocks || {};
    const profRoles = item.profile?.roles || {};
    const profClusters = item.profile?.clusters || [];

    const sBlocks = dotScoreBlocks_(userBlocks, profBlocks);               // 0..100
    const sRoles = rolesMatch_(userRolesPicked, profRoles);               // 0..100
    const sClus  = clusterMatch_(userClusters, profClusters);             // 0..100

    // общий скоринг (детерминированно)
    const final = Math.round(0.55 * sBlocks + 0.25 * sRoles + 0.20 * sClus);

    return {
      final: clamp_(final, 0, 100),
      blocks: sBlocks,
      roles: sRoles,
      clusters: sClus
    };
  }

  function computeTopDirections_(scored, topN = 7) {
    // group by direction
    const map = new Map();
    for (const s of scored) {
      const d = (s.item.direction || "Без категории").trim();
      if (!map.has(d)) map.set(d, { direction: d, sum: 0, cnt: 0, best: 0 });
      const g = map.get(d);
      g.sum += s.score.final;
      g.cnt += 1;
      g.best = Math.max(g.best, s.score.final);
    }
    const arr = [...map.values()].map(x => ({
      direction: x.direction,
      score: Math.round((0.7 * (x.sum / x.cnt)) + (0.3 * x.best))
    }));
    arr.sort((a,b) => b.score - a.score);
    return arr.slice(0, topN);
  }

  function computeDeterministic_() {
    const qs = window.CFE?.QUESTIONS || [];
    const answered = Object.keys(state.answers || {}).length;

    const { blocks100, blocksAvg, counts } = computeBlocks_(state.answers);
    const weighted_index = computeWeightedIndex_(blocks100);

    const rolesRes = computeRoles_(state.answers);
    const conf = computeConfidence_(answered, qs.length, blocks100, state.cases);

    const pciRes = computePCI_(weighted_index, conf.confidence, blocks100);
    const clustersRes = computeClusters_(blocks100, rolesRes.picked);

    const computed = {
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
      remote_ok: clustersRes.remoteOK,

      answered_count: answered,
      total_questions: qs.length
    };

    const ps = buildPassportStruct_(computed);
    computed.passport_struct = ps;

    state.computed = computed;
    state.full_prompt = buildFullPrompt_(ps);
    state.short_prompt = buildShortPrompt_(ps);

    autosave_();
  }

  // -------- Result render --------
  function renderResult() {
    const el = $("#result-container");
    if (!el) return;

    injectInputStyle_();

    const c = state.computed || {};
    const blocks = c.blocks || {};
    const answered = c.answered_count ?? Object.keys(state.answers || {}).length;

    const order = window.CFE?.BLOCKS || Object.keys(blocks);
    const blockItems = order.map(b => `<div class="kv"><span><b>${b}</b></span><span>${blocks[b] ?? 0}</span></div>`).join("");

    const pickedRoles = (c.roles_picked || []).map(x => {
      const name = roleName_(x.key);
      return `<span class="pill"><b>${name}</b> ${x.score}</span>`;
    }).join(" ");

    const clusterItems = (c.clusters || []).map(cl => {
      const title = state.lang === "kg" ? cl.name_kg : cl.name_ru;
      const why = state.lang === "kg" ? cl.why_kg : cl.why_ru;
      return `<div class="kv"><span><b>${title}</b><div class="mini">${why}</div></span><span>✅</span></div>`;
    }).join("");

    // --- professions scoring (if catalog loaded) ---
    let profBlockHTML = `<div class="mini muted">Каталог ещё загружается…</div>`;
    if (state.catalog_loaded && state.catalog_error) {
      profBlockHTML = `<div class="mini warn">❌ Ошибка загрузки catalog_professions: ${state.catalog_error}</div>`;
    } else if (state.catalog_loaded && Array.isArray(state.catalog)) {
      const scored = state.catalog.map(item => ({
        item,
        score: scoreProfession_(c, item)
      })).sort((a,b) => b.score.final - a.score.final);

      const topProf = scored.slice(0, 15);
      const topDir = computeTopDirections_(scored, 7);

      const dirHTML = topDir.map(d =>
        `<div class="kv"><span><b>${escapeHtml_(d.direction)}</b></span><span>${d.score}</span></div>`
      ).join("");

      const profHTML = topProf.map(p => {
        const nm = state.lang === "kg" && p.item.name_kg ? p.item.name_kg : p.item.name_ru;
        const sub = p.item.direction ? `<div class="mini">${escapeHtml_(p.item.direction)}</div>` : `<div class="mini">—</div>`;
        const explain = `<div class="mini">match: blocks ${p.score.blocks} · roles ${p.score.roles} · clusters ${p.score.clusters}</div>`;
        return `<div class="kv"><span><b>${escapeHtml_(nm)}</b>${sub}${explain}</span><span>${p.score.final}</span></div>`;
      }).join("");

      profBlockHTML = `
        <div class="card mt">
          <h3>TOP направления (детерминированно)</h3>
          <p class="mini">Скоринг по каталогу: блоки + роли + кластеры.</p>
          <div class="stack mt">${dirHTML || "<div class='mini'>Нет данных</div>"}</div>
        </div>

        <div class="card mt">
          <h3>TOP профессии (детерминированно)</h3>
          <p class="mini">15 лучших по суммарному скору.</p>
          <div class="stack mt">${profHTML || "<div class='mini'>Нет данных</div>"}</div>
        </div>
      `;

      // добавим в computed для записи в Sheets (только топы)
      c.catalog_top_directions = topDir;
      c.catalog_top_professions = topProf.map(p => ({
        id: p.item.id,
        name_ru: p.item.name_ru,
        name_kg: p.item.name_kg,
        direction: p.item.direction,
        score: p.score
      }));
    }

    el.innerHTML = `
      <div class="card">
        <h3>Result</h3>
        <div class="mini">Ответов: ${answered}/${c.total_questions || 55}</div>

        <div class="mt"><b>Weighted index:</b> ${c.weighted_index ?? 0}</div>
        <div class="mt"><b>Confidence:</b> ${c.confidence ?? 0}</div>
        <div class="mini mt">completion ${c.completion_score ?? 0} · consistency ${c.consistency_score ?? 0} · cases ${c.case_score ?? 0}</div>

        <div class="mt"><b>Feasibility:</b> ${c.feasibility ?? 0}</div>
        <div class="mt"><b>PCI:</b> ${c.pci ?? 0}</div>
      </div>

      <div class="card mt">
        <h3>Clusters</h3>
        <div class="stack mt">${clusterItems || "<div class='mini'>Нет данных</div>"}</div>
      </div>

      <div class="card mt">
        <h3>Roles (top 2–3)</h3>
        <div class="row mt">${pickedRoles || "<span class='mini'>Недостаточно данных</span>"}</div>
      </div>

      <div class="card mt">
        <h3>Blocks (0–100)</h3>
        <div class="grid mt">${blockItems}</div>
      </div>

      ${profBlockHTML}
    `;

    // Passport textarea — real text
    const passportEl = $("#passport-text");
    if (passportEl) {
      const ps = c.passport_struct || {};
      passportEl.value = passportText_(ps);
    }
  }

  function escapeHtml_(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------- Copy buttons --------
  async function copyText(text) {
    await navigator.clipboard.writeText(text);
  }
  $("#btn-copy-passport")?.addEventListener("click", () => copyText($("#passport-text")?.value || ""));
  $("#btn-copy-full")?.addEventListener("click", () => copyText(state.full_prompt || ""));
  $("#btn-copy-short")?.addEventListener("click", () => copyText(state.short_prompt || ""));

  // -------- Submit to Sheets --------
  async function submitFull() {
    const statusEl = $("#submit-status");
    if (!statusEl) return;

    statusEl.textContent = "Отправляю данные…";

    if (!API_URL || API_URL.includes("PASTE_YOUR_WEB_APP_URL_HERE")) {
      statusEl.textContent = "❌ API_URL не заполнен. Вставь Web App URL в js/main.js";
      return;
    }

    if (!state.session_id) state.session_id = "sess_" + Date.now();

    // ensure catalog computed parts exist if loaded
    if (state.catalog_loaded && state.catalog && state.computed) {
      // nothing else needed; renderResult already attached tops into computed
    }

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
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();

      if (!json.ok) {
        statusEl.textContent = "❌ API error: " + (json.error || "unknown") + (json.details ? (" / " + json.details) : "");
        return;
      }

      statusEl.textContent = "✅ Успешно отправлено. Session: " + json.session_id;
      autosave_();

    } catch (err) {
      statusEl.textContent = "❌ Ошибка отправки: " + String(err);
    }
  }
  $("#btn-submit")?.addEventListener("click", submitFull);

  // -------- init --------
  showScreen("start");
})();
