"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const views = $$(".view");

/**
 * Etapas que EXISTEM no HTML hoje.
 * (no seu index2.html: 1, 2 e 3)
 */
const LEAD_STEP_ORDER = [1, 2, 3];
const TOTAL_STEPS = LEAD_STEP_ORDER.length;

const state = {
    chairs: null, // cadeiras de atendimento
    rooms: 1, // compat: cálculo usa rooms (rooms * hourValue * holes)
    hourValue: null,
    holes: null,

    // popup (pré-resultado)
    area: "",
    teamSize: null,
    isSubscriber: "",
    leadName: "",
    leadPhone: "",
    leadEmail: "",
};

const WEEKS_PER_YEAR = 48;
const RECOVERABLE_RATE = 0.8;
const EQUIPMENT_PRICE = 15000;

let leadStepIndex = 1; // 1..TOTAL_STEPS (índice lógico)

/* ====== Popup (pré-resultado) ====== */

const preResultModal = $("#preResultModal");
const preResultForm = $("#preResultForm");

const QUALIFY_TOTAL_STEPS = 2;
let qualifyStepIndex = 1;
let lastFocusEl = null;

function updateQualifyStepper(active) {
    if (!preResultModal) return;
    const steps = Array.from(preResultModal.querySelectorAll(".stepperModal .stepModal"));
    steps.forEach((step) => {
        const idx = Number(step.dataset.index);
        step.classList.toggle("is-complete", idx < active);
        step.classList.toggle("is-current", idx === active);
        step.classList.toggle("is-upcoming", idx > active);

        const circle = step.querySelector(".step__circle");
        if (!circle) return;
        if (idx < active) circle.textContent = "✓";
        else circle.textContent = String(idx);
    });
}

function setQualifyStep(n) {
    qualifyStepIndex = Math.max(1, Math.min(QUALIFY_TOTAL_STEPS, Number(n) || 1));

    $$(".qualifyStep").forEach((s) => {
        s.classList.toggle("is-active", Number(s.dataset.qualifyStep) === qualifyStepIndex);
    });

    updateQualifyStepper(qualifyStepIndex);
    validateQualifyForm();
    focusQualifyStep(qualifyStepIndex);
}

function focusQualifyStep(n) {
    const map = {
        1: "#areaInput",
        2: "#nameInput",
    };

    setTimeout(() => {
        const sel = map[n];
        const el = sel ? $(sel) : null;
        if (el && typeof el.focus === "function") el.focus();
    }, 60);
}

function openPreResultModal() {
    if (!preResultModal) return;
    lastFocusEl = document.activeElement;

    preResultModal.hidden = false;
    preResultModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    setQualifyStep(1);
}

function closePreResultModal() {
    if (!preResultModal) return;
    preResultModal.hidden = true;
    preResultModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    if (lastFocusEl && typeof lastFocusEl.focus === "function") {
        try {
            lastFocusEl.focus();
        } catch (_) { }
    }
}

function readQualifyInputs() {
    state.area = String($("#areaInput")?.value || "").trim();
    state.teamSize = String($("#teamSizeInput")?.value || "").trim();

    // subscriber vem de <select id="subscriberInput"> com opções "Sim"/"Não"
    const subRaw = String($("#subscriberInput")?.value || "").trim().toLowerCase();
    if (subRaw === "sim") state.isSubscriber = "yes";
    else if (subRaw === "não" || subRaw === "nao") state.isSubscriber = "no";
    else state.isSubscriber = "";

    // etapa 2 (ids do HTML: nameInput/phoneInput/emailInput)
    state.leadName = String($("#nameInput")?.value || "").trim();
    state.leadPhone = onlyDigits($("#phoneInput")?.value || "");
    state.leadEmail = String($("#emailInput")?.value || "").trim();
}

function isValidEmail(email) {
    const e = String(email || "").trim();
    // validação simples (estrutura) – sem ser excessivamente restritiva
    return e.includes("@") && e.includes(".") && e.length >= 6;
}

function validateQualifyForm() {
    readQualifyInputs();

    const okArea = state.area.length >= 2;
    const okTeam = state.teamSize.length >= 2;
    const okSub = state.isSubscriber === "yes" || state.isSubscriber === "no";
    const okStep1 = okArea && okTeam && okSub;

    const okName = state.leadName.length >= 2;
    const okPhone = (state.leadPhone || "").length >= 10;
    const okEmail = isValidEmail(state.leadEmail);
    const okStep2 = okName && okPhone && okEmail;

    const nextBtn = $("#qualifyNextBtn");
    if (nextBtn) nextBtn.disabled = !okStep1;

    const submitBtn = $("#qualifySubmitBtn");
    if (submitBtn) submitBtn.disabled = !(okStep1 && okStep2);

    return { okStep1, okStep2 };
}

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
    const resultName = $("#resultName");
    if (resultName) resultName.textContent = "Sua clínica";

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
        1: "#chairsInput",
        2: "#hourValueInput",
        3: "#holesInput",
    };

    setTimeout(() => {
        const sel = map[n];
        if (!sel) return;
        const el = $(sel);
        if (el && typeof el.focus === "function") el.focus();
    }, 80);
}

function readAllInputs() {
    // cálculo
    state.chairs = parseIntSafe($("#chairsInput")?.value);
    // mantém o cálculo antigo (rooms * hourValue * holes)
    state.rooms = state.chairs || null;
    state.holes = parseIntSafe($("#holesInput")?.value);
    state.hourValue = parseIntSafe($("#hourValueInput")?.value);
}

function validateLeadSteps() {
    readAllInputs();
    updateLeadPreview();

    const ok1 = !!(state.chairs && state.chairs > 0);
    const ok2 = !!(state.hourValue && state.hourValue > 0);
    const ok3 = !!(state.holes && state.holes > 0);

    const setDisabled = (id, disabled) => {
        const el = $(id);
        if (el) el.disabled = !!disabled;
    };

    // Botões que existem no HTML hoje:
    setDisabled("#leadNext1", !ok1);
    setDisabled("#leadNext2", !ok2);
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

// Próximos
$("#leadNext1")?.addEventListener("click", () => setLeadStep(2));
$("#leadNext2")?.addEventListener("click", () => setLeadStep(3));

// Voltar
$("#leadBack2")?.addEventListener("click", () => setLeadStep(1));
$("#leadBack3")?.addEventListener("click", () => setLeadStep(2));

/* ====== Popup (pré-resultado) Navegação ====== */

$("#qualifyCancelBtn")?.addEventListener("click", () => closePreResultModal());
$("#qualifyBackBtn")?.addEventListener("click", () => setQualifyStep(1));
$("#qualifyNextBtn")?.addEventListener("click", () => {
    const v = validateQualifyForm();
    if (!v.okStep1) return;
    setQualifyStep(2);
});

// ESC fecha o popup
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (preResultModal && !preResultModal.hidden) closePreResultModal();
});

/* ====== Listeners inputs ====== */

const chairsEl = $("#chairsInput");
if (chairsEl) {
    chairsEl.addEventListener("input", (e) => {
        e.target.value = onlyDigits(e.target.value).slice(0, 3);
        validateLeadSteps();
    });
}

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

// Popup inputs (são <select> com custom-select -> evento correto é "change")
const areaEl = $("#areaInput");
if (areaEl) areaEl.addEventListener("change", validateQualifyForm);

const teamEl = $("#teamSizeInput");
if (teamEl) teamEl.addEventListener("change", validateQualifyForm);

const subscriberEl = $("#subscriberInput");
if (subscriberEl) subscriberEl.addEventListener("change", validateQualifyForm);

// Etapa 2 do popup (ids do HTML)
const qNameEl = $("#nameInput");
if (qNameEl) qNameEl.addEventListener("input", validateQualifyForm);

const qPhoneEl = $("#phoneInput");
if (qPhoneEl) {
    qPhoneEl.addEventListener("input", (e) => {
        // mantém simples: só números
        e.target.value = onlyDigits(e.target.value).slice(0, 13);
        validateQualifyForm();
    });
}

const qEmailEl = $("#emailInput");
if (qEmailEl) qEmailEl.addEventListener("input", validateQualifyForm);

// (sem campos de texto/contato nesta versão)

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

    // Antes do await/resultado, abre o popup
    openPreResultModal();
});

// Submit do popup -> segue o fluxo original (await -> result)
preResultForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const v = validateQualifyForm();
    if (!v.okStep1) return setQualifyStep(1);
    if (!v.okStep2) return setQualifyStep(2);

    closePreResultModal();
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
