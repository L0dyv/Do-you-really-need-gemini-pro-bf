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
    const nextGenStartMonth = Math.max(1, Math.round(nextInterval - launched)); // 1-indexed month when next SOTA arrives
    const nextGenInTerm = nextGenStartMonth <= 12;
    const nextGenCutoff = Math.min(12, Math.max(0, nextGenStartMonth - 1));
    const maxPostSotaExtra = Math.max(0, 12 - sotaCutoff);
    let postSotaExtraMonths;
    if (state.postSotaExtraMonths != null && Number.isFinite(Number(state.postSotaExtraMonths))) {
      postSotaExtraMonths = Math.min(maxPostSotaExtra, Math.max(0, Math.round(Number(state.postSotaExtraMonths))));
    } else if (state.retainProbPct != null && Number.isFinite(Number(state.retainProbPct))) {
      const legacyP = Math.min(100, Math.max(0, Number(state.retainProbPct))) / 100;
      postSotaExtraMonths = Math.min(maxPostSotaExtra, Math.max(0, Math.round(legacyP * maxPostSotaExtra)));
    } else {
      postSotaExtraMonths = Math.min(maxPostSotaExtra, 3);
    }
    const willingEndMonth = Math.min(12, sotaCutoff + postSotaExtraMonths);

    // 12-month active mask: current SOTA + willing post-SOTA months + next-gen SOTA if inside 12-mo term
    const expectedActiveMask = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      if (m <= sotaCutoff) return true;
      if (m <= willingEndMonth) return true;
      if (nextGenInTerm && m >= nextGenStartMonth) return true;
      return false;
    });

    const nextGenActiveMonths = nextGenInTerm ? Math.max(0, 12 - nextGenStartMonth + 1) : 0;
    const firstWaveCap = nextGenInTerm ? Math.min(willingEndMonth, nextGenStartMonth - 1) : willingEndMonth;
    const sotaActiveMonths = Math.min(sotaCutoff, firstWaveCap);
    const postSotaUsedMonths = Math.max(0, firstWaveCap - sotaActiveMonths);
    const expectedActiveMonths = expectedActiveMask.filter(Boolean).length;
    const gapInactiveMonths = 12 - expectedActiveMonths;

    return {
      launched,
      sotaLen,
      nextInterval,
      sotaCutoff,
      nextGenStartMonth,
      nextGenInTerm,
      nextGenCutoff,
      maxPostSotaExtra,
      rawPostSotaExtra: postSotaExtraMonths,
      postSotaExtraMonths,
      willingEndMonth,
      sotaActiveMonths,
      postSotaUsedMonths,
      nextGenActiveMonths,
      gapInactiveMonths,
      expectedActiveMask,
      expectedActiveMonths,
    };
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
      return { key: 'honeymoon', label: 'SOTA 领先期', tone: 'dark' };
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
  function simulateActiveMask(baseRows, bfCost, activeMask) {
    let buyTotal = bfCost;
    let skipTotal = 0;
    let activeCount = 0;
    for (let i = 0; i < baseRows.length; i++) {
      const r = baseRows[i];
      skipTotal += r.skipMonthFlow;
      if (activeMask && activeMask[i]) {
        buyTotal += r.buyMonthFlow;
        activeCount += 1;
      } else {
        buyTotal += r.skipMonthFlow;
      }
    }
    return {
      activeCount,
      buyTotal,
      skipTotal,
      diff: skipTotal - buyTotal,
    };
  }

  function simulateCutoff(baseRows, bfCost, cutoffMonths) {
    const limit = Math.min(12, Math.max(0, Math.round(cutoffMonths)));
    const mask = baseRows.map((_, i) => i < limit);
    const res = simulateActiveMask(baseRows, bfCost, mask);
    return {
      cutoff: limit,
      buyTotal: res.buyTotal,
      skipTotal: res.skipTotal,
      diff: res.diff,
    };
  }

  function buildComparisonScenarios(baseRows, bfCost, cutoffs, lang) {
    const isEn = lang === 'en-US';
    const { sotaCutoff, nextGenCutoff } = cutoffs;

    const s0 = simulateCutoff(baseRows, bfCost, 0);
    const sK = simulateCutoff(baseRows, bfCost, sotaCutoff);
    const sNext = simulateCutoff(baseRows, bfCost, nextGenCutoff);
    const sFull = simulateCutoff(baseRows, bfCost, 12);

    return [
      {
        id: 'immediate_stop',
        cutoff: 0,
        title: isEn ? '0 mo' : '0 个月',
        periodNote: isEn ? 'Immediate drop' : '买完弃用',
        tag: isEn ? 'Floor' : '底线',
        tone: 'red',
        buyTotal: s0.buyTotal,
        skipTotal: s0.skipTotal,
        diff: s0.diff,
      },
      {
        id: 'sota_cutoff',
        cutoff: sotaCutoff,
        title: isEn ? `First ${sotaCutoff} mo` : `前 ${sotaCutoff} 个月`,
        periodNote: isEn ? 'Drop after SOTA' : 'SOTA 止即停',
        tag: isEn ? 'SOTA' : 'SOTA',
        tone: 'amber',
        buyTotal: sK.buyTotal,
        skipTotal: sK.skipTotal,
        diff: sK.diff,
      },
      {
        id: 'next_gen_review',
        cutoff: nextGenCutoff,
        title: isEn ? `First ${nextGenCutoff} mo` : `前 ${nextGenCutoff} 个月`,
        periodNote: isEn ? 'Pre-next SOTA' : '下代 SOTA 前',
        tag: isEn ? 'Review' : '复评',
        tone: 'blue',
        buyTotal: sNext.buyTotal,
        skipTotal: sNext.skipTotal,
        diff: sNext.diff,
      },
      {
        id: 'full_plan',
        cutoff: 12,
        title: isEn ? 'All 12 mo' : '全年 12 个月',
        periodNote: isEn ? 'Full Plan B' : '完整执行方案 B',
        tag: isEn ? 'Full' : '全年',
        tone: 'green',
        isBaseline: true,
        buyTotal: sFull.buyTotal,
        skipTotal: sFull.skipTotal,
        diff: sFull.diff,
      },
    ];
  }

  /**
   * Build a compact 3x3 sensitivity matrix: SOTA Duration (K - 2, K, K + 2)
   * x Primary Active Foreign Currency FX (-5pp, 0, +5pp).
   * Preserves user's post-SOTA extra months and next-gen SOTA return window in every cell!
   */
  function buildSensitivityMatrix(state, activeFxCurrencies) {
    const baseK = Math.min(12, Math.max(1, Math.round(Number(state.effectiveSotaMonths) || 7)));
    let monthCols;
    if (baseK <= 2) {
      monthCols = [1, 2, 4];
    } else if (baseK >= 11) {
      monthCols = [8, 10, 12];
    } else {
      monthCols = [baseK - 2, baseK, baseK + 2];
    }

    const primaryFx = activeFxCurrencies && activeFxCurrencies.length > 0 ? activeFxCurrencies[0] : null;
    if (!primaryFx) {
      return {
        primaryCurrency: null,
        monthCols,
        rows: [],
      };
    }
    const code = primaryFx.currency;
    const basePct = Math.round(primaryFx.annualPct);
    const fxOffsets = [-5, 0, 5];
    const rows = fxOffsets.map((delta) => {
      const fxPct = Math.max(-90, basePct + delta);
      const cells = monthCols.map((kVal) => {
        const patched = Object.assign({}, state, {
          effectiveSotaMonths: kVal,
          fxAnnualChangePct: Object.assign({}, resolveFxAnnualMap(state), { [code]: fxPct }),
        });
        const sub = computeCoreLedger(patched);
        return {
          mVal: kVal,
          fxPct,
          ev: sub.expectedNetSavings,
          isCenter: delta === 0 && kVal === baseK,
        };
      });
      return { delta, fxPct, cells };
    });
    return {
      primaryCurrency: code,
      monthCols,
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

    // Unified SOTA + Post-SOTA + Next-Gen SOTA Return Mask Math (Deterministic & Transparent)
    const simDown = simulateCutoff(monthlyRows, bfCost, cutoffs.sotaCutoff);
    const simExpected = simulateActiveMask(monthlyRows, bfCost, cutoffs.expectedActiveMask);
    const simUp = simulateCutoff(monthlyRows, bfCost, 12);
    const downsideNet = simDown.diff;            // Stopping right after current SOTA (K months)
    const expectedNetSavings = simExpected.diff; // Current SOTA + post-SOTA + next-gen SOTA inside term
    const expectedBuyCost = simExpected.buyTotal;
    const upsideNet = simUp.diff;                // Full 12 months Plan B

    // Find earliest active month m in [0..12] where cumulative net >= 0
    let breakEvenMonthNum = null;
    const startM = bfCost <= 0 ? 0 : 1;
    for (let m = startM; m <= 12; m++) {
      if (simulateCutoff(monthlyRows, bfCost, m).diff >= -0.01) {
        breakEvenMonthNum = m;
        break;
      }
    }

    let breakEvenStatus; // 'already_even' | 'impossible' | 'threshold'
    if (breakEvenMonthNum === null) {
      breakEvenStatus = 'impossible';
    } else if (breakEvenMonthNum <= cutoffs.sotaCutoff && downsideNet >= -0.01) {
      breakEvenStatus = 'already_even';
    } else {
      breakEvenStatus = 'threshold';
    }
    const monthMargin = breakEvenMonthNum != null ? cutoffs.expectedActiveMonths - breakEvenMonthNum : null;

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
      expectedBuyCost,
      fullPlanNetSavings: upsideNet,
      upsideNet,
      downsideNet,
      expectedNetSavings,
      evReturnPct: bfCost > 0 ? (expectedNetSavings / bfCost) * 100 : 0,
      breakEvenMonthNum,
      breakEvenStatus,
      monthMargin,
      sotaCutoff: cutoffs.sotaCutoff,
      nextGenStartMonth: cutoffs.nextGenStartMonth,
      nextGenInTerm: cutoffs.nextGenInTerm,
      rawPostSotaExtra: cutoffs.rawPostSotaExtra,
      postSotaExtraMonths: cutoffs.postSotaExtraMonths,
      maxPostSotaExtra: cutoffs.maxPostSotaExtra,
      willingEndMonth: cutoffs.willingEndMonth,
      sotaActiveMonths: cutoffs.sotaActiveMonths,
      postSotaUsedMonths: cutoffs.postSotaUsedMonths,
      nextGenActiveMonths: cutoffs.nextGenActiveMonths,
      gapInactiveMonths: cutoffs.gapInactiveMonths,
      expectedActiveMask: cutoffs.expectedActiveMask,
      expectedActiveMonths: cutoffs.expectedActiveMonths,
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
    const scenarios = buildComparisonScenarios(core.monthlyRows, core.bfCost, cutoffs, lang);
    const sensitivity = buildSensitivityMatrix(state, core.activeFxCurrencies);

    const {
      upsideNet,
      downsideNet,
      expectedNetSavings,
      expectedBuyCost,
      expectedActiveMonths,
      sotaActiveMonths,
      postSotaUsedMonths,
      nextGenActiveMonths,
      breakEvenMonthNum,
      breakEvenStatus,
      monthMargin,
      proCoveredMonths,
      totalProValueSaved,
      bfCost,
    } = core;

    const spanPartsZh = [
      `本次 SOTA ${sotaActiveMonths} 月`,
      postSotaUsedMonths > 0 ? `后续多用 ${postSotaUsedMonths} 月` : null,
      nextGenActiveMonths > 0 ? `下代 SOTA ${nextGenActiveMonths} 月` : null,
    ].filter(Boolean).join(' + ');
    const spanPartsEn = [
      `${sotaActiveMonths}m SOTA`,
      postSotaUsedMonths > 0 ? `${postSotaUsedMonths}m post-SOTA` : null,
      nextGenActiveMonths > 0 ? `${nextGenActiveMonths}m next SOTA` : null,
    ].filter(Boolean).join(' + ');

    let verdict;
    if (breakEvenStatus === 'impossible' && upsideNet < 0 && expectedNetSavings < 0) {
      verdict = isEn
        ? {
            level: 'skip',
            badge: 'Skip Deal',
            tone: 'red',
            headline: 'Total spend is lower without Black Friday across all 12 months',
            detail: `Plan B reduces monthly bills by ${fmtM(totalProValueSaved)} across ${proCoveredMonths} months, below the ${fmtM(bfCost)} upfront annual fee.`,
          }
        : {
            level: 'skip',
            badge: '建议跳过',
            tone: 'red',
            headline: '按当前双方案排布，全年不买黑五总花费更低',
            detail: `方案 B 全年共减少月付支出 ${fmtM(totalProValueSaved)}（涉及 ${proCoveredMonths} 个月），低于今日黑五预付 ${fmtM(bfCost)}。`,
          };
    } else if (breakEvenStatus === 'already_even' && expectedNetSavings >= 40) {
      verdict = isEn
        ? {
            level: 'buy',
            badge: 'Worth Buying',
            tone: 'green',
            headline: `Breaks even within SOTA span (${fmtSignedM(downsideNet)} by Mo ${core.sotaCutoff})`,
            detail: `Even if dropped right after Month ${core.sotaCutoff}, you stay net positive; across ${expectedActiveMonths} active months (${spanPartsEn}), you save ${fmtM(expectedNetSavings)}.`,
          }
        : {
            level: 'buy',
            badge: '值得入手',
            tone: 'green',
            headline: `SOTA 期内即可锁定回本（前 ${core.sotaCutoff} 月已省 ${fmtSignedM(downsideNet)}）`,
            detail: `即便 SOTA 结束立刻停用依然不亏；按你预期生效 ${expectedActiveMonths} 个月（${spanPartsZh}），预计净省 ${fmtM(expectedNetSavings)}。`,
          };
    } else if (expectedNetSavings >= 40) {
      const marginTxtZh = monthMargin != null && monthMargin > 0
        ? `超出回本线 +${monthMargin} 个月`
        : (breakEvenMonthNum != null ? `达到第 ${breakEvenMonthNum} 月回本线` : `生效 ${expectedActiveMonths} 个月可省`);
      const marginTxtEn = monthMargin != null && monthMargin > 0
        ? `+${monthMargin} mo past payback (Mo ${breakEvenMonthNum})`
        : (breakEvenMonthNum != null ? `clears Mo ${breakEvenMonthNum} payback` : `${expectedActiveMonths} active mo`);
      verdict = isEn
        ? {
            level: 'buy',
            badge: 'Worth Buying',
            tone: 'green',
            headline: `Expected ${expectedActiveMonths} active months save ${fmtM(expectedNetSavings)} (${marginTxtEn})`,
            detail: `Without BF totals ${fmtM(core.totalSkipCost)} vs ${fmtM(expectedBuyCost)} with BF (${spanPartsEn}).`,
          }
        : {
            level: 'buy',
            badge: '值得入手',
            tone: 'green',
            headline: `按预期生效 ${expectedActiveMonths} 个月可省 ${fmtM(expectedNetSavings)}（${marginTxtZh}）`,
            detail: `不买黑五总计 ${fmtM(core.totalSkipCost)}，按 ${spanPartsZh} 买入总支出 ${fmtM(expectedBuyCost)}，预计净省 ${fmtSignedM(expectedNetSavings)}。`,
          };
    } else if (expectedNetSavings >= -40) {
      const lineZh = breakEvenMonthNum != null ? `第 ${breakEvenMonthNum} 个月` : '12 个月内未达标';
      const lineEn = breakEvenMonthNum != null ? `Month ${breakEvenMonthNum}` : 'unreachable within 12 mo';
      verdict = isEn
        ? {
            level: 'neutral',
            badge: 'Borderline · Wait',
            tone: 'amber',
            headline: `Near break-even at ${expectedActiveMonths} active months (${fmtSignedM(expectedNetSavings)})`,
            detail: `Active span: ${spanPartsEn}. Continuous payback requires ${lineEn}; staying on Plan A avoids locking ${fmtM(bfCost)} upfront for a marginal gain.`,
          }
        : {
            level: 'neutral',
            badge: '接近打平 · 谨慎观望',
            tone: 'amber',
            headline: `按预期生效 ${expectedActiveMonths} 个月接近打平（${fmtSignedM(expectedNetSavings)}）`,
            detail: `生效区间为 ${spanPartsZh}，连续累计回本需撑到${lineZh}；收益空间很小，保留方案 A 按月随用随买更灵活，不必提前锁定 ${fmtM(bfCost)}。`,
          };
    } else {
      const gapTxtZh = breakEvenMonthNum != null
        ? `连续回本需撑到第 ${breakEvenMonthNum} 个月（当前生效 ${expectedActiveMonths} 个月：${spanPartsZh}）`
        : '即便用满全年 12 个月也未能回本';
      const gapTxtEn = breakEvenMonthNum != null
        ? `Continuous payback needs Month ${breakEvenMonthNum} (your active span is ${expectedActiveMonths} mo: ${spanPartsEn})`
        : 'Even full 12-month usage stays net negative';
      verdict = isEn
        ? {
            level: 'skip',
            badge: 'Net Loss · Skip',
            tone: 'red',
            headline: `Expected ${expectedActiveMonths} active months lose ${fmtM(expectedNetSavings)}`,
            detail: `${gapTxtEn}. Full 12-mo Plan B yields ${fmtSignedM(upsideNet)}, while dropping after Mo ${core.sotaCutoff} yields ${fmtSignedM(downsideNet)}.`,
          }
        : {
            level: 'skip',
            badge: '预计亏损 · 建议跳过',
            tone: 'red',
            headline: `按预期生效 ${expectedActiveMonths} 个月预计净亏 ${fmtM(expectedNetSavings)}`,
            detail: `${gapTxtZh}；完整执行 12 个月为 ${fmtSignedM(upsideNet)}，SOTA 第 ${core.sotaCutoff} 月止停用为 ${fmtSignedM(downsideNet)}。`,
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
    simulateActiveMask,
    simulateCutoff,
    calculateLedger,
  };
});
