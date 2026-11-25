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
   * Positive % = foreign currency appreciates vs CNY (monthly bill becomes more expensive).
   * Negative % = foreign currency depreciates vs CNY (monthly bill becomes cheaper).
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
    // Direct map passed (e.g. { JPY: 10, USD: -5 })
    const hasCurrencyKey = Object.keys(out).some((code) => stateOrFx[code] != null);
    if (hasCurrencyKey) {
      Object.keys(out).forEach((code) => {
        if (stateOrFx[code] != null && Number.isFinite(Number(stateOrFx[code]))) {
          out[code] = Number(stateOrFx[code]);
        }
      });
      return out;
    }
    // Legacy state fallback with only tryAnnualDepRate
    if (stateOrFx.tryAnnualDepRate != null) {
      out.TRY = legacyTryDepToAnnualPct(stateOrFx.tryAnnualDepRate);
    }
    return out;
  }

  /**
   * Unified monthly FX formula:
   *   FX(c, t) = FX(c, 0) * (1 + r)^(t / 12)
   * where FX(c, 0) is CNY per 1 unit of currency c, and t = 0 for today's upfront purchase.
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

  // Backward-compatible helper returning TRY per 1 CNY at offsetMonths
  function getTryRateAtOffset(offsetMonths, fxArg) {
    const cnyPerTry = getCnyPerUnit('TRY', offsetMonths, fxArg);
    return cnyPerTry > 0 ? 1 / cnyPerTry : FX_RATES.TRY_PER_CNY;
  }

  /**
   * Convert any currency amount (TRY / JPY / HKD / TWD / USD / CNY) to CNY at month offset.
   * Note: offsetMonths === 0 (today's Black Friday purchase) is always locked at spot FX(c, 0).
   */
  function convertToCny(amount, currency, offsetMonths, fxArg) {
    const val = Math.max(0, Number(amount) || 0);
    return val * getCnyPerUnit(currency || 'CNY', offsetMonths || 0, fxArg);
  }

  function getRegionMonthlyProSpec(state) {
    const preset = state && BF_DEAL_PRESETS[state.bfPreset];
    const catalogId = (preset && preset.defaultMonthlyProId)
      || (state && state.monthlyProRegion === 'jp' ? 'gemini_pro_jp' : 'gemini_pro_tr');
    const found = SUB_CATALOG.find((c) => c.id === catalogId) || SUB_CATALOG.find((c) => c.id === 'gemini_pro_tr');
    return found;
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

  function isTurkeyUltraAvailable(monthIndex, state) {
    if (state.ultraRenewalMode === 'always') return true;
    if (state.ultraRenewalMode === 'immediate_fail') return false;
    return monthIndex < Number(state.ultraFailMonthIndex);
  }

  /**
   * Resolve legacy Turkey Ultra item for a given month into its actual underlying
   * currency & amount (either legacy TRY, JP Ultra JPY, US Ultra USD, or Double Pro).
   */
  function resolveLegacyUltraCharge(monthIndex, state) {
    const fxMap = resolveFxAnnualMap(state);
    const offset = MONTHS[monthIndex].offsetFromNow;
    if (isTurkeyUltraAvailable(monthIndex, state)) {
      const impliedTry = (Math.max(0, Number(state.currentUltraCny) || 0)) * FX_RATES.TRY_PER_CNY;
      return {
        mode: 'legacy_try',
        currency: 'TRY',
        amount: impliedTry,
        unitCny: convertToCny(impliedTry, 'TRY', offset, fxMap),
        baseCny: convertToCny(impliedTry, 'TRY', 0, fxMap),
        isDoublePro: false,
      };
    }
    if (state.fallbackUltraStrategy === 'us_ultra') {
      return {
        mode: 'us_ultra',
        currency: 'USD',
        amount: 99.99,
        unitCny: convertToCny(99.99, 'USD', offset, fxMap),
        baseCny: convertToCny(99.99, 'USD', 0, fxMap),
        isDoublePro: false,
      };
    }
    if (state.fallbackUltraStrategy === 'jp_ultra') {
      return {
        mode: 'jp_ultra',
        currency: 'JPY',
        amount: 14500,
        unitCny: convertToCny(14500, 'JPY', offset, fxMap),
        baseCny: convertToCny(14500, 'JPY', 0, fxMap),
        isDoublePro: false,
      };
    }
    const proSpec = getRegionMonthlyProSpec(state);
    const proUnit = convertToCny(proSpec.amount, proSpec.currency, offset, fxMap);
    return {
      mode: 'double_pro',
      currency: proSpec.currency,
      amount: proSpec.amount * 2,
      singleProCny: proUnit,
      unitCny: proUnit * 2,
      baseCny: convertToCny(proSpec.amount * 2, proSpec.currency, 0, fxMap),
      isDoublePro: true,
    };
  }

  function getUltraCostForMonth(monthIndex, state) {
    const resolved = resolveLegacyUltraCharge(monthIndex, state);
    return resolved.isDoublePro ? null : resolved.unitCny;
  }

  function getModelPhase(monthIndex, state) {
    const elapsed = Number(state.monthsSinceLaunch) + monthIndex + 1;
    const sotaLen = Math.max(1, Number(state.effectiveSotaMonths));
    const nextInterval = Math.max(2, Number(state.nextFlagshipInterval));

    if (elapsed >= nextInterval) {
      return { key: 'next_gen', label: '新旗舰窗口', tone: 'green' };
    }
    if (elapsed <= 3) {
      return { key: 'honeymoon', label: '蜜月领先期', tone: 'dark' };
    }
    if (elapsed <= sotaLen) {
      return { key: 'steady', label: '第一梯队稳态', tone: 'blue' };
    }
    return { key: 'risk', label: '空窗/掉队风险', tone: 'amber' };
  }

  function getItemUnitPrice(item, monthIndex, state) {
    const offset = MONTHS[monthIndex].offsetFromNow;
    const fxMap = resolveFxAnnualMap(state);
    if (item.dynamicPrice === 'gemini_ultra_5x') {
      const resolved = resolveLegacyUltraCharge(monthIndex, state);
      return resolved.unitCny;
    }
    const currency = item.currency || 'CNY';
    const rawAmount = Math.max(0, Number(item.amount != null ? item.amount : item.priceCny) || 0);
    // Mid-year one-time catch-up hike (only for TRY items, and only when TRY depreciated)
    if (currency === 'TRY' && item.midYearHike && monthIndex >= 6) {
      const baseFx = getCnyPerUnit('TRY', 0, fxMap);
      const juneFx = getCnyPerUnit('TRY', MONTHS[6].offsetFromNow, fxMap);
      const hikeMult = Math.max(1, baseFx / juneFx);
      return rawAmount * hikeMult * getCnyPerUnit('TRY', offset, fxMap);
    }
    return convertToCny(rawAmount, currency, offset, fxMap);
  }

  function resolveMonthPlans(state) {
    if (Array.isArray(state.monthPlans) && state.monthPlans.length === 12) {
      return state.monthPlans;
    }
    const legacy = Array.isArray(state.months) ? state.months : [];
    const { makeSubItem } = data;
    return MONTHS.map((_, i) => {
      const m = legacy[i] || 'none';
      if (m === 'ultra') return [makeSubItem('ultra_idle', 1)];
      if (m === 'pro1') return [makeSubItem('gemini_pro_tr', 1)];
      if (m === 'pro2') return [makeSubItem('gemini_pro_tr', 2)];
      return [];
    });
  }

  function buildComparisonScenarios(state, baseRows, bfCost, musicFee, needsLegacyUltraRenewal) {
    const m0to3Buy = baseRows.slice(0, 4).reduce((s, r) => s + r.buyMonthFlow, 0);
    const m0to3Skip = baseRows.slice(0, 4).reduce((s, r) => s + r.skipMonthFlow, 0);
    const m4to11Other = baseRows.slice(4).reduce((s, r) => s + r.otherSubsCost, 0);

    const s1Buy = bfCost + m0to3Buy + m4to11Other + musicFee * 8;
    const s1Skip = m0to3Skip + m4to11Other + musicFee * 8;

    const aprAugPro = baseRows.slice(4, 9).reduce((s, r) => s + r.proUnit, 0);
    const s2Buy = bfCost + m0to3Buy + m4to11Other + musicFee * 8;
    const s2Skip = m0to3Skip + aprAugPro + m4to11Other + musicFee * 8;

    const s4Buy = baseRows[11].cumBuy;
    const s4Skip = baseRows[11].cumSkip;

    let thirdScenario;
    if (needsLegacyUltraRenewal) {
      const janMarPro = baseRows.slice(1, 4).reduce((s, r) => s + r.proUnit, 0);
      const janMarOther = baseRows.slice(1, 4).reduce((s, r) => s + r.otherSubsCost, 0);
      const decBuy = baseRows[0].buyMonthFlow;
      const decSkip = baseRows[0].skipMonthFlow;
      const s3Buy = bfCost + decBuy + janMarPro + janMarOther + musicFee * 3 + m4to11Other + musicFee * 8;
      const s3Skip = decSkip + janMarPro * 2 + janMarOther + musicFee * 3 + aprAugPro + m4to11Other + musicFee * 8;
      thirdScenario = {
        id: 'tr_fail_double_pro',
        title: '土区断续兜底剧本：1~3月改双 Pro 顶住，4~8月用单 Pro',
        tag: '保险价值',
        tone: 'blue',
        buyTotal: s3Buy,
        skipTotal: s3Skip,
        diff: s3Skip - s3Buy,
      };
    } else {
      const sotaEnd = Math.min(12, Math.max(1, Math.round(Number(state.effectiveSotaMonths) || 7)));
      const sotaBuy = bfCost + baseRows.slice(0, sotaEnd).reduce((s, r) => s + r.buyMonthFlow, 0);
      const sotaSkip = baseRows.slice(0, sotaEnd).reduce((s, r) => s + r.skipMonthFlow, 0);
      thirdScenario = {
        id: 'sota_only',
        title: `稳态期剧本：仅在主力 SOTA 期（前 ${sotaEnd} 个月）使用，之后停用`,
        tag: '周期测算',
        tone: 'blue',
        buyTotal: sotaBuy,
        skipTotal: sotaSkip,
        diff: sotaSkip - sotaBuy,
      };
    }

    return [
      {
        id: 'worst',
        title: '最差剧本：4月后 Gemini 掉队，彻底停用 Gemini',
        tag: '风控底线',
        tone: 'red',
        buyTotal: s1Buy,
        skipTotal: s1Skip,
        diff: s1Skip - s1Buy,
      },
      {
        id: 'offseason5',
        title: '淡季剧本：4~8月用满 5 个月 Pro，9月切走',
        tag: '中性测试',
        tone: 'amber',
        buyTotal: s2Buy,
        skipTotal: s2Skip,
        diff: s2Skip - s2Buy,
      },
      thirdScenario,
      {
        id: 'full_plan',
        title: '当前 12 个月订阅组合完整执行',
        tag: '你的计划',
        tone: 'green',
        buyTotal: s4Buy,
        skipTotal: s4Skip,
        diff: s4Skip - s4Buy,
      },
    ];
  }

  function calculateLedger(state) {
    const fxMap = resolveFxAnnualMap(state);
    // Today's lump-sum Black Friday purchase is ALWAYS locked at Day-0 spot rate (never affected by future FX sliders)
    const bfCost = Math.max(0, Number(state.bfCostCny) || 0);
    const musicFee = Math.max(0, Number(state.musicMonthlyCny) || 0);
    const colabCredit = Math.max(0, Number(state.colabProMonthlyCny) || 0);
    const plans = resolveMonthPlans(state);

    const monthlyRows = [];
    let cumBuy = bfCost;
    let cumSkip = 0;

    let proCoveredMonths = 0;
    let ultraOverlapMonths = 0;
    let idleNoneMonths = 0;
    let totalProValueSaved = 0;
    let totalOtherSubsAnnual = 0;
    let crossoverMonthIndex = null;
    let needsLegacyUltraRenewal = false;

    // Track foreign currencies actually charged across the 12 months
    const fxUsageMap = {};
    function recordFxUsage(currency, monthIndex, baseCnyAmount) {
      if (!currency || currency === 'CNY' || !(baseCnyAmount > 0)) return;
      if (!fxUsageMap[currency]) {
        fxUsageMap[currency] = { currency, monthSet: new Set(), baseAnnualCny: 0 };
      }
      fxUsageMap[currency].monthSet.add(monthIndex);
      fxUsageMap[currency].baseAnnualCny += baseCnyAmount;
    }

    for (let i = 0; i < MONTHS.length; i++) {
      const items = Array.isArray(plans[i]) ? plans[i] : [];
      const proUnit = getMonthlyProCny(i, state);
      const phase = getModelPhase(i, state);
      const tryRate = getTryRateAtOffset(MONTHS[i].offsetFromNow, fxMap);
      const trAvailable = isTurkeyUltraAvailable(i, state);

      let geminiProSlots = 0;
      let replaceableSlots = 0;
      let bestReplaceableCny = 0;
      let bestReplaceableName = '';
      let geminiProReplaceableCny = 0;
      let hasUltraActive = false;
      let ultraFallbackToPro = false;
      let geminiUltraCost = 0;
      let geminiProTotalCost = 0;
      let otherSubsCost = 0;
      let hasMusicIncluded = false;

      const resolvedItems = items.map((item) => {
        const qty = Math.max(1, Number(item.qty) || 1);
        const isPro = Boolean(item.isGeminiPro || item.dynamicPrice === 'gemini_pro');
        const isUltra5xDyn = item.dynamicPrice === 'gemini_ultra_5x';
        const isIdlePlanItem = Boolean(item.isIdlePlan || item.isGeminiUltra || isUltra5xDyn);
        const canReplace = item.replaceableByBf != null ? Boolean(item.replaceableByBf) : isPro;

        if (item.id === 'none_idle') {
          return Object.assign({}, item, { qty: 1, replaceableByBf: false, unitCny: 0, subtotalCny: 0 });
        }

        if (isPro) {
          const unit = getItemUnitPrice(item, i, state);
          const cur = item.currency || 'TRY';
          const baseCny = convertToCny(item.amount != null ? item.amount : 0, cur, 0, fxMap) * qty;
          recordFxUsage(cur, i, baseCny);
          geminiProSlots += qty;
          geminiProTotalCost += unit * qty;
          if (canReplace) {
            replaceableSlots += qty;
            if (geminiProReplaceableCny === 0) geminiProReplaceableCny = unit;
            if (unit > bestReplaceableCny) {
              bestReplaceableCny = unit;
              bestReplaceableName = item.short || item.name;
            }
          }
          return Object.assign({}, item, { qty, replaceableByBf: canReplace, unitCny: unit, subtotalCny: unit * qty });
        }

        if (isUltra5xDyn) {
          needsLegacyUltraRenewal = true;
          const resolvedUltra = resolveLegacyUltraCharge(i, state);
          recordFxUsage(resolvedUltra.currency, i, resolvedUltra.baseCny * qty);

          if (resolvedUltra.isDoublePro) {
            const singlePro = resolvedUltra.singleProCny;
            geminiProSlots += 2 * qty;
            replaceableSlots += 2 * qty;
            geminiProTotalCost += singlePro * 2 * qty;
            if (geminiProReplaceableCny === 0) geminiProReplaceableCny = singlePro;
            if (singlePro > bestReplaceableCny) {
              bestReplaceableCny = singlePro;
              bestReplaceableName = '双Pro兜底';
            }
            ultraFallbackToPro = true;
            return Object.assign({}, item, {
              qty,
              replaceableByBf: true,
              unitCny: singlePro * 2,
              subtotalCny: singlePro * 2 * qty,
              fallbackNote: '断续切双Pro',
            });
          }

          geminiUltraCost += resolvedUltra.unitCny * qty;
          hasUltraActive = true;
          hasMusicIncluded = true;
          return Object.assign({}, item, {
            qty,
            replaceableByBf: false,
            unitCny: resolvedUltra.unitCny,
            subtotalCny: resolvedUltra.unitCny * qty,
            effectiveCurrency: resolvedUltra.currency,
          });
        }

        const unit = getItemUnitPrice(item, i, state);
        const cur = item.currency || 'CNY';
        const baseCny = convertToCny(item.amount != null ? item.amount : item.priceCny || 0, cur, 0, fxMap) * qty;
        recordFxUsage(cur, i, baseCny);

        if (item.includesMusic) hasMusicIncluded = true;
        if (isIdlePlanItem) {
          geminiUltraCost += unit * qty;
          hasUltraActive = true;
        } else {
          otherSubsCost += unit * qty;
          if (canReplace) {
            replaceableSlots += qty;
            if (unit > bestReplaceableCny) {
              bestReplaceableCny = unit;
              bestReplaceableName = item.short || item.name;
            }
          }
        }
        return Object.assign({}, item, { qty, replaceableByBf: canReplace, unitCny: unit, subtotalCny: unit * qty });
      });

      const monthMusic = hasMusicIncluded ? 0 : musicFee;
      const bfSavedThisMonth =
        replaceableSlots >= 1
          ? (geminiProReplaceableCny > 0 ? geminiProReplaceableCny : bestReplaceableCny)
          : 0;
      const bfReplacedTarget =
        replaceableSlots >= 1
          ? (geminiProReplaceableCny > 0 ? 'Gemini Pro' : bestReplaceableName)
          : '';

      const skipMonthFlow =
        geminiUltraCost + geminiProTotalCost + otherSubsCost + monthMusic;
      const extraColabCredit = geminiProSlots === 0 && !hasUltraActive ? colabCredit : 0;
      const buyMonthFlow = Math.max(0, skipMonthFlow - bfSavedThisMonth - extraColabCredit);

      if (bfSavedThisMonth > 0) {
        proCoveredMonths += 1;
        totalProValueSaved += bfSavedThisMonth;
      } else if (hasUltraActive) {
        ultraOverlapMonths += 1;
      } else {
        idleNoneMonths += 1;
      }

      totalOtherSubsAnnual += otherSubsCost;
      cumBuy += buyMonthFlow;
      cumSkip += skipMonthFlow;

      if (crossoverMonthIndex === null && cumBuy <= cumSkip) {
        crossoverMonthIndex = i;
      }

      monthlyRows.push({
        index: i,
        month: MONTHS[i],
        items: resolvedItems,
        geminiProSlots,
        replaceableSlots,
        bfReplacedTarget,
        hasUltraActive,
        ultraFallbackToPro,
        otherSubsCost,
        monthMusic,
        tryRate,
        proUnit: bfSavedThisMonth > 0 ? bfSavedThisMonth : proUnit,
        phase,
        trAvailable,
        buyMonthFlow,
        skipMonthFlow,
        cumBuy,
        cumSkip,
        monthSavedByBf: skipMonthFlow - buyMonthFlow,
      });
    }

    // Build ordered list of active foreign currencies (selected region's currency first, then highest baseAnnualCny)
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

    const avgProPrice =
      proCoveredMonths > 0
        ? totalProValueSaved / proCoveredMonths
        : monthlyRows.slice(4).reduce((s, r) => s + r.proUnit, 0) / 8;

    const breakEvenMonths = avgProPrice > 0 ? bfCost / avgProPrice : Infinity;
    const fullPlanNetSavings = cumSkip - cumBuy;

    const earlyProSavings = monthlyRows
      .slice(0, 4)
      .reduce((sum, r) => sum + r.monthSavedByBf, 0);
    const lateProSavings = monthlyRows
      .slice(4)
      .reduce((sum, r) => sum + r.monthSavedByBf, 0);

    const downsideNet = earlyProSavings - bfCost;
    const upsideNet = fullPlanNetSavings;

    const p = Math.min(1, Math.max(0, Number(state.retainProbPct) / 100));
    const expectedNetSavings = p * upsideNet + (1 - p) * downsideNet;

    let breakEvenProbPct;
    if (lateProSavings <= 0) {
      breakEvenProbPct = earlyProSavings >= bfCost ? 0 : 100;
    } else {
      const raw = ((bfCost - earlyProSavings) / lateProSavings) * 100;
      breakEvenProbPct = Math.min(100, Math.max(0, raw));
    }

    const scenarios = buildComparisonScenarios(state, monthlyRows, bfCost, musicFee, needsLegacyUltraRenewal);

    let verdict;
    if (upsideNet <= 0) {
      verdict = {
        level: 'skip',
        badge: '建议跳过',
        tone: 'red',
        headline: '按当前 12 个月订阅组合，就算全年不换模型也会亏钱',
        detail: `你的组合中仅 ${proCoveredMonths} 个月实际用到黑五 Pro 槽位（可抵月费 ¥${Math.round(totalProValueSaved)}），低于黑五成本 ¥${Math.round(bfCost)}。直接按月买更划算。`,
      };
    } else if (expectedNetSavings >= 40 && p * 100 >= breakEvenProbPct + 5) {
      verdict = {
        level: 'buy',
        badge: '值得入手',
        tone: 'green',
        headline: `正期望交易：当前把握（${state.retainProbPct}%）高于盈亏线（${breakEvenProbPct.toFixed(1)}%）`,
        detail: `预计 ${breakEvenMonths.toFixed(1)} 个月回本，按计划执行净省 ¥${Math.round(upsideNet)}，计入模型掉队风险后的期望净收益为 +¥${Math.round(expectedNetSavings)}。`,
      };
    } else if (expectedNetSavings >= -40) {
      verdict = {
        level: 'neutral',
        badge: '接近打平 · 谨慎观望',
        tone: 'amber',
        headline: `赔率接近五五开：期望净值 ${expectedNetSavings >= 0 ? '+' : ''}¥${Math.round(expectedNetSavings)}`,
        detail: `需要至少 ${breakEvenProbPct.toFixed(1)}% 的把握相信中后期继续使用 Gemini 才算正期望。若不想背负 ¥${Math.round(bfCost)} 沉没成本，按月随用随买更灵活。`,
      };
    } else {
      verdict = {
        level: 'skip',
        badge: '赔率倒挂 · 建议跳过',
        tone: 'red',
        headline: `风险大于收益：期望净值 -¥${Math.abs(Math.round(expectedNetSavings))}`,
        detail: `盈亏平衡需要 ${breakEvenProbPct.toFixed(1)}% 以上把握，高于你当前的 ${state.retainProbPct}% 预期；最多省 ¥${Math.round(upsideNet)}，但一旦中后期模型掉队将净亏 ¥${Math.abs(Math.round(downsideNet))}。`,
      };
    }

    return {
      bfCost,
      bfMonthlyAvg: bfCost / 12,
      avgProPrice,
      breakEvenMonths,
      proCoveredMonths,
      ultraOverlapMonths,
      idleNoneMonths,
      totalIdleMonths: ultraOverlapMonths + idleNoneMonths,
      ultraIdleCostCny: (bfCost * ultraOverlapMonths) / 12,
      totalIdleCostCny: (bfCost * (ultraOverlapMonths + idleNoneMonths)) / 12,
      totalProValueSaved,
      totalOtherSubsAnnual,
      totalBuyCost: cumBuy,
      totalSkipCost: cumSkip,
      fullPlanNetSavings,
      upsideNet,
      downsideNet,
      expectedNetSavings,
      breakEvenProbPct,
      crossoverMonthIndex,
      needsLegacyUltraRenewal,
      activeFxCurrencies,
      fxAnnualMap: fxMap,
      monthlyRows,
      scenarios,
      verdict,
    };
  }

  return {
    legacyTryDepToAnnualPct,
    resolveFxAnnualMap,
    getCnyPerUnit,
    getTryRateAtOffset,
    convertToCny,
    getMonthlyProCny,
    isTurkeyUltraAvailable,
    resolveLegacyUltraCharge,
    getUltraCostForMonth,
    getModelPhase,
    getItemUnitPrice,
    calculateLedger,
  };
});
