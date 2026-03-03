(() => {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    lang: "ru",
    grade: 11,
    version: window.CFE?.TEST_VERSION || "unknown",
    answers: {},   // { [questionId]: 1..5 }
    cr: {},
    cases: ["", "", ""],
    computed: null,
    session_id: null
  };

  const screens = ["start", "test", "cr", "cases", "result"];
  function showScreen(name) {
    for (const s of screens) {
      const el = $(`#screen-${s}`);
      if (!el) continue;
      el.classList.toggle("is-active", s === name);
    }
  }

  // Start controls
  $("#btn-lang-ru").addEventListener("click", () => { state.lang = "ru"; });
  $("#btn-lang-kg").addEventListener("click", () => { state.lang = "kg"; });
  $("#btn-grade-9").addEventListener("click", () => { state.grade = 9; });
  $("#btn-grade-11").addEventListener("click", () => { state.grade = 11; });

  $("#btn-start").addEventListener("click", () => {
    renderTest();
    showScreen("test");
  });

  function renderTest() {
    const qs = window.CFE?.QUESTIONS || [];
    const container = $("#test-container");
    container.innerHTML = "";

    $("#test-progress").textContent = `Вопросов: ${qs.length} (пока заглушка)`;

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
        btn.addEventListener("click", () => {
          state.answers[q.id] = v;
          // простая визуальная отметка
          [...row.querySelectorAll("button")].forEach(b => b.classList.remove("btn-primary"));
          btn.classList.add("btn-primary");
        });
        row.appendChild(btn);
      }

      wrap.appendChild(row);
      container.appendChild(wrap);
    }
  }

  // пока тест-кнопка просто переводит на CR (в след. шагах добавим валидацию/прогресс)
  $("#btn-test-next").addEventListener("click", () => showScreen("cr"));

  // Заглушки CR/Cases/Result — наполним в следующих шагах
  $("#cr-container").innerHTML = `<div class="card">TODO: CR форма</div>`;
  $("#btn-cr-next").addEventListener("click", () => showScreen("cases"));

  $("#cases-container").innerHTML = `<div class="card">TODO: 3 кейса</div>`;
  $("#btn-cases-finish").addEventListener("click", () => {
    $("#result-container").innerHTML = `<div class="card">TODO: расчёт + вывод</div>`;
    $("#passport-text").value = "TODO: passport блок";
    showScreen("result");
  });

  // Copy buttons (работают уже сейчас)
  async function copyText(text) {
    await navigator.clipboard.writeText(text);
  }
  $("#btn-copy-passport").addEventListener("click", () => copyText($("#passport-text").value || ""));
  $("#btn-copy-full").addEventListener("click", () => copyText("TODO: full prompt"));
  $("#btn-copy-short").addEventListener("click", () => copyText("TODO: short prompt"));

  // Submit button (позже подключим Apps Script URL)
  $("#btn-submit").addEventListener("click", () => {
    $("#submit-status").textContent = "TODO: отправка в Google Sheets";
  });

  // стартовый экран
  showScreen("start");
})();
