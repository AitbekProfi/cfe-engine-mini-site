(() => {
  const $ = (sel) => document.querySelector(sel);

  // === CFE Engine API (Google Apps Script Web App) ===
  const API_URL = "https://script.google.com/macros/s/AKfycby-RHZI3fRO9JaMmgUeWtMdAoPzeBQ3Lb1zawS65fyItLSSzqePFnjlE8xrWkP-fCPNMQ/exec"; // например: https://script.google.com/macros/s/.../exec

  const state = {
    lang: "ru",
    grade: 11,
    version: window.CFE?.TEST_VERSION || "cfe_full_unknown",
    answers: {},   // { [questionId]: 1..5 }
    cr: {},        // CR block fields
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

  // -------- Start controls --------
  $("#btn-lang-ru")?.addEventListener("click", () => { state.lang = "ru"; });
  $("#btn-lang-kg")?.addEventListener("click", () => { state.lang = "kg"; });
  $("#btn-grade-9")?.addEventListener("click", () => { state.grade = 9; });
  $("#btn-grade-11")?.addEventListener("click", () => { state.grade = 11; });

  $("#btn-start")?.addEventListener("click", () => {
    renderTest();
    showScreen("test");
  });

  // -------- Test render (stub questions now; full 55 later) --------
  function renderTest() {
    const qs = window.CFE?.QUESTIONS || [];
    const container = $("#test-container");
    if (!container) return;
    container.innerHTML = "";

    const answered = Object.keys(state.answers || {}).length;
    const progressEl = $("#test-progress");
    if (progressEl) progressEl.textContent = `Ответов: ${answered}/${qs.length}`;

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

        // highlight if already chosen
        if (state.answers[q.id] === v) btn.classList.add("btn-primary");

        btn.addEventListener("click", () => {
          state.answers[q.id] = v;

          // visual
          [...row.querySelectorAll("button")].forEach(b => b.classList.remove("btn-primary"));
          btn.classList.add("btn-primary");

          const answeredNow = Object.keys(state.answers || {}).length;
          if (progressEl) progressEl.textContent = `Ответов: ${answeredNow}/${qs.length}`;

          autosave_();
        });

        row.appendChild(btn);
      }

      wrap.appendChild(row);
      container.appendChild(wrap);
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

  // -------- navigation buttons --------
  $("#btn-test-next")?.addEventListener("click", () => {
    // пока без строгой валидации (добавим позже)
    renderCR();
    showScreen("cr");
  });

  $("#btn-cr-next")?.addEventListener("click", () => {
    renderCases();
    showScreen("cases");
  });

  $("#btn-cases-finish")?.addEventListener("click", () => {
    computeStub_();
    renderResult();
    showScreen("result");
  });

  // -------- CR screen (simple stub form; расширим позже) --------
  function renderCR() {
    const el = $("#cr-container");
    if (!el) return;

    el.innerHTML = `
      <div class="card">
        <label>Имя</label>
        <input id="cr-name" class="input" type="text" placeholder="Например: Айбек" />
        <label>Пол (М/Ж)</label>
        <div class="row">
          <button id="cr-g-m" class="btn" type="button">М</button>
          <button id="cr-g-f" class="btn" type="button">Ж</button>
        </div>
        <label class="mt">Город/село</label>
        <input id="cr-city" class="input" type="text" placeholder="Например: Бишкек" />
      </div>
    `;

    // inject minimal input style if not present
    injectInputStyle_();

    const nameEl = $("#cr-name");
    const cityEl = $("#cr-city");
    if (nameEl) nameEl.value = state.cr?.name || "";
    if (cityEl) cityEl.value = state.cr?.city || "";

    nameEl?.addEventListener("input", () => {
      state.cr.name = nameEl.value.trim();
      autosave_();
    });
    cityEl?.addEventListener("input", () => {
      state.cr.city = cityEl.value.trim();
      autosave_();
    });

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

  // -------- Cases screen (3 textareas) --------
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

  function injectInputStyle_() {
    // adds minimal input CSS once (without editing styles.css)
    if (document.getElementById("cfe-input-style")) return;
    const st = document.createElement("style");
    st.id = "cfe-input-style";
    st.textContent = `
      .input { width: 100%; border-radius: 12px; padding: 10px; border: 1px solid #2f3442; background: #0f1117; color: #e8e8e8; }
    `;
    document.head.appendChild(st);
  }

  // -------- Compute (stub for now; real deterministic later) --------
  function computeStub_() {
    // placeholder that proves pipeline works
    const answered = Object.keys(state.answers || {}).length;

    state.computed = {
      blocks: { CA: 0, RP: 0, EP: 0, MC: 0, ER: 0, LR: 0, CR: 0, MR: 0, EF: 0 },
      note: "TODO: replace with deterministic compute",
      answered_count: answered
    };

    state.full_prompt = "TODO: full prompt (will be generated from computed + cases)";
    state.short_prompt = "TODO: short prompt (will be generated from computed + cases)";

    autosave_();
  }

  // -------- Result render --------
  function renderResult() {
    const el = $("#result-container");
    if (!el) return;

    const answered = Object.keys(state.answers || {}).length;
    el.innerHTML = `
      <div class="card">
        <h3>Проверка пайплайна</h3>
        <p class="muted">Это временный вывод. В следующих шагах добавим реальные расчёты 9 блоков, роли, кластеры, confidence, PCI и passport.</p>
        <div><b>Ответов:</b> ${answered}</div>
        <div><b>Session:</b> ${state.session_id || "(ещё нет)"}</div>
      </div>
    `;

    const passportEl = $("#passport-text");
    if (passportEl) {
      passportEl.value =
        `CFE Engine Passport (TEMP)\n` +
        `Name: ${state.cr?.name || "-"}\n` +
        `Gender: ${state.cr?.gender || "-"}\n` +
        `City: ${state.cr?.city || "-"}\n` +
        `Answered: ${answered}\n` +
        `Computed: ${JSON.stringify(state.computed || {}, null, 2)}\n`;
    }
  }

  // -------- Copy buttons --------
  async function copyText(text) {
    await navigator.clipboard.writeText(text);
  }

  $("#btn-copy-passport")?.addEventListener("click", () => copyText($("#passport-text")?.value || ""));
  $("#btn-copy-full")?.addEventListener("click", () => copyText(state.full_prompt || ""));
  $("#btn-copy-short")?.addEventListener("click", () => copyText(state.short_prompt || ""));

  // -------- Submit to Sheets (real) --------
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
        headers: { "Content-Type": "text/plain;charset=UTF-8" }, // no preflight
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
