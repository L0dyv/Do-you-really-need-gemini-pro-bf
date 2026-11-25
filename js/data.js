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

  /**
   * Common AI subscription catalog for Step 2 dropdown & quantity picker.
   * dynamicPrice: 'gemini_pro' | 'gemini_ultra_5x' | null (fixed editable CNY)
   */
  const SUB_CATALOG = [
    {
      id: 'gemini_pro',
      name: 'Gemini Pro',
      short: 'Pro',
      tone: 'blue',
      defaultPriceCny: 115,
      dynamicPrice: 'gemini_pro',
      includesMusic: false,
      note: '可被黑五包年抵扣 1 个槽位，单价随第 3 步地区与里拉汇率自动联动',
    },
    {
      id: 'gemini_ultra_5x',
      name: 'Gemini Ultra 5x',
      short: 'Ultra 5x',
      tone: 'dark',
      defaultPriceCny: 265,
      dynamicPrice: 'gemini_ultra_5x',
      includesMusic: true,
      note: '含完整 YouTube Music；单价随第 3 步土区续费状态与汇率自动联动',
    },
    {
      id: 'gemini_ultra_20x',
      name: 'Gemini Ultra 20x',
      short: 'Ultra 20x',
      tone: 'dark',
      defaultPriceCny: 1344,
      dynamicPrice: null,
      includesMusic: true,
      note: '日区 32,000 JPY ≈ ¥1,344 / 美区 $199.99 ≈ ¥1,334，含完整 YT Music',
    },
    {
      id: 'gpt_plus',
      name: 'ChatGPT Plus',
      short: 'GPT',
      tone: 'gray',
      defaultPriceCny: 70,
      dynamicPrice: null,
      includesMusic: false,
      note: '默认按你提到的渠道月付 ¥70（官方 $20 约 ¥133，可自由改价）',
    },
    {
      id: 'devin_core',
      name: 'Devin Teams',
      short: 'Devin',
      tone: 'amber',
      defaultPriceCny: 534,
      dynamicPrice: null,
      includesMusic: false,
      note: '基础费 $80 ≈ ¥534/月（含 2 满额席位 $160 ≈ ¥1,067/月，可按需改价）',
    },
    {
      id: 'claude_pro',
      name: 'Claude Pro',
      short: 'Claude',
      tone: 'gray',
      defaultPriceCny: 133,
      dynamicPrice: null,
      includesMusic: false,
      note: '官方 $20/月 ≈ ¥133（或改填 Max 5x $100 ≈ ¥667）',
    },
    {
      id: 'glm_plan',
      name: '智谱 GLM 套餐',
      short: 'GLM',
      tone: 'gray',
      defaultPriceCny: 99,
      dynamicPrice: null,
      includesMusic: false,
      note: '国产主力/代码补充套餐，月费可按实际活动价调整',
    },
    {
      id: 'kimi_plan',
      name: 'Kimi / 国产 Coding 套餐',
      short: 'Kimi',
      tone: 'gray',
      defaultPriceCny: 49,
      dynamicPrice: null,
      includesMusic: false,
      note: '国产长文本/辅助套餐，月费可按需调整',
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
      label: '自定义人民币价格',
      currency: 'CNY',
      amount: 477,
      cnyCost: 477,
      note: '手动输入实际折合人民币年费',
    },
  };

  function makeSubItem(catalogId, qty, customOverride) {
    const base = SUB_CATALOG.find((c) => c.id === catalogId);
    if (base) {
      return {
        id: base.id,
        name: base.name,
        short: base.short,
        tone: base.tone,
        qty: Math.max(1, Number(qty) || 1),
        priceCny: customOverride && customOverride.priceCny != null
          ? Number(customOverride.priceCny)
          : base.defaultPriceCny,
        dynamicPrice: base.dynamicPrice,
        includesMusic: base.includesMusic,
        isCustom: false,
      };
    }
    const name = (customOverride && customOverride.name) || '自定义订阅';
    return {
      id: (customOverride && customOverride.id) || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      short: name.length > 8 ? name.slice(0, 8) : name,
      tone: 'gray',
      qty: Math.max(1, Number(qty) || 1),
      priceCny: Math.max(0, Number(customOverride && customOverride.priceCny) || 0),
      dynamicPrice: null,
      includesMusic: false,
      isCustom: true,
    };
  }

  function buildMonthPlan(templateKey) {
    const plans = [];
    for (let i = 0; i < 12; i++) {
      if (templateKey === 'default') {
        // 12-3月重度土区 Ultra 5x + GPT 辅助；4-11月单号 Pro
        if (i <= 3) {
          plans.push([makeSubItem('gemini_ultra_5x', 1), makeSubItem('gpt_plus', 1)]);
        } else {
          plans.push([makeSubItem('gemini_pro', 1)]);
        }
      } else if (templateKey === 'offseason_only') {
        // 1-3月重度 Ultra；4-8月淡季 Pro；9-11月停用
        if (i === 0) {
          plans.push([makeSubItem('gemini_pro', 1)]);
        } else if (i >= 1 && i <= 3) {
          plans.push([makeSubItem('gemini_ultra_5x', 1), makeSubItem('gpt_plus', 1)]);
        } else if (i >= 4 && i <= 8) {
          plans.push([makeSubItem('gemini_pro', 1)]);
        } else {
          plans.push([]);
        }
      } else if (templateKey === 'three_pro_devin') {
        // 1-3月：3个 Pro + 1个 Devin + GPT；4-8月：1个 Pro；9-11月：1个 Pro
        if (i >= 1 && i <= 3) {
          plans.push([
            makeSubItem('gemini_pro', 3),
            makeSubItem('devin_core', 1),
            makeSubItem('gpt_plus', 1),
          ]);
        } else {
          plans.push([makeSubItem('gemini_pro', 1)]);
        }
      } else if (templateKey === 'all_pro') {
        plans.push([makeSubItem('gemini_pro', 1)]);
      } else {
        plans.push([]);
      }
    }
    return plans;
  }

  const DEFAULT_STATE = {
    monthPlans: buildMonthPlan('default'),
    bfPreset: 'tr_ios',
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
      name: '土区黑五 477 元（推荐基准）',
      desc: '12-3月 Ultra + GPT，4-11月单号 Pro，土区 3,600 里拉黑五',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('default'),
      }),
    },
    {
      id: 'jp_bf_compare',
      name: '日区黑五 608 元（对照基准）',
      desc: '同样组合，对比日区 14,500 日元黑五包年赔率',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('default'),
        bfPreset: 'jp_web',
        bfCostCny: 608,
      }),
    },
    {
      id: 'three_pro_devin',
      name: '1-3月 3×Pro + Devin 拼盘',
      desc: '土区断续不用 Ultra，改用 3 个 Pro + Devin + GPT 扛旺季',
      patch: Object.assign({}, DEFAULT_STATE, {
        monthPlans: buildMonthPlan('three_pro_devin'),
        bfPreset: 'tr_ios',
        bfCostCny: 477,
      }),
    },
    {
      id: 'apr_obsolete',
      name: '4月后模型掉队（保守视角）',
      desc: '1-3月 Ultra + 4-8月淡季 Pro，主观留存把握调至 45%',
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
      summary: '发布仅 6 周首次出现 05-06 降智争议；月底 Claude 4 发布开始分流写代码用户，但尚未彻底淘汰 2.5 Pro。',
      durability: '第 2 个月',
    },
    {
      date: '2025.08',
      model: 'OpenAI GPT-5',
      type: 'rival',
      summary: 'GPT-5 结束 2.5 Pro 独一档时期，但因语气不够“说人话”，对非 GPT 偏好用户替代有限。',
      durability: '第 4.5 个月',
    },
    {
      date: '2025.09',
      model: 'Claude Sonnet 4.5',
      type: 'milestone',
      summary: '真正意义上的体验断层节点（2025.09.29）。按实际主力体感算，2.5 Pro 从 3 月底撑到 9 月底共 6 个月。',
      durability: '实战 6 个月',
    },
    {
      date: '2025.11',
      model: 'Claude Opus 4.5 / Gemini 3.0 Pro',
      type: 'milestone',
      summary: 'Opus 4.5 彻底接棒（2.5 Pro 撑满 7 个月）；同期 Gemini 3.0 Pro 幻觉翻车，3 个月后由 3.1 Pro 救火。',
      durability: '极限 7 个月',
    },
    {
      date: '2026.02',
      model: 'Gemini 3.1 Pro',
      type: 'google',
      summary: '大幅压低幻觉，撑起 3 代稳态主力；但 3~9 月整整 7 个月仅发 Flash，进入春夏旗舰空窗期。',
      durability: '距 2.5 Pro 11个月',
    },
    {
      date: '2026.11',
      model: 'Gemini 4 Neon / Argon',
      type: 'google',
      summary: '按 11 月主力全面可用起算（距 3.1 Pro 隔 9 个月）；参照 2.5 Pro 撑 7 个月、旗舰 9~11 个月换代，可撑至 2027年6月，下代好用旗舰预计 2027年8~10月。',
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
