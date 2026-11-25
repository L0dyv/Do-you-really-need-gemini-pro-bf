(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SubLedgerData = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const MONTHS = [
    { id: '2026-12', label: '12月', fullLabel: '2026年12月', offsetFromNow: 1 },
    { id: '2027-01', label: '1月', fullLabel: '2027年1月', offsetFromNow: 2 },
    { id: '2027-02', label: '2月', fullLabel: '2027年2月', offsetFromNow: 3 },
    { id: '2027-03', label: '3月', fullLabel: '2027年3月', offsetFromNow: 4 },
    { id: '2027-04', label: '4月', fullLabel: '2027年4月', offsetFromNow: 5 },
    { id: '2027-05', label: '5月', fullLabel: '2027年5月', offsetFromNow: 6 },
    { id: '2027-06', label: '6月', fullLabel: '2027年6月', offsetFromNow: 7 },
    { id: '2027-07', label: '7月', fullLabel: '2027年7月', offsetFromNow: 8 },
    { id: '2027-08', label: '8月', fullLabel: '2027年8月', offsetFromNow: 9 },
    { id: '2027-09', label: '9月', fullLabel: '2027年9月', offsetFromNow: 10 },
    { id: '2027-10', label: '10月', fullLabel: '2027年10月', offsetFromNow: 11 },
    { id: '2027-11', label: '11月', fullLabel: '2027年11月', offsetFromNow: 12 },
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
   * Big-3 (Gemini / ChatGPT / Claude) + Devin regional multi-currency catalog.
   * Each entry carries native currency + native amount (TRY automatically depreciates by month).
   */
  const SUB_CATALOG = [
    // Google Gemini
    {
      id: 'gemini_pro_tr',
      group: 'Google Gemini',
      name: 'Gemini Pro（土区）',
      short: 'Gemini Pro·土区',
      tone: 'blue',
      currency: 'TRY',
      amount: 870,
      dynamicPrice: 'gemini_pro',
      isGeminiPro: true,
      includesMusic: false,
      note: '土区官价 870 TRY/月，随里拉贬值自动折算；可被黑五 Pro 抵扣 1 槽',
    },
    {
      id: 'gemini_pro_jp',
      group: 'Google Gemini',
      name: 'Gemini Pro（日区）',
      short: 'Gemini Pro·日区',
      tone: 'blue',
      currency: 'JPY',
      amount: 2900,
      dynamicPrice: null,
      isGeminiPro: true,
      includesMusic: false,
      note: '日区官价 2,900 JPY/月 ≈ ¥122；可被黑五 Pro 抵扣 1 槽',
    },
    {
      id: 'gemini_pro_us',
      group: 'Google Gemini',
      name: 'Gemini Pro（美区）',
      short: 'Gemini Pro·美区',
      tone: 'blue',
      currency: 'USD',
      amount: 19.99,
      dynamicPrice: null,
      isGeminiPro: true,
      includesMusic: false,
      note: '美区官价 $19.99/月 ≈ ¥133；可被黑五 Pro 抵扣 1 槽',
    },
    {
      id: 'gemini_ultra_5x',
      group: 'Google Gemini',
      name: 'Gemini Ultra 5x（土区旧价）',
      short: 'Ultra 5x·土区',
      tone: 'dark',
      currency: 'TRY',
      amount: 2000,
      dynamicPrice: 'gemini_ultra_5x',
      isGeminiUltra: true,
      includesMusic: true,
      note: '当前土区旧价约 ¥265/月（含完整 YT Music），随第 3 步续费状态与汇率联动',
    },
    {
      id: 'gemini_ultra_5x_jp',
      group: 'Google Gemini',
      name: 'Gemini Ultra 5x（日区）',
      short: 'Ultra 5x·日区',
      tone: 'dark',
      currency: 'JPY',
      amount: 14500,
      dynamicPrice: null,
      isGeminiUltra: true,
      includesMusic: true,
      note: '日区 14,500 JPY/月 ≈ ¥608（比美区便宜，含完整 YT Music）',
    },
    {
      id: 'gemini_ultra_5x_tr_new',
      group: 'Google Gemini',
      name: 'Gemini Ultra 5x（土区新价）',
      short: 'Ultra 5x·土新',
      tone: 'dark',
      currency: 'TRY',
      amount: 4750,
      dynamicPrice: null,
      isGeminiUltra: true,
      includesMusic: true,
      note: '土区调价后新价 4,750 TRY/月 ≈ ¥629，自动吃里拉贬值',
    },
    {
      id: 'gemini_ultra_5x_us',
      group: 'Google Gemini',
      name: 'Gemini Ultra 5x（美区）',
      short: 'Ultra 5x·美区',
      tone: 'dark',
      currency: 'USD',
      amount: 99.99,
      dynamicPrice: null,
      isGeminiUltra: true,
      includesMusic: true,
      note: '美区 $99.99/月 ≈ ¥667，含完整 YT Music',
    },
    {
      id: 'gemini_ultra_20x_jp',
      group: 'Google Gemini',
      name: 'Gemini Ultra 20x（日区）',
      short: 'Ultra 20x·日区',
      tone: 'dark',
      currency: 'JPY',
      amount: 32000,
      dynamicPrice: null,
      isGeminiUltra: true,
      includesMusic: true,
      note: '日区 32,000 JPY/月 ≈ ¥1,344，含完整 YT Music',
    },

    // OpenAI ChatGPT
    {
      id: 'gpt_plus_tr',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Plus（土区）',
      short: 'GPT Plus·土区',
      tone: 'gray',
      currency: 'TRY',
      amount: 999.99,
      dynamicPrice: null,
      includesMusic: false,
      note: '土区 App Store 999.99 TRY/月 ≈ ¥132，自动吃里拉贬值',
    },
    {
      id: 'gpt_plus_jp',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Plus（日区）',
      short: 'GPT Plus·日区',
      tone: 'gray',
      currency: 'JPY',
      amount: 3000,
      dynamicPrice: null,
      includesMusic: false,
      note: '日区 App Store 3,000 JPY/月 ≈ ¥126',
    },
    {
      id: 'gpt_plus_us',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Plus（美区）',
      short: 'GPT Plus·美区',
      tone: 'gray',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      includesMusic: false,
      note: '美区 $20/月 ≈ ¥133',
    },
    {
      id: 'gpt_plus_cny',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Plus（渠道折价）',
      short: 'GPT Plus·渠道',
      tone: 'gray',
      currency: 'CNY',
      amount: 70,
      dynamicPrice: null,
      includesMusic: false,
      note: '按你提到的约 ¥70/月渠道价，可点击标签直接修改金额',
    },
    {
      id: 'gpt_go_tr',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Go（土区）',
      short: 'GPT Go·土区',
      tone: 'gray',
      currency: 'TRY',
      amount: 249.99,
      dynamicPrice: null,
      includesMusic: false,
      note: '土区轻量版 249.99 TRY/月 ≈ ¥33',
    },
    {
      id: 'gpt_pro_jp',
      group: 'OpenAI ChatGPT',
      name: 'ChatGPT Pro（日区）',
      short: 'GPT Pro·日区',
      tone: 'gray',
      currency: 'JPY',
      amount: 16800,
      dynamicPrice: null,
      includesMusic: false,
      note: '日区 16,800 JPY/月 ≈ ¥706',
    },

    // Anthropic Claude
    {
      id: 'claude_pro_tr',
      group: 'Anthropic Claude',
      name: 'Claude Pro（土区）',
      short: 'Claude Pro·土区',
      tone: 'gray',
      currency: 'TRY',
      amount: 999.99,
      dynamicPrice: null,
      includesMusic: false,
      note: '土区 App Store 约 999.99 TRY/月 ≈ ¥132，自动吃里拉贬值',
    },
    {
      id: 'claude_pro_jp',
      group: 'Anthropic Claude',
      name: 'Claude Pro（日区）',
      short: 'Claude Pro·日区',
      tone: 'gray',
      currency: 'JPY',
      amount: 3000,
      dynamicPrice: null,
      includesMusic: false,
      note: '日区 3,000 JPY/月 ≈ ¥126',
    },
    {
      id: 'claude_pro_us',
      group: 'Anthropic Claude',
      name: 'Claude Pro（美区）',
      short: 'Claude Pro·美区',
      tone: 'gray',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      includesMusic: false,
      note: '美区 $20/月 ≈ ¥133',
    },
    {
      id: 'claude_max_us',
      group: 'Anthropic Claude',
      name: 'Claude Max（美区）',
      short: 'Claude Max·美区',
      tone: 'gray',
      currency: 'USD',
      amount: 100,
      dynamicPrice: null,
      includesMusic: false,
      note: '美区 $100/月 ≈ ¥667',
    },

    // Other Tools
    {
      id: 'devin_core',
      group: '其他工具',
      name: 'Devin Teams（基础费）',
      short: 'Devin',
      tone: 'amber',
      currency: 'USD',
      amount: 80,
      dynamicPrice: null,
      includesMusic: false,
      note: 'Teams 基础费 $80/月（含 2 席起配为 $160/月），可点标签改美元数',
    },
  ];

  const BF_DEAL_PRESETS = {
    tr_ios: {
      id: 'tr_ios',
      label: '土区 iPadOS 黑五（3,600 TRY）',
      currency: 'TRY',
      amount: 3600,
      cnyCost: Math.round(3600 / FX_RATES.TRY_PER_CNY),
      note: '需使用独立土区 Apple ID，勿与 Ultra 主号共用',
    },
    jp_web: {
      id: 'jp_web',
      label: '日区官方黑五（14,500 JPY）',
      currency: 'JPY',
      amount: 14500,
      cnyCost: 608,
      note: '日区首年半价，次年按 29,000 JPY 自动续费',
    },
    custom: {
      id: 'custom',
      label: '自定义币种与年费',
      currency: 'TRY',
      amount: 3600,
      cnyCost: 477,
      note: '支持输入 TRY / JPY / USD / CNY 实时折算',
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
        isGeminiPro: Boolean(base.isGeminiPro),
        isGeminiUltra: Boolean(base.isGeminiUltra),
        replaceableByBf: customOverride && customOverride.replaceableByBf != null
          ? Boolean(customOverride.replaceableByBf)
          : Boolean(base.isGeminiPro),
        includesMusic: Boolean(base.includesMusic),
        isCustom: false,
      };
    }
    const name = (customOverride && customOverride.name) || '自定义订阅';
    const currency = (customOverride && customOverride.currency) || 'CNY';
    const amount = Math.max(0, Number(customOverride && (customOverride.amount ?? customOverride.priceCny)) || 0);
    return {
      id: (customOverride && customOverride.id) || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      short: name.length > 10 ? name.slice(0, 10) : name,
      tone: 'gray',
      qty: Math.max(1, Number(qty) || 1),
      currency,
      amount,
      dynamicPrice: null,
      isGeminiPro: false,
      isGeminiUltra: false,
      replaceableByBf: Boolean(customOverride && customOverride.replaceableByBf),
      includesMusic: false,
      isCustom: true,
    };
  }

  function buildMonthPlan(templateKey) {
    const plans = [];
    for (let i = 0; i < 12; i++) {
      if (templateKey === 'default') {
        if (i <= 3) {
          plans.push([makeSubItem('gemini_ultra_5x', 1), makeSubItem('gpt_plus_cny', 1)]);
        } else {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        }
      } else if (templateKey === 'offseason_only') {
        if (i === 0) {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        } else if (i >= 1 && i <= 3) {
          plans.push([makeSubItem('gemini_ultra_5x', 1), makeSubItem('gpt_plus_cny', 1)]);
        } else if (i >= 4 && i <= 8) {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        } else {
          plans.push([]);
        }
      } else if (templateKey === 'three_pro_devin') {
        if (i >= 1 && i <= 3) {
          plans.push([
            makeSubItem('gemini_pro_tr', 3),
            makeSubItem('devin_core', 1),
            makeSubItem('gpt_plus_cny', 1),
          ]);
        } else {
          plans.push([makeSubItem('gemini_pro_tr', 1)]);
        }
      } else if (templateKey === 'all_pro') {
        plans.push([makeSubItem('gemini_pro_tr', 1)]);
      } else {
        plans.push([]);
      }
    }
    return plans;
  }

  const DEFAULT_STATE = {
    monthPlans: buildMonthPlan('default'),
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
    musicMonthlyCny: 17,
    monthsSinceLaunch: 0,
    effectiveSotaMonths: 7,
    nextFlagshipInterval: 10,
    retainProbPct: 65,
  };

  const SCENARIO_PRESETS = [
    {
      id: 'tr_bf_baseline',
      name: '土区黑五 3,600 TRY（推荐基准）',
      desc: '12-3月 Ultra + GPT，4-11月土区 Pro',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('default'),
      }),
    },
    {
      id: 'jp_bf_compare',
      name: '日区黑五 14,500 JPY（对照）',
      desc: '同样组合，对比日区 608 元黑五',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('default'),
        bfPreset: 'jp_web',
        bfCurrency: 'JPY',
        bfRawAmount: 14500,
        bfCostCny: 608,
      }),
    },
    {
      id: 'three_pro_devin',
      name: '1-3月 3×Pro + Devin 拼盘',
      desc: '土区断续不用 Ultra，改 3×Pro + Devin + GPT',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('three_pro_devin'),
      }),
    },
    {
      id: 'apr_obsolete',
      name: '4月后模型掉队（保守视角）',
      desc: '1-3月 Ultra + 4-8月淡季 Pro，留存把握 45%',
      patch: Object.assign({}, DEFAULT_STATE, {
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
      summary: '发布 6 周出现降智争议；月底 Claude 4 发布分流写代码用户，但尚未彻底淘汰 2.5 Pro。',
      durability: '第 2 个月',
    },
    {
      date: '2025.08',
      model: 'OpenAI GPT-5',
      type: 'rival',
      summary: 'GPT-5 结束 2.5 Pro 独一档时期，但因语气问题对非 GPT 偏好用户替代有限。',
      durability: '第 4.5 个月',
    },
    {
      date: '2025.09',
      model: 'Claude Sonnet 4.5',
      type: 'milestone',
      summary: '真正体验断层节点（2025.09.29）。2.5 Pro 从 3 月底撑到 9 月底共 6 个月。',
      durability: '实战 6 个月',
    },
    {
      date: '2025.11',
      model: 'Claude Opus 4.5 / Gemini 3.0 Pro',
      type: 'milestone',
      summary: 'Opus 4.5 上线前 2.5 Pro 共撑 7 个月；同期 Gemini 3.0 Pro 幻觉翻车，3 个月后由 3.1 Pro 救火。',
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
      summary: '按 11 月起算（距 3.1 Pro 9 个月）；参照 2.5 Pro 撑 7 个月，预计稳态至 2027年6月，下代好用旗舰预计 2027年8~10月。',
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
