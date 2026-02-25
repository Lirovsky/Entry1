(function () {
    "use strict";

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const views = $$(".view");

    /**
     * Etapas que EXISTEM no HTML hoje.
     * (no index: 1, 2 e 3)
     */
    const LEAD_STEP_ORDER = [1, 2, 3];
    const TOTAL_STEPS = LEAD_STEP_ORDER.length;

    const state = {
        chairs: null, // cadeiras de atendimento
        hourValue: null,
        holes: null,

        // qualificação (modal especialista)
        area: "",
        teamSize: "",
        isSubscriber: "",

        // etapa 3 (modal especialista)
        specialistChallenge: "",
        usesSystem: "",
        investmentOk: "",


        // contato (ambos os modais)
        leadName: "",
        leadPhone: "",
        leadEmail: "",
    };

    // Persistência simples para reaproveitar nome/whats/e-mail entre modais
    const CONTACT_STORAGE_KEY = "ce_lead_contact_v1";

    const POPUP_WEBHOOK_URL =
        "https://n8n.clinicaexperts.com.br/webhook/d2f443f4-9d71-4b35-b370-96cefea1e9f8";

    const WEEKS_PER_YEAR = 48;
    const RECOVERABLE_RATE = 0.8;
    const EQUIPMENT_PRICE = 15000;

    let leadStepIndex = 1; // 1..TOTAL_STEPS (índice lógico)

    /* ====================================================================== */
    /* Helpers */
    /* ====================================================================== */

    function onlyDigits(s) {
        return String(s || "").replace(/\D+/g, "");
    }

    function parseIntSafe(value) {
        const d = onlyDigits(value);
        if (!d) return null;
        const n = Number(d);
        return Number.isFinite(n) ? n : null;
    }

    function isValidEmail(email) {
        const e = String(email || "").trim();
        // validação simples (estrutura) – sem ser excessivamente restritiva
        return e.includes("@") && e.includes(".") && e.length >= 6;
    }

    const BRL_FORMATTER = (() => {
        try {
            return new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
        } catch (_) {
            return null;
        }
    })();

    function formatBRL(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return "R$ 0,00";
        if (BRL_FORMATTER) return BRL_FORMATTER.format(v);
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(v);
    }



    /* ====================================================================== */
    /* Result Counter (0 -> valor) */
    /* ====================================================================== */

    let resultAnimCancels = [];

    function cancelResultCounters() {
        if (!resultAnimCancels.length) return;
        resultAnimCancels.forEach((fn) => {
            try { if (typeof fn === "function") fn(); } catch (_) { }
        });
        resultAnimCancels = [];
    }

    function prefersReducedMotion() {
        try {
            return (
                window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            );
        } catch (_) {
            return false;
        }
    }

    // Mais desaceleração perto do fim (quanto maior, mais \"freia\" no final)
    const RESULT_EASING_POWER = 5;

    function easeOutCubic(t) {
        const x = Math.max(0, Math.min(1, Number(t) || 0));
        return 1 - Math.pow(1 - x, RESULT_EASING_POWER);
    }

    function animateNumber({ from = 0, to = 0, duration = 3000, onUpdate, onComplete }) {
        let raf = 0;
        let start = 0;

        const cancel = () => {
            if (!raf) return;
            try { cancelAnimationFrame(raf); } catch (_) { }
            raf = 0;
        };

        const step = (ts) => {
            if (!start) start = ts;
            const p = Math.min(1, (ts - start) / Math.max(1, duration));
            const eased = easeOutCubic(p);
            const val = from + (to - from) * eased;

            try {
                if (typeof onUpdate === "function") onUpdate(val);
            } catch (_) { }

            if (p < 1) raf = requestAnimationFrame(step);
            else {
                try {
                    if (typeof onUpdate === "function") onUpdate(to);
                    if (typeof onComplete === "function") onComplete();
                } catch (_) { }
            }
        };

        raf = requestAnimationFrame(step);
        return cancel;
    }

    function animateCurrency(el, to, suffix, duration) {
        if (!el) return null;
        const end = Number(to);
        const target = Number.isFinite(end) ? end : 0;
        const dur = Number(duration) > 0 ? Number(duration) : 3000;
        const suf = String(suffix || "");

        el.textContent = `${formatBRL(0)}${suf}`;

        return animateNumber({
            from: 0,
            to: target,
            duration: dur,
            onUpdate: (v) => {
                el.textContent = `${formatBRL(v)}${suf}`;
            },
        });
    }

    function startResultCounters() {
        cancelResultCounters();

        const { weeklyLoss, annualLoss, monthlyAd } = compute();

        const resultName = $("#resultName");
        if (resultName) resultName.textContent = "Sua clínica";

        // Preenche os blocos extras (resumo + cálculo) imediatamente
        fillResultExtras({ weeklyLoss, annualLoss, monthlyAd });

        const annualEl = $("#resultAnnualLoss");
        const weeklyEl = $("#resultWeeklyLoss");

        if (prefersReducedMotion()) {
            if (annualEl) annualEl.textContent = `${formatBRL(annualLoss)}/ano`;
            if (weeklyEl) weeklyEl.textContent = `${formatBRL(weeklyLoss)}/semana`;
            return;
        }

        const cancels = [];
        const c1 = animateCurrency(annualEl, annualLoss, "/ano", 3000);
        const c2 = animateCurrency(weeklyEl, weeklyLoss, "/semana", 3000);

        if (c1) cancels.push(c1);
        if (c2) cancels.push(c2);

        resultAnimCancels = cancels;
    }
    function getCookie(name) {
        const cookies = String(document.cookie || "")
            .split(";")
            .map((s) => s.trim());
        for (const c of cookies) {
            if (c.startsWith(name + "=")) return decodeURIComponent(c.slice(name.length + 1));
        }
        return "";
    }

    function normalizePhoneBRNational(raw) {
        // Retorna somente DDD + número (sem o 55), mantendo os dígitos como o usuário digitou.
        // Importante: NÃO trunca para 11 aqui, para evitar "sobrescrever" dígitos quando o cursor está no meio.
        let d = onlyDigits(raw).replace(/^0+/, "");
        if (!d) return "";
        if (d.startsWith("55")) d = d.slice(2);
        return d;
    }

    function normalizePhoneBR55(raw) {
        // Saída esperada: 55 + DDD(2) + 9 + 8 dígitos => 13 dígitos (sem "+" e sem espaços)
        let d = normalizePhoneBRNational(raw);
        if (!d) return "";

        // Se veio sem o "9" (10 dígitos: DDD + 8), insere o 9 após o DDD
        if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);

        // Agora precisa ser 11 (DDD + 9 + 8)
        if (d.length !== 11) return "";

        return "55" + d;
    }


    function normalizeTeam(teamLabel) {
        const t = String(teamLabel || "").trim();
        const map = {
            "Somente eu": "1",
            "Eu e mais uma pessoa": "2",
            "De 3 a 5 pessoas": "3 a 5",
            "De 6 a 10 pessoas": "6 a 10",
            "Mais de 10 pessoas": "Mais de 10",
        };
        return map[t] || t;
    }

    function normalizeAreaValue(rawArea) {
        const raw = String(rawArea || "").trim();
        if (!raw) return "";

        // 1) Se vier label (ex: "Biomedicina"), converte pra slug
        const slug = mapAreaSlug(raw);
        if (slug) return slug;

        // 2) Se já vier slug (ex: "biomedicine"), mantém
        const maybe = raw.toLowerCase();
        const allowed = new Set([
            "aesthetic",
            "dentistry",
            "medicine",
            "biomedicine",
            "physiotherapy",
            "psychology",
            "nutrition",
            "beauty",
            "depilation",
            "lash-designer",
            "manicure-pedicure",
            "massage-therapy",
            "microblading",
            "micropigmentation",
            "podiatry",
            "default",
        ]);
        if (allowed.has(maybe)) return maybe;

        // fallback seguro
        return "default";
    }

    function mapAreaSlug(areaLabel) {
        const raw = String(areaLabel || "").trim();
        const a = raw.toLowerCase();
        const aNorm = a.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const map = {
            estética: "aesthetic",
            estetica: "aesthetic",
            odontologia: "dentistry",
            medicina: "medicine",
            biomedicina: "biomedicine",
            fisioterapia: "physiotherapy",
            psicologia: "psychology",
            nutrição: "nutrition",
            nutricao: "nutrition",
            podologia: "podiatry",
            massoterapia: "massage-therapy",
            micropigmentação: "micropigmentation",
            micropigmentacao: "micropigmentation",
            microblading: "microblading",
            "manicure/pedicure": "manicure-pedicure",
            "manicure / pedicure": "manicure-pedicure",
            "lash designer": "lash-designer",
            depilação: "depilation",
            depilacao: "depilation",
            "salão de beleza": "beauty",
            "salao de beleza": "beauty",
            outra: "default",
        };

        return map[a] || map[aNorm] || "";
    }

    function pickTrackingFromUrl() {
        const p = new URLSearchParams(window.location.search || "");

        const out = {};
        const keys = [
            "utm_campaign",
            "utm_content",
            "utm_id",
            "utm_medium",
            "utm_source",
            "utm_term",
            "fbclid",
            "gclid",
            "wbraid",
            "gbraid",
        ];

        keys.forEach((k) => {
            const v = p.get(k);
            if (v) out[k] = v;
        });

        const utmSearch = p.get("utm_search") || p.get("utm-search");
        if (utmSearch) out.utm_search = utmSearch;

        return out;
    }

    function getOrCreateEventId() {
        try {
            let eventId = window.localStorage.getItem("lead_event_id");
            if (!eventId) {
                const uuid =
                    window.crypto && typeof window.crypto.randomUUID === "function"
                        ? window.crypto.randomUUID()
                        : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
                            .toString(16)
                            .slice(2)}`;
                eventId = "lead-" + uuid;
                window.localStorage.setItem("lead_event_id", eventId);
            }
            return eventId;
        } catch (_) {
            const uuid =
                window.crypto && typeof window.crypto.randomUUID === "function"
                    ? window.crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
                        .toString(16)
                        .slice(2)}`;
            return "lead-" + uuid;
        }
    }

    function getFbp() {
        const fromCookie = getCookie("_fbp");
        if (fromCookie) return fromCookie;
        const p = new URLSearchParams(window.location.search || "");
        return p.get("fbp") || "";
    }

    function saveLeadContactToStorage() {
        try {
            const payload = {
                name: String(state.leadName || "").trim(),
                phone: normalizePhoneBRNational(state.leadPhone || ""), // 11 dígitos (DDD+9+8)
                email: String(state.leadEmail || "").trim(),
                ts: Date.now(),
            };
            window.localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(payload));
        } catch (_) { }
    }

    function loadLeadContactFromStorage(force = false) {
        try {
            const raw = window.localStorage.getItem(CONTACT_STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || typeof data !== "object") return;

            const name = String(data.name || "").trim();
            const phone = normalizePhoneBRNational(data.phone || "").slice(0, 11);
            const email = String(data.email || "").trim();

            if (force || !state.leadName) state.leadName = name;
            if (force || !state.leadPhone) state.leadPhone = phone;
            if (force || !state.leadEmail) state.leadEmail = email;
        } catch (_) { }
    }

    function buildPopupWebhookPayload() {
        // Payload enviado para o webhook do n8n (agora enviado SOMENTE no #specialistModal)
        // Mapeamento:
        // - challenge: value de "Qual desafio você busca resolver?"
        // - area: value de "Qual sua área de atuação?"
        // - team: value de "Quantas pessoas terão acesso ao sistema?"
        // - system: "yes" | "no" (Você já utiliza algum sistema de gestão?)
        // - active: "yes" | "no" (Você já é assinante do Clínica Experts?)
        // - money: "yes" | "no" (Investimento faz sentido?)

        const challenge = String(state.specialistChallenge || "").trim();
        const area = normalizeAreaValue(state.area);
        const team = normalizeTeam(state.teamSize);
        const system = state.usesSystem || "";
        const active = state.isSubscriber || "";
        const money = state.investmentOk || "";

        const name = state.leadName || "";
        const phone = state.leadPhone ? normalizePhoneBR55(state.leadPhone) : "";
        const email = state.leadEmail || "";

        const event_id = getOrCreateEventId();
        const fbp = getFbp();

        const referrer = document.referrer || "";
        const source_url = window.location.href;
        const user_agent = navigator.userAgent || "";
        const urlFields = pickTrackingFromUrl();

        // Mantém a ordem do payload (insertion order)
        const payload = {};

        payload.challenge = challenge;
        payload.area = area;
        payload.team = team;
        payload.system = system;
        payload.active = active;
        payload.money = money;

        if (email) payload.email = email;

        payload.event = "diagnostico";
        payload.event_id = event_id;

        if (urlFields.fbclid) payload.fbclid = urlFields.fbclid;
        if (urlFields.gclid) payload.gclid = urlFields.gclid;
        if (urlFields.wbraid) payload.wbraid = urlFields.wbraid;
        if (urlFields.gbraid) payload.gbraid = urlFields.gbraid;
        if (fbp) payload.fbp = fbp;

        if (name) payload.name = name;
        if (phone) payload.phone = phone;

        payload.referrer = referrer;
        payload.source_url = source_url;
        payload.user_agent = user_agent;

        if (urlFields.utm_campaign) payload.utm_campaign = urlFields.utm_campaign;
        if (urlFields.utm_content) payload.utm_content = urlFields.utm_content;
        if (urlFields.utm_id) payload.utm_id = urlFields.utm_id;
        if (urlFields.utm_medium) payload.utm_medium = urlFields.utm_medium;
        if (urlFields.utm_source) payload.utm_source = urlFields.utm_source;
        if (urlFields.utm_term) payload.utm_term = urlFields.utm_term;
        if (urlFields.utm_search) payload.utm_search = urlFields.utm_search;

        return payload;
    }

    async function postToWebhook(url, payloadObj) {
        const body = JSON.stringify(payloadObj);

        try {
            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                keepalive: true,
            });
            return;
        } catch (_) { }

        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
                navigator.sendBeacon(url, blob);
                return;
            }
        } catch (_) { }

        try {
            await fetch(url, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "text/plain;charset=UTF-8" },
                body,
                keepalive: true,
            });
        } catch (_) { }
    }

    /* ====================================================================== */
    /* Cálculo */
    /* ====================================================================== */

    function compute() {
        const hour = Number(state.hourValue || 0);
        // "holes" aqui deve representar o TOTAL de horários vagos na semana (somando todas as salas/cadeiras)
        const holes = Number(state.holes || 0);

        // Se "horários vagos" já é o total semanal da clínica, não multiplica por cadeiras.
        const weeklyLoss = hour * holes;
        const annualLoss = weeklyLoss * WEEKS_PER_YEAR;
        const recoverable = annualLoss * RECOVERABLE_RATE;

        const equipmentCount = Math.floor(annualLoss / EQUIPMENT_PRICE);
        const monthlyAd = annualLoss / 12;

        return { weeklyLoss, annualLoss, recoverable, equipmentCount, monthlyAd };
    }

    /* ====================================================================== */
    /* Views */
    /* ====================================================================== */

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

    /* ====================================================================== */
    /* Stepper */
    /* ====================================================================== */

    function updateSteppers(active) {
        $$(".stepper").forEach((stepper) => {
            const steps = Array.from(stepper.querySelectorAll(".step"));
            steps.forEach((step) => {
                const idx = Number(step.dataset.index);

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

    /* ====================================================================== */
    /* UI updates */
    /* ====================================================================== */

    function updateLeadPreview() {
        const { annualLoss } = compute();
        const el = $("#leadAnnualLoss");
        if (el) el.textContent = formatBRL(annualLoss);
    }

    function fillResultExtras({ weeklyLoss, annualLoss, monthlyAd }) {
        // Resumo do cenário
        const chairsEl = $("#resultChairs");
        if (chairsEl) chairsEl.textContent = state.chairs ? String(state.chairs) : "—";

        const hourEl = $("#resultHourValue");
        if (hourEl) hourEl.textContent = state.hourValue ? formatBRL(state.hourValue) : "—";

        const holesEl = $("#resultHoles");
        if (holesEl) holesEl.textContent = state.holes ? String(state.holes) : "—";

        const monthlyEl = $("#resultMonthlyLoss");
        if (monthlyEl) monthlyEl.textContent = Number.isFinite(Number(monthlyAd)) ? formatBRL(monthlyAd) : "—";

        // Como chegamos nesse número
        const calcHoles = $("#calcHoles");
        if (calcHoles) calcHoles.textContent = state.holes ? String(state.holes) : "—";

        const calcHour = $("#calcHourValue");
        if (calcHour) calcHour.textContent = state.hourValue ? formatBRL(state.hourValue) : "—";

        const calcWeekly = $("#calcWeeklyLoss");
        if (calcWeekly) calcWeekly.textContent = Number.isFinite(Number(weeklyLoss)) ? formatBRL(weeklyLoss) : "—";

        const calcAnnual = $("#calcAnnualLoss");
        if (calcAnnual) calcAnnual.textContent = Number.isFinite(Number(annualLoss)) ? formatBRL(annualLoss) : "—";
    }

    function updateResultUI() {
        const { weeklyLoss, annualLoss, monthlyAd } = compute();

        const resultName = $("#resultName");
        if (resultName) resultName.textContent = "Sua clínica";

        const annualEl = $("#resultAnnualLoss");
        if (annualEl) annualEl.textContent = `${formatBRL(annualLoss)}/ano`;

        const weeklyEl = $("#resultWeeklyLoss");
        if (weeklyEl) weeklyEl.textContent = `${formatBRL(weeklyLoss)}/semana`;

        fillResultExtras({ weeklyLoss, annualLoss, monthlyAd });
    }

    /* ====================================================================== */
    /* Lead Flow (3 passos) */
    /* ====================================================================== */

    function setLeadStep(n) {
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
        const map = { 1: "#chairsInput", 2: "#hourValueInput", 3: "#holesInput" };
        setTimeout(() => {
            const sel = map[n];
            if (!sel) return;
            const el = $(sel);
            if (el && typeof el.focus === "function") el.focus();
        }, 80);
    }

    function readAllInputs() {
        state.chairs = parseIntSafe($("#chairsInput")?.value);
        state.hourValue = parseIntSafe($("#hourValueInput")?.value);
        state.holes = parseIntSafe($("#holesInput")?.value);
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

        setDisabled("#leadNext1", !ok1);
        setDisabled("#leadNext2", !ok2);
        setDisabled("#toResultBtn", !ok3);

        return { ok1, ok2, ok3 };
    }

    /* ====================================================================== */
    /* Modal 1: desbloquear resultado (SHORT) */
    /* ====================================================================== */

    const preResultModal = $("#preResultModal");
    const preResultFormShort = $("#preResultFormShort");
    let lastFocusElPre = null;

    function prefillPreResultFromState() {
        const n = $("#preNameInput");
        const p = $("#prePhoneInput");
        const e = $("#preEmailInput");

        if (n && !String(n.value || "").trim() && state.leadName) n.value = state.leadName;
        if (p && !String(p.value || "").trim() && state.leadPhone) {
            p.value = state.leadPhone;
            // Aplica máscara imediatamente quando preenche via código
            try { p.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) { }
        }
        if (e && !String(e.value || "").trim() && state.leadEmail) e.value = state.leadEmail;
    }

    function openPreResultModal() {
        if (!preResultModal) return;

        // zera qualificação (este popup não pergunta)
        state.area = "";
        state.teamSize = "";
        state.isSubscriber = "";

        lastFocusElPre = document.activeElement;
        preResultModal.hidden = false;
        preResultModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        // Recalcula padding do prefixo "+55" agora que o modal está visível
        requestAnimationFrame(recalcPhonePrefixAll);
        setTimeout(recalcPhonePrefixAll, 80);

        // Se o lead já preencheu antes, reaproveita (state/localStorage)
        loadLeadContactFromStorage(false);
        prefillPreResultFromState();
        validatePreResultForm();
        setTimeout(() => {
            const el = $("#preNameInput");
            if (el && typeof el.focus === "function") el.focus();
        }, 60);
    }

    function closePreResultModal() {
        if (!preResultModal) return;
        preResultModal.hidden = true;
        preResultModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        if (lastFocusElPre && typeof lastFocusElPre.focus === "function") {
            try {
                lastFocusElPre.focus();
            } catch (_) { }
        }
    }

    function readPreResultInputs() {
        state.leadName = String($("#preNameInput")?.value || "").trim();
        state.leadPhone = normalizePhoneBRNational($("#prePhoneInput")?.value || "");
        state.leadEmail = String($("#preEmailInput")?.value || "").trim();
    }

    function validatePreResultForm() {
        readPreResultInputs();

        const okName = state.leadName.length >= 2;
        const okPhone = !!normalizePhoneBR55(state.leadPhone);
        const okEmail = isValidEmail(state.leadEmail);

        const submitBtn = $("#preResultSubmitBtn");
        if (submitBtn) submitBtn.disabled = !(okName && okPhone && okEmail);

        return { okName, okPhone, okEmail };
    }

    /* ====================================================================== */
    /* Modal 2: falar com especialista (FULL) */
    /* ====================================================================== */

    const specialistModal = $("#specialistModal");
    const specialistForm = $("#specialistForm");

    const SPECIALIST_TOTAL_STEPS = 3;
    let specialistStepIndex = 1;
    let lastFocusElSpecialist = null;

    function updateSpecialistStepper(active) {
        if (!specialistModal) return;
        const steps = Array.from(specialistModal.querySelectorAll(".stepperModal .stepModal"));
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

    function setSpecialistStep(n) {
        specialistStepIndex = Math.max(1, Math.min(SPECIALIST_TOTAL_STEPS, Number(n) || 1));
        if (!specialistModal) return;

        Array.from(specialistModal.querySelectorAll(".qualifyStep")).forEach((s) => {
            s.classList.toggle("is-active", Number(s.dataset.qualifyStep) === specialistStepIndex);
        });

        updateSpecialistStepper(specialistStepIndex);

        // Ao chegar na etapa de contato, reaproveita dados do 1º formulário
        if (specialistStepIndex === 3) {
            loadLeadContactFromStorage(false);
            prefillSpecialistFromState();

            // Recalcula o padding do prefixo "+55" agora que o campo ficou visível
            // (na etapa 3 o container estava oculto, então a medição anterior pode ter sido 0)
            requestAnimationFrame(recalcPhonePrefixAll);
            setTimeout(recalcPhonePrefixAll, 80);
        }

        validateSpecialistForm();
        focusSpecialistStep(specialistStepIndex);
    }

    function focusSpecialistStep(n) {
        const map = { 1: "#challengeInput", 2: "#areaInput", 3: "#nameInput" };
        setTimeout(() => {
            const sel = map[n];
            const el = sel ? $(sel) : null;
            if (el && typeof el.focus === "function") el.focus();
        }, 60);
    }

    function readSpecialistInputs() {
        state.area = String($("#areaInput")?.value || "").trim();
        state.teamSize = String($("#teamSizeInput")?.value || "").trim();

        const subRaw = String($("#subscriberInput")?.value || "").trim().toLowerCase();
        if (subRaw === "sim") state.isSubscriber = "yes";
        else if (subRaw === "não" || subRaw === "nao") state.isSubscriber = "no";
        else state.isSubscriber = "";

        state.leadName = String($("#nameInput")?.value || "").trim();
        state.leadPhone = normalizePhoneBRNational($("#phoneInput")?.value || "");
        state.leadEmail = String($("#emailInput")?.value || "").trim();

        // etapa 3
        state.specialistChallenge = String($("#challengeInput")?.value || "").trim();

        const usesRaw = String($("#usesSystemInput")?.value || "").trim().toLowerCase();
        if (usesRaw === "sim") state.usesSystem = "yes";
        else if (usesRaw === "não" || usesRaw === "nao") state.usesSystem = "no";
        else state.usesSystem = "";

        const invRaw = String($("#investmentOkInput")?.value || "").trim().toLowerCase();
        if (invRaw === "sim") state.investmentOk = "yes";
        else if (invRaw === "não" || invRaw === "nao") state.investmentOk = "no";
        else state.investmentOk = "";
    }



    function validateSpecialistForm() {
        readSpecialistInputs();

        // Etapa 1
        const okChallenge = !!state.specialistChallenge;
        const okTeam = state.teamSize.length >= 2;
        const okUsesSystem = state.usesSystem === "yes" || state.usesSystem === "no";
        const okStep1 = okChallenge && okTeam && okUsesSystem;

        // Etapa 2
        const okArea = state.area.length >= 2;
        const okSub = state.isSubscriber === "yes" || state.isSubscriber === "no";
        const okInvestment = state.investmentOk === "yes" || state.investmentOk === "no";
        const okStep2 = okArea && okSub && okInvestment;

        // Etapa 3 (contato)
        const okName = state.leadName.length >= 2;
        const okPhone = !!normalizePhoneBR55(state.leadPhone);
        const okEmail = isValidEmail(state.leadEmail);
        const okStep3 = okName && okPhone && okEmail;

        const nextBtn1 = $("#qualifyNextBtn");
        if (nextBtn1) nextBtn1.disabled = !okStep1;

        const nextBtn2 = $("#qualifyNextBtn2");
        if (nextBtn2) nextBtn2.disabled = !(okStep1 && okStep2);

        const submitBtn = $("#qualifySubmitBtn");
        if (submitBtn) submitBtn.disabled = !(okStep1 && okStep2 && okStep3);

        return { okStep1, okStep2, okStep3 };
    }


    function prefillSpecialistFromState() {
        const n = $("#nameInput");
        const p = $("#phoneInput");
        const e = $("#emailInput");

        if (n && !String(n.value || "").trim() && state.leadName) n.value = state.leadName;
        if (p && !String(p.value || "").trim() && state.leadPhone) {
            p.value = state.leadPhone;
            // Aplica máscara imediatamente quando preenche via código
            try { p.dispatchEvent(new Event("input", { bubbles: true })); } catch (_) { }
        }
        if (e && !String(e.value || "").trim() && state.leadEmail) e.value = state.leadEmail;
    }

    function openSpecialistModal() {
        if (!specialistModal) return;
        lastFocusElSpecialist = document.activeElement;
        specialistModal.hidden = false;
        specialistModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        // Recalcula padding do prefixo "+55" agora que o modal está visível
        requestAnimationFrame(recalcPhonePrefixAll);
        setTimeout(recalcPhonePrefixAll, 80);

        // reseta respostas da qualificação (para não reaproveitar seleção anterior)
        state.area = "";
        state.teamSize = "";
        state.isSubscriber = "";
        state.specialistChallenge = "";
        state.usesSystem = "";
        state.investmentOk = "";

        const resetSelect = (sel) => {
            const el = $(sel);
            if (!el) return;
            el.value = "";
            el.dispatchEvent(new Event("change", { bubbles: true }));
        };

        resetSelect("#areaInput");
        resetSelect("#teamSizeInput");
        resetSelect("#subscriberInput");
        resetSelect("#challengeInput");
        resetSelect("#usesSystemInput");
        resetSelect("#investmentOkInput");

        loadLeadContactFromStorage(false);
        prefillSpecialistFromState();
        setSpecialistStep(1);
    }


    function closeSpecialistModal() {
        if (!specialistModal) return;
        specialistModal.hidden = true;
        specialistModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        if (lastFocusElSpecialist && typeof lastFocusElSpecialist.focus === "function") {
            try {
                lastFocusElSpecialist.focus();
            } catch (_) { }
        }
    }

    /* ====================================================================== */
    /* Await -> Result */
    /* ====================================================================== */

    let awaitTimer = null;
    let awaitMsgTimer = null;

    function startAwaitThenResult() {
        setActiveView("await");

        const msgs = [
            "Processando suas respostas…",
            "Calculando o impacto no seu faturamento…",
            "Preparando seu resultado…",
        ];
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
            setActiveView("result");
            startResultCounters();
        }, 4000);
    }

    /* ====================================================================== */
    /* Navegação / Eventos */
    /* ====================================================================== */

    $("#startBtn")?.addEventListener("click", () => setActiveView("lead"));

    $$("[data-back]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const back = btn.getAttribute("data-back");
            if (back) setActiveView(back);
        });
    });

    $("#leadNext1")?.addEventListener("click", () => setLeadStep(2));
    $("#leadNext2")?.addEventListener("click", () => setLeadStep(3));
    $("#leadBack2")?.addEventListener("click", () => setLeadStep(1));
    $("#leadBack3")?.addEventListener("click", () => setLeadStep(2));

    $("#leadForm")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = validateLeadSteps();
        if (!v.ok1) return setLeadStep(1);
        if (!v.ok2) return setLeadStep(2);
        if (!v.ok3) return setLeadStep(3);
        openPreResultModal();
    });

    $("#preResultCloseBtn")?.addEventListener("click", closePreResultModal);
    $("#preResultCancelBtn")?.addEventListener("click", closePreResultModal);

    preResultModal?.addEventListener("click", (e) => {
        if (e.target === preResultModal) closePreResultModal();
    });

    preResultFormShort?.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = validatePreResultForm();
        if (!(v.okName && v.okPhone && v.okEmail)) return;

        // Salva para reaproveitar no formulário de "Fale com o especialista"
        saveLeadContactToStorage();

        // Envio SIMPLES (somente nome/whatsapp/e-mail)
        // event: "diagnostico-n8n-data"
        const payload = {};
        payload.name = state.leadName || "";
        payload.phone = state.leadPhone ? normalizePhoneBR55(state.leadPhone) : "";
        payload.email = state.leadEmail || "";
        payload.event = "diagnostico-n8n-data";
        void postToWebhook(POPUP_WEBHOOK_URL, payload);

        closePreResultModal();
        startAwaitThenResult();
    });

    $("#ctaSpecialistBtn")?.addEventListener("click", openSpecialistModal);

    $("#specialistCloseBtn")?.addEventListener("click", closeSpecialistModal);
    $("#qualifyCancelBtn")?.addEventListener("click", closeSpecialistModal);
    $("#qualifyBackBtn")?.addEventListener("click", () => setSpecialistStep(1));
    $("#qualifyBackBtn3")?.addEventListener("click", () => setSpecialistStep(2));
    $("#qualifyNextBtn")?.addEventListener("click", () => {
        const v = validateSpecialistForm();
        if (!v.okStep1) return;
        setSpecialistStep(2);
    });

    $("#qualifyNextBtn2")?.addEventListener("click", () => {
        const v = validateSpecialistForm();
        if (!(v.okStep1 && v.okStep2)) return;
        setSpecialistStep(3);
    });

    specialistModal?.addEventListener("click", (e) => {
        if (e.target === specialistModal) closeSpecialistModal();
    });

    specialistForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = validateSpecialistForm();

        if (!v.okStep1) return setSpecialistStep(1);

        // Enter em etapas anteriores: avança (não envia ainda)
        if (specialistStepIndex === 1) {
            return setSpecialistStep(2);
        }

        if (!v.okStep2) return setSpecialistStep(2);
        if (specialistStepIndex === 2) {
            return setSpecialistStep(3);
        }

        if (!v.okStep3) return setSpecialistStep(3);

        // Atualiza cache (caso o lead edite os dados na etapa 3)
        saveLeadContactToStorage();

        const payload = buildPopupWebhookPayload();
        void postToWebhook(POPUP_WEBHOOK_URL, payload);

        // Após disparar o webhook, exibe a tela de obrigado
        closeSpecialistModal();
        setActiveView("specialistThanks");
    });


    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (specialistModal && !specialistModal.hidden) closeSpecialistModal();
        else if (preResultModal && !preResultModal.hidden) closePreResultModal();
    });

    /* ====================================================================== */
    /* Listeners inputs */
    /* ====================================================================== */

    const chairsEl = $("#chairsInput");
    if (chairsEl) {
        chairsEl.addEventListener("input", (e) => {
            e.target.value = onlyDigits(e.target.value).slice(0, 3);
            validateLeadSteps();
        });
    }

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

    /* ====================================================================== */
    /* Tecla Enter: atalhos de avanço */
    /* ====================================================================== */

    function getActiveViewName() {
        const v = document.querySelector(".view.is-active");
        return v && v.dataset ? String(v.dataset.view || "") : "";
    }

    function isAnyModalOpen() {
        const preOpen = preResultModal && !preResultModal.hidden;
        const spOpen = specialistModal && !specialistModal.hidden;
        return !!(preOpen || spOpen);
    }

    // Landing: Enter inicia a simulação
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (e.isComposing) return;
        if (isAnyModalOpen()) return;

        const active = getActiveViewName();
        if (active !== "landing") return;

        // Evita comportamento duplicado quando o foco já está no botão
        const t = e.target;
        if (t && t.id === "startBtn") return;

        e.preventDefault();
        $("#startBtn")?.click();
    });

    function tryAdvanceLeadByEnter(step) {
        const active = getActiveViewName();
        if (active !== "lead") return;

        const v = validateLeadSteps();

        if (step === 1) {
            if (!v.ok1) return;
            $("#leadNext1")?.click();
            return;
        }

        if (step === 2) {
            if (!v.ok2) return;
            $("#leadNext2")?.click();
            return;
        }

        if (step === 3) {
            if (!(v.ok1 && v.ok2 && v.ok3)) return;
            $("#toResultBtn")?.click();
        }
    }

    function bindEnterAdvance(inputEl, step) {
        if (!inputEl) return;
        inputEl.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            if (e.isComposing) return;
            e.preventDefault();
            tryAdvanceLeadByEnter(step);
        });
    }

    // Lead: Enter avança as etapas 1 -> 2 -> 3 e abre o pop-up do resultado
    bindEnterAdvance(chairsEl, 1);
    bindEnterAdvance(hourEl, 2);
    bindEnterAdvance(holesEl, 3);

    function tryAdvanceSpecialistByEnter() {
        const v = validateSpecialistForm();

        if (specialistStepIndex === 1) {
            if (!v.okStep1) return false;
            $("#qualifyNextBtn")?.click();
            return true;
        }

        if (specialistStepIndex === 2) {
            if (!(v.okStep1 && v.okStep2)) return false;
            $("#qualifyNextBtn2")?.click();
            return true;
        }

        return false;
    }

    // Especialista: Enter nas etapas 1 e 2 (custom selects) avança para a próxima etapa
    if (specialistForm) {
        specialistForm.addEventListener(
            "keydown",
            (e) => {
                if (e.key !== "Enter") return;
                if (e.isComposing) return;
                if (!specialistModal || specialistModal.hidden) return;
                if (specialistStepIndex !== 1 && specialistStepIndex !== 2) return;

                const t = e.target;
                const isCustomBtn =
                    t && t.classList && t.classList.contains("customSelect__button");

                if (!isCustomBtn) return;

                const wrapper = t.closest(".customSelect");
                const isOpen = wrapper && wrapper.classList.contains("is-open");
                if (isOpen) return; // quando o menu está aberto, Enter seleciona opção

                // Só intercepta Enter quando a etapa já está válida (senão deixa abrir o select)
                const advanced = tryAdvanceSpecialistByEnter();
                if (!advanced) return;

                e.preventDefault();
                e.stopPropagation();
            },
            true
        );
    }


    $("#preNameInput")?.addEventListener("input", validatePreResultForm);


    // UI: prefixo fixo "+55" dentro do campo (visual, não editável).
    // O valor do input continua apenas com DDD + número (11 dígitos), e o envio continua usando normalizePhoneBR55().
    const phonePrefixAdjusters = [];
    let phonePrefixResizeBound = false;

    function recalcPhonePrefixAll() {
        try {
            phonePrefixAdjusters.forEach((fn) => {
                try { if (typeof fn === "function") fn(); } catch (_) { }
            });
        } catch (_) { }
    }

    function ensurePhonePrefixUI(inputEl, prefixText = "+55") {
        if (!inputEl) return;
        if (inputEl.dataset.phonePrefixReady === "1") return;

        const parent = inputEl.parentNode;
        if (!parent) return;

        inputEl.dataset.phonePrefixReady = "1";

        // Cria wrapper para posicionar o prefixo dentro do campo sem alterar o value
        const wrap = document.createElement("div");
        wrap.className = "phonePrefixWrap";

        // Mantém comportamento em containers flex
        wrap.style.width = "100%";
        wrap.style.flex = "1 1 auto";

        parent.insertBefore(wrap, inputEl);
        wrap.appendChild(inputEl);

        const prefix = document.createElement("span");
        prefix.className = "phonePrefix";
        prefix.textContent = String(prefixText || "+55");
        wrap.appendChild(prefix);

        const adjustPadding = () => {
            try {
                // 16px é o padding padrão do .input
                const baseLeft = 16;
                const gap = 10;
                const wRaw = Math.ceil(prefix.getBoundingClientRect().width || 0);
                const w = Math.max(32, wRaw); // fallback quando o modal ainda está oculto
                inputEl.style.paddingLeft = (baseLeft + w + gap) + "px";
            } catch (_) { }
        };

        phonePrefixAdjusters.push(adjustPadding);

        // Ajusta após layout
        requestAnimationFrame(adjustPadding);
        setTimeout(adjustPadding, 60);

        // Ajusta após fontes carregarem (evita medir largura com fallback)
        try {
            if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
                document.fonts.ready.then(() => {
                    try { adjustPadding(); } catch (_) { }
                });
            }
        } catch (_) { }


        // Recalcula ao focar/clicar (quando o modal passa a ficar visível)
        try {
            inputEl.addEventListener("focus", adjustPadding);
            inputEl.addEventListener("click", adjustPadding);
        } catch (_) { }


        if (!phonePrefixResizeBound) {
            phonePrefixResizeBound = true;

            let rafId = 0;
            window.addEventListener("resize", () => {
                try {
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                        phonePrefixAdjusters.forEach((fn) => {
                            try { fn(); } catch (_) { }
                        });
                    });
                } catch (_) { }
            });
        }
    }


    function bindPhoneInputHardLimit(inputEl, validateFn) {
        // Agora este binder aplica máscara BR para celular (DDD + 9 + 8 dígitos),
        // mantendo o envio exatamente como antes (normalizePhoneBR55/normalizePhoneBRNational).
        if (!inputEl) return;

        // Mostra prefixo fixo "+55" no campo (visual)
        ensurePhonePrefixUI(inputEl, "+55");

        const formatBRMobile = (digits) => {
            const d = String(digits || "").slice(0, 11);
            if (!d) return "";
            let out = "(" + d.slice(0, Math.min(2, d.length));
            if (d.length >= 2) out += ")";
            if (d.length > 2) out += " " + d.slice(2, 3);
            if (d.length > 3) out += " " + d.slice(3, Math.min(7, d.length));
            if (d.length > 7) out += "-" + d.slice(7, Math.min(11, d.length));
            return out;
        };

        const countDigits = (str) => (String(str || "").match(/\d/g) || []).length;

        const caretFromDigits = (formatted, digitsCount) => {
            const target = Math.max(0, digitsCount | 0);
            if (!formatted || target === 0) return 0;
            let seen = 0;
            for (let i = 0; i < formatted.length; i++) {
                if (/\d/.test(formatted[i])) seen++;
                if (seen >= target) return i + 1;
            }
            return formatted.length;
        };

        // Ajusta atributos para máscara (sem travar somente em números no HTML)
        try {
            inputEl.setAttribute("maxlength", "16"); // "(99) 9 9999-9999"
            inputEl.setAttribute("inputmode", "tel");
            inputEl.setAttribute("autocomplete", "tel");
            inputEl.removeAttribute("pattern");
            if (!inputEl.getAttribute("placeholder") || /51999999999/.test(inputEl.getAttribute("placeholder") || "")) {
                inputEl.setAttribute("placeholder", "Ex.: (51) 9 9999-9999");
            }
        } catch (_) { }

        let lastDigits = normalizePhoneBRNational(inputEl.value || "");
        if (lastDigits.length > 11) lastDigits = lastDigits.slice(0, 11);
        inputEl.value = formatBRMobile(lastDigits);

        const getSel = () => {
            const v = String(inputEl.value || "");
            const s = inputEl.selectionStart == null ? v.length : inputEl.selectionStart;
            const e = inputEl.selectionEnd == null ? v.length : inputEl.selectionEnd;
            return { start: s, end: e, selectedText: v.slice(s, e) };
        };

        // Bloqueia inserção que exceda 11 dígitos (contando apenas números)
        inputEl.addEventListener("beforeinput", (ev) => {
            const type = String(ev.inputType || "");
            if (!type.startsWith("insert")) return;
            if (type === "insertFromPaste") return;

            const currentDigits = normalizePhoneBRNational(inputEl.value || "");
            const { selectedText } = getSel();
            const selectedDigits = countDigits(selectedText);
            const insertDigits = onlyDigits(ev.data || "").length;

            const nextLen = currentDigits.length - selectedDigits + insertDigits;
            if (nextLen > 11) ev.preventDefault();
        });

        inputEl.addEventListener("paste", (ev) => {
            const text = (ev.clipboardData || window.clipboardData)?.getData("text") || "";
            const insert = normalizePhoneBRNational(text || "");
            const currentDigits = normalizePhoneBRNational(inputEl.value || "");
            const { selectedText } = getSel();
            const selectedDigits = countDigits(selectedText);

            const nextLen = currentDigits.length - selectedDigits + insert.length;
            if (nextLen > 11) ev.preventDefault();
        });

        inputEl.addEventListener("input", () => {
            const raw = String(inputEl.value || "");
            const caret = inputEl.selectionStart == null ? raw.length : inputEl.selectionStart;
            const digitsBefore = countDigits(raw.slice(0, caret));

            let digits = normalizePhoneBRNational(raw);
            if (digits.length > 11) digits = digits.slice(0, 11);

            lastDigits = digits;

            const formatted = formatBRMobile(digits);
            inputEl.value = formatted;

            try {
                const pos = caretFromDigits(formatted, Math.min(digitsBefore, digits.length));
                inputEl.setSelectionRange(pos, pos);
            } catch (_) { }

            if (typeof validateFn === "function") validateFn();
        });
    }

    bindPhoneInputHardLimit($("#prePhoneInput"), validatePreResultForm);

    $("#preEmailInput")?.addEventListener("input", validatePreResultForm);

    $("#areaInput")?.addEventListener("change", validateSpecialistForm);
    $("#teamSizeInput")?.addEventListener("change", validateSpecialistForm);
    $("#subscriberInput")?.addEventListener("change", validateSpecialistForm);
    $("#challengeInput")?.addEventListener("change", validateSpecialistForm);
    $("#usesSystemInput")?.addEventListener("change", validateSpecialistForm);
    $("#investmentOkInput")?.addEventListener("change", validateSpecialistForm);

    $("#nameInput")?.addEventListener("input", validateSpecialistForm);
    bindPhoneInputHardLimit($("#phoneInput"), validateSpecialistForm);
    $("#emailInput")?.addEventListener("input", validateSpecialistForm);
    /* ====================================================================== */
    /* Custom Select */
    /* ====================================================================== */

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

            function positionMenu() {
                const rect = btn.getBoundingClientRect();
                const gap = 8;
                const padding = 12;

                const modal = btn.closest(".modalCard");
                const bounds = modal ? modal.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };

                const spaceBelow = bounds.bottom - rect.bottom;
                const spaceAbove = rect.top - bounds.top;
                const wanted = 200;

                const shouldOpenUp = spaceBelow < wanted && spaceAbove > spaceBelow;
                wrapper.classList.toggle("is-open-up", shouldOpenUp);

                const available = (shouldOpenUp ? spaceAbove : spaceBelow) - (gap + padding);
                const clamped = Math.max(140, Math.min(220, available));
                menu.style.maxHeight = `${clamped}px`;
            }

            function open() {
                wrapper.classList.add("is-open");
                btn.setAttribute("aria-expanded", "true");
                positionMenu();

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

            const modal = btn.closest(".modalCard");
            if (modal) {
                modal.addEventListener(
                    "scroll",
                    () => {
                        if (wrapper.classList.contains("is-open")) positionMenu();
                    },
                    { passive: true }
                );
            }

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




    /* ====================================================================== */
    /* YouTube Fullscreen (fallback p/ mobile e webviews) */
    /* ====================================================================== */

    const videoExpandBtn = document.getElementById("videoExpandBtn");
    const videoOverlay = document.getElementById("videoOverlay");
    const videoOverlayClose = document.getElementById("videoOverlayClose");
    const resultYoutubeIframe = document.getElementById("resultYoutubeIframe");
    const videoOverlayIframe = document.getElementById("videoOverlayIframe");

    function openVideoOverlay() {
        if (!videoOverlay || !videoOverlayIframe || !resultYoutubeIframe) return;

        videoOverlay.hidden = false;
        videoOverlay.setAttribute("aria-hidden", "false");

        // trava scroll (sem quebrar o layout)
        document.body.style.overflow = "hidden";

        // carrega o mesmo vídeo no overlay
        const src = resultYoutubeIframe.getAttribute("src") || "";
        videoOverlayIframe.setAttribute("src", src);

        // tenta fullscreen nativo (quando suportado)
        try {
            const el = videoOverlay;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
            if (req) req.call(el);
        } catch (_) { }
    }

    function closeVideoOverlay() {
        if (!videoOverlay || !videoOverlayIframe) return;

        videoOverlay.hidden = true;
        videoOverlay.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";

        // para o vídeo ao fechar
        videoOverlayIframe.setAttribute("src", "");

        // sai do fullscreen se estiver ativo
        try {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
            if (exit) exit.call(document);
        } catch (_) { }
    }

    if (videoExpandBtn) videoExpandBtn.addEventListener("click", openVideoOverlay);
    if (videoOverlayClose) videoOverlayClose.addEventListener("click", closeVideoOverlay);

    if (videoOverlay) {
        videoOverlay.addEventListener("click", (e) => {
            if (e.target === videoOverlay) closeVideoOverlay();
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (videoOverlay && !videoOverlay.hidden) closeVideoOverlay();
    });

})();
