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
  const { FX_RATES, MONTHS } = data;

  function getTryRateAtOffset(offsetMonths, annualPct) {
    const safePct = Math.max(0, Number(annualPct) || 0);
    const monthlyFactor = Math.pow(1 + safePct / 100, 1 / 12);
    return FX_RATES.TRY_PER_CNY * Math.pow(monthlyFactor, offsetMonths);
  }

  /**
   * Convert any currency amount (TRY / JPY / USD / CNY) to CNY at a given month offset.
   * TRY automatically uses the depreciated monthly TRY rate!
   */
  function convertToCny(amount, currency, offsetMonths, tryAnnualDepRate) {
    const val = Math.max(0, Number(amount) || 0);
    if (currency === 'TRY') {
      const rate = getTryRateAtOffset(offsetMonths || 0, tryAnnualDepRate || 0);
      return val / rate;
    }
    if (currency === 'JPY') {
      return val / FX_RATES.JPY_PER_CNY;
    }
    if (currency === 'USD') {
      return val * FX_RATES.CNY_PER_USD;
    }
    return val;
  }

  function getMonthlyProCny(monthIndex, state) {
    const offset = MONTHS[monthIndex].offsetFromNow;
    if (state.monthlyProRegion === 'jp') {
      return state.monthlyProBaseJpy / FX_RATES.JPY_PER_CNY;
    }
    const baseCnyNow = state.monthlyProBaseTry / FX_RATES.TRY_PER_CNY;
    if (state.googleMidYearHike && monthIndex >= 6) {
      const rateAtJune = getTryRateAtOffset(MONTHS[6].offsetFromNow, state.tryAnnualDepRate);
      const hikedTry = baseCnyNow * rateAtJune;
      const rateNow = getTryRateAtOffset(offset, state.tryAnnualDepRate);
      return hikedTry / rateNow;
    }
    const rate = getTryRateAtOffset(offset, state.tryAnnualDepRate);
    return state.monthlyProBaseTry / rate;
  }

  function isTurkeyUltraAvailable(monthIndex, state) {
    if (state.ultraRenewalMode === 'always') return true;
    if (state.ultraRenewalMode === 'immediate_fail') return false;
    return monthIndex < Number(state.ultraFailMonthIndex);
  }

  function getUltraCostForMonth(monthIndex, state) {
    if (isTurkeyUltraAvailable(monthIndex, state)) {
      const offset = MONTHS[monthIndex].offsetFromNow;
      const impliedTry = state.currentUltraCny * FX_RATES.TRY_PER_CNY;
      const rate = getTryRateAtOffset(offset, state.tryAnnualDepRate);
      return impliedTry / rate;
    }
    if (state.fallbackUltraStrategy === 'us_ultra') {
      return 99.99 * FX_RATES.CNY_PER_USD;
    }
    if (state.fallbackUltraStrategy === 'jp_ultra') {
      return 14500 / FX_RATES.JPY_PER_CNY;
    }
    return null;
  }

  function getModelPhase(monthIndex, state) {
    const elapsed = Number(state.monthsSinceLaunch) + monthIndex + 1;
    const sotaLen = Math.max(1, Number(state.effectiveSotaMonths));
    const nextInterval = Math.max(3, Number(state.nextFlagshipInterval));

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
    if (item.dynamicPrice === 'gemini_pro') {
      return getMonthlyProCny(monthIndex, state);
    }
    if (item.dynamicPrice === 'gemini_ultra_5x') {
      const price = getUltraCostForMonth(monthIndex, state);
      if (price != null) return price;
      return getMonthlyProCny(monthIndex, state) * 2;
    }
    // Multi-currency conversion (supports legacy priceCny fallback)
    const currency = item.currency || 'CNY';
    const rawAmount = item.amount != null ? item.amount : item.priceCny;
    return convertToCny(rawAmount, currency, offset, state.tryAnnualDepRate);
  }

  function resolveMonthPlans(state) {
    if (Array.isArray(state.monthPlans) && state.monthPlans.length === 12) {
      return state.monthPlans;
    }
    const legacy = Array.isArray(state.months) ? state.months : [];
    const { makeSubItem } = data;
    return MONTHS.map((_, i) => {
      const m = legacy[i] || 'none';
      if (m === 'ultra') return [makeSubItem('gemini_ultra_5x', 1)];
      if (m === 'pro1') return [makeSubItem('gemini_pro_tr', 1)];
      if (m === 'pro2') return [makeSubItem('gemini_pro_tr', 2)];
      return [];
    });
  }

  function buildComparisonScenarios(state, baseRows, bfCost, musicFee) {
    const m0to3Buy = baseRows.slice(0, 4).reduce((s, r) => s + r.buyMonthFlow, 0);
    const m0to3Skip = baseRows.slice(0, 4).reduce((s, r) => s + r.skipMonthFlow, 0);
    const m4to11Other = baseRows.slice(4).reduce((s, r) => s + r.otherSubsCost, 0);

    const s1Buy = bfCost + m0to3Buy + m4to11Other + musicFee * 8;
    const s1Skip = m0to3Skip + m4to11Other + musicFee * 8;

    const aprAugPro = baseRows.slice(4, 9).reduce((s, r) => s + r.proUnit, 0);
    const s2Buy = bfCost + m0to3Buy + m4to11Other + musicFee * 8;
    const s2Skip = m0to3Skip + aprAugPro + m4to11Other + musicFee * 8;

    const janMarPro = baseRows.slice(1, 4).reduce((s, r) => s + r.proUnit, 0);
    const janMarOther = baseRows.slice(1, 4).reduce((s, r) => s + r.otherSubsCost, 0);
    const decBuy = baseRows[0].buyMonthFlow;
    const decSkip = baseRows[0].skipMonthFlow;
    const s3Buy = bfCost + decBuy + janMarPro + janMarOther + musicFee * 3 + m4to11Other + musicFee * 8;
    const s3Skip = decSkip + janMarPro * 2 + janMarOther + musicFee * 3 + aprAugPro + m4to11Other + musicFee * 8;

    const s4Buy = baseRows[11].cumBuy;
    const s4Skip = baseRows[11].cumSkip;

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
      {
        id: 'tr_fail_double_pro',
        title: '土区翻车剧本：1~3月改双 Pro 顶住，4~8月用单 Pro',
        tag: '保险价值',
        tone: 'blue',
        buyTotal: s3Buy,
        skipTotal: s3Skip,
        diff: s3Skip - s3Buy,
      },
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
    const bfCost = Math.max(0, Number(state.bfCostCny) || 0);
    const musicFee = Math.max(0, Number(state.musicMonthlyCny) || 0);
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

    for (let i = 0; i < MONTHS.length; i++) {
      const items = Array.isArray(plans[i]) ? plans[i] : [];
      const proUnit = getMonthlyProCny(i, state);
      const phase = getModelPhase(i, state);
      const tryRate = getTryRateAtOffset(MONTHS[i].offsetFromNow, state.tryAnnualDepRate);
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
        const isUltra = Boolean(item.isGeminiUltra || isUltra5xDyn);
        const canReplace = item.replaceableByBf != null ? Boolean(item.replaceableByBf) : isPro;

        if (isPro) {
          const unit = getItemUnitPrice(item, i, state);
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
          if (!trAvailable && state.fallbackUltraStrategy === 'double_pro') {
            geminiProSlots += 2 * qty;
            replaceableSlots += 2 * qty;
            geminiProTotalCost += proUnit * 2 * qty;
            if (geminiProReplaceableCny === 0) geminiProReplaceableCny = proUnit;
            if (proUnit > bestReplaceableCny) {
              bestReplaceableCny = proUnit;
              bestReplaceableName = '双Pro兜底';
            }
            ultraFallbackToPro = true;
            return Object.assign({}, item, {
              qty,
              replaceableByBf: true,
              unitCny: proUnit * 2,
              subtotalCny: proUnit * 2 * qty,
              fallbackNote: '断续切双Pro',
            });
          }
          const uPrice = getUltraCostForMonth(i, state);
          geminiUltraCost += uPrice * qty;
          hasUltraActive = true;
          hasMusicIncluded = true;
          return Object.assign({}, item, { qty, replaceableByBf: false, unitCny: uPrice, subtotalCny: uPrice * qty });
        }

        const unit = getItemUnitPrice(item, i, state);
        if (item.includesMusic) hasMusicIncluded = true;
        if (isUltra) {
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
      // Black Friday Pro replaces at most 1 replaceable unit per month (preferring Gemini Pro, else highest replaceable item)
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
      const buyMonthFlow = Math.max(0, skipMonthFlow - bfSavedThisMonth);

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

    const scenarios = buildComparisonScenarios(state, monthlyRows, bfCost, musicFee);

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
        badge: '值得入手（副号）',
        tone: 'green',
        headline: `正期望交易：当前把握（${state.retainProbPct}%）高于盈亏线（${breakEvenProbPct.toFixed(1)}%）`,
        detail: `预计 ${breakEvenMonths.toFixed(1)} 个月回本，按计划执行净省 ¥${Math.round(upsideNet)}，计入模型掉队风险后的期望净收益为 +¥${Math.round(expectedNetSavings)}。记得使用独立副号/独立 Apple ID。`,
      };
    } else if (expectedNetSavings >= -40) {
      verdict = {
        level: 'neutral',
        badge: '接近打平 · 谨慎观望',
        tone: 'amber',
        headline: `赔率接近五五开：期望净值 ${expectedNetSavings >= 0 ? '+' : ''}¥${Math.round(expectedNetSavings)}`,
        detail: `需要至少 ${breakEvenProbPct.toFixed(1)}% 的把握相信明年非重度期继续用 Gemini 才算正期望。若不想背负 ¥${Math.round(bfCost)} 沉没成本，按月随用随买更灵活。`,
      };
    } else {
      verdict = {
        level: 'skip',
        badge: '赔率倒挂 · 建议跳过',
        tone: 'red',
        headline: `风险大于收益：期望净值 -¥${Math.abs(Math.round(expectedNetSavings))}`,
        detail: `盈亏平衡需要 ${breakEvenProbPct.toFixed(1)}% 以上把握，高于你当前的 ${state.retainProbPct}% 预期；最多省 ¥${Math.round(upsideNet)}，但一旦 4 月后模型掉队将净亏 ¥${Math.abs(Math.round(downsideNet))}。`,
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
      monthlyRows,
      scenarios,
      verdict,
    };
  }

  return {
    getTryRateAtOffset,
    convertToCny,
    getMonthlyProCny,
    isTurkeyUltraAvailable,
    getUltraCostForMonth,
    getModelPhase,
    getItemUnitPrice,
    calculateLedger,
  };
});
