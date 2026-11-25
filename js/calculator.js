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

  function buildComparisonScenarios(state, baseRows, bfCost, musicFee) {
    const m0to3Buy = baseRows.slice(0, 4).reduce((s, r) => s + r.buyMonthFlow, 0);
    const m0to3Skip = baseRows.slice(0, 4).reduce((s, r) => s + r.skipMonthFlow, 0);

    const s1Buy = bfCost + m0to3Buy + musicFee * 8;
    const s1Skip = m0to3Skip + musicFee * 8;

    const aprAugPro = baseRows.slice(4, 9).reduce((s, r) => s + r.proUnit, 0);
    const s2Buy = bfCost + m0to3Buy + musicFee * 8;
    const s2Skip = m0to3Skip + aprAugPro + musicFee * 8;

    const janMarPro = baseRows.slice(1, 4).reduce((s, r) => s + r.proUnit, 0);
    const decCost = baseRows[0].skipMonthFlow;
    const decDiff = baseRows[0].skipMonthFlow - baseRows[0].buyMonthFlow;
    const s3Buy = bfCost + (decCost - decDiff) + janMarPro + musicFee * 3 + musicFee * 8;
    const s3Skip = decCost + janMarPro * 2 + musicFee * 3 + aprAugPro + musicFee * 8;

    const s4Buy = baseRows[11].cumBuy;
    const s4Skip = baseRows[11].cumSkip;

    return [
      {
        id: 'worst',
        title: '最差剧本：4月后模型掉队，彻底改用别家',
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
        title: '当前日历完整执行（含 9~11 月新旗舰接力）',
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

    const monthlyRows = [];
    let cumBuy = bfCost;
    let cumSkip = 0;

    let proCoveredMonths = 0;
    let ultraOverlapMonths = 0;
    let idleNoneMonths = 0;
    let totalProValueSaved = 0;
    let crossoverMonthIndex = null;

    for (let i = 0; i < MONTHS.length; i++) {
      const mode = state.months[i] || 'none';
      const proUnit = getMonthlyProCny(i, state);
      const phase = getModelPhase(i, state);
      const tryRate = getTryRateAtOffset(MONTHS[i].offsetFromNow, state.tryAnnualDepRate);
      const trAvailable = isTurkeyUltraAvailable(i, state);

      let buyMonthFlow = 0;
      let skipMonthFlow = 0;
      let effectiveMode = mode;

      if (mode === 'ultra') {
        if (!trAvailable && state.fallbackUltraStrategy === 'double_pro') {
          effectiveMode = 'pro2_fallback';
          buyMonthFlow = proUnit + musicFee;
          skipMonthFlow = proUnit * 2 + musicFee;
          proCoveredMonths += 1;
          totalProValueSaved += proUnit;
        } else {
          const ultraPrice = getUltraCostForMonth(i, state);
          buyMonthFlow = ultraPrice;
          skipMonthFlow = ultraPrice;
          ultraOverlapMonths += 1;
        }
      } else if (mode === 'pro1') {
        buyMonthFlow = musicFee;
        skipMonthFlow = proUnit + musicFee;
        proCoveredMonths += 1;
        totalProValueSaved += proUnit;
      } else if (mode === 'pro2') {
        buyMonthFlow = proUnit + musicFee;
        skipMonthFlow = proUnit * 2 + musicFee;
        proCoveredMonths += 1;
        totalProValueSaved += proUnit;
      } else {
        buyMonthFlow = musicFee;
        skipMonthFlow = musicFee;
        idleNoneMonths += 1;
      }

      cumBuy += buyMonthFlow;
      cumSkip += skipMonthFlow;

      if (crossoverMonthIndex === null && cumBuy <= cumSkip) {
        crossoverMonthIndex = i;
      }

      monthlyRows.push({
        index: i,
        month: MONTHS[i],
        mode,
        effectiveMode,
        tryRate,
        proUnit,
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
        headline: '按当前用量日历，就算全年不换模型也会亏钱',
        detail: `你的日历中仅 ${proCoveredMonths} 个月实际用到黑五 Pro（折合可替代月费 ¥${Math.round(totalProValueSaved)}），低于黑五成本 ¥${Math.round(bfCost)}。留现金按月买更划算。`,
      };
    } else if (expectedNetSavings >= 40 && p * 100 >= breakEvenProbPct + 5) {
      verdict = {
        level: 'buy',
        badge: '值得入手（副号）',
        tone: 'green',
        headline: `正期望交易：当前把握（${state.retainProbPct}%）高于盈亏线（${breakEvenProbPct.toFixed(1)}%）`,
        detail: `预计 ${breakEvenMonths.toFixed(1)} 个月即可回本，按计划执行净省 ¥${Math.round(upsideNet)}，计入模型掉队风险后的期望净收益为 +¥${Math.round(expectedNetSavings)}。记得使用独立副号/独立 Apple ID 购买。`,
      };
    } else if (expectedNetSavings >= -40) {
      verdict = {
        level: 'neutral',
        badge: '接近打平 · 谨慎观望',
        tone: 'amber',
        headline: `赔率接近五五开：期望净值 ${expectedNetSavings >= 0 ? '+' : ''}¥${Math.round(expectedNetSavings)}`,
        detail: `需要至少 ${breakEvenProbPct.toFixed(1)}% 的把握相信明年非重度期不会换模型才算正期望。若不想背负 ¥${Math.round(bfCost)} 沉没成本，按月随用随买更自由。`,
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
      totalProValueSaved,
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
    getMonthlyProCny,
    isTurkeyUltraAvailable,
    getUltraCostForMonth,
    getModelPhase,
    calculateLedger,
  };
});
