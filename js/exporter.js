(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SubLedgerExporter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const GITHUB_USER = 'L0dyv';
  const GITHUB_REPO = 'do-you-really-need-gemini-pro-bf';
  const GITHUB_USER_URL = `https://github.com/${GITHUB_USER}`;
  const GITHUB_REPO_URL = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}`;
  const CNY_PER_USD = 6.67;

  const EN_MONTHS_SHORT = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const EN_MONTHS_LONG = [
    'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027',
    'Jun 2027', 'Jul 2027', 'Aug 2027', 'Sep 2027', 'Oct 2027', 'Nov 2027',
  ];

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function makeMoneyHelpers(cur) {
    const isUsd = cur === 'USD';
    const div = isUsd ? CNY_PER_USD : 1;
    const sym = isUsd ? '$' : '¥';
    const conv = (cnyVal) => cnyVal / div;
    const fmtMoney = (cnyVal, withSign) => {
      const rounded = Math.round(conv(cnyVal));
      if (withSign) {
        if (rounded === 0) return `${sym}0`;
        return `${rounded > 0 ? '+' : '-'}${sym}${Math.abs(rounded).toLocaleString('en-US')}`;
      }
      return `${sym}${rounded.toLocaleString('en-US')}`;
    };
    const fmtMoneyDec = (cnyVal, dec) => `${sym}${conv(cnyVal).toFixed(dec != null ? dec : 1)}`;
    const fmtNum = (cnyVal, withSign) => {
      const rounded = Math.round(conv(cnyVal));
      if (withSign) {
        if (rounded === 0) return '0';
        return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('en-US')}`;
      }
      return rounded.toLocaleString('en-US');
    };
    return { cur, sym, isUsd, conv, fmtMoney, fmtMoneyDec, fmtNum };
  }

  function wrapLines(text, maxChars) {
    const chars = Array.from(String(text || ''));
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      cur += ch;
      if (cur.length >= maxChars) {
        lines.push(cur);
        cur = '';
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function badgeColors(tone) {
    if (tone === 'green') return { bg: '#dbeddb', fg: '#1c3829' };
    if (tone === 'red') return { bg: '#ffe2dd', fg: '#5d1715' };
    if (tone === 'amber' || tone === 'yellow') return { bg: '#fdecc8', fg: '#402c1b' };
    if (tone === 'blue') return { bg: '#d3e5ef', fg: '#183347' };
    return { bg: '#e3e2e0', fg: '#32302c' };
  }

  /**
   * Build a crisp Institutional Financial Decision Memo SVG (960 x 960)
   * matching Step 5's exact typography, settlement currency (CNY / USD),
   * 2:1 Hero EV block, Bidirectional Payoff Bar, Day-0 Cumulative Chart,
   * Financial-Statement Scenario Table, and quiet bottom-right attribution.
   */
  function buildSummarySvg(state, res, lang, displayCurrency) {
    const isEn = lang === 'en-US';
    const cur = displayCurrency || res.displayCurrency || (isEn ? 'USD' : 'CNY');
    const M = makeMoneyHelpers(cur);
    const W = 960;
    const H = 760;
    const padX = 56;
    const contentW = W - padX * 2;
    const fontSans = 'Inter, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif';
    const fontMono = 'JetBrains Mono, Cascadia Mono, Consolas, monospace';

    const vCol = badgeColors(res.verdict.tone);
    const detailLines = wrapLines(res.verdict.detail, isEn ? 92 : 56).slice(0, 2);

    // 1. Hero Expected Net Savings + 2 Decision Conditions (2:1 Block, y = 172..294)
    const heroTop = 172;
    const heroBot = 294;
    const evRounded = Math.round(M.conv(res.expectedNetSavings));
    const evSign = evRounded > 0 ? '+' : evRounded < 0 ? '-' : '';
    const evSignColor = evRounded > 0 ? '#1c3829' : evRounded < 0 ? '#5d1715' : '#37352f';
    const evDigits = `${M.sym}${Math.abs(evRounded).toLocaleString('en-US')}`;
    const rateStr = `${res.evReturnPct >= 0 ? '+' : ''}${res.evReturnPct.toFixed(1)}%`;
    const activeM = res.expectedActiveMonths != null ? res.expectedActiveMonths : 12;
    const sotaM = res.sotaActiveMonths != null ? res.sotaActiveMonths : res.sotaCutoff;
    const extraM = res.postSotaUsedMonths != null ? res.postSotaUsedMonths : (res.postSotaExtraMonths || 0);
    const nextM = res.nextGenActiveMonths || 0;
    const spanParts = (isEn
      ? [
          sotaM > 0 ? `${sotaM}m SOTA` : null,
          extraM > 0 ? `${extraM}m extra` : null,
          nextM > 0 ? `${nextM}m Next SOTA` : null,
        ]
      : [
          sotaM > 0 ? `本次 SOTA ${sotaM} 月` : null,
          extraM > 0 ? `后续 ${extraM} 月` : null,
          nextM > 0 ? `下代 SOTA ${nextM} 月` : null,
        ]).filter(Boolean).join(' + ');
    const evHeroLabel = activeM >= 12
      ? (isEn ? `Expected Net Savings (All 12 mo active) · ${cur}` : `预期净节省（全年 12 个月生效）· ${cur}`)
      : (isEn ? `Expected Net Savings (${activeM} mo active) · ${cur}` : `预期净节省（共生效 ${activeM} 个月）· ${cur}`);
    const evRateLine = res.bfCost > 0
      ? (isEn
          ? `${spanParts} (${activeM} mo total) · ${rateStr} on upfront`
          : `${spanParts}（共 ${activeM} 个月）· 相对预付 ${rateStr}`)
      : '';
    let spanSub;
    if (res.breakEvenStatus === 'already_even') {
      const mLine = res.breakEvenMonthNum != null ? res.breakEvenMonthNum : 1;
      spanSub = isEn ? `Breaks even in SOTA span (Mo ${mLine})` : `本次 SOTA 前 ${res.sotaCutoff} 月内已回本（第 ${mLine} 月）`;
    } else if (res.breakEvenStatus === 'impossible') {
      spanSub = isEn ? 'Not even within 12 months' : '全年 12 个月仍未回本';
    } else if (res.monthMargin != null && res.monthMargin > 0) {
      spanSub = isEn
        ? `${spanParts} · +${res.monthMargin}m margin`
        : `${spanParts} · 超回本线 +${res.monthMargin} 月`;
    } else if (res.monthMargin === 0) {
      spanSub = isEn
        ? `${spanParts} · exact payback`
        : `${spanParts} · 刚好第 ${res.breakEvenMonthNum} 月回本`;
    } else {
      const shortM = Math.abs(res.monthMargin || 0);
      spanSub = isEn
        ? `${spanParts} · ${shortM}m short`
        : `${spanParts} · 距回本差 ${shortM} 月`;
    }

    // Build effective cumulative series reflecting expectedActiveMask (including in-term Next SOTA return)
    let effCumBuy = res.bfCost;
    let effCumSkip = 0;
    let effCrossIdx = null;
    const activeMask = Array.isArray(res.expectedActiveMask) && res.expectedActiveMask.length === 12
      ? res.expectedActiveMask
      : res.monthlyRows.map((_, i) => i < activeM);
    const effRows = res.monthlyRows.map((r, i) => {
      const isActive = Boolean(activeMask[i]);
      effCumSkip += r.skipMonthFlow;
      effCumBuy += isActive ? r.buyMonthFlow : r.skipMonthFlow;
      if (effCrossIdx === null && effCumSkip >= effCumBuy) {
        effCrossIdx = i;
      }
      return {
        month: r.month,
        phase: r.phase,
        cumBuy: effCumBuy,
        cumSkip: effCumSkip,
      };
    });

    const crossMain = effCrossIdx !== null
      ? (isEn ? EN_MONTHS_LONG[effCrossIdx] : res.monthlyRows[effCrossIdx].month.label)
      : (isEn ? 'Not within 12 mo' : '12 个月内未回本');
    const crossSub = Number.isFinite(res.equivalentUsageMonths) && res.proCoveredMonths > 0
      ? (isEn ? `Equiv. ${res.equivalentUsageMonths.toFixed(1)} mo · avg ${M.fmtMoney(res.avgProPrice)}/mo` : `折合用量 ${res.equivalentUsageMonths.toFixed(1)} 个月 · 月均省 ${M.fmtMoney(res.avgProPrice)}`)
      : (isEn ? 'No monthly savings configured' : '当前未配置月度省钱差额');

    const condX = padX + 544;

    // Hairline Upfront & Idle Strip
    const fxSummary = (res.activeFxCurrencies || []).length > 0
      ? res.activeFxCurrencies
          .map((c) => `${c.currency} ${c.annualPct > 0 ? '+' : ''}${Math.round(c.annualPct)}%`)
          .join(' / ')
      : (isEn ? 'CNY only' : '无外币月付');
    const expectedBuyCost = res.expectedBuyCost != null ? res.expectedBuyCost : (res.totalSkipCost - res.expectedNetSavings);
    const stripText = isEn
      ? `Upfront ${M.fmtMoney(res.bfCost)}  ·  Avg ${M.fmtMoneyDec(res.bfMonthlyAvg, 1)}/mo  ·  Plan A ${M.fmtMoney(res.totalSkipCost)} vs Buy ${M.fmtMoney(expectedBuyCost)}  ·  FX: ${fxSummary}`
      : `今日预付 ${M.fmtMoney(res.bfCost)}  ·  年费月均 ${M.fmtMoneyDec(res.bfMonthlyAvg, 1)}/月  ·  不买 ${M.fmtMoney(res.totalSkipCost)} vs 买入 ${M.fmtMoney(expectedBuyCost)}  ·  汇率：${fxSummary}`;

    // 2. Clean Single-Row Selected Outlook Table directly under Hero
    const tblHeadY = 380;
    const stdRowY = tblHeadY + 12;
    const stdRowH = 48;
    const evPillBg = evRounded > 0 ? '#dbeddb' : evRounded < 0 ? '#ffe2dd' : '#e3e2e0';
    const evPillFg = evRounded > 0 ? '#1c3829' : evRounded < 0 ? '#5d1715' : '#32302c';
    const stdTitle = isEn
      ? `Your Outlook (${activeM} active mo)`
      : `按你的预期（共 ${activeM} 个月）`;
    const stdSub = activeM >= 12
      ? (isEn
          ? `${spanParts} (active all 12 months)`
          : `${spanParts}（全年 12 个月完整生效）`)
      : (res.nextGenInTerm && res.gapInactiveMonths > 0
          ? (isEn
              ? `${spanParts} (${res.gapInactiveMonths}-mo mid-year gap reverts to Plan A)`
              : `${spanParts}（中间空窗 ${res.gapInactiveMonths} 个月改回方案 A）`)
          : (isEn
              ? `${spanParts} (reverts to Plan A after)`
              : `${spanParts}（之后停用改回方案 A）`));
    const stdRowSvg = `
      <rect x="${padX}" y="${stdRowY}" width="${contentW}" height="${stdRowH}" fill="#fafaf9"/>
      <line x1="${padX}" y1="${stdRowY}" x2="${W - padX}" y2="${stdRowY}" stroke="#37352f" stroke-width="1.2"/>
      <text x="${padX + 8}" y="${stdRowY + 20}" fill="#37352f" font-size="13" font-weight="600" font-family="${fontSans}">${esc(stdTitle)}</text>
      <text x="${padX + 8}" y="${stdRowY + 37}" fill="#787774" font-size="10.5" font-family="${fontMono}">${esc(stdSub)}</text>
      <text x="${W - padX - 216}" y="${stdRowY + 28}" text-anchor="end" fill="#37352f" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(expectedBuyCost))}</text>
      <text x="${W - padX - 112}" y="${stdRowY + 28}" text-anchor="end" fill="#37352f" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(res.totalSkipCost))}</text>
      <rect x="${W - padX - 84}" y="${stdRowY + 13}" width="80" height="22" rx="3" fill="${evPillBg}"/>
      <text x="${W - padX - 10}" y="${stdRowY + 28}" text-anchor="end" fill="${evPillFg}" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(res.expectedNetSavings, true))}</text>
    `;

    const tblBottomY = stdRowY + stdRowH;
    const evFormulaLine = isEn
      ? `Net Saved = Without BF − Buy (${cur}, spot 1 USD ≈ 6.67 CNY). Calculated on your ${activeM}-mo outlook (${spanParts}).`
      : `净节省 = 不买黑五 − 买入支出（${cur}，基准 1 USD ≈ 6.67 CNY）。按你预期的 ${activeM} 个月（${spanParts}）计算。`;

    // 3. Cumulative Chart with Day 0 ("今日" / "Now")
    const chartTop = 524;
    const chartH = 160;
    const chartLeft = padX + 54;
    const chartRight = W - padX - 10;
    const chartW = chartRight - chartLeft;
    const rows = effRows;
    const stepUnit = M.isUsd ? 100 : 500;
    const maxYDisp = Math.ceil(
      Math.max(
        M.isUsd ? 100 : 600,
        M.conv(res.bfCost),
        ...rows.map((r) => Math.max(M.conv(r.cumBuy), M.conv(r.cumSkip)))
      ) / stepUnit
    ) * stepUnit;
    const xAt = (i) => chartLeft + (i / rows.length) * chartW;
    const yAtDisp = (dispVal) => chartTop + chartH - (dispVal / maxYDisp) * chartH;
    const yAt = (cnyVal) => yAtDisp(M.conv(cnyVal));

    const buyPts = [
      `${xAt(0).toFixed(1)},${yAt(res.bfCost).toFixed(1)}`,
      ...rows.map((r, i) => `${xAt(i + 1).toFixed(1)},${yAt(r.cumBuy).toFixed(1)}`),
    ].join(' ');
    const skipPts = [
      `${xAt(0).toFixed(1)},${yAt(0).toFixed(1)}`,
      ...rows.map((r, i) => `${xAt(i + 1).toFixed(1)},${yAt(r.cumSkip).toFixed(1)}`),
    ].join(' ');

    const chartGrid = [0, 0.5, 1]
      .map((ratio) => {
        const val = maxYDisp * ratio;
        const y = yAtDisp(val).toFixed(1);
        return `
          <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
          <text x="${chartLeft - 8}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="10.5" font-family="${fontMono}">${M.sym}${Math.round(val)}</text>
        `;
      })
      .join('');

    const crossoverSvg = effCrossIdx !== null
      ? (() => {
          const cx = xAt(effCrossIdx + 1);
          const cy = yAt(rows[effCrossIdx].cumBuy);
          const mTxt = isEn ? EN_MONTHS_SHORT[effCrossIdx] : rows[effCrossIdx].month.short;
          return `
            <line x1="${cx.toFixed(1)}" y1="${chartTop}" x2="${cx.toFixed(1)}" y2="${chartTop + chartH}" stroke="#1c3829" stroke-dasharray="3 3" stroke-width="1"/>
            <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="#1c3829" stroke="#ffffff" stroke-width="1.4"/>
            <text x="${Math.min(chartRight - 72, cx + 7).toFixed(1)}" y="${Math.max(chartTop + 16, cy - 7).toFixed(1)}" fill="#1c3829" font-size="11" font-weight="600" font-family="${fontSans}">${esc(isEn ? `Payback ${mTxt}` : `${mTxt}回本`)}</text>
          `;
        })()
      : '';

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    const nextGenSvg = nextGenIdx >= 0
      ? `
        <line x1="${xAt(nextGenIdx + 1).toFixed(1)}" y1="${chartTop}" x2="${xAt(nextGenIdx + 1).toFixed(1)}" y2="${chartTop + chartH}" stroke="#9b9a97" stroke-dasharray="2 3" stroke-width="1"/>
        <circle cx="${xAt(nextGenIdx + 1).toFixed(1)}" cy="${chartTop + chartH}" r="3.2" fill="#1c3829"/>
        <text x="${Math.min(chartRight - 220, Math.max(chartLeft + 4, xAt(nextGenIdx + 1) - 68)).toFixed(1)}" y="${chartTop + 11}" fill="#1c3829" font-size="10.5" font-weight="600" font-family="${fontSans}">${isEn ? `Est. Next Gemini SOTA (${esc(EN_MONTHS_SHORT[nextGenIdx])})` : `预期下代 Gemini SOTA (${esc(rows[nextGenIdx].month.short)})`}</text>
      `
      : '';

    const chartXLabels = [
      `<text x="${xAt(0).toFixed(1)}" y="${chartTop + chartH + 17}" text-anchor="middle" fill="#37352f" font-size="10.5" font-weight="600" font-family="${fontSans}">${isEn ? 'Now' : '今日'}</text>`,
      ...rows.map((r, i) => `<text x="${xAt(i + 1).toFixed(1)}" y="${chartTop + chartH + 17}" text-anchor="middle" fill="#787774" font-size="10.5" font-family="${fontSans}">${esc(isEn ? EN_MONTHS_SHORT[i] : r.month.short)}</text>`),
    ].join('');

    const lastRow = rows[rows.length - 1];
    const buyEndY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumBuy) - 8 : yAt(lastRow.cumBuy) + 15;
    const skipEndY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumSkip) + 15 : yAt(lastRow.cumSkip) - 8;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- Header -->
  <text x="${padX}" y="48" fill="#9b9a97" font-size="11.5" font-family="${fontMono}" letter-spacing="1">DO YOU REALLY NEED GEMINI PRO BF? · DECISION MEMO</text>
  <text x="${padX}" y="86" fill="#37352f" font-size="28" font-weight="700" font-family="${fontSans}">${isEn ? 'Gemini Pro Black Friday Ledger' : '黑五订阅决策'}</text>

  <!-- Verdict Pill -->
  <rect x="${W - padX - 156}" y="60" width="156" height="30" rx="4" fill="${vCol.bg}"/>
  <text x="${W - padX - 78}" y="80" text-anchor="middle" fill="${vCol.fg}" font-size="13.5" font-weight="600" font-family="${fontSans}">${esc(res.verdict.badge)}</text>

  <!-- Headline & Detail -->
  <text x="${padX}" y="114" fill="#37352f" font-size="15" font-weight="600" font-family="${fontSans}">${esc(res.verdict.headline)}</text>
  ${detailLines
    .map((line, idx) => `<text x="${padX}" y="${136 + idx * 18}" fill="#787774" font-size="13" font-family="${fontSans}">${esc(line)}</text>`)
    .join('')}

  <!-- Institutional 2:1 Hero Financial Block -->
  <line x1="${padX}" y1="${heroTop}" x2="${W - padX}" y2="${heroTop}" stroke="#37352f" stroke-width="1.5"/>
  <text x="${padX}" y="${heroTop + 26}" fill="#787774" font-size="12" font-weight="500" font-family="${fontSans}">${esc(evHeroLabel)}</text>
  <text x="${padX}" y="${heroTop + 82}" fill="#37352f" font-size="50" font-weight="600" font-family="${fontMono}"><tspan fill="${evSignColor}">${evSign}</tspan>${esc(evDigits)}</text>
  <text x="${padX}" y="${heroTop + 106}" fill="#787774" font-size="12" font-family="${fontMono}">${esc(evRateLine)}</text>

  <line x1="${condX - 24}" y1="${heroTop + 14}" x2="${condX - 24}" y2="${heroBot - 14}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${condX}" y="${heroTop + 26}" fill="#9b9a97" font-size="11.5" font-family="${fontSans}">${isEn ? 'Expected Active' : '预期生效时长'}</text>
  <text x="${condX}" y="${heroTop + 48}" fill="#37352f" font-size="19" font-weight="600" font-family="${fontMono}">${isEn ? `${activeM} mo` : `${activeM} 个月`}</text>
  <text x="${condX}" y="${heroTop + 64}" fill="#787774" font-size="11.5" font-family="${fontMono}">${esc(spanSub)}</text>

  <text x="${condX}" y="${heroTop + 86}" fill="#9b9a97" font-size="11.5" font-family="${fontSans}">${isEn ? 'Cumulative Payback' : '累计回本'}</text>
  <text x="${condX}" y="${heroTop + 106}" fill="#37352f" font-size="17.5" font-weight="600" font-family="${fontMono}">${esc(crossMain)}</text>
  <text x="${condX}" y="${heroTop + 120}" fill="#787774" font-size="11" font-family="${fontMono}">${esc(crossSub)}</text>

  <line x1="${padX}" y1="${heroBot}" x2="${W - padX}" y2="${heroBot}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${padX}" y="${heroBot + 24}" fill="#787774" font-size="12" font-family="${fontMono}">${esc(stripText)}</text>
  <line x1="${padX}" y1="${heroBot + 36}" x2="${W - padX}" y2="${heroBot + 36}" stroke="#e9e9e7" stroke-width="1"/>

  <!-- Cost Summary Table (Selected Outlook Only) -->
  <text x="${padX}" y="${tblHeadY - 14}" fill="#37352f" font-size="13.5" font-weight="600" font-family="${fontSans}">${isEn ? '12-Month Cost Comparison' : '年度收支对照'}</text>
  <text x="${W - padX}" y="${tblHeadY - 14}" text-anchor="end" fill="#9b9a97" font-size="11" font-family="${fontMono}">${isEn ? `Unit: ${cur}` : `单位：${cur}`}</text>
  <text x="${padX + 12}" y="${tblHeadY + 4}" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? 'Basis' : '方案口径'}</text>
  <text x="${W - padX - 216}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? `Buy (${cur})` : `买入支出 (${cur})`}</text>
  <text x="${W - padX - 112}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? `Without BF (${cur})` : `不买黑五 (${cur})`}</text>
  <text x="${W - padX - 6}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? 'Net Saved' : '净节省'}</text>
  ${stdRowSvg}
  <line x1="${padX}" y1="${tblBottomY}" x2="${W - padX}" y2="${tblBottomY}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${padX}" y="${tblBottomY + 20}" fill="#787774" font-size="11" font-family="${fontSans}">${esc(evFormulaLine)}</text>

  <!-- Cumulative Chart -->
  <text x="${padX}" y="${chartTop - 16}" fill="#37352f" font-size="13.5" font-weight="600" font-family="${fontSans}">${isEn ? '12-Month Cumulative Marginal Spend' : '12 个月累积边际支出对比'}</text>
  <text x="${W - padX}" y="${chartTop - 16}" text-anchor="end" fill="#9b9a97" font-size="11.5" font-family="${fontSans}">${isEn ? 'Solid: Buy BF (incl. upfront) · Dashed: Without BF' : '实线：买黑五（含今日预付）· 虚线：不买黑五'}</text>
  ${chartGrid}
  ${nextGenSvg}
  <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="1.8" stroke-dasharray="5 4"/>
  <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
  <circle cx="${xAt(0).toFixed(1)}" cy="${yAt(res.bfCost).toFixed(1)}" r="3.2" fill="#37352f"/>
  <circle cx="${xAt(0).toFixed(1)}" cy="${yAt(0).toFixed(1)}" r="3.2" fill="#9b9a97"/>
  ${crossoverSvg}
  ${chartXLabels}
  <text x="${(xAt(rows.length) - 6).toFixed(1)}" y="${buyEndY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="11.5" font-weight="600" font-family="${fontMono}">${esc(isEn ? `Buy:${M.fmtMoney(lastRow.cumBuy)}` : `买:${M.fmtMoney(lastRow.cumBuy)}`)}</text>
  <text x="${(xAt(rows.length) - 6).toFixed(1)}" y="${skipEndY.toFixed(1)}" text-anchor="end" fill="#787774" font-size="11.5" font-family="${fontMono}">${esc(isEn ? `No BF:${M.fmtMoney(lastRow.cumSkip)}` : `不买:${M.fmtMoney(lastRow.cumSkip)}`)}</text>

  <!-- Quiet Bottom-Right Attribution -->
  <text x="${W - padX}" y="${H - 22}" text-anchor="end" fill="#b5b4b0" font-size="10.5" font-family="${fontSans}">Made by ${GITHUB_USER} · github.com/${GITHUB_USER}/${GITHUB_REPO}</text>
</svg>`;
  }

  /**
   * Build a self-contained single-file HTML report matching the Financial Decision Memo & Dual-Basket table.
   */
  function buildStandaloneHtml(state, res, lang, displayCurrency) {
    const isEn = lang === 'en-US';
    const cur = displayCurrency || res.displayCurrency || (isEn ? 'USD' : 'CNY');
    const M = makeMoneyHelpers(cur);
    const svg = buildSummarySvg(state, res, lang, cur);
    const i18nMod =
      typeof module !== 'undefined' && module.exports
        ? require('./i18n.js')
        : (typeof window !== 'undefined' ? window.SubLedgerI18n : null);
    const fmtShortQty = (it) => {
      const rawShort = i18nMod && isEn ? i18nMod.localizeItemShort(it.short, 'en-US') : it.short;
      const qty = Math.max(1, Number(it.qty) || 1);
      return qty > 1 ? `${esc(rawShort)} ×${qty}` : esc(rawShort);
    };
    const monthRowsHtml = res.monthlyRows
      .map((r, idx) => {
        const mLabel = isEn ? EN_MONTHS_LONG[idx] : r.month.label;
        const planA = r.items.length
          ? r.items.map(fmtShortQty).join(' + ')
          : '—';
        const bfTag = isEn ? 'BF Pro' : '黑五 Pro';
        const planB = r.buyItems && r.buyItems.length
          ? `${bfTag} + ${r.buyItems.map(fmtShortQty).join(' + ')}`
          : bfTag;
        const diffCls = r.monthSavedByBf > 0.5 ? 'pos' : r.monthSavedByBf < -0.5 ? 'neg' : '';
        return `<tr><td>${esc(mLabel)}</td><td>${planA}</td><td>${planB}</td><td class="num ${diffCls}">${M.fmtMoney(r.monthSavedByBf, true)}</td><td class="num">${M.fmtMoney(r.cumBuy)}</td><td class="num">${M.fmtMoney(r.cumSkip)}</td></tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="${isEn ? 'en-US' : 'zh-CN'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isEn ? 'Gemini Pro BF Decision Memo' : 'AI 黑五订阅决策备忘录'} · ${esc(res.verdict.badge)}</title>
  <style>
    body { margin: 0; background: #ffffff; color: #37352f; font-family: "Inter", "Noto Sans SC", "PingFang SC", sans-serif; line-height: 1.65; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 48px 32px 72px; }
    .svg-card { width: 100%; height: auto; border: 1px solid #e9e9e7; border-radius: 6px; overflow: hidden; }
    .svg-card svg { display: block; width: 100%; height: auto; }
    h2 { margin: 36px 0 12px; font-size: 18px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; border-top: 1px solid #e9e9e7; }
    th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid #e9e9e7; border-right: 1px solid #e9e9e7; }
    th:last-child, td:last-child { border-right: none; }
    th { font-size: 12.5px; color: #787774; font-weight: 600; }
    .num { text-align: right; font-family: "JetBrains Mono", Consolas, monospace; font-variant-numeric: tabular-nums; }
    .pos { color: #1c3829; font-weight: 600; }
    .neg { color: #5d1715; font-weight: 600; }
    footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e9e9e7; display: flex; align-items: center; justify-content: flex-end; gap: 5px; font-size: 11px; color: #b5b4b0; }
    footer a { color: #a8a7a3; text-decoration: none; border-bottom: 1px solid transparent; }
    footer a:hover { color: #787774; border-bottom-color: #d3d1cb; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="svg-card">${svg}</div>
    <h2>${isEn ? `12-Month Dual-Plan Breakdown (${cur})` : `12 个月双方案逐月明细（${cur}）`}</h2>
    <table>
      <thead>
        <tr>
          <th>${isEn ? 'Month' : '月份'}</th>
          <th>${isEn ? 'Without BF (Plan A)' : '不买黑五（方案 A）'}</th>
          <th>${isEn ? 'With BF (Plan B)' : '买黑五后（方案 B）'}</th>
          <th class="num">${isEn ? 'Monthly Diff' : '当月差额'}</th>
          <th class="num">${isEn ? 'Cum. Buy' : '买黑五累积'}</th>
          <th class="num">${isEn ? 'Cum. No BF' : '不买累积'}</th>
        </tr>
      </thead>
      <tbody>${monthRowsHtml}</tbody>
    </table>
    <footer>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>Made by <a href="${GITHUB_USER_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_USER}</a> · <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_USER}/${GITHUB_REPO}</a></span>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Rasterize the vector SVG into a crisp 3x ultra-HD PNG Blob (2880 x 2880)
   * so it can be copied directly to clipboard or saved with razor-sharp text.
   */
  function svgToHighResPngBlob(svgString, scale) {
    const ratio = scale || 3;
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(ratio, ratio);
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('PNG export failed'));
          }, 'image/png');
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  return {
    GITHUB_USER,
    GITHUB_REPO,
    GITHUB_USER_URL,
    GITHUB_REPO_URL,
    buildSummarySvg,
    buildStandaloneHtml,
    svgToHighResPngBlob,
  };
});
