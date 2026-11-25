(function () {
  const {
    BF_DEAL_PRESETS,
    DEFAULT_STATE,
    HISTORICAL_TIMELINE,
    MONTHS,
    SCENARIO_PRESETS,
    TRY_FX_HISTORY,
    USAGE_MODES,
  } = window.SubLedgerData;

  const { calculateLedger, getTryRateAtOffset } = window.SubLedgerCalc;

  const STORAGE_KEY = 'ai_sub_ledger_state_v1';
  const MODE_CYCLE = ['ultra', 'pro1', 'pro2', 'none'];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let state = loadState();
  let activePresetId = 'tr_bf_baseline';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneState(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(cloneState(DEFAULT_STATE), parsed, {
        months: Array.isArray(parsed.months) && parsed.months.length === 12
          ? parsed.months
          : DEFAULT_STATE.months.slice(),
      });
    } catch {
      return cloneState(DEFAULT_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }

  function fmtYen(n, withSign) {
    const rounded = Math.round(n);
    if (withSign) {
      return `${rounded >= 0 ? '+' : '-'}¥${Math.abs(rounded).toLocaleString('zh-CN')}`;
    }
    return `¥${rounded.toLocaleString('zh-CN')}`;
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('is-visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  }

  function getModePillClass(mode) {
    switch (mode) {
      case 'ultra': return 'pill-dark';
      case 'pro1': return 'pill-blue';
      case 'pro2': return 'pill-amber';
      default: return 'pill-gray';
    }
  }

  function getModeShortLabel(mode) {
    const item = USAGE_MODES.find((m) => m.key === mode);
    return item ? item.short : '停用';
  }

  function renderStaticTables() {
    const presetList = document.getElementById('preset-list');
    presetList.innerHTML = SCENARIO_PRESETS.map(
      (p) => `
      <button class="sidebar-preset" data-preset-id="${p.id}">
        <span class="sidebar-preset-name">${p.name}</span>
        <span class="sidebar-preset-desc">${p.desc}</span>
      </button>`
    ).join('');

    presetList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset-id]');
      if (!btn) return;
      const found = SCENARIO_PRESETS.find((p) => p.id === btn.dataset.presetId);
      if (!found) return;
      state = cloneState(found.patch);
      activePresetId = found.id;
      syncInputsFromState();
      render();
      showToast(`已切换方案：${found.name}`);
    });

    const timelineTbody = document.getElementById('timeline-tbody');
    timelineTbody.innerHTML = HISTORICAL_TIMELINE.map((item) => {
      const tone =
        item.type === 'google' ? 'pill-dark' : item.type === 'milestone' ? 'pill-amber' : 'pill-gray';
      return `
        <tr>
          <td class="mono" style="white-space:nowrap;">${item.date}</td>
          <td style="font-weight:500;">${item.model}</td>
          <td><span class="pill ${tone}">${item.durability}</span></td>
          <td>${item.summary}</td>
        </tr>`;
    }).join('');

    const fxTbody = document.getElementById('fx-tbody');
    fxTbody.innerHTML = TRY_FX_HISTORY.map(
      (row) => `
        <tr>
          <td>${row.period}</td>
          <td class="num-col mono">${row.rate}</td>
          <td class="num-col mono">${row.yoy}</td>
          <td class="num-col mono">${row.pro870}</td>
          <td class="num-col mono">${row.ultra4750}</td>
        </tr>`
    ).join('');
  }

  function syncInputsFromState() {
    document.getElementById('inp-bf-preset').value = state.bfPreset;
    document.getElementById('inp-bf-cost').value = state.bfCostCny;
    document.getElementById('inp-ultra-cny').value = state.currentUltraCny;
    document.getElementById('inp-renewal-mode').value = state.ultraRenewalMode;
    document.getElementById('inp-fail-month').value = state.ultraFailMonthIndex;
    document.getElementById('inp-fallback-strategy').value = state.fallbackUltraStrategy;
    document.getElementById('inp-pro-region').value = state.monthlyProRegion;
    document.getElementById('inp-try-dep').value = state.tryAnnualDepRate;
    document.getElementById('inp-midyear-hike').checked = Boolean(state.googleMidYearHike);
    document.getElementById('inp-music-cny').value = state.musicMonthlyCny;
    document.getElementById('inp-sota-len').value = state.effectiveSotaMonths;
    document.getElementById('inp-next-interval').value = state.nextFlagshipInterval;
    document.getElementById('inp-retain-prob').value = state.retainProbPct;
  }

  function renderChart(res) {
    const container = document.getElementById('chart-container');
    const rows = res.monthlyRows;

    const width = 760;
    const height = 240;
    const padL = 56;
    const padR = 24;
    const padT = 24;
    const padB = 34;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxY = Math.max(
      600,
      ...rows.map((r) => Math.max(r.cumBuy, r.cumSkip))
    );
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
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="rgba(55,53,47,0.08)" stroke-width="1"/>
        <text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" fill="rgba(55,53,47,0.45)" font-size="11" font-family="JetBrains Mono, monospace">¥${Math.round(val)}</text>
      `);
    }

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    const nextGenBand =
      nextGenIdx >= 0
        ? `
        <rect x="${xAt(nextGenIdx).toFixed(1)}" y="${padT}" width="${(width - padR - xAt(nextGenIdx)).toFixed(1)}" height="${plotH}" fill="rgba(45,90,53,0.06)"/>
        <text x="${(xAt(nextGenIdx) + 6).toFixed(1)}" y="${padT + 14}" fill="#2d5a35" font-size="10.5" font-weight="500">预计新旗舰窗口</text>`
        : '';

    let crossoverSvg = '';
    if (res.crossoverMonthIndex !== null) {
      const cx = xAt(res.crossoverMonthIndex);
      const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#2d5a35" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#2d5a35" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 96, cx + 6).toFixed(1)}" y="${Math.max(padT + 26, cy - 8).toFixed(1)}" fill="#2d5a35" font-size="11" font-weight="600">${rows[res.crossoverMonthIndex].month.label}回本反超</text>
      `;
    }

    const xLabels = rows
      .map((r, i) => {
        const x = xAt(i).toFixed(1);
        return `
          <text x="${x}" y="${height - 10}" text-anchor="middle" fill="rgba(55,53,47,0.55)" font-size="11">${r.month.label}</text>
          <circle cx="${x}" cy="${yAt(r.cumBuy).toFixed(1)}" r="2.6" fill="#37352f"/>
          <circle cx="${x}" cy="${yAt(r.cumSkip).toFixed(1)}" r="2.4" fill="#9b9a97"/>
        `;
      })
      .join('');

    const lastRow = rows[rows.length - 1];
    const lastX = xAt(rows.length - 1);
    const buyLabelY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip)
      ? yAt(lastRow.cumBuy) - 8
      : yAt(lastRow.cumBuy) + 14;
    const skipLabelY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip)
      ? yAt(lastRow.cumSkip) + 14
      : yAt(lastRow.cumSkip) - 8;

    const endLabels = `
      <text x="${(lastX - 6).toFixed(1)}" y="${buyLabelY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="11" font-weight="600" font-family="JetBrains Mono, monospace">买:${fmtYen(lastRow.cumBuy)}</text>
      <text x="${(lastX - 6).toFixed(1)}" y="${skipLabelY.toFixed(1)}" text-anchor="end" fill="rgba(55,53,47,0.6)" font-size="11" font-family="JetBrains Mono, monospace">不买:${fmtYen(lastRow.cumSkip)}</text>
    `;

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12个月累积支出对比图">
        ${nextGenBand}
        ${gridLines.join('')}
        <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="2" stroke-dasharray="5 4"/>
        <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
        ${xLabels}
        ${crossoverSvg}
        ${endLabels}
      </svg>
    `;
  }

  function render() {
    saveState();
    const res = calculateLedger(state);

    document.querySelectorAll('[data-preset-id]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.presetId === activePresetId);
    });

    const showFailMonth = state.ultraRenewalMode === 'fail_at';
    const showFallback = state.ultraRenewalMode !== 'always';
    document.getElementById('wrap-fail-month').style.display = showFailMonth ? 'flex' : 'none';
    document.getElementById('wrap-fallback-strategy').style.display = showFallback ? 'flex' : 'none';

    document.getElementById('lbl-bf-cny').textContent = fmtYen(state.bfCostCny);
    const presetInfo = BF_DEAL_PRESETS[state.bfPreset];
    document.getElementById('help-bf-note').textContent = presetInfo ? presetInfo.note : '';
    document.getElementById('lbl-ultra-cny').textContent = `${fmtYen(state.currentUltraCny)} / 月`;
    document.getElementById('lbl-fail-month').textContent = MONTHS[state.ultraFailMonthIndex]?.fullLabel || '';
    document.getElementById('lbl-pro-now').textContent = `${fmtYen(res.monthlyRows[0].proUnit)} / 月`;
    document.getElementById('lbl-try-dep').textContent = `${state.tryAnnualDepRate}% / 年`;

    const aprRate = getTryRateAtOffset(5, state.tryAnnualDepRate);
    const novRate = getTryRateAtOffset(12, state.tryAnnualDepRate);
    document.getElementById('help-try-preview').textContent =
      `按此速率推算：明年4月 1元≈${aprRate.toFixed(2)} TRY（870 TRY≈¥${Math.round(870 / aprRate)}），明年11月 1元≈${novRate.toFixed(2)} TRY（≈¥${Math.round(870 / novRate)}）。`;

    document.getElementById('lbl-music-cny').textContent = `${fmtYen(state.musicMonthlyCny)} / 月`;
    document.getElementById('lbl-sota-len').textContent = `${state.effectiveSotaMonths} 个月`;
    document.getElementById('lbl-next-interval').textContent = `${state.nextFlagshipInterval} 个月`;
    document.getElementById('lbl-retain-prob').textContent = `${state.retainProbPct}%`;

    document.getElementById('prop-verdict').innerHTML = `
      <span class="pill pill-${res.verdict.tone}">${res.verdict.badge}</span>
      <span class="mono" style="color:var(--ink-secondary);font-size:13px;">期望净值 ${fmtYen(res.expectedNetSavings, true)} · 回本需 ${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) : '--'} 个月</span>
    `;

    const callout = document.getElementById('verdict-callout');
    callout.className = `notion-callout tone-${res.verdict.tone}`;
    const badge = document.getElementById('verdict-badge');
    badge.className = `pill pill-${res.verdict.tone}`;
    badge.textContent = res.verdict.badge;
    document.getElementById('verdict-headline').textContent = res.verdict.headline;
    document.getElementById('verdict-detail').textContent = res.verdict.detail;

    document.getElementById('kpi-bf-cost').textContent = fmtYen(res.bfCost);
    document.getElementById('kpi-bf-monthly').textContent = `折合 ¥${res.bfMonthlyAvg.toFixed(1)} / 月`;

    document.getElementById('kpi-breakeven').textContent = Number.isFinite(res.breakEvenMonths)
      ? `${res.breakEvenMonths.toFixed(1)} 个月`
      : '无法回本';
    document.getElementById('kpi-avg-pro').textContent = `对比月付均价 ¥${Math.round(res.avgProPrice)} / 月`;

    const evEl = document.getElementById('kpi-ev');
    evEl.textContent = fmtYen(res.expectedNetSavings, true);
    evEl.className = `kpi-value mono ${res.expectedNetSavings > 0 ? 'is-positive' : res.expectedNetSavings < 0 ? 'is-negative' : ''}`;
    document.getElementById('kpi-prob-line').textContent = `盈亏概率门槛 ${res.breakEvenProbPct.toFixed(1)}%`;

    document.getElementById('kpi-upside-downside').textContent =
      `${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`;
    const oddsRatio = res.downsideNet < 0 ? Math.max(0, res.upsideNet) / Math.abs(res.downsideNet) : Infinity;
    document.getElementById('kpi-odds-sub').textContent = Number.isFinite(oddsRatio)
      ? `盈亏赔率比 ${oddsRatio.toFixed(2)} : 1`
      : '无下行亏损风险';

    const thresholdClamped = Math.min(96, Math.max(4, res.breakEvenProbPct));
    document.getElementById('ev-threshold-line').style.left = `${thresholdClamped}%`;
    document.getElementById('ev-threshold-tag').textContent = `盈亏线 ${res.breakEvenProbPct.toFixed(0)}%`;
    document.getElementById('ev-user-dot').style.left = `${state.retainProbPct}%`;
    const probGap = state.retainProbPct - res.breakEvenProbPct;
    document.getElementById('lbl-ev-gap').textContent =
      probGap >= 0 ? `高于盈亏线 +${probGap.toFixed(1)}%` : `低于盈亏线 ${probGap.toFixed(1)}%`;

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = res.monthlyRows
      .map((row) => {
        const fallbackHint =
          row.effectiveMode === 'pro2_fallback'
            ? '已切双Pro'
            : row.mode === 'ultra' && !row.trAvailable
              ? '断续兜底'
              : `Pro ¥${Math.round(row.proUnit)}`;
        return `
          <button class="month-card mode-${row.mode}" data-month-idx="${row.index}" title="${row.month.fullLabel}：点击切换用量模式">
            <div class="month-card-top">
              <span class="month-name">${row.month.label}</span>
              <span class="month-price mono">${fallbackHint}</span>
            </div>
            <div class="month-badge-row">
              <span class="pill ${getModePillClass(row.mode)}">${getModeShortLabel(row.mode)}</span>
            </div>
            <div class="month-phase tone-${row.phase.tone}">${row.phase.label}</div>
          </button>`;
      })
      .join('');

    document.getElementById('calendar-summary').innerHTML = `
      <span>统计：Ultra 重叠 <strong>${res.ultraOverlapMonths}</strong> 个月 · 黑五 Pro 实际生效 <strong>${res.proCoveredMonths}</strong> 个月 · 停用 <strong>${res.idleNoneMonths}</strong> 个月</span>
      <span class="mono">可替代月付 Pro 总额：${fmtYen(res.totalProValueSaved)}</span>
    `;

    renderChart(res);

    const tbody = document.getElementById('scenarios-tbody');
    tbody.innerHTML = res.scenarios
      .map((sc) => {
        const diffCls = sc.diff > 0 ? 'diff-pos' : sc.diff < 0 ? 'diff-neg' : '';
        const diffLabel = sc.diff >= 0 ? `省 ${fmtYen(sc.diff)}` : `亏 ${fmtYen(Math.abs(sc.diff))}`;
        return `
          <tr>
            <td style="font-weight:500;">${sc.title}</td>
            <td><span class="pill pill-${sc.tone}">${sc.tag}</span></td>
            <td class="num-col mono">${fmtYen(sc.buyTotal)}</td>
            <td class="num-col mono">${fmtYen(sc.skipTotal)}</td>
            <td class="num-col mono ${diffCls}">${diffLabel}</td>
          </tr>`;
      })
      .join('');
  }

  function bindEvents() {
    const shell = document.getElementById('app-shell');
    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
      if (window.innerWidth <= 960) {
        shell.classList.toggle('sidebar-open-mobile');
      } else {
        shell.classList.toggle('sidebar-collapsed');
      }
    });

    document.querySelectorAll('.sidebar-link').forEach((link) => {
      link.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('is-active'));
        link.classList.add('is-active');
        shell.classList.remove('sidebar-open-mobile');
      });
    });

    document.getElementById('calendar-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-month-idx]');
      if (!card) return;
      const idx = Number(card.dataset.monthIdx);
      const cur = state.months[idx] || 'none';
      const next = MODE_CYCLE[(MODE_CYCLE.indexOf(cur) + 1) % MODE_CYCLE.length];
      state.months[idx] = next;
      activePresetId = null;
      render();
    });

    document.querySelectorAll('[data-cal-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.calPreset;
        if (key === 'default') {
          state.months = ['ultra', 'ultra', 'ultra', 'ultra', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1'];
        } else if (key === 'offseason_only') {
          state.months = ['pro1', 'ultra', 'ultra', 'ultra', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1', 'none', 'none', 'none'];
        } else if (key === 'all_pro') {
          state.months = Array(12).fill('pro1');
        } else if (key === 'heavy_double') {
          state.months = ['pro2', 'pro2', 'pro2', 'pro2', 'pro1', 'pro1', 'pro1', 'pro1', 'pro1', 'none', 'none', 'none'];
        }
        activePresetId = null;
        render();
      });
    });

    document.getElementById('inp-bf-preset').addEventListener('change', (e) => {
      const val = e.target.value;
      state.bfPreset = val;
      if (val !== 'custom' && BF_DEAL_PRESETS[val]) {
        state.bfCostCny = BF_DEAL_PRESETS[val].cnyCost;
        document.getElementById('inp-bf-cost').value = state.bfCostCny;
      }
      activePresetId = null;
      render();
    });

    document.getElementById('inp-bf-cost').addEventListener('input', (e) => {
      state.bfCostCny = Math.max(0, Number(e.target.value) || 0);
      state.bfPreset = 'custom';
      document.getElementById('inp-bf-preset').value = 'custom';
      activePresetId = null;
      render();
    });

    document.getElementById('inp-ultra-cny').addEventListener('input', (e) => {
      state.currentUltraCny = Math.max(0, Number(e.target.value) || 0);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-renewal-mode').addEventListener('change', (e) => {
      state.ultraRenewalMode = e.target.value;
      activePresetId = null;
      render();
    });

    document.getElementById('inp-fail-month').addEventListener('input', (e) => {
      state.ultraFailMonthIndex = Number(e.target.value);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-fallback-strategy').addEventListener('change', (e) => {
      state.fallbackUltraStrategy = e.target.value;
      activePresetId = null;
      render();
    });

    document.getElementById('inp-pro-region').addEventListener('change', (e) => {
      state.monthlyProRegion = e.target.value;
      activePresetId = null;
      render();
    });

    document.getElementById('inp-try-dep').addEventListener('input', (e) => {
      state.tryAnnualDepRate = Number(e.target.value);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-midyear-hike').addEventListener('change', (e) => {
      state.googleMidYearHike = e.target.checked;
      activePresetId = null;
      render();
    });

    document.getElementById('inp-music-cny').addEventListener('input', (e) => {
      state.musicMonthlyCny = Math.max(0, Number(e.target.value) || 0);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-sota-len').addEventListener('input', (e) => {
      state.effectiveSotaMonths = Number(e.target.value);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-next-interval').addEventListener('input', (e) => {
      state.nextFlagshipInterval = Number(e.target.value);
      activePresetId = null;
      render();
    });

    document.getElementById('inp-retain-prob').addEventListener('input', (e) => {
      state.retainProbPct = Number(e.target.value);
      activePresetId = null;
      render();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state = cloneState(DEFAULT_STATE);
      activePresetId = 'tr_bf_baseline';
      syncInputsFromState();
      render();
      showToast('已恢复默认参数');
    });

    document.getElementById('btn-copy-summary').addEventListener('click', async () => {
      const res = calculateLedger(state);
      const lines = [
        '【Gemini 黑五包年决策账本摘要】',
        `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
        `- 黑五成本：${fmtYen(res.bfCost)}/年（折合 ¥${res.bfMonthlyAvg.toFixed(1)}/月）`,
        `- 回本周期：${res.breakEvenMonths.toFixed(1)} 个月（月付 Pro 均价 ¥${Math.round(res.avgProPrice)}/月）`,
        `- 期望净收益 (EV)：${fmtYen(res.expectedNetSavings, true)}（你的把握 ${state.retainProbPct}% vs 盈亏线 ${res.breakEvenProbPct.toFixed(1)}%）`,
        `- 最大赢 / 最大亏：${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`,
        `- 12 个月配置：Ultra ${res.ultraOverlapMonths} 月 / Pro 生效 ${res.proCoveredMonths} 月 / 停用 ${res.idleNoneMonths} 月`,
      ].join('\n');

      try {
        await navigator.clipboard.writeText(lines);
        showToast('已复制决策摘要到剪贴板');
      } catch {
        showToast('复制失败，请手动查看页面结论');
      }
    });
  }

  renderStaticTables();
  syncInputsFromState();
  bindEvents();
  render();
})();
