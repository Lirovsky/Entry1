"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const views = $$(".view");

const state = {
    rooms: 1, // cálculo por sala (mantém a fórmula: rooms * hourValue * holes)
    hourValue: null,
    holes: null,
    lead: {
        name: "",
        role: "",
        area: "",
        teamSize: "",
        hasSystem: "",
        challenge: "",
        subscriber: "",
        investment: "",
        phone: "",
        email: ""
    }
};

const WEEKS_PER_YEAR = 48;
const RECOVERABLE_RATE = 0.80;
const EQUIPMENT_PRICE = 15000;

let leadStep = 1;

/* ====== Views ====== */

function setActiveView(name) {
    views.forEach(v => {
        const isTarget = v.dataset.view === name;
        v.classList.toggle("is-active", isTarget);
        v.setAttribute("aria-hidden", String(!isTarget));
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (name === "lead") {
        leadStep = 1;
        setLeadStep(1);
        updateLeadPreview();
    }
}

/* ====== Stepper (6 etapas) ====== */

function updateSteppers(active) {
    $$(".stepper").forEach(stepper => {
        const steps = Array.from(stepper.querySelectorAll(".step"));
        steps.forEach(step => {
            const idx = Number(step.dataset.index);
            step.classList.toggle("is-complete", idx < active);
            step.classList.toggle("is-current", idx === active);
            step.classList.toggle("is-upcoming", idx > active);

            const circle = step.querySelector(".step__circle");
            if (!circle) return;
            if (idx < active) circle.textContent = "✓";
            else circle.textContent = String(idx);
        });
    });
}

/* ====== Helpers ====== */

function onlyDigits(s) {
    return String(s || "").replace(/\D+/g, "");
}

function parseIntSafe(value) {
    const d = onlyDigits(value);
    if (!d) return null;
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
}

function formatBRL(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "R$ 0";
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0
    }).format(v);
}

function compute() {
    const rooms = Number(state.rooms || 0);
    const hour = Number(state.hourValue || 0);
    const holes = Number(state.holes || 0);

    const weeklyLoss = rooms * hour * holes;
    const annualLoss = weeklyLoss * WEEKS_PER_YEAR;
    const recoverable = annualLoss * RECOVERABLE_RATE;

    const equipmentCount = Math.floor(annualLoss / EQUIPMENT_PRICE);
    const monthlyAd = annualLoss / 12;

    return { weeklyLoss, annualLoss, recoverable, equipmentCount, monthlyAd };
}

/* ====== UI updates ====== */

function updateLeadPreview() {
    const { annualLoss } = compute();
    const el = $("#leadAnnualLoss");
    if (el) el.textContent = formatBRL(annualLoss);
}

function updateResultUI() {
    const { weeklyLoss, annualLoss, recoverable, equipmentCount, monthlyAd } = compute();

    const name = (state.lead.name || "").trim();
    $("#resultName").textContent = name ? `${name}, sua clínica` : "Sua clínica";

    $("#resultAnnualLoss").textContent = formatBRL(annualLoss);
    $("#resultWeeklyLoss").textContent = formatBRL(weeklyLoss);
    const rr = $("#resultRecoverable");
    if (rr) rr.textContent = formatBRL(recoverable);

    $("#resultEquipCount").textContent = `${equipmentCount || 0} equipamentos`;
    $("#resultMonthlyAd").textContent = `${formatBRL(monthlyAd)}/mês`;
}

/* ====== Lead Flow (10 passos) ====== */

function setLeadStep(n) {
    leadStep = n;

    $$(".leadStep").forEach(s => {
        s.classList.toggle("is-active", Number(s.dataset.leadStep) === n);
    });

    updateSteppers(n);
    validateLeadSteps();
    focusLeadStep(n);
}

function focusLeadStep(n) {
    const map = {
        1: "#nameInput",
        2: "#areaInput",
        3: 'input[name="hasSystem"]',
        4: "#holesInput",
        5: "#subscriberInput",
        6: "#phoneInput"
    };

    setTimeout(() => {
        const sel = map[n];
        if (!sel) return;
        const el = $(sel);
        if (el && typeof el.focus === "function") el.focus();
    }, 80);
}

function readAllInputs() {
    // cálculo (por sala)
    state.rooms = 1;
    state.holes = parseIntSafe($("#holesInput")?.value);
    state.hourValue = parseIntSafe($("#hourValueInput")?.value);

    // qualificação
    state.lead.name = ($("#nameInput")?.value || "").trim();
    state.lead.role = ($("#roleInput")?.value || "").trim();
    state.lead.area = ($("#areaInput")?.value || "").trim();
    state.lead.teamSize = ($("#teamSizeInput")?.value || "").trim();
    state.lead.hasSystem = ($('input[name="hasSystem"]:checked')?.value || "").trim();
    state.lead.challenge = ($("#challengeInput")?.value || "").trim();
    state.lead.subscriber = ($("#subscriberInput")?.value || "").trim();
    state.lead.investment = ($("#investmentInput")?.value || "").trim();
    state.lead.phone = ($("#phoneInput")?.value || "").trim();
    state.lead.email = ($("#emailInput")?.value || "").trim();
}

function validateLeadSteps() {
    readAllInputs();
    updateLeadPreview();

    const ok1 = state.lead.name.length >= 3 && state.lead.role.length >= 2;
    const ok2 = !!state.lead.area && !!state.lead.teamSize;
    const ok3 = !!state.lead.hasSystem && !!state.lead.challenge;
    const ok4 = !!(state.holes && state.holes > 0) && !!(state.hourValue && state.hourValue > 0);
    const ok5 = !!state.lead.subscriber && !!state.lead.investment;
    const ok6 = state.lead.phone.length >= 8 && state.lead.email.includes("@");

    const setDisabled = (id, disabled) => {
        const el = $(id);
        if (el) el.disabled = !!disabled;
    };

    setDisabled("#leadNext1", !ok1);
    setDisabled("#leadNext2", !ok2);
    setDisabled("#leadNext3", !ok3);
    setDisabled("#leadNext4", !ok4);
    setDisabled("#leadNext5", !ok5);
    setDisabled("#toResultBtn", !ok6);

    return { ok1, ok2, ok3, ok4, ok5, ok6 };
}

/* ====== Navegação ====== */

$("#startBtn")?.addEventListener("click", () => setActiveView("lead"));

$$("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => {
        const back = btn.getAttribute("data-back");
        if (back) setActiveView(back);
    });
});

// Próximo (1–5)
for (let i = 1; i <= 5; i++) {
    $(`#leadNext${i}`)?.addEventListener("click", () => setLeadStep(i + 1));
}

// Voltar (2–6)
for (let i = 2; i <= 6; i++) {
    $(`#leadBack${i}`)?.addEventListener("click", () => setLeadStep(i - 1));
}

/* ====== Listeners inputs ====== */

// numéricos
const hourEl = $("#hourValueInput");
if (hourEl) {
    hourEl.addEventListener("input", (e) => {
        e.target.value = onlyDigits(e.target.value).slice(0, 9);
        validateLeadSteps();
    });
}

const holesEl = $("#holesInput");
if (holesEl) {
    holesEl.addEventListener("input", (e) => {
        e.target.value = onlyDigits(e.target.value).slice(0, 6);
        validateLeadSteps();
    });
}

// selects e texto
[
    "#nameInput",
    "#roleInput",
    "#areaInput",
    "#teamSizeInput",
    "#challengeInput",
    "#subscriberInput",
    "#investmentInput",
    "#emailInput"
].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", validateLeadSteps);
    el.addEventListener("change", validateLeadSteps);
});

const phoneEl = $("#phoneInput");
if (phoneEl) {
    phoneEl.addEventListener("input", (e) => {
        e.target.value = onlyDigits(e.target.value).slice(0, 13);
        validateLeadSteps();
    });
}

$$('input[name="hasSystem"]').forEach(r => {
    r.addEventListener("change", validateLeadSteps);
});

/* Submit -> Result */
$("#leadForm")?.addEventListener("submit", (e) => {
    e.preventDefault();

    const v = validateLeadSteps();
    if (!v.ok1) return setLeadStep(1);
    if (!v.ok2) return setLeadStep(2);
    if (!v.ok3) return setLeadStep(3);
    if (!v.ok4) return setLeadStep(4);
    if (!v.ok5) return setLeadStep(5);
    if (!v.ok6) return setLeadStep(6);

    updateResultUI();
    setActiveView("result");
});

/* CTAs */
$("#ctaStrategyBtn")?.addEventListener("click", () => {
    alert("Ajuste este botão com seu link de agendamento.");
});

$("#ctaWhatsBtn")?.addEventListener("click", () => {
    alert("Ajuste este botão com seu link do WhatsApp.");
});


/* ====== Custom Select (estilo do dropdown) ====== */

function initCustomSelects() {
    const selects = Array.from(document.querySelectorAll("select.select"));
    selects.forEach((sel) => {
        if (sel.dataset.enhanced === "1") return;
        sel.dataset.enhanced = "1";

        const wrapper = document.createElement("div");
        wrapper.className = "customSelect";
        wrapper.tabIndex = -1;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "customSelect__button";
        btn.setAttribute("aria-haspopup", "listbox");
        btn.setAttribute("aria-expanded", "false");

        const menu = document.createElement("div");
        menu.className = "customSelect__menu";
        menu.setAttribute("role", "listbox");

        // Build options
        const optionButtons = [];
        Array.from(sel.options).forEach((opt, i) => {
            const ob = document.createElement("button");
            ob.type = "button";
            ob.className = "customSelect__option";
            ob.setAttribute("role", "option");
            ob.dataset.value = opt.value;
            ob.textContent = opt.textContent;

            // Placeholder option (value vazio)
            if ((opt.value || "") === "" && i === 0) ob.dataset.placeholder = "1";

            ob.addEventListener("click", () => {
                sel.value = opt.value;
                // dispara listeners existentes
                sel.dispatchEvent(new Event("change", { bubbles: true }));
                close();
                btn.focus();
            });

            optionButtons.push(ob);
            menu.appendChild(ob);
        });

        function syncFromNative() {
            const v = sel.value;
            const nativeOpt = sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0] : null;
            const label = nativeOpt ? nativeOpt.textContent : "";

            btn.textContent = label || "Selecione";
            btn.dataset.hasValue = v ? "1" : "0";

            optionButtons.forEach((ob) => {
                const isSelected = ob.dataset.value === v;
                ob.classList.toggle("is-selected", isSelected);
                ob.setAttribute("aria-selected", isSelected ? "true" : "false");
            });
        }

        function open() {
            wrapper.classList.add("is-open");
            btn.setAttribute("aria-expanded", "true");

            // foca no item selecionado ou no primeiro não-placeholder
            const v = sel.value;
            let target = optionButtons.find((b) => b.dataset.value === v) || null;
            if (!target) target = optionButtons.find((b) => b.dataset.placeholder !== "1") || optionButtons[0];
            target && target.focus();
        }

        function close() {
            wrapper.classList.remove("is-open");
            btn.setAttribute("aria-expanded", "false");
        }

        function toggle() {
            if (wrapper.classList.contains("is-open")) close();
            else open();
        }

        btn.addEventListener("click", toggle);

        btn.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
            }
        });

        menu.addEventListener("keydown", (e) => {
            const active = document.activeElement;
            const idx = optionButtons.indexOf(active);
            if (e.key === "Escape") {
                e.preventDefault();
                close();
                btn.focus();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = optionButtons[Math.min(optionButtons.length - 1, idx + 1)];
                next && next.focus();
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                const prev = optionButtons[Math.max(0, idx - 1)];
                prev && prev.focus();
            }
            if (e.key === "Enter") {
                e.preventDefault();
                active && active.click();
            }
        });

        // close on outside click
        document.addEventListener("click", (e) => {
            if (!wrapper.contains(e.target)) close();
        });

        // Hide native select, mount custom UI after it
        sel.classList.add("select--nativeHidden");
        sel.insertAdjacentElement("afterend", wrapper);
        wrapper.appendChild(btn);
        wrapper.appendChild(menu);

        // Keep in sync
        sel.addEventListener("change", syncFromNative);
        syncFromNative();
    });
}

/* Inicial */
initCustomSelects();
updateSteppers(1);
validateLeadSteps();
updateLeadPreview();
