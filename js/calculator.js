(function (root, factory) {
  let data;
  if (typeof module !== 'undefined' && module.exports) {
    data = require('./data.js');
    const api = factory(data);
    module.exports = api;
    root.SubLedgerCalc = api;
  } else {
    root.SubLedgerCalc = factory(root.SubLedgerData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (data) {
  const {
    BF_DEAL_PRESETS,
    DEFAULT_FX_ANNUAL_PCT,
    FX_BASE_CNY_PER_UNIT,
    FX_RATES,
    MONTHS,
    SUB_CATALOG,
  } = data;

  /**
   * Convert legacy TRY/CNY annual increase rate (e.g. +22%) into unified
   * bidirectional cnyPerUnit annual change % (e.g. -18.03%).
   */
  function legacyTryDepToAnnualPct(tryAnnualDepRate) {
    const dep = Math.max(0, Number(tryAnnualDepRate) || 0);
    return (1 / (1 + dep / 100) - 1) * 100;
  }

  /**
   * Build normalized { TRY, JPY, HKD, TWD, USD } annual change % map from state.
   * Positive % = foreign currency appreciates vs CNY (monthly bills cost more CNY).
   * Negative % = foreign currency depreciates vs CNY (monthly bills cost less CNY).
   */
  function resolveFxAnnualMap(stateOrFx) {
    const out = Object.assign({}, DEFAULT_FX_ANNUAL_PCT);
    if (typeof stateOrFx === 'number') {
      out.TRY = legacyTryDepToAnnualPct(stateOrFx);
      return out;
    }
    if (!stateOrFx || typeof stateOrFx !== 'object') return out;
    if (stateOrFx.fxAnnualChangePct && typeof stateOrFx.fxAnnualChangePct === 'object') {
      Object.keys(out).forEach((code) => {
        const v = stateOrFx.fxAnnualChangePct[code];
        if (v != null && Number.isFinite(Number(v))) {
          out[code] = Number(v);
        }
      });
      return out;
    }
    const hasCurrencyKey = Object.keys(out).some((code) => stateOrFx[code] != null);
    if (hasCurrencyKey) {
      Object.keys(out).forEach((code) => {
        if (stateOrFx[code] != null && Number.isFinite(Number(stateOrFx[code]))) {
          out[code] = Number(stateOrFx[code]);
        }
      });
      return out;
    }
    if (stateOrFx.tryAnnualDepRate != null) {
      out.TRY = legacyTryDepToAnnualPct(stateOrFx.tryAnnualDepRate);
    }
    return out;
  }

  /**
   * Unified monthly FX formula:
   *   FX(c, t) = FX(c, 0) * (1 + r)^(t / 12)
   * where t = 0 for today's upfront Black Friday purchase (locked at spot rate).
   */
  function getCnyPerUnit(currency, offsetMonths, fxArg) {
    const code = currency || 'CNY';
    if (code === 'CNY') return 1;
    const base = FX_BASE_CNY_PER_UNIT[code];
    if (!base) return 1;
    const t = Math.max(0, Number(offsetMonths) || 0);
    if (t === 0) return base;
    const fxMap = resolveFxAnnualMap(fxArg);
    const pct = fxMap[code] != null ? fxMap[code] : 0;
    const r = Math.max(-0.95, pct / 100);
    return base * Math.pow(1 + r, t / 12);
  }

  function getTryRateAtOffset(offsetMonths, fxArg) {
    const cnyPerTry = getCnyPerUnit('TRY', offsetMonths, fxArg);
    return cnyPerTry > 0 ? 1 / cnyPerTry : FX_RATES.TRY_PER_CNY;
  }

  function convertToCny(amount, currency, offsetMonths, fxArg) {
    const val = Math.max(0, Number(amount) || 0);
    return val * getCnyPerUnit(currency || 'CNY', offsetMonths || 0, fxArg);
  }

  function getRegionMonthlyProSpec(state) {
    const preset = state && BF_DEAL_PRESETS[state.bfPreset];
    const catalogId = (preset && preset.defaultMonthlyProId)
      || (state && state.monthlyProRegion === 'jp' ? 'gemini_pro_jp' : 'gemini_pro_tr');
    return SUB_CATALOG.find((c) => c.id === catalogId) || SUB_CATALOG.find((c) => c.id === 'gemini_pro_tr');
  }

  function getMonthlyProCny(monthIndex, state) {
    const offset = MONTHS[monthIndex].offsetFromNow;
    const fxMap = resolveFxAnnualMap(state);
    if (state.monthlyProRegion === 'jp' || state.bfPreset === 'jp_web') {
      const jpy = state.monthlyProRegion === 'jp' ? (state.monthlyProBaseJpy || 2900) : 2900;
      return convertToCny(jpy, 'JPY', offset, fxMap);
    }
    const spec = getRegionMonthlyProSpec(state);
    if (spec && spec.currency !== 'TRY') {
      return convertToCny(spec.amount, spec.currency, offset, fxMap);
    }
    const baseTry = state.monthlyProBaseTry || 870;
    if (state.googleMidYearHike && monthIndex >= 6) {
      const baseFx = getCnyPerUnit('TRY', 0, fxMap);
      const juneFx = getCnyPerUnit('TRY', MONTHS[6].offsetFromNow, fxMap);
      const hikeMult = Math.max(1, baseFx / juneFx);
      return baseTry * hikeMult * getCnyPerUnit('TRY', offset, fxMap);
    }
    return convertToCny(baseTry, 'TRY', offset, fxMap);
  }

  /**
   * Unified SOTA cutoff K (0..12 months from Step 2 start) and next-gen window start.
   * Ensures model lifecycle phases, downside branch D, scenarios, and EV all share ONE cutoff!
   */
  function getLifecycleCutoffs(state) {
    const launched = Math.max(0, Number(state.monthsSinceLaunch) || 0);
    const sotaLen = Math.max(1, Number(state.effectiveSotaMonths) || 7);
    const nextInterval = Math.max(2, Number(state.nextFlagshipInterval) || 10);
    const sotaCutoff = Math.min(12, Math.max(0, Math.round(sotaLen - launched)));
    const nextGenCutoff = Math.min(12, Math.max(0, Math.round(nextInterval - launched - 1)));
    return { launched, sotaLen, nextInterval, sotaCutoff, nextGenCutoff };
  }

  function getModelPhase(monthIndex, state) {
    const { launched, sotaCutoff, nextInterval } = getLifecycleCutoffs(state);
    const elapsed = launched + monthIndex + 1;
    const monthNum = monthIndex + 1;

    if (elapsed >= nextInterval) {
      return { key: 'next_gen', label: '新旗舰窗口', tone: 'green' };
    }
    // Constrain honeymoon strictly within sotaCutoff so setting SOTA=1 never shows Month 2-3 as honeymoon
    if (monthNum <= Math.min(3, sotaCutoff)) {
      return { key: 'honeymoon', label: '蜜月领先期', tone: 'dark' };
    }
    if (monthNum <= sotaCutoff) {
      return { key: 'steady', label: '第一梯队稳态', tone: 'blue' };
    }
    return { key: 'risk', label: '空窗/掉队风险', tone: 'amber' };
  }

  /**
   * Pure single-source-of-truth item pricing directly from Step 2 table (no hidden Step 3 overrides!).
   */
  function getItemUnitPrice(item, monthIndex, state) {
    const offset = MONTHS[monthIndex].offsetFromNow;
    const fxMap = resolveFxAnnualMap(state);
    if (item.dynamicPrice === 'gemini_ultra_5x') {
      const impliedTry = (Math.max(0, Number(state.currentUltraCny) || 265)) * FX_RATES.TRY_PER_CNY;
      return convertToCny(impliedTry, 'TRY', offset, fxMap);
    }
    const currency = item.currency || 'CNY';
    const rawAmount = Math.max(0, Number(item.amount != null ? item.amount : item.priceCny) || 0);
    if (currency === 'TRY' && item.midYearHike && monthIndex >= 6) {
      const baseFx = getCnyPerUnit('TRY', 0, fxMap);
      const juneFx = getCnyPerUnit('TRY', MONTHS[6].offsetFromNow, fxMap);
      const hikeMult = Math.max(1, baseFx / juneFx);
      return rawAmount * hikeMult * getCnyPerUnit('TRY', offset, fxMap);
    }
    return convertToCny(rawAmount, currency, offset, fxMap);
  }

  function resolveMonthPlanPair(state) {
    let plansA;
    if (Array.isArray(state.monthPlans) && state.monthPlans.length === 12) {
      plansA = state.monthPlans;
    } else {
      const legacy = Array.isArray(state.months) ? state.months : [];
      const { makeSubItem } = data;
      plansA = MONTHS.map((_, i) => {
        const m = legacy[i] || 'none';
        if (m === 'ultra') return [makeSubItem('ultra_idle', 1)];
        if (m === 'pro1') return [makeSubItem('gemini_pro_tr', 1)];
        if (m === 'pro2') return [makeSubItem('gemini_pro_tr', 2)];
        return [];
      });
    }

    const hasExplicitB =
      Array.isArray(state.buyMonthPlans) &&
      state.buyMonthPlans.length === 12 &&
      Array.isArray(state.buyMonthSynced) &&
      state.buyMonthSynced.length === 12;

    if (hasExplicitB) {
      const plansB = MONTHS.map((_, i) =>
        state.buyMonthSynced[i]
          ? data.deriveSyncedBuyBasket(plansA[i])
          : (Array.isArray(state.buyMonthPlans[i]) ? state.buyMonthPlans[i] : [])
      );
      return {
        plansA,
        plansB,
        synced: state.buyMonthSynced.map(Boolean),
      };
    }

    // Backward-compatible derivation for legacy states or unit tests that only set monthPlans
    const derived = data.deriveDefaultBuyPlans(plansA);
    return {
      plansA,
      plansB: derived.buyMonthPlans,
      synced: derived.buyMonthSynced,
    };
  }

  /**
   * Unified 12-month simulation engine.
   * For any cutoff in [0..12]:
   *   - Up to month `cutoff` (inclusive, 1-indexed): Black Friday Pro replaces marked replaceable items.
   *   - After month `cutoff`: Black Friday Pro stops replacing subscriptions (both columns pay the same baseline).
   * Guarantees:
   *   - simulate(12) === full base ledger (U)
   *   - simulate(K)  === SOTA cutoff downside branch (D)
   *   - simulate(0)  === pure upfront sunk-cost floor (-bfCost)
   */
  function simulateCutoff(baseRows, bfCost, cutoffMonths) {
    const limit = Math.min(12, Math.max(0, Math.round(cutoffMonths)));
    let buyTotal = bfCost;
    let skipTotal = 0;
    for (let i = 0; i < baseRows.length; i++) {
      const r = baseRows[i];
      skipTotal += r.skipMonthFlow;
      if (i < limit) {
        buyTotal += r.buyMonthFlow;
      } else {
        // After cutoff, BF Pro is no longer used to replace baseline subscriptions
        buyTotal += r.skipMonthFlow;
      }
    }
    return {
      cutoff: limit,
      buyTotal,
      skipTotal,
      diff: skipTotal - buyTotal,
    };
  }

  function buildComparisonScenarios(baseRows, bfCost, cutoffs, lang, retainProbPct) {
    const isEn = lang === 'en-US';
    const { sotaCutoff, nextGenCutoff } = cutoffs;
    const wU = Math.min(100, Math.max(0, Math.round(Number(retainProbPct) || 0)));
    const wD = 100 - wU;

    const s0 = simulateCutoff(baseRows, bfCost, 0);
    const sK = simulateCutoff(baseRows, bfCost, sotaCutoff);
    const sNext = simulateCutoff(baseRows, bfCost, nextGenCutoff);
    const sFull = simulateCutoff(baseRows, bfCost, 12);

    const sotaEndLabel = sotaCutoff > 0
      ? (isEn ? `Mo 1–${sotaCutoff}` : `前 ${sotaCutoff} 个月`)
      : (isEn ? '0 months' : '0 个月');
    const nextEndLabel = nextGenCutoff > 0
      ? (isEn ? `Mo 1–${nextGenCutoff}` : `前 ${nextGenCutoff} 个月`)
      : (isEn ? '0 months' : '0 个月');

    const afterSotaLabel = sotaCutoff < 12
      ? (isEn
          ? `Reverts to Plan A after Mo ${sotaCutoff} · ${wD}% weight in EV`
          : `第 ${sotaCutoff + 1} 月起改回方案 A · 按 ${wD}% 弃用概率计入上方期望`)
      : (isEn
          ? `Full 12 months within SOTA span · ${wD}% weight in EV`
          : `全年均在主力期内 · 按 ${wD}% 权重计入上方期望`);

    return [
      {
        id: 'immediate_stop',
        title: isEn ? 'Worst Case: Abandoned Immediately (0 mo)' : '极端情况：买完即弃用（0 个月）',
        periodNote: isEn ? 'Plan unused from Month 1; upfront fee lost' : '计划完全落空，白花今日预付年费',
        tag: isEn ? 'Floor' : '风控底线',
        tone: 'red',
        buyTotal: s0.buyTotal,
        skipTotal: s0.skipTotal,
        diff: s0.diff,
      },
      {
        id: 'sota_cutoff',
        title: isEn
          ? `Drop After SOTA Span (Active ${sotaEndLabel})`
          : `主力期后弃用（仅生效${sotaEndLabel}）`,
        periodNote: afterSotaLabel,
        tag: isEn ? `${wD}% Weight` : `${wD}% 权重`,
        tone: 'amber',
        buyTotal: sK.buyTotal,
        skipTotal: sK.skipTotal,
        diff: sK.diff,
      },
      {
        id: 'next_gen_review',
        title: isEn
          ? `Hold Until Next-Gen Launch (Active ${nextEndLabel})`
          : `撑到下代旗舰前（生效${nextEndLabel}）`,
        periodNote: isEn ? `Follows Plan B until est. next Gemini SOTA (${nextEndLabel})` : `下代 Gemini SOTA 发布前按方案 B 执行（第 ${nextGenCutoff} 月止）`,
        tag: isEn ? 'Review' : '复评节点',
        tone: 'blue',
        buyTotal: sNext.buyTotal,
        skipTotal: sNext.skipTotal,
        diff: sNext.diff,
      },
      {
        id: 'full_plan',
        title: isEn ? 'Full 12-Month Plan Executed · Baseline' : '按第 3 步计划执行满全年（12 个月 · 基准）',
        periodNote: isEn
          ? `Executes your Step 3 plan in full · ${wU}% retention weight in EV`
          : `完整执行你填写的 12 个月方案 · 按 ${wU}% 留存把握计入上方期望`,
        tag: isEn ? `${wU}% Weight` : `${wU}% 权重`,
        tone: 'green',
        isBaseline: true,
        buyTotal: sFull.buyTotal,
        skipTotal: sFull.skipTotal,
        diff: sFull.diff,
      },
    ];
  }

  /**
   * Build a compact 3x3 sensitivity matrix: Retention Prob (p - 10, p, p + 10)
   * x Primary Active Foreign Currency FX (-5pp, 0, +5pp).
   */
  function buildSensitivityMatrix(state, activeFxCurrencies) {
    const baseP = Math.min(100, Math.max(0, Math.round(Number(state.retainProbPct) || 0)));
    const pCols = [
      Math.max(0, baseP - 10),
      baseP,
      Math.min(100, baseP + 10),
    ];
    const primaryFx = activeFxCurrencies && activeFxCurrencies.length > 0 ? activeFxCurrencies[0] : null;
    if (!primaryFx) {
      return {
        primaryCurrency: null,
        pCols,
        rows: [],
      };
    }
    const code = primaryFx.currency;
    const basePct = Math.round(primaryFx.annualPct);
    const fxOffsets = [-5, 0, 5];
    const rows = fxOffsets.map((delta) => {
      const fxPct = Math.max(-90, basePct + delta);
      const cells = pCols.map((pVal) => {
        const patched = Object.assign({}, state, {
          retainProbPct: pVal,
          fxAnnualChangePct: Object.assign({}, resolveFxAnnualMap(state), { [code]: fxPct }),
        });
        const sub = computeCoreLedger(patched);
        return {
          pVal,
          fxPct,
          ev: sub.expectedNetSavings,
          isCenter: delta === 0 && pVal === baseP,
        };
      });
      return { delta, fxPct, cells };
    });
    return {
      primaryCurrency: code,
      pCols,
      rows,
    };
  }

  function computeCoreLedger(state) {
    const fxMap = resolveFxAnnualMap(state);
    // Today's upfront Black Friday cost (t = 0) is strictly locked at spot FX
    const bfCost = Math.max(0, Number(state.bfCostCny) || 0);
    const { plansA, plansB, synced } = resolveMonthPlanPair(state);
    const cutoffs = getLifecycleCutoffs(state);

    const monthlyRows = [];
    let cumBuy = bfCost;
    let cumSkip = 0;

    let proCoveredMonths = 0;
    let keptOtherPlanMonths = 0;
    let emptyMonths = 0;
    let totalProValueSaved = 0;
    let totalOtherSubsAnnual = 0;
    let crossoverMonthIndex = null;
    let hasLegacyTurkeyUltra = false;

    const fxUsageMap = {};
    function recordFxUsage(currency, monthIndex, baseCnyAmount) {
      if (!currency || currency === 'CNY' || !(baseCnyAmount > 0)) return;
      if (!fxUsageMap[currency]) {
        fxUsageMap[currency] = { currency, monthSet: new Set(), baseAnnualCny: 0 };
      }
      fxUsageMap[currency].monthSet.add(monthIndex);
      fxUsageMap[currency].baseAnnualCny += baseCnyAmount;
    }

    function resolveBasket(rawItems, monthIndex) {
      const list = Array.isArray(rawItems) ? rawItems : [];
      let total = 0;
      const resolved = list
        .filter((item) => item && item.id !== 'none_idle')
        .map((item) => {
          const qty = Math.max(1, Number(item.qty) || 1);
          const isLegacyUltra = item.dynamicPrice === 'gemini_ultra_5x' || item.id === 'ultra_idle';
          if (isLegacyUltra) hasLegacyTurkeyUltra = true;
          const unit = getItemUnitPrice(item, monthIndex, state);
          const effCurrency = item.dynamicPrice === 'gemini_ultra_5x' ? 'TRY' : (item.currency || 'CNY');
          const baseUnit = item.dynamicPrice === 'gemini_ultra_5x'
            ? Math.max(0, Number(state.currentUltraCny) || 265)
            : convertToCny(item.amount != null ? item.amount : item.priceCny || 0, effCurrency, 0, fxMap);
          recordFxUsage(effCurrency, monthIndex, baseUnit * qty);
          total += unit * qty;
          return Object.assign({}, item, {
            qty,
            unitCny: unit,
            subtotalCny: unit * qty,
          });
        });
      return { resolved, total };
    }

    for (let i = 0; i < MONTHS.length; i++) {
      const proUnit = getMonthlyProCny(i, state);
      const phase = getModelPhase(i, state);
      const tryRate = getTryRateAtOffset(MONTHS[i].offsetFromNow, fxMap);

      const basketA = resolveBasket(plansA[i], i);
      const basketB = resolveBasket(plansB[i], i);

      const skipMonthFlow = basketA.total; // A_t (Without BF)
      const buyMonthFlow = basketB.total;  // B_t (Additional spend With BF)
      const monthDiff = skipMonthFlow - buyMonthFlow; // A_t - B_t

      const isSynced = Boolean(synced[i]);
      const hasAnyItems = basketA.resolved.length > 0 || basketB.resolved.length > 0;
      const hasKeptPlan = hasAnyItems && monthDiff <= 0.01;

      if (monthDiff > 0.01) {
        proCoveredMonths += 1;
      } else if (hasAnyItems) {
        keptOtherPlanMonths += 1;
      } else {
        emptyMonths += 1;
      }
      totalProValueSaved += monthDiff;

      cumBuy += buyMonthFlow;
      cumSkip += skipMonthFlow;

      if (crossoverMonthIndex === null && cumSkip >= cumBuy) {
        crossoverMonthIndex = i;
      }

      monthlyRows.push({
        index: i,
        month: MONTHS[i],
        items: basketA.resolved,
        buyItems: basketB.resolved,
        buySynced: isSynced,
        replaceableSlots: monthDiff > 0.01 ? 1 : 0,
        hasUltraActive: hasKeptPlan,
        hasKeptPlan,
        tryRate,
        proUnit: monthDiff > 0.01 ? monthDiff : proUnit,
        phase,
        buyMonthFlow,
        skipMonthFlow,
        cumBuy,
        cumSkip,
        monthSavedByBf: monthDiff,
      });
    }

    const preferredCurrency = (BF_DEAL_PRESETS[state.bfPreset] && BF_DEAL_PRESETS[state.bfPreset].currency) || state.bfCurrency;
    const activeFxCurrencies = Object.values(fxUsageMap)
      .map((entry) => ({
        currency: entry.currency,
        monthsCount: entry.monthSet.size,
        baseAnnualCny: entry.baseAnnualCny,
        annualPct: fxMap[entry.currency] != null ? fxMap[entry.currency] : 0,
      }))
      .sort((a, b) => {
        if (a.currency === preferredCurrency && b.currency !== preferredCurrency) return -1;
        if (b.currency === preferredCurrency && a.currency !== preferredCurrency) return 1;
        return b.baseAnnualCny - a.baseAnnualCny;
      });

    const positiveMonthsSum = monthlyRows.reduce((s, r) => s + (r.monthSavedByBf > 0 ? r.monthSavedByBf : 0), 0);
    const avgProPrice =
      proCoveredMonths > 0
        ? positiveMonthsSum / proCoveredMonths
        : monthlyRows.reduce((s, r) => s + r.proUnit, 0) / 12;

    const equivalentUsageMonths = avgProPrice > 0 ? bfCost / avgProPrice : Infinity;

    // Unified SOTA cutoff D / U / EV math for Dual-Basket Total Cost comparison!
    const simDown = simulateCutoff(monthlyRows, bfCost, cutoffs.sotaCutoff);
    const simUp = simulateCutoff(monthlyRows, bfCost, 12);
    const downsideNet = simDown.diff; // D = sum_{t<=K}(A_t - B_t) - F
    const upsideNet = simUp.diff;     // U = sum_{t=1..12}(A_t - B_t) - F

    const p = Math.min(1, Math.max(0, Number(state.retainProbPct) / 100));
    const expectedNetSavings = downsideNet + p * (upsideNet - downsideNet);

    // Clean endpoint classification + inequality direction ('gte' when U > D, 'lte' when U < D)
    let breakEvenProbPct;
    let breakEvenProbStatus; // 'already_even' | 'impossible' | 'deterministic' | 'threshold'
    let breakEvenProbDirection; // 'gte' | 'lte' | 'none'
    if (Math.abs(upsideNet - downsideNet) < 0.01) {
      breakEvenProbStatus = 'deterministic';
      breakEvenProbPct = upsideNet >= 0 ? 0 : null;
      breakEvenProbDirection = 'none';
    } else if (downsideNet >= 0 && upsideNet >= 0) {
      breakEvenProbStatus = 'already_even';
      breakEvenProbPct = 0;
      breakEvenProbDirection = 'none';
    } else if (downsideNet < 0 && upsideNet < 0) {
      breakEvenProbStatus = 'impossible';
      breakEvenProbPct = null;
      breakEvenProbDirection = 'none';
    } else {
      breakEvenProbStatus = 'threshold';
      breakEvenProbPct = Math.min(100, Math.max(0, (-downsideNet / (upsideNet - downsideNet)) * 100));
      breakEvenProbDirection = upsideNet > downsideNet ? 'gte' : 'lte';
    }

    return {
      bfCost,
      bfMonthlyAvg: bfCost / 12,
      avgProPrice,
      breakEvenMonths: equivalentUsageMonths,
      equivalentUsageMonths,
      proCoveredMonths,
      ultraOverlapMonths: keptOtherPlanMonths,
      keptOtherPlanMonths,
      idleNoneMonths: emptyMonths,
      totalIdleMonths: keptOtherPlanMonths + emptyMonths,
      ultraIdleCostCny: (bfCost * keptOtherPlanMonths) / 12,
      totalIdleCostCny: (bfCost * (keptOtherPlanMonths + emptyMonths)) / 12,
      totalProValueSaved,
      totalOtherSubsAnnual,
      totalBuyCost: cumBuy,
      totalSkipCost: cumSkip,
      fullPlanNetSavings: upsideNet,
      upsideNet,
      downsideNet,
      expectedNetSavings,
      evReturnPct: bfCost > 0 ? (expectedNetSavings / bfCost) * 100 : 0,
      breakEvenProbPct,
      breakEvenProbStatus,
      breakEvenProbDirection,
      sotaCutoff: cutoffs.sotaCutoff,
      nextGenCutoff: cutoffs.nextGenCutoff,
      crossoverMonthIndex,
      hasLegacyTurkeyUltra,
      needsLegacyUltraRenewal: false,
      activeFxCurrencies,
      fxAnnualMap: fxMap,
      monthlyRows,
    };
  }

  function calculateLedger(state, lang, displayCurrency) {
    const isEn = lang === 'en-US';
    const cur = displayCurrency || (isEn ? 'USD' : 'CNY');
    const div = cur === 'USD' ? FX_RATES.CNY_PER_USD : 1;
    const sym = cur === 'USD' ? '$' : '¥';
    const fmtM = (cnyVal) => `${sym}${Math.abs(Math.round(cnyVal / div)).toLocaleString('en-US')}`;
    const fmtSignedM = (cnyVal) => {
      const v = Math.round(cnyVal / div);
      if (v === 0) return `${sym}0`;
      return `${v > 0 ? '+' : '-'}${sym}${Math.abs(v).toLocaleString('en-US')}`;
    };

    const core = computeCoreLedger(state);
    const cutoffs = getLifecycleCutoffs(state);
    const scenarios = buildComparisonScenarios(core.monthlyRows, core.bfCost, cutoffs, lang, state.retainProbPct);
    const sensitivity = buildSensitivityMatrix(state, core.activeFxCurrencies);

    const pPct = Number(state.retainProbPct) || 0;
    const { upsideNet, downsideNet, expectedNetSavings, breakEvenProbPct, proCoveredMonths, totalProValueSaved, bfCost } = core;

    let verdict;
    if (upsideNet < 0 && downsideNet < 0) {
      verdict = isEn
        ? {
            level: 'skip',
            badge: 'Skip Deal',
            tone: 'red',
            headline: 'Total spend is lower without Black Friday across all paths',
            detail: `Plan B reduces monthly bills by ${fmtM(totalProValueSaved)} across ${proCoveredMonths} months, below the ${fmtM(bfCost)} upfront annual fee.`,
          }
        : {
            level: 'skip',
            badge: '建议跳过',
            tone: 'red',
            headline: '按当前双方案排布，不买黑五总花费更低',
            detail: `方案 B 全年共减少月付支出 ${fmtM(totalProValueSaved)}（涉及 ${proCoveredMonths} 个月），低于今日黑五预付 ${fmtM(bfCost)}。`,
          };
    } else if (downsideNet >= 0 && upsideNet >= 0 && expectedNetSavings >= 40) {
      verdict = isEn
        ? {
            level: 'buy',
            badge: 'Worth Buying',
            tone: 'green',
            headline: `Already breaks even within SOTA span (${fmtSignedM(downsideNet)} downside floor)`,
            detail: `Even if you revert to Plan A after Month ${core.sotaCutoff}, you stay net positive; full Plan B saves ${fmtM(upsideNet)} with EV ${fmtSignedM(expectedNetSavings)}.`,
          }
        : {
            level: 'buy',
            badge: '值得入手',
            tone: 'green',
            headline: `主力期内即可锁定回本（下行底线已达 ${fmtSignedM(downsideNet)}）`,
            detail: `即便第 ${core.sotaCutoff} 个月后回退回方案 A 依然不亏；全年执行方案 B 净省 ${fmtM(upsideNet)}，期望净节省 ${fmtSignedM(expectedNetSavings)}。`,
          };
    } else if (expectedNetSavings >= 40) {
      const lineStr = breakEvenProbPct != null ? `${breakEvenProbPct.toFixed(1)}%` : '0%';
      const cmpZh = core.breakEvenProbDirection === 'lte' ? '低于上限' : '高于盈亏线';
      const cmpEn = core.breakEvenProbDirection === 'lte' ? 'stays under' : 'clears';
      verdict = isEn
        ? {
            level: 'buy',
            badge: 'Worth Buying',
            tone: 'green',
            headline: `Positive EV: Confidence (${pPct}%) ${cmpEn} break-even (${lineStr})`,
            detail: `Plan A totals ${fmtM(core.totalSkipCost)} vs Plan B ${fmtM(core.totalBuyCost)} (incl. upfront); EV is ${fmtSignedM(expectedNetSavings)}.`,
          }
        : {
            level: 'buy',
            badge: '值得入手',
            tone: 'green',
            headline: `正期望交易：留存把握（${pPct}%）${cmpZh}（${lineStr}）`,
            detail: `方案 A 全年总计 ${fmtM(core.totalSkipCost)}，方案 B 含预付总计 ${fmtM(core.totalBuyCost)}；计入留存权重后期望净节省 ${fmtSignedM(expectedNetSavings)}。`,
          };
    } else if (expectedNetSavings >= -40) {
      const lineStr = breakEvenProbPct != null ? `${breakEvenProbPct.toFixed(1)}%` : '—';
      verdict = isEn
        ? {
            level: 'neutral',
            badge: 'Borderline · Wait',
            tone: 'amber',
            headline: `Near break-even: Expected net value is ${fmtSignedM(expectedNetSavings)}`,
            detail: `Break-even sits at ${lineStr} retention confidence. Staying on Plan A avoids locking ${fmtM(bfCost)} upfront.`,
          }
        : {
            level: 'neutral',
            badge: '接近打平 · 谨慎观望',
            tone: 'amber',
            headline: `赔率接近五五开：期望净节省 ${fmtSignedM(expectedNetSavings)}`,
            detail: `盈亏平衡线为 ${lineStr}；不想提前锁定 ${fmtM(bfCost)} 预付成本的话，保留方案 A 按月随用随买更灵活。`,
          };
    } else {
      const lineStr = breakEvenProbPct != null ? `${breakEvenProbPct.toFixed(1)}%` : '100%';
      verdict = isEn
        ? {
            level: 'skip',
            badge: 'Negative EV · Skip',
            tone: 'red',
            headline: `Downside outweighs upside: EV is ${fmtSignedM(expectedNetSavings)}`,
            detail: `Break-even sits at ${lineStr} vs your ${pPct}%. Full Plan B yields ${fmtSignedM(upsideNet)}, while stopping after Month ${core.sotaCutoff} yields ${fmtSignedM(downsideNet)}.`,
          }
        : {
            level: 'skip',
            badge: '赔率倒挂 · 建议跳过',
            tone: 'red',
            headline: `风险大于收益：期望净节省 ${fmtSignedM(expectedNetSavings)}`,
            detail: `盈亏线为 ${lineStr}（当前把握 ${pPct}%）；全年执行方案 B 为 ${fmtSignedM(upsideNet)}，第 ${core.sotaCutoff} 月后回退为 ${fmtSignedM(downsideNet)}。`,
          };
    }

    return Object.assign(core, {
      displayCurrency: cur,
      scenarios,
      sensitivity,
      verdict,
    });
  }

  return {
    legacyTryDepToAnnualPct,
    resolveFxAnnualMap,
    getCnyPerUnit,
    getTryRateAtOffset,
    convertToCny,
    getMonthlyProCny,
    getLifecycleCutoffs,
    getModelPhase,
    getItemUnitPrice,
    simulateCutoff,
    calculateLedger,
  };
});
