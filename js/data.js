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

  // Verified Nov 2026 baseline FX rates
  const FX_RATES = {
    TRY_PER_CNY: 7.55,
    JPY_PER_CNY: 23.81,
    HKD_PER_CNY: 1.176,
    TWD_PER_CNY: 4.94,
    CNY_PER_USD: 6.67,
  };

  // Unified internal rate: CNY per 1 unit of foreign currency
  const FX_BASE_CNY_PER_UNIT = {
    CNY: 1,
    TRY: 1 / FX_RATES.TRY_PER_CNY,
    JPY: 1 / FX_RATES.JPY_PER_CNY,
    HKD: 1 / FX_RATES.HKD_PER_CNY,
    TWD: 1 / FX_RATES.TWD_PER_CNY,
    USD: FX_RATES.CNY_PER_USD,
  };

  // Bidirectional FX slider metadata (+ = foreign currency appreciates / costs more CNY, - = depreciates / costs less CNY)
  const FX_CURRENCY_META = {
    TRY: {
      code: 'TRY',
      name: '土耳其里拉',
      symbol: '₺',
      displayBase: '1 CNY ≈ 7.55 TRY',
      defaultAnnualPct: -18,
      minPct: -60,
      maxPct: 25,
      sampleAmount: 870,
      sampleLabel: '870 TRY 月费',
      supportsMidYearHike: true,
      note: '负数表示里拉相对人民币贬值（月付越付越便宜）；仅 TRY 月付支持在第 2 步「改价」中单独勾选 6 月追调标价。',
    },
    JPY: {
      code: 'JPY',
      name: '日元',
      symbol: 'JP¥',
      displayBase: '1 CNY ≈ 23.81 JPY',
      defaultAnnualPct: 0,
      minPct: -25,
      maxPct: 25,
      sampleAmount: 2900,
      sampleLabel: '2,900 JPY 月费',
      supportsMidYearHike: false,
      note: '正数表示日元相对人民币升值（未来月付变贵），负数表示贬值（未来月付变便宜）。',
    },
    HKD: {
      code: 'HKD',
      name: '港币',
      symbol: 'HK$',
      displayBase: '1 CNY ≈ 1.18 HKD',
      defaultAnnualPct: 0,
      minPct: -15,
      maxPct: 15,
      sampleAmount: 158,
      sampleLabel: '158 HKD 月费',
      supportsMidYearHike: false,
      note: '港币实行联系汇率盯住美元（7.75–7.85），兑人民币走势通常与美元高度联动。',
    },
    TWD: {
      code: 'TWD',
      name: '新台币',
      symbol: 'NT$',
      displayBase: '1 CNY ≈ 4.94 TWD',
      defaultAnnualPct: 0,
      minPct: -20,
      maxPct: 20,
      sampleAmount: 650,
      sampleLabel: '650 TWD 月费',
      supportsMidYearHike: false,
      note: '正数表示新台币相对人民币升值（月付变贵），负数表示贬值（月付变便宜）。',
    },
    USD: {
      code: 'USD',
      name: '美元',
      symbol: '$',
      displayBase: '1 USD ≈ 6.67 CNY',
      defaultAnnualPct: 0,
      minPct: -15,
      maxPct: 15,
      sampleAmount: 19.99,
      sampleLabel: '$19.99 月费',
      supportsMidYearHike: false,
      note: '正数表示美元相对人民币升值（月付变贵），负数表示贬值（月付变便宜）。',
    },
  };

  const DEFAULT_FX_ANNUAL_PCT = {
    TRY: FX_CURRENCY_META.TRY.defaultAnnualPct,
    JPY: FX_CURRENCY_META.JPY.defaultAnnualPct,
    HKD: FX_CURRENCY_META.HKD.defaultAnnualPct,
    TWD: FX_CURRENCY_META.TWD.defaultAnnualPct,
    USD: FX_CURRENCY_META.USD.defaultAnnualPct,
  };

  const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TRY 里拉' },
    { code: 'JPY', symbol: 'JP¥', label: 'JPY 日元' },
    { code: 'HKD', symbol: 'HK$', label: 'HKD 港币' },
    { code: 'TWD', symbol: 'NT$', label: 'TWD 新台币' },
    { code: 'USD', symbol: '$', label: 'USD 美元' },
    { code: 'CNY', symbol: '¥', label: 'CNY 人民币' },
  ];

  const IDLE_PLAN_CATALOG = [
    {
      id: 'ultra_idle',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（土区旧价）',
      short: 'Ultra 5x · 土旧',
      tone: 'gemini',
      currency: 'TRY',
      amount: 2000.75,
      dynamicPrice: 'gemini_ultra_5x',
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '开启高阶 Ultra 期间，黑五 Pro 闲置；续费稳定性可在第 3 步配置',
    },
    {
      id: 'idle_ultra_tr_new',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（土区新价）',
      short: 'Ultra 5x · 土区',
      tone: 'gemini',
      currency: 'TRY',
      amount: 4749.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '4,749.99 TRY/月 ≈ ¥629，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_jp',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（日区）',
      short: 'Ultra 5x · 日区',
      tone: 'gemini',
      currency: 'JPY',
      amount: 14500,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '14,500 JPY/月 ≈ ¥609，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_hk',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（港区）',
      short: 'Ultra 5x · 港区',
      tone: 'gemini',
      currency: 'HKD',
      amount: 780,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '约 780 HKD/月 ≈ ¥663，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_tw',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（台区）',
      short: 'Ultra 5x · 台区',
      tone: 'gemini',
      currency: 'TWD',
      amount: 3250,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '约 3,250 TWD/月 ≈ ¥658，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_us',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 5x（美区）',
      short: 'Ultra 5x · 美区',
      tone: 'gemini',
      currency: 'USD',
      amount: 99.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '$99.99/月 ≈ ¥667，含完整 YouTube Music',
    },
    {
      id: 'idle_ultra_20x_tr',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x（土区）',
      short: 'Ultra 20x · 土区',
      tone: 'gemini',
      currency: 'TRY',
      amount: 9499.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '约 9,499.99 TRY/月，可按实际扣款自定义价格',
    },
    {
      id: 'idle_ultra_20x',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x（日区）',
      short: 'Ultra 20x · 日区',
      tone: 'gemini',
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
      id: 'idle_ultra_20x_hk',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x（港区）',
      short: 'Ultra 20x · 港区',
      tone: 'gemini',
      currency: 'HKD',
      amount: 1560,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '约 1,560 HKD/月',
    },
    {
      id: 'idle_ultra_20x_tw',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x（台区）',
      short: 'Ultra 20x · 台区',
      tone: 'gemini',
      currency: 'TWD',
      amount: 6500,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '约 6,500 TWD/月',
    },
    {
      id: 'idle_ultra_20x_us',
      group: '致黑五空闲的 Plan',
      name: 'Google Ultra 20x（美区）',
      short: 'Ultra 20x · 美区',
      tone: 'gemini',
      currency: 'USD',
      amount: 199.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: true,
      replaceableByBf: false,
      includesMusic: true,
      note: '$199.99/月 ≈ ¥1,334',
    },
    {
      id: 'idle_claude_max_tr',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max（土区）',
      short: 'Claude Max · 土区',
      tone: 'claude',
      currency: 'TRY',
      amount: 6999.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '土区 App Store 约 6,999.99 TRY/月',
    },
    {
      id: 'idle_claude_max_jp',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max（日区）',
      short: 'Claude Max · 日区',
      tone: 'claude',
      currency: 'JPY',
      amount: 20000,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '日区约 20,000 JPY/月（网页按 $100 折算）',
    },
    {
      id: 'idle_claude_max',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max 5x（美区）',
      short: 'Claude Max 5x · 美区',
      tone: 'claude',
      currency: 'USD',
      amount: 100,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '本月主力切至 Claude Max 5x ($100/月)，黑五 Pro 闲置',
    },
    {
      id: 'idle_claude_max20_tr',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max 20x / Ultra（土区）',
      short: 'Claude Max 20x · 土区',
      tone: 'claude',
      currency: 'TRY',
      amount: 12999.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '土区 App Store 约 12,999.99 TRY/月',
    },
    {
      id: 'idle_claude_max20_jp',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max 20x / Ultra（日区）',
      short: 'Claude Max 20x · 日区',
      tone: 'claude',
      currency: 'JPY',
      amount: 33000,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '日区约 33,000 JPY/月（网页按 $200 折算）',
    },
    {
      id: 'idle_claude_max20_us',
      group: '致黑五空闲的 Plan',
      name: 'Claude Max 20x / Ultra（美区）',
      short: 'Claude Max 20x · 美区',
      tone: 'claude',
      currency: 'USD',
      amount: 200,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '美区 $200/月（20x 顶配档），黑五 Pro 闲置',
    },
    // OpenAI ChatGPT Pro 100 (10x), Pro 200 (Legacy 20x), Pro 500 (50x)
    {
      id: 'idle_gpt_pro100_tr',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 100（土区）',
      short: 'ChatGPT Pro 100 · 土区',
      tone: 'openai',
      currency: 'TRY',
      amount: 5299.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '土区 5,299.99 TRY/月（10x 用量）',
    },
    {
      id: 'idle_gpt_pro100_jp',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 100（日区）',
      short: 'ChatGPT Pro 100 · 日区',
      tone: 'openai',
      currency: 'JPY',
      amount: 16800,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '日区 16,800 JPY/月（10x 用量）',
    },
    {
      id: 'idle_gpt_pro100_us',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 100（美区）',
      short: 'ChatGPT Pro 100 · 美区',
      tone: 'openai',
      currency: 'USD',
      amount: 100,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '美区 $100/月（10x 用量）',
    },
    {
      id: 'idle_gpt_pro_tr',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 200（土区 · 历史）',
      short: 'ChatGPT Pro 200 · 土区',
      tone: 'openai',
      currency: 'TRY',
      amount: 9999.99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '历史 20x 档位，土区约 9,999.99 TRY/月',
    },
    {
      id: 'idle_gpt_pro_jp',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 200（日区 · 历史）',
      short: 'ChatGPT Pro 200 · 日区',
      tone: 'openai',
      currency: 'JPY',
      amount: 30000,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '历史 20x 档位，日区 30,000 JPY/月',
    },
    {
      id: 'idle_gpt_pro',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 200（美区 · 历史）',
      short: 'ChatGPT Pro 200 · 美区',
      tone: 'openai',
      currency: 'USD',
      amount: 200,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '历史 20x 档位，$200/月',
    },
    {
      id: 'idle_gpt_pro500_tr',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 500（土区）',
      short: 'ChatGPT Pro 500 · 土区',
      tone: 'openai',
      currency: 'TRY',
      amount: 26499,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '土区约 26,499 TRY/月（50x 顶配档）',
    },
    {
      id: 'idle_gpt_pro500_jp',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 500（日区）',
      short: 'ChatGPT Pro 500 · 日区',
      tone: 'openai',
      currency: 'JPY',
      amount: 75000,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '日区约 75,000 JPY/月（50x 顶配档）',
    },
    {
      id: 'idle_gpt_pro500_us',
      group: '致黑五空闲的 Plan',
      name: 'ChatGPT Pro 500（美区）',
      short: 'ChatGPT Pro 500 · 美区',
      tone: 'openai',
      currency: 'USD',
      amount: 500,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '美区 $500/月（50x 顶配档）',
    },
    {
      id: 'idle_devin_max_us',
      group: '致黑五空闲的 Plan',
      name: 'Devin Max（美区）',
      short: 'Devin Max · 美区',
      tone: 'devin',
      currency: 'USD',
      amount: 200,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: 'Cognition Devin Max $200/月，高阶主力占用期间黑五 Pro 闲置',
    },
    {
      id: 'idle_kimi_max_cn',
      group: '致黑五空闲的 Plan',
      name: 'Kimi Max（国区）',
      short: 'Kimi Max · 国区',
      tone: 'kimi',
      currency: 'CNY',
      amount: 699,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '国区 ¥699/月，高阶主力占用期间黑五 Pro 闲置',
    },
    {
      id: 'idle_kimi_max_us',
      group: '致黑五空闲的 Plan',
      name: 'Kimi Max（美区）',
      short: 'Kimi Max · 美区',
      tone: 'kimi',
      currency: 'USD',
      amount: 99,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '国际版 $99/月，高阶主力占用期间黑五 Pro 闲置',
    },
    {
      id: 'idle_glm_max_cn',
      group: '致黑五空闲的 Plan',
      name: 'GLM Max（国区）',
      short: 'GLM Max · 国区',
      tone: 'glm',
      currency: 'CNY',
      amount: 469,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '国区智谱 BigModel ¥469/月，高阶主力占用期间黑五 Pro 闲置',
    },
    {
      id: 'idle_glm_max_us',
      group: '致黑五空闲的 Plan',
      name: 'GLM Max（美区 Z.ai）',
      short: 'GLM Max · 美区',
      tone: 'glm',
      currency: 'USD',
      amount: 160,
      dynamicPrice: null,
      isIdlePlan: true,
      isGeminiUltra: false,
      replaceableByBf: false,
      includesMusic: false,
      note: '国际版 Z.ai $160/月，高阶主力占用期间黑五 Pro 闲置',
    },
    {
      id: 'idle_org_seat',
      group: '致黑五空闲的 Plan',
      name: '公司 / 学校统一账号',
      short: '团队/学校账号',
      tone: 'gray',
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

    // Replaceable: Google Gemini Pro (5 regions)
    {
      id: 'gemini_pro_tr',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（土区）',
      short: 'Gemini Pro · 土区',
      tone: 'gemini',
      currency: 'TRY',
      amount: 870,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '870 TRY/月，随里拉汇率走势自动折算；可单独勾选 6 月追调标价',
    },
    {
      id: 'gemini_pro_jp',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（日区）',
      short: 'Gemini Pro · 日区',
      tone: 'gemini',
      currency: 'JPY',
      amount: 2900,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '2,900 JPY/月 ≈ ¥122',
    },
    {
      id: 'gemini_pro_hk',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（港区）',
      short: 'Gemini Pro · 港区',
      tone: 'gemini',
      currency: 'HKD',
      amount: 158,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '158 HKD/月 ≈ ¥134',
    },
    {
      id: 'gemini_pro_tw',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（台区）',
      short: 'Gemini Pro · 台区',
      tone: 'gemini',
      currency: 'TWD',
      amount: 650,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '650 TWD/月 ≈ ¥132',
    },
    {
      id: 'gemini_pro_us',
      group: '黑五可平替 · Google Gemini',
      name: 'Gemini Pro（美区）',
      short: 'Gemini Pro · 美区',
      tone: 'gemini',
      currency: 'USD',
      amount: 19.99,
      dynamicPrice: null,
      isGeminiPro: true,
      replaceableByBf: true,
      includesMusic: false,
      note: '$19.99/月 ≈ ¥133',
    },

    // Replaceable: OpenAI ChatGPT
    {
      id: 'gpt_plus_tr',
      group: '黑五可平替 · OpenAI ChatGPT',
      name: 'ChatGPT Plus（土区）',
      short: 'ChatGPT Plus · 土区',
      tone: 'openai',
      currency: 'TRY',
      amount: 999.99,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '999.99 TRY/月 ≈ ¥132',
    },
    {
      id: 'gpt_plus_jp',
      group: '黑五可平替 · OpenAI ChatGPT',
      name: 'ChatGPT Plus（日区）',
      short: 'ChatGPT Plus · 日区',
      tone: 'openai',
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
      tone: 'openai',
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
      tone: 'claude',
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
      tone: 'claude',
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
      tone: 'claude',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '$20/月 ≈ ¥133',
    },

    // Replaceable: Moonshot Kimi (China CNY & International/US USD)
    {
      id: 'kimi_go_cn',
      group: '黑五可平替 · Moonshot Kimi',
      name: 'Kimi Go（国区）',
      short: 'Kimi Go · 国区',
      tone: 'kimi',
      currency: 'CNY',
      amount: 49,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国区 ¥49/月（不含 Kimi Code）',
    },
    {
      id: 'kimi_plus_cn',
      group: '黑五可平替 · Moonshot Kimi',
      name: 'Kimi Plus（国区）',
      short: 'Kimi Plus · 国区',
      tone: 'kimi',
      currency: 'CNY',
      amount: 99,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国区 ¥99/月',
    },
    {
      id: 'kimi_plus_us',
      group: '黑五可平替 · Moonshot Kimi',
      name: 'Kimi Plus（美区）',
      short: 'Kimi Plus · 美区',
      tone: 'kimi',
      currency: 'USD',
      amount: 19,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国际/美区 $19/月 ≈ ¥127',
    },
    {
      id: 'kimi_pro_cn',
      group: '黑五可平替 · Moonshot Kimi',
      name: 'Kimi Pro（国区）',
      short: 'Kimi Pro · 国区',
      tone: 'kimi',
      currency: 'CNY',
      amount: 199,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国区 ¥199/月',
    },
    {
      id: 'kimi_pro_us',
      group: '黑五可平替 · Moonshot Kimi',
      name: 'Kimi Pro（美区）',
      short: 'Kimi Pro · 美区',
      tone: 'kimi',
      currency: 'USD',
      amount: 39,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国际/美区 $39/月 ≈ ¥260',
    },

    // Replaceable: Zhipu GLM / Z.ai (China CNY & International/US USD)
    {
      id: 'glm_lite_cn',
      group: '黑五可平替 · 智谱 GLM',
      name: 'GLM Lite（国区）',
      short: 'GLM Lite · 国区',
      tone: 'glm',
      currency: 'CNY',
      amount: 49,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国区 BigModel ¥49/月',
    },
    {
      id: 'glm_lite_us',
      group: '黑五可平替 · 智谱 GLM',
      name: 'GLM Lite（美区 Z.ai）',
      short: 'GLM Lite · 美区',
      tone: 'glm',
      currency: 'USD',
      amount: 18,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国际版 Z.ai $18/月 ≈ ¥120',
    },
    {
      id: 'glm_pro_cn',
      group: '黑五可平替 · 智谱 GLM',
      name: 'GLM Pro（国区）',
      short: 'GLM Pro · 国区',
      tone: 'glm',
      currency: 'CNY',
      amount: 149,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国区 BigModel ¥149/月',
    },
    {
      id: 'glm_pro_us',
      group: '黑五可平替 · 智谱 GLM',
      name: 'GLM Pro（美区 Z.ai）',
      short: 'GLM Pro · 美区',
      tone: 'glm',
      currency: 'USD',
      amount: 72,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: '国际版 Z.ai $72/月 ≈ ¥480',
    },

    // Replaceable: Cognition Devin
    {
      id: 'devin_pro_us',
      group: '黑五可平替 · Cognition Devin',
      name: 'Devin Pro（美区）',
      short: 'Devin Pro · 美区',
      tone: 'devin',
      currency: 'USD',
      amount: 20,
      dynamicPrice: null,
      replaceableByBf: true,
      includesMusic: false,
      note: 'Cognition Devin Pro $20/月（支持直接在选择器顶部自定义价格）',
    },
  ];

  // Brand-grouped Notion Database Select hierarchy (Unified Brand Colors across all tiers!)
  const PLAN_BRAND_GROUPS = [
    {
      brand: '无订阅 / 免费账号',
      families: [
        {
          id: 'fam_none',
          name: '本月不买',
          tone: 'gray',
          kind: 'idle',
          badge: '无需求',
          variants: [{ region: '默认', catalogId: 'none_idle', priceText: '¥0' }],
        },
        {
          id: 'fam_org',
          name: '公司 / 学校统一账号',
          tone: 'gray',
          kind: 'idle',
          badge: '致空闲',
          variants: [{ region: '免费配额', catalogId: 'idle_org_seat', priceText: '¥0' }],
        },
      ],
    },
    {
      brand: 'Google Gemini',
      families: [
        {
          id: 'fam_gemini_pro',
          name: 'Gemini Pro',
          tone: 'gemini',
          kind: 'replace',
          badge: '可被黑五取代',
          variants: [
            { region: '土区', catalogId: 'gemini_pro_tr', priceText: '870 TRY' },
            { region: '日区', catalogId: 'gemini_pro_jp', priceText: '2,900 JPY' },
            { region: '港区', catalogId: 'gemini_pro_hk', priceText: '158 HKD' },
            { region: '台区', catalogId: 'gemini_pro_tw', priceText: '650 TWD' },
            { region: '美区', catalogId: 'gemini_pro_us', priceText: '$19.99' },
          ],
        },
        {
          id: 'fam_gemini_ultra5',
          name: 'Google Ultra 5x',
          tone: 'gemini',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区旧价', catalogId: 'ultra_idle', priceText: '旧价合约' },
            { region: '土区新价', catalogId: 'idle_ultra_tr_new', priceText: '4,750 TRY' },
            { region: '日区', catalogId: 'idle_ultra_jp', priceText: '14,500 JPY' },
            { region: '港区', catalogId: 'idle_ultra_hk', priceText: '780 HKD' },
            { region: '台区', catalogId: 'idle_ultra_tw', priceText: '3,250 TWD' },
            { region: '美区', catalogId: 'idle_ultra_us', priceText: '$99.99' },
          ],
        },
        {
          id: 'fam_gemini_ultra20',
          name: 'Google Ultra 20x',
          tone: 'gemini',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_ultra_20x_tr', priceText: '9,500 TRY' },
            { region: '日区', catalogId: 'idle_ultra_20x', priceText: '32,000 JPY' },
            { region: '港区', catalogId: 'idle_ultra_20x_hk', priceText: '1,560 HKD' },
            { region: '台区', catalogId: 'idle_ultra_20x_tw', priceText: '6,500 TWD' },
            { region: '美区', catalogId: 'idle_ultra_20x_us', priceText: '$199.99' },
          ],
        },
      ],
    },
    {
      brand: 'OpenAI ChatGPT',
      families: [
        {
          id: 'fam_gpt_plus',
          name: 'ChatGPT Plus',
          tone: 'openai',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '土区', catalogId: 'gpt_plus_tr', priceText: '999.99 TRY' },
            { region: '日区', catalogId: 'gpt_plus_jp', priceText: '3,000 JPY' },
            { region: '美区', catalogId: 'gpt_plus_us', priceText: '$20' },
          ],
        },
        {
          id: 'fam_gpt_pro100',
          name: 'ChatGPT Pro 100 (10x)',
          tone: 'openai',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_gpt_pro100_tr', priceText: '5,300 TRY' },
            { region: '日区', catalogId: 'idle_gpt_pro100_jp', priceText: '16,800 JPY' },
            { region: '美区', catalogId: 'idle_gpt_pro100_us', priceText: '$100' },
          ],
        },
        {
          id: 'fam_gpt_pro',
          name: 'ChatGPT Pro 200（历史）',
          tone: 'openai',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_gpt_pro_tr', priceText: '10,000 TRY' },
            { region: '日区', catalogId: 'idle_gpt_pro_jp', priceText: '30,000 JPY' },
            { region: '美区', catalogId: 'idle_gpt_pro', priceText: '$200' },
          ],
        },
        {
          id: 'fam_gpt_pro500',
          name: 'ChatGPT Pro 500 (50x)',
          tone: 'openai',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_gpt_pro500_tr', priceText: '26,499 TRY' },
            { region: '日区', catalogId: 'idle_gpt_pro500_jp', priceText: '75,000 JPY' },
            { region: '美区', catalogId: 'idle_gpt_pro500_us', priceText: '$500' },
          ],
        },
      ],
    },
    {
      brand: 'Anthropic Claude',
      families: [
        {
          id: 'fam_claude_pro',
          name: 'Claude Pro',
          tone: 'claude',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '土区', catalogId: 'claude_pro_tr', priceText: '999.99 TRY' },
            { region: '日区', catalogId: 'claude_pro_jp', priceText: '3,000 JPY' },
            { region: '美区', catalogId: 'claude_pro_us', priceText: '$20' },
          ],
        },
        {
          id: 'fam_claude_max',
          name: 'Claude Max 5x',
          tone: 'claude',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_claude_max_tr', priceText: '7,000 TRY' },
            { region: '日区', catalogId: 'idle_claude_max_jp', priceText: '20,000 JPY' },
            { region: '美区', catalogId: 'idle_claude_max', priceText: '$100' },
          ],
        },
        {
          id: 'fam_claude_max20',
          name: 'Claude Max 20x (Ultra)',
          tone: 'claude',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '土区', catalogId: 'idle_claude_max20_tr', priceText: '13,000 TRY' },
            { region: '日区', catalogId: 'idle_claude_max20_jp', priceText: '33,000 JPY' },
            { region: '美区', catalogId: 'idle_claude_max20_us', priceText: '$200' },
          ],
        },
      ],
    },
    {
      brand: 'Cognition Devin',
      families: [
        {
          id: 'fam_devin_pro',
          name: 'Devin Pro',
          tone: 'devin',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [{ region: '美区', catalogId: 'devin_pro_us', priceText: '$20' }],
        },
        {
          id: 'fam_devin_max',
          name: 'Devin Max',
          tone: 'devin',
          kind: 'idle',
          badge: '致空闲',
          variants: [{ region: '美区', catalogId: 'idle_devin_max_us', priceText: '$200' }],
        },
      ],
    },
    {
      brand: 'Moonshot Kimi',
      families: [
        {
          id: 'fam_kimi_go',
          name: 'Kimi Go',
          tone: 'kimi',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [{ region: '国区', catalogId: 'kimi_go_cn', priceText: '¥49' }],
        },
        {
          id: 'fam_kimi_plus',
          name: 'Kimi Plus',
          tone: 'kimi',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '国区', catalogId: 'kimi_plus_cn', priceText: '¥99' },
            { region: '美区', catalogId: 'kimi_plus_us', priceText: '$19' },
          ],
        },
        {
          id: 'fam_kimi_pro',
          name: 'Kimi Pro',
          tone: 'kimi',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '国区', catalogId: 'kimi_pro_cn', priceText: '¥199' },
            { region: '美区', catalogId: 'kimi_pro_us', priceText: '$39' },
          ],
        },
        {
          id: 'fam_kimi_max',
          name: 'Kimi Max',
          tone: 'kimi',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '国区', catalogId: 'idle_kimi_max_cn', priceText: '¥699' },
            { region: '美区', catalogId: 'idle_kimi_max_us', priceText: '$99' },
          ],
        },
      ],
    },
    {
      brand: '智谱 GLM (Z.ai)',
      families: [
        {
          id: 'fam_glm_lite',
          name: 'GLM Lite',
          tone: 'glm',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '国区', catalogId: 'glm_lite_cn', priceText: '¥49' },
            { region: '美区', catalogId: 'glm_lite_us', priceText: '$18' },
          ],
        },
        {
          id: 'fam_glm_pro',
          name: 'GLM Pro',
          tone: 'glm',
          kind: 'replace',
          badge: '可被黑五平替',
          variants: [
            { region: '国区', catalogId: 'glm_pro_cn', priceText: '¥149' },
            { region: '美区', catalogId: 'glm_pro_us', priceText: '$72' },
          ],
        },
        {
          id: 'fam_glm_max',
          name: 'GLM Max',
          tone: 'glm',
          kind: 'idle',
          badge: '致空闲',
          variants: [
            { region: '国区', catalogId: 'idle_glm_max_cn', priceText: '¥469' },
            { region: '美区', catalogId: 'idle_glm_max_us', priceText: '$160' },
          ],
        },
      ],
    },
  ];

  // 5 Major Regional Black Friday Deals + Custom
  const BF_DEAL_PRESETS = {
    tr_ios: {
      id: 'tr_ios',
      regionLabel: '土区',
      label: '土区 App Store 黑五 Pro',
      currency: 'TRY',
      amount: 3600,
      cnyCost: Math.round(3600 * FX_BASE_CNY_PER_UNIT.TRY), // 477
      defaultMonthlyProId: 'gemini_pro_tr',
      note: '折合 ¥39.7/月 · 独立 Apple ID 内购，同区月付 870 TRY',
    },
    jp_web: {
      id: 'jp_web',
      regionLabel: '日区',
      label: '日区官方黑五 Pro',
      currency: 'JPY',
      amount: 14500,
      cnyCost: Math.round(14500 * FX_BASE_CNY_PER_UNIT.JPY), // 609
      defaultMonthlyProId: 'gemini_pro_jp',
      note: '折合 ¥50.8/月 · 首年半价，同区月付 2,900 JPY',
    },
    hk_web: {
      id: 'hk_web',
      regionLabel: '港区',
      label: '港区官方黑五 Pro',
      currency: 'HKD',
      amount: 794,
      cnyCost: Math.round(794 * FX_BASE_CNY_PER_UNIT.HKD), // 675
      defaultMonthlyProId: 'gemini_pro_hk',
      note: '折合 ¥56.3/月 · 约原年费 1,588 HKD 半价，同区月付 158 HKD',
    },
    tw_web: {
      id: 'tw_web',
      regionLabel: '台区',
      label: '台区官方黑五 Pro',
      currency: 'TWD',
      amount: 3250,
      cnyCost: Math.round(3250 * FX_BASE_CNY_PER_UNIT.TWD), // 658
      defaultMonthlyProId: 'gemini_pro_tw',
      note: '折合 ¥54.8/月 · 约原年费 6,500 TWD 半价，同区月付 650 TWD',
    },
    us_web: {
      id: 'us_web',
      regionLabel: '美区',
      label: '美区官方黑五 Pro',
      currency: 'USD',
      amount: 99.99,
      cnyCost: Math.round(99.99 * FX_BASE_CNY_PER_UNIT.USD), // 667
      defaultMonthlyProId: 'gemini_pro_us',
      note: '折合 ¥55.6/月 · 原年费 $199.99 半价，同区月付 $19.99',
    },
    custom: {
      id: 'custom',
      regionLabel: '自定义',
      label: '自定义币种与年费',
      currency: 'CNY',
      amount: 500,
      cnyCost: 500,
      defaultMonthlyProId: null,
      note: '手动填写任意实付人民币或外币包年金额',
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

  function buildMonthPlan(templateKey, regionProId) {
    const proId = regionProId || 'gemini_pro_tr';
    const plans = [];
    for (let i = 0; i < 12; i++) {
      if (templateKey === 'default') {
        if (i <= 3) {
          plans.push([makeSubItem('ultra_idle', 1)]);
        } else {
          plans.push([makeSubItem(proId, 1)]);
        }
      } else if (templateKey === 'offseason_only') {
        if (i === 0) {
          plans.push([makeSubItem(proId, 1)]);
        } else if (i >= 1 && i <= 3) {
          plans.push([makeSubItem('ultra_idle', 1)]);
        } else if (i >= 4 && i <= 8) {
          plans.push([makeSubItem(proId, 1)]);
        } else {
          plans.push([]);
        }
      } else if (templateKey === 'all_pro' || templateKey === 'region_pro') {
        plans.push([makeSubItem(proId, 1)]);
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

  function deriveDefaultBuyPlans(monthPlans) {
    const buyMonthPlans = [];
    const buyMonthSynced = [];
    for (let i = 0; i < 12; i++) {
      const items = Array.isArray(monthPlans && monthPlans[i]) ? monthPlans[i] : [];
      let dropIdx = items.findIndex((it) => it && (it.isGeminiPro || it.dynamicPrice === 'gemini_pro') && it.replaceableByBf !== false);
      if (dropIdx === -1) {
        let bestAmt = -1;
        items.forEach((it, idx) => {
          if (it && it.replaceableByBf) {
            const val = Number(it.amount) || 0;
            if (val > bestAmt) {
              bestAmt = val;
              dropIdx = idx;
            }
          }
        });
      }
      if (dropIdx >= 0) {
        buyMonthPlans.push(items.filter((_, idx) => idx !== dropIdx).map((it) => Object.assign({}, it)));
        buyMonthSynced.push(false);
      } else {
        buyMonthPlans.push(items.map((it) => Object.assign({}, it)));
        buyMonthSynced.push(true);
      }
    }
    return { buyMonthPlans, buyMonthSynced };
  }

  function buildPlanPair(templateKey, regionProId) {
    const monthPlans = buildMonthPlan(templateKey, regionProId);
    if (templateKey === 'empty') {
      return {
        monthPlans,
        buyMonthPlans: Array.from({ length: 12 }, () => []),
        buyMonthSynced: Array(12).fill(true),
      };
    }
    const derived = deriveDefaultBuyPlans(monthPlans);
    return {
      monthPlans,
      buyMonthPlans: derived.buyMonthPlans,
      buyMonthSynced: derived.buyMonthSynced,
    };
  }

  const DEFAULT_PAIR = buildPlanPair('default');

  const DEFAULT_STATE = {
    schemaVersion: 3,
    monthPlans: DEFAULT_PAIR.monthPlans,
    buyMonthPlans: DEFAULT_PAIR.buyMonthPlans,
    buyMonthSynced: DEFAULT_PAIR.buyMonthSynced,
    monthEdited: Array(12).fill(false),
    bfPicked: false,
    bfPreset: 'tr_ios',
    bfCurrency: 'TRY',
    bfRawAmount: 3600,
    bfCostCny: BF_DEAL_PRESETS.tr_ios.cnyCost,
    currentUltraCny: 265,
    monthlyProRegion: 'tr',
    monthlyProBaseTry: 870,
    monthlyProBaseJpy: 2900,
    fxAnnualChangePct: Object.assign({}, DEFAULT_FX_ANNUAL_PCT),
    tryAnnualDepRate: 22,
    googleMidYearHike: false,
    monthsSinceLaunch: 0,
    effectiveSotaMonths: 7,
    nextFlagshipInterval: 10,
    retainProbPct: 65,
  };

  function makePresetPatch(templateKey, regionProId, extra) {
    const pair = buildPlanPair(templateKey, regionProId);
    return Object.assign({}, DEFAULT_STATE, pair, extra || {});
  }

  const SCENARIO_PRESETS = [
    {
      id: 'tr_bf_baseline',
      name: '土区黑五 3,600 TRY（前4月 Ultra + 后8月 Pro）',
      desc: '12-3月保留土区旧价 Ultra，4-11月省下土区 Pro',
      patch: makePresetPatch('default', 'gemini_pro_tr', {
        bfPicked: true,
        monthEdited: Array(12).fill(true),
      }),
    },
    {
      id: 'jp_bf_compare',
      name: '日区黑五 14,500 JPY（全年省下日区 Pro）',
      desc: '全年 12 个月直接用黑五替代日区月付 Pro',
      patch: makePresetPatch('all_pro', 'gemini_pro_jp', {
        bfPicked: true,
        bfPreset: 'jp_web',
        bfCurrency: 'JPY',
        bfRawAmount: 14500,
        bfCostCny: BF_DEAL_PRESETS.jp_web.cnyCost,
        monthEdited: Array(12).fill(false),
      }),
    },
    {
      id: 'hk_bf_year',
      name: '港区黑五 794 HKD（全年省下港区 Pro）',
      desc: '港区半价年付对照港区 158 HKD 月付',
      patch: makePresetPatch('all_pro', 'gemini_pro_hk', {
        bfPicked: true,
        bfPreset: 'hk_web',
        bfCurrency: 'HKD',
        bfRawAmount: 794,
        bfCostCny: BF_DEAL_PRESETS.hk_web.cnyCost,
        monthEdited: Array(12).fill(false),
      }),
    },
    {
      id: 'us_bf_year',
      name: '美区黑五 $99.99（全年省下美区 Pro）',
      desc: '美区半价年付对照美区 $19.99 月付',
      patch: makePresetPatch('all_pro', 'gemini_pro_us', {
        bfPicked: true,
        bfPreset: 'us_web',
        bfCurrency: 'USD',
        bfRawAmount: 99.99,
        bfCostCny: BF_DEAL_PRESETS.us_web.cnyCost,
        monthEdited: Array(12).fill(false),
      }),
    },
    {
      id: 'apr_obsolete',
      name: '仅省淡季 5 个月（保守视角）',
      desc: '1-3月保留 Ultra，4-8月省下 Pro，留存把握 45%',
      patch: makePresetPatch('offseason_only', 'gemini_pro_tr', {
        bfPicked: true,
        monthEdited: Array(12).fill(true),
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
      type: 'rival',
      summary: '代码与 Agent 能力大幅拉高，但 2.5 Pro 仍在长文本与多模态场景保有竞争力。',
      durability: '第 6 个月',
    },
    {
      date: '2025.11',
      model: 'Claude Opus 4.5 (11-24) / Gemini 3.0 Pro',
      type: 'milestone',
      summary: '2.5 Pro（03-25）一直撑到 Opus 4.5 上线共约 8 个月；同期 Gemini 3.0 Pro 幻觉翻车，3 个月后由 3.1 Pro 修正。',
      durability: '实战 8 个月',
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
      summary: '按 11 月起算（距 3.1 Pro 9 个月）；参照 2.5 Pro 撑到 Opus 4.5 约 8 个月，下代旗舰预计 2027年8~10月。',
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
    FX_BASE_CNY_PER_UNIT,
    FX_CURRENCY_META,
    DEFAULT_FX_ANNUAL_PCT,
    CURRENCIES,
    IDLE_PLAN_CATALOG,
    SUB_CATALOG,
    PLAN_BRAND_GROUPS,
    BF_DEAL_PRESETS,
    DEFAULT_STATE,
    SCENARIO_PRESETS,
    HISTORICAL_TIMELINE,
    TRY_FX_HISTORY,
    makeSubItem,
    buildMonthPlan,
    deriveDefaultBuyPlans,
    buildPlanPair,
  };
});
