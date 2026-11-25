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
    FX_RATES,
    HISTORICAL_TIMELINE,
    MONTHS,
    PLAN_BRAND_GROUPS,
    SCENARIO_PRESETS,
    TRY_FX_HISTORY,
    buildPlanPair,
    deriveSyncedBuyBasket,
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
    { idx: 4, key: 'nav.step4' },
  ];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Fresh UI starts with Step 1 unselected, Step 2 (Plan A) empty, and Step 3 (Plan B) synced
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
  let lastConfigStep = 1;
  let maxVisitedStep = 0;
  let displayCurrency = getLang() === 'en-US' ? 'USD' : 'CNY';
  let activeScenarioId = null; // null = default EV mode; or one of the 4 scenario IDs
  let selectedMonths = new Set();  // Step 2 (Plan A) selection
  let selectedMonthsB = new Set(); // Step 3 (Plan B) selection
  let lastCheckedIdx = null;
  let lastCheckedIdxB = null;
  // Unified Notion Multi-Select Picker state:
  // { column: 'A'|'B', targetIndices: number[], focusedItemId: string|null, anchorRect: DOMRect, showCustom: boolean }
  let pickerState = null;
  let calcTimers = [];
  let isCalculatingFinal = false;

  // Undo / Redo History Stack (up to 60 snapshots)
  const MAX_HISTORY = 60;
  let historyPast = [];
  let historyFuture = [];
  let lastSliderSnapshotKey = null;
  let lastSliderSnapshotAt = 0;

  function recordUndoSnapshot(coalesceKey) {
    const snap = JSON.stringify(state);
    const now = Date.now();
    if (coalesceKey && coalesceKey === lastSliderSnapshotKey && now - lastSliderSnapshotAt < 900) {
      lastSliderSnapshotAt = now;
      return;
    }
    if (historyPast.length > 0 && historyPast[historyPast.length - 1] === snap) {
      return;
    }
    historyPast.push(snap);
    if (historyPast.length > MAX_HISTORY) historyPast.shift();
    historyFuture = [];
    lastSliderSnapshotKey = coalesceKey || null;
    lastSliderSnapshotAt = now;
  }

  function updateHistoryButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = historyPast.length === 0;
    if (redoBtn) redoBtn.disabled = historyFuture.length === 0;
  }

  function performUndo() {
    if (historyPast.length === 0) return;
    historyFuture.push(JSON.stringify(state));
    state = JSON.parse(historyPast.pop());
    lastSliderSnapshotKey = null;
    pickerState = null;
    syncInputsFromState();
    render();
    showToast(t('toast.undone'));
  }

  function performRedo() {
    if (historyFuture.length === 0) return;
    historyPast.push(JSON.stringify(state));
    state = JSON.parse(historyFuture.pop());
    lastSliderSnapshotKey = null;
    pickerState = null;
    syncInputsFromState();
    render();
    showToast(t('toast.redone'));
  }

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
      const sotaLen = Math.min(12, Math.max(1, Number(parsed.effectiveSotaMonths) || DEFAULT_STATE.effectiveSotaMonths));
      const maxExtra = Math.max(0, 12 - sotaLen);
      let migratedExtra;
      if (parsed.postSotaExtraMonths != null && Number.isFinite(Number(parsed.postSotaExtraMonths))) {
        migratedExtra = Math.min(maxExtra, Math.max(0, Math.round(Number(parsed.postSotaExtraMonths))));
      } else if (parsed.retainProbPct != null && Number.isFinite(Number(parsed.retainProbPct))) {
        const legacyP = Math.min(100, Math.max(0, Number(parsed.retainProbPct))) / 100;
        migratedExtra = Math.min(maxExtra, Math.max(0, Math.round(legacyP * maxExtra)));
      } else {
        migratedExtra = Math.min(maxExtra, DEFAULT_STATE.postSotaExtraMonths);
      }
      return Object.assign(createInitialUiState(), parsed, {
        fxAnnualChangePct: Object.assign({}, DEFAULT_FX_ANNUAL_PCT),
        effectiveSotaMonths: sotaLen,
        postSotaExtraMonths: migratedExtra,
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

  function getDisplayCurrency() {
    return displayCurrency === 'USD' ? 'USD' : 'CNY';
  }

  function convertDisplay(cnyVal) {
    return getDisplayCurrency() === 'USD'
      ? cnyVal / FX_RATES.CNY_PER_USD
      : cnyVal;
  }

  function fmtYen(n, withSign) {
    const cur = getDisplayCurrency();
    const sym = cur === 'USD' ? '$' : '¥';
    const val = convertDisplay(n);
    const rounded = Math.round(val);
    if (withSign) {
      if (rounded === 0) return `${sym}0`;
      return `${rounded > 0 ? '+' : '-'}${sym}${Math.abs(rounded).toLocaleString('en-US')}`;
    }
    return `${sym}${rounded.toLocaleString('en-US')}`;
  }

  function fmtMoneyDec(n, decimals) {
    const cur = getDisplayCurrency();
    const sym = cur === 'USD' ? '$' : '¥';
    const val = convertDisplay(n);
    return `${sym}${val.toFixed(decimals != null ? decimals : 1)}`;
  }

  function fmtNum(n, withSign) {
    const rounded = Math.round(convertDisplay(n));
    if (withSign) {
      if (rounded === 0) return '0';
      return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('en-US')}`;
    }
    return rounded.toLocaleString('en-US');
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

  function getSelectedIndicesB() {
    return Array.from(selectedMonthsB).filter((i) => i >= 0 && i < 12).sort((a, b) => a - b);
  }

  function getActiveSelectionSet(column) {
    return column === 'B' ? selectedMonthsB : selectedMonths;
  }

  function getActiveSelectedIndices(column) {
    return column === 'B' ? getSelectedIndicesB() : getSelectedIndices();
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
        ? deriveSyncedBuyBasket(state.monthPlans[mIdx])
        : (Array.isArray(state.buyMonthPlans[mIdx]) ? state.buyMonthPlans[mIdx] : []);
    }
    return Array.isArray(state.monthPlans[mIdx]) ? state.monthPlans[mIdx] : [];
  }

  function unsyncBuyMonth(mIdx) {
    ensureBuyArrays();
    if (state.buyMonthSynced[mIdx]) {
      state.buyMonthPlans[mIdx] = cloneState(deriveSyncedBuyBasket(state.monthPlans[mIdx]));
      state.buyMonthSynced[mIdx] = false;
    } else if (!Array.isArray(state.buyMonthPlans[mIdx])) {
      state.buyMonthPlans[mIdx] = [];
    }
  }

  function mutateColumnMonths(column, indices, mutator, skipSnapshot) {
    if (!skipSnapshot) recordUndoSnapshot();
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

  function formatItemPillLabel(item) {
    const base = localizeItemShort(item.short);
    const qty = Math.max(1, Number(item.qty) || 1);
    return qty > 1 ? `${base} ×${qty}` : base;
  }

  function getUnionPillsForTargets(column, targetIndices) {
    const map = new Map();
    targetIndices.forEach((mIdx) => {
      const basket = getColumnBasket(column, mIdx);
      basket.forEach((it) => {
        if (!it || it.id === 'none_idle' || map.has(it.id)) return;
        map.set(it.id, it);
      });
    });
    return Array.from(map.values());
  }

  function findFamilyIdForItem(item) {
    if (!item) return null;
    const hit = findFamilyByCatalogId(item.id);
    return hit ? hit.family.id : null;
  }

  // Unified Brand-Grouped Notion Multi-Select Popover (Single & Batch, Plan A & Plan B, Zero Jargon)
  function renderNotionPicker() {
    if (!pickerState || (currentStep !== 1 && currentStep !== 2)) {
      pickerEl.classList.remove('is-open');
      return;
    }
    const { column, targetIndices, focusedItemId, anchorRect, showCustom } = pickerState;
    if (!targetIndices || targetIndices.length === 0) {
      pickerState = null;
      pickerEl.classList.remove('is-open');
      return;
    }

    const firstIdx = targetIndices[0];
    const currentPills = getUnionPillsForTargets(column, targetIndices);
    const activeSlot =
      (focusedItemId && currentPills.find((it) => it.id === focusedItemId)) ||
      (currentPills.length > 0 ? currentPills[currentPills.length - 1] : null);
    const currentId = activeSlot ? activeSlot.id : 'none_idle';
    const found = activeSlot ? findFamilyByCatalogId(currentId) : null;
    const activeFamily = found ? found.family : null;
    const presentFamilyIds = new Set(currentPills.map((it) => findFamilyIdForItem(it)).filter(Boolean));

    let targetLabel;
    if (targetIndices.length === 1) {
      targetLabel = column === 'B'
        ? t('picker.buySingleTarget', { month: getMonthLabel(firstIdx) })
        : t('picker.singleTarget', { month: getMonthLabel(firstIdx) });
    } else if (column === 'B') {
      targetLabel = targetIndices.length === 12
        ? t('step2b.batchAll')
        : t('step2b.batchN', { n: targetIndices.length });
    } else {
      targetLabel = targetIndices.length === 12
        ? t('picker.batchAll')
        : t('picker.batchN', { n: targetIndices.length });
    }

    // Top bar of currently selected pills (Notion Multi-Select token bar with - / + seat stepper)
    let selectedBarHtml = '';
    if (currentPills.length > 0) {
      const selChips = currentPills
        .map((it) => {
          const isFoc = activeSlot && activeSlot.id === it.id;
          const qty = Math.max(1, Number(it.qty) || 1);
          const showStepper = it.id !== 'idle_org_seat';
          const stepperHtml = showStepper
            ? `<button type="button" class="np-sel-qty-btn" data-np-dec-id="${escapeHtml(it.id)}" title="-1">−</button><button type="button" class="np-sel-qty-btn" data-np-inc-id="${escapeHtml(it.id)}" title="+1">+</button>`
            : '';
          return `
            <span class="np-sel-pill tag-${it.tone || 'gray'} ${isFoc ? 'is-focused' : ''}">
              <button type="button" class="np-sel-pill-btn" data-np-focus-item="${escapeHtml(it.id)}">${escapeHtml(localizeItemShort(it.short))}${qty > 1 ? ` ×${qty}` : ''}</button>
              ${stepperHtml}
              <button type="button" class="np-sel-pill-x" data-np-remove-id="${escapeHtml(it.id)}" aria-label="${escapeHtml(t('step2.removeItemTitle'))}">×</button>
            </span>`;
        })
        .join('');
      selectedBarHtml = `
        <div class="np-selected-box">
          <div class="np-region-label">${escapeHtml(t('picker.selectedInCell'))}</div>
          <div class="np-selected-chips">${selChips}</div>
        </div>`;
    }

    // Region switcher box inside top of dropdown (for multi-region families)
    let regionHtml = '';
    if (activeFamily && activeFamily.variants.length > 1) {
      const chips = activeFamily.variants
        .map((v) => {
          const isAct = v.catalogId === currentId;
          return `<button type="button" class="np-region-chip ${isAct ? 'is-active' : ''}" data-pick-variant="${v.catalogId}">${escapeHtml(localizeRegion(v.region))} · ${escapeHtml(localizeItemShort(v.priceText))}</button>`;
        })
        .join('');
      regionHtml = `
        <div class="np-region-box">
          <div class="np-region-label">${escapeHtml(t('picker.regionHint', { name: localizeItemShort(activeFamily.name) }))}</div>
          <div class="np-region-chips">${chips}</div>
        </div>`;
    }

    // Inline custom price editor for the focused paid subscription
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

    // Clean brand-grouped multi-select list (clicking any plan adds it directly to ALL target months!)
    const groupsHtml = PLAN_BRAND_GROUPS.map((g) => {
      const rows = g.families
        .map((fam) => {
          const isPresent = presentFamilyIds.has(fam.id);
          const isAct = activeFamily && activeFamily.id === fam.id;
          const rightMeta =
            fam.variants.length > 1
              ? t('picker.regionsCount', { n: fam.variants.length })
              : fam.variants[0].priceText;
          return `
            <button type="button" class="np-item-btn ${isAct ? 'is-active' : ''}" data-pick-family="${fam.id}">
              <span class="np-item-left">
                ${isPresent ? '<span class="np-item-check mono">✓</span>' : ''}
                <span class="tag tag-${fam.tone}" style="font-size:12.5px;padding:1px 7px;">${escapeHtml(localizeItemShort(fam.name))}</span>
              </span>
              <span class="np-item-meta mono">${escapeHtml(rightMeta)}</span>
            </button>`;
        })
        .join('');
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
        ${selectedBarHtml}
        ${regionHtml}
        ${priceInlineHtml}
      </div>
      <div class="np-list">${groupsHtml}</div>
      <div class="np-custom-footer">${customSectionHtml}</div>
    `;

    pickerEl.classList.add('is-open');
    positionFloatingBox(pickerEl, anchorRect, 376, 480);
  }

  function jumpToLifecycleSection() {
    goToStep(3);
    setTimeout(() => {
      const el = document.getElementById('section-model-lifecycle');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  function clearCalcTimers() {
    calcTimers.forEach((id) => clearTimeout(id));
    calcTimers = [];
  }

  // Real 12-Month Ledger Replay (~1.12s): plays back actual monthly flows & cumSkip - cumBuy
  function runFinalCalculationSequence() {
    clearCalcTimers();
    activeScenarioId = null;
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
    const res = calculateLedger(state, getLang(), getDisplayCurrency());

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

    // 820–980ms: Expected active usage span summary
    calcTimers.push(
      setTimeout(() => {
        ticks.forEach((tk) => {
          tk.classList.add('is-lit');
          tk.classList.remove('is-active');
        });
        statusEl.textContent = t('step4.replayWeight', {
          parts: formatSpanParts(res, getLang()),
          m: res.expectedActiveMonths,
        });
      }, 820)
    );

    // 1020ms: Final reveal
    calcTimers.push(
      setTimeout(() => {
        statusEl.textContent = t('step4.replayDone', {
          m: res.expectedActiveMonths,
          ev: fmtYen(res.expectedNetSavings, true),
        });
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
    const enteringFinal = nextStep === 4 && currentStep !== 4;
    currentStep = nextStep;
    if (currentStep >= 1 && currentStep <= 3) lastConfigStep = currentStep;
    maxVisitedStep = Math.max(maxVisitedStep, currentStep);
    pickerState = null;
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

    if (active.length === 0) {
      panel.innerHTML = `
        <div class="prop-row">
          <span class="prop-key">${escapeHtml(t('step3.fxNoneKey'))}</span>
          <div class="prop-val">
            <span class="unit">${escapeHtml(t('step3.fxNoneVal'))}</span>
          </div>
        </div>`;
      return;
    }

    panel.innerHTML = active
      .map((entry) => {
        const code = entry.currency;
        const meta = FX_CURRENCY_META[code];
        if (!meta) return '';
        const loc = localizeCurrencyMeta(code, meta);
        const pct = meta.defaultAnnualPct;
        const d = fmtFxDelta(pct);
        const preview = buildFxPreviewText(code, pct);
        return `
          <div class="fx-card-block" data-fx-block="${code}">
            <div class="prop-row">
              <span class="prop-key">${escapeHtml(t('step3.fxBaseKey', { name: loc.name }))}</span>
              <div class="prop-val mono">
                <span>${escapeHtml(meta.displayBase)}</span>
                <span class="unit">${escapeHtml(t('step3.fxMonths', { n: entry.monthsCount }))}</span>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-key">${escapeHtml(t('step3.fxDeltaKey', { name: loc.name }))}</span>
              <div class="prop-val">
                <span class="mono ${d.cls}" style="font-weight:600;">${escapeHtml(d.text)}</span>
              </div>
            </div>
            <p class="muted-note" style="padding: 2px 6px 6px;">${escapeHtml(preview)}</p>
          </div>`;
      })
      .join('');
  }

  function renderStaticTables() {
    const isEn = getLang() === 'en-US';

    const notesEl = document.getElementById('notes-list');
    if (notesEl) {
      notesEl.innerHTML = [1, 2, 3, 4]
        .map((n) => `<li><strong>${escapeHtml(t(`step4.note${n}Title`))}</strong>${isEn ? ': ' : '：'}${escapeHtml(t(`step4.note${n}Body`))}</li>`)
        .join('');
    }

    document.getElementById('timeline-tbody').innerHTML = HISTORICAL_TIMELINE.map(
      (item) => `
        <tr>
          <td class="mono" style="white-space:nowrap;">${escapeHtml(item.date)}</td>
          <td style="font-weight:500;">${escapeHtml(item.model)}</td>
          <td style="white-space:nowrap;"><span class="tag tag-gray">${escapeHtml(isEn && item.durabilityEn ? item.durabilityEn : item.durability)}</span></td>
          <td>${escapeHtml(isEn && item.summaryEn ? item.summaryEn : item.summary)}</td>
        </tr>`
    ).join('');

    document.getElementById('fx-tbody').innerHTML = TRY_FX_HISTORY.map(
      (row) => `
        <tr>
          <td>${escapeHtml(isEn && row.periodEn ? row.periodEn : row.period)}</td>
          <td class="num mono">${escapeHtml(row.rate)}</td>
          <td class="num mono">${escapeHtml(isEn && row.yoyEn ? row.yoyEn : row.yoy)}</td>
          <td class="num mono">${escapeHtml(isEn && row.pro870En ? row.pro870En : row.pro870)}</td>
          <td class="num mono">${escapeHtml(isEn && row.ultra4750En ? row.ultra4750En : row.ultra4750)}</td>
        </tr>`
    ).join('');
  }

  function syncInputsFromState() {
    document.getElementById('inp-bf-currency').value = state.bfCurrency || 'CNY';
    document.getElementById('inp-bf-raw').value = state.bfRawAmount != null ? state.bfRawAmount : state.bfCostCny;
    document.getElementById('inp-sota-len').value = state.effectiveSotaMonths;
    document.getElementById('inp-next-interval').value = state.nextFlagshipInterval;
    const maxExtra = Math.max(0, 12 - (Number(state.effectiveSotaMonths) || 7));
    const extraEl = document.getElementById('inp-post-sota-extra');
    extraEl.max = String(maxExtra);
    extraEl.value = String(Math.min(maxExtra, Math.max(0, Number(state.postSotaExtraMonths) || 0)));
    extraEl.disabled = maxExtra === 0;
  }

  function isStepUnlocked(idx) {
    if (idx === 0) return true;
    if (!state.bfPicked) return false;
    // Step 5 (Verdict) stays locked until the user reaches Step 4 or has already calculated
    if (idx === 4) return maxVisitedStep >= 4 || currentStep === 3;
    return true;
  }

  function renderStepTabs() {
    const tabs = [
      {
        key: 'nav.tabRegion',
        target: 0,
        isCurrent: currentStep === 0,
        isDone: currentStep > 0 && isStepUnlocked(0),
        unlocked: isStepUnlocked(0),
      },
      {
        key: 'nav.tabSubs',
        target: currentStep === 0 ? 1 : lastConfigStep,
        isCurrent: currentStep >= 1 && currentStep <= 3,
        isDone: maxVisitedStep >= 1 && currentStep === 4 && isStepUnlocked(1),
        unlocked: isStepUnlocked(1),
      },
      {
        key: 'nav.tabVerdict',
        target: 4,
        isCurrent: currentStep === 4,
        isDone: false,
        unlocked: isStepUnlocked(4),
      },
    ];
    document.getElementById('step-nav-list').innerHTML = tabs
      .map((tab) => {
        const cls = tab.isCurrent ? 'is-current' : tab.isDone ? 'is-done' : '';
        return `<button type="button" class="step-tab ${cls}" data-go-step="${tab.target}" ${tab.unlocked ? '' : 'disabled'}>${escapeHtml(t(tab.key))}</button>`;
      })
      .join('');
  }

  const PHASE_CUE_SVG =
    '<span class="phase-pill-cue" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 5h12M2 11h12"/><circle cx="6" cy="5" r="1.8" fill="currentColor"/><circle cx="10.5" cy="11" r="1.8" fill="currentColor"/></svg></span>';

  function renderPillStack(column, rowIdx, items, isSyncedGhost, baselineItemsA) {
    const addTitle = escapeHtml(t('step2.addAnotherTitle'));
    const removeTitle = escapeHtml(t('step2.removeItemTitle'));

    if (!items || items.length === 0) {
      if (column === 'B') {
        if (isSyncedGhost) {
          const autoOffsetCovered = Array.isArray(baselineItemsA) && baselineItemsA.length > 0;
          if (autoOffsetCovered) {
            return `
              <div class="bf-compare-cell">
                <button type="button" class="bf-no-extra-pill" data-open-picker="B:${rowIdx}:" title="${addTitle}">${escapeHtml(t('step2.bfNoExtra'))} <span aria-hidden="true">▾</span></button>
              </div>`;
          }
          return `
            <div class="bf-compare-cell">
              <button type="button" class="cell-pill-btn tone-empty" data-open-picker="B:${rowIdx}:">
                <span class="cell-pill-text">${escapeHtml(t('step2.bfWaitBaseline'))}</span>
                <span class="cell-pill-caret" aria-hidden="true">▾</span>
              </button>
            </div>`;
        }
        return `
          <div class="bf-compare-cell">
            <button type="button" class="bf-no-extra-pill" data-open-picker="B:${rowIdx}:" title="${addTitle}">${escapeHtml(t('step2.bfNoExtra'))} <span aria-hidden="true">▾</span></button>
            <button type="button" class="bf-sync-chip" data-sync-b="${rowIdx}" title="${escapeHtml(t('step2.bfSyncBackTip'))}">${escapeHtml(t('step2.bfSyncBack'))}</button>
          </div>`;
      }
      const isOpenEmpty = Boolean(
        pickerState && pickerState.column === 'A' && pickerState.targetIndices.includes(rowIdx)
      );
      return `
        <button type="button" class="cell-pill-btn tone-empty ${isOpenEmpty ? 'is-open' : ''}" data-open-picker="A:${rowIdx}:">
          <span class="cell-pill-text">${escapeHtml(t('step2.pickPlaceholder'))}</span>
          <span class="cell-pill-caret" aria-hidden="true">▾</span>
        </button>`;
    }

    const chipsHtml = items
      .map((item) => {
        const tone = `tone-${item.tone || 'gray'}`;
        const isOpen = Boolean(
          pickerState &&
          pickerState.column === column &&
          pickerState.targetIndices.includes(rowIdx) &&
          pickerState.focusedItemId === item.id
        );
        const hikeBadge = item.midYearHike
          ? `<span class="cell-hike-dot">${escapeHtml(t('step2.hikeTag'))}</span>`
          : '';
        return `
          <span class="pill-chip-group ${tone} ${isSyncedGhost ? 'is-synced-ghost' : ''}">
            <button type="button" class="cell-pill-btn ${isOpen ? 'is-open' : ''}" data-open-picker="${column}:${rowIdx}:${escapeHtml(item.id)}">
              <span class="cell-pill-text">${escapeHtml(formatItemPillLabel(item))}</span>
            </button>
            <button type="button" class="pill-chip-x" data-remove-item="${column}:${rowIdx}:${escapeHtml(item.id)}" title="${removeTitle}" aria-label="${removeTitle}">×</button>
          </span>${hikeBadge}`;
      })
      .join('');

    const syncHtml = column === 'B' && !isSyncedGhost
      ? `<button type="button" class="bf-sync-chip" data-sync-b="${rowIdx}" title="${escapeHtml(t('step2.bfSyncBackTip'))}">${escapeHtml(t('step2.bfSyncBack'))}</button>`
      : '';

    return `
      <div class="cell-pills-wrap">
        ${chipsHtml}
        <button type="button" class="cell-caret-btn" data-open-picker="${column}:${rowIdx}:" title="${addTitle}" aria-label="${addTitle}">▾</button>
        ${syncHtml}
      </div>`;
  }

  const LOCK_SVG =
    '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';

  function renderDatabaseTable(res) {
    // --- STEP 2: Plan A (Without Black Friday) ---
    const indicesA = getSelectedIndices();
    document.getElementById('db-selection-bar').style.display = indicesA.length > 0 ? 'flex' : 'none';
    document.getElementById('editor-selected-title').textContent =
      indicesA.length === 12 ? t('step2.selectedAll') : t('step2.selectedN', { n: indicesA.length });

    const chkAllA = document.getElementById('chk-select-all');
    chkAllA.checked = indicesA.length === 12;
    chkAllA.indeterminate = indicesA.length > 0 && indicesA.length < 12;

    const phaseTip = escapeHtml(t('step2.phaseTooltip'));
    document.getElementById('db-months-tbody').innerHTML = res.monthlyRows
      .map((row) => {
        const isSel = selectedMonths.has(row.index);
        const skipCellHtml = `
          <div class="cell-skip-inner">
            <input type="checkbox" class="cell-chk" data-chk-month="${row.index}" ${isSel ? 'checked' : ''} aria-label="${escapeHtml(getMonthLabel(row.index))}" />
            ${renderPillStack('A', row.index, row.items, false)}
          </div>`;
        const costText = row.skipMonthFlow > 0
          ? `<span class="mono">${fmtYen(row.skipMonthFlow)}</span>`
          : '<span class="mono save-val-idle">—</span>';

        return `
          <tr class="db-row" data-row-idx="${row.index}">
            <td class="col-month">
              <span class="db-month-main">${escapeHtml(getMonthLabel(row.index))}</span>
              <button type="button" class="phase-pill phase-${row.phase.key}" data-open-phase-pop="1" data-tooltip="${phaseTip}">${escapeHtml(localizePhase(row.phase))}${PHASE_CUE_SVG}</button>
            </td>
            <td class="col-skip ${isSel ? 'is-cell-selected' : ''}" data-cell-idx="${row.index}">${skipCellHtml}</td>
            <td class="col-save num mono">${costText}</td>
          </tr>`;
      })
      .join('');

    const filledMonths = res.monthlyRows.filter((r) => r.items.length > 0).length;
    document.getElementById('db-months-tfoot').innerHTML = `
      <tr>
        <td class="mono" style="font-weight:600;">${escapeHtml(t('step2.footTitle'))}</td>
        <td>${t('step2.footSkip', { totalA: fmtYen(res.totalSkipCost), filled: filledMonths })}</td>
        <td class="num mono" style="font-weight:600;">${fmtYen(res.totalSkipCost)}</td>
      </tr>`;

    // --- STEP 3: Plan B (With Black Friday Pro Locked Every Month + Drag Multi-Select) ---
    const indicesB = getSelectedIndicesB();
    document.getElementById('db-b-selection-bar').style.display = indicesB.length > 0 ? 'flex' : 'none';
    document.getElementById('editor-b-selected-title').textContent =
      indicesB.length === 12 ? t('step2.selectedAll') : t('step2.selectedN', { n: indicesB.length });

    const chkAllB = document.getElementById('chk-b-select-all');
    chkAllB.checked = indicesB.length === 12;
    chkAllB.indeterminate = indicesB.length > 0 && indicesB.length < 12;

    const lockedPillHtml = `<span class="locked-bf-pill" title="${escapeHtml(t('step2b.lockedBfTip'))}">${LOCK_SVG}<span>${escapeHtml(t('step2b.lockedBfPill'))}</span></span>`;

    document.getElementById('db-b-months-tbody').innerHTML = res.monthlyRows
      .map((row) => {
        const isSelB = selectedMonthsB.has(row.index);
        const buyQtyById = new Map();
        row.buyItems.forEach((it) => {
          buyQtyById.set(it.id, (buyQtyById.get(it.id) || 0) + Math.max(1, Number(it.qty) || 1));
        });
        const refAHtml = row.items.length > 0
          ? `<div class="ref-pills-wrap">${row.items.map((it) => {
              const dropped = (buyQtyById.get(it.id) || 0) === 0;
              return `<span class="ref-mini-pill tag-${it.tone || 'gray'} ${dropped ? 'is-dropped' : ''}">${escapeHtml(formatItemPillLabel(it))}</span>`;
            }).join('')}</div>`
          : '<span class="ref-empty-dash">—</span>';

        const buyCellHtml = `
          <div class="cell-skip-inner">
            <input type="checkbox" class="cell-chk" data-chk-b-month="${row.index}" ${isSelB ? 'checked' : ''} aria-label="${escapeHtml(getMonthLabel(row.index))}" />
            <div class="cell-pills-wrap">
              ${lockedPillHtml}
              <span class="bf-row-plus" aria-hidden="true">+</span>
              ${renderPillStack('B', row.index, row.buyItems, row.buySynced, row.items)}
            </div>
          </div>`;

        let diffBadge;
        if (row.monthSavedByBf > 0.5) {
          diffBadge = `<span class="mono save-val-active">${escapeHtml(t('step2.saveMonth', { yen: fmtYen(row.monthSavedByBf) }))}</span>`;
        } else if (row.monthSavedByBf < -0.5) {
          diffBadge = `<span class="mono save-val-neg">${escapeHtml(t('step2.extraSpend', { yen: fmtYen(Math.abs(row.monthSavedByBf)) }))}</span>`;
        } else {
          diffBadge = `<span class="mono save-val-idle">${escapeHtml(t('step2.sameZero'))}</span>`;
        }

        const extraPart = row.buyMonthFlow > 0
          ? `<span class="bf-diff-extra mono">${fmtYen(row.buyMonthFlow)} ·</span>`
          : '';

        return `
          <tr class="db-row" data-row-b-idx="${row.index}">
            <td class="col-month">
              <span class="db-month-main">${escapeHtml(getMonthLabel(row.index))}</span>
              <button type="button" class="phase-pill phase-${row.phase.key}" data-open-phase-pop="1" data-tooltip="${phaseTip}">${escapeHtml(localizePhase(row.phase))}${PHASE_CUE_SVG}</button>
            </td>
            <td class="col-ref-a">${refAHtml}</td>
            <td class="col-skip ${isSelB ? 'is-cell-selected' : ''}" data-b-cell-idx="${row.index}">${buyCellHtml}</td>
            <td class="col-save num mono"><span class="bf-diff-stack">${extraPart}${diffBadge}</span></td>
          </tr>`;
      })
      .join('');

    const extraB = Math.max(0, res.totalBuyCost - res.bfCost);
    const netDiff = res.totalSkipCost - res.totalBuyCost;
    const footDiffHtml = netDiff >= 0
      ? `<span class="mono save-val-active">${escapeHtml(t('step2.footDiffSave', { yen: fmtYen(netDiff) }))}</span>`
      : `<span class="mono save-val-neg">${escapeHtml(t('step2.footDiffLoss', { yen: fmtYen(Math.abs(netDiff)) }))}</span>`;

    document.getElementById('db-b-months-tfoot').innerHTML = `
      <tr>
        <td class="mono" style="font-weight:600;">${escapeHtml(t('step2b.footLabel'))}</td>
        <td class="mono" style="color:var(--ink-2);">${fmtYen(res.totalSkipCost)}</td>
        <td>${t('step2b.footPlanA', { totalA: fmtYen(res.totalSkipCost), totalB: fmtYen(res.totalBuyCost), bf: fmtYen(res.bfCost), extraB: fmtYen(extraB) })}</td>
        <td class="num">${footDiffHtml}</td>
      </tr>`;

    renderNotionPicker();
  }

  function formatSpanParts(res, lang) {
    const isEn = lang === 'en-US';
    return (isEn
      ? [
          res.sotaActiveMonths > 0 ? `${res.sotaActiveMonths}m SOTA` : null,
          res.postSotaUsedMonths > 0 ? `${res.postSotaUsedMonths}m extra` : null,
          res.nextGenActiveMonths > 0 ? `${res.nextGenActiveMonths}m Next SOTA` : null,
        ]
      : [
          res.sotaActiveMonths > 0 ? `本次 SOTA ${res.sotaActiveMonths} 月` : null,
          res.postSotaUsedMonths > 0 ? `后续 ${res.postSotaUsedMonths} 月` : null,
          res.nextGenActiveMonths > 0 ? `下代 SOTA ${res.nextGenActiveMonths} 月` : null,
        ]).filter(Boolean).join(' + ');
  }

  // Compute row-by-row cash flows for either a fixed cutoff (number) or a 12-month active mask (boolean[])
  function buildScenarioViewRows(baseRows, bfCost, cutoffOrMask) {
    const isMask = Array.isArray(cutoffOrMask);
    const limit = isMask ? null : Math.min(12, Math.max(0, Math.round(cutoffOrMask)));
    let cumBuy = bfCost;
    let cumSkip = 0;
    let crossoverMonthIndex = null;
    let totalSaved = 0;
    let activeSavedMonths = 0;
    const rows = baseRows.map((r, i) => {
      const reverted = isMask ? !cutoffOrMask[i] : i >= limit;
      const buyMonthFlow = reverted ? r.skipMonthFlow : r.buyMonthFlow;
      const monthSavedByBf = r.skipMonthFlow - buyMonthFlow;
      cumBuy += buyMonthFlow;
      cumSkip += r.skipMonthFlow;
      if (monthSavedByBf > 0.01) {
        totalSaved += monthSavedByBf;
        activeSavedMonths += 1;
      }
      if (crossoverMonthIndex === null && cumSkip >= cumBuy - 0.01 && cumSkip > 0) {
        crossoverMonthIndex = i;
      }
      return Object.assign({}, r, {
        reverted,
        buyMonthFlow,
        monthSavedByBf,
        cumBuy,
        cumSkip,
      });
    });
    const avgProPrice = activeSavedMonths > 0 ? totalSaved / activeSavedMonths : 0;
    const equivalentUsageMonths = avgProPrice > 0 ? bfCost / avgProPrice : Infinity;
    return {
      cutoff: limit,
      rows,
      crossoverMonthIndex,
      activeSavedMonths,
      avgProPrice,
      equivalentUsageMonths,
    };
  }

  // Cumulative Chart with Day 0 ("今日" / "Now") upfront anchor
  function renderChart(res, scenarioOverlay) {
    const container = document.getElementById('chart-container');
    const rows = scenarioOverlay ? scenarioOverlay.rows : res.monthlyRows;
    const crossoverIdx = scenarioOverlay ? scenarioOverlay.crossoverMonthIndex : res.crossoverMonthIndex;

    const width = 760;
    const height = 228;
    const padL = 62;
    const padR = 24;
    const padT = 24;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const cur = getDisplayCurrency();
    const sym = cur === 'USD' ? '$' : '¥';
    const maxYDisp = Math.max(
      cur === 'USD' ? 100 : 600,
      convertDisplay(res.bfCost),
      ...rows.map((r) => Math.max(convertDisplay(r.cumBuy), convertDisplay(r.cumSkip)))
    );
    const stepUnit = cur === 'USD' ? 100 : 500;
    const niceMaxYDisp = Math.ceil(maxYDisp / stepUnit) * stepUnit;

    // 13 x-positions: 0 = Today (Now), 1..12 = months 0..11
    const xAt = (idx) => padL + (idx / rows.length) * plotW;
    const yAtDisp = (dispVal) => padT + plotH - (dispVal / niceMaxYDisp) * plotH;
    const yAt = (cnyVal) => yAtDisp(convertDisplay(cnyVal));

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
      const val = (niceMaxYDisp / 4) * s;
      const y = yAtDisp(val).toFixed(1);
      gridLines.push(`
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
        <text x="${padL - 10}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="11" font-family="JetBrains Mono, monospace">${sym}${Math.round(val)}</text>
      `);
    }

    let crossoverSvg = '';
    if (crossoverIdx !== null) {
      const cx = xAt(crossoverIdx + 1);
      const cy = yAt(rows[crossoverIdx].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#1c3829" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.2" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 96, cx + 8).toFixed(1)}" y="${Math.max(padT + 20, cy - 8).toFixed(1)}" fill="#1c3829" font-size="11.5" font-weight="600">${escapeHtml(t('step4.chartBreakeven', { m: getMonthShort(crossoverIdx) }))}</text>
      `;
    }

    let cutoffMarkerSvg = '';
    if (scenarioOverlay && scenarioOverlay.cutoff > 0 && scenarioOverlay.cutoff < 12) {
      const k = scenarioOverlay.cutoff;
      const kx = xAt(k);
      cutoffMarkerSvg = `
        <line x1="${kx.toFixed(1)}" y1="${padT}" x2="${kx.toFixed(1)}" y2="${padT + plotH}" stroke="#b45309" stroke-dasharray="3 3" stroke-width="1.2"/>
        <text x="${Math.min(width - 130, Math.max(padL + 6, kx + 6)).toFixed(1)}" y="${(padT + plotH - 8).toFixed(1)}" fill="#92400e" font-size="11" font-weight="600">${escapeHtml(t('step4.scenChartCutoff', { k }))}</text>
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
        <text x="${Math.min(width - 175, Math.max(padL + 6, nx - 62)).toFixed(1)}" y="${(padT + 12).toFixed(1)}" fill="#1c3829" font-size="11" font-weight="600">${escapeHtml(t('step4.chartNextGen', { m: getMonthShort(nextGenIdx) }))}</text>
      `;
    }

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12-month cumulative comparison">
        ${gridLines.join('')}
        ${nextGenMarkerSvg}
        ${cutoffMarkerSvg}
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

  // Collapsible 3x3 Sensitivity Matrix (active months +-2 x primary FX +-5pp)
  function renderSensitivityMatrix(res) {
    const container = document.getElementById('sensitivity-container');
    const sens = res.sensitivity;
    if (!sens || !sens.primaryCurrency || !sens.rows || sens.rows.length === 0) {
      container.innerHTML = `<p class="muted-note" style="margin:0;">${escapeHtml(t('step4.sensNoFx'))}</p>`;
      return;
    }
    const corner = t('step4.sensCorner', { cur: sens.primaryCurrency });
    const theadCols = sens.monthCols.map((mVal) => `<th class="mono">${escapeHtml(t('modal.monthsVal', { n: mVal }))}</th>`).join('');
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
      <p class="sens-note">${escapeHtml(t('step4.sensNoteCur', { cur: getDisplayCurrency() }))}</p>`;
  }

  function render() {
    saveState();
    updateHistoryButtons();
    const lang = getLang();
    applyDomTranslations();
    document.querySelectorAll('[data-lang-opt]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.langOpt === lang);
    });
    const res = calculateLedger(state, lang, getDisplayCurrency());

    document.querySelectorAll('.step').forEach((sec) => {
      sec.classList.toggle('is-active', Number(sec.dataset.step) === currentStep);
    });
    renderStepTabs();

    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const mobPrev = document.getElementById('btn-mobile-prev');
    const mobNext = document.getElementById('btn-mobile-next');
    const isStep1Picked = Boolean(state.bfPicked);
    // Hide left-edge Back on Step 1 and final Decision Memo; show right-edge Next ONLY on table steps (2 & 3)
    const hidePrev = currentStep === 0 || currentStep === STEPS.length - 1;
    const hideNext = currentStep === 0 || currentStep >= 3;
    prevBtn.classList.toggle('is-hidden', hidePrev);
    nextBtn.classList.toggle('is-hidden', hideNext);
    nextBtn.classList.toggle('is-emphasized', false);
    document.getElementById('side-next-tip').textContent = t('nav.next');
    mobPrev.style.visibility = hidePrev ? 'hidden' : 'visible';
    mobNext.style.visibility = hideNext ? 'hidden' : 'visible';
    document.getElementById('export-group').style.display =
      currentStep === 4 && !isCalculatingFinal ? 'flex' : 'none';

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

    // STEP 5: FX Valuation Basis summary + dynamic FX panel inside results page
    const fxBasisSummary = document.getElementById('fx-basis-summary');
    if (res.activeFxCurrencies && res.activeFxCurrencies.length > 0) {
      const fxListStr = res.activeFxCurrencies
        .map((c) => `${c.currency} ${c.annualPct > 0 ? '+' : ''}${Math.round(c.annualPct)}%/yr`)
        .join(' · ');
      fxBasisSummary.textContent = t('step4.toggleFxBasisActive', { fx: fxListStr });
    } else {
      fxBasisSummary.textContent = t('step4.toggleFxBasis');
    }
    // Show Turkey 3-year FX history toggle ONLY if the user's deal or plans actually involve TRY
    const involvesTry =
      state.bfPreset === 'tr_ios' ||
      state.bfCurrency === 'TRY' ||
      (res.activeFxCurrencies || []).some((c) => c.currency === 'TRY');
    document.getElementById('try-fx-history-toggle').style.display = involvesTry ? 'block' : 'none';

    renderDynamicFxPanel(res);

    // Step 4: Model Lifecycle & Post-SOTA Continuation Months
    const sotaUntilText = formatFutureMonth(2026, 11, state.effectiveSotaMonths);
    const nextWhenText = formatFutureMonth(2026, 11, state.nextFlagshipInterval);
    const willingUntilText = formatFutureMonth(2026, 11, res.willingEndMonth);
    const fmtNodeMonth = (txt) => (lang === 'en-US' ? txt : txt.slice(2));

    const extraSlider = document.getElementById('inp-post-sota-extra');
    extraSlider.max = String(res.maxPostSotaExtra);
    extraSlider.value = String(res.postSotaExtraMonths);
    extraSlider.disabled = res.maxPostSotaExtra === 0;

    document.getElementById('lbl-sota-len').textContent = t('modal.monthsVal', { n: state.effectiveSotaMonths });
    document.getElementById('lbl-next-interval').textContent = t('modal.monthsVal', { n: state.nextFlagshipInterval });
    document.getElementById('lbl-post-sota-extra').textContent =
      res.maxPostSotaExtra === 0
        ? t('modal.extraMonthsFull')
        : t('modal.extraMonthsVal', { n: res.postSotaExtraMonths });
    document.getElementById('help-sota-until').textContent =
      t('modal.sotaHelp', { n: state.effectiveSotaMonths, until: sotaUntilText });
    document.getElementById('help-next-when').textContent =
      t('modal.nextHelp', { n: state.nextFlagshipInterval, when: nextWhenText });

    const nextRangeText = res.nextGenStartMonth >= 12 ? '12' : `${res.nextGenStartMonth}–12`;
    let extraHelpTxt;
    if (res.expectedActiveMonths >= 12 && res.nextGenInTerm && res.willingEndMonth < 12) {
      extraHelpTxt = t('modal.retainHelpFullNext', { nextStart: res.nextGenStartMonth });
    } else if (res.willingEndMonth >= 12) {
      extraHelpTxt = t('modal.retainHelpFull', { k: res.sotaCutoff, extra: res.postSotaExtraMonths });
    } else if (res.postSotaExtraMonths === 0) {
      extraHelpTxt = t('modal.retainHelpZero', { k: res.sotaCutoff, until: sotaUntilText });
      if (res.nextGenInTerm && res.nextGenActiveMonths > 0) {
        extraHelpTxt = extraHelpTxt.replace(/[。.]$/, '') + t('modal.retainHelpNextSuffix', {
          nextStart: res.nextGenStartMonth,
          nextRange: nextRangeText,
          nextM: res.nextGenActiveMonths,
          total: res.expectedActiveMonths,
        });
      }
    } else {
      extraHelpTxt = t('modal.retainHelpDyn', {
        k: res.sotaCutoff,
        until: sotaUntilText,
        extra: res.postSotaExtraMonths,
        total: res.willingEndMonth,
        totalUntil: willingUntilText,
      });
      if (res.nextGenInTerm && res.nextGenActiveMonths > 0) {
        extraHelpTxt = extraHelpTxt.replace(/[。.]$/, '') + t('modal.retainHelpNextSuffix', {
          nextStart: res.nextGenStartMonth,
          nextRange: nextRangeText,
          nextM: res.nextGenActiveMonths,
          total: res.expectedActiveMonths,
        });
      }
    }
    document.getElementById('help-post-sota-extra').textContent = extraHelpTxt;

    // Single Unified 12-Month Axis:
    // [0..SOTA] black -> [SOTA..willing] blue -> (gap gray) -> [nextSOTA..12] green (if inside 12-mo term)
    const nextStartPct = res.nextGenInTerm ? ((res.nextGenStartMonth - 1) / 12) * 100 : 100;
    const sotaPct = (res.sotaCutoff / 12) * 100;
    const blackEndPct = res.nextGenInTerm ? Math.min(sotaPct, nextStartPct) : sotaPct;
    const willingPct = (res.willingEndMonth / 12) * 100;
    const blueEndPct = res.nextGenInTerm ? Math.min(willingPct, nextStartPct) : willingPct;

    document.getElementById('lc-active-seg').style.width = `${Math.max(0, blackEndPct).toFixed(4)}%`;
    const extraSegEl = document.getElementById('lc-extra-seg');
    extraSegEl.style.left = `${blackEndPct.toFixed(4)}%`;
    extraSegEl.style.width = `${Math.max(0, blueEndPct - blackEndPct).toFixed(4)}%`;

    const nextSegEl = document.getElementById('lc-next-seg');
    if (res.nextGenInTerm) {
      nextSegEl.style.left = `${nextStartPct.toFixed(4)}%`;
      nextSegEl.style.width = `${Math.max(0, 100 - nextStartPct).toFixed(4)}%`;
    } else {
      nextSegEl.style.left = '100%';
      nextSegEl.style.width = '0%';
    }

    const sotaNodeEl = document.getElementById('lc-sota-node');
    const extraNodeEl = document.getElementById('lc-extra-node');
    const nextNodeEl = document.getElementById('lc-next-node');

    sotaNodeEl.style.left = `${sotaPct.toFixed(4)}%`;
    sotaNodeEl.classList.toggle('lc-node-end-align', sotaPct >= 95);
    document.getElementById('lc-sota-month').textContent = fmtNodeMonth(sotaUntilText);

    const showExtraNode = res.postSotaUsedMonths > 0 && (!res.nextGenInTerm || blueEndPct < nextStartPct - 0.01);
    extraNodeEl.style.display = showExtraNode ? 'flex' : 'none';
    if (showExtraNode) {
      const extraDotPct = blueEndPct;
      const extraDotMonth = formatFutureMonth(2026, 11, res.sotaActiveMonths + res.postSotaUsedMonths);
      extraNodeEl.style.left = `${extraDotPct.toFixed(4)}%`;
      extraNodeEl.classList.toggle('lc-node-end-align', extraDotPct >= 95);
      document.getElementById('lc-extra-month').textContent = fmtNodeMonth(extraDotMonth);
    }

    nextNodeEl.style.left = `${nextStartPct.toFixed(4)}%`;
    nextNodeEl.classList.toggle('lc-node-end-align', nextStartPct >= 95);
    document.getElementById('lc-next-month').textContent = fmtNodeMonth(nextWhenText);
    document.getElementById('lc-next-label').textContent = res.nextGenInTerm
      ? t('modal.nodeNextShort')
      : t('modal.nodeNextOutShort');

    // Anti-collision staggering so month labels above & role labels below never overlap
    const extraNearSota = showExtraNode && Math.abs(blueEndPct - sotaPct) < 13;
    extraNodeEl.classList.toggle('is-staggered', extraNearSota);
    const nextNearSota = Math.abs(nextStartPct - sotaPct) < 13;
    const nextNearExtra = showExtraNode && Math.abs(nextStartPct - blueEndPct) < 13;
    nextNodeEl.classList.toggle('is-staggered', (nextNearSota || nextNearExtra) && !(nextNearExtra && extraNearSota));

    // STEP 5: Institutional Financial Decision Memo (supports switching between Standard Outlook & any of the 4 scenarios)
    const dispCur = getDisplayCurrency();
    const dispSym = dispCur === 'USD' ? '$' : '¥';
    const activeSc = activeScenarioId
      ? (res.scenarios.find((sc) => sc.id === activeScenarioId) || null)
      : null;
    const scenOverlay = activeSc
      ? buildScenarioViewRows(res.monthlyRows, res.bfCost, activeSc.cutoff)
      : (res.expectedActiveMonths < 12
          ? buildScenarioViewRows(res.monthlyRows, res.bfCost, res.expectedActiveMask)
          : null);
    const spanPartsText = formatSpanParts(res, lang);

    document.querySelectorAll('[data-disp-cur]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.dispCur === dispCur);
    });
    document.getElementById('scen-unit-note').textContent = t('step4.scenNoteCur', { cur: dispCur });
    document.getElementById('th-scen-buy').textContent = t('step4.scenColBuyCur', { cur: dispCur });
    document.getElementById('th-scen-skip').textContent = t('step4.scenColSkipCur', { cur: dispCur });
    document.getElementById('th-scen-diff').textContent = t('step4.scenColDiffCur', { cur: dispCur });
    document.getElementById('scen-footnote').textContent = t('step4.scenFootnoteCur', {
      cur: dispCur,
      ev: fmtYen(res.expectedNetSavings, true),
      parts: spanPartsText,
      m: res.expectedActiveMonths,
    });

    const badge = document.getElementById('verdict-badge');
    const evHeroEl = document.getElementById('memo-ev-hero');
    const probEl = document.getElementById('memo-cond-prob');
    const probSubEl = document.getElementById('memo-cond-prob-sub');
    const crossEl = document.getElementById('memo-cond-crossover');
    const crossSubEl = document.getElementById('memo-cond-crossover-sub');

    const heroAmountCny = activeSc ? activeSc.diff : res.expectedNetSavings;
    const heroRounded = Math.round(convertDisplay(heroAmountCny));
    if (heroRounded > 0) {
      evHeroEl.innerHTML = `<span class="ev-sign-pos">+</span>${dispSym}${Math.abs(heroRounded).toLocaleString('en-US')}`;
    } else if (heroRounded < 0) {
      evHeroEl.innerHTML = `<span class="ev-sign-neg">-</span>${dispSym}${Math.abs(heroRounded).toLocaleString('en-US')}`;
    } else {
      evHeroEl.textContent = `${dispSym}0`;
    }

    if (activeSc && scenOverlay) {
      const scTone = activeSc.diff >= 40 ? 'green' : activeSc.diff <= -40 ? 'red' : 'amber';
      const scBadge = activeSc.diff >= 40
        ? t('step4.scenBadgeBuy')
        : activeSc.diff <= -40
          ? t('step4.scenBadgeLoss')
          : t('step4.scenBadgeEven');
      badge.className = `tag tag-${scTone}`;
      badge.textContent = scBadge;
      document.getElementById('verdict-headline').textContent = t('step4.scenHeadline', { title: activeSc.title });
      document.getElementById('verdict-detail').textContent = t('step4.scenDetail', {
        buy: fmtYen(activeSc.buyTotal),
        skip: fmtYen(activeSc.skipTotal),
        diff: fmtYen(activeSc.diff, true),
      });
      document.getElementById('memo-ev-label').textContent = t('step4.scenHeroLabel', { k: activeSc.cutoff, cur: dispCur });
      const scRatePct = res.bfCost > 0 ? (activeSc.diff / res.bfCost) * 100 : 0;
      const scRateStr = `${scRatePct >= 0 ? '+' : ''}${scRatePct.toFixed(1)}%`;
      document.getElementById('memo-ev-rate').textContent = res.bfCost > 0
        ? t('step4.scenRateText', { rate: scRateStr, bf: fmtYen(res.bfCost) })
        : '';

      probEl.textContent = t('step4.scenCondMode');
      probSubEl.textContent = t('step4.scenCondSub', { k: activeSc.cutoff });

      crossEl.textContent = scenOverlay.crossoverMonthIndex !== null
        ? getMonthLabel(scenOverlay.crossoverMonthIndex)
        : t('step4.condCrossNone');
      crossSubEl.textContent = Number.isFinite(scenOverlay.equivalentUsageMonths) && scenOverlay.activeSavedMonths > 0
        ? t('step4.condCrossSub', { n: scenOverlay.equivalentUsageMonths.toFixed(1), avg: fmtYen(scenOverlay.avgProPrice) })
        : t('step4.condCrossSubInf');
    } else {
      document.getElementById('memo-ev-label').textContent =
        res.expectedActiveMonths >= 12
          ? t('step4.heroEvLabelFull', { cur: dispCur })
          : t('step4.heroEvLabelCur', { m: res.expectedActiveMonths, cur: dispCur });
      badge.className = `tag tag-${res.verdict.tone}`;
      badge.textContent = res.verdict.badge;
      document.getElementById('verdict-headline').textContent = res.verdict.headline;
      document.getElementById('verdict-detail').textContent = res.verdict.detail;

      const rateStr = `${res.evReturnPct >= 0 ? '+' : ''}${res.evReturnPct.toFixed(1)}%`;
      document.getElementById('memo-ev-rate').textContent = res.bfCost > 0
        ? t('step4.evRateFormula', {
            parts: spanPartsText,
            m: res.expectedActiveMonths,
            rate: rateStr,
          })
        : '';

      // Condition 1: Expected Active Months vs Payback Month
      probEl.textContent = t('step4.condProbVal', { m: res.expectedActiveMonths });
      if (res.breakEvenStatus === 'already_even') {
        probSubEl.textContent = t('step4.condProbLocked', {
          k: res.sotaCutoff,
          line: res.breakEvenMonthNum != null ? res.breakEvenMonthNum : 1,
        });
      } else if (res.breakEvenStatus === 'impossible') {
        probSubEl.textContent = t('step4.condProbImpossible');
      } else if (res.monthMargin > 0) {
        probSubEl.textContent = t('step4.condProbAbove', {
          parts: spanPartsText,
          gap: res.monthMargin,
        });
      } else if (res.monthMargin === 0) {
        probSubEl.textContent = t('step4.condProbExact', {
          parts: spanPartsText,
          line: res.breakEvenMonthNum,
        });
      } else {
        probSubEl.textContent = t('step4.condProbBelow', {
          parts: spanPartsText,
          gap: Math.abs(res.monthMargin || 0),
        });
      }

      // Condition 2: True Cumulative Calendar Payback + Equivalent Usage Subtext
      const effCrossIdx = scenOverlay ? scenOverlay.crossoverMonthIndex : res.crossoverMonthIndex;
      const effEquiv = scenOverlay ? scenOverlay.equivalentUsageMonths : res.equivalentUsageMonths;
      const effAvg = scenOverlay ? scenOverlay.avgProPrice : res.avgProPrice;
      const effActiveSaved = scenOverlay ? scenOverlay.activeSavedMonths : res.proCoveredMonths;
      crossEl.textContent = effCrossIdx !== null
        ? getMonthLabel(effCrossIdx)
        : t('step4.condCrossNone');
      crossSubEl.textContent = Number.isFinite(effEquiv) && effActiveSaved > 0
        ? t('step4.condCrossSub', { n: effEquiv.toFixed(1), avg: fmtYen(effAvg) })
        : t('step4.condCrossSubInf');
    }

    // Hairline Upfront & Idle Strip
    const idleStripPart = res.totalIdleMonths > 0
      ? t('step4.stripIdle', { n: res.totalIdleMonths, cost: fmtYen(res.totalIdleCostCny) })
      : t('step4.stripIdleZero');
    document.getElementById('memo-strip').innerHTML = `
      <span>${escapeHtml(t('step4.stripUpfront', { bf: fmtYen(res.bfCost) }))}</span>
      <span class="memo-strip-sep">·</span>
      <span>${escapeHtml(t('step4.stripMonthly', { avg: fmtMoneyDec(res.bfMonthlyAvg, 1) }))}</span>
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

    // Cumulative Chart, Tiered Scenario Table (Standard EV Row + 4 Compact What-If Rows), 3x3 Sensitivity Matrix
    renderChart(res, scenOverlay);

    const expectedBuyCost = res.expectedBuyCost;
    const evRoundedNum = Math.round(res.expectedNetSavings);
    const evPillCls = evRoundedNum > 0 ? 'is-pos' : evRoundedNum < 0 ? 'is-neg' : 'is-zero';
    const isStdActive = !activeSc;
    const stdSubTxt = res.expectedActiveMonths >= 12
      ? t('step4.scenStdSubFull', { parts: spanPartsText })
      : res.nextGenInTerm && res.gapInactiveMonths > 0
        ? t('step4.scenStdSub', { parts: spanPartsText, gap: res.gapInactiveMonths })
        : t('step4.scenStdSubNoGap', { parts: spanPartsText });
    const stdRowHtml = `
      <tr class="fin-row-selectable fin-row-standard ${isStdActive ? 'fin-row-active' : ''}" data-scenario-id="__ev__" role="button" tabindex="0" aria-pressed="${isStdActive ? 'true' : 'false'}">
        <td>
          <div class="scen-cell-wrap">
            <span class="scen-radio-dot" aria-hidden="true"></span>
            <div>
              <div class="fin-scen-title">${escapeHtml(t('step4.scenStdTitle', { m: res.expectedActiveMonths }))}</div>
              <div class="fin-scen-sub">${escapeHtml(stdSubTxt)}</div>
            </div>
          </div>
        </td>
        <td class="num mono" style="font-weight:600;">${fmtNum(expectedBuyCost)}</td>
        <td class="num mono" style="font-weight:600;">${fmtNum(res.totalSkipCost)}</td>
        <td class="num mono"><span class="fin-diff-pill ${evPillCls}">${escapeHtml(fmtNum(res.expectedNetSavings, true))}</span></td>
      </tr>
      <tr class="fin-row-divider">
        <td colspan="4">${escapeHtml(t('step4.scenSubDivider'))}</td>
      </tr>`;

    const whatIfRowsHtml = res.scenarios
      .map((sc) => {
        const rounded = Math.round(sc.diff);
        const pillCls = rounded > 0 ? 'is-pos' : rounded < 0 ? 'is-neg' : 'is-zero';
        const isActive = activeSc && activeSc.id === sc.id;
        const rowCls = [
          'fin-row-selectable',
          'fin-row-secondary',
          isActive ? 'fin-row-active' : '',
        ].filter(Boolean).join(' ');
        return `
          <tr class="${rowCls}" data-scenario-id="${escapeHtml(sc.id)}" role="button" tabindex="0" aria-pressed="${isActive ? 'true' : 'false'}">
            <td>
              <div class="scen-cell-wrap scen-cell-inline">
                <span class="scen-radio-dot" aria-hidden="true"></span>
                <span class="fin-scen-title">${escapeHtml(sc.title)}</span>
                <span class="fin-scen-inline-meta">${escapeHtml(sc.periodNote || '')}</span>
              </div>
            </td>
            <td class="num mono">${fmtNum(sc.buyTotal)}</td>
            <td class="num mono">${fmtNum(sc.skipTotal)}</td>
            <td class="num mono"><span class="fin-diff-pill ${pillCls}">${escapeHtml(fmtNum(sc.diff, true))}</span></td>
          </tr>`;
      })
      .join('');

    document.getElementById('scenarios-tbody').innerHTML = stdRowHtml + whatIfRowsHtml;

    const displayRows = scenOverlay ? scenOverlay.rows : res.monthlyRows;
    document.getElementById('compare-12m-tbody').innerHTML = displayRows
      .map((r) => {
        const planAHtml = r.items.length
          ? r.items.map((it) => `<span class="ref-mini-pill tag-${it.tone || 'gray'}" style="opacity:0.9;">${escapeHtml(formatItemPillLabel(it))}</span>`).join(' ')
          : '<span class="ref-empty-dash">—</span>';
        let planBHtml;
        if (r.reverted) {
          planBHtml = `<span class="ref-mini-pill tag-amber" style="opacity:0.9;">${escapeHtml(t('step4.scenDroppedTag'))}</span>`;
        } else {
          const bfShort = lang === 'en-US' ? 'BF Pro' : '黑五 Pro';
          const extraHtml = r.buyItems && r.buyItems.length
            ? r.buyItems.map((it) => `<span class="ref-mini-pill tag-${it.tone || 'gray'}" style="opacity:0.9;">${escapeHtml(formatItemPillLabel(it))}</span>`).join(' ')
            : '';
          planBHtml = `<span class="ref-mini-pill tag-gemini" style="opacity:0.95;font-weight:600;">${escapeHtml(bfShort)}</span>${extraHtml ? ` <span class="bf-row-plus">+</span> ${extraHtml}` : ''}`;
        }
        const diffVal = Math.round(r.monthSavedByBf);
        const diffCls = diffVal > 0 ? 'is-pos' : diffVal < 0 ? 'is-neg' : '';
        const cumNet = Math.round(r.cumSkip - r.cumBuy);
        const cumCls = cumNet > 0 ? 'is-pos' : cumNet < 0 ? 'is-neg' : '';
        return `
          <tr>
            <td style="white-space:nowrap;">${escapeHtml(getMonthLabel(r.index))}</td>
            <td><div class="ref-pills-wrap">${planAHtml}</div></td>
            <td><div class="ref-pills-wrap">${planBHtml}</div></td>
            <td class="num mono ${diffCls}" style="font-weight:${diffVal !== 0 ? '600' : '400'};">${escapeHtml(fmtYen(r.monthSavedByBf, true))}</td>
            <td class="num mono ${cumCls}">${escapeHtml(fmtYen(cumNet, true))}</td>
          </tr>`;
      })
      .join('');

    renderSensitivityMatrix(res);
  }

  function updateCustomBfCost() {
    recordUndoSnapshot('custom-bf');
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
      if (!btn || btn.disabled) return;
      const idx = Number(btn.dataset.goStep);
      if (!isStepUnlocked(idx)) return;
      goToStep(idx);
    });

    document.querySelectorAll('.substep-crumb').forEach((nav) => {
      nav.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-go-step]');
        if (!btn) return;
        const idx = Number(btn.dataset.goStep);
        if (!isStepUnlocked(idx)) return;
        goToStep(idx);
      });
    });

    document.getElementById('btn-step4-calc').addEventListener('click', () => {
      goToStep(4);
    });

    document.getElementById('btn-undo').addEventListener('click', performUndo);
    document.getElementById('btn-redo').addEventListener('click', performRedo);

    document.getElementById('btn-lang-toggle').addEventListener('click', () => {
      const next = getLang() === 'zh-CN' ? 'en-US' : 'zh-CN';
      setLang(next);
      displayCurrency = next === 'en-US' ? 'USD' : 'CNY';
      renderStaticTables();
      render();
      showToast(t('toast.langSwitched'));
    });

    document.getElementById('memo-currency-switch').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-disp-cur]');
      if (!btn) return;
      displayCurrency = btn.dataset.dispCur === 'USD' ? 'USD' : 'CNY';
      render();
    });

    const scenTbody = document.getElementById('scenarios-tbody');
    function selectScenarioRow(id) {
      if (id === '__ev__') {
        activeScenarioId = null;
      } else {
        activeScenarioId = activeScenarioId === id ? null : id;
      }
      render();
    }
    scenTbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-scenario-id]');
      if (!tr) return;
      selectScenarioRow(tr.dataset.scenarioId);
    });
    scenTbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr[data-scenario-id]');
      if (!tr) return;
      e.preventDefault();
      selectScenarioRow(tr.dataset.scenarioId);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      recordUndoSnapshot();
      state = createInitialUiState();
      activeScenarioId = null;
      selectedMonths = new Set();
      selectedMonthsB = new Set();
      pickerState = null;
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
      recordUndoSnapshot();
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

    // Step 2 & Step 3: Tune Lifecycle shortcuts + Plan B toolbar actions
    document.getElementById('btn-th-phase').addEventListener('click', jumpToLifecycleSection);
    document.getElementById('btn-th-b-phase').addEventListener('click', jumpToLifecycleSection);

    document.getElementById('btn-sync-all-b').addEventListener('click', () => {
      recordUndoSnapshot();
      ensureBuyArrays();
      state.buyMonthSynced = Array(12).fill(true);
      pickerState = null;
      render();
      showToast(t('step2b.syncedAll'));
    });

    // Step 2 (Plan A) Selection Bar & Templates
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

    // Step 3 (Plan B) Selection Bar
    document.getElementById('btn-unselect-b-all').addEventListener('click', () => {
      selectedMonthsB = new Set();
      pickerState = null;
      render();
    });

    document.getElementById('chk-b-select-all').addEventListener('change', (e) => {
      selectedMonthsB = e.target.checked
        ? new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        : new Set();
      render();
    });

    document.getElementById('btn-open-b-batch-picker').addEventListener('click', (e) => {
      e.stopPropagation();
      const indices = getSelectedIndicesB();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      pickerState = {
        column: 'B',
        targetIndices: indices,
        focusedItemId: null,
        anchorRect: e.currentTarget.getBoundingClientRect(),
        showCustom: false,
      };
      renderNotionPicker();
    });

    document.getElementById('btn-clear-b-selected').addEventListener('click', () => {
      const indices = getSelectedIndicesB();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      pickerState = null;
      mutateColumnMonths('B', indices, (arr) => {
        arr.length = 0;
      });
      showToast(t('step2b.clearedN', { n: indices.length }));
    });

    document.getElementById('btn-sync-b-selected').addEventListener('click', () => {
      const indices = getSelectedIndicesB();
      if (indices.length === 0) {
        showToast(t('toast.selectMonthFirst'));
        return;
      }
      recordUndoSnapshot();
      ensureBuyArrays();
      indices.forEach((mIdx) => {
        state.buyMonthSynced[mIdx] = true;
      });
      pickerState = null;
      render();
      showToast(t('step2b.syncedN', { n: indices.length }));
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
        targetIndices: indices,
        focusedItemId: null,
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

    // Unified Notion Multi-Select Floating Picker Events (Always Applies Consistently to ALL targetIndices!)
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

      const focusBtn = e.target.closest('[data-np-focus-item]');
      if (focusBtn && pickerState) {
        pickerState.focusedItemId = focusBtn.dataset.npFocusItem;
        renderNotionPicker();
        return;
      }

      const incBtn = e.target.closest('[data-np-inc-id]');
      if (incBtn && pickerState) {
        const targetId = incBtn.dataset.npIncId;
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        pickerState.focusedItemId = targetId;
        mutateColumnMonths(column, indices, (arr) => {
          const hit = arr.find((it) => it && it.id === targetId);
          if (hit) hit.qty = Math.min(10, Math.max(1, Number(hit.qty) || 1) + 1);
        });
        return;
      }

      const decBtn = e.target.closest('[data-np-dec-id]');
      if (decBtn && pickerState) {
        const targetId = decBtn.dataset.npDecId;
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        mutateColumnMonths(column, indices, (arr) => {
          const idx = arr.findIndex((it) => it && it.id === targetId);
          if (idx >= 0) {
            const qty = Math.max(1, Number(arr[idx].qty) || 1);
            if (qty > 1) arr[idx].qty = qty - 1;
            else arr.splice(idx, 1);
          }
        });
        return;
      }

      const rmSelBtn = e.target.closest('[data-np-remove-id]');
      if (rmSelBtn && pickerState) {
        const removeId = rmSelBtn.dataset.npRemoveId;
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        if (pickerState.focusedItemId === removeId) pickerState.focusedItemId = null;
        mutateColumnMonths(column, indices, (arr) => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] && arr[i].id === removeId) arr.splice(i, 1);
          }
        });
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
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);

        if (family.id === 'fam_none') {
          pickerState = null;
          mutateColumnMonths(column, indices, (arr) => {
            arr.length = 0;
          });
          return;
        }

        // Clicking an already-present family adds +1 seat (supports 2x Pro, 2x Plus, etc.!),
        // except free org seat which stays qty 1
        const variantIdSet = new Set(family.variants.map((v) => v.catalogId));
        let focusId = variant.catalogId;
        mutateColumnMonths(column, indices, (arr) => {
          const existing = arr.find((it) => it && variantIdSet.has(it.id));
          if (existing) {
            focusId = existing.id;
            if (family.id !== 'fam_org') {
              existing.qty = Math.min(10, Math.max(1, Number(existing.qty) || 1) + 1);
            }
          } else {
            arr.push(makeSubItem(variant.catalogId, 1));
          }
        });
        pickerState.focusedItemId = focusId;
        renderNotionPicker();
        return;
      }

      const varBtn = e.target.closest('[data-pick-variant]');
      if (varBtn && pickerState) {
        const catId = varBtn.dataset.pickVariant;
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        const hitInfo = findFamilyByCatalogId(catId);
        const familyVariantIds = hitInfo
          ? new Set(hitInfo.family.variants.map((v) => v.catalogId))
          : new Set([catId]);
        if (column === 'A') markMonthsEdited(indices);
        pickerState.focusedItemId = catId;
        mutateColumnMonths(column, indices, (arr) => {
          const idx = arr.findIndex((it) => it && familyVariantIds.has(it.id));
          const prevQty = idx >= 0 ? Math.max(1, Number(arr[idx].qty) || 1) : 1;
          const nextItem = makeSubItem(catId, prevQty);
          if (idx >= 0) arr[idx] = nextItem;
          else arr.push(nextItem);
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
        const { column, targetIndices, focusedItemId } = pickerState;
        const indices = targetIndices.slice();
        const union = getUnionPillsForTargets(column, indices);
        const targetItem =
          (focusedItemId && union.find((it) => it.id === focusedItemId)) ||
          (union.length > 0 ? union[union.length - 1] : null);
        if (!targetItem) return;

        if (column === 'A') markMonthsEdited(indices);
        mutateColumnMonths(column, indices, (arr) => {
          const slot = arr.find((it) => it && it.id === targetItem.id);
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
        const { column, targetIndices } = pickerState;
        const indices = targetIndices.slice();
        if (column === 'A') markMonthsEdited(indices);
        pickerState.showCustom = false;
        pickerState.focusedItemId = customId;
        mutateColumnMonths(column, indices, (arr) => {
          const nextItem = makeSubItem(null, 1, { id: customId, name, currency, amount });
          const existingIdx = arr.findIndex((it) => it && it.id === customId);
          if (existingIdx >= 0) arr[existingIdx] = nextItem;
          else arr.push(nextItem);
        });
        showToast(t('toast.customApplied', { name }));
      }
    });

    // Mouse-Drag Marquee Multi-Select on BOTH Step 2 (Plan A) and Step 3 (Plan B)
    const dbTbody = document.getElementById('db-months-tbody');
    const dbBTbody = document.getElementById('db-b-months-tbody');
    const step1El = document.getElementById('step-1');
    const step2El = document.getElementById('step-2');
    const marqueeBox = document.createElement('div');
    marqueeBox.className = 'db-marquee-box';
    document.body.appendChild(marqueeBox);

    let marquee = null;
    let suppressNextClick = false;

    document.addEventListener('mousedown', (e) => {
      if ((currentStep !== 1 && currentStep !== 2) || e.button !== 0) return;
      if (e.target.closest('input, textarea, select, option, a, button, .topbar, .side-nav-zone, .mobile-step-nav, .notion-picker, .step-title-bar, .db-selection-bar')) return;
      const activeSection = currentStep === 1 ? step1El : step2El;
      const stepRect = activeSection.getBoundingClientRect();
      if (e.clientY < stepRect.top || e.clientY > stepRect.bottom + 40) return;

      const col = currentStep === 1 ? 'A' : 'B';
      marquee = {
        column: col,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        additive: e.ctrlKey || e.metaKey || e.shiftKey,
        baseSelection: new Set(getActiveSelectionSet(col)),
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

      const targetTbody = marquee.column === 'B' ? dbBTbody : dbTbody;
      const cellAttr = marquee.column === 'B' ? 'data-b-cell-idx' : 'data-cell-idx';
      const chkSel = marquee.column === 'B' ? '[data-chk-b-month]' : '[data-chk-month]';

      targetTbody.querySelectorAll(`td.col-skip[${cellAttr}]`).forEach((td) => {
        const tr = td.closest('tr');
        const r = tr.getBoundingClientRect();
        const intersects = !(r.right < left || r.left > rectRight || r.bottom < top || r.top > rectBottom);
        const idx = Number(td.getAttribute(cellAttr));
        if (intersects) {
          nextSet.add(idx);
          td.classList.add('is-cell-selected');
          const box = td.querySelector(chkSel);
          if (box) box.checked = true;
        } else if (!marquee.additive) {
          td.classList.remove('is-cell-selected');
          const box = td.querySelector(chkSel);
          if (box) box.checked = false;
        }
      });

      if (marquee.column === 'B') selectedMonthsB = nextSet;
      else selectedMonths = nextSet;
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
        if (currentStep !== 1 && currentStep !== 2) return;
        if (pickerState && !e.target.closest('.notion-picker, [data-open-picker], #btn-open-batch-picker, #btn-open-b-batch-picker')) {
          pickerState = null;
          renderNotionPicker();
        }
        const activeSel = currentStep === 1 ? selectedMonths : selectedMonthsB;
        if (activeSel.size === 0) return;
        if (e.target.closest('.notion-db, .db-selection-bar, .topbar, .side-nav-zone, .mobile-step-nav, .notion-picker, .step-title-bar')) return;
        if (currentStep === 1) selectedMonths = new Set();
        else selectedMonthsB = new Set();
        render();
      },
      true
    );

    document.addEventListener('keydown', (e) => {
      // Global Undo / Redo shortcuts (Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z, Ctrl/Cmd + Y)
      const inEditable = Boolean(e.target && e.target.closest('input, textarea, select'));
      if (!inEditable && (e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          performUndo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          performRedo();
          return;
        }
      }

      if (e.key !== 'Escape') return;
      if (currentStep !== 1 && currentStep !== 2) return;
      if (pickerState) {
        pickerState = null;
        renderNotionPicker();
      } else if (currentStep === 1 && selectedMonths.size > 0) {
        selectedMonths = new Set();
        render();
      } else if (currentStep === 2 && selectedMonthsB.size > 0) {
        selectedMonthsB = new Set();
        render();
      }
    });

    function handlePlanTableClick(e, column) {
      const chkAttr = column === 'B' ? '[data-chk-b-month]' : '[data-chk-month]';
      const chk = e.target.closest(chkAttr);
      if (chk) {
        const idx = Number(column === 'B' ? chk.dataset.chkBMonth : chk.dataset.chkMonth);
        const selSet = getActiveSelectionSet(column);
        const prevIdx = column === 'B' ? lastCheckedIdxB : lastCheckedIdx;
        if (e.shiftKey && prevIdx !== null) {
          const start = Math.min(prevIdx, idx);
          const end = Math.max(prevIdx, idx);
          for (let i = start; i <= end; i++) {
            if (chk.checked) selSet.add(i);
            else selSet.delete(i);
          }
        } else {
          if (chk.checked) selSet.add(idx);
          else selSet.delete(idx);
        }
        if (column === 'B') lastCheckedIdxB = idx;
        else lastCheckedIdx = idx;
        render();
        return;
      }

      if (e.target.closest('[data-open-phase-pop]')) {
        pickerState = null;
        renderNotionPicker();
        jumpToLifecycleSection();
        return;
      }

      const syncBtn = e.target.closest('[data-sync-b]');
      if (syncBtn) {
        e.stopPropagation();
        recordUndoSnapshot();
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
        const rawVal = rmBtn.dataset.removeItem;
        const firstSep = rawVal.indexOf(':');
        const secondSep = rawVal.indexOf(':', firstSep + 1);
        const col = rawVal.slice(0, firstSep);
        const mIdx = Number(rawVal.slice(firstSep + 1, secondSep));
        const removeId = rawVal.slice(secondSep + 1);
        const selSet = getActiveSelectionSet(col);
        const targets = selSet.size > 1 && selSet.has(mIdx)
          ? getActiveSelectedIndices(col)
          : [mIdx];
        pickerState = null;
        if (col === 'A') markMonthsEdited(targets);
        mutateColumnMonths(col, targets, (arr) => {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i] && arr[i].id === removeId) {
              const qty = Math.max(1, Number(arr[i].qty) || 1);
              if (qty > 1) arr[i].qty = qty - 1;
              else arr.splice(i, 1);
            }
          }
        });
        return;
      }

      const pillBtn = e.target.closest('[data-open-picker]');
      if (pillBtn) {
        e.stopPropagation();
        const rawVal = pillBtn.dataset.openPicker;
        const firstSep = rawVal.indexOf(':');
        const secondSep = rawVal.indexOf(':', firstSep + 1);
        const col = rawVal.slice(0, firstSep);
        const mIdx = Number(rawVal.slice(firstSep + 1, secondSep));
        const itemId = rawVal.slice(secondSep + 1) || null;
        const selSet = getActiveSelectionSet(col);
        const targets = selSet.size > 1 && selSet.has(mIdx)
          ? getActiveSelectedIndices(col)
          : [mIdx];
        if (
          pickerState &&
          pickerState.column === col &&
          pickerState.targetIndices.length === targets.length &&
          pickerState.targetIndices[0] === targets[0] &&
          pickerState.focusedItemId === itemId
        ) {
          pickerState = null;
        } else {
          pickerState = {
            column: col,
            targetIndices: targets,
            focusedItemId: itemId,
            anchorRect: pillBtn.getBoundingClientRect(),
            showCustom: false,
          };
        }
        renderNotionPicker();
      }
    }

    dbTbody.addEventListener('click', (e) => handlePlanTableClick(e, 'A'));
    dbBTbody.addEventListener('click', (e) => handlePlanTableClick(e, 'B'));

    // Step 4: Model Lifecycle & Post-SOTA Inertia Sliders
    document.getElementById('inp-sota-len').addEventListener('input', (e) => {
      recordUndoSnapshot('sota-len');
      state.effectiveSotaMonths = Number(e.target.value);
      const maxExtra = Math.max(0, 12 - state.effectiveSotaMonths);
      if ((Number(state.postSotaExtraMonths) || 0) > maxExtra) {
        state.postSotaExtraMonths = maxExtra;
      }
      render();
    });

    document.getElementById('inp-next-interval').addEventListener('input', (e) => {
      recordUndoSnapshot('next-interval');
      state.nextFlagshipInterval = Number(e.target.value);
      render();
    });

    document.getElementById('inp-post-sota-extra').addEventListener('input', (e) => {
      recordUndoSnapshot('post-sota-extra');
      state.postSotaExtraMonths = Number(e.target.value);
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
      const cur = getDisplayCurrency();
      const res = calculateLedger(state, lang, cur);
      const svg = buildSummarySvg(state, res, lang, cur);
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
      const cur = getDisplayCurrency();
      const res = calculateLedger(state, lang, cur);
      const svg = buildSummarySvg(state, res, lang, cur);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      triggerDownload(blob, 'do-you-really-need-gemini-pro-bf.svg');
      showToast(t('toast.exportedSvg'));
    });

    document.getElementById('btn-export-html').addEventListener('click', () => {
      const lang = getLang();
      const cur = getDisplayCurrency();
      const res = calculateLedger(state, lang, cur);
      const html = buildStandaloneHtml(state, res, lang, cur);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, 'do-you-really-need-gemini-pro-bf-report.html');
      showToast(t('toast.exportedHtml'));
    });

    document.getElementById('btn-copy-summary').addEventListener('click', async () => {
      const lang = getLang();
      const res = calculateLedger(state, lang, getDisplayCurrency());
      const lineStr =
        res.breakEvenStatus === 'already_even'
          ? (lang === 'en-US' ? `Locked in SOTA span (Mo ${res.breakEvenMonthNum})` : `SOTA 期内已回本（第 ${res.breakEvenMonthNum} 月）`)
          : res.breakEvenStatus === 'impossible'
            ? (lang === 'en-US' ? 'Unreachable within 12 mo' : '全年仍未回本')
            : res.breakEvenMonthNum != null
              ? (lang === 'en-US' ? `Mo ${res.breakEvenMonthNum}` : `第 ${res.breakEvenMonthNum} 个月`)
              : '—';
      const crossStr =
        res.crossoverMonthIndex !== null
          ? getMonthLabel(res.crossoverMonthIndex)
          : t('step4.condCrossNone');
      const partsTxt = formatSpanParts(res, lang);
      const lines = (lang === 'en-US'
        ? [
            '[Do You Really Need Gemini Pro Black Friday?]',
            `- Verdict: ${res.verdict.badge} (${res.verdict.headline})`,
            `- Expected Active Span: ${res.expectedActiveMonths} mo (${partsTxt} · Payback: ${lineStr})`,
            `- Plan A (No BF) vs Buy (at ${res.expectedActiveMonths} mo): ${fmtYen(res.totalSkipCost)} vs ${fmtYen(res.expectedBuyCost)}`,
            `- Expected Net Savings: ${fmtYen(res.expectedNetSavings, true)}`,
            `- Cumulative Payback: ${crossStr}`,
            `- SOTA-Only (${res.sotaCutoff} mo) / Full Year (12 mo): ${fmtYen(res.downsideNet, true)} / ${fmtYen(res.upsideNet, true)}`,
          ]
        : [
            '【AI 黑五包年决策账本】',
            `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
            `- 预期生效时长：共 ${res.expectedActiveMonths} 个月（${partsTxt} · 回本线：${lineStr}）`,
            `- 总花费对照：不买黑五 ${fmtYen(res.totalSkipCost)} vs 按预期买入支出 ${fmtYen(res.expectedBuyCost)}`,
            `- 预期净节省：${fmtYen(res.expectedNetSavings, true)}`,
            `- 累计回本节点：${crossStr}`,
            `- 仅用本次 SOTA（${res.sotaCutoff} 月）/ 用满全年（12 月）：${fmtYen(res.downsideNet, true)} / ${fmtYen(res.upsideNet, true)}`,
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
