(function () {
  const {
    BF_DEAL_PRESETS,
    CURRENCIES,
    DEFAULT_STATE,
    HISTORICAL_TIMELINE,
    MONTHS,
    SCENARIO_PRESETS,
    SUB_CATALOG,
    TRY_FX_HISTORY,
    buildMonthPlan,
    makeSubItem,
  } = window.SubLedgerData;

  const { calculateLedger, convertToCny, getTryRateAtOffset } = window.SubLedgerCalc;
  const { buildSummarySvg, buildStandaloneHtml, svgToHighResPngBlob } = window.SubLedgerExporter;

  const STORAGE_KEY = 'ai_sub_ledger_state_v8';

  const STEPS = [
    { idx: 0, label: '1. 方案', nextLabel: '下一步：排布 12 个月原方案 →' },
    { idx: 1, label: '2. 用量表格', nextLabel: '下一步：核对续费与汇率 →' },
    { idx: 2, label: '3. 续费与权益', nextLabel: '下一步：评估模型周期 →' },
    { idx: 3, label: '4. 周期与把握', nextLabel: '查看最终结论 →' },
    { idx: 4, label: '5. 结论', nextLabel: '回到第 1 步' },
  ];

  function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  let state = loadState();
  let currentStep = 0;
  let maxVisitedStep = 0;
  let selectedMonths = new Set();
  let inlineEditor = null; // { monthIdx, mode: 'add' | 'edit', itemId? }

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

  function fmtNativeAmount(amount, currency) {
    const num = Number(amount) || 0;
    const text = Number.isInteger(num) ? num.toLocaleString('en-US') : num.toFixed(2);
    if (currency === 'TRY') return `${text} TRY`;
    if (currency === 'JPY') return `${text} JPY`;
    if (currency === 'USD') return `$${text}`;
    return `¥${text}`;
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
    return Array.from(selectedMonths).filter((i) => i >= 0 && i < 12).sort((a, b) => a - b);
  }

  function mutateMonths(indices, mutator) {
    indices.forEach((mIdx) => {
      if (!Array.isArray(state.monthPlans[mIdx])) state.monthPlans[mIdx] = [];
      mutator(state.monthPlans[mIdx], mIdx);
    });
    render();
  }

  function catalogOptionsHtml(selectedId) {
    // Only show replaceable subscription plans in the alternative-plan dropdown (Ultra is separated into its own column!)
    const replaceableItems = SUB_CATALOG.filter((c) => c.replaceableByBf);
    const groups = [];
    replaceableItems.forEach((c) => {
      if (!groups.includes(c.group)) groups.push(c.group);
    });
    return groups
      .map((g) => {
        const opts = replaceableItems
          .filter((c) => c.group === g)
          .map((c) => {
            const sel = c.id === selectedId ? ' selected' : '';
            const priceLabel = c.amount > 0 ? ` · ${fmtNativeAmount(c.amount, c.currency)}` : '';
            return `<option value="${c.id}"${sel}>${c.name}${priceLabel}</option>`;
          })
          .join('');
        return `<optgroup label="${escapeHtml(g)}">${opts}</optgroup>`;
      })
      .join('');
  }

  function currencyOptionsHtml(selectedCode) {
    return CURRENCIES.map((c) => {
      const sel = c.code === selectedCode ? ' selected' : '';
      return `<option value="${c.code}"${sel}>${c.code} ${c.symbol}</option>`;
    }).join('');
  }

  function renderStaticTables() {
    const presetPicker = document.getElementById('inp-preset-picker');
    presetPicker.innerHTML =
      '<option value="">预设场景...</option>' +
      SCENARIO_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');

    document.getElementById('inp-add-catalog').innerHTML = catalogOptionsHtml('gemini_pro_tr');

    document.getElementById('timeline-tbody').innerHTML = HISTORICAL_TIMELINE.map(
      (item) => `
        <tr>
          <td class="mono" style="white-space:nowrap;">${item.date}</td>
          <td style="font-weight:500;">${item.model}</td>
          <td style="white-space:nowrap;"><span class="tag tag-gray">${item.durability}</span></td>
          <td>${item.summary}</td>
        </tr>`
    ).join('');

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

  function syncInputsFromState() {
    document.getElementById('inp-bf-currency').value = state.bfCurrency || 'TRY';
    document.getElementById('inp-bf-raw').value = state.bfRawAmount != null ? state.bfRawAmount : state.bfCostCny;
    document.getElementById('inp-ultra-cny').value = state.currentUltraCny;
    document.getElementById('inp-fail-month').value = state.ultraFailMonthIndex;
    document.getElementById('inp-fallback-strategy').value = state.fallbackUltraStrategy;
    document.getElementById('inp-try-dep').value = state.tryAnnualDepRate;
    document.getElementById('inp-music-cny').value = state.musicMonthlyCny;
    document.getElementById('inp-colab-cny').value = state.colabProMonthlyCny || 0;
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

  function renderDatabaseTable(res) {
    const indices = getSelectedIndices();
    const selBar = document.getElementById('db-selection-bar');
    selBar.style.display = indices.length > 0 ? 'flex' : 'none';
    document.getElementById('editor-selected-title').textContent =
      indices.length === 12 ? '已选全年 12 月' : `已选 ${indices.length} 个月`;

    const chkAll = document.getElementById('chk-select-all');
    chkAll.checked = indices.length === 12;
    chkAll.indeterminate = indices.length > 0 && indices.length < 12;

    const tbody = document.getElementById('db-months-tbody');
    tbody.innerHTML = res.monthlyRows
      .map((row) => {
        const isSel = selectedMonths.has(row.index);
        const hasUltraItem = row.items.some((it) => it.isGeminiUltra || it.dynamicPrice === 'gemini_ultra_5x');
        const replaceableItems = row.items.filter((it) => it.replaceableByBf && !it.isGeminiUltra);
        const isBfActive = row.monthSavedByBf > 0;

        const ultraBtnHtml = hasUltraItem
          ? `<button type="button" class="ultra-toggle-btn is-on" data-toggle-ultra="${row.index}" title="点击取消本月 Ultra">✓ 已开 Ultra · 黑五空闲</button>`
          : `<button type="button" class="ultra-toggle-btn" data-toggle-ultra="${row.index}" title="点击标记本月已开 Ultra">未开（点此标记）</button>`;

        let planCellHtml;
        if (hasUltraItem && !row.ultraFallbackToPro) {
          planCellHtml = '<span class="plan-muted">本月由 Ultra 覆盖，黑五 Pro 处于空闲</span>';
        } else if (hasUltraItem && row.ultraFallbackToPro) {
          planCellHtml = '<span class="tag tag-blue">土区断续 · 已自动转为双号 Pro 兜底</span>';
        } else if (replaceableItems.length === 0) {
          planCellHtml = `
            <div class="row-tokens">
              <span class="plan-muted">未填（本月停用）</span>
              <button type="button" class="row-add-btn" data-open-inline-add="${row.index}">+ 选平替订阅</button>
            </div>`;
        } else {
          const tokensHtml = replaceableItems
            .map((it) => {
              const toneCls = `tone-${it.tone || 'blue'}`;
              const priceText = ` · ${fmtYen(it.unitCny)}${it.midYearHike ? ' (6月调价)' : ''}`;
              const isEditing =
                inlineEditor &&
                inlineEditor.mode === 'edit' &&
                inlineEditor.monthIdx === row.index &&
                inlineEditor.itemId === it.id;
              return `
                <span class="sub-token ${toneCls}" style="${isEditing ? 'outline:1.5px solid #37352f;' : ''}">
                  <button type="button" class="tok-main-btn" data-edit-tag="${row.index}" data-item-id="${escapeHtml(it.id)}" title="点击切换地区/币种/金额/6月调价">${escapeHtml(it.short)}${priceText} ▾</button>
                  <button type="button" class="tok-del-btn" data-row-del="${row.index}" data-item-id="${escapeHtml(it.id)}" title="移除">×</button>
                </span>`;
            })
            .join('');
          planCellHtml = `
            <div class="row-tokens">
              ${tokensHtml}
              <button type="button" class="row-add-btn" data-open-inline-add="${row.index}">+</button>
            </div>`;
        }

        const saveText = isBfActive
          ? `<span class="mono">${fmtYen(row.monthSavedByBf)}/月</span>`
          : hasUltraItem
            ? '<span class="unit">黑五空闲</span>'
            : '<span class="unit">—</span>';

        const mainRow = `
          <tr class="db-row ${isSel ? 'is-selected' : ''}">
            <td class="col-check">
              <input type="checkbox" data-chk-month="${row.index}" ${isSel ? 'checked' : ''} aria-label="勾选${row.month.label}" />
            </td>
            <td class="col-month">
              <span class="db-month-main">${row.month.label}</span>
              <span class="db-month-phase">${row.phase.label}</span>
            </td>
            <td class="col-ultra">${ultraBtnHtml}</td>
            <td class="col-plan">${planCellHtml}</td>
            <td class="col-save num mono">${saveText}</td>
          </tr>`;

        if (!inlineEditor || inlineEditor.monthIdx !== row.index) return mainRow;

        if (inlineEditor.mode === 'edit') {
          const target = row.items.find((it) => it.id === inlineEditor.itemId);
          if (!target) return mainRow;
          const isDynamic = Boolean(target.dynamicPrice) || target.id === 'none_idle';
          const isTry = (target.currency || 'CNY') === 'TRY' && !isDynamic;
          const editRow = `
            <tr class="db-inline-add-row">
              <td colspan="5">
                <div class="inline-add-bar">
                  <span class="unit">${row.month.short} 切换方案：</span>
                  <select class="flat-select" id="inline-edit-swap" style="min-width:240px;">${catalogOptionsHtml(target.id)}</select>
                  <select class="flat-select" id="inline-edit-currency" style="width:100px;" ${isDynamic ? 'disabled' : ''}>${currencyOptionsHtml(target.currency || 'CNY')}</select>
                  <input class="flat-input mono" id="inline-edit-amount" type="number" min="0" max="500000" step="any" value="${target.amount != null ? target.amount : Math.round(target.unitCny)}" style="width:92px;" ${isDynamic ? 'disabled' : ''} />
                  <label class="check-inline" id="inline-edit-hike-wrap" style="display:${isTry ? 'inline-flex' : 'none'};white-space:nowrap;">
                    <input type="checkbox" id="inline-edit-hike" ${target.midYearHike ? 'checked' : ''} />
                    <span>6月调价追汇率</span>
                  </label>
                  <button type="button" class="primary-btn btn-sm" data-save-edit-tag="${row.index}" data-item-id="${escapeHtml(target.id)}">应用</button>
                  <button type="button" class="text-btn text-btn-muted" data-close-inline-add="1">关闭</button>
                </div>
              </td>
            </tr>`;
          return mainRow + editRow;
        }

        const inlineRow = `
          <tr class="db-inline-add-row">
            <td colspan="5">
              <div class="inline-add-bar">
                <span class="unit">${row.month.short} 选择方案：</span>
                <select class="flat-select" id="inline-row-catalog" style="min-width:240px;">${catalogOptionsHtml('gemini_pro_tr')}</select>
                <button type="button" class="primary-btn btn-sm" data-confirm-inline-add="${row.index}">设为该项</button>
                <span class="unit" style="margin-left:6px;">或自定义：</span>
                <input class="flat-input" id="inline-row-cname" type="text" placeholder="名称" style="width:120px;" />
                <select class="flat-select" id="inline-row-ccurrency" style="width:96px;">${currencyOptionsHtml('TRY')}</select>
                <input class="flat-input mono" id="inline-row-cprice" type="number" min="0" max="500000" placeholder="月费" style="width:88px;" />
                <button type="button" class="subtle-btn btn-sm" data-confirm-inline-custom="${row.index}">添加</button>
                <button type="button" class="text-btn text-btn-muted" data-close-inline-add="1">收起</button>
              </div>
            </td>
          </tr>`;

        return mainRow + inlineRow;
      })
      .join('');

    document.getElementById('db-months-tfoot').innerHTML = `
      <tr>
        <td></td>
        <td class="mono" style="font-weight:600;">排布统计</td>
        <td>Ultra 空闲 <strong>${res.ultraOverlapMonths}</strong> 月</td>
        <td>平替生效 <strong>${res.proCoveredMonths}</strong> 月 · 停用 <strong>${res.idleNoneMonths}</strong> 月</td>
        <td class="num unit">第 5 步汇总计价</td>
      </tr>`;
  }

  function renderChart(res) {
    const container = document.getElementById('chart-container');
    const rows = res.monthlyRows;

    const width = 760;
    const height = 225;
    const padL = 60;
    const padR = 24;
    const padT = 22;
    const padB = 34;
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
        <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e9e9e7" stroke-width="1"/>
        <text x="${padL - 10}" y="${Number(y) + 4}" text-anchor="end" fill="#9b9a97" font-size="11.5" font-family="JetBrains Mono, monospace">¥${Math.round(val)}</text>
      `);
    }

    let crossoverSvg = '';
    if (res.crossoverMonthIndex !== null) {
      const cx = xAt(res.crossoverMonthIndex);
      const cy = yAt(rows[res.crossoverMonthIndex].cumBuy);
      crossoverSvg = `
        <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#1c3829" stroke-dasharray="3 3" stroke-width="1"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 96, cx + 8).toFixed(1)}" y="${Math.max(padT + 20, cy - 8).toFixed(1)}" fill="#1c3829" font-size="12" font-weight="600">${rows[res.crossoverMonthIndex].month.short}回本</text>
      `;
    }

    const xLabels = rows
      .map((r, i) => {
        const x = xAt(i).toFixed(1);
        return `
          <text x="${x}" y="${height - 10}" text-anchor="middle" fill="#787774" font-size="11.5">${r.month.short}</text>
          <circle cx="${x}" cy="${yAt(r.cumBuy).toFixed(1)}" r="2.5" fill="#37352f"/>
        `;
      })
      .join('');

    const lastRow = rows[rows.length - 1];
    const lastX = xAt(rows.length - 1);
    const buyY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumBuy) - 10 : yAt(lastRow.cumBuy) + 16;
    const skipY = yAt(lastRow.cumBuy) <= yAt(lastRow.cumSkip) ? yAt(lastRow.cumSkip) + 16 : yAt(lastRow.cumSkip) - 10;

    const nextGenIdx = rows.findIndex((r) => r.phase.key === 'next_gen');
    let nextGenMarkerSvg = '';
    if (nextGenIdx >= 0) {
      const nx = xAt(nextGenIdx);
      const ny = yAt(rows[nextGenIdx].cumBuy);
      nextGenMarkerSvg = `
        <line x1="${nx.toFixed(1)}" y1="${padT}" x2="${nx.toFixed(1)}" y2="${padT + plotH}" stroke="#787774" stroke-dasharray="2 3" stroke-width="1"/>
        <circle cx="${nx.toFixed(1)}" cy="${(padT + plotH).toFixed(1)}" r="4.5" fill="#1c3829" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${Math.min(width - 132, Math.max(padL + 6, nx - 44)).toFixed(1)}" y="${(padT + 12).toFixed(1)}" fill="#1c3829" font-size="11.5" font-weight="600">● 下一代成为 SOTA 的模型 (${rows[nextGenIdx].month.short})</text>
      `;
    }

    container.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="12个月累积支出对比图">
        ${gridLines.join('')}
        ${nextGenMarkerSvg}
        <polyline points="${skipPts}" fill="none" stroke="#9b9a97" stroke-width="2" stroke-dasharray="5 4"/>
        <polyline points="${buyPts}" fill="none" stroke="#37352f" stroke-width="2.2"/>
        ${xLabels}
        ${crossoverSvg}
        <text x="${(lastX - 6).toFixed(1)}" y="${buyY.toFixed(1)}" text-anchor="end" fill="#37352f" font-size="12" font-weight="600" font-family="JetBrains Mono, monospace">买:${fmtYen(lastRow.cumBuy)}</text>
        <text x="${(lastX - 6).toFixed(1)}" y="${skipY.toFixed(1)}" text-anchor="end" fill="#787774" font-size="12" font-family="JetBrains Mono, monospace">不买:${fmtYen(lastRow.cumSkip)}</text>
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
    document.getElementById('export-group').style.display = currentStep === 4 ? 'flex' : 'none';

    // STEP 1
    document.querySelectorAll('[data-bf-choice]').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.bfChoice === state.bfPreset);
    });
    document.getElementById('panel-bf-custom').style.display = state.bfPreset === 'custom' ? 'block' : 'none';
    document.getElementById('lbl-bf-converted').textContent = `≈ ${fmtYen(state.bfCostCny)} / 年`;
    document.getElementById('lbl-custom-preview').textContent =
      state.bfPreset === 'custom'
        ? `${fmtNativeAmount(state.bfRawAmount, state.bfCurrency)} ≈ ${fmtYen(state.bfCostCny)}`
        : '自定义币种与金额';

    const rawMonths = res.bfCost / res.monthlyRows[0].proUnit;
    document.getElementById('insight-step-0-title').textContent =
      `折合 ¥${res.bfMonthlyAvg.toFixed(1)} / 月 · 裸回本约 ${rawMonths.toFixed(1)} 个月`;
    document.getElementById('insight-step-0-detail').textContent =
      `按当前月付 Pro（${fmtYen(res.monthlyRows[0].proUnit)}/月）粗算，全年至少有 ${rawMonths.toFixed(1)} 个月被黑五平替才不亏。下一步在表格中排布 12 个月原方案。`;

    // STEP 2
    renderDatabaseTable(res);

    const idleUltraMonths = res.monthlyRows
      .filter((r) => r.hasUltraActive && r.replaceableSlots === 0)
      .map((r) => r.month.short);
    const idleText =
      res.ultraOverlapMonths > 0
        ? `其中 ${idleUltraMonths.join('、')}（共 ${res.ultraOverlapMonths} 个月）已标记为 Ultra，黑五 Pro 将处于空闲状态；`
        : '当前排布没有被 Ultra 占用的黑五空闲月；';

    document.getElementById('insight-step-1-title').textContent =
      `已排布：平替生效 ${res.proCoveredMonths} 个月 · Ultra 空闲 ${res.ultraOverlapMonths} 个月 · 停用 ${res.idleNoneMonths} 个月`;
    document.getElementById('insight-step-1-detail').textContent =
      `${idleText}具体汇率折算、模型周期与最终盈亏将在后续步骤统一计算。`;

    // STEP 3
    document.querySelectorAll('[data-renewal]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.renewal === state.ultraRenewalMode);
    });
    document.getElementById('wrap-fail-month').style.display = state.ultraRenewalMode === 'fail_at' ? 'grid' : 'none';
    document.getElementById('wrap-fallback-strategy').style.display = state.ultraRenewalMode !== 'always' ? 'grid' : 'none';
    document.getElementById('lbl-fail-month').textContent = MONTHS[state.ultraFailMonthIndex]?.label || '';

    document.getElementById('lbl-try-dep').textContent = `${state.tryAnnualDepRate}%`;

    const aprRate = getTryRateAtOffset(5, state.tryAnnualDepRate);
    const novRate = getTryRateAtOffset(12, state.tryAnnualDepRate);
    document.getElementById('help-try-preview').textContent =
      `按此贬值速率：2027年4月 1元≈${aprRate.toFixed(2)} TRY，11月 1元≈${novRate.toFixed(2)} TRY。若需模拟某个 TRY 订阅在 6 月调价追汇率，可在第 2 步点击该订阅标签单独勾选。`;

    document.getElementById('insight-step-2-title').textContent =
      `折算后平替项月均价约 ¥${Math.round(res.avgProPrice)}/月，需生效 ${Number.isFinite(res.breakEvenMonths) ? res.breakEvenMonths.toFixed(1) : '--'} 个月回本`;
    document.getElementById('insight-step-2-detail').textContent =
      res.proCoveredMonths >= res.breakEvenMonths
        ? `表格中有 ${res.proCoveredMonths} 个生效月份，已越过回本线；下一步算入模型换代与掉队风险。`
        : `表格中仅有 ${res.proCoveredMonths} 个生效月份，低于回本线，直接按月买更划算。`;

    // STEP 4
    const sotaUntilText = formatFutureMonth(2026, 11, state.effectiveSotaMonths);
    const nextWhenText = formatFutureMonth(2026, 11, state.nextFlagshipInterval);
    document.getElementById('lbl-sota-len').textContent = `${state.effectiveSotaMonths} 个月`;
    document.getElementById('lbl-next-interval').textContent = `${state.nextFlagshipInterval} 个月`;
    document.getElementById('lbl-retain-prob').textContent = `${state.retainProbPct}%`;
    document.getElementById('help-sota-until').textContent =
      `指你认为当前这一代模型能维持 SOTA 水准、足够作为主力生产力使用的时长。自 2026年11月起算 ${state.effectiveSotaMonths} 个月，预计可用至 ${sotaUntilText}。`;
    document.getElementById('help-next-when').textContent =
      `指 Google 下一代能够重新成为 SOTA 的旗舰模型出现间隔。自 2026年11月起算 ${state.nextFlagshipInterval} 个月，预计在 ${nextWhenText} 登场。`;

    // Update Step 4 lifecycle timeline nodes (12-month scale, 2..15m clamped smoothly)
    const sotaPct = Math.min(94, Math.max(8, (state.effectiveSotaMonths / 12) * 100));
    const nextPct = Math.min(96, Math.max(12, (state.nextFlagshipInterval / 12) * 100));
    document.getElementById('lc-active-seg').style.width = `${sotaPct}%`;
    document.getElementById('lc-sota-node').style.left = `${sotaPct}%`;
    document.getElementById('lc-sota-label').textContent = `主力期止 (${sotaUntilText.slice(2)})`;
    document.getElementById('lc-next-node').style.left = `${nextPct}%`;
    document.getElementById('lc-next-label').textContent = `下一代成为 SOTA 的模型 (${nextWhenText.slice(2)})`;

    const thresholdClamped = Math.min(96, Math.max(4, res.breakEvenProbPct));
    document.getElementById('ev-threshold-line').style.left = `${thresholdClamped}%`;
    document.getElementById('ev-threshold-tag').textContent = `盈亏线 ${res.breakEvenProbPct.toFixed(0)}%`;
    document.getElementById('ev-user-dot').style.left = `${state.retainProbPct}%`;
    const probGap = state.retainProbPct - res.breakEvenProbPct;
    document.getElementById('lbl-ev-gap').textContent =
      probGap >= 0 ? `高于盈亏线 +${probGap.toFixed(1)}%` : `低于盈亏线 ${probGap.toFixed(1)}%`;

    document.getElementById('insight-step-3-title').textContent =
      `期望净收益 (EV)：${fmtYen(res.expectedNetSavings, true)}`;
    document.getElementById('insight-step-3-detail').textContent =
      probGap >= 0
        ? `当前把握（${state.retainProbPct}%）高于盈亏线（${res.breakEvenProbPct.toFixed(1)}%），年付方案为正期望。`
        : `当前把握（${state.retainProbPct}%）低于盈亏线（${res.breakEvenProbPct.toFixed(1)}%），年付方案期望为负。`;

    // STEP 5
    const badge = document.getElementById('verdict-badge');
    badge.className = `tag tag-${res.verdict.tone}`;
    badge.textContent = res.verdict.badge;
    document.getElementById('verdict-headline').textContent = res.verdict.headline;
    document.getElementById('verdict-detail').textContent = res.verdict.detail;

    document.getElementById('kpi-bf-cost').textContent = fmtYen(res.bfCost);
    document.getElementById('kpi-bf-monthly').textContent = `（折合 ¥${res.bfMonthlyAvg.toFixed(1)}/月）`;

    document.getElementById('kpi-idle-summary').textContent =
      res.totalIdleMonths > 0
        ? `共 ${res.totalIdleMonths} 个月空闲（Ultra 重叠 ${res.ultraOverlapMonths} 月 + 停用 ${res.idleNoneMonths} 月，折合摊销约 ${fmtYen(res.totalIdleCostCny)}）`
        : '0 个月（全年 12 个月均在生效）';

    document.getElementById('kpi-breakeven').textContent = Number.isFinite(res.breakEvenMonths)
      ? `${res.breakEvenMonths.toFixed(1)} 个月`
      : '无法回本';
    document.getElementById('kpi-avg-pro').textContent = `（月均平替价值 ¥${Math.round(res.avgProPrice)}/月）`;

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

    const idleCallout = document.getElementById('idle-callout');
    if (res.totalIdleMonths > 0) {
      idleCallout.style.display = 'block';
      document.getElementById('idle-callout-title').textContent =
        `空闲期说明：全年有 ${res.totalIdleMonths} 个月黑五 Pro 处于闲置状态`;
      document.getElementById('idle-callout-detail').textContent =
        res.ultraOverlapMonths > 0
          ? `在 ${idleUltraMonths.join('、')} 这 ${res.ultraOverlapMonths} 个月里，由于同时开启 Ultra，黑五 Pro 处于空闲状态（约占年费 ${Math.round((res.ultraOverlapMonths / 12) * 100)}%，即 ${fmtYen(res.ultraIdleCostCny)}）。黑五能否回本，取决于剩下 ${res.proCoveredMonths} 个平替生效月份。`
          : `当前有 ${res.idleNoneMonths} 个停用月份黑五 Pro 闲置（折合 ${fmtYen(res.totalIdleCostCny)}）。`;
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

  function updateCustomBfCost() {
    const cur = document.getElementById('inp-bf-currency').value;
    const raw = Math.max(0, Number(document.getElementById('inp-bf-raw').value) || 0);
    state.bfPreset = 'custom';
    state.bfCurrency = cur;
    state.bfRawAmount = raw;
    state.bfCostCny = Math.round(convertToCny(raw, cur, 0, 0));
    render();
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
      inlineEditor = null;
      syncInputsFromState();
      e.target.value = '';
      goToStep(4);
      showToast(`已载入：${found.name}`);
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      state = cloneState(DEFAULT_STATE);
      selectedMonths = new Set();
      inlineEditor = null;
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
        const p = BF_DEAL_PRESETS[choice];
        state.bfCurrency = p.currency;
        state.bfRawAmount = p.amount;
        state.bfCostCny = p.cnyCost;
        document.getElementById('inp-bf-currency').value = p.currency;
        document.getElementById('inp-bf-raw').value = p.amount;
      }
      render();
    });

    document.getElementById('inp-bf-currency').addEventListener('change', updateCustomBfCost);
    document.getElementById('inp-bf-raw').addEventListener('input', updateCustomBfCost);

    // Step 2: Table Selection & Contextual Batch Actions
    document.getElementById('btn-unselect-all').addEventListener('click', () => {
      selectedMonths = new Set();
      render();
    });

    document.getElementById('chk-select-all').addEventListener('change', (e) => {
      selectedMonths = e.target.checked
        ? new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        : new Set();
      render();
    });

    document.getElementById('inp-plan-template').addEventListener('change', (e) => {
      const key = e.target.value;
      if (!key) return;
      state.monthPlans = buildMonthPlan(key);
      inlineEditor = null;
      e.target.value = '';
      render();
      showToast('已套用整年模板');
    });

    // Batch Set Ultra (causes Black Friday Pro to be idle)
    document.getElementById('btn-batch-ultra').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选至少 1 个月份');
        return;
      }
      inlineEditor = null;
      mutateMonths(indices, (arr) => {
        arr.length = 0;
        arr.push(makeSubItem('ultra_idle', 1));
      });
      showToast(`已将 ${indices.length} 个月设为 Ultra（黑五空闲）`);
    });

    // Batch Set Replaceable Subscription
    document.getElementById('btn-replace-catalog').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选至少 1 个月份');
        return;
      }
      const catalogId = document.getElementById('inp-add-catalog').value;
      inlineEditor = null;
      mutateMonths(indices, (arr) => {
        arr.length = 0;
        arr.push(makeSubItem(catalogId, 1));
      });
      showToast(`已将 ${indices.length} 个月设为该平替订阅`);
    });

    document.getElementById('btn-clear-selected-months').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选要清空的月份');
        return;
      }
      inlineEditor = null;
      mutateMonths(indices, (arr) => {
        arr.length = 0;
      });
      showToast(`已清空 ${indices.length} 个月份`);
    });

    document.getElementById('btn-add-custom').addEventListener('click', () => {
      const indices = getSelectedIndices();
      if (indices.length === 0) {
        showToast('请先勾选要应用的月份');
        return;
      }
      const nameInp = document.getElementById('inp-custom-name');
      const curInp = document.getElementById('inp-custom-currency');
      const priceInp = document.getElementById('inp-custom-price');
      const name = nameInp.value.trim();
      const currency = curInp.value || 'CNY';
      const amount = Math.max(0, Number(priceInp.value) || 0);
      if (!name) {
        showToast('请先输入订阅名称');
        nameInp.focus();
        return;
      }
      const customId = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;
      mutateMonths(indices, (arr) => {
        arr.length = 0;
        arr.push(makeSubItem(null, 1, { id: customId, name, currency, amount, replaceableByBf: true }));
      });
      nameInp.value = '';
      priceInp.value = '';
      showToast(`已应用到 ${indices.length} 个月份：${name}`);
    });

    // Database Table Interactions
    const dbTbody = document.getElementById('db-months-tbody');

    dbTbody.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-chk-month]');
      if (chk) {
        const idx = Number(chk.dataset.chkMonth);
        if (chk.checked) selectedMonths.add(idx);
        else selectedMonths.delete(idx);
        render();
        return;
      }

      if (e.target.id === 'inline-edit-swap') {
        const found = SUB_CATALOG.find((c) => c.id === e.target.value);
        if (found) {
          const curEl = document.getElementById('inline-edit-currency');
          const amtEl = document.getElementById('inline-edit-amount');
          const hikeWrap = document.getElementById('inline-edit-hike-wrap');
          const disabled = Boolean(found.dynamicPrice) || found.id === 'none_idle';
          if (curEl) {
            curEl.value = found.currency;
            curEl.disabled = disabled;
          }
          if (amtEl) {
            amtEl.value = found.amount;
            amtEl.disabled = disabled;
          }
          if (hikeWrap) {
            hikeWrap.style.display = found.currency === 'TRY' && !disabled ? 'inline-flex' : 'none';
          }
        }
      }
      if (e.target.id === 'inline-edit-currency') {
        const hikeWrap = document.getElementById('inline-edit-hike-wrap');
        if (hikeWrap) hikeWrap.style.display = e.target.value === 'TRY' ? 'inline-flex' : 'none';
      }
    });

    dbTbody.addEventListener('click', (e) => {
      // Dedicated Ultra column toggle (clearly separated from replaceable plans)
      const ultraBtn = e.target.closest('[data-toggle-ultra]');
      if (ultraBtn) {
        const mIdx = Number(ultraBtn.dataset.toggleUltra);
        inlineEditor = null;
        mutateMonths([mIdx], (arr) => {
          const hasUltra = arr.some((it) => it.isGeminiUltra || it.dynamicPrice === 'gemini_ultra_5x');
          arr.length = 0;
          if (!hasUltra) {
            arr.push(makeSubItem('ultra_idle', 1));
          }
        });
        return;
      }

      const delBtn = e.target.closest('[data-row-del]');
      if (delBtn) {
        const mIdx = Number(delBtn.dataset.rowDel);
        const id = delBtn.dataset.itemId;
        if (inlineEditor && inlineEditor.monthIdx === mIdx && inlineEditor.itemId === id) {
          inlineEditor = null;
        }
        mutateMonths([mIdx], (arr) => {
          const i = arr.findIndex((it) => it.id === id);
          if (i !== -1) arr.splice(i, 1);
        });
        return;
      }

      const editBtn = e.target.closest('[data-edit-tag]');
      if (editBtn) {
        const mIdx = Number(editBtn.dataset.editTag);
        const id = editBtn.dataset.itemId;
        if (inlineEditor && inlineEditor.mode === 'edit' && inlineEditor.monthIdx === mIdx && inlineEditor.itemId === id) {
          inlineEditor = null;
        } else {
          inlineEditor = { monthIdx: mIdx, mode: 'edit', itemId: id };
        }
        render();
        return;
      }

      const saveEditBtn = e.target.closest('[data-save-edit-tag]');
      if (saveEditBtn) {
        const mIdx = Number(saveEditBtn.dataset.saveEditTag);
        const oldId = saveEditBtn.dataset.itemId;
        const swapEl = document.getElementById('inline-edit-swap');
        const curEl = document.getElementById('inline-edit-currency');
        const amtEl = document.getElementById('inline-edit-amount');
        const hikeEl = document.getElementById('inline-edit-hike');
        const newCatId = swapEl ? swapEl.value : oldId;
        const currency = curEl ? curEl.value : 'CNY';
        const amount = Math.max(0, Number(amtEl && amtEl.value) || 0);
        const midYearHike = currency === 'TRY' && Boolean(hikeEl && hikeEl.checked);

        inlineEditor = null;
        mutateMonths([mIdx], (arr) => {
          const idx = arr.findIndex((it) => it.id === oldId);
          if (idx === -1) return;
          if (newCatId === 'none_idle') {
            arr.splice(idx, 1);
          } else if (arr[idx].isCustom && newCatId === oldId) {
            arr[idx].currency = currency;
            arr[idx].amount = amount;
            arr[idx].midYearHike = midYearHike;
          } else {
            arr.splice(idx, 1, makeSubItem(newCatId, 1, { currency, amount, midYearHike }));
          }
        });
        return;
      }

      const openBtn = e.target.closest('[data-open-inline-add]');
      if (openBtn) {
        const mIdx = Number(openBtn.dataset.openInlineAdd);
        if (inlineEditor && inlineEditor.mode === 'add' && inlineEditor.monthIdx === mIdx) {
          inlineEditor = null;
        } else {
          inlineEditor = { monthIdx: mIdx, mode: 'add' };
        }
        render();
        return;
      }

      if (e.target.closest('[data-close-inline-add]')) {
        inlineEditor = null;
        render();
        return;
      }

      const addOneBtn = e.target.closest('[data-confirm-inline-add]');
      if (addOneBtn) {
        const mIdx = Number(addOneBtn.dataset.confirmInlineAdd);
        const catEl = document.getElementById('inline-row-catalog');
        if (!catEl) return;
        const catalogId = catEl.value;
        inlineEditor = null;
        mutateMonths([mIdx], (arr) => {
          arr.length = 0;
          if (catalogId !== 'none_idle') {
            arr.push(makeSubItem(catalogId, 1));
          }
        });
        return;
      }

      const addCusBtn = e.target.closest('[data-confirm-inline-custom]');
      if (addCusBtn) {
        const mIdx = Number(addCusBtn.dataset.confirmInlineCustom);
        const nameEl = document.getElementById('inline-row-cname');
        const curEl = document.getElementById('inline-row-ccurrency');
        const priceEl = document.getElementById('inline-row-cprice');
        const name = nameEl ? nameEl.value.trim() : '';
        const currency = curEl ? curEl.value : 'CNY';
        const amount = Math.max(0, Number(priceEl && priceEl.value) || 0);
        if (!name) {
          showToast('请先输入自定义订阅名称');
          if (nameEl) nameEl.focus();
          return;
        }
        const customId = `custom_${name.toLowerCase().replace(/\s+/g, '_')}`;
        inlineEditor = null;
        mutateMonths([mIdx], (arr) => {
          arr.length = 0;
          arr.push(makeSubItem(null, 1, { id: customId, name, currency, amount, replaceableByBf: true }));
        });
      }
    });

    // Step 3
    document.getElementById('renewal-segment').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-renewal]');
      if (!btn) return;
      state.ultraRenewalMode = btn.dataset.renewal;
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

    document.getElementById('inp-music-cny').addEventListener('input', (e) => {
      state.musicMonthlyCny = Math.max(0, Number(e.target.value) || 0);
      render();
    });

    document.getElementById('inp-colab-cny').addEventListener('input', (e) => {
      state.colabProMonthlyCny = Math.max(0, Number(e.target.value) || 0);
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

    function triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Export: Copy 3x Ultra-HD PNG directly to clipboard (with automatic download fallback)
    document.getElementById('btn-copy-hd-img').addEventListener('click', async () => {
      const res = calculateLedger(state);
      const svg = buildSummarySvg(state, res);
      try {
        const pngBlob = await svgToHighResPngBlob(svg, 3);
        if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': pngBlob })]);
          showToast('已复制 3x 超清图片到剪贴板，可直接粘贴');
        } else {
          triggerDownload(pngBlob, 'ai-sub-ledger-summary-3x.png');
          showToast('当前环境不支持剪贴板写图，已自动下载 3x 超清 PNG');
        }
      } catch {
        try {
          const pngBlob = await svgToHighResPngBlob(svg, 3);
          triggerDownload(pngBlob, 'ai-sub-ledger-summary-3x.png');
          showToast('已下载 3x 超清 PNG 图片');
        } catch {
          showToast('图片生成失败，请改用导出 SVG');
        }
      }
    });

    // Export: Crisp Vector SVG
    document.getElementById('btn-export-svg').addEventListener('click', () => {
      const res = calculateLedger(state);
      const svg = buildSummarySvg(state, res);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      triggerDownload(blob, 'ai-sub-ledger-summary.svg');
      showToast('已导出矢量 SVG 图片');
    });

    // Export: Standalone Offline HTML Report
    document.getElementById('btn-export-html').addEventListener('click', () => {
      const res = calculateLedger(state);
      const html = buildStandaloneHtml(state, res);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      triggerDownload(blob, 'ai-sub-ledger-report.html');
      showToast('已导出独立 HTML 报告网页');
    });

    // Copy text summary
    document.getElementById('btn-copy-summary').addEventListener('click', async () => {
      const res = calculateLedger(state);
      const lines = [
        '【AI 黑五包年决策账本】',
        `- 结论：${res.verdict.badge}（${res.verdict.headline}）`,
        `- 黑五成本：${fmtYen(res.bfCost)}/年（¥${res.bfMonthlyAvg.toFixed(1)}/月）`,
        `- 黑五空闲期：${res.totalIdleMonths} 个月（Ultra 重叠 ${res.ultraOverlapMonths} 月，折合摊销 ${fmtYen(res.ultraIdleCostCny)}）`,
        `- 实际回本：${res.breakEvenMonths.toFixed(1)} 个月（月均平替价值 ¥${Math.round(res.avgProPrice)}/月）`,
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
