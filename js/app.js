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
    SUB_CATALOG,
    TRY_FX_HISTORY,
    buildMonthPlan,
    makeSubItem,
  } = window.SubLedgerData;

  const {
    calculateLedger,
    convertToCny,
    getCnyPerUnit,
    legacyTryDepToAnnualPct,
  } = window.SubLedgerCalc;
  const { buildSummarySvg, buildStandaloneHtml, svgToHighResPngBlob } = window.SubLedgerExporter;

  const STORAGE_KEY = 'ai_sub_ledger_state_v11';

  const STEPS = [
    { idx: 0, key: 'nav.step0' },
    { idx: 1, key: 'nav.step1' },
    { idx: 2, key: 'nav.step2' },
    { idx: 3, key: 'nav.step3' },
  ];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Fresh UI starts with Step 1 unselected and Step 2's "不买黑五（原方案）" column completely empty
  function createInitialUiState() {
    const s = cloneState(DEFAULT_STATE);
    s.bfPicked = false;
    s.monthPlans = buildMonthPlan('empty');
    s.monthEdited = Array(12).fill(false);
    return s;
  }

  let state = loadState();
  let currentStep = 0;
  let maxVisitedStep = 0;
  let selectedMonths = new Set();
  let lastCheckedIdx = null;
  let showBfCompare = true;
  let phaseModalOpen = false;
  let pickerState = null; // { targetIndices: number[], anchorRect: DOMRect, showCustom: boolean }
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
      return Object.assign(createInitialUiState(), parsed, {
        fxAnnualChangePct: mergedFx,
        monthPlans: Array.isArray(parsed.monthPlans) && parsed.monthPlans.length === 12
          ? parsed.monthPlans
          : buildMonthPlan('empty'),
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
      return `${rounded >= 0 ? '+' : '-'}¥${Math.abs(rounded).toLocaleString('zh-CN')}`;
    }
    return `¥${rounded.toLocaleString('zh-CN')}`;
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

  function mutateMonths(indices, mutator) {
    indices.forEach((mIdx) => {
      if (!Array.isArray(state.monthPlans[mIdx])) state.monthPlans[mIdx] = [];
      mutator(state.monthPlans[mIdx], mIdx);
    });
    render();
  }

  // Authentic Brand-Grouped Notion Database Select Popover
  function renderNotionPicker() {
    if (!pickerState || currentStep !== 1) {
      pickerEl.classList.remove('is-open');
      return;
    }
    const { targetIndices, anchorRect, showCustom } = pickerState;
    if (!targetIndices || targetIndices.length === 0) {
      pickerState = null;
      pickerEl.classList.remove('is-open');
      return;
    }

    const firstIdx = targetIndices[0];
    const firstArr = state.monthPlans[firstIdx] || [];
    const currentItem = firstArr[0] || null;
    const currentId = currentItem ? currentItem.id : 'none_idle';
    const found = findFamilyByCatalogId(currentId);
    const activeFamily = found ? found.family : null;

    const targetLabel =
      targetIndices.length === 1
        ? t('picker.singleTarget', { month: getMonthLabel(firstIdx) })
        : targetIndices.length === 12
          ? t('picker.batchAll')
          : t('picker.batchN', { n: targetIndices.length });

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

    // Inline custom price editor for EVERY paid subscription/plan (both replaceable & idle plans!)
    let priceInlineHtml = '';
    if (currentItem && currentItem.id !== 'none_idle' && currentItem.id !== 'idle_org_seat') {
      const isLegacyUltra = currentItem.dynamicPrice === 'gemini_ultra_5x';
      const curCode = isLegacyUltra ? 'CNY' : (currentItem.currency || 'CNY');
      const amtVal = isLegacyUltra ? state.currentUltraCny : (currentItem.amount != null ? currentItem.amount : 0);
      const isTry = curCode === 'TRY' && Boolean(currentItem.replaceableByBf);
      priceInlineHtml = `
        <div class="np-price-inline">
          <select class="flat-select" data-np-cur="1" style="width:94px;">${currencyOptionsHtml(curCode)}</select>
          <input class="flat-input mono" data-np-amt="1" type="number" min="0" max="500000" step="any" value="${amtVal}" style="width:82px;" />
          <label class="check-inline" data-np-hike-wrap="1" style="display:${isTry ? 'inline-flex' : 'none'};font-size:12px;gap:5px;">
            <input type="checkbox" data-np-hike="1" ${currentItem.midYearHike ? 'checked' : ''} />
            <span>${escapeHtml(t('picker.hikeCheck'))}</span>
          </label>
          <button type="button" class="subtle-btn btn-xs" data-np-apply-price="1" style="height:28px;padding:0 9px;font-size:12px;">${escapeHtml(t('picker.updatePrice'))}</button>
        </div>`;
    }

    // Brand-grouped list (1 row per plan family)
    const groupsHtml = PLAN_BRAND_GROUPS.map((g) => {
      const rows = g.families
        .map((fam) => {
          const isAct = activeFamily && activeFamily.id === fam.id;
          const metaText =
            fam.variants.length > 1
              ? t('picker.regionsCount', { n: fam.variants.length })
              : fam.variants[0].priceText;
          const kindHint = fam.kind === 'replace'
            ? t('picker.canReplace')
            : (getLang() === 'en-US' ? 'Idle' : fam.badge);
          return `
            <button type="button" class="np-item-btn ${isAct ? 'is-active' : ''}" data-pick-family="${fam.id}">
              <span class="np-item-left">
                <span class="tag tag-${fam.tone}" style="font-size:12.5px;padding:1px 7px;">${escapeHtml(localizeItemShort(fam.name))}</span>
                <span class="np-item-meta">${escapeHtml(metaText)}</span>
              </span>
              <span class="np-item-meta">${escapeHtml(kindHint)}</span>
            </button>`;
        })
        .join('');
      return `<div class="np-brand-title">${escapeHtml(localizeBrand(g.brand))}</div>${rows}`;
    }).join('');

    // Built-in Custom Plan section at the bottom of the dropdown
    const customSectionHtml = showCustom
      ? `
        <div class="np-custom-form">
          <div class="np-custom-row">
            <select class="flat-select" data-np-ckind="1" style="width:128px;">
              <option value="replace">${escapeHtml(t('picker.customReplace'))}</option>
              <option value="idle">${escapeHtml(t('picker.customIdle'))}</option>
            </select>
            <input class="flat-input" data-np-cname="1" type="text" placeholder="${escapeHtml(t('picker.customNamePh'))}" style="flex:1;min-width:0;" />
          </div>
          <div class="np-custom-row" data-np-cprice-row="1">
            <select class="flat-select" data-np-ccur="1" style="width:106px;">${currencyOptionsHtml('CNY')}</select>
            <input class="flat-input mono" data-np-camt="1" type="number" min="0" max="500000" step="any" placeholder="${escapeHtml(t('picker.customPricePh'))}" style="flex:1;min-width:0;" />
            <button type="button" class="primary-btn btn-xs" data-np-csave="1" style="height:30px;">${escapeHtml(t('picker.apply'))}</button>
          </div>
          <div class="np-custom-row" data-np-cidle-row="1" style="display:none;justify-content:flex-end;">
            <button type="button" class="primary-btn btn-xs" data-np-csave="1" style="height:30px;">${escapeHtml(t('picker.applyIdle'))}</button>
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

    const subEl = document.getElementById('calc-stage-sub');
    const fillEl = document.getElementById('calc-progress-fill');
    const p0 = document.getElementById('calc-pill-0');
    const p1 = document.getElementById('calc-pill-1');
    const p2 = document.getElementById('calc-pill-2');

    [p0, p1, p2].forEach((p) => {
      p.className = 'calc-pill';
    });
    fillEl.style.width = '14%';
    subEl.textContent = t('step4.calcSub0');
    p0.classList.add('is-active');

    render();

    calcTimers.push(
      setTimeout(() => {
        p0.className = 'calc-pill is-done';
        p1.className = 'calc-pill is-active';
        fillEl.style.width = '56%';
        subEl.textContent = t('step4.calcSub1');
      }, 280)
    );

    calcTimers.push(
      setTimeout(() => {
        p1.className = 'calc-pill is-done';
        p2.className = 'calc-pill is-active';
        fillEl.style.width = '90%';
        subEl.textContent = t('step4.calcSub2');
      }, 600)
    );

    calcTimers.push(
      setTimeout(() => {
        p2.className = 'calc-pill is-done';
        fillEl.style.width = '100%';
        isCalculatingFinal = false;
        stageEl.style.display = 'none';
        resultEl.style.display = 'block';
        render();
        void resultEl.offsetWidth;
        resultEl.classList.add('is-revealing');
        exportEl.style.display = 'flex';
      }, 940)
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
    document.getElementById('inp-ultra-cny').value = state.currentUltraCny;
    document.getElementById('inp-fail-month').value = state.ultraFailMonthIndex;
    document.getElementById('inp-fallback-strategy').value = state.fallbackUltraStrategy;
    document.getElementById('inp-music-cny').value = state.musicMonthlyCny;
    document.getElementById('inp-colab-cny').value = state.colabProMonthlyCny || 0;
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
    tableEl.classList.toggle('is-compare-hidden', !showBfCompare);
    skipBtn.classList.toggle('is-active', !showBfCompare);
    buyBtn.classList.toggle('is-active', showBfCompare);
    saveThLabel.textContent = showBfCompare ? t('step2.thSaveDiff') : t('step2.thSaveOrig');
    document.getElementById('lbl-phase-settings-meta').textContent =
      t('step2.phaseMeta', { sota: state.effectiveSotaMonths, prob: state.retainProbPct });

    const phaseTip = escapeHtml(t('step2.phaseTooltip'));
    const tbody = document.getElementById('db-months-tbody');
    tbody.innerHTML = res.monthlyRows
      .map((row) => {
        const isSel = selectedMonths.has(row.index);
        const idleItem = row.items.find((it) => it.isIdlePlan || it.isGeminiUltra || it.dynamicPrice === 'gemini_ultra_5x');
        const replaceableItem = row.items.find((it) => it.replaceableByBf && !it.isIdlePlan && !it.isGeminiUltra);
        const primaryItem = idleItem || replaceableItem || null;
        const isBfActive = row.monthSavedByBf > 0;
        const isPickerOpen = Boolean(
          pickerState && pickerState.targetIndices.includes(row.index)
        );

        const pillTone = primaryItem ? `tone-${primaryItem.tone || 'gray'}` : 'tone-empty';
        const pillText = primaryItem ? localizeItemShort(primaryItem.short) : t('step2.pickPlaceholder');
        const isReplacedStrike = showBfCompare && isBfActive && Boolean(replaceableItem);
        const hikeBadge = replaceableItem && replaceableItem.midYearHike
          ? `<span class="cell-hike-dot">${escapeHtml(t('step2.hikeTag'))}</span>`
          : '';

        const skipCellHtml = `
          <div class="cell-skip-inner">
            <input type="checkbox" class="cell-chk" data-chk-month="${row.index}" ${isSel ? 'checked' : ''} aria-label="${escapeHtml(getMonthLabel(row.index))}" />
            <button type="button" class="cell-pill-btn ${pillTone} ${isPickerOpen ? 'is-open' : ''} ${isReplacedStrike ? 'is-replaced-by-bf' : ''}" data-open-picker="${row.index}">
              <span class="cell-pill-text">${escapeHtml(pillText)}</span>
              <span class="cell-pill-caret" aria-hidden="true">▾</span>
            </button>
            ${hikeBadge}
          </div>`;

        // Right Column: Pure Black Friday Pro status only (no redundant duplication of left-column plans)
        let buyCellHtml;
        if (idleItem && row.ultraFallbackToPro) {
          buyCellHtml = `
            <div class="bf-compare-cell">
              <span class="bf-pill is-active">${escapeHtml(t('step2.bfFallback'))}</span>
            </div>`;
        } else if (replaceableItem) {
          buyCellHtml = `
            <div class="bf-compare-cell">
              <span class="bf-pill is-active">${escapeHtml(t('step2.bfReplace'))}</span>
            </div>`;
        } else {
          buyCellHtml = `
            <div class="bf-compare-cell">
              <span class="bf-pill is-idle">${escapeHtml(t('step2.bfIdle'))}</span>
            </div>`;
        }

        let saveText;
        if (showBfCompare) {
          saveText = isBfActive
            ? `<span class="mono save-val-active">${escapeHtml(t('step2.saveMonth', { yen: fmtYen(row.monthSavedByBf) }))}</span>`
            : idleItem
              ? `<span class="mono save-val-idle">${escapeHtml(t('step2.idleZero'))}</span>`
              : `<span class="mono save-val-idle">${escapeHtml(t('step2.emptyZero'))}</span>`;
        } else {
          saveText = isBfActive
            ? `<span class="mono">${fmtYen(row.monthSavedByBf)}</span>`
            : idleItem
              ? `<span class="mono save-val-idle">${escapeHtml(t('step2.otherPlan'))}</span>`
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

    document.getElementById('db-months-tfoot').innerHTML = `
      <tr>
        <td class="mono" style="font-weight:600;">${escapeHtml(t('step2.footTitle'))}</td>
        <td>${t('step2.footSkip', { pro: res.proCoveredMonths, ultra: res.ultraOverlapMonths, none: res.idleNoneMonths })}</td>
        <td class="col-buy">${t('step2.footBuy', { pro: res.proCoveredMonths, idle: res.totalIdleMonths })}</td>
        <td class="num unit">${escapeHtml(t('step2.footRight'))}</td>
      </tr>`;
  }

  function renderChart(res) {
    const container = document.getElementById('chart-container');
    const rows = res.monthlyRows;

    const width = 760;
    const height = 225;
    const padL = 60;
    const padR = 24;
    const padT = 22;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxY = Math.max(600, ...rows.map((r) => Math.max(r.cumBuy, r.cumSkip)));
    const niceMaxY = Math.ceil(maxY / 500) * 500;

    const xAt = (idx) => padL + (idx / (rows.length - 1)) * plotW;
    const yAt = (val) => padT + plotH - (val / niceMaxY) * plotH;

    const buyPts = rows.map((r, i) => `${xAt(i).toFixed(1)},${yAt(r.cumBuy).toFixed(1)}`).join(' ');
    const skipPts = rows.map((r, i) => `${xAt(i).toFixed(1)},${yAt(r.cumSkip).toFixed(1)}`).join(' ');

    const gridLines = [];
    for (let s = 0; s <= 4; s++) {
      const val = (niceMaxY / 4) * s;
      const y = yAt(val).toFixed(1);
      gridLines.push(`
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
        <text x="${padL - 10}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="11.5" font-family="JetBrains Mono, monospace">¥${Math.round(val)}</text>
      `);
    }

    let crossoverSvg = '';
    if (res.crossoverMonthIndex !== null) {
      const cx = xAt(res.crossoverMonthIndex);
      const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#1c3829" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 96, cx + 8).toFixed(1)}" y="${Math.max(padT + 20, cy - 8).toFixed(1)}" fill="#1c3829" font-size="12" font-weight="600">${escapeHtml(t('step4.chartBreakeven', { m: getMonthShort(res.crossoverMonthIndex) }))}</text>
      `;
    }

    const xLabels = rows
      .map((r, i) => {
        const x = xAt(i).toFixed(1);
        return `
          <text x="${x}" y="${height - 10}" text-anchor="middle" fill="#787774" font-size="11.5">${escapeHtml(getMonthShort(i))}</text>
          <circle cx="${x}" cy="${yAt(r.cumBuy).toFixed(1)}" r="2.5" fill="#37352f"/>
        `;
      })
      .join('');

    const lastRow = rows[rows.length - 1];
    const lastX = xAt(rows.length - 1);
    const buyY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumBuy) - 10 : yAt(lastRow.cumBuy) + 16;
    const skipY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumSkip) + 16 : yAt(lastRow.cumSkip) - 10;

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    let nextGenMarkerSvg = '';
    if (nextGenIdx >= 0) {
      const nx = xAt(nextGenIdx);
      nextGenMarkerSvg = `
        <line x1="${nx.toFixed(1)}" y1="${padT}" x2="${nx.toFixed(1)}" y2="${padT + plotH}" stroke="#787774" stroke-dasharray="2 3" stroke-width="1"/>
        <circle cx="${nx.toFixed(1)}" cy="${(padT + plotH).toFixed(1)}" r="4.5" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 132, Math.max(padL + 6, nx - 44)).toFixed(1)}" y="${(padT + 12).toFixed(1)}" fill="#1c3829" font-size="11.5" font-weight="600">${escapeHtml(t('step4.chartNextGen', { m: getMonthShort(nextGenIdx) }))}</text>
      `;
    }

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12-month cumulative comparison">
        ${gridLines.join('')}
        ${nextGenMarkerSvg}
        <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="2" stroke-dasharray="5 4"/>
        <polyline class="chart-line-draw" points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
        ${xLabels}
        ${crossoverSvg}
        <text x="${(lastX - 6).toFixed(1)}" y="${buyY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="12" font-weight="600" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.chartBuy', { yen: fmtYen(lastRow.cumBuy) }))}</text>
        <text x="${(lastX - 6).toFixed(1)}" y="${skipY.toFixed(1)}" text-anchor="end" fill="#787774" font-size="12" font-family="JetBrains Mono, monospace">${escapeHtml(t('step4.chartSkip', { yen: fmtYen(lastRow.cumSkip) }))}</text>
      </svg>
    `;
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

    const idleUltraMonths = res.monthlyRows
      .filter((r) => r.hasUltraActive && r.replaceableSlots === 0)
      .map((r) => getMonthShort(r.index));
    const idlePlanLabels = [
      ...new Set(
        res.monthlyRows
          .filter((r) => r.hasUltraActive && r.replaceableSlots === 0)
          .flatMap((r) => r.items.filter((it) => it.isIdlePlan || it.isGeminiUltra).map((it) => localizeItemShort(it.short)))
      ),
    ];

    // STEP 3
    document.getElementById('section-legacy-ultra').style.display = res.needsLegacyUltraRenewal ? 'block' : 'none';
    document.querySelectorAll('[data-renewal]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.renewal === state.ultraRenewalMode);
    });
    document.getElementById('wrap-fail-month').style.display = state.ultraRenewalMode === 'fail_at' ? 'grid' : 'none';
    document.getElementById('wrap-fallback-strategy').style.display = state.ultraRenewalMode !== 'always' ? 'grid' : 'none';
    document.getElementById('lbl-fail-month').textContent = getMonthLabel(state.ultraFailMonthIndex) || '';
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

    const sotaPct = Math.min(94, Math.max(8, (state.effectiveSotaMonths / 12) * 100));
    const nextPct = Math.min(96, Math.max(12, (state.nextFlagshipInterval / 12) * 100));
    document.getElementById('lc-active-seg').style.width = `${sotaPct}%`;
    document.getElementById('lc-sota-node').style.left = `${sotaPct}%`;
    document.getElementById('lc-sota-label').textContent = t('modal.nodeSota', { when: lang === 'en-US' ? sotaUntilText : sotaUntilText.slice(2) });
    document.getElementById('lc-next-node').style.left = `${nextPct}%`;
    document.getElementById('lc-next-label').textContent = t('modal.nodeNext', { when: lang === 'en-US' ? nextWhenText : nextWhenText.slice(2) });

    const thresholdClamped = Math.min(96, Math.max(4, res.breakEvenProbPct));
    document.getElementById('ev-threshold-line').style.left = `${thresholdClamped}%`;
    document.getElementById('ev-threshold-tag').textContent = t('modal.evLine', { pct: res.breakEvenProbPct.toFixed(0) });
    document.getElementById('ev-user-dot').style.left = `${state.retainProbPct}%`;
    const probGap = state.retainProbPct - res.breakEvenProbPct;
    document.getElementById('lbl-ev-gap').textContent =
      probGap >= 0 ? t('modal.evAbove', { gap: probGap.toFixed(1) }) : t('modal.evBelow', { gap: probGap.toFixed(1) });

    // FINAL STEP (Step 4): Summary Ledger
    const badge = document.getElementById('verdict-badge');
    badge.className = `tag tag-${res.verdict.tone}`;
    badge.textContent = res.verdict.badge;
    document.getElementById('verdict-headline').textContent = res.verdict.headline;
    document.getElementById('verdict-detail').textContent = res.verdict.detail;

    document.getElementById('kpi-bf-cost').textContent = fmtYen(res.bfCost);
    document.getElementById('kpi-bf-monthly').textContent = t('step4.kpiBfAvg', { avg: res.bfMonthlyAvg.toFixed(1) });

    document.getElementById('kpi-idle-summary').textContent =
      res.totalIdleMonths > 0
        ? t('step4.kpiIdleVal', { total: res.totalIdleMonths, ultra: res.ultraOverlapMonths, none: res.idleNoneMonths, cost: fmtYen(res.totalIdleCostCny) })
        : t('step4.kpiIdleZero');

    document.getElementById('kpi-breakeven').textContent = Number.isFinite(res.breakEvenMonths)
      ? t('step4.kpiBreakevenMo', { n: res.breakEvenMonths.toFixed(1) })
      : t('step4.kpiNoBreakeven');
    document.getElementById('kpi-avg-pro').textContent = t('step4.kpiAvgPro', { avg: Math.round(res.avgProPrice) });

    const evEl = document.getElementById('kpi-ev');
    evEl.textContent = fmtYen(res.expectedNetSavings, true);
    evEl.className = res.expectedNetSavings > 0 ? 'is-pos' : res.expectedNetSavings < 0 ? 'is-neg' : '';
    document.getElementById('kpi-prob-line').textContent = t('step4.kpiProbLine', { pct: res.breakEvenProbPct.toFixed(1) });

    document.getElementById('kpi-upside-downside').textContent =
      `${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`;
    const oddsRatio = res.downsideNet < 0 ? Math.max(0, res.upsideNet) / Math.abs(res.downsideNet) : Infinity;
    document.getElementById('kpi-odds-sub').textContent = Number.isFinite(oddsRatio)
      ? t('step4.kpiOdds', { ratio: oddsRatio.toFixed(2) })
      : t('step4.kpiNoDownside');

    const idleCallout = document.getElementById('idle-callout');
    if (res.totalIdleMonths > 0) {
      idleCallout.style.display = 'block';
      document.getElementById('idle-callout-title').textContent =
        t('step4.idleTitle', { total: res.totalIdleMonths });
      const planDesc = idlePlanLabels.length > 0 ? idlePlanLabels.join(' / ') : t('step2.otherPlan');
      document.getElementById('idle-callout-detail').textContent =
        res.ultraOverlapMonths > 0
          ? t('step4.idleDetailUltra', {
              months: idleUltraMonths.join(lang === 'en-US' ? ', ' : '、'),
              n: res.ultraOverlapMonths,
              plans: planDesc,
              pct: Math.round((res.ultraOverlapMonths / 12) * 100),
              cost: fmtYen(res.ultraIdleCostCny),
              pro: res.proCoveredMonths,
            })
          : t('step4.idleDetailNone', { n: res.idleNoneMonths, cost: fmtYen(res.totalIdleCostCny) });
    } else {
      idleCallout.style.display = 'none';
    }

    renderChart(res);

    document.getElementById('scenarios-tbody').innerHTML = res.scenarios
      .map((sc) => {
        const cls = sc.diff > 0 ? 'is-pos' : sc.diff < 0 ? 'is-neg' : '';
        const diffLabel = sc.diff >= 0
          ? t('step4.saveWord', { yen: fmtYen(sc.diff) })
          : t('step4.lossWord', { yen: fmtYen(Math.abs(sc.diff)) });
        return `
          <tr>
            <td>${escapeHtml(sc.title)}</td>
            <td class="num mono">${fmtYen(sc.buyTotal)}</td>
            <td class="num mono">${fmtYen(sc.skipTotal)}</td>
            <td class="num mono ${cls}" style="font-weight:600;">${escapeHtml(diffLabel)}</td>
          </tr>`;
      })
      .join('');
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
      pickerState = null;
      setPhaseModalOpen(false);
      syncInputsFromState();
      e.target.value = '';
      goToStep(3);
      showToast(`已载入：${found.name}`);
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

    // Step 1: 5 Regions + Custom (keeps Step 2 empty/user-controlled until user edits or applies a template)
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

    // Step 2: Prominent Compare Mode Switch & Center Peek Model Phase Modal
    document.getElementById('bf-compare-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-compare-mode]');
      if (!btn) return;
      showBfCompare = btn.dataset.compareMode === 'on';
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
      state.monthPlans = buildMonthPlan(key, regionProId);
      state.monthEdited = Array(12).fill(key !== 'region_pro');
      pickerState = null;
      e.target.value = '';
      render();
      showToast('已套用整年模板');
    });

    document.getElementById('btn-open-batch-picker').addEventListener('click', (e) => {
      e.stopPropagation();
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选至少 1 个月份');
        return;
      }
      pickerState = {
        targetIndices: indices,
        anchorRect: e.currentTarget.getBoundingClientRect(),
        showCustom: false,
      };
      renderNotionPicker();
    });

    document.getElementById('btn-clear-selected-months').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选要修改的月份');
        return;
      }
      pickerState = null;
      markMonthsEdited(indices);
      mutateMonths(indices, (arr) => {
        arr.length = 0;
      });
      showToast(`已将 ${indices.length} 个月设为本月不买`);
    });

    // Notion Database Brand-Grouped Floating Select Picker Events
    pickerEl.addEventListener('change', (e) => {
      if (e.target.matches('[data-np-cur]')) {
        const wrap = pickerEl.querySelector('[data-np-hike-wrap]');
        if (wrap) wrap.style.display = e.target.value === 'TRY' ? 'inline-flex' : 'none';
      } else if (e.target.matches('[data-np-ckind]')) {
        const isIdle = e.target.value === 'idle';
        const pr = pickerEl.querySelector('[data-np-cprice-row]');
        const ir = pickerEl.querySelector('[data-np-cidle-row]');
        if (pr) pr.style.display = isIdle ? 'none' : 'flex';
        if (ir) ir.style.display = isIdle ? 'flex' : 'none';
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
        const indices = pickerState.targetIndices.slice();
        markMonthsEdited(indices);
        const shouldClose = family.id === 'fam_none' || family.id === 'fam_org';
        if (shouldClose) pickerState = null;
        mutateMonths(indices, (arr) => {
          arr.length = 0;
          if (variant.catalogId !== 'none_idle') {
            arr.push(makeSubItem(variant.catalogId, 1));
          }
        });
        return;
      }

      const varBtn = e.target.closest('[data-pick-variant]');
      if (varBtn && pickerState) {
        const catId = varBtn.dataset.pickVariant;
        const indices = pickerState.targetIndices.slice();
        markMonthsEdited(indices);
        mutateMonths(indices, (arr) => {
          arr.length = 0;
          if (catId !== 'none_idle') {
            arr.push(makeSubItem(catId, 1));
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
        const indices = pickerState.targetIndices.slice();
        markMonthsEdited(indices);
        pickerState = null;
        mutateMonths(indices, (arr) => {
          if (!arr[0]) return;
          if (arr[0].dynamicPrice === 'gemini_ultra_5x' && currency === 'CNY') {
            state.currentUltraCny = amount;
            document.getElementById('inp-ultra-cny').value = amount;
          } else {
            if (arr[0].dynamicPrice === 'gemini_ultra_5x') {
              arr[0].dynamicPrice = null;
            }
            arr[0].currency = currency;
            arr[0].amount = amount;
            arr[0].midYearHike = midYearHike;
          }
        });
        showToast(t('toast.priceUpdated'));
        return;
      }

      if (e.target.closest('[data-np-csave]') && pickerState) {
        const kindEl = pickerEl.querySelector('[data-np-ckind]');
        const nameEl = pickerEl.querySelector('[data-np-cname]');
        const curEl = pickerEl.querySelector('[data-np-ccur]');
        const amtEl = pickerEl.querySelector('[data-np-camt]');
        const isIdlePlan = kindEl && kindEl.value === 'idle';
        const name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
          showToast('请先输入方案名称');
          if (nameEl) nameEl.focus();
          return;
        }
        const currency = curEl ? curEl.value : 'CNY';
        const amount = isIdlePlan ? 0 : Math.max(0, Number(amtEl && amtEl.value) || 0);
        const customId = `custom_${isIdlePlan ? 'idle_' : ''}${name.toLowerCase().replace(/\s+/g, '_')}`;
        const indices = pickerState.targetIndices.slice();
        markMonthsEdited(indices);
        pickerState = null;
        mutateMonths(indices, (arr) => {
          arr.length = 0;
          arr.push(makeSubItem(null, 1, { id: customId, name, currency, amount, isIdlePlan, replaceableByBf: !isIdlePlan }));
        });
        showToast(`已应用自定义方案：${name}`);
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

      // Match single-column .col-skip cells (or vertical span across rows)
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

    // Click outside to close Notion picker or clear single-column selection
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
        if (pickerState && !e.target.closest('.notion-picker, [data-open-picker], #btn-open-batch-picker')) {
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

    // Esc closes Center Modal, Notion Picker, or clears selection
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

      const pillBtn = e.target.closest('[data-open-picker]');
      if (pillBtn) {
        e.stopPropagation();
        const mIdx = Number(pillBtn.dataset.openPicker);
        // If clicking inside a multi-selected column block, edit all selected cells together!
        const targets = selectedMonths.size > 1 && selectedMonths.has(mIdx)
          ? getSelectedIndices()
          : [mIdx];
        if (
          pickerState &&
          pickerState.targetIndices.length === targets.length &&
          pickerState.targetIndices[0] === targets[0]
        ) {
          pickerState = null;
        } else {
          pickerState = {
            targetIndices: targets,
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

    document.getElementById('renewal-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-renewal]');
      if (!btn) return;
      state.ultraRenewalMode = btn.dataset.renewal;
      render();
    });

    document.getElementById('inp-ultra-cny').addEventListener('input', (e) => {
      state.currentUltraCny = Math.max(0, Number(e.target.value) || 0);
      render();
    });

    document.getElementById('inp-fail-month').addEventListener('input', (e) => {
      state.ultraFailMonthIndex = Number(e.target.value);
      render();
    });

    document.getElementById('inp-fallback-strategy').addEventListener('change', (e) => {
      state.fallbackUltraStrategy = e.target.value;
      render();
    });

    document.getElementById('inp-music-cny').addEventListener('input', (e) => {
      state.musicMonthlyCny = Math.max(0, Number(e.target.value) || 0);
      render();
    });

    document.getElementById('inp-colab-cny').addEventListener('input', (e) => {
      state.colabProMonthlyCny = Math.max(0, Number(e.target.value) || 0);
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
      const lines = (lang === 'en-US'
        ? [
            '[Do You Really Need Gemini Pro Black Friday?]',
            `- Verdict: ${res.verdict.badge} (${res.verdict.headline})`,
            `- BF Annual Cost: ${fmtYen(res.bfCost)}/yr (¥${res.bfMonthlyAvg.toFixed(1)}/mo)`,
            `- Idle Period: ${res.totalIdleMonths} mo (Other Plan ${res.ultraOverlapMonths}m, ~${fmtYen(res.totalIdleCostCny)} amortized)`,
            `- Break-Even: ${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) + ' mo' : 'Cannot break even'} (avg ¥${Math.round(res.avgProPrice)}/mo)`,
            `- Expected Value (EV): ${fmtYen(res.expectedNetSavings, true)} (Your ${state.retainProbPct}% vs Break-even ${res.breakEvenProbPct.toFixed(1)}%)`,
            `- Upside / Downside: ${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`,
          ]
        : [
            '【AI 黑五包年决策账本】',
            `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
            `- 黑五成本：${fmtYen(res.bfCost)}/年（¥${res.bfMonthlyAvg.toFixed(1)}/月）`,
            `- 黑五空闲期：${res.totalIdleMonths} 个月（致空闲 Plan ${res.ultraOverlapMonths} 月，折合摊销 ${fmtYen(res.ultraIdleCostCny)}）`,
            `- 实际回本：${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) + ' 个月' : '无法回本'}（月均平替价值 ¥${Math.round(res.avgProPrice)}/月）`,
            `- 期望净收益 (EV)：${fmtYen(res.expectedNetSavings, true)}（把握 ${state.retainProbPct}% vs 盈亏线 ${res.breakEvenProbPct.toFixed(1)}%）`,
            `- 最大赢 / 最大亏：${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`,
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
