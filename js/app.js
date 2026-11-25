(function () {
  const {
    BF_DEAL_PRESETS,
    DEFAULT_STATE,
    HISTORICAL_TIMELINE,
    MONTHS,
    SCENARIO_PRESETS,
    SUB_CATALOG,
    TRY_FX_HISTORY,
    buildMonthPlan,
    makeSubItem,
  } = window.SubLedgerData;

  const { calculateLedger, getTryRateAtOffset } = window.SubLedgerCalc;

  const STORAGE_KEY = 'ai_sub_ledger_state_v4';

  const STEPS = [
    { idx: 0, label: '1. 方案', nextLabel: '下一步：排布 12 个月组合 →' },
    { idx: 1, label: '2. 用量', nextLabel: '下一步：核对续费与汇率 →' },
    { idx: 2, label: '3. 续费与汇率', nextLabel: '下一步：评估模型周期 →' },
    { idx: 3, label: '4. 周期与把握', nextLabel: '查看最终结论 →' },
    { idx: 4, label: '5. 结论', nextLabel: '回到第 1 步' },
  ];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let state = loadState();
  let currentStep = 0;
  let maxVisitedStep = 0;
  let selectedMonths = new Set([0, 1, 2, 3]);

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneState(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(cloneState(DEFAULT_STATE), parsed, {
        monthPlans: Array.isArray(parsed.monthPlans) && parsed.monthPlans.length === 12
          ? parsed.monthPlans
          : cloneState(DEFAULT_STATE.monthPlans),
      });
    } catch {
      return cloneState(DEFAULT_STATE);
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

  function formatFutureMonth(baseYear, baseMonth, addMonths) {
    const total = baseYear * 12 + (baseMonth - 1) + Math.round(addMonths);
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    return `${y}年${m}月`;
  }

  function escapeHtml(str) {
    return String(str)
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

  function goToStep(stepIdx) {
    currentStep = Math.max(0, Math.min(STEPS.length - 1, stepIdx));
    maxVisitedStep = Math.max(maxVisitedStep, currentStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }

  function getSelectedIndices() {
    const arr = Array.from(selectedMonths).filter((i) => i >= 0 && i < 12).sort((a, b) => a - b);
    if (arr.length === 0) {
      selectedMonths.add(0);
      return [0];
    }
    return arr;
  }

  function mutateSelectedMonths(mutator) {
    getSelectedIndices().forEach((mIdx) => {
      if (!Array.isArray(state.monthPlans[mIdx])) state.monthPlans[mIdx] = [];
      mutator(state.monthPlans[mIdx], mIdx);
    });
    render();
  }

  function renderStaticTables() {
    // Topbar preset picker
    const presetPicker = document.getElementById('inp-preset-picker');
    presetPicker.innerHTML =
      '<option value="">载入示例...</option>' +
      SCENARIO_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');

    // Catalog dropdown
    const catalogSelect = document.getElementById('inp-add-catalog');
    catalogSelect.innerHTML = SUB_CATALOG.map((c) => {
      const tag = c.dynamicPrice ? '动态跟随汇率' : `¥${c.defaultPriceCny}/月`;
      return `<option value="${c.id}">${c.name}（${tag}）</option>`;
    }).join('');
    updateCatalogNote();

    // Historical timeline table
    document.getElementById('timeline-tbody').innerHTML = HISTORICAL_TIMELINE.map(
      (item) => `
        <tr>
          <td class="mono" style="white-space:nowrap;">${item.date}</td>
          <td style="font-weight:500;">${item.model}</td>
          <td style="white-space:nowrap;"><span class="tag tag-gray">${item.durability}</span></td>
          <td>${item.summary}</td>
        </tr>`
    ).join('');

    // FX history table
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

  function updateCatalogNote() {
    const id = document.getElementById('inp-add-catalog').value;
    const found = SUB_CATALOG.find((c) => c.id === id);
    document.getElementById('help-catalog-note').textContent = found ? found.note : '';
  }

  function syncInputsFromState() {
    document.getElementById('inp-bf-cost').value = state.bfCostCny;
    document.getElementById('inp-ultra-cny').value = state.currentUltraCny;
    document.getElementById('inp-fail-month').value = state.ultraFailMonthIndex;
    document.getElementById('inp-fallback-strategy').value = state.fallbackUltraStrategy;
    document.getElementById('inp-try-dep').value = state.tryAnnualDepRate;
    document.getElementById('inp-midyear-hike').checked = Boolean(state.googleMidYearHike);
    document.getElementById('inp-music-cny').value = state.musicMonthlyCny;
    document.getElementById('inp-sota-len').value = state.effectiveSotaMonths;
    document.getElementById('inp-next-interval').value = state.nextFlagshipInterval;
    document.getElementById('inp-retain-prob').value = state.retainProbPct;
  }

  function renderStepTabs() {
    document.getElementById('step-nav-list').innerHTML = STEPS.map((s, idx) => {
      const cls = idx === currentStep ? 'is-current' : idx <= maxVisitedStep ? 'is-done' : '';
      return `<button type="button" class="step-tab ${cls}" data-go-step="${idx}">${s.label}</button>`;
    }).join('');
  }

  function renderStep2Editor(res) {
    const indices = getSelectedIndices();
    const names = indices.map((i) => MONTHS[i].label);
    document.getElementById('editor-selected-title').textContent =
      `正在编辑：${names.join('、')}（共 ${indices.length} 个月）`;

    const map = new Map();
    indices.forEach((mIdx) => {
      res.monthlyRows[mIdx].items.forEach((item) => {
        if (!map.has(item.id)) {
          map.set(item.id, { item, countMonths: 1, qtys: new Set([item.qty]) });
        } else {
          const e = map.get(item.id);
          e.countMonths += 1;
          e.qtys.add(item.qty);
        }
      });
    });

    const listEl = document.getElementById('editor-items-list');
    if (map.size === 0) {
      listEl.innerHTML = '<div class="sub-empty">所选月份暂无订阅，可在下方添加常见订阅或自定义订阅。</div>';
      return;
    }

    listEl.innerHTML = Array.from(map.values())
      .map(({ item, countMonths, qtys }) => {
        const hint =
          countMonths < indices.length
            ? `<span class="sub-hint">${countMonths}/${indices.length} 个月含此项</span>`
            : qtys.size > 1
              ? '<span class="sub-hint">各月数量不同</span>'
              : '';

        const priceHtml = item.dynamicPrice
          ? `<span class="price-inline mono">≈ ¥${Math.round(item.unitCny)}/月</span>`
          : `<span class="price-inline">
               <span class="unit">¥</span>
               <input class="flat-input mono" type="number" min="0" max="10000" step="1" value="${Math.round(item.priceCny)}" data-edit-price-id="${escapeHtml(item.id)}" style="width:70px;height:26px;text-align:right;" />
               <span class="unit">/月</span>
             </span>`;

        return `
          <div class="sub-row">
            <div class="sub-info">
              <span class="tag tag-${item.tone || 'gray'}">${escapeHtml(item.short)}</span>
              <span class="sub-name">${escapeHtml(item.name)}</span>
              ${hint}
            </div>
            ${priceHtml}
            <div class="qty-ctrl">
              <button type="button" class="qty-btn" data-qty-delta="-1" data-item-id="${escapeHtml(item.id)}" aria-label="减">−</button>
              <span class="qty-num mono">${item.qty}</span>
              <button type="button" class="qty-btn" data-qty-delta="1" data-item-id="${escapeHtml(item.id)}" aria-label="加">+</button>
            </div>
            <button type="button" class="del-btn" data-remove-id="${escapeHtml(item.id)}">移除</button>
          </div>`;
      })
      .join('');
  }

  function renderChart(res) {
    const container = document.getElementById('chart-container');
    const rows = res.monthlyRows;

    const width = 630;
    const height = 210;
    const padL = 56;
    const padR = 20;
    const padT = 20;
    const padB = 30;
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
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="rgba(55,53,47,0.07)" stroke-width="1"/>
        <text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" fill="rgba(55,53,47,0.42)" font-size="10.5" font-family="JetBrains Mono, monospace">¥${Math.round(val)}</text>
      `);
    }

    let crossoverSvg = '';
    if (res.crossoverMonthIndex !== null) {
      const cx = xAt(res.crossoverMonthIndex);
      const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#2d5a35" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="#2d5a35" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 88, cx + 6).toFixed(1)}" y="${Math.max(padT + 18, cy - 8).toFixed(1)}" fill="#2d5a35" font-size="11" font-weight="600">${rows[res.crossoverMonthIndex].month.label}回本</text>
      `;
    }

    const xLabels = rows
      .map((r, i) => {
        const x = xAt(i).toFixed(1);
        return `
          <text x="${x}" y="${height - 8}" text-anchor="middle" fill="rgba(55,53,47,0.5)" font-size="10.5">${r.month.label}</text>
          <circle cx="${x}" cy="${yAt(r.cumBuy).toFixed(1)}" r="2.2" fill="#37352f"/>
        `;
      })
      .join('');

    const lastRow = rows[rows.length - 1];
    const lastX = xAt(rows.length - 1);
    const buyY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumBuy) - 8 : yAt(lastRow.cumBuy) + 14;
    const skipY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumSkip) + 14 : yAt(lastRow.cumSkip) - 8;

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12个月累积支出对比图">
        ${gridLines.join('')}
        <polyline points="${skipPts}" fill="none" stroke="rgba(55,53,47,0.35)" stroke-width="1.8" stroke-dasharray="4 4"/>
        <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2"/>
        ${xLabels}
        ${crossoverSvg}
        <text x="${(lastX - 4).toFixed(1)}" y="${buyY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="11" font-weight="600" font-family="JetBrains Mono, monospace">买:${fmtYen(lastRow.cumBuy)}</text>
        <text x="${(lastX - 4).toFixed(1)}" y="${skipY.toFixed(1)}" text-anchor="end" fill="rgba(55,53,47,0.55)" font-size="11" font-family="JetBrains Mono, monospace">不买:${fmtYen(lastRow.cumSkip)}</text>
      </svg>
    `;
  }

  function render() {
    saveState();
    const res = calculateLedger(state);

    document.querySelectorAll('.step').forEach((sec) => {
      sec.classList.toggle('is-active', Number(sec.dataset.step) === currentStep);
    });
    renderStepTabs();

    document.getElementById('btn-prev').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    document.getElementById('btn-next').textContent = STEPS[currentStep].nextLabel;
    document.getElementById('btn-copy-summary').style.display = currentStep === 4 ? 'inline-flex' : 'none';

    // STEP 1
    document.querySelectorAll('[data-bf-choice]').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.bfChoice === state.bfPreset);
    });
    document.getElementById('panel-bf-custom').style.display = state.bfPreset === 'custom' ? 'block' : 'none';
    document.getElementById('lbl-custom-preview').textContent =
      state.bfPreset === 'custom' ? `${fmtYen(state.bfCostCny)} / 年` : '自定义';

    const rawMonths = res.bfCost / res.monthlyRows[0].proUnit;
    document.getElementById('insight-step-0-title').textContent =
      `折合 ¥${res.bfMonthlyAvg.toFixed(1)} / 月 · 裸回本约 ${rawMonths.toFixed(1)} 个月`;
    document.getElementById('insight-step-0-detail').textContent =
      `按当前月付 Pro（${fmtYen(res.monthlyRows[0].proUnit)}/月）粗算，全年至少有 ${rawMonths.toFixed(1)} 个月用到 Pro 才不亏。下一步排布你每个月实际要开哪些订阅。`;

    // STEP 2 Calendar
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = res.monthlyRows
      .map((row) => {
        const isSel = selectedMonths.has(row.index);
        const isIdleByUltra = row.hasUltraActive && row.geminiProSlots === 0;
        const isCompletelyIdle = !row.hasUltraActive && row.geminiProSlots === 0;
        const tagsHtml =
          row.items.length === 0
            ? '<span class="tag tag-gray">停用</span>'
            : row.items
                .map((it) => `<span class="tag tag-${it.tone || 'gray'}">${escapeHtml(it.short)}${it.qty > 1 ? `×${it.qty}` : ''}</span>`)
                .join('');

        const footRight = isIdleByUltra
          ? '<span class="idle-mark">黑五空闲</span>'
          : isCompletelyIdle
            ? '<span>黑五闲置</span>'
            : '';

        return `
          <button type="button" class="month-cell ${isSel ? 'is-selected' : ''}" data-month-idx="${row.index}">
            <div class="month-top">
              <span class="month-label">${row.month.label}</span>
              <span class="month-cost mono">${fmtYen(row.skipMonthFlow)}</span>
            </div>
            <div class="month-tags">${tagsHtml}</div>
            <div class="month-foot">
              <span>${row.phase.label}</span>
              ${footRight}
            </div>
          </button>`;
      })
      .join('');

    renderStep2Editor(res);

    // Step 2 Idle & Summary Insight
    const idleUltraMonths = res.monthlyRows
      .filter((r) => r.hasUltraActive && r.geminiProSlots === 0)
      .map((r) => r.month.label);
    const idleText =
      res.ultraOverlapMonths > 0
        ? `其中 ${idleUltraMonths.join('、')}（共 ${res.ultraOverlapMonths} 个月）因已开 Ultra，黑五 Pro 将处于空闲状态，对应约 ${fmtYen(res.ultraIdleCostCny)} 年费白交；`
        : '当前排布没有被 Ultra 覆盖的黑五空闲月；';

    document.getElementById('insight-step-1-title').textContent =
      `黑五 Pro 生效 ${res.proCoveredMonths} 个月 · 因 Ultra 空闲 ${res.ultraOverlapMonths} 个月 · 停用 ${res.idleNoneMonths} 个月`;
    document.getElementById('insight-step-1-detail').textContent =
      `${idleText}黑五实际可替代 ${res.proCoveredMonths} 个月的 Pro 槽位（合 ${fmtYen(res.totalProValueSaved)}）；其他订阅全年共 ${fmtYen(res.totalOtherSubsAnnual)}，不买黑五时全年总账 ${fmtYen(res.totalSkipCost)}。`;

    // STEP 3
    document.querySelectorAll('[data-renewal]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.renewal === state.ultraRenewalMode);
    });
    document.getElementById('wrap-fail-month').style.display = state.ultraRenewalMode === 'fail_at' ? 'grid' : 'none';
    document.getElementById('wrap-fallback-strategy').style.display = state.ultraRenewalMode !== 'always' ? 'grid' : 'none';
    document.getElementById('lbl-fail-month').textContent = MONTHS[state.ultraFailMonthIndex]?.fullLabel || '';

    document.querySelectorAll('[data-pro-region]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.proRegion === state.monthlyProRegion);
    });
    document.getElementById('wrap-tr-fx').style.display = state.monthlyProRegion === 'tr' ? 'block' : 'none';
    document.getElementById('lbl-try-dep').textContent = `${state.tryAnnualDepRate}%`;

    const aprRate = getTryRateAtOffset(5, state.tryAnnualDepRate);
    const novRate = getTryRateAtOffset(12, state.tryAnnualDepRate);
    document.getElementById('help-try-preview').textContent =
      `推算：2027年4月 1元≈${aprRate.toFixed(2)} TRY（870 TRY≈¥${Math.round(870 / aprRate)}），11月 1元≈${novRate.toFixed(2)} TRY（≈¥${Math.round(870 / novRate)}）。`;

    document.getElementById('insight-step-2-title').textContent =
      `折算后月付 Pro 均价约 ¥${Math.round(res.avgProPrice)}/月，需有效用满 ${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) : '--'} 个月回本`;
    document.getElementById('insight-step-2-detail').textContent =
      res.proCoveredMonths >= res.breakEvenMonths
        ? `你排布了 ${res.proCoveredMonths} 个有效 Pro 月份，账面已越过回本线；下一步算入“模型可能掉队”的风险概率。`
        : `你目前只排布了 ${res.proCoveredMonths} 个有效 Pro 月份，低于回本线，直接按月买更省钱。`;

    // STEP 4
    document.getElementById('lbl-sota-len').textContent = `${state.effectiveSotaMonths} 个月`;
    document.getElementById('lbl-next-interval').textContent = `${state.nextFlagshipInterval} 个月`;
    document.getElementById('lbl-retain-prob').textContent = `${state.retainProbPct}%`;
    document.getElementById('help-sota-until').textContent =
      `自 2026年11月起算 ${state.effectiveSotaMonths} 个月，预计稳态可用至 ${formatFutureMonth(2026, 11, state.effectiveSotaMonths)}。`;
    document.getElementById('help-next-when').textContent =
      `自 2026年11月起算 ${state.nextFlagshipInterval} 个月，下代好用旗舰预计在 ${formatFutureMonth(2026, 11, state.nextFlagshipInterval)} 登场。`;

    const thresholdClamped = Math.min(96, Math.max(4, res.breakEvenProbPct));
    document.getElementById('ev-threshold-line').style.left = `${thresholdClamped}%`;
    document.getElementById('ev-threshold-tag').textContent = `盈亏线 ${res.breakEvenProbPct.toFixed(0)}%`;
    document.getElementById('ev-user-dot').style.left = `${state.retainProbPct}%`;
    const probGap = state.retainProbPct - res.breakEvenProbPct;
    document.getElementById('lbl-ev-gap').textContent =
      probGap >= 0 ? `高于盈亏线 +${probGap.toFixed(1)}%` : `低于盈亏线 ${probGap.toFixed(1)}%`;

    document.getElementById('insight-step-3-title').textContent =
      `当前期望净收益 (EV)：${fmtYen(res.expectedNetSavings, true)}`;
    document.getElementById('insight-step-3-detail').textContent =
      probGap >= 0
        ? `你的把握（${state.retainProbPct}%）高于盈亏门槛（${res.breakEvenProbPct.toFixed(1)}%），这笔年付为正期望。点下一步查看完整账本。`
        : `你的把握（${state.retainProbPct}%）低于盈亏门槛（${res.breakEvenProbPct.toFixed(1)}%），提前锁年付期望为负。`;

    // STEP 5 Final Ledger
    const badge = document.getElementById('verdict-badge');
    badge.className = `tag tag-${res.verdict.tone}`;
    badge.textContent = res.verdict.badge;
    document.getElementById('verdict-headline').textContent = res.verdict.headline;
    document.getElementById('verdict-detail').textContent = res.verdict.detail;

    document.getElementById('kpi-bf-cost').textContent = fmtYen(res.bfCost);
    document.getElementById('kpi-bf-monthly').textContent = `（折合 ¥${res.bfMonthlyAvg.toFixed(1)}/月）`;

    const idleSummaryEl = document.getElementById('kpi-idle-summary');
    idleSummaryEl.textContent =
      res.totalIdleMonths > 0
        ? `共 ${res.totalIdleMonths} 个月空闲（Ultra 重叠 ${res.ultraOverlapMonths} 月 + 停用 ${res.idleNoneMonths} 月，折合白交约 ${fmtYen(res.totalIdleCostCny)}）`
        : '0 个月（全年 12 个月均在生效）';

    document.getElementById('kpi-breakeven').textContent = Number.isFinite(res.breakEvenMonths)
      ? `${res.breakEvenMonths.toFixed(1)} 个月`
      : '无法回本';
    document.getElementById('kpi-avg-pro').textContent = `（对比月付均价 ¥${Math.round(res.avgProPrice)}/月）`;

    const evEl = document.getElementById('kpi-ev');
    evEl.textContent = fmtYen(res.expectedNetSavings, true);
    evEl.className = res.expectedNetSavings > 0 ? 'is-pos' : res.expectedNetSavings < 0 ? 'is-neg' : '';
    document.getElementById('kpi-prob-line').textContent = `（盈亏概率线 ${res.breakEvenProbPct.toFixed(1)}%）`;

    document.getElementById('kpi-upside-downside').textContent =
      `${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`;
    const oddsRatio = res.downsideNet < 0 ? Math.max(0, res.upsideNet) / Math.abs(res.downsideNet) : Infinity;
    document.getElementById('kpi-odds-sub').textContent = Number.isFinite(oddsRatio)
      ? `（赔率比 ${oddsRatio.toFixed(2)} : 1）`
      : '（无下行亏损）';

    // Explicit Idle Period Callout in Step 5
    const idleCallout = document.getElementById('idle-callout');
    if (res.totalIdleMonths > 0) {
      idleCallout.style.display = 'block';
      document.getElementById('idle-callout-title').textContent =
        `空闲期提醒：全年有 ${res.totalIdleMonths} 个月黑五 Pro 处于闲置状态`;
      document.getElementById('idle-callout-detail').textContent =
        res.ultraOverlapMonths > 0
          ? `在 ${idleUltraMonths.join('、')} 这 ${res.ultraOverlapMonths} 个月里，因为你开了 Ultra，副号黑五 Pro 相当于空闲吃灰（约占年费 ${Math.round((res.ultraOverlapMonths / 12) * 100)}%，即 ${fmtYen(res.ultraIdleCostCny)}）。黑五的真实盈利，完全靠剩下 ${res.proCoveredMonths} 个 Pro 生效月份赚回来。`
          : `你当前有 ${res.idleNoneMonths} 个停用月份黑五 Pro 会闲置（折合 ${fmtYen(res.totalIdleCostCny)}）。`;
    } else {
      idleCallout.style.display = 'none';
    }

    renderChart(res);

    document.getElementById('scenarios-tbody').innerHTML = res.scenarios
      .map((sc) => {
        const cls = sc.diff > 0 ? 'is-pos' : sc.diff < 0 ? 'is-neg' : '';
        const diffLabel = sc.diff >= 0 ? `省 ${fmtYen(sc.diff)}` : `亏 ${fmtYen(Math.abs(sc.diff))}`;
        return `
          <tr>
            <td>${sc.title}</td>
            <td class="num mono">${fmtYen(sc.buyTotal)}</td>
            <td class="num mono">${fmtYen(sc.skipTotal)}</td>
            <td class="num mono ${cls}" style="font-weight:600;">${diffLabel}</td>
          </tr>`;
      })
      .join('');
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
      syncInputsFromState();
      e.target.value = '';
      goToStep(4);
      showToast(`已载入：${found.name}`);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state = cloneState(DEFAULT_STATE);
      selectedMonths = new Set([0, 1, 2, 3]);
      syncInputsFromState();
      goToStep(0);
      showToast('已重置默认参数');
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
      if (currentStep > 0) goToStep(currentStep - 1);
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      if (currentStep < STEPS.length - 1) goToStep(currentStep + 1);
      else goToStep(0);
    });

    // Step 1
    document.getElementById('bf-choice-grid').addEventListener('click', (e) => {
      const row = e.target.closest('[data-bf-choice]');
      if (!row) return;
      const choice = row.dataset.bfChoice;
      state.bfPreset = choice;
      if (choice !== 'custom' && BF_DEAL_PRESETS[choice]) {
        state.bfCostCny = BF_DEAL_PRESETS[choice].cnyCost;
        document.getElementById('inp-bf-cost').value = state.bfCostCny;
      }
      render();
    });

    document.getElementById('inp-bf-cost').addEventListener('input', (e) => {
      state.bfCostCny = Math.max(0, Number(e.target.value) || 0);
      state.bfPreset = 'custom';
      render();
    });

    // Step 2
    document.getElementById('calendar-grid').addEventListener('click', (e) => {
      const cell = e.target.closest('[data-month-idx]');
      if (!cell) return;
      const idx = Number(cell.dataset.monthIdx);
      if (selectedMonths.has(idx)) {
        if (selectedMonths.size > 1) selectedMonths.delete(idx);
      } else {
        selectedMonths.add(idx);
      }
      render();
    });

    document.querySelectorAll('[data-select-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.selectRange;
        if (key === 'peak') selectedMonths = new Set([0, 1, 2, 3]);
        else if (key === 'jan_mar') selectedMonths = new Set([1, 2, 3]);
        else if (key === 'offseason') selectedMonths = new Set([4, 5, 6, 7, 8]);
        else if (key === 'autumn') selectedMonths = new Set([9, 10, 11]);
        else if (key === 'all') selectedMonths = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        render();
      });
    });

    document.getElementById('inp-plan-template').addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;
      state.monthPlans = buildMonthPlan(key);
      e.target.value = '';
      render();
      showToast('已套用整年模板');
    });

    document.getElementById('btn-clear-selected-months').addEventListener('click', () => {
      mutateSelectedMonths((arr) => {
        arr.length = 0;
      });
      showToast('已清空所选月份');
    });

    document.getElementById('inp-add-catalog').addEventListener('change', updateCatalogNote);

    document.getElementById('btn-add-catalog').addEventListener('click', () => {
      const catalogId = document.getElementById('inp-add-catalog').value;
      const qty = Math.max(1, Math.min(10, Number(document.getElementById('inp-add-qty').value) || 1));
      mutateSelectedMonths((arr) => {
        const existing = arr.find((it) => it.id === catalogId);
        if (existing) existing.qty = qty;
        else arr.push(makeSubItem(catalogId, qty));
      });
      showToast('已加入所选月份');
    });

    document.getElementById('btn-add-custom').addEventListener('click', () => {
      const nameInp = document.getElementById('inp-custom-name');
      const priceInp = document.getElementById('inp-custom-price');
      const qtyInp = document.getElementById('inp-custom-qty');
      const name = nameInp.value.trim();
      const priceCny = Math.max(0, Number(priceInp.value) || 0);
      const qty = Math.max(1, Math.min(10, Number(qtyInp.value) || 1));
      if (!name) {
        showToast('请先输入订阅名称');
        nameInp.focus();
        return;
      }
      const customId = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;
      mutateSelectedMonths((arr) => {
        const existing = arr.find((it) => it.id === customId);
        if (existing) {
          existing.priceCny = priceCny;
          existing.qty = qty;
        } else {
          arr.push(makeSubItem(null, qty, { id: customId, name, priceCny }));
        }
      });
      nameInp.value = '';
      priceInp.value = '';
      qtyInp.value = '1';
      showToast(`已添加：${name}`);
    });

    const editorList = document.getElementById('editor-items-list');
    editorList.addEventListener('click', (e) => {
      const qtyBtn = e.target.closest('[data-qty-delta]');
      if (qtyBtn) {
        const id = qtyBtn.dataset.itemId;
        const delta = Number(qtyBtn.dataset.qtyDelta);
        mutateSelectedMonths((arr) => {
          const idx = arr.findIndex((it) => it.id === id);
          if (idx === -1) return;
          const next = (arr[idx].qty || 1) + delta;
          if (next <= 0) arr.splice(idx, 1);
          else arr[idx].qty = Math.min(10, next);
        });
        return;
      }
      const rmBtn = e.target.closest('[data-remove-id]');
      if (rmBtn) {
        const id = rmBtn.dataset.removeId;
        mutateSelectedMonths((arr) => {
          const idx = arr.findIndex((it) => it.id === id);
          if (idx !== -1) arr.splice(idx, 1);
        });
      }
    });

    editorList.addEventListener('change', (e) => {
      const priceInp = e.target.closest('[data-edit-price-id]');
      if (!priceInp) return;
      const id = priceInp.dataset.editPriceId;
      const val = Math.max(0, Number(priceInp.value) || 0);
      mutateSelectedMonths((arr) => {
        const found = arr.find((it) => it.id === id);
        if (found) found.priceCny = val;
      });
    });

    // Step 3
    document.getElementById('renewal-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-renewal]');
      if (!btn) return;
      state.ultraRenewalMode = btn.dataset.renewal;
      render();
    });

    document.getElementById('pro-region-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pro-region]');
      if (!btn) return;
      state.monthlyProRegion = btn.dataset.proRegion;
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

    document.getElementById('inp-try-dep').addEventListener('input', (e) => {
      state.tryAnnualDepRate = Number(e.target.value);
      render();
    });

    document.getElementById('inp-midyear-hike').addEventListener('change', (e) => {
      state.googleMidYearHike = e.target.checked;
      render();
    });

    document.getElementById('inp-music-cny').addEventListener('input', (e) => {
      state.musicMonthlyCny = Math.max(0, Number(e.target.value) || 0);
      render();
    });

    // Step 4
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

    // Copy summary
    document.getElementById('btn-copy-summary').addEventListener('click', async () => {
      const res = calculateLedger(state);
      const lines = [
        '【Gemini 黑五包年决策账本】',
        `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
        `- 黑五成本：${fmtYen(res.bfCost)}/年（¥${res.bfMonthlyAvg.toFixed(1)}/月）`,
        `- 黑五空闲期：${res.totalIdleMonths} 个月（其中 Ultra 重叠 ${res.ultraOverlapMonths} 月，折合白交约 ${fmtYen(res.ultraIdleCostCny)}）`,
        `- 实际回本：${res.breakEvenMonths.toFixed(1)} 个月（月付均价 ¥${Math.round(res.avgProPrice)}/月）`,
        `- 期望净收益 (EV)：${fmtYen(res.expectedNetSavings, true)}（把握 ${state.retainProbPct}% vs 盈亏线 ${res.breakEvenProbPct.toFixed(1)}%）`,
        `- 最大赢 / 最大亏：${fmtYen(res.upsideNet, true)} / ${fmtYen(res.downsideNet, true)}`,
      ].join('\n');

      try {
        await navigator.clipboard.writeText(lines);
        showToast('已复制决策摘要');
      } catch {
        showToast('复制失败');
      }
    });
  }

  renderStaticTables();
  syncInputsFromState();
  bindEvents();
  render();
})();
