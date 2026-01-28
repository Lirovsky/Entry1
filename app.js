"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const views = $$(".view");
const state = {
    rooms: null,
    hourValue: null,
    holes: null,
    lead: {
        // novas perguntas
        challenge: "",
        accessCount: "",
        hasSystem: "",
        area: "",
        subscriber: "",
        investment: "",

        // dados pessoais
        name: "",
        phone: "",
        email: "",
        role: "",
        site: ""
    }
};

const WEEKS_PER_YEAR = 48;
const RECOVERABLE_RATE = 0.80;
const EQUIPMENT_PRICE = 15000;

let leadStep = 1;

function setActiveView(name) {
    views.forEach(v => {
        const isTarget = v.dataset.view === name;
        v.classList.toggle("is-active", isTarget);
        v.setAttribute("aria-hidden", String(!isTarget));
    });

    const stepIndexMap = { step1: 1, step2: 2, step3: 3, lead: 4 };
    if (stepIndexMap[name]) updateSteppers(stepIndexMap[name]);

    window.scrollTo({ top: 0, behavior: "smooth" });

    // ao entrar no lead, sempre começa no substep 1
    if (name === "lead") {
        leadStep = 1;
        setLeadStep(1);
        updateLeadPreview();
    }

    setTimeout(() => {
        const focusMap = {
            step1: "#roomsInput",
            step2: "#hourValueInput",
            step3: "#holesInput",
            lead: "#challengeInput"
        };
        const el = focusMap[name] ? $(focusMap[name]) : null;
        if (el) el.focus();
    }, 80);
}

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
    $("#resultRecoverable").textContent = formatBRL(recoverable);

    $("#resultEquipCount").textContent = `${equipmentCount || 0} equipamentos`;
    $("#resultMonthlyAd").textContent = `${formatBRL(monthlyAd)}/mês`;
}

/* ====== Lead substeps ====== */

function setLeadStep(n) {
    leadStep = n;
    $$(".leadStep").forEach(s => {
        s.classList.toggle("is-active", Number(s.dataset.leadStep) === n);
    });
    validateLeadSteps();
}

function readLeadStep1() {
    state.lead.challenge = ($("#challengeInput")?.value || "").trim();
    state.lead.accessCount = ($("#accessCountInput")?.value || "").trim();
    state.lead.hasSystem = ($('input[name="hasSystem"]:checked')?.value || "").trim();
}

function readLeadStep2() {
    state.lead.area = ($("#areaInput")?.value || "").trim();
    state.lead.subscriber = ($("#subscriberInput")?.value || "").trim();
    state.lead.investment = ($("#investmentInput")?.value || "").trim();
}

function readLeadStep3() {
    state.lead.name = ($("#nameInput")?.value || "").trim();
    state.lead.phone = ($("#phoneInput")?.value || "").trim();
    state.lead.email = ($("#emailInput")?.value || "").trim();
    state.lead.role = ($("#roleInput")?.value || "").trim();
    state.lead.site = ($("#siteInput")?.value || "").trim();
}

function validateLeadSteps() {
    // step 1
    readLeadStep1();
    const ok1 = !!(state.lead.challenge && state.lead.accessCount && state.lead.hasSystem);
    const next1 = $("#leadNext1");
    if (next1) next1.disabled = !ok1;

    // step 2
    readLeadStep2();
    const ok2 = !!(state.lead.area && state.lead.subscriber && state.lead.investment);
    const next2 = $("#leadNext2");
    if (next2) next2.disabled = !ok2;

    // step 3 (submit)
    readLeadStep3();
    const ok3 =
        state.lead.name.length >= 3 &&
        state.lead.phone.length >= 8 &&
        state.lead.email.includes("@") &&
        state.lead.role.length >= 2;

    const submitBtn = $("#toResultBtn");
    if (submitBtn) submitBtn.disabled = !ok3;

    return { ok1, ok2, ok3 };
}

/* ====== Navegação principal ====== */
$("#startBtn").addEventListener("click", () => setActiveView("step1"));

$("#toStep2Btn").addEventListener("click", () => setActiveView("step2"));
$("#toStep3Btn").addEventListener("click", () => setActiveView("step3"));

$("#toLeadBtn").addEventListener("click", () => {
    updateLeadPreview();
    setActiveView("lead");
});

$$("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => {
        const back = btn.getAttribute("data-back");
        if (back) setActiveView(back);
    });
});

/* ====== Steps 1–3 validação ====== */
function validateStep1() {
    state.rooms = parseIntSafe($("#roomsInput").value);
    $("#toStep2Btn").disabled = !(state.rooms && state.rooms > 0);
}
function validateStep2() {
    state.hourValue = parseIntSafe($("#hourValueInput").value);
    $("#toStep3Btn").disabled = !(state.hourValue && state.hourValue > 0);
}
function validateStep3() {
    state.holes = parseIntSafe($("#holesInput").value);
    $("#toLeadBtn").disabled = !(state.holes && state.holes > 0);
}

$("#roomsInput").addEventListener("input", validateStep1);
$("#hourValueInput").addEventListener("input", (e) => {
    const cleaned = onlyDigits(e.target.value).slice(0, 9);
    e.target.value = cleaned;
    validateStep2();
});
$("#holesInput").addEventListener("input", validateStep3);

/* ====== Lead substeps: botões ====== */
$("#leadNext1")?.addEventListener("click", () => setLeadStep(2));
$("#leadBack2")?.addEventListener("click", () => setLeadStep(1));
$("#leadNext2")?.addEventListener("click", () => setLeadStep(3));
$("#leadBack3")?.addEventListener("click", () => setLeadStep(2));

/* ====== Lead substeps: listeners ====== */
["#challengeInput", "#accessCountInput", "#areaInput", "#subscriberInput", "#investmentInput",
    "#nameInput", "#phoneInput", "#emailInput", "#roleInput", "#siteInput"
].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("input", validateLeadSteps);
    el.addEventListener("change", validateLeadSteps);
});

$$('input[name="hasSystem"]').forEach(r => {
    r.addEventListener("change", validateLeadSteps);
});

/* Submit -> Result */
$("#leadForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const { ok1, ok2, ok3 } = validateLeadSteps();
    if (!ok1) return setLeadStep(1);
    if (!ok2) return setLeadStep(2);
    if (!ok3) return setLeadStep(3);

    updateResultUI();
    setActiveView("result");

    // Se você quiser ver tudo que foi preenchido:
    // console.log("Lead payload:", JSON.stringify(state.lead, null, 2));
});

/* CTAs finais (coloque seus links reais aqui) */
$("#ctaStrategyBtn")?.addEventListener("click", () => {
    alert("Ajuste este botão com seu link de agendamento.");
});

$("#ctaWhatsBtn")?.addEventListener("click", () => {
    alert("Ajuste este botão com seu link do WhatsApp.");
});

/* Inicial */
validateStep1();
validateStep2();
validateStep3();
