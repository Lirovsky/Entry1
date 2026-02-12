"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const views = $$(".view");

/**
 * Etapas que EXISTEM no HTML hoje.
 * (no seu index2.html: 1, 4 e 6)
 */
const LEAD_STEP_ORDER = [1, 4, 6];
const TOTAL_STEPS = LEAD_STEP_ORDER.length;

const state = {
    rooms: 1, // cálculo por sala (mantém a fórmula: rooms * hourValue * holes)
    hourValue: null,
    holes: null,
    lead: {
        name: "",
        role: "",
        phone: "",
        email: "",
    },
};

const WEEKS_PER_YEAR = 48;
const RECOVERABLE_RATE = 0.8;
const EQUIPMENT_PRICE = 15000;

let leadStepIndex = 1; // 1..TOTAL_STEPS (índice lógico)

/* ====== Views ====== */

function setActiveView(name) {
    views.forEach((v) => {
        const isTarget = v.dataset.view === name;
        v.classList.toggle("is-active", isTarget);
        v.setAttribute("aria-hidden", String(!isTarget));
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (name === "lead") {
        leadStepIndex = 1;
        setLeadStep(1);
        updateLeadPreview();
    }
}

/* ====== Stepper ====== */

function updateSteppers(active) {
    $$(".stepper").forEach((stepper) => {
        const steps = Array.from(stepper.querySelectorAll(".step"));

        steps.forEach((step) => {
            const idx = Number(step.dataset.index);

            // Se o HTML do stepper tiver mais bolinhas do que etapas reais, esconde o excesso
            const isBeyond = idx > TOTAL_STEPS;
            step.style.display = isBeyond ? "none" : "";

            if (isBeyond) return;

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

function updateMiniStepper(currentStep, totalSteps = TOTAL_STEPS) {
    const text = document.getElementById("stepMiniText");
    const fill = document.getElementById("stepMiniFill");
    if (text) text.textContent = `Etapa ${currentStep} de ${totalSteps}`;
    if (fill) fill.style.width = `${(currentStep / totalSteps) * 100}%`;
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
        maximumFractionDigits: 0,
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
    const resultName = $("#resultName");
    if (resultName) resultName.textContent = name ? `${name}, sua clínica` : "Sua clínica";

    const annualEl = $("#resultAnnualLoss");
    if (annualEl) annualEl.textContent = formatBRL(annualLoss);

    const weeklyEl = $("#resultWeeklyLoss");
    if (weeklyEl) weeklyEl.textContent = formatBRL(weeklyLoss);

    const rr = $("#resultRecoverable");
    if (rr) rr.textContent = formatBRL(recoverable);

    const equipEl = $("#resultEquipCount");
    if (equipEl) equipEl.textContent = `${equipmentCount || 0} equipamentos`;

    const adEl = $("#resultMonthlyAd");
    if (adEl) adEl.textContent = `${formatBRL(monthlyAd)}/mês`;
}

/* ====== Lead Flow (3 passos reais) ====== */

function setLeadStep(n) {
    // n é índice lógico: 1..TOTAL_STEPS
    leadStepIndex = Math.max(1, Math.min(TOTAL_STEPS, Number(n) || 1));
    const htmlStep = LEAD_STEP_ORDER[leadStepIndex - 1];

    $$(".leadStep").forEach((s) => {
        s.classList.toggle("is-active", Number(s.dataset.leadStep) === htmlStep);
    });

    updateSteppers(leadStepIndex);
    validateLeadSteps();
    focusLeadStep(leadStepIndex);
    updateMiniStepper(leadStepIndex, TOTAL_STEPS);
}

function focusLeadStep(n) {
    const map = {
        1: "#nameInput",
        2: "#holesInput",
        3: "#phoneInput",
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

    // etapa 1
    state.lead.name = ($("#nameInput")?.value || "").trim();
    state.lead.role = ($("#roleInput")?.value || "").trim();

    // etapa 3
    state.lead.phone = ($("#phoneInput")?.value || "").trim();
    state.lead.email = ($("#emailInput")?.value || "").trim();
}

function validateLeadSteps() {
    readAllInputs();
    updateLeadPreview();

    const ok1 = state.lead.name.length >= 3 && state.lead.role.length >= 2;
    const ok2 = !!(state.holes && state.holes > 0) && !!(state.hourValue && state.hourValue > 0);
    const ok3 = state.lead.phone.length >= 8 && state.lead.email.includes("@");

    const setDisabled = (id, disabled) => {
        const el = $(id);
        if (el) el.disabled = !!disabled;
    };

    // Botões que existem no HTML hoje:
    setDisabled("#leadNext1", !ok1);
    setDisabled("#leadNext4", !ok2);
    setDisabled("#toResultBtn", !ok3);

    return { ok1, ok2, ok3 };
}

/* ====== Navegação ====== */

$("#startBtn")?.addEventListener("click", () => setActiveView("lead"));

$$("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const back = btn.getAttribute("data-back");
        if (back) setActiveView(back);
    });
});

// Próximos (apenas os que existem no HTML)
$("#leadNext1")?.addEventListener("click", () => setLeadStep(2));
$("#leadNext4")?.addEventListener("click", () => setLeadStep(3));

// Voltar (apenas os que existem no HTML)
$("#leadBack4")?.addEventListener("click", () => setLeadStep(1));
$("#leadBack6")?.addEventListener("click", () => setLeadStep(2));

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
["#nameInput", "#roleInput", "#emailInput"].forEach((sel) => {
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

/* Submit -> Await -> Result */
let awaitTimer = null;
let awaitMsgTimer = null;

function startAwaitThenResult() {
    setActiveView("await");

    const msgs = ["Processando suas respostas…", "Calculando o impacto no seu faturamento…", "Preparando seu resultado…"];
    const msgEl = $("#awaitMsg");
    let i = 0;

    if (msgEl) msgEl.textContent = msgs[0];

    clearInterval(awaitMsgTimer);
    awaitMsgTimer = setInterval(() => {
        i = Math.min(i + 1, msgs.length - 1);
        if (msgEl) msgEl.textContent = msgs[i];
    }, 1000);

    clearTimeout(awaitTimer);
    awaitTimer = setTimeout(() => {
        clearInterval(awaitMsgTimer);
        updateResultUI();
        setActiveView("result");
    }, 4000);
}

$("#leadForm")?.addEventListener("submit", (e) => {
    e.preventDefault();

    const v = validateLeadSteps();
    if (!v.ok1) return setLeadStep(1);
    if (!v.ok2) return setLeadStep(2);
    if (!v.ok3) return setLeadStep(3);

    startAwaitThenResult();
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

        const optionButtons = [];
        Array.from(sel.options).forEach((opt, i) => {
            const ob = document.createElement("button");
            ob.type = "button";
            ob.className = "customSelect__option";
            ob.setAttribute("role", "option");
            ob.dataset.value = opt.value;
            ob.textContent = opt.textContent;

            if ((opt.value || "") === "" && i === 0) ob.dataset.placeholder = "1";

            ob.addEventListener("click", () => {
                sel.value = opt.value;
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

        document.addEventListener("click", (e) => {
            if (!wrapper.contains(e.target)) close();
        });

        sel.classList.add("select--nativeHidden");
        sel.insertAdjacentElement("afterend", wrapper);
        wrapper.appendChild(btn);
        wrapper.appendChild(menu);

        sel.addEventListener("change", syncFromNative);
        syncFromNative();
    });
}

/* Inicial */
initCustomSelects();
updateSteppers(1);
validateLeadSteps();
updateLeadPreview();
