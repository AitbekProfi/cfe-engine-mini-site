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
    session_id: null
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

  $("#btn-cases-finish")?.addEventListener("click", () => {
    computeDeterministic_(); // blocks + weights + roles + confidence + PCI + clusters
    renderResult();
    showScreen("result");
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
  // Deterministic scoring
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

  // -------- Confidence (0–100) --------
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

  // -------- PCI (0–100) --------
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

    // Порядок KG: кто ближе — тот первым
    const kgOrder = [];
    if (practicalOK && !academicOK) kgOrder.push(kg1, kg2);
    else if (!practicalOK && academicOK) kgOrder.push(kg2, kg1);
    else {
      // если оба true или оба false — выбираем по “склонности”
      const practicalScore = (EF + (hasRole_(rolesPicked, "TEC") ? 10 : 0) + (hasRole_(rolesPicked, "ORG") ? 10 : 0));
      const academicScore = (CA + LR + (hasRole_(rolesPicked, "SYS") ? 15 : 0));
      kgOrder.push(practicalScore >= academicScore ? kg1 : kg2);
      kgOrder.push(practicalScore >= academicScore ? kg2 : kg1);
    }

    const clusters = [...kgOrder];
    if (remoteOK) clusters.push(remote);

    return {
      practicalOK,
      academicOK,
      remoteOK,
      clusters
    };
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

    state.computed = {
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

    state.full_prompt = "";
    state.short_prompt = "";

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

    const picked = (c.roles_picked || []).map(x => {
      const name = roleName_(x.key);
      return `<span class="pill"><b>${name}</b> ${x.score}</span>`;
    }).join(" ");

    const topAll = (c.roles_sorted || []).map(x => {
      const name = roleName_(x.key);
      return `<div class="kv"><span><b>${name}</b></span><span>${x.score}</span></div>`;
    }).join("");

    const clusterItems = (c.clusters || []).map(cl => {
      const title = state.lang === "kg" ? cl.name_kg : cl.name_ru;
      const why = state.lang === "kg" ? cl.why_kg : cl.why_ru;
      return `<div class="kv"><span><b>${title}</b><div class="mini">${why}</div></span><span>✅</span></div>`;
    }).join("");

    el.innerHTML = `
      <div class="card">
        <h3>Результат (детерминированно)</h3>
        <div class="mini">Ответов: ${answered}/${c.total_questions || 55}</div>

        <div class="mt"><b>Индекс соответствия (0–100):</b> ${c.weighted_index ?? 0}</div>
        <div class="mt"><b>Confidence (0–100):</b> ${c.confidence ?? 0}</div>
        <div class="mini mt">
          completion ${c.completion_score ?? 0} · consistency ${c.consistency_score ?? 0} · cases ${c.case_score ?? 0}
        </div>

        <div class="mt"><b>Feasibility (0–100):</b> ${c.feasibility ?? 0}</div>
        <div class="mt"><b>PCI (0–100):</b> ${c.pci ?? 0}</div>
        <div class="mini mt">PCI = (0.6*index + 0.4*feasibility) × confidence</div>
      </div>

      <div class="card mt">
        <h3>Кластеры траектории</h3>
        <p class="mini">Всегда 2 KG + Remote, если подходит.</p>
        <div class="stack mt">${clusterItems || "<div class='mini'>Нет данных</div>"}</div>
      </div>

      <div class="card mt">
        <h3>Твои роли (топ 2–3)</h3>
        <p class="mini">Выбор идёт из RP-вопросов, без “фантазий”.</p>
        <div class="row mt">${picked || "<span class='mini'>Недостаточно данных</span>"}</div>

        <div class="mt mini">Все роли:</div>
        <div class="grid mt">${topAll}</div>
      </div>

      <div class="card mt">
        <h3>Твои 9 блоков (0–100)</h3>
        <p class="mini">Чистый расчёт по ответам (1–5) с нормировкой.</p>
        <div class="grid mt">${blockItems}</div>
      </div>
    `;

    const passportEl = $("#passport-text");
    if (passportEl) {
      passportEl.value =
        `CFE Engine Passport (v${state.version})\n` +
        `Name: ${state.cr?.name || "-"}\n` +
        `Gender: ${state.cr?.gender || "-"}\n` +
        `City: ${state.cr?.city || "-"}\n` +
        `Lang: ${state.lang}\n` +
        `Grade: ${state.grade}\n` +
        `Answered: ${answered}/${c.total_questions || 55}\n\n` +
        `Weighted index (0-100): ${c.weighted_index ?? 0}\n` +
        `Confidence (0-100): ${c.confidence ?? 0}\n` +
        `  completion: ${c.completion_score ?? 0}\n` +
        `  consistency: ${c.consistency_score ?? 0}\n` +
        `  cases: ${c.case_score ?? 0}\n` +
        `Feasibility (0-100): ${c.feasibility ?? 0}\n` +
        `PCI (0-100): ${c.pci ?? 0}\n\n` +
        `Clusters:\n` +
        `${(c.clusters || []).map(cl => `- ${(state.lang === "kg" ? cl.name_kg : cl.name_ru)}`).join("\n")}\n\n` +
        `Blocks (0-100):\n` +
        `${order.map(b => `${b}: ${blocks[b] ?? 0}`).join("\n")}\n\n` +
        `Roles (picked):\n` +
        `${(c.roles_picked || []).map(x => `${roleName_(x.key)}: ${x.score}`).join("\n")}\n\n` +
        `Cases:\n` +
        `1) ${(state.cases[0] || "").trim()}\n` +
        `2) ${(state.cases[1] || "").trim()}\n` +
        `3) ${(state.cases[2] || "").trim()}\n`;
    }
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
