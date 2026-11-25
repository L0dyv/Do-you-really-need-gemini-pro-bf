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
    const H = 880;
    const padX = 56;
    const contentW = W - padX * 2;
    const fontSans = 'Inter, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif';
    const fontMono = 'JetBrains Mono, Cascadia Mono, Consolas, monospace';

    const vCol = badgeColors(res.verdict.tone);
    const detailLines = wrapLines(res.verdict.detail, isEn ? 92 : 56).slice(0, 2);

    // 1. Hero EV + 2 Decision Conditions (2:1 Block, y = 172..294)
    const heroTop = 172;
    const heroBot = 294;
    const evRounded = Math.round(M.conv(res.expectedNetSavings));
    const evSign = evRounded > 0 ? '+' : evRounded < 0 ? '-' : '';
    const evSignColor = evRounded > 0 ? '#1c3829' : evRounded < 0 ? '#5d1715' : '#37352f';
    const evDigits = `${M.sym}${Math.abs(evRounded).toLocaleString('en-US')}`;
    const rateStr = `${res.evReturnPct >= 0 ? '+' : ''}${res.evReturnPct.toFixed(1)}%`;
    const pPct = Math.round(Number(state.retainProbPct) || 0);
    const wU = Math.min(100, Math.max(0, pPct));
    const wD = 100 - wU;
    const evRateLine = res.bfCost > 0
      ? (isEn
          ? `${wD}% × (${M.fmtMoney(res.downsideNet, true)}) + ${wU}% × (${M.fmtMoney(res.upsideNet, true)}) · ${rateStr} on upfront`
          : `${wD}% × (${M.fmtMoney(res.downsideNet, true)}) + ${wU}% × (${M.fmtMoney(res.upsideNet, true)}) · 相对预付 ${rateStr}`)
      : '';
    let probSub;
    if (res.breakEvenProbStatus === 'already_even') {
      probSub = isEn ? 'Locked even in SOTA span (0% line)' : '主力期内已锁定回本（盈亏线 0%）';
    } else if (res.breakEvenProbStatus === 'impossible') {
      probSub = isEn ? 'Full plan stays net negative' : '全年完整执行仍未回本';
    } else if (res.breakEvenProbStatus === 'deterministic') {
      probSub = isEn ? 'No post-SOTA diff months' : '主力期后无新增差额月';
    } else if (res.breakEvenProbPct != null) {
      const gap = res.breakEvenProbDirection === 'lte'
        ? res.breakEvenProbPct - pPct
        : pPct - res.breakEvenProbPct;
      probSub = gap >= 0
        ? (isEn ? `Break-even ${res.breakEvenProbPct.toFixed(1)}%, +${gap.toFixed(1)} pp` : `盈亏线 ${res.breakEvenProbPct.toFixed(1)}%，高于 +${gap.toFixed(1)} pp`)
        : (isEn ? `Break-even ${res.breakEvenProbPct.toFixed(1)}%, ${gap.toFixed(1)} pp` : `盈亏线 ${res.breakEvenProbPct.toFixed(1)}%，低于 ${gap.toFixed(1)} pp`);
    } else {
      probSub = '—';
    }

    const crossMain = res.crossoverMonthIndex !== null
      ? (isEn ? EN_MONTHS_LONG[res.crossoverMonthIndex] : res.monthlyRows[res.crossoverMonthIndex].month.label)
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
    const stripText = isEn
      ? `Upfront ${M.fmtMoney(res.bfCost)}  ·  Avg ${M.fmtMoneyDec(res.bfMonthlyAvg, 1)}/mo  ·  Plan A ${M.fmtMoney(res.totalSkipCost)} vs Plan B ${M.fmtMoney(res.totalBuyCost)}  ·  FX: ${fxSummary}`
      : `今日预付 ${M.fmtMoney(res.bfCost)}  ·  年费月均 ${M.fmtMoneyDec(res.bfMonthlyAvg, 1)}/月  ·  不买 ${M.fmtMoney(res.totalSkipCost)} vs 买黑五 ${M.fmtMoney(res.totalBuyCost)}  ·  汇率：${fxSummary}`;

    // 2. Tiered Scenario Table directly under Hero EV: Prominent Standard EV Row + 4 Quieter Fixed Cases
    const tblHeadY = 380;
    const stdRowY = tblHeadY + 12;
    const stdRowH = 44;
    const expectedBuyCost = res.totalSkipCost - res.expectedNetSavings;
    const evPillBg = evRounded > 0 ? '#dbeddb' : evRounded < 0 ? '#ffe2dd' : '#e3e2e0';
    const evPillFg = evRounded > 0 ? '#1c3829' : evRounded < 0 ? '#5d1715' : '#32302c';
    const stdTitle = isEn ? 'Standard Case · Weighted by Your Outlook' : '标准情况 · 按你的预期综合估算';
    const stdSub = isEn
      ? `Your outlook: ${wD}% chance to drop as primary after Mo ${res.sotaCutoff} (${M.fmtMoney(res.downsideNet, true)}), ${wU}% full year (${M.fmtMoney(res.upsideNet, true)})`
      : `预期前 ${res.sotaCutoff} 个月后 ${wD}% 概率不再当主力（${M.fmtMoney(res.downsideNet, true)}），${wU}% 概率用满全年（${M.fmtMoney(res.upsideNet, true)}）`;
    const stdRowSvg = `
      <rect x="${padX}" y="${stdRowY}" width="${contentW}" height="${stdRowH}" fill="#f2f7fd"/>
      <rect x="${padX}" y="${stdRowY}" width="2" height="${stdRowH}" fill="#2383e2" fill-opacity="0.65"/>
      <line x1="${padX}" y1="${stdRowY}" x2="${W - padX}" y2="${stdRowY}" stroke="#e9e9e7" stroke-width="1"/>
      <text x="${padX + 12}" y="${stdRowY + 19}" fill="#37352f" font-size="13" font-weight="600" font-family="${fontSans}">${esc(stdTitle)}</text>
      <text x="${padX + 12}" y="${stdRowY + 35}" fill="#787774" font-size="10.5" font-family="${fontSans}">${esc(stdSub)}</text>
      <text x="${W - padX - 216}" y="${stdRowY + 26}" text-anchor="end" fill="#37352f" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(expectedBuyCost))}</text>
      <text x="${W - padX - 112}" y="${stdRowY + 26}" text-anchor="end" fill="#37352f" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(res.totalSkipCost))}</text>
      <rect x="${W - padX - 84}" y="${stdRowY + 11}" width="80" height="22" rx="3" fill="${evPillBg}"/>
      <text x="${W - padX - 10}" y="${stdRowY + 26}" text-anchor="end" fill="${evPillFg}" font-size="13" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(res.expectedNetSavings, true))}</text>
    `;

    const tblRowH = 34;
    const subStartY = stdRowY + stdRowH;
    const scenRows = res.scenarios
      .map((sc, i) => {
        const y = subStartY + i * tblRowH;
        const rounded = Math.round(M.conv(sc.diff));
        const pillBg = rounded > 0 ? '#dbeddb' : rounded < 0 ? '#ffe2dd' : '#e3e2e0';
        const pillFg = rounded > 0 ? '#1c3829' : rounded < 0 ? '#5d1715' : '#32302c';
        return `
          <line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
          <text x="${padX + 12}" y="${y + 15}" fill="#787774" font-size="11.5" font-weight="500" font-family="${fontSans}">${esc(sc.title)}</text>
          <text x="${padX + 12}" y="${y + 28}" fill="#9b9a97" font-size="9.5" font-family="${fontSans}">${esc(sc.periodNote || '')}</text>
          <text x="${W - padX - 216}" y="${y + 21}" text-anchor="end" fill="#787774" font-size="11.5" font-family="${fontMono}">${esc(M.fmtNum(sc.buyTotal))}</text>
          <text x="${W - padX - 112}" y="${y + 21}" text-anchor="end" fill="#787774" font-size="11.5" font-family="${fontMono}">${esc(M.fmtNum(sc.skipTotal))}</text>
          <rect x="${W - padX - 80}" y="${y + 8}" width="76" height="19" rx="3" fill="${pillBg}"/>
          <text x="${W - padX - 10}" y="${y + 21}" text-anchor="end" fill="${pillFg}" font-size="11.5" font-weight="600" font-family="${fontMono}">${esc(M.fmtNum(sc.diff, true))}</text>
        `;
      })
      .join('');

    const tblBottomY = subStartY + res.scenarios.length * tblRowH;
    const evFormulaLine = isEn
      ? `Net Saved = Without BF − Buy (${cur}, spot 1 USD ≈ 6.67 CNY). Top row is the standard retention-weighted estimate; 4 compact rows below show fixed cutoff cases.`
      : `净节省 = 不买黑五 − 买入支出（${cur}，基准 1 USD ≈ 6.67 CNY）。首行为按留存把握加权的标准结论，下方 4 行为不计概率的固定情景对照。`;

    // 3. Cumulative Chart with Day 0 ("今日" / "Now")
    const chartTop = 656;
    const chartH = 148;
    const chartLeft = padX + 54;
    const chartRight = W - padX - 10;
    const chartW = chartRight - chartLeft;
    const rows = res.monthlyRows;
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

    const crossoverSvg = res.crossoverMonthIndex !== null
      ? (() => {
          const cx = xAt(res.crossoverMonthIndex + 1);
          const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
          const mTxt = isEn ? EN_MONTHS_SHORT[res.crossoverMonthIndex] : rows[res.crossoverMonthIndex].month.short;
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
  <text x="${padX}" y="${heroTop + 26}" fill="#787774" font-size="12" font-weight="500" font-family="${fontSans}">${isEn ? `12-Month Expected Net Savings (EV) · ${cur}` : `12 个月期望净节省 (EV) · ${cur}`}</text>
  <text x="${padX}" y="${heroTop + 82}" fill="#37352f" font-size="50" font-weight="600" font-family="${fontMono}"><tspan fill="${evSignColor}">${evSign}</tspan>${esc(evDigits)}</text>
  <text x="${padX}" y="${heroTop + 106}" fill="#787774" font-size="12" font-family="${fontMono}">${esc(evRateLine)}</text>

  <line x1="${condX - 24}" y1="${heroTop + 14}" x2="${condX - 24}" y2="${heroBot - 14}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${condX}" y="${heroTop + 26}" fill="#9b9a97" font-size="11.5" font-family="${fontSans}">${isEn ? 'Retention Confidence' : '留存把握'}</text>
  <text x="${condX}" y="${heroTop + 48}" fill="#37352f" font-size="19" font-weight="600" font-family="${fontMono}">${pPct}%</text>
  <text x="${condX}" y="${heroTop + 64}" fill="#787774" font-size="11.5" font-family="${fontMono}">${esc(probSub)}</text>

  <text x="${condX}" y="${heroTop + 86}" fill="#9b9a97" font-size="11.5" font-family="${fontSans}">${isEn ? 'Cumulative Payback' : '累计回本'}</text>
  <text x="${condX}" y="${heroTop + 106}" fill="#37352f" font-size="17.5" font-weight="600" font-family="${fontMono}">${esc(crossMain)}</text>
  <text x="${condX}" y="${heroTop + 120}" fill="#787774" font-size="11" font-family="${fontMono}">${esc(crossSub)}</text>

  <line x1="${padX}" y1="${heroBot}" x2="${W - padX}" y2="${heroBot}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${padX}" y="${heroBot + 24}" fill="#787774" font-size="12" font-family="${fontMono}">${esc(stripText)}</text>
  <line x1="${padX}" y1="${heroBot + 36}" x2="${W - padX}" y2="${heroBot + 36}" stroke="#e9e9e7" stroke-width="1"/>

  <!-- Tiered Scenario Table (Standard EV Primary Row + 4 Compact Fixed Cases) -->
  <text x="${padX}" y="${tblHeadY - 14}" fill="#37352f" font-size="13.5" font-weight="600" font-family="${fontSans}">${isEn ? 'Standard Result &amp; What-If Cases' : '标准结论与极端情景对照'}</text>
  <text x="${W - padX}" y="${tblHeadY - 14}" text-anchor="end" fill="#9b9a97" font-size="11" font-family="${fontMono}">${isEn ? `Unit: ${cur}` : `单位：${cur}`}</text>
  <text x="${padX + 12}" y="${tblHeadY + 4}" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? 'Scenario' : '情景'}</text>
  <text x="${W - padX - 216}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? `Buy (${cur})` : `买入支出 (${cur})`}</text>
  <text x="${W - padX - 112}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? `Without BF (${cur})` : `不买黑五 (${cur})`}</text>
  <text x="${W - padX - 6}" y="${tblHeadY + 4}" text-anchor="end" fill="#787774" font-size="11" font-weight="600" font-family="${fontSans}">${isEn ? 'Net Saved' : '净节省'}</text>
  ${stdRowSvg}
  ${scenRows}
  <line x1="${padX}" y1="${tblBottomY}" x2="${W - padX}" y2="${tblBottomY}" stroke="#e9e9e7" stroke-width="1"/>
  <text x="${padX}" y="${tblBottomY + 19}" fill="#787774" font-size="11" font-family="${fontSans}">${esc(evFormulaLine)}</text>

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
