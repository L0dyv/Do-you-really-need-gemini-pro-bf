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

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtYen(n, withSign) {
    const rounded = Math.round(n);
    if (withSign) {
      return `${rounded >= 0 ? '+' : '-'}¥${Math.abs(rounded).toLocaleString('zh-CN')}`;
    }
    return `¥${rounded.toLocaleString('zh-CN')}`;
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
   * Build a crisp, Notion-styled vector SVG summary card (960 x 820).
   * Designed both for standalone .svg download and 3x ultra-HD PNG rasterization.
   */
  function buildSummarySvg(state, res, lang) {
    const isEn = lang === 'en-US';
    const W = 960;
    const H = 840;
    const padX = 56;
    const contentW = W - padX * 2;
    const fontSans = 'Inter, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif';
    const fontMono = 'JetBrains Mono, Cascadia Mono, Consolas, monospace';

    const vCol = badgeColors(res.verdict.tone);
    const detailLines = wrapLines(res.verdict.detail, isEn ? 86 : 52).slice(0, 3);
    const enMonths = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

    // 12-month visual strip
    const cellW = contentW / 12;
    const stripY = 236;
    const stripCells = res.monthlyRows
      .map((row, idx) => {
        const x = padX + idx * cellW;
        const isActive = row.monthSavedByBf > 0;
        const isUltra = row.hasUltraActive && !isActive;
        const fill = isActive ? '#d3e5ef' : isUltra ? '#fdecc8' : '#f1f1ef';
        const fg = isActive ? '#183347' : isUltra ? '#402c1b' : '#787774';
        const tagText = isActive
          ? `+¥${Math.round(row.monthSavedByBf)}`
          : isUltra
            ? (isEn ? 'Idle' : '致空闲')
            : (isEn ? 'Off' : '停用');
        const mShort = isEn ? enMonths[idx] : row.month.short;
        return `
          <rect x="${(x + 2).toFixed(1)}" y="${stripY}" width="${(cellW - 4).toFixed(1)}" height="46" rx="3" fill="${fill}"/>
          <text x="${(x + cellW / 2).toFixed(1)}" y="${stripY + 18}" text-anchor="middle" fill="${fg}" font-size="11.5" font-weight="600" font-family="${fontSans}">${esc(mShort)}</text>
          <text x="${(x + cellW / 2).toFixed(1)}" y="${stripY + 35}" text-anchor="middle" fill="${fg}" font-size="10.5" font-family="${fontMono}">${esc(tagText)}</text>
        `;
      })
      .join('');

    // Key metrics rows
    const propY = 314;
    const idleText =
      res.totalIdleMonths > 0
        ? (isEn
            ? `${res.totalIdleMonths} mo (Other Plan ${res.ultraOverlapMonths}m · ~${fmtYen(res.totalIdleCostCny)} amortized)`
            : `${res.totalIdleMonths} 个月（致空闲 Plan ${res.ultraOverlapMonths} 月 · 摊销约 ${fmtYen(res.totalIdleCostCny)}）`)
        : (isEn ? '0 months (active all year)' : '0 个月（全年生效）');
    const fxSummary = (res.activeFxCurrencies || []).length > 0
      ? res.activeFxCurrencies
          .map((c) => `${c.currency} ${c.annualPct > 0 ? '+' : ''}${Math.round(c.annualPct)}%`)
          .join(' · ')
      : (isEn ? 'No FX monthly' : '无外币月付');
    const props = isEn
      ? [
          ['BF Annual Cost', `${fmtYen(res.bfCost)} / yr (¥${res.bfMonthlyAvg.toFixed(1)}/mo · FX: ${fxSummary})`],
          ['BF Idle Period', idleText],
          ['Break-Even Span', `${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) + ' mo' : 'Cannot break even'} (avg ¥${Math.round(res.avgProPrice)}/mo)`],
          ['Expected Value (EV)', `${fmtYen(res.expectedNetSavings, true)} (Your ${state.retainProbPct}% vs Line ${res.breakEvenProbPct.toFixed(1)}%)`],
          ['Upside / Downside', `${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`],
        ]
      : [
          ['黑五包年成本', `${fmtYen(res.bfCost)} / 年（¥${res.bfMonthlyAvg.toFixed(1)}/月 · 汇率假设：${fxSummary}）`],
          ['黑五空闲期', idleText],
          ['实际回本周期', `${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) + ' 个月' : '无法回本'}（月均平替价值 ¥${Math.round(res.avgProPrice)}/月）`],
          ['期望净收益 (EV)', `${fmtYen(res.expectedNetSavings, true)}（你的把握 ${state.retainProbPct}% vs 盈亏线 ${res.breakEvenProbPct.toFixed(1)}%）`],
          ['最大赢 / 最大亏', `${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`],
        ];
    const propsSvg = props
      .map(([k, v], i) => {
        const y = propY + i * 34;
        return `
          <line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
          <text x="${padX + 4}" y="${y + 23}" fill="#787774" font-size="13.5" font-family="${fontSans}">${esc(k)}</text>
          <text x="${padX + 190}" y="${y + 23}" fill="#37352f" font-size="13.5" font-weight="600" font-family="${fontMono}">${esc(v)}</text>
        `;
      })
      .join('');

    // Mini Cumulative Chart
    const chartTop = 516;
    const chartH = 112;
    const chartLeft = padX + 50;
    const chartRight = W - padX - 10;
    const chartW = chartRight - chartLeft;
    const rows = res.monthlyRows;
    const maxY = Math.ceil(Math.max(600, ...rows.map((r) => Math.max(r.cumBuy, r.cumSkip))) / 500) * 500;
    const xAt = (i) => chartLeft + (i / (rows.length - 1)) * chartW;
    const yAt = (val) => chartTop + chartH - (val / maxY) * chartH;

    const buyPts = rows.map((r, i) => `${xAt(i).toFixed(1)},${yAt(r.cumBuy).toFixed(1)}`).join(' ');
    const skipPts = rows.map((r, i) => `${xAt(i).toFixed(1)},${yAt(r.cumSkip).toFixed(1)}`).join(' ');

    const chartGrid = [0, 0.5, 1]
      .map((ratio) => {
        const val = maxY * ratio;
        const y = yAt(val).toFixed(1);
        return `
          <line x1="${chartLeft}" y1="${y}" x2="${chartRight}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
          <text x="${chartLeft - 8}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="10.5" font-family="${fontMono}">¥${Math.round(val)}</text>
        `;
      })
      .join('');

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    const nextGenSvg =
      nextGenIdx >= 0
        ? `
          <line x1="${xAt(nextGenIdx).toFixed(1)}" y1="${chartTop}" x2="${xAt(nextGenIdx).toFixed(1)}" y2="${chartTop + chartH}" stroke="#787774" stroke-dasharray="2 3" stroke-width="1"/>
          <circle cx="${xAt(nextGenIdx).toFixed(1)}" cy="${chartTop + chartH}" r="3.5" fill="#1c3829"/>
          <text x="${Math.min(chartRight - 140, Math.max(chartLeft + 4, xAt(nextGenIdx) - 55)).toFixed(1)}" y="${chartTop - 6}" fill="#1c3829" font-size="11" font-weight="600" font-family="${fontSans}">● 下一代成为 SOTA 的模型 (${esc(rows[nextGenIdx].month.short)})</text>
        `
        : '';

    const chartXLabels = rows
      .map((r, i) => `<text x="${xAt(i).toFixed(1)}" y="${chartTop + chartH + 17}" text-anchor="middle" fill="#787774" font-size="10.5" font-family="${fontSans}">${esc(r.month.short)}</text>`)
      .join('');

    // Scenarios compact summary (4 rows)
    const tblY = 674;
    const scenRows = res.scenarios
      .map((sc, i) => {
        const y = tblY + i * 28;
        const diffColor = sc.diff > 0 ? '#1c3829' : sc.diff < 0 ? '#5d1715' : '#37352f';
        const diffText = sc.diff >= 0 ? `省 ${fmtYen(sc.diff)}` : `亏 ${fmtYen(Math.abs(sc.diff))}`;
        return `
          <line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
          <text x="${padX + 4}" y="${y + 19}" fill="#37352f" font-size="12.5" font-family="${fontSans}">${esc(sc.title)}</text>
          <text x="${W - padX - 180}" y="${y + 19}" text-anchor="end" fill="#787774" font-size="12" font-family="${fontMono}">买 ${esc(fmtYen(sc.buyTotal))}</text>
          <text x="${W - padX - 96}" y="${y + 19}" text-anchor="end" fill="#787774" font-size="12" font-family="${fontMono}">不买 ${esc(fmtYen(sc.skipTotal))}</text>
          <text x="${W - padX - 4}" y="${y + 19}" text-anchor="end" fill="${diffColor}" font-size="12.5" font-weight="600" font-family="${fontMono}">${esc(diffText)}</text>
        `;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- Header -->
  <text x="${padX}" y="54" fill="#9b9a97" font-size="12" font-family="${fontMono}" letter-spacing="1">DO YOU REALLY NEED GEMINI PRO BF? · DECISION SUMMARY</text>
  <text x="${padX}" y="92" fill="#37352f" font-size="28" font-weight="700" font-family="${fontSans}">${isEn ? 'Gemini Pro Black Friday Ledger' : 'AI 黑五包年决策账本'}</text>

  <!-- Verdict Pill -->
  <rect x="${W - padX - 150}" y="66" width="150" height="30" rx="4" fill="${vCol.bg}"/>
  <text x="${W - padX - 75}" y="86" text-anchor="middle" fill="${vCol.fg}" font-size="13.5" font-weight="600" font-family="${fontSans}">${esc(res.verdict.badge)}</text>

  <!-- Notion Quote Verdict -->
  <rect x="${padX}" y="114" width="3" height="84" fill="#37352f"/>
  <text x="${padX + 18}" y="134" fill="#37352f" font-size="16" font-weight="600" font-family="${fontSans}">${esc(res.verdict.headline)}</text>
  ${detailLines
    .map((line, idx) => `<text x="${padX + 18}" y="${158 + idx * 20}" fill="#787774" font-size="13.5" font-family="${fontSans}">${esc(line)}</text>`)
    .join('')}

  <!-- 12-Month Strip -->
  <text x="${padX}" y="224" fill="#787774" font-size="12" font-weight="600" font-family="${fontSans}">12 个月边际排布（蓝：平替生效 · 黄：致空闲 Plan · 灰：停用）</text>
  ${stripCells}

  <!-- Properties -->
  ${propsSvg}
  <line x1="${padX}" y1="${propY + props.length * 34}" x2="${W - padX}" y2="${propY + props.length * 34}" stroke="#e9e9e7" stroke-width="1"/>

  <!-- Cumulative Chart -->
  <text x="${padX}" y="${chartTop - 6}" fill="#787774" font-size="12" font-weight="600" font-family="${fontSans}">12 个月累积边际支出（实线：买黑五 · 虚线：不买按月）</text>
  ${chartGrid}
  ${nextGenSvg}
  <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="1.8" stroke-dasharray="5 4"/>
  <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
  ${chartXLabels}

  <!-- Scenarios Table -->
  <text x="${padX}" y="${tblY - 10}" fill="#787774" font-size="12" font-weight="600" font-family="${fontSans}">四种情景对照</text>
  ${scenRows}
  <line x1="${padX}" y1="${tblY + res.scenarios.length * 28}" x2="${W - padX}" y2="${tblY + res.scenarios.length * 28}" stroke="#e9e9e7" stroke-width="1"/>

  <!-- Footer Attribution -->
  <g transform="translate(${padX}, ${H - 32})">
    <svg width="14" height="14" viewBox="0 0 16 16" y="-11" fill="#787774">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    <text x="20" y="0" fill="#787774" font-size="12" font-family="${fontSans}">Made by ${GITHUB_USER} · github.com/${GITHUB_USER}/${GITHUB_REPO}</text>
  </g>
</svg>`;
  }

  /**
   * Build a self-contained single-file HTML report that can be opened offline or shared.
   */
  function buildStandaloneHtml(state, res, lang) {
    const isEn = lang === 'en-US';
    const svg = buildSummarySvg(state, res, lang);
    const monthRowsHtml = res.monthlyRows
      .map((r) => {
        const status = r.monthSavedByBf > 0
          ? `平替生效 (+${fmtYen(r.monthSavedByBf)})`
          : r.hasUltraActive
            ? '致空闲 Plan'
            : '停用';
        const plan = r.items.length
          ? r.items.map((it) => `${esc(it.short)}`).join(' / ')
          : '—';
        return `<tr><td>${esc(r.month.label)}</td><td>${plan}</td><td>${status}</td><td class="num">${fmtYen(r.cumBuy)}</td><td class="num">${fmtYen(r.cumSkip)}</td></tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI 黑五包年决策报告 · ${esc(res.verdict.badge)}</title>
  <style>
    body { margin: 0; background: #ffffff; color: #37352f; font-family: "Inter", "Noto Sans SC", "PingFang SC", sans-serif; line-height: 1.65; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 48px 32px 72px; }
    .svg-card { width: 100%; height: auto; border: 1px solid #e9e9e7; border-radius: 6px; overflow: hidden; }
    .svg-card svg { display: block; width: 100%; height: auto; }
    h2 { margin: 36px 0 12px; font-size: 18px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; border-top: 1px solid #e9e9e7; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e9e9e7; border-right: 1px solid #e9e9e7; }
    th:last-child, td:last-child { border-right: none; }
    th { font-size: 13px; color: #787774; font-weight: 500; }
    .num { text-align: right; font-family: "JetBrains Mono", Consolas, monospace; font-variant-numeric: tabular-nums; }
    footer { margin-top: 44px; padding-top: 18px; border-top: 1px solid #e9e9e7; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: #787774; }
    footer a { color: #37352f; text-decoration: none; border-bottom: 1px solid #e9e9e7; }
    footer a:hover { border-bottom-color: #37352f; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="svg-card">${svg}</div>
    <h2>12 个月逐月明细</h2>
    <table>
      <thead>
        <tr><th>月份</th><th>不买黑五时的原方案</th><th>黑五状态</th><th class="num">买黑五累积</th><th class="num">不买按月累积</th></tr>
      </thead>
      <tbody>${monthRowsHtml}</tbody>
    </table>
    <footer>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>Made by <a href="${GITHUB_USER_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_USER}</a> · <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_USER}/${GITHUB_REPO}</a></span>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * Rasterize the vector SVG into a crisp 3x ultra-HD PNG Blob (2880 x 2520)
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
