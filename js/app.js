(function () {
  const {
    applyDomTranslations,
    formatFutureMonth,
    getLang,
    localizeBrand,
    localizeCurrencyMeta,
    localizeItemShort,
    localizeMonth,
    localizePhase,
    localizeRegion,
    setLang,
    t,
  } = window.SubLedgerI18n;

  const {
    BF_DEAL_PRESETS,
    CURRENCIES,
    DEFAULT_FX_ANNUAL_PCT,
    DEFAULT_STATE,
    FX_CURRENCY_META,
    HISTORICAL_TIMELINE,
    MONTHS,
    PLAN_BRAND_GROUPS,
    SCENARIO_PRESETS,
    TRY_FX_HISTORY,
    buildPlanPair,
    deriveDefaultBuyPlans,
    makeSubItem,
  } = window.SubLedgerData;

  const {
    calculateLedger,
    convertToCny,
    getCnyPerUnit,
    legacyTryDepToAnnualPct,
  } = window.SubLedgerCalc;
  const { buildSummarySvg, buildStandaloneHtml, svgToHighResPngBlob } = window.SubLedgerExporter;

  const STORAGE_KEY = 'ai_sub_ledger_state_v12';

  const STEPS = [
    { idx: 0, key: 'nav.step0' },
    { idx: 1, key: 'nav.step1' },
    { idx: 2, key: 'nav.step2' },
    { idx: 3, key: 'nav.step3' },
  ];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Fresh UI starts with Step 1 unselected, Step 2 in Mode 1 (Plan A only), and all 12 months clean & synced
  function createInitialUiState() {
    const s = cloneState(DEFAULT_STATE);
    const emptyPair = buildPlanPair('empty');
    s.bfPicked = false;
    s.monthPlans = emptyPair.monthPlans;
    s.buyMonthPlans = emptyPair.buyMonthPlans;
    s.buyMonthSynced = emptyPair.buyMonthSynced;
    s.monthEdited = Array(12).fill(false);
    return s;
  }

  let state = loadState();
  let currentStep = 0;
  let maxVisitedStep = 0;
  let selectedMonths = new Set();
  let lastCheckedIdx = null;
  let showBfCompare = false;
  let phaseModalOpen = false;
  // pickerState: { column: 'A'|'B', mode: 'replace'|'add', targetIndices: number[], itemIdx: number|null, anchorRect: DOMRect, showCustom: boolean }
  let pickerState = null;
  let calcTimers = [];
  let isCalculatingFinal = false;

  const pickerEl = document.createElement('div');
  pickerEl.className = 'notion-picker';
  document.body.appendChild(pickerEl);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialUiState();
      const parsed = JSON.parse(raw);
      const mergedFx = Object.assign({}, DEFAULT_FX_ANNUAL_PCT, parsed.fxAnnualChangePct || {});
      if (!parsed.fxAnnualChangePct && parsed.tryAnnualDepRate != null) {
        mergedFx.TRY = Math.round(legacyTryDepToAnnualPct(parsed.tryAnnualDepRate));
      }
      const plansA = Array.isArray(parsed.monthPlans) && parsed.monthPlans.length === 12
        ? parsed.monthPlans
        : Array.from({ length: 12 }, () => []);
      let plansB;
      let syncedB;
      if (
        Array.isArray(parsed.buyMonthPlans) &&
        parsed.buyMonthPlans.length === 12 &&
        Array.isArray(parsed.buyMonthSynced) &&
        parsed.buyMonthSynced.length === 12
      ) {
        plansB = parsed.buyMonthPlans;
        syncedB = parsed.buyMonthSynced.map(Boolean);
      } else {
        const derived = deriveDefaultBuyPlans(plansA);
        plansB = derived.buyMonthPlans;
        syncedB = derived.buyMonthSynced;
      }
      return Object.assign(createInitialUiState(), parsed, {
        fxAnnualChangePct: mergedFx,
        monthPlans: plansA,
        buyMonthPlans: plansB,
        buyMonthSynced: syncedB,
        monthEdited: Array.isArray(parsed.monthEdited) && parsed.monthEdited.length === 12
          ? parsed.monthEdited
          : Array(12).fill(false),
      });
    } catch {
      return createInitialUiState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  function fmtYen(n, withSign) {
    const rounded = Math.round(n);
    if (withSign) {
      if (rounded === 0) return '¥0';
      return `${rounded > 0 ? '+' : '-'}¥${Math.abs(rounded).toLocaleString('zh-CN')}`;
    }
    return `¥${rounded.toLocaleString('zh-CN')}`;
  }

  function fmtNum(n, withSign) {
    const rounded = Math.round(n);
    if (withSign) {
      if (rounded === 0) return '0';
      return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('zh-CN')}`;
    }
    return rounded.toLocaleString('zh-CN');
  }

  function fmtNativeAmount(amount, currency) {
    const num = Number(amount) || 0;
    const text = Number.isInteger(num) ? num.toLocaleString('en-US') : num.toFixed(2);
    if (currency === 'TRY') return `${text} TRY`;
    if (currency === 'JPY') return `${text} JPY`;
    if (currency === 'HKD') return `${text} HKD`;
    if (currency === 'TWD') return `${text} TWD`;
    if (currency === 'USD') return `$${text}`;
    return `¥${text}`;
  }

  function fmtFxDelta(pct) {
    const n = Math.round(Number(pct) || 0);
    if (n > 0) return { text: t('step3.fxUp', { n }), cls: 'fx-dir-up' };
    if (n < 0) return { text: t('step3.fxDown', { n }), cls: 'fx-dir-down' };
    return { text: t('step3.fxFlat'), cls: 'fx-dir-flat' };
  }

  function getMonthLabel(idx) {
    return localizeMonth(idx, 'long') || MONTHS[idx].label;
  }

  function getMonthShort(idx) {
    return localizeMonth(idx, 'short') || MONTHS[idx].short;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.remove('is-visible'), 2000);
  }

  function currencyOptionsHtml(selectedCode) {
    return CURRENCIES.map((c) => {
      const sel = c.code === selectedCode ? ' selected' : '';
      return `<option value="${c.code}"${sel}>${c.code} ${c.symbol}</option>`;
    }).join('');
  }

  function findFamilyByCatalogId(catalogId) {
    const targetId = catalogId || 'none_idle';
    for (const group of PLAN_BRAND_GROUPS) {
      for (const fam of group.families) {
        const hit = fam.variants.find((v) => v.catalogId === targetId);
        if (hit) return { group, family: fam, variant: hit };
      }
    }
    return null;
  }

  function pickDefaultVariantForFamily(family) {
    const preset = BF_DEAL_PRESETS[state.bfPreset];
    const regionLabel = preset && preset.regionLabel;
    if (regionLabel) {
      const match = family.variants.find((v) => v.region.startsWith(regionLabel));
      if (match) return match;
    }
    return family.variants[0];
  }

  function positionFloatingBox(boxEl, anchorRect, fallbackW, fallbackH) {
    const w = boxEl.offsetWidth || fallbackW || 368;
    const h = boxEl.offsetHeight || fallbackH || 420;
    let left = anchorRect.left;
    if (left + w > window.innerWidth - 16) left = Math.max(12, window.innerWidth - w - 16);
    let top = anchorRect.bottom + 6;
    if (top + h > window.innerHeight - 16) {
      const above = anchorRect.top - h - 6;
      top = above >= 58 ? above : Math.max(58, window.innerHeight - h - 16);
    }
    boxEl.style.left = `${Math.round(left)}px`;
    boxEl.style.top = `${Math.round(top)}px`;
  }

  function getSelectedIndices() {
    return Array.from(selectedMonths).filter((i) => i >= 0 && i < 12).sort((a, b) => a - b);
  }

  function markMonthsEdited(indices) {
    if (!Array.isArray(state.monthEdited) || state.monthEdited.length !== 12) {
      state.monthEdited = Array(12).fill(false);
    }
    indices.forEach((idx) => {
      if (idx >= 0 && idx < 12) state.monthEdited[idx] = true;
    });
  }

  function ensureBuyArrays() {
    if (!Array.isArray(state.buyMonthPlans) || state.buyMonthPlans.length !== 12) {
      state.buyMonthPlans = Array.from({ length: 12 }, () => []);
    }
    if (!Array.isArray(state.buyMonthSynced) || state.buyMonthSynced.length !== 12) {
      state.buyMonthSynced = Array(12).fill(true);
    }
  }

  function getColumnBasket(column, mIdx) {
    ensureBuyArrays();
    if (column === 'B') {
      return state.buyMonthSynced[mIdx]
        ? (Array.isArray(state.monthPlans[mIdx]) ? state.monthPlans[mIdx] : [])
        : (Array.isArray(state.buyMonthPlans[mIdx]) ? state.buyMonthPlans[mIdx] : []);
    }
    return Array.isArray(state.monthPlans[mIdx]) ? state.monthPlans[mIdx] : [];
  }

  function unsyncBuyMonth(mIdx) {
    ensureBuyArrays();
    if (state.buyMonthSynced[mIdx]) {
      const src = Array.isArray(state.monthPlans[mIdx]) ? state.monthPlans[mIdx] : [];
      state.buyMonthPlans[mIdx] = cloneState(src);
      state.buyMonthSynced[mIdx] = false;
    } else if (!Array.isArray(state.buyMonthPlans[mIdx])) {
      state.buyMonthPlans[mIdx] = [];
    }
  }

  function mutateColumnMonths(column, indices, mutator) {
    ensureBuyArrays();
    indices.forEach((mIdx) => {
      if (column === 'B') {
        unsyncBuyMonth(mIdx);
        mutator(state.buyMonthPlans[mIdx], mIdx);
      } else {
        if (!Array.isArray(state.monthPlans[mIdx])) state.monthPlans[mIdx] = [];
        mutator(state.monthPlans[mIdx], mIdx);
      }
    });
    render();
  }

  // Authentic Brand-Grouped Notion Multi-Select Popover (Supports Plan A & Plan B, Replace & Stack, Zero Jargon)
  function renderNotionPicker() {
    if (!pickerState || currentStep !== 1) {
      pickerEl.classList.remove('is-open');
      return;
    }
    const { column, mode, targetIndices, itemIdx, anchorRect, showCustom } = pickerState;
    if (!targetIndices || targetIndices.length === 0) {
      pickerState = null;
      pickerEl.classList.remove('is-open');
      return;
    }

    const firstIdx = targetIndices[0];
    const firstArr = getColumnBasket(column, firstIdx);
    const activeSlot = mode === 'add' ? null : (itemIdx != null ? firstArr[itemIdx] : firstArr[0]) || null;
    const currentId = activeSlot ? activeSlot.id : 'none_idle';
    const found = activeSlot ? findFamilyByCatalogId(currentId) : null;
    const activeFamily = found ? found.family : null;

    let targetLabel;
    if (targetIndices.length === 1) {
      if (column === 'B') {
        targetLabel = mode === 'add'
          ? t('picker.buyAddTarget', { month: getMonthLabel(firstIdx) })
          : t('picker.buySingleTarget', { month: getMonthLabel(firstIdx) });
      } else {
        targetLabel = mode === 'add'
          ? t('picker.addTarget', { month: getMonthLabel(firstIdx) })
          : t('picker.singleTarget', { month: getMonthLabel(firstIdx) });
      }
    } else if (mode === 'add') {
      targetLabel = targetIndices.length === 12
        ? t('picker.batchAddAll')
        : t('picker.batchAddN', { n: targetIndices.length });
    } else {
      targetLabel = targetIndices.length === 12
        ? t('picker.batchAll')
        : t('picker.batchN', { n: targetIndices.length });
    }

    // Region switcher box inside top of dropdown (for multi-region families)
    let regionHtml = '';
    if (activeFamily && activeFamily.variants.length > 1) {
      const chips = activeFamily.variants
        .map((v) => {
          const isAct = v.catalogId === currentId;
          return `<button type="button" class="np-region-chip ${isAct ? 'is-active' : ''}" data-pick-variant="${v.catalogId}">${escapeHtml(localizeRegion(v.region))} · ${escapeHtml(v.priceText)}</button>`;
        })
        .join('');
      regionHtml = `
        <div class="np-region-box">
          <div class="np-region-label">${escapeHtml(t('picker.regionHint', { name: localizeItemShort(activeFamily.name) }))}</div>
          <div class="np-region-chips">${chips}</div>
        </div>`;
    }

    // Inline custom price editor for EVERY paid subscription/plan
    let priceInlineHtml = '';
    if (activeSlot && activeSlot.id !== 'none_idle' && activeSlot.id !== 'idle_org_seat') {
      const isLegacyUltra = activeSlot.dynamicPrice === 'gemini_ultra_5x';
      const curCode = isLegacyUltra ? 'CNY' : (activeSlot.currency || 'CNY');
      const amtVal = isLegacyUltra ? state.currentUltraCny : (activeSlot.amount != null ? activeSlot.amount : 0);
      const isTry = curCode === 'TRY';
      priceInlineHtml = `
        <div class="np-price-inline">
          <select class="flat-select" data-np-cur="1" style="width:94px;">${currencyOptionsHtml(curCode)}</select>
          <input class="flat-input mono" data-np-amt="1" type="number" min="0" max="500000" step="any" value="${amtVal}" style="width:82px;" />
          <label class="check-inline" data-np-hike-wrap="1" style="display:${isTry ? 'inline-flex' : 'none'};font-size:12px;gap:5px;">
            <input type="checkbox" data-np-hike="1" ${activeSlot.midYearHike ? 'checked' : ''} />
            <span>${escapeHtml(t('picker.hikeCheck'))}</span>
          </label>
          <button type="button" class="subtle-btn btn-xs" data-np-apply-price="1" style="height:28px;padding:0 9px;font-size:12px;">${escapeHtml(t('picker.updatePrice'))}</button>
        </div>`;
    }

    // Clean brand-grouped list (zero replace/idle jargon!)
    const groupsHtml = PLAN_BRAND_GROUPS.map((g) => {
      const rows = g.families
        .filter((fam) => !(mode === 'add' && fam.id === 'fam_none'))
        .map((fam) => {
          const isAct = activeFamily && activeFamily.id === fam.id;
          const rightMeta =
            fam.variants.length > 1
              ? t('picker.regionsCount', { n: fam.variants.length })
              : fam.variants[0].priceText;
          return `
            <button type="button" class="np-item-btn ${isAct ? 'is-active' : ''}" data-pick-family="${fam.id}">
              <span class="np-item-left">
                <span class="tag tag-${fam.tone}" style="font-size:12.5px;padding:1px 7px;">${escapeHtml(localizeItemShort(fam.name))}</span>
              </span>
              <span class="np-item-meta mono">${escapeHtml(rightMeta)}</span>
            </button>`;
        })
        .join('');
      if (!rows) return '';
      return `<div class="np-brand-title">${escapeHtml(localizeBrand(g.brand))}</div>${rows}`;
    }).join('');

    // Zero-jargon Custom Subscription Form (Name + Currency + Monthly Price)
    const customSectionHtml = showCustom
      ? `
        <div class="np-custom-form">
          <div class="np-custom-row">
            <input class="flat-input" data-np-cname="1" type="text" placeholder="${escapeHtml(t('picker.customNamePh'))}" style="flex:1;min-width:0;" />
          </div>
          <div class="np-custom-row">
            <select class="flat-select" data-np-ccur="1" style="width:106px;">${currencyOptionsHtml('USD')}</select>
            <input class="flat-input mono" data-np-camt="1" type="number" min="0" max="500000" step="any" placeholder="${escapeHtml(t('picker.customPricePh'))}" style="flex:1;min-width:0;" />
            <button type="button" class="primary-btn btn-xs" data-np-csave="1" style="height:30px;">${escapeHtml(t('picker.apply'))}</button>
          </div>
        </div>`
      : `<button type="button" class="np-custom-toggle" data-np-open-custom="1">${escapeHtml(t('picker.customToggle'))}</button>`;

    pickerEl.innerHTML = `
      <div class="np-top">
        <div class="np-top-head">
          <span class="np-top-target">${escapeHtml(targetLabel)}</span>
          <button type="button" class="text-btn text-btn-muted" data-np-close="1" style="padding:1px 6px;font-size:12.5px;">${escapeHtml(t('picker.done'))}</button>
        </div>
        ${regionHtml}
        ${priceInlineHtml}
      </div>
      <div class="np-list">${groupsHtml}</div>
      <div class="np-custom-footer">${customSectionHtml}</div>
    `;

    pickerEl.classList.add('is-open');
    positionFloatingBox(pickerEl, anchorRect, 368, 460);
  }

  function setPhaseModalOpen(open) {
    phaseModalOpen = Boolean(open);
    const backdrop = document.getElementById('phase-modal-backdrop');
    backdrop.classList.toggle('is-open', phaseModalOpen);
    backdrop.setAttribute('aria-hidden', phaseModalOpen ? 'false' : 'true');
    const triggerBtn = document.getElementById('btn-phase-settings');
    if (triggerBtn) triggerBtn.classList.toggle('is-open', phaseModalOpen);
  }

  function clearCalcTimers() {
    calcTimers.forEach((id) => clearTimeout(id));
    calcTimers = [];
  }

  // Real 12-Month Ledger Replay (~1.12s): plays back actual monthly flows & cumSkip - cumBuy
  function runFinalCalculationSequence() {
    clearCalcTimers();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stageEl = document.getElementById('calc-stage');
    const resultEl = document.getElementById('step5-result');
    const exportEl = document.getElementById('export-group');

    if (reduceMotion) {
      isCalculatingFinal = false;
      stageEl.style.display = 'none';
      resultEl.style.display = 'block';
      exportEl.style.display = 'flex';
      render();
      return;
    }

    isCalculatingFinal = true;
    stageEl.style.display = 'flex';
    resultEl.style.display = 'none';
    resultEl.classList.remove('is-revealing');
    exportEl.style.display = 'none';

    render();
    const res = calculateLedger(state, getLang());

    const counterEl = document.getElementById('calc-replay-counter');
    const ticksEl = document.getElementById('calc-replay-ticks');
    const tapeEl = document.getElementById('calc-replay-tape');
    const statusEl = document.getElementById('calc-replay-status');

    ticksEl.innerHTML = Array.from({ length: 12 }, (_, idx) => `<span class="replay-tick" data-tick="${idx}"></span>`).join('');
    const ticks = Array.from(ticksEl.querySelectorAll('.replay-tick'));

    const allTapeEntries = [
      {
        col1: t('step4.chartToday'),
        col2: t('step4.replayUpfront'),
        cum: -res.bfCost,
      },
      ...res.monthlyRows.map((r) => ({
        col1: getMonthLabel(r.index),
        col2: r.monthSavedByBf > 0.01
          ? t('step4.replaySave', { yen: fmtYen(r.monthSavedByBf) })
          : r.monthSavedByBf < -0.01
            ? t('step2.extraSpend', { yen: fmtYen(Math.abs(r.monthSavedByBf)) })
            : t('step4.replayIdle'),
        cum: r.cumSkip - r.cumBuy,
      })),
    ];

    function renderTapeWindow(endIdx) {
      const start = Math.max(0, endIdx - 2);
      const slice = allTapeEntries.slice(start, endIdx + 1);
      tapeEl.innerHTML = slice
        .map((row, idx) => {
          const isCur = start + idx === endIdx;
          const cumCls = row.cum > 0 ? 'is-pos' : row.cum < 0 ? 'is-neg' : '';
          return `
            <div class="replay-row ${isCur ? 'is-current' : ''}">
              <span>${escapeHtml(row.col1)}</span>
              <span class="r-mid">${escapeHtml(row.col2)}</span>
              <span class="r-cum ${cumCls}">${escapeHtml(t('step4.replayCum', { yen: fmtYen(row.cum, true) }))}</span>
            </div>`;
        })
        .join('');
    }

    // 0–140ms: Day 0 upfront
    counterEl.textContent = '00 / 12';
    renderTapeWindow(0);
    statusEl.textContent = `${t('step4.replayUpfront')} ${fmtYen(-res.bfCost, true)}`;

    // 140–800ms: 12 monthly ticks every 55ms
    for (let m = 0; m < 12; m++) {
      calcTimers.push(
        setTimeout(() => {
          counterEl.textContent = `${String(m + 1).padStart(2, '0')} / 12`;
          ticks.forEach((tk, idx) => {
            tk.classList.toggle('is-lit', idx < m);
            tk.classList.toggle('is-active', idx === m);
          });
          renderTapeWindow(m + 1);
        }, 140 + m * 55)
      );
    }

    // 820–980ms: EV weighting summary
    calcTimers.push(
      setTimeout(() => {
        ticks.forEach((tk) => {
          tk.classList.add('is-lit');
          tk.classList.remove('is-active');
        });
        const wU = Math.round(Number(state.retainProbPct) || 0);
        const wD = 100 - wU;
        statusEl.textContent = `${t('step4.replayWeight', { wD, wU })} · D ${fmtYen(res.downsideNet, true)} / U ${fmtYen(res.upsideNet, true)}`;
      }, 820)
    );

    // 1020ms: Final reveal
    calcTimers.push(
      setTimeout(() => {
        statusEl.textContent = t('step4.replayDone', { ev: fmtYen(res.expectedNetSavings, true) });
        isCalculatingFinal = false;
        stageEl.style.display = 'none';
        resultEl.style.display = 'block';
        render();
        void resultEl.offsetWidth;
        resultEl.classList.add('is-revealing');
        exportEl.style.display = 'flex';
      }, 1060)
    );
  }

  function goToStep(stepIdx) {
    const nextStep = Math.max(0, Math.min(STEPS.length - 1, stepIdx));
    const enteringFinal = nextStep === 3 && currentStep !== 3;
    currentStep = nextStep;
    maxVisitedStep = Math.max(maxVisitedStep, currentStep);
    pickerState = null;
    setPhaseModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (enteringFinal) {
      runFinalCalculationSequence();
    } else {
      clearCalcTimers();
      isCalculatingFinal = false;
      document.getElementById('calc-stage').style.display = 'none';
      document.getElementById('step5-result').style.display = 'block';
      render();
    }
  }

  function buildFxPreviewText(code, pct) {
    const meta = FX_CURRENCY_META[code];
    if (!meta) return '';
    const loc = localizeCurrencyMeta(code, meta);
    const map = Object.assign({}, state.fxAnnualChangePct, { [code]: pct });
    const nowCny = Math.round(meta.sampleAmount * getCnyPerUnit(code, 0, map));
    const endCny = Math.round(meta.sampleAmount * getCnyPerUnit(code, 12, map));
    const dir = pct > 0
      ? t('step3.fxDirUp', { n: pct })
      : pct < 0
        ? t('step3.fxDirDown', { n: Math.abs(pct) })
        : t('step3.fxDirFlat');
    return t('step3.fxPreview', { name: loc.name, dir, sample: loc.sampleLabel, now: nowCny, end: endCny, note: loc.note });
  }

  function renderDynamicFxPanel(res) {
    const panel = document.getElementById('fx-dynamic-panel');
    const active = res.activeFxCurrencies || [];
    const key = `${getLang()}|${active.map((c) => c.currency).join(',')}`;

    if (active.length === 0) {
      if (panel.dataset.fxKey !== `${getLang()}|__empty__`) {
        panel.dataset.fxKey = `${getLang()}|__empty__`;
        panel.innerHTML = `
          <div class="prop-row">
            <span class="prop-key">${escapeHtml(t('step3.fxNoneKey'))}</span>
            <div class="prop-val">
              <span class="unit">${escapeHtml(t('step3.fxNoneVal'))}</span>
            </div>
          </div>`;
      }
      return;
    }

    if (panel.dataset.fxKey !== key) {
      panel.dataset.fxKey = key;
      panel.innerHTML = active
        .map((entry, idx) => {
          const code = entry.currency;
          const meta = FX_CURRENCY_META[code];
          if (!meta) return '';
          const loc = localizeCurrencyMeta(code, meta);
          const pct = state.fxAnnualChangePct && state.fxAnnualChangePct[code] != null
            ? Number(state.fxAnnualChangePct[code])
            : meta.defaultAnnualPct;
          const d = fmtFxDelta(pct);
          const preview = buildFxPreviewText(code, pct);

          if (idx === 0) {
            return `
              <div class="fx-card-block" data-fx-block="${code}">
                <div class="prop-row">
                  <span class="prop-key">${escapeHtml(t('step3.fxBaseKey', { name: loc.name }))}</span>
                  <div class="prop-val mono">
                    <span>${escapeHtml(meta.displayBase)}</span>
                    <span class="unit" data-fx-months="${code}">${escapeHtml(t('step3.fxMonths', { n: entry.monthsCount }))}</span>
                  </div>
                </div>
                <div class="prop-row">
                  <span class="prop-key">${escapeHtml(t('step3.fxDeltaKey', { name: loc.name }))}</span>
                  <div class="prop-val prop-val-slider">
                    <input type="range" data-fx-slider="${code}" min="${meta.minPct}" max="${meta.maxPct}" step="1" value="${pct}" />
                    <span class="mono val-badge ${d.cls}" data-fx-badge="${code}">${d.text}</span>
                  </div>
                </div>
                <p class="muted-note" data-fx-preview="${code}" style="padding: 2px 6px 6px;">${escapeHtml(preview)}</p>
              </div>`;
          }

          return `
            <details class="fx-extra-toggle" data-fx-block="${code}">
              <summary>
                <span><strong>${escapeHtml(loc.name)} (${code})</strong> <span class="unit" data-fx-months="${code}">${escapeHtml(t('step3.fxMonthsShort', { n: entry.monthsCount, base: meta.displayBase }))}</span></span>
                <span class="mono ${d.cls}" data-fx-badge="${code}" style="font-weight:600;">${d.text}</span>
              </summary>
              <div class="fx-extra-body">
                <div class="prop-row" style="border-bottom:none;min-height:40px;padding:4px 0;">
                  <span class="prop-key">${escapeHtml(t('step3.fxDeltaKey', { name: loc.name }))}</span>
                  <div class="prop-val prop-val-slider">
                    <input type="range" data-fx-slider="${code}" min="${meta.minPct}" max="${meta.maxPct}" step="1" value="${pct}" />
                    <span class="mono val-badge ${d.cls}" data-fx-badge2="${code}">${d.text}</span>
                  </div>
                </div>
                <p class="muted-note" data-fx-preview="${code}" style="padding: 2px 0 4px;">${escapeHtml(preview)}</p>
              </div>
            </details>`;
        })
        .join('');
      return;
    }

    active.forEach((entry) => {
      const code = entry.currency;
      const meta = FX_CURRENCY_META[code];
      if (!meta) return;
      const pct = state.fxAnnualChangePct && state.fxAnnualChangePct[code] != null
        ? Number(state.fxAnnualChangePct[code])
        : meta.defaultAnnualPct;
      const d = fmtFxDelta(pct);
      const preview = buildFxPreviewText(code, pct);

      const slider = panel.querySelector(`[data-fx-slider="${code}"]`);
      if (slider && Number(slider.value) !== pct) slider.value = pct;

      panel.querySelectorAll(`[data-fx-badge="${code}"], [data-fx-badge2="${code}"]`).forEach((el) => {
        el.textContent = d.text;
        el.classList.remove('fx-dir-up', 'fx-dir-down', 'fx-dir-flat');
        el.classList.add(d.cls);
      });

      const monthsEl = panel.querySelector(`[data-fx-months="${code}"]`);
      if (monthsEl) {
        monthsEl.textContent = monthsEl.closest('summary')
          ? t('step3.fxMonthsShort', { n: entry.monthsCount, base: meta.displayBase })
          : t('step3.fxMonths', { n: entry.monthsCount });
      }

      const prevEl = panel.querySelector(`[data-fx-preview="${code}"]`);
      if (prevEl) prevEl.textContent = preview;
    });
  }

  function renderPresetOptions() {
    const presetPicker = document.getElementById('inp-preset-picker');
    presetPicker.innerHTML =
      `<option value="">${escapeHtml(t('nav.presets'))}</option>` +
      SCENARIO_PRESETS.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }

  function renderStaticTables() {
    renderPresetOptions();

    document.getElementById('timeline-tbody').innerHTML = HISTORICAL_TIMELINE.map(
      (item) => `
        <tr>
          <td class="mono" style="white-space:nowrap;">${item.date}</td>
          <td style="font-weight:500;">${item.model}</td>
          <td style="white-space:nowrap;"><span class="tag tag-gray">${item.durability}</span></td>
          <td>${item.summary}</td>
        </tr>`
    ).join('');

    document.getElementById('fx-tbody').innerHTML = TRY_FX_HISTORY.map(
      (row) => `
        <tr>
          <td>${row.period}</td>
          <td class="num mono">${row.rate}</td>
          <td class="num mono">${row.yoy}</td>
          <td class="num mono">${row.pro870}</td>
          <td class="num mono">${row.ultra4750}</td>
        </tr>`
    ).join('');
  }

  function syncInputsFromState() {
    document.getElementById('inp-bf-currency').value = state.bfCurrency || 'CNY';
    document.getElementById('inp-bf-raw').value = state.bfRawAmount != null ? state.bfRawAmount : state.bfCostCny;
    document.getElementById('inp-sota-len').value = state.effectiveSotaMonths;
    document.getElementById('inp-next-interval').value = state.nextFlagshipInterval;
    document.getElementById('inp-retain-prob').value = state.retainProbPct;
  }

  function renderStepTabs() {
    document.getElementById('step-nav-list').innerHTML = STEPS.map((s, idx) => {
      const cls = idx === currentStep ? 'is-current' : idx <= maxVisitedStep ? 'is-done' : '';
      return `<button type="button" class="step-tab ${cls}" data-go-step="${idx}">${escapeHtml(t(s.key))}</button>`;
    }).join('');
  }

  const PHASE_CUE_SVG =
    '<span class="phase-pill-cue" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 5h12M2 11h12"/><circle cx="6" cy="5" r="1.8" fill="currentColor"/><circle cx="10.5" cy="11" r="1.8" fill="currentColor"/></svg></span>';

  function renderPillStack(column, rowIdx, items, isSyncedGhost) {
    const addTitle = escapeHtml(t('step2.addAnotherTitle'));
    const removeTitle = escapeHtml(t('step2.removeItemTitle'));

    if (!items || items.length === 0) {
      if (column === 'B') {
        if (isSyncedGhost) {
          return `
            <div class="bf-compare-cell">
              <span class="bf-synced-muted">${escapeHtml(t('step2.bfWaitBaseline'))}</span>
              <button type="button" class="cell-add-btn" data-add-picker="B:${rowIdx}" title="${addTitle}">+</button>
            </div>`;
        }
        return `
          <div class="bf-compare-cell">
            <button type="button" class="bf-no-extra-pill" data-add-picker="B:${rowIdx}" title="${addTitle}">${escapeHtml(t('step2.bfNoExtra'))}</button>
            <button type="button" class="cell-add-btn" data-add-picker="B:${rowIdx}" title="${addTitle}">+</button>
            <button type="button" class="bf-sync-chip" data-sync-b="${rowIdx}" title="${escapeHtml(t('step2.bfSyncBackTip'))}">${escapeHtml(t('step2.bfSyncBack'))}</button>
          </div>`;
      }
      const isOpenEmpty = Boolean(
        pickerState && pickerState.column === 'A' && pickerState.targetIndices.includes(rowIdx)
      );
      return `
        <button type="button" class="cell-pill-btn tone-empty ${isOpenEmpty ? 'is-open' : ''}" data-open-picker="A:${rowIdx}:0">
          <span class="cell-pill-text">${escapeHtml(t('step2.pickPlaceholder'))}</span>
          <span class="cell-pill-caret" aria-hidden="true">▾</span>
        </button>`;
    }

    const chipsHtml = items
      .map((item, idx) => {
        const tone = `tone-${item.tone || 'gray'}`;
        const isOpen = Boolean(
          pickerState &&
          pickerState.column === column &&
          pickerState.mode === 'replace' &&
          pickerState.targetIndices.includes(rowIdx) &&
          (pickerState.itemIdx === idx || (pickerState.itemIdx == null && idx === 0))
        );
        const hikeBadge = item.midYearHike
          ? `<span class="cell-hike-dot">${escapeHtml(t('step2.hikeTag'))}</span>`
          : '';
        return `
          <span class="pill-chip-group ${tone} ${isSyncedGhost ? 'is-synced-ghost' : ''}">
            <button type="button" class="cell-pill-btn ${isOpen ? 'is-open' : ''}" data-open-picker="${column}:${rowIdx}:${idx}">
              <span class="cell-pill-text">${escapeHtml(localizeItemShort(item.short))}</span>
            </button>
            <button type="button" class="pill-chip-x" data-remove-item="${column}:${rowIdx}:${idx}" title="${removeTitle}" aria-label="${removeTitle}">×</button>
          </span>${hikeBadge}`;
      })
      .join('');

    const syncHtml = column === 'B' && !isSyncedGhost
      ? `<button type="button" class="bf-sync-chip" data-sync-b="${rowIdx}" title="${escapeHtml(t('step2.bfSyncBackTip'))}">${escapeHtml(t('step2.bfSyncBack'))}</button>`
      : '';

    return `
      <div class="cell-pills-wrap">
        ${chipsHtml}
        <button type="button" class="cell-add-btn" data-add-picker="${column}:${rowIdx}" title="${addTitle}">+</button>
        ${syncHtml}
      </div>`;
  }

  function renderDatabaseTable(res) {
    const indices = getSelectedIndices();
    const selBar = document.getElementById('db-selection-bar');
    selBar.style.display = indices.length > 0 ? 'flex' : 'none';
    document.getElementById('editor-selected-title').textContent =
      indices.length === 12 ? t('step2.selectedAll') : t('step2.selectedN', { n: indices.length });

    const chkAll = document.getElementById('chk-select-all');
    chkAll.checked = indices.length === 12;
    chkAll.indeterminate = indices.length > 0 && indices.length < 12;

    const tableEl = document.getElementById('db-months-table');
    const skipBtn = document.getElementById('btn-mode-skip');
    const buyBtn = document.getElementById('btn-mode-buy');
    const saveThLabel = document.getElementById('th-save-label');
    const viewHint = document.getElementById('db-view-hint');
    tableEl.classList.toggle('is-compare-hidden', !showBfCompare);
    skipBtn.classList.toggle('is-active', !showBfCompare);
    buyBtn.classList.toggle('is-active', showBfCompare);
    saveThLabel.textContent = showBfCompare ? t('step2.thSaveDiff') : t('step2.thSaveOrig');
    viewHint.textContent = showBfCompare ? t('step2.hintBuy') : t('step2.hintSkip');
    document.getElementById('lbl-phase-settings-meta').textContent =
      t('step2.phaseMeta', { sota: state.effectiveSotaMonths, prob: state.retainProbPct });

    const phaseTip = escapeHtml(t('step2.phaseTooltip'));
    const tbody = document.getElementById('db-months-tbody');
    tbody.innerHTML = res.monthlyRows
      .map((row) => {
        const isSel = selectedMonths.has(row.index);
        const skipCellHtml = `
          <div class="cell-skip-inner">
            <input type="checkbox" class="cell-chk" data-chk-month="${row.index}" ${isSel ? 'checked' : ''} aria-label="${escapeHtml(getMonthLabel(row.index))}" />
            ${renderPillStack('A', row.index, row.items, false)}
          </div>`;

        const buyCellHtml = renderPillStack('B', row.index, row.buyItems, row.buySynced);

        let saveText;
        if (showBfCompare) {
          if (row.monthSavedByBf > 0.5) {
            saveText = `<span class="mono save-val-active">${escapeHtml(t('step2.saveMonth', { yen: fmtYen(row.monthSavedByBf) }))}</span>`;
          } else if (row.monthSavedByBf < -0.5) {
            saveText = `<span class="mono save-val-neg">${escapeHtml(t('step2.extraSpend', { yen: fmtYen(Math.abs(row.monthSavedByBf)) }))}</span>`;
          } else if (row.items.length > 0 || row.buyItems.length > 0) {
            saveText = `<span class="mono save-val-idle">${escapeHtml(t('step2.sameZero'))}</span>`;
          } else {
            saveText = `<span class="mono save-val-idle">${escapeHtml(t('step2.emptyZero'))}</span>`;
          }
        } else {
          saveText = row.skipMonthFlow > 0
            ? `<span class="mono">${fmtYen(row.skipMonthFlow)}</span>`
            : '<span class="mono save-val-idle">—</span>';
        }

        return `
          <tr class="db-row" data-row-idx="${row.index}">
            <td class="col-month">
              <span class="db-month-main">${escapeHtml(getMonthLabel(row.index))}</span>
              <button type="button" class="phase-pill phase-${row.phase.key}" data-open-phase-pop="1" data-tooltip="${phaseTip}">${escapeHtml(localizePhase(row.phase))}${PHASE_CUE_SVG}</button>
            </td>
            <td class="col-skip ${isSel ? 'is-cell-selected' : ''}" data-cell-idx="${row.index}">${skipCellHtml}</td>
            <td class="col-buy">${buyCellHtml}</td>
            <td class="col-save num mono">${saveText}</td>
          </tr>`;
      })
      .join('');

    renderNotionPicker();

    const filledMonths = res.monthlyRows.filter((r) => r.items.length > 0).length;
    const extraB = Math.max(0, res.totalBuyCost - res.bfCost);
    const netDiff = res.totalSkipCost - res.totalBuyCost;
    const footDiffHtml = showBfCompare
      ? (netDiff >= 0
          ? `<span class="mono save-val-active">${escapeHtml(t('step2.footDiffSave', { yen: fmtYen(netDiff) }))}</span>`
          : `<span class="mono save-val-neg">${escapeHtml(t('step2.footDiffLoss', { yen: fmtYen(Math.abs(netDiff)) }))}</span>`)
      : `<span class="unit">${escapeHtml(t('step2.footRight'))}</span>`;

    document.getElementById('db-months-tfoot').innerHTML = `
      <tr>
        <td class="mono" style="font-weight:600;">${escapeHtml(t('step2.footTitle'))}</td>
        <td>${t('step2.footSkip', { totalA: fmtYen(res.totalSkipCost), filled: filledMonths })}</td>
        <td class="col-buy">${t('step2.footBuy', { bf: fmtYen(res.bfCost), extraB: fmtYen(extraB), totalB: fmtYen(res.totalBuyCost) })}</td>
        <td class="num">${footDiffHtml}</td>
      </tr>`;
  }

  // SVG Bidirectional Payoff Bar (Downside D vs Upside U on shared zero axis)
  function renderPayoffBar(res) {
    const container = document.getElementById('payoff-bar-container');
    const ratioEl = document.getElementById('payoff-ratio-badge');

    const D = res.downsideNet;
    const U = res.upsideNet;
    const wU = Math.round(Number(state.retainProbPct) || 0);
    const wD = 100 - wU;

    const oppositeSigns = (D < 0 && U > 0) || (D > 0 && U < 0);
    if (D < 0 && U > 0) {
      ratioEl.textContent = t('step4.payoffRatio', { ratio: (U / Math.abs(D)).toFixed(2) });
    } else if (U < 0 && D > 0) {
      ratioEl.textContent = t('step4.payoffRatio', { ratio: (D / Math.abs(U)).toFixed(2) });
    } else {
      ratioEl.textContent = '';
    }

    const W = 760;
    const H = 86;
    const padL = 168;
    const padR = 128;
    const trackW = W - padL - padR;

    const maxAbs = Math.max(100, Math.abs(D), Math.abs(U));
    const minVal = Math.min(0, D, U);
    const maxVal = Math.max(0, D, U);
    const span = oppositeSigns ? maxAbs * 2 : Math.max(100, maxVal - minVal);
    const xZero = oppositeSigns
      ? padL + trackW / 2
      : minVal < 0
        ? padL + trackW
        : padL;
    const scale = oppositeSigns ? (trackW / 2) / maxAbs : trackW / span;

    function barGeom(val) {
      const px = Math.abs(val) * scale;
      if (val >= 0) return { x: xZero, w: Math.max(2, px), fill: '#dbeddb', stroke: '#1c3829', textCls: '#1c3829' };
      return { x: xZero - Math.max(2, px), w: Math.max(2, px), fill: '#ffe2dd', stroke: '#5d1715', textCls: '#5d1715' };
    }

    const gD = barGeom(D);
    const gU = barGeom(U);
    const lblD = t('step4.payoffDownLabel', { k: res.sotaCutoff });
    const lblU = t('step4.payoffUpLabel');

    container.innerHTML = `
      <svg class="payoff-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Downside and Upside payoff comparison">
        <line x1="${xZero.toFixed(1)}" y1="8" x2="${xZero.toFixed(1)}" y2="${H - 8}" stroke="#d3d1cb" stroke-width="1.2"/>
        <text x="${xZero.toFixed(1)}" y="${H - 1}" text-anchor="middle" fill="#9b9a97" font-size="10.5" font-family="JetBrains Mono, monospace">¥0</text>

        <!-- Row 1: Downside D -->
        <text x="2" y="27" fill="#37352f" font-size="12.5" font-weight="500">${escapeHtml(lblD)}</text>
        <text x="2" y="40" fill="#9b9a97" font-size="11" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.payoffWeight', { w: wD }))}</text>
        <rect x="${gD.x.toFixed(1)}" y="16" width="${gD.w.toFixed(1)}" height="18" rx="2.5" fill="${gD.fill}" stroke="${gD.stroke}" stroke-opacity="0.28" stroke-width="1"/>
        <text x="${W - 4}" y="29" text-anchor="end" fill="${gD.textCls}" font-size="13" font-weight="600" font-family="JetBrains Mono, monospace">${escapeHtml(fmtYen(D, true))}</text>

        <!-- Row 2: Upside U -->
        <text x="2" y="61" fill="#37352f" font-size="12.5" font-weight="500">${escapeHtml(lblU)}</text>
        <text x="2" y="74" fill="#9b9a97" font-size="11" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.payoffWeight', { w: wU }))}</text>
        <rect x="${gU.x.toFixed(1)}" y="50" width="${gU.w.toFixed(1)}" height="18" rx="2.5" fill="${gU.fill}" stroke="${gU.stroke}" stroke-opacity="0.28" stroke-width="1"/>
        <text x="${W - 4}" y="63" text-anchor="end" fill="${gU.textCls}" font-size="13" font-weight="600" font-family="JetBrains Mono, monospace">${escapeHtml(fmtYen(U, true))}</text>
      </svg>`;
  }

  // Cumulative Chart with Day 0 ("今日" / "Now") upfront anchor
  function renderChart(res) {
    const container = document.getElementById('chart-container');
    const rows = res.monthlyRows;

    const width = 760;
    const height = 228;
    const padL = 62;
    const padR = 24;
    const padT = 24;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxY = Math.max(600, res.bfCost, ...rows.map((r) => Math.max(r.cumBuy, r.cumSkip)));
    const niceMaxY = Math.ceil(maxY / 500) * 500;

    // 13 x-positions: 0 = Today (Now), 1..12 = months 0..11
    const xAt = (idx) => padL + (idx / rows.length) * plotW;
    const yAt = (val) => padT + plotH - (val / niceMaxY) * plotH;

    const buyPts = [
      `${xAt(0).toFixed(1)},${yAt(res.bfCost).toFixed(1)}`,
      ...rows.map((r, i) => `${xAt(i + 1).toFixed(1)},${yAt(r.cumBuy).toFixed(1)}`),
    ].join(' ');
    const skipPts = [
      `${xAt(0).toFixed(1)},${yAt(0).toFixed(1)}`,
      ...rows.map((r, i) => `${xAt(i + 1).toFixed(1)},${yAt(r.cumSkip).toFixed(1)}`),
    ].join(' ');

    const gridLines = [];
    for (let s = 0; s <= 4; s++) {
      const val = (niceMaxY / 4) * s;
      const y = yAt(val).toFixed(1);
      gridLines.push(`
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
        <text x="${padL - 10}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="11" font-family="JetBrains Mono, monospace">¥${Math.round(val)}</text>
      `);
    }

    let crossoverSvg = '';
    if (res.crossoverMonthIndex !== null) {
      const cx = xAt(res.crossoverMonthIndex + 1);
      const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#1c3829" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 96, cx + 8).toFixed(1)}" y="${Math.max(padT + 20, cy - 8).toFixed(1)}" fill="#1c3829" font-size="11.5" font-weight="600">${escapeHtml(t('step4.chartBreakeven', { m: getMonthShort(res.crossoverMonthIndex) }))}</text>
      `;
    }

    const xLabels = [
      `<text x="${xAt(0).toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#37352f" font-size="11.5" font-weight="600">${escapeHtml(t('step4.chartToday'))}</text>`,
      ...rows.map((r, i) => `<text x="${xAt(i + 1).toFixed(1)}" y="${height - 10}" text-anchor="middle" fill="#787774" font-size="11.5">${escapeHtml(getMonthShort(i))}</text>`),
    ].join('');

    const lastRow = rows[rows.length - 1];
    const lastX = xAt(rows.length);
    const buyY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumBuy) - 10 : yAt(lastRow.cumBuy) + 16;
    const skipY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumSkip) + 16 : yAt(lastRow.cumSkip) - 10;

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    let nextGenMarkerSvg = '';
    if (nextGenIdx >= 0) {
      const nx = xAt(nextGenIdx + 1);
      nextGenMarkerSvg = `
        <line x1="${nx.toFixed(1)}" y1="${padT}" x2="${nx.toFixed(1)}" y2="${padT + plotH}" stroke="#9b9a97" stroke-dasharray="2 3" stroke-width="1"/>
        <circle cx="${nx.toFixed(1)}" cy="${(padT + plotH).toFixed(1)}" r="3.5" fill="#1c3829" stroke="#ffffff" stroke-width="1.2"/>
        <text x="${Math.min(width - 130, Math.max(padL + 6, nx - 38)).toFixed(1)}" y="${(padT + 12).toFixed(1)}" fill="#1c3829" font-size="11" font-weight="600">${escapeHtml(t('step4.chartNextGen', { m: getMonthShort(nextGenIdx) }))}</text>
      `;
    }

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12-month cumulative comparison">
        ${gridLines.join('')}
        ${nextGenMarkerSvg}
        <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="1.9" stroke-dasharray="5 4"/>
        <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
        <circle cx="${xAt(0).toFixed(1)}" cy="${yAt(res.bfCost).toFixed(1)}" r="3.2" fill="#37352f"/>
        <circle cx="${xAt(0).toFixed(1)}" cy="${yAt(0).toFixed(1)}" r="3.2" fill="#9b9a97"/>
        ${xLabels}
        ${crossoverSvg}
        <text x="${(lastX - 6).toFixed(1)}" y="${buyY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="12" font-weight="600" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.chartBuy', { yen: fmtYen(lastRow.cumBuy) }))}</text>
        <text x="${(lastX - 6).toFixed(1)}" y="${skipY.toFixed(1)}" text-anchor="end" fill="#787774" font-size="12" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.chartSkip', { yen: fmtYen(lastRow.cumSkip) }))}</text>
      </svg>
    `;
  }

  // Collapsible 3x3 Sensitivity Matrix (p +-10pp x primary FX +-5pp)
  function renderSensitivityMatrix(res) {
    const container = document.getElementById('sensitivity-container');
    const sens = res.sensitivity;
    if (!sens || !sens.primaryCurrency || !sens.rows || sens.rows.length === 0) {
      container.innerHTML = `<p class="muted-note" style="margin:0;">${escapeHtml(t('step4.sensNoFx'))}</p>`;
      return;
    }
    const corner = t('step4.sensCorner', { cur: sens.primaryCurrency });
    const theadCols = sens.pCols.map((pVal) => `<th class="mono">p = ${pVal}%</th>`).join('');
    const bodyRows = sens.rows
      .map((row) => {
        const fxLabel = `${row.fxPct > 0 ? '+' : ''}${row.fxPct}%`;
        const cells = row.cells
          .map((cell) => {
            const signCls = cell.ev > 0.5 ? 'is-pos' : cell.ev < -0.5 ? 'is-neg' : '';
            const centerCls = cell.isCenter ? 'sens-cell-center' : '';
            return `<td class="mono ${signCls} ${centerCls}">${escapeHtml(fmtYen(cell.ev, true))}</td>`;
          })
          .join('');
        return `<tr><td class="mono">${escapeHtml(sens.primaryCurrency)} ${escapeHtml(fxLabel)}</td>${cells}</tr>`;
      })
      .join('');

    container.innerHTML = `
      <table class="sens-table">
        <thead>
          <tr><th>${escapeHtml(corner)}</th>${theadCols}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <p class="sens-note">${escapeHtml(t('step4.sensNote'))}</p>`;
  }

  function render() {
    saveState();
    const lang = getLang();
    applyDomTranslations();
    document.querySelectorAll('[data-lang-opt]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.langOpt === lang);
    });
    const res = calculateLedger(state, lang);

    document.querySelectorAll('.step').forEach((sec) => {
      sec.classList.toggle('is-active', Number(sec.dataset.step) === currentStep);
    });
    renderStepTabs();

    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const mobPrev = document.getElementById('btn-mobile-prev');
    const mobNext = document.getElementById('btn-mobile-next');
    const isStep1Picked = Boolean(state.bfPicked);
    const hideNext = currentStep === STEPS.length - 1 || (currentStep === 0 && !isStep1Picked);
    prevBtn.classList.toggle('is-hidden', currentStep === 0);
    nextBtn.classList.toggle('is-hidden', hideNext);
    nextBtn.classList.toggle('is-emphasized', currentStep === 0 && isStep1Picked);
    document.getElementById('side-next-tip').textContent = currentStep === 2 ? t('nav.seeVerdict') : t('nav.next');
    mobPrev.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    mobNext.style.visibility = hideNext ? 'hidden' : 'visible';
    document.getElementById('export-group').style.display =
      currentStep === 3 && !isCalculatingFinal ? 'flex' : 'none';

    // STEP 1
    document.querySelectorAll('[data-bf-choice]').forEach((row) => {
      row.classList.toggle('is-selected', isStep1Picked && row.dataset.bfChoice === state.bfPreset);
    });
    document.getElementById('panel-bf-custom').style.display =
      isStep1Picked && state.bfPreset === 'custom' ? 'block' : 'none';
    document.getElementById('lbl-bf-converted').textContent = t('step1.perYear', { yen: fmtYen(state.bfCostCny) });
    document.getElementById('lbl-custom-preview').textContent =
      isStep1Picked && state.bfPreset === 'custom'
        ? `${fmtNativeAmount(state.bfRawAmount, state.bfCurrency)} ≈ ${fmtYen(state.bfCostCny)}`
        : t('step1.customPreviewEmpty');
    const step1Hint = document.getElementById('step1-hint');
    const step1NextBtn = document.getElementById('btn-step1-next');
    if (isStep1Picked) {
      step1Hint.textContent = t('step1.hintPicked');
      step1NextBtn.style.display = 'inline-flex';
    } else {
      step1Hint.textContent = t('step1.hintUnpicked');
      step1NextBtn.style.display = 'none';
    }

    // STEP 2
    renderDatabaseTable(res);

    // STEP 3 (Pure FX Outlook)
    renderDynamicFxPanel(res);

    // Center Peek Modal: Model Lifecycle & Retention Probability
    const sotaUntilText = formatFutureMonth(2026, 11, state.effectiveSotaMonths);
    const nextWhenText = formatFutureMonth(2026, 11, state.nextFlagshipInterval);
    document.getElementById('lbl-sota-len').textContent = t('modal.monthsVal', { n: state.effectiveSotaMonths });
    document.getElementById('lbl-next-interval').textContent = t('modal.monthsVal', { n: state.nextFlagshipInterval });
    document.getElementById('lbl-retain-prob').textContent = `${state.retainProbPct}%`;
    document.getElementById('help-sota-until').textContent =
      t('modal.sotaHelp', { n: state.effectiveSotaMonths, until: sotaUntilText });
    document.getElementById('help-next-when').textContent =
      t('modal.nextHelp', { n: state.nextFlagshipInterval, when: nextWhenText });
    document.getElementById('help-retain-prob').textContent =
      t('modal.retainHelpDyn', { k: res.sotaCutoff, until: sotaUntilText });

    const sotaPct = Math.min(94, Math.max(8, (state.effectiveSotaMonths / 12) * 100));
    const nextPct = Math.min(96, Math.max(12, (state.nextFlagshipInterval / 12) * 100));
    document.getElementById('lc-active-seg').style.width = `${sotaPct}%`;
    document.getElementById('lc-sota-node').style.left = `${sotaPct}%`;
    document.getElementById('lc-sota-label').textContent = t('modal.nodeSota', { when: lang === 'en-US' ? sotaUntilText : sotaUntilText.slice(2) });
    document.getElementById('lc-next-node').style.left = `${nextPct}%`;
    document.getElementById('lc-next-label').textContent = t('modal.nodeNext', { when: lang === 'en-US' ? nextWhenText : nextWhenText.slice(2) });

    const evLineEl = document.getElementById('ev-threshold-line');
    const evTagEl = document.getElementById('ev-threshold-tag');
    const evGapEl = document.getElementById('lbl-ev-gap');
    document.getElementById('ev-user-dot').style.left = `${state.retainProbPct}%`;

    if (res.breakEvenProbStatus === 'threshold' && res.breakEvenProbPct != null) {
      evLineEl.style.display = 'block';
      const clamped = Math.min(96, Math.max(4, res.breakEvenProbPct));
      evLineEl.style.left = `${clamped}%`;
      evTagEl.textContent = t('modal.evLine', { pct: res.breakEvenProbPct.toFixed(0) });
      const rawGap = state.retainProbPct - res.breakEvenProbPct;
      const effectiveGap = res.breakEvenProbDirection === 'lte' ? -rawGap : rawGap;
      evGapEl.textContent = effectiveGap >= 0
        ? t('modal.evAbove', { gap: effectiveGap.toFixed(1) })
        : t('modal.evBelow', { gap: effectiveGap.toFixed(1) });
    } else {
      evLineEl.style.display = 'none';
      if (res.breakEvenProbStatus === 'already_even') {
        evGapEl.textContent = t('modal.evAlready');
      } else if (res.breakEvenProbStatus === 'impossible') {
        evGapEl.textContent = t('modal.evImpossible');
      } else {
        evGapEl.textContent = res.upsideNet >= 0 ? t('modal.evDetPos') : t('modal.evDetNeg');
      }
    }

    // STEP 4: Institutional Financial Decision Memo
    const badge = document.getElementById('verdict-badge');
    badge.className = `tag tag-${res.verdict.tone}`;
    badge.textContent = res.verdict.badge;
    document.getElementById('verdict-headline').textContent = res.verdict.headline;
    document.getElementById('verdict-detail').textContent = res.verdict.detail;

    // Hero EV value (crisp ink numeral + colored sign)
    const evRounded = Math.round(res.expectedNetSavings);
    const evHeroEl = document.getElementById('memo-ev-hero');
    if (evRounded > 0) {
      evHeroEl.innerHTML = `<span class="ev-sign-pos">+</span>¥${Math.abs(evRounded).toLocaleString('zh-CN')}`;
    } else if (evRounded < 0) {
      evHeroEl.innerHTML = `<span class="ev-sign-neg">-</span>¥${Math.abs(evRounded).toLocaleString('zh-CN')}`;
    } else {
      evHeroEl.textContent = '¥0';
    }
    const rateStr = `${res.evReturnPct >= 0 ? '+' : ''}${res.evReturnPct.toFixed(1)}%`;
    document.getElementById('memo-ev-rate').textContent = res.bfCost > 0
      ? t('step4.evRateText', { rate: rateStr, bf: fmtYen(res.bfCost) })
      : '';

    // Condition 1: Retention Confidence vs Break-Even Line
    document.getElementById('memo-cond-prob').textContent = `${state.retainProbPct}%`;
    const probSubEl = document.getElementById('memo-cond-prob-sub');
    if (res.breakEvenProbStatus === 'already_even') {
      probSubEl.textContent = t('step4.condProbLocked');
    } else if (res.breakEvenProbStatus === 'impossible') {
      probSubEl.textContent = t('step4.condProbImpossible');
    } else if (res.breakEvenProbStatus === 'deterministic') {
      probSubEl.textContent = t('step4.condProbDet');
    } else if (res.breakEvenProbPct != null) {
      const gap = (res.breakEvenProbDirection === 'lte'
        ? res.breakEvenProbPct - state.retainProbPct
        : state.retainProbPct - res.breakEvenProbPct);
      probSubEl.textContent = gap >= 0
        ? t('step4.condProbAbove', { line: res.breakEvenProbPct.toFixed(1), gap: gap.toFixed(1) })
        : t('step4.condProbBelow', { line: res.breakEvenProbPct.toFixed(1), gap: gap.toFixed(1) });
    }

    // Condition 2: True Cumulative Calendar Payback + Equivalent Usage Subtext
    document.getElementById('memo-cond-crossover').textContent =
      res.crossoverMonthIndex !== null
        ? getMonthLabel(res.crossoverMonthIndex)
        : t('step4.condCrossNone');
    document.getElementById('memo-cond-crossover-sub').textContent =
      Number.isFinite(res.equivalentUsageMonths) && res.proCoveredMonths > 0
        ? t('step4.condCrossSub', { n: res.equivalentUsageMonths.toFixed(1), avg: Math.round(res.avgProPrice) })
        : t('step4.condCrossSubInf');

    // Hairline Upfront & Idle Strip
    const idleStripPart = res.totalIdleMonths > 0
      ? t('step4.stripIdle', { n: res.totalIdleMonths, cost: fmtYen(res.totalIdleCostCny) })
      : t('step4.stripIdleZero');
    document.getElementById('memo-strip').innerHTML = `
      <span>${escapeHtml(t('step4.stripUpfront', { bf: fmtYen(res.bfCost) }))}</span>
      <span class="memo-strip-sep">·</span>
      <span>${escapeHtml(t('step4.stripMonthly', { avg: res.bfMonthlyAvg.toFixed(1) }))}</span>
      <span class="memo-strip-sep">·</span>
      <span>${escapeHtml(idleStripPart)}</span>`;

    // Collapsible Idle Breakdown
    const idleDetails = document.getElementById('idle-details');
    if (res.totalIdleMonths > 0) {
      const keptMonths = res.monthlyRows
        .filter((r) => r.hasKeptPlan)
        .map((r) => getMonthShort(r.index));
      const keptLabels = [
        ...new Set(
          res.monthlyRows
            .filter((r) => r.hasKeptPlan)
            .flatMap((r) => r.items.map((it) => localizeItemShort(it.short)))
        ),
      ];
      idleDetails.style.display = 'block';
      document.getElementById('idle-details-summary').textContent =
        t('step4.idleDetailsSummary', { n: res.totalIdleMonths });
      document.getElementById('idle-details-text').textContent =
        res.keptOtherPlanMonths > 0
          ? t('step4.idleDetailUltra', {
              months: keptMonths.join(lang === 'en-US' ? ', ' : '、'),
              n: res.keptOtherPlanMonths,
              plans: keptLabels.join(' / '),
              pct: Math.round((res.keptOtherPlanMonths / 12) * 100),
              cost: fmtYen(res.ultraIdleCostCny),
              pro: res.proCoveredMonths,
            })
          : t('step4.idleDetailNone', {
              n: res.idleNoneMonths,
              pct: Math.round((res.idleNoneMonths / 12) * 100),
              cost: fmtYen(res.totalIdleCostCny),
            });
    } else {
      idleDetails.style.display = 'none';
    }

    // Conditional Legacy Turkey Ultra Risk Note
    document.getElementById('legacy-ultra-risk-note').style.display =
      res.hasLegacyTurkeyUltra ? 'block' : 'none';

    // Bidirectional Payoff Bar, Cumulative Chart, Scenario Table, 3x3 Sensitivity Matrix
    renderPayoffBar(res);
    renderChart(res);

    document.getElementById('scenarios-tbody').innerHTML = res.scenarios
      .map((sc) => {
        const rounded = Math.round(sc.diff);
        const pillCls = rounded > 0 ? 'is-pos' : rounded < 0 ? 'is-neg' : 'is-zero';
        const rowCls = sc.isBaseline ? 'fin-row-baseline' : '';
        return `
          <tr class="${rowCls}">
            <td>
              <div class="fin-scen-title">${escapeHtml(sc.title)}</div>
              <div class="fin-scen-sub">${escapeHtml(sc.periodNote || '')}</div>
            </td>
            <td class="num mono">${fmtNum(sc.buyTotal)}</td>
            <td class="num mono">${fmtNum(sc.skipTotal)}</td>
            <td class="num mono"><span class="fin-diff-pill ${pillCls}">${escapeHtml(fmtNum(sc.diff, true))}</span></td>
          </tr>`;
      })
      .join('');

    renderSensitivityMatrix(res);
  }

  function updateCustomBfCost() {
    const cur = document.getElementById('inp-bf-currency').value;
    const raw = Math.max(0, Number(document.getElementById('inp-bf-raw').value) || 0);
    state.bfPicked = true;
    state.bfPreset = 'custom';
    state.bfCurrency = cur;
    state.bfRawAmount = raw;
    state.bfCostCny = Math.round(convertToCny(raw, cur, 0, 0));
    render();
  }

  function bindEvents() {
    document.getElementById('step-nav-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-go-step]');
      if (!btn) return;
      goToStep(Number(btn.dataset.goStep));
    });

    document.getElementById('inp-preset-picker').addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) return;
      const found = SCENARIO_PRESETS.find((p) => p.id === id);
      if (!found) return;
      state = cloneState(found.patch);
      showBfCompare = true;
      pickerState = null;
      setPhaseModalOpen(false);
      syncInputsFromState();
      e.target.value = '';
      goToStep(3);
      showToast(t('toast.presetLoaded', { name: found.name }));
    });

    document.getElementById('btn-lang-toggle').addEventListener('click', () => {
      const next = getLang() === 'zh-CN' ? 'en-US' : 'zh-CN';
      setLang(next);
      renderPresetOptions();
      render();
      showToast(t('toast.langSwitched'));
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state = createInitialUiState();
      selectedMonths = new Set();
      showBfCompare = false;
      pickerState = null;
      setPhaseModalOpen(false);
      syncInputsFromState();
      goToStep(0);
      showToast(t('toast.reset'));
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
      if (currentStep > 0) goToStep(currentStep - 1);
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
    });

    document.getElementById('btn-mobile-prev').addEventListener('click', () => {
      if (currentStep > 0) goToStep(currentStep - 1);
    });

    document.getElementById('btn-mobile-next').addEventListener('click', () => {
      if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
    });

    // Step 1: 5 Regions + Custom
    document.getElementById('bf-choice-grid').addEventListener('click', (e) => {
      const row = e.target.closest('[data-bf-choice]');
      if (!row) return;
      const choice = row.dataset.bfChoice;
      state.bfPicked = true;
      state.bfPreset = choice;
      if (choice !== 'custom' && BF_DEAL_PRESETS[choice]) {
        const p = BF_DEAL_PRESETS[choice];
        state.bfCurrency = p.currency;
        state.bfRawAmount = p.amount;
        state.bfCostCny = p.cnyCost;
        document.getElementById('inp-bf-currency').value = p.currency;
        document.getElementById('inp-bf-raw').value = p.amount;
      } else if (choice === 'custom') {
        document.getElementById('inp-bf-currency').value = state.bfCurrency || 'CNY';
        document.getElementById('inp-bf-raw').value = state.bfRawAmount != null ? state.bfRawAmount : state.bfCostCny;
      }
      render();
    });

    document.getElementById('btn-step1-next').addEventListener('click', () => {
      goToStep(1);
    });

    document.getElementById('inp-bf-currency').addEventListener('change', updateCustomBfCost);
    document.getElementById('inp-bf-raw').addEventListener('input', updateCustomBfCost);

    // Step 2: Two-Stage Mode Switch & Phase Modal
    document.getElementById('bf-compare-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-compare-mode]');
      if (!btn) return;
      showBfCompare = btn.dataset.compareMode === 'on';
      pickerState = null;
      render();
    });

    document.getElementById('btn-phase-settings').addEventListener('click', () => {
      pickerState = null;
      renderNotionPicker();
      setPhaseModalOpen(true);
    });

    document.getElementById('btn-th-phase').addEventListener('click', () => {
      pickerState = null;
      renderNotionPicker();
      setPhaseModalOpen(true);
    });

    document.getElementById('btn-auto-drop-pro').addEventListener('click', () => {
      ensureBuyArrays();
      let droppedCount = 0;
      for (let m = 0; m < 12; m++) {
        const curB = getColumnBasket('B', m);
        const hasPro = curB.some((it) => it && (it.isGeminiPro || it.dynamicPrice === 'gemini_pro'));
        if (hasPro) {
          unsyncBuyMonth(m);
          state.buyMonthPlans[m] = state.buyMonthPlans[m].filter(
            (it) => !(it && (it.isGeminiPro || it.dynamicPrice === 'gemini_pro'))
          );
          droppedCount += 1;
        }
      }
      render();
      showToast(droppedCount > 0 ? t('toast.droppedPro', { n: droppedCount }) : t('toast.droppedProNone'));
    });

    document.getElementById('btn-close-phase-modal').addEventListener('click', () => setPhaseModalOpen(false));
    document.getElementById('btn-done-phase-modal').addEventListener('click', () => setPhaseModalOpen(false));
    document.getElementById('phase-modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'phase-modal-backdrop') setPhaseModalOpen(false);
    });

    // Step 2: Single-Column Selection Bar & Templates
    document.getElementById('btn-unselect-all').addEventListener('click', () => {
      selectedMonths = new Set();
      pickerState = null;
      render();
    });

    document.getElementById('chk-select-all').addEventListener('change', (e) => {
      selectedMonths = e.target.checked
        ? new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        : new Set();
      render();
    });

    document.getElementById('inp-plan-template').addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;
      const preset = BF_DEAL_PRESETS[state.bfPreset];
      const regionProId = (preset && preset.defaultMonthlyProId) || 'gemini_pro_tr';
      const pair = buildPlanPair(key, regionProId);
      state.monthPlans = pair.monthPlans;
      state.buyMonthPlans = pair.buyMonthPlans;
      state.buyMonthSynced = pair.buyMonthSynced;
      state.monthEdited = Array(12).fill(key !== 'region_pro');
      if (key !== 'empty') showBfCompare = true;
      pickerState = null;
      e.target.value = '';
      render();
      showToast(t('toast.templateApplied'));
    });

    document.getElementById('btn-open-batch-picker').addEventListener('click', (e) => {
      e.stopPropagation();
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      pickerState = {
        column: 'A',
        mode: 'replace',
        targetIndices: indices,
        itemIdx: 0,
        anchorRect: e.currentTarget.getBoundingClientRect(),
        showCustom: false,
      };
      renderNotionPicker();
    });

    document.getElementById('btn-open-batch-add-picker').addEventListener('click', (e) => {
      e.stopPropagation();
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      pickerState = {
        column: 'A',
        mode: 'add',
        targetIndices: indices,
        itemIdx: null,
        anchorRect: e.currentTarget.getBoundingClientRect(),
        showCustom: false,
      };
      renderNotionPicker();
    });

    document.getElementById('btn-clear-selected-months').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      pickerState = null;
      markMonthsEdited(indices);
      mutateColumnMonths('A', indices, (arr) => {
        arr.length = 0;
      });
      showToast(t('toast.clearedN', { n: indices.length }));
    });

    // Notion Database Brand-Grouped Floating Select Picker Events
    pickerEl.addEventListener('change', (e) => {
      if (e.target.matches('[data-np-cur]')) {
        const wrap = pickerEl.querySelector('[data-np-hike-wrap]');
        if (wrap) wrap.style.display = e.target.value === 'TRY' ? 'inline-flex' : 'none';
      }
    });

    pickerEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-np-close]')) {
        pickerState = null;
        renderNotionPicker();
        return;
      }

      if (e.target.closest('[data-np-open-custom]')) {
        if (!pickerState) return;
        pickerState.showCustom = true;
        renderNotionPicker();
        const nameEl = pickerEl.querySelector('[data-np-cname]');
        if (nameEl) nameEl.focus();
        return;
      }

      const famBtn = e.target.closest('[data-pick-family]');
      if (famBtn && pickerState) {
        const famId = famBtn.dataset.pickFamily;
        let family = null;
        for (const g of PLAN_BRAND_GROUPS) {
          const f = g.families.find((x) => x.id === famId);
          if (f) {
            family = f;
            break;
          }
        }
        if (!family) return;
        const variant = pickDefaultVariantForFamily(family);
        const { column, mode, targetIndices, itemIdx } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);

        const shouldClose = family.id === 'fam_none' || family.id === 'fam_org';
        let duplicateHit = false;

        if (mode === 'add') {
          let newSlotIdx = null;
          mutateColumnMonths(column, indices, (arr) => {
            if (arr.some((it) => it && it.id === variant.catalogId)) {
              duplicateHit = true;
              return;
            }
            arr.push(makeSubItem(variant.catalogId, 1));
            if (newSlotIdx === null) newSlotIdx = arr.length - 1;
          });
          if (duplicateHit) {
            showToast(t('toast.alreadyAdded'));
          }
          if (shouldClose || duplicateHit) {
            pickerState = null;
          } else if (pickerState) {
            // Switch to replace mode on the newly added item so user can immediately pick region/price!
            pickerState.mode = 'replace';
            pickerState.itemIdx = newSlotIdx;
          }
          renderNotionPicker();
          return;
        }

        if (shouldClose) pickerState = null;
        mutateColumnMonths(column, indices, (arr) => {
          if (variant.catalogId === 'none_idle') {
            if (indices.length === 1 && itemIdx != null && arr.length > 1) {
              arr.splice(itemIdx, 1);
            } else {
              arr.length = 0;
            }
            return;
          }
          const nextItem = makeSubItem(variant.catalogId, 1);
          if (indices.length === 1 && itemIdx != null && itemIdx < arr.length) {
            arr[itemIdx] = nextItem;
          } else {
            arr.length = 0;
            arr.push(nextItem);
          }
        });
        return;
      }

      const varBtn = e.target.closest('[data-pick-variant]');
      if (varBtn && pickerState) {
        const catId = varBtn.dataset.pickVariant;
        const { column, targetIndices, itemIdx } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        mutateColumnMonths(column, indices, (arr) => {
          if (catId === 'none_idle') {
            arr.length = 0;
            return;
          }
          const nextItem = makeSubItem(catId, 1);
          if (indices.length === 1 && itemIdx != null && itemIdx < arr.length) {
            arr[itemIdx] = nextItem;
          } else {
            arr.length = 0;
            arr.push(nextItem);
          }
        });
        return;
      }

      if (e.target.closest('[data-np-apply-price]') && pickerState) {
        const curEl = pickerEl.querySelector('[data-np-cur]');
        const amtEl = pickerEl.querySelector('[data-np-amt]');
        const hikeEl = pickerEl.querySelector('[data-np-hike]');
        const currency = curEl ? curEl.value : 'CNY';
        const amount = Math.max(0, Number(amtEl && amtEl.value) || 0);
        const midYearHike = currency === 'TRY' && Boolean(hikeEl && hikeEl.checked);
        const { column, targetIndices, itemIdx } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        pickerState = null;
        mutateColumnMonths(column, indices, (arr) => {
          const slot = itemIdx != null && arr[itemIdx] ? arr[itemIdx] : arr[0];
          if (!slot) return;
          if (slot.dynamicPrice === 'gemini_ultra_5x' && currency === 'CNY') {
            state.currentUltraCny = amount;
          } else {
            if (slot.dynamicPrice === 'gemini_ultra_5x') {
              slot.dynamicPrice = null;
            }
            slot.currency = currency;
            slot.amount = amount;
            slot.midYearHike = midYearHike;
          }
        });
        showToast(t('toast.priceUpdated'));
        return;
      }

      if (e.target.closest('[data-np-csave]') && pickerState) {
        const nameEl = pickerEl.querySelector('[data-np-cname]');
        const curEl = pickerEl.querySelector('[data-np-ccur]');
        const amtEl = pickerEl.querySelector('[data-np-camt]');
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
          showToast(t('toast.enterName'));
          if (nameEl) nameEl.focus();
          return;
        }
        const currency = curEl ? curEl.value : 'CNY';
        const amount = Math.max(0, Number(amtEl && amtEl.value) || 0);
        const customId = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;
        const { column, mode, targetIndices, itemIdx } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        pickerState = null;
        mutateColumnMonths(column, indices, (arr) => {
          const nextItem = makeSubItem(null, 1, { id: customId, name, currency, amount });
          if (mode === 'add') {
            arr.push(nextItem);
          } else if (indices.length === 1 && itemIdx != null && itemIdx < arr.length) {
            arr[itemIdx] = nextItem;
          } else {
            arr.length = 0;
            arr.push(nextItem);
          }
        });
        showToast(t('toast.customApplied', { name }));
      }
    });

    // Single-Column Marquee Drag Selection inside .col-skip (plus margins)
    const dbTbody = document.getElementById('db-months-tbody');
    const step1El = document.getElementById('step-1');
    const marqueeBox = document.createElement('div');
    marqueeBox.className = 'db-marquee-box';
    document.body.appendChild(marqueeBox);

    let marquee = null;
    let suppressNextClick = false;

    document.addEventListener('mousedown', (e) => {
      if (currentStep !== 1 || e.button !== 0 || phaseModalOpen) return;
      if (e.target.closest('input, textarea, select, option, a, button, .topbar, .side-nav-zone, .mobile-step-nav, .notion-picker, .step2-hero-bar, .db-selection-bar')) return;
      const stepRect = step1El.getBoundingClientRect();
      if (e.clientY < stepRect.top || e.clientY > stepRect.bottom + 40) return;

      marquee = {
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        additive: e.ctrlKey || e.metaKey || e.shiftKey,
        baseSelection: new Set(selectedMonths),
      };
    });

    window.addEventListener('mousemove', (e) => {
      if (!marquee) return;
      if (e.buttons === 0) {
        marquee = null;
        document.body.classList.remove('is-marquee-dragging');
        marqueeBox.style.display = 'none';
        return;
      }

      const dx = e.clientX - marquee.startX;
      const dy = e.clientY - marquee.startY;
      if (!marquee.active && Math.hypot(dx, dy) < 6) return;

      if (!marquee.active) {
        marquee.active = true;
        pickerState = null;
        renderNotionPicker();
        document.body.classList.add('is-marquee-dragging');
        marqueeBox.style.display = 'block';
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
      }

      e.preventDefault();

      const left = Math.min(marquee.startX, e.clientX);
      const top = Math.min(marquee.startY, e.clientY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);

      marqueeBox.style.left = `${left}px`;
      marqueeBox.style.top = `${top}px`;
      marqueeBox.style.width = `${width}px`;
      marqueeBox.style.height = `${height}px`;

      const rectBottom = top + height;
      const rectRight = left + width;
      const nextSet = marquee.additive ? new Set(marquee.baseSelection) : new Set();

      dbTbody.querySelectorAll('td.col-skip[data-cell-idx]').forEach((td) => {
        const tr = td.closest('tr');
        const r = tr.getBoundingClientRect();
        const intersects = !(r.right < left || r.left > rectRight || r.bottom < top || r.top > rectBottom);
        const idx = Number(td.dataset.cellIdx);
        if (intersects) {
          nextSet.add(idx);
          td.classList.add('is-cell-selected');
          const box = td.querySelector('[data-chk-month]');
          if (box) box.checked = true;
        } else if (!marquee.additive) {
          td.classList.remove('is-cell-selected');
          const box = td.querySelector('[data-chk-month]');
          if (box) box.checked = false;
        }
      });

      selectedMonths = nextSet;
    });

    window.addEventListener('mouseup', () => {
      if (!marquee) return;
      const wasActive = marquee.active;
      marquee = null;
      document.body.classList.remove('is-marquee-dragging');
      marqueeBox.style.display = 'none';
      if (wasActive) {
        suppressNextClick = true;
        setTimeout(() => {
          suppressNextClick = false;
        }, 0);
        render();
      }
    });

    document.addEventListener(
      'click',
      (e) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (currentStep !== 1 || phaseModalOpen) return;
        if (pickerState && !e.target.closest('.notion-picker, [data-open-picker], [data-add-picker], #btn-open-batch-picker, #btn-open-batch-add-picker')) {
          pickerState = null;
          renderNotionPicker();
        }
        if (selectedMonths.size === 0) return;
        if (e.target.closest('.notion-db, .db-selection-bar, .topbar, .side-nav-zone, .mobile-step-nav, .notion-picker, .step2-hero-bar')) return;
        selectedMonths = new Set();
        render();
      },
      true
    );

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (phaseModalOpen) {
        setPhaseModalOpen(false);
        return;
      }
      if (currentStep !== 1) return;
      if (pickerState) {
        pickerState = null;
        renderNotionPicker();
      } else if (selectedMonths.size > 0) {
        selectedMonths = new Set();
        render();
      }
    });

    dbTbody.addEventListener('click', (e) => {
      const chk = e.target.closest('[data-chk-month]');
      if (chk) {
        const idx = Number(chk.dataset.chkMonth);
        if (e.shiftKey && lastCheckedIdx !== null) {
          const start = Math.min(lastCheckedIdx, idx);
          const end = Math.max(lastCheckedIdx, idx);
          for (let i = start; i <= end; i++) {
            if (chk.checked) selectedMonths.add(i);
            else selectedMonths.delete(i);
          }
        } else {
          if (chk.checked) selectedMonths.add(idx);
          else selectedMonths.delete(idx);
        }
        lastCheckedIdx = idx;
        render();
        return;
      }

      if (e.target.closest('[data-open-phase-pop]')) {
        pickerState = null;
        renderNotionPicker();
        setPhaseModalOpen(true);
        return;
      }

      const syncBtn = e.target.closest('[data-sync-b]');
      if (syncBtn) {
        e.stopPropagation();
        ensureBuyArrays();
        const mIdx = Number(syncBtn.dataset.syncB);
        state.buyMonthSynced[mIdx] = true;
        pickerState = null;
        render();
        showToast(t('toast.syncedBack'));
        return;
      }

      const rmBtn = e.target.closest('[data-remove-item]');
      if (rmBtn) {
        e.stopPropagation();
        const [col, mStr, iStr] = rmBtn.dataset.removeItem.split(':');
        const mIdx = Number(mStr);
        const itemIdx = Number(iStr);
        pickerState = null;
        if (col === 'A') markMonthsEdited([mIdx]);
        mutateColumnMonths(col, [mIdx], (arr) => {
          if (itemIdx >= 0 && itemIdx < arr.length) arr.splice(itemIdx, 1);
        });
        return;
      }

      const addBtn = e.target.closest('[data-add-picker]');
      if (addBtn) {
        e.stopPropagation();
        const [col, mStr] = addBtn.dataset.addPicker.split(':');
        const mIdx = Number(mStr);
        pickerState = {
          column: col,
          mode: 'add',
          targetIndices: [mIdx],
          itemIdx: null,
          anchorRect: addBtn.getBoundingClientRect(),
          showCustom: false,
        };
        renderNotionPicker();
        return;
      }

      const pillBtn = e.target.closest('[data-open-picker]');
      if (pillBtn) {
        e.stopPropagation();
        const [col, mStr, iStr] = pillBtn.dataset.openPicker.split(':');
        const mIdx = Number(mStr);
        const itemIdx = Number(iStr);
        const targets = col === 'A' && selectedMonths.size > 1 && selectedMonths.has(mIdx)
          ? getSelectedIndices()
          : [mIdx];
        if (
          pickerState &&
          pickerState.column === col &&
          pickerState.mode === 'replace' &&
          pickerState.targetIndices.length === targets.length &&
          pickerState.targetIndices[0] === targets[0] &&
          pickerState.itemIdx === itemIdx
        ) {
          pickerState = null;
        } else {
          pickerState = {
            column: col,
            mode: 'replace',
            targetIndices: targets,
            itemIdx,
            anchorRect: pillBtn.getBoundingClientRect(),
            showCustom: false,
          };
        }
        renderNotionPicker();
      }
    });

    // Step 3: Dynamic Multi-Currency Bidirectional FX Sliders
    document.getElementById('fx-dynamic-panel').addEventListener('input', (e) => {
      const slider = e.target.closest('[data-fx-slider]');
      if (!slider) return;
      const code = slider.dataset.fxSlider;
      const val = Number(slider.value);
      if (!state.fxAnnualChangePct || typeof state.fxAnnualChangePct !== 'object') {
        state.fxAnnualChangePct = Object.assign({}, DEFAULT_FX_ANNUAL_PCT);
      }
      state.fxAnnualChangePct[code] = val;
      render();
    });

    // Center Peek Modal: Model Lifecycle & Retention Sliders
    document.getElementById('inp-sota-len').addEventListener('input', (e) => {
      state.effectiveSotaMonths = Number(e.target.value);
      render();
    });

    document.getElementById('inp-next-interval').addEventListener('input', (e) => {
      state.nextFlagshipInterval = Number(e.target.value);
      render();
    });

    document.getElementById('inp-retain-prob').addEventListener('input', (e) => {
      state.retainProbPct = Number(e.target.value);
      render();
    });

    function triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('btn-copy-hd-img').addEventListener('click', async () => {
      const lang = getLang();
      const res = calculateLedger(state, lang);
      const svg = buildSummarySvg(state, res, lang);
      try {
        const pngBlob = await svgToHighResPngBlob(svg, 3);
        if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
          showToast(t('toast.copiedPng'));
        } else {
          triggerDownload(pngBlob, 'do-you-really-need-gemini-pro-bf-3x.png');
          showToast(t('toast.downloadedPng'));
        }
      } catch {
        try {
          const pngBlob = await svgToHighResPngBlob(svg, 3);
          triggerDownload(pngBlob, 'do-you-really-need-gemini-pro-bf-3x.png');
          showToast(t('toast.downloadedPng'));
        } catch {
          showToast(t('toast.pngFailed'));
        }
      }
    });

    document.getElementById('btn-export-svg').addEventListener('click', () => {
      const lang = getLang();
      const res = calculateLedger(state, lang);
      const svg = buildSummarySvg(state, res, lang);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      triggerDownload(blob, 'do-you-really-need-gemini-pro-bf.svg');
      showToast(t('toast.exportedSvg'));
    });

    document.getElementById('btn-export-html').addEventListener('click', () => {
      const lang = getLang();
      const res = calculateLedger(state, lang);
      const html = buildStandaloneHtml(state, res, lang);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, 'do-you-really-need-gemini-pro-bf-report.html');
      showToast(t('toast.exportedHtml'));
    });

    document.getElementById('btn-copy-summary').addEventListener('click', async () => {
      const lang = getLang();
      const res = calculateLedger(state, lang);
      const lineStr =
        res.breakEvenProbStatus === 'already_even'
          ? (lang === 'en-US' ? 'Locked in SOTA span' : '主力期内已回本')
          : res.breakEvenProbStatus === 'impossible'
            ? (lang === 'en-US' ? 'Unreachable' : '全年仍未回本')
            : res.breakEvenProbPct != null
              ? `${res.breakEvenProbPct.toFixed(1)}%`
              : '—';
      const crossStr =
        res.crossoverMonthIndex !== null
          ? getMonthLabel(res.crossoverMonthIndex)
          : t('step4.condCrossNone');
      const lines = (lang === 'en-US'
        ? [
            '[Do You Really Need Gemini Pro Black Friday?]',
            `- Verdict: ${res.verdict.badge} (${res.verdict.headline})`,
            `- Plan A (No BF) vs Plan B (With BF incl. upfront): ${fmtYen(res.totalSkipCost)} vs ${fmtYen(res.totalBuyCost)}`,
            `- 12-Mo Expected Net Savings (EV): ${fmtYen(res.expectedNetSavings, true)} (Your ${state.retainProbPct}% · Break-even ${lineStr})`,
            `- Cumulative Payback: ${crossStr}`,
            `- Endpoints (D / U): ${fmtYen(res.downsideNet, true)} / ${fmtYen(res.upsideNet, true)}`,
          ]
        : [
            '【AI 黑五包年决策账本】',
            `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
            `- 双方案总花费：不买黑五 ${fmtYen(res.totalSkipCost)} vs 买黑五（含预付）${fmtYen(res.totalBuyCost)}`,
            `- 12 个月期望净节省 (EV)：${fmtYen(res.expectedNetSavings, true)}（留存把握 ${state.retainProbPct}% · 盈亏线 ${lineStr}）`,
            `- 累计回本节点：${crossStr}`,
            `- 两端结果（D / U）：${fmtYen(res.downsideNet, true)} / ${fmtYen(res.upsideNet, true)}`,
          ]).join('\n');

      try {
        await navigator.clipboard.writeText(lines);
        showToast(t('toast.copiedText'));
      } catch {
        showToast(t('toast.copyFailed'));
      }
    });
  }

  renderStaticTables();
  syncInputsFromState();
  bindEvents();
  render();
})();
