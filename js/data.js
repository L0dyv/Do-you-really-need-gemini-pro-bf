(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SubLedgerData = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const MONTHS = [
    { id: '2026-12', label: '2026年12月', short: '12月', offsetFromNow: 1 },
    { id: '2027-01', label: '2027年1月', short: '1月', offsetFromNow: 2 },
    { id: '2027-02', label: '2027年2月', short: '2月', offsetFromNow: 3 },
    { id: '2027-03', label: '2027年3月', short: '3月', offsetFromNow: 4 },
    { id: '2027-04', label: '2027年4月', short: '4月', offsetFromNow: 5 },
    { id: '2027-05', label: '2027年5月', short: '5月', offsetFromNow: 6 },
    { id: '2027-06', label: '2027年6月', short: '6月', offsetFromNow: 7 },
    { id: '2027-07', label: '2027年7月', short: '7月', offsetFromNow: 8 },
    { id: '2027-08', label: '2027年8月', short: '8月', offsetFromNow: 9 },
    { id: '2027-09', label: '2027年9月', short: '9月', offsetFromNow: 10 },
    { id: '2027-10', label: '2027年10月', short: '10月', offsetFromNow: 11 },
    { id: '2027-11', label: '2027年11月', short: '11月', offsetFromNow: 12 },
  ];

  const FX_RATES = {
    TRY_PER_CNY: 7.55,
    JPY_PER_CNY: 23.81,
    CNY_PER_USD: 6.67,
  };

  const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TRY 里拉' },
    { code: 'JPY', symbol: 'JP¥', label: 'JPY 日元' },
    { code: 'USD', symbol: '$', label: 'USD 美元' },
    { code: 'CNY', symbol: '¥', label: 'CNY 人民币' },
  ];

  /**
   * Two cleanly separated catalogs:
   * 1) IDLE_PLAN_CATALOG: Higher-tier or external plans that make Black Friday Pro sit idle
   *    (e.g., Google Ultra, Claude Max, ChatGPT Pro, Team/School seat, or custom).
   * 2) SUB_CATALOG (replaceableByBf: true): Subscriptions that Black Friday Pro would replace.
   */
  const IDLE_PLAN_CATALOG = [
    {
      id: 'ultra_idle',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（土区旧价）',
      short: 'Ultra 5x · 土旧',
      tone: 'yellow',
      currency: 'TRY',
      amount: 2000,
      dynamicPrice: 'gemini_ultra_5x',
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '开启高阶 Ultra 期间，黑五 Pro 闲置；续费稳定性可在第 3 步配置',
    },
    {
      id: 'idle_ultra_jp',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（日区）',
      short: 'Ultra 5x · 日区',
      tone: 'yellow',
      currency: 'JPY',
      amount: 14500,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '14,500 JPY/月 ≈ ¥608，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_20x',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x',
      short: 'Ultra 20x',
      tone: 'yellow',
      currency: 'JPY',
      amount: 32000,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '32,000 JPY/月 ≈ ¥1,344',
    },
    {
      id: 'idle_claude_max',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max',
      short: 'Claude Max',
      tone: 'yellow',
      currency: 'USD',
      amount: 100,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '本月主力切至 Claude Max ($100/月)，黑五 Pro 闲置',
    },
    {
      id: 'idle_gpt_pro',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro',
      short: 'ChatGPT Pro',
      tone: 'yellow',
      currency: 'USD',
      amount: 200,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '本月主力切至 ChatGPT Pro ($200/月)，黑五 Pro 闲置',
    },
    {
      id: 'idle_org_seat',
      group: '致黑五空闲的 Plan',
      name: '公司 / 学校统一账号',
      short: '团队/学校账号',
      tone: 'yellow',
      currency: 'CNY',
      amount: 0,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '本月使用单位或学校免费配额，黑五 Pro 闲置',
    },
  ];

  const SUB_CATALOG = [
    ...IDLE_PLAN_CATALOG,
    {
      id: 'none_idle',
      group: '黑五空闲（不抵扣）',
      name: '本月停用（黑五 Pro 空闲）',
      short: '本月停用',
      tone: 'gray',
      currency: 'CNY',
      amount: 0,
      dynamicPrice: null,
      isIdlePlan: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '本月无订阅需求，黑五 Pro 闲置',
    },

    // Replaceable: Google Gemini Pro
    {
      id: 'gemini_pro_tr',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（土区）',
      short: 'Gemini Pro · 土区',
      tone: 'blue',
      currency: 'TRY',
      amount: 870,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '870 TRY/月，随里拉贬值自动折算；可在标签上单独勾选是否年中调价',
    },
    {
      id: 'gemini_pro_jp',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（日区）',
      short: 'Gemini Pro · 日区',
      tone: 'blue',
      currency: 'JPY',
      amount: 2900,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '2,900 JPY/月 ≈ ¥122；买黑五可省下此项',
    },
    {
      id: 'gemini_pro_us',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（美区）',
      short: 'Gemini Pro · 美区',
      tone: 'blue',
      currency: 'USD',
      amount: 19.99,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '$19.99/月 ≈ ¥133；买黑五可省下此项',
    },

    // Replaceable: OpenAI ChatGPT
    {
      id: 'gpt_plus_tr',
      group: '黑五可平替 · OpenAI ChatGPT',
      name: 'ChatGPT Plus（土区）',
      short: 'ChatGPT Plus · 土区',
      tone: 'purple',
      currency: 'TRY',
      amount: 999.99,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '999.99 TRY/月 ≈ ¥132（若黑五 Pro 可平替此项则计入节省）',
    },
    {
      id: 'gpt_plus_jp',
      group: '黑五可平替 · OpenAI ChatGPT',
      name: 'ChatGPT Plus（日区）',
      short: 'ChatGPT Plus · 日区',
      tone: 'purple',
      currency: 'JPY',
      amount: 3000,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '3,000 JPY/月 ≈ ¥126',
    },
    {
      id: 'gpt_plus_us',
      group: '黑五可平替 · OpenAI ChatGPT',
      name: 'ChatGPT Plus（美区）',
      short: 'ChatGPT Plus · 美区',
      tone: 'purple',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '$20/月 ≈ ¥133',
    },

    // Replaceable: Anthropic Claude
    {
      id: 'claude_pro_tr',
      group: '黑五可平替 · Anthropic Claude',
      name: 'Claude Pro（土区）',
      short: 'Claude Pro · 土区',
      tone: 'purple',
      currency: 'TRY',
      amount: 999.99,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '999.99 TRY/月 ≈ ¥132',
    },
    {
      id: 'claude_pro_jp',
      group: '黑五可平替 · Anthropic Claude',
      name: 'Claude Pro（日区）',
      short: 'Claude Pro · 日区',
      tone: 'purple',
      currency: 'JPY',
      amount: 3000,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '3,000 JPY/月 ≈ ¥126',
    },
    {
      id: 'claude_pro_us',
      group: '黑五可平替 · Anthropic Claude',
      name: 'Claude Pro（美区）',
      short: 'Claude Pro · 美区',
      tone: 'purple',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '$20/月 ≈ ¥133',
    },
  ];

  const BF_DEAL_PRESETS = {
    tr_ios: {
      id: 'tr_ios',
      label: '土区 App Store 黑五（3,600 TRY）',
      currency: 'TRY',
      amount: 3600,
      cnyCost: Math.round(3600 / FX_RATES.TRY_PER_CNY),
      note: '使用独立 Apple ID 走内购，避免与已有 Google One 订阅冲突',
    },
    jp_web: {
      id: 'jp_web',
      label: '日区官方黑五（14,500 JPY）',
      currency: 'JPY',
      amount: 14500,
      cnyCost: 608,
      note: '首年半价，次年按 29,000 JPY 自动续费',
    },
    custom: {
      id: 'custom',
      label: '自定义币种与年费',
      currency: 'TRY',
      amount: 3600,
      cnyCost: 477,
      note: '支持 TRY / JPY / USD / CNY 实时折算',
    },
  };

  function makeSubItem(catalogId, qty, customOverride) {
    const base = SUB_CATALOG.find((c) => c.id === catalogId);
    if (base) {
      const currency = (customOverride && customOverride.currency) || base.currency;
      const amount = customOverride && customOverride.amount != null
        ? Number(customOverride.amount)
        : base.amount;
      return {
        id: base.id,
        name: base.name,
        short: base.short,
        tone: base.tone,
        qty: Math.max(1, Number(qty) || 1),
        currency,
        amount,
        dynamicPrice: base.dynamicPrice || null,
        isIdlePlan: Boolean(base.isIdlePlan),
        isGeminiPro: Boolean(base.isGeminiPro),
        isGeminiUltra: Boolean(base.isGeminiUltra),
        replaceableByBf: customOverride && customOverride.replaceableByBf != null
          ? Boolean(customOverride.replaceableByBf)
          : Boolean(base.replaceableByBf),
        midYearHike: Boolean(customOverride && customOverride.midYearHike),
        includesMusic: Boolean(base.includesMusic),
        isCustom: false,
      };
    }
    const isIdleCustom = Boolean(customOverride && customOverride.isIdlePlan);
    const name = (customOverride && customOverride.name) || (isIdleCustom ? '自定义致空闲 Plan' : '自定义可平替订阅');
    const currency = (customOverride && customOverride.currency) || 'CNY';
    const amount = Math.max(0, Number(customOverride && (customOverride.amount ?? customOverride.priceCny)) || 0);
    return {
      id: (customOverride && customOverride.id) || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      short: name.length > 14 ? name.slice(0, 14) : name,
      tone: isIdleCustom ? 'yellow' : 'purple',
      qty: Math.max(1, Number(qty) || 1),
      currency,
      amount,
      dynamicPrice: null,
      isIdlePlan: isIdleCustom,
      isGeminiPro: false,
      isGeminiUltra: false,
      replaceableByBf: isIdleCustom
        ? false
        : customOverride && customOverride.replaceableByBf != null
          ? Boolean(customOverride.replaceableByBf)
          : true,
      midYearHike: Boolean(customOverride && customOverride.midYearHike),
      includesMusic: false,
      isCustom: true,
    };
  }

  function buildMonthPlan(templateKey) {
    const plans = [];
    for (let i = 0; i < 12; i++) {
      if (templateKey === 'default') {
        if (i <= 3) {
          plans.push([makeSubItem('ultra_idle', 1)]);
        } else {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        }
      } else if (templateKey === 'offseason_only') {
        if (i === 0) {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        } else if (i >= 1 && i <= 3) {
          plans.push([makeSubItem('ultra_idle', 1)]);
        } else if (i >= 4 && i <= 8) {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        } else {
          plans.push([]);
        }
      } else if (templateKey === 'all_pro') {
        plans.push([makeSubItem('gemini_pro_tr', 1)]);
      } else if (templateKey === 'replace_gpt') {
        if (i <= 3) {
          plans.push([makeSubItem('ultra_idle', 1)]);
        } else {
          plans.push([makeSubItem('gpt_plus_tr', 1)]);
        }
      } else {
        plans.push([]);
      }
    }
    return plans;
  }

  const DEFAULT_STATE = {
    monthPlans: buildMonthPlan('default'),
    bfPicked: false,
    bfPreset: 'tr_ios',
    bfCurrency: 'TRY',
    bfRawAmount: 3600,
    bfCostCny: 477,
    currentUltraCny: 265,
    ultraRenewalMode: 'always',
    ultraFailMonthIndex: 2,
    fallbackUltraStrategy: 'jp_ultra',
    monthlyProRegion: 'tr',
    monthlyProBaseTry: 870,
    monthlyProBaseJpy: 2900,
    tryAnnualDepRate: 22,
    googleMidYearHike: false,
    musicMonthlyCny: 0,
    colabProMonthlyCny: 0,
    monthsSinceLaunch: 0,
    effectiveSotaMonths: 7,
    nextFlagshipInterval: 10,
    retainProbPct: 65,
  };

  const SCENARIO_PRESETS = [
    {
      id: 'tr_bf_baseline',
      name: '土区黑五 3,600 TRY（基准）',
      desc: '12-3月 Ultra 空闲，4-11月平替土区 Pro',
      patch: Object.assign({}, DEFAULT_STATE, {
        bfPicked: true,
        monthPlans: buildMonthPlan('default'),
      }),
    },
    {
      id: 'jp_bf_compare',
      name: '日区黑五 14,500 JPY（对照）',
      desc: '同样排布，对比日区 608 元黑五',
      patch: Object.assign({}, DEFAULT_STATE, {
        bfPicked: true,
        monthPlans: buildMonthPlan('default'),
        bfPreset: 'jp_web',
        bfCurrency: 'JPY',
        bfRawAmount: 14500,
        bfCostCny: 608,
      }),
    },
    {
      id: 'all_pro_year',
      name: '全年 12 个月平替月付 Pro',
      desc: '无 Ultra 空闲月，全年使用黑五 Pro',
      patch: Object.assign({}, DEFAULT_STATE, {
        bfPicked: true,
        monthPlans: buildMonthPlan('all_pro'),
      }),
    },
    {
      id: 'apr_obsolete',
      name: '仅用淡季 5 个月（保守视角）',
      desc: '1-3月 Ultra 空闲，4-8月 Pro，留存把握 45%',
      patch: Object.assign({}, DEFAULT_STATE, {
        bfPicked: true,
        monthPlans: buildMonthPlan('offseason_only'),
        retainProbPct: 45,
      }),
    },
  ];

  const HISTORICAL_TIMELINE = [
    {
      date: '2025.03',
      model: 'Gemini 2.5 Pro (03-25)',
      type: 'google',
      summary: '推理与长文本口碑爆发，成为主力 SOTA。',
      durability: '起点',
    },
    {
      date: '2025.05',
      model: '2.5 Pro (05-06) / Claude 4',
      type: 'rival',
      summary: '发布 6 周出现降智争议；Claude 4 发布开始分流代码用户，但尚未彻底淘汰 2.5 Pro。',
      durability: '第 2 个月',
    },
    {
      date: '2025.08',
      model: 'OpenAI GPT-5',
      type: 'rival',
      summary: '结束 2.5 Pro 独一档时期，风格差异使部分用户继续留存。',
      durability: '第 4.5 个月',
    },
    {
      date: '2025.09',
      model: 'Claude Sonnet 4.5',
      type: 'milestone',
      summary: '体验断层节点（2025.09.29）。2.5 Pro 实战撑至此时约 6 个月。',
      durability: '实战 6 个月',
    },
    {
      date: '2025.11',
      model: 'Claude Opus 4.5 / Gemini 3.0 Pro',
      type: 'milestone',
      summary: 'Opus 4.5 上线前 2.5 Pro 共撑 7 个月；同期 Gemini 3.0 Pro 幻觉翻车，3 个月后由 3.1 Pro 修正。',
      durability: '极限 7 个月',
    },
    {
      date: '2026.02',
      model: 'Gemini 3.1 Pro',
      type: 'google',
      summary: '大幅压低幻觉，但 3~9 月仅发 Flash，进入春夏旗舰空窗期。',
      durability: '距 2.5 Pro 11个月',
    },
    {
      date: '2026.11',
      model: 'Gemini 4 Neon / Argon',
      type: 'google',
      summary: '按 11 月起算（距 3.1 Pro 9 个月）；参照 2.5 Pro 撑 7 个月，预计稳态至 2027年6月，下代旗舰预计 2027年8~10月。',
      durability: '当前起点',
    },
  ];

  const TRY_FX_HISTORY = [
    { period: '2023年11月', rate: '3.95', yoy: '基准', pro870: '220 元', ultra4750: '—' },
    { period: '2024年11月', rate: '4.78', yoy: '+21.0%', pro870: '182 元', ultra4750: '—' },
    { period: '2025年11月', rate: '6.02', yoy: '+25.9%', pro870: '145 元', ultra4750: '—' },
    { period: '2026年11月（当前）', rate: '7.55', yoy: '+25.4%', pro870: '115 元', ultra4750: '629 元' },
    { period: '2027年4月（预测）', rate: '8.05 ~ 8.30', yoy: '惯性阴跌', pro870: '105 ~ 108 元', ultra4750: '572 ~ 590 元' },
    { period: '2027年7月（预测）', rate: '8.35 ~ 8.75', yoy: '淡季中段', pro870: '99 ~ 104 元', ultra4750: '543 ~ 569 元' },
    { period: '2027年11月（预测）', rate: '8.75 ~ 9.45', yoy: '一年后', pro870: '92 ~ 99 元', ultra4750: '503 ~ 543 元' },
  ];

  return {
    MONTHS,
    FX_RATES,
    CURRENCIES,
    IDLE_PLAN_CATALOG,
    SUB_CATALOG,
    BF_DEAL_PRESETS,
    DEFAULT_STATE,
    SCENARIO_PRESETS,
    HISTORICAL_TIMELINE,
    TRY_FX_HISTORY,
    makeSubItem,
    buildMonthPlan,
  };
});
