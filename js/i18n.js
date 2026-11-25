(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SubLedgerI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const LANG_STORAGE_KEY = 'ai_sub_ledger_lang';
  const SUPPORTED_LANGS = ['zh-CN', 'en-US'];

  const MESSAGES = {
    'zh-CN': {
      'doc.title': 'AI 黑五包年决策账本',
      'brand.name': 'AI 黑五决策账本',
      'nav.step0': '1. 方案',
      'nav.step1': '2. 对照表格',
      'nav.step2': '3. 汇率与权益',
      'nav.step3': '4. 结论',
      'nav.presets': '预设场景...',
      'nav.reset': '重置',
      'nav.prev': '上一步',
      'nav.next': '下一步',
      'nav.seeVerdict': '查看结论',
      'nav.mobilePrev': '← 上一步',
      'nav.mobileNext': '下一步 →',
      'nav.langTitle': '切换界面语言（中文 / English）',

      'step1.title': '选择黑五包年方案',
      'step1.lead': '确定本次需要提前支付的包年成本，支持土/日/港/台/美五区预设或自定义原币金额。',
      'step1.trName': '土区 App Store 黑五 Pro',
      'step1.trPrice': '3,600 TRY ≈ ¥477 / 年',
      'step1.trNote': '折合 ¥39.7/月 · 独立 Apple ID 内购 · 同区月付 870 TRY',
      'step1.jpName': '日区官方黑五 Pro',
      'step1.jpPrice': '14,500 JPY ≈ ¥609 / 年',
      'step1.jpNote': '折合 ¥50.8/月 · 首年半价 · 同区月付 2,900 JPY',
      'step1.twName': '台区官方黑五 Pro',
      'step1.twPrice': '约 3,250 TWD ≈ ¥658 / 年',
      'step1.twNote': '折合 ¥54.8/月 · 原年费 6,500 TWD 半价 · 同区月付 650 TWD',
      'step1.usName': '美区官方黑五 Pro',
      'step1.usPrice': '$99.99 ≈ ¥667 / 年',
      'step1.usNote': '折合 ¥55.6/月 · 原年费 $199.99 半价 · 同区月付 $19.99',
      'step1.hkName': '港区官方黑五 Pro',
      'step1.hkPrice': '约 794 HKD ≈ ¥675 / 年',
      'step1.hkNote': '折合 ¥56.3/月 · 原年费 ~1,588 HKD 半价 · 同区月付 158 HKD',
      'step1.customName': '自定义币种与年费',
      'step1.customNote': '手动填写任意人民币实付额或外币包年金额',
      'step1.customPreviewEmpty': '自定义币种与金额',
      'step1.customFieldLabel': '今日实付包年金额',
      'step1.hintUnpicked': '请先选择上方一个方案，选定后将显示下一步按钮',
      'step1.hintPicked': '也可随时点击屏幕左右边缘的 < / > 翻页',
      'step1.nextBtn': '下一步：排布 12 个月方案 →',
      'step1.perYear': '≈ {yen} / 年',

      'step2.title': '不买黑五 vs 买黑五：12 个月对照',
      'step2.modeSkip': '仅看原方案（不买黑五）',
      'step2.modeBuy': '对比：买黑五 Pro',
      'step2.phaseSettings': '模型周期设置',
      'step2.phaseMeta': 'SOTA {sota}月 / 留存 {prob}%',
      'step2.tplPlaceholder': '整年模板...',
      'step2.tplRegionPro': '按当前地区填充全年 12 月 Pro',
      'step2.tplDefault': '12-3月土区旧价 Ultra 空闲 / 4-11月取代 Pro',
      'step2.tplOffseason': '1-3月 Ultra 空闲 / 4-8月取代 Pro / 9-11月停用',
      'step2.tplReplaceGpt': '12-3月 Ultra 空闲 / 4-11月取代 ChatGPT Plus',
      'step2.tplEmpty': '清空全年（全部不买）',
      'step2.hint': '点击原方案胶囊可按品牌/地区/自定义切换；在「不买黑五」列内拖动或勾选可单列批量修改',
      'step2.selectedAll': '已选全年 12 月',
      'step2.selectedN': '已选 {n} 个月',
      'step2.batchPickBtn': '批量选择方案（品牌 / 地区 / 自定义） ▾',
      'step2.batchClearBtn': '设为本月不买',
      'step2.thMonth': '月份与模型阶段',
      'step2.thTunePhase': '调周期',
      'step2.thSkip': '不买黑五（原方案 · 单列可多选）',
      'step2.thBuy': '买黑五后（全年含黑五 Pro）',
      'step2.thSaveDiff': '本月差额',
      'step2.thSaveOrig': '原方案月费',
      'step2.pickPlaceholder': '点击选择原方案',
      'step2.hikeTag': '6月追调',
      'step2.bfReplace': '黑五 Pro · 取代',
      'step2.bfIdle': '黑五 Pro · 空闲',
      'step2.bfFallback': '黑五 Pro · 顶替 1 槽',
      'step2.bfFallbackOld': '原双号 Pro',
      'step2.saveMonth': '省 {yen}/月',
      'step2.idleZero': '空闲 · ¥0',
      'step2.emptyZero': '未填 · ¥0',
      'step2.otherPlan': '其他 Plan',
      'step2.footTitle': '排布统计',
      'step2.footSkip': '原需月付 <strong>{pro}</strong> 月 · 其他 Plan <strong>{ultra}</strong> 月 · 未填 <strong>{none}</strong> 月',
      'step2.footBuy': '黑五 Pro 生效 <strong>{pro}</strong> 月 · 空闲 <strong>{idle}</strong> 月',
      'step2.footRight': '第 4 步汇总计价',
      'step2.phaseTooltip': '点击调整模型周期',

      'picker.singleTarget': '{month} · 原方案',
      'picker.batchAll': '批量修改：全年 12 个月',
      'picker.batchN': '批量修改：已选 {n} 个月',
      'picker.done': '完成',
      'picker.regionHint': '切换「{name}」地区与计价：',
      'picker.hikeCheck': '6月追调',
      'picker.updatePrice': '更新价格',
      'picker.regionsCount': '{n} 个地区',
      'picker.canReplace': '可省月费',
      'picker.customToggle': '+ 自定义被取代订阅 / 致空闲 Plan',
      'picker.customReplace': '被黑五取代',
      'picker.customIdle': '致黑五空闲',
      'picker.customNamePh': '输入订阅/方案名称',
      'picker.customPricePh': '原币月费',
      'picker.apply': '应用',
      'picker.applyIdle': '设为致空闲 Plan',

      'modal.kicker': 'MODEL LIFECYCLE · CENTER PEEK',
      'modal.close': '关闭 ×',
      'modal.title': '按模型周期率调整阶段与留存把握',
      'modal.lead': '参考历史实证：Gemini 2.5 Pro 撑到 Sonnet 4.5 约 6 个月、撑到 Opus 4.5 前约 7 个月；3.1 Pro 到 Gemini 4 间隔约 9 个月。拖动滑块时，后方 12 个月表格的阶段色标会实时更新。',
      'modal.sotaKey': '维持 SOTA / 可当主力时长',
      'modal.nextKey': '下代成为 SOTA 的模型间隔',
      'modal.monthsVal': '{n} 个月',
      'modal.sotaHelp': '指你认为当前这一代模型能维持 SOTA 水准、足够作为主力生产力使用的时长。自 2026年11月起算 {n} 个月，预计可用至 {until}。',
      'modal.nextHelp': '指 Google 下一代能够重新成为 SOTA 的旗舰模型出现间隔。自 2026年11月起算 {n} 个月，预计在 {when} 登场。',
      'modal.nodeStart': '当前旗舰 (11月)',
      'modal.nodeSota': '主力期止 ({when})',
      'modal.nodeNext': '下一代成为 SOTA 的模型 ({when})',
      'modal.legendHoneymoon': '蜜月领先期（1–3月）',
      'modal.legendSteady': '第一梯队稳态',
      'modal.legendRisk': '空窗/掉队风险',
      'modal.legendNext': '新旗舰窗口',
      'modal.retainKey': '中后期留存把握 (p)',
      'modal.evTitle': '主观留存把握 vs 数学盈亏平衡线',
      'modal.evLine': '盈亏线 {pct}%',
      'modal.evAbove': '高于盈亏线 +{gap}%',
      'modal.evBelow': '低于盈亏线 {gap}%',
      'modal.evLeft': '0%（中后期换别家）',
      'modal.evRight': '100%（按计划用满）',
      'modal.doneBtn': '完成并返回表格',

      'step3.title': '核对汇率走势、续费与附带权益',
      'step3.lead': '今日黑五包年按当前即期汇率一次性锁定；下方仅展示你在第 2 步中实际涉及的外币月付汇率与续费设置。',
      'step3.ultraSec': '土区旧价 Ultra 续费情况（因第 2 步已安排该项）',
      'step3.ultraFee': '现有 Ultra 5x 月费',
      'step3.unitYuanMo': '元 / 月',
      'step3.ultraMode': '续费稳定性',
      'step3.ultraAlways': '全程可续',
      'step3.ultraFailAt': '中途断续',
      'step3.ultraImmediate': '首月即断',
      'step3.ultraFailMonth': '预计断续月份',
      'step3.ultraFallback': '断续后旺季兜底',
      'step3.fbJp': '改开日区 Ultra 5x（14,500 JPY ≈ ¥609/月）',
      'step3.fbUs': '改开美区 Ultra 5x（$99.99 ≈ ¥667/月）',
      'step3.fbDouble': '放弃 Ultra，改用双号 Pro（黑五可抵 1 槽）',
      'step3.fxSec': '未来 12 个月外币汇率走势（仅作用于第 2 步中的外币月付）',
      'step3.fxNoneKey': '当前外币月付',
      'step3.fxNoneVal': '第 2 步方案中暂未涉及外币月付（今日黑五包年已按当前即期汇率锁定，不受未来汇率波动影响）。',
      'step3.fxBaseKey': '{name}基准汇率',
      'step3.fxDeltaKey': '{name}年化涨跌幅',
      'step3.fxMonths': '· 影响第 2 步中 {n} 个月',
      'step3.fxMonthsShort': '· 涉及 {n} 个月 · {base}',
      'step3.fxUp': '升值 +{n}%',
      'step3.fxDown': '贬值 {n}%',
      'step3.fxFlat': '持平 0%',
      'step3.fxPreview': '{name}{dir}：{sample}将从今日约 ¥{now} 变为第 12 个月的约 ¥{end}。{note}',
      'step3.fxDirUp': '升值 {n}%',
      'step3.fxDirDown': '贬值 {n}%',
      'step3.fxDirFlat': '持平',
      'step3.perksSec': '附带权益折抵（默认均按 ¥0）',
      'step3.ytmTag': 'Pro 折抵 ¥0',
      'step3.ytmNote': 'Pro 仅含 YouTube Premium Lite，不含 YT Music，无法平替听歌会员',
      'step3.musicFee': '现有听歌月费（选填）',
      'step3.musicNote': '元 / 月（仅在开启含完整 YT Music 的 Ultra 月份抵扣）',
      'step3.colabFee': 'Google Colab（选填）',
      'step3.colabNote': '元 / 月（默认 ¥0；参考低价 200 CU ≈ ¥20 / 2,000+ CU ≈ ¥160，流动性低不建议折抵）',

      'step4.calcTitle': '正在测算你的黑五决策账本',
      'step4.calcSub0': '正在汇总 12 个月不买 vs 买黑五边际排布...',
      'step4.calcSub1': '正在折算外币汇率走势与空闲期摊销...',
      'step4.calcSub2': '正在按模型周期率测算期望净收益 (EV)...',
      'step4.pill0': '12 个月排布',
      'step4.pill1': '汇率与空闲摊销',
      'step4.pill2': '模型周期 EV',
      'step4.kpiBfCost': '黑五包年成本',
      'step4.kpiBfAvg': '（折合 ¥{avg}/月）',
      'step4.kpiIdle': '黑五空闲期',
      'step4.kpiIdleZero': '0 个月（全年 12 个月均在生效）',
      'step4.kpiIdleVal': '共 {total} 个月空闲（致空闲 Plan {ultra} 月 + 未填 {none} 月，折合摊销约 {cost}）',
      'step4.kpiBreakeven': '实际回本周期',
      'step4.kpiNoBreakeven': '无法回本',
      'step4.kpiBreakevenMo': '{n} 个月',
      'step4.kpiAvgPro': '（月均平替价值 ¥{avg}/月）',
      'step4.kpiEv': '期望净收益 (EV)',
      'step4.kpiProbLine': '（盈亏概率线 {pct}%）',
      'step4.kpiRange': '最大赢 / 最大亏',
      'step4.kpiOdds': '（赔率比 {ratio} : 1）',
      'step4.kpiNoDownside': '（无下行亏损）',
      'step4.idleTitle': '空闲期说明：全年有 {total} 个月黑五 Pro 处于闲置状态',
      'step4.idleDetailUltra': '在 {months} 这 {n} 个月里，由于使用 {plans}，黑五 Pro 处于空闲状态（约占年费 {pct}%，即 {cost}）。黑五能否回本，取决于剩下 {pro} 个被取代订阅的生效月份。',
      'step4.idleDetailNone': '当前有 {n} 个未填月份黑五 Pro 闲置（折合 {cost}）。',
      'step4.chartTitle': '12 个月累积边际支出对比',
      'step4.chartNote': '实线：买黑五 Pro · 虚线：不买黑五按原方案月付',
      'step4.chartBuy': '买:{yen}',
      'step4.chartSkip': '不买:{yen}',
      'step4.chartBreakeven': '{m}回本',
      'step4.chartNextGen': '● 下一代成为 SOTA 的模型 ({m})',
      'step4.scenTitle': '四种情景对照',
      'step4.scenNote': '仅统计与黑五相关的边际订阅支出',
      'step4.scenColTitle': '情景剧本',
      'step4.scenColBuy': '买黑五',
      'step4.scenColSkip': '不买按月',
      'step4.scenColDiff': '净省 / 净亏',
      'step4.saveWord': '省 {yen}',
      'step4.lossWord': '亏 {yen}',
      'step4.notesTitle': '实证数据与操作注意',
      'step4.toggleNotes': '多区账号与附带权益注意事项',
      'step4.toggleTimeline': '历史模型周期率参考（2.5 Pro → 3.1 Pro → Gemini 4）',
      'step4.toggleFx': '土耳其里拉近三年汇率与 2027 推算',
      'step4.expCopyPng': '复制 3x 高清图',
      'step4.expSvg': '导出 SVG',
      'step4.expHtml': '导出网页',
      'step4.expText': '复制文字',

      'toast.reset': '已重置为空白初始状态',
      'toast.presetLoaded': '已载入：{name}',
      'toast.templateApplied': '已套用整年模板',
      'toast.selectMonthFirst': '请先勾选至少 1 个月份',
      'toast.clearedN': '已将 {n} 个月设为本月不买',
      'toast.priceUpdated': '已更新该方案价格',
      'toast.enterName': '请先输入方案名称',
      'toast.customApplied': '已应用自定义方案：{name}',
      'toast.copiedPng': '已复制 3x 超清图片到剪贴板，可直接粘贴',
      'toast.downloadedPng': '已下载 3x 超清 PNG 图片',
      'toast.pngFailed': '图片生成失败，请改用导出 SVG',
      'toast.exportedSvg': '已导出矢量 SVG 图片',
      'toast.exportedHtml': '已导出独立 HTML 报告网页',
      'toast.copiedText': '已复制决策摘要',
      'toast.copyFailed': '复制失败',
      'toast.langSwitched': '已切换为简体中文',
    },

    'en-US': {
      'doc.title': 'Do You Really Need Gemini Pro Black Friday?',
      'brand.name': 'Gemini Pro BF Ledger',
      'nav.step0': '1. Deal',
      'nav.step1': '2. 12-Mo Table',
      'nav.step2': '3. FX & Perks',
      'nav.step3': '4. Verdict',
      'nav.presets': 'Presets...',
      'nav.reset': 'Reset',
      'nav.prev': 'Back',
      'nav.next': 'Next',
      'nav.seeVerdict': 'See Verdict',
      'nav.mobilePrev': '← Back',
      'nav.mobileNext': 'Next →',
      'nav.langTitle': 'Switch language (中文 / English)',

      'step1.title': 'Choose a Black Friday Annual Deal',
      'step1.lead': 'Lock in your upfront annual cost across 5 regional deals (TR / JP / TW / US / HK) or enter any custom amount.',
      'step1.trName': 'Turkey App Store BF Pro',
      'step1.trPrice': '3,600 TRY ≈ ¥477 / yr',
      'step1.trNote': '¥39.7/mo avg · Dedicated Apple ID IAP · Monthly 870 TRY',
      'step1.jpName': 'Japan Official BF Pro',
      'step1.jpPrice': '14,500 JPY ≈ ¥609 / yr',
      'step1.jpNote': '¥50.8/mo avg · 50% off Year 1 · Monthly 2,900 JPY',
      'step1.twName': 'Taiwan Official BF Pro',
      'step1.twPrice': '~3,250 TWD ≈ ¥658 / yr',
      'step1.twNote': '¥54.8/mo avg · 50% off 6,500 TWD · Monthly 650 TWD',
      'step1.usName': 'US Official BF Pro',
      'step1.usPrice': '$99.99 ≈ ¥667 / yr',
      'step1.usNote': '¥55.6/mo avg · 50% off $199.99 · Monthly $19.99',
      'step1.hkName': 'Hong Kong Official BF Pro',
      'step1.hkPrice': '~794 HKD ≈ ¥675 / yr',
      'step1.hkNote': '¥56.3/mo avg · 50% off ~1,588 HKD · Monthly 158 HKD',
      'step1.customName': 'Custom Currency & Price',
      'step1.customNote': 'Enter your exact upfront payment in CNY or any foreign currency',
      'step1.customPreviewEmpty': 'Custom amount',
      'step1.customFieldLabel': 'Upfront Annual Cost',
      'step1.hintUnpicked': 'Select one deal above to unlock the Next button',
      'step1.hintPicked': 'You can also click the < / > edges anytime to navigate',
      'step1.nextBtn': 'Next: Map 12-Month Plan →',
      'step1.perYear': '≈ {yen} / yr',

      'step2.title': 'Skip vs Buy Black Friday: 12-Month Comparison',
      'step2.modeSkip': 'Baseline Only (No BF)',
      'step2.modeBuy': 'Compare: With BF Pro',
      'step2.phaseSettings': 'Model Cycle',
      'step2.phaseMeta': 'SOTA {sota}m · Retain {prob}%',
      'step2.tplPlaceholder': 'Templates...',
      'step2.tplRegionPro': 'Fill all 12 months with selected region Pro',
      'step2.tplDefault': 'Dec–Mar Legacy TR Ultra / Apr–Nov Monthly Pro',
      'step2.tplOffseason': 'Jan–Mar Ultra / Apr–Aug Pro / Sep–Nov Off',
      'step2.tplReplaceGpt': 'Dec–Mar Ultra / Apr–Nov ChatGPT Plus',
      'step2.tplEmpty': 'Clear all 12 months',
      'step2.hint': 'Click any baseline pill to pick brand/region/custom; drag or check inside the Baseline column to batch-edit',
      'step2.selectedAll': 'All 12 months selected',
      'step2.selectedN': '{n} months selected',
      'step2.batchPickBtn': 'Batch Set Plan (Brand / Region / Custom) ▾',
      'step2.batchClearBtn': 'Set to None',
      'step2.thMonth': 'Month & Model Phase',
      'step2.thTunePhase': 'Tune',
      'step2.thSkip': 'Without BF (Baseline · Multi-select)',
      'step2.thBuy': 'With BF (Includes BF Pro all year)',
      'step2.thSaveDiff': 'Monthly Diff',
      'step2.thSaveOrig': 'Baseline Cost',
      'step2.pickPlaceholder': 'Select baseline plan',
      'step2.hikeTag': 'Jun Rebase',
      'step2.bfReplace': 'BF Pro · Replaces',
      'step2.bfIdle': 'BF Pro · Idle',
      'step2.bfFallback': 'BF Pro · Covers 1 Slot',
      'step2.bfFallbackOld': 'Dual Pro',
      'step2.saveMonth': 'Save {yen}/mo',
      'step2.idleZero': 'Idle · ¥0',
      'step2.emptyZero': 'Empty · ¥0',
      'step2.otherPlan': 'Other Plan',
      'step2.footTitle': 'Summary',
      'step2.footSkip': 'Monthly paid <strong>{pro}</strong>m · Other Plan <strong>{ultra}</strong>m · Empty <strong>{none}</strong>m',
      'step2.footBuy': 'BF Pro active <strong>{pro}</strong>m · Idle <strong>{idle}</strong>m',
      'step2.footRight': 'Tallied in Step 4',
      'step2.phaseTooltip': 'Click to tune model cycle',

      'picker.singleTarget': '{month} · Baseline Plan',
      'picker.batchAll': 'Batch Edit: All 12 Months',
      'picker.batchN': 'Batch Edit: {n} Months',
      'picker.done': 'Done',
      'picker.regionHint': 'Select region & pricing for {name}:',
      'picker.hikeCheck': 'Jun FX rebase',
      'picker.updatePrice': 'Update',
      'picker.regionsCount': '{n} regions',
      'picker.canReplace': 'Saves fee',
      'picker.customToggle': '+ Custom Replaceable Sub / Idle Plan',
      'picker.customReplace': 'Replaced by BF',
      'picker.customIdle': 'Makes BF Idle',
      'picker.customNamePh': 'Plan or subscription name',
      'picker.customPricePh': 'Monthly fee',
      'picker.apply': 'Apply',
      'picker.applyIdle': 'Set as Idle Plan',

      'modal.kicker': 'MODEL LIFECYCLE · CENTER PEEK',
      'modal.close': 'Close ×',
      'modal.title': 'Model Lifecycle & Retention Probability',
      'modal.lead': 'Historical benchmark: Gemini 2.5 Pro held SOTA ~6 months until Sonnet 4.5 and ~7 months until Opus 4.5; 3.1 Pro to Gemini 4 took ~9 months. Dragging updates the 12-month table behind in real time.',
      'modal.sotaKey': 'SOTA / Primary Usability Span',
      'modal.nextKey': 'Next SOTA Flagship Interval',
      'modal.monthsVal': '{n} mo',
      'modal.sotaHelp': 'How long the current generation remains strong enough as your primary model. Starting Nov 2026, {n} months reaches {until}.',
      'modal.nextHelp': 'Expected interval until Google launches the next SOTA flagship. Starting Nov 2026, {n} months lands around {when}.',
      'modal.nodeStart': 'Current (Nov)',
      'modal.nodeSota': 'SOTA ends ({when})',
      'modal.nodeNext': 'Next-Gen SOTA ({when})',
      'modal.legendHoneymoon': 'Honeymoon (Mo 1–3)',
      'modal.legendSteady': 'Tier-1 Steady',
      'modal.legendRisk': 'Gap / Lag Risk',
      'modal.legendNext': 'Next-Gen Window',
      'modal.retainKey': 'Late-Year Retention Prob (p)',
      'modal.evTitle': 'Your Retention Confidence vs Break-Even Line',
      'modal.evLine': 'Break-even {pct}%',
      'modal.evAbove': 'Above break-even +{gap}%',
      'modal.evBelow': 'Below break-even {gap}%',
      'modal.evLeft': '0% (Switch away)',
      'modal.evRight': '100% (Full year)',
      'modal.doneBtn': 'Done & Return to Table',

      'step3.title': 'FX Outlook, Renewal & Bundled Perks',
      'step3.lead': 'Your upfront Black Friday payment is locked at today spot FX. Only foreign currencies actively used in Step 2 monthly plans appear below.',
      'step3.ultraSec': 'Legacy Turkey Ultra Renewal (Detected in Step 2)',
      'step3.ultraFee': 'Current Ultra 5x Monthly',
      'step3.unitYuanMo': 'CNY / mo',
      'step3.ultraMode': 'Renewal Stability',
      'step3.ultraAlways': 'Always Renews',
      'step3.ultraFailAt': 'Fails Mid-Year',
      'step3.ultraImmediate': 'Fails Month 1',
      'step3.ultraFailMonth': 'Expected Failure Month',
      'step3.ultraFallback': 'Fallback Strategy',
      'step3.fbJp': 'Switch to JP Ultra 5x (14,500 JPY ≈ ¥609/mo)',
      'step3.fbUs': 'Switch to US Ultra 5x ($99.99 ≈ ¥667/mo)',
      'step3.fbDouble': 'Drop Ultra, use Dual Pro (BF covers 1 slot)',
      'step3.fxSec': '12-Month FX Outlook (Applies Only to Step 2 Monthly Charges)',
      'step3.fxNoneKey': 'Active Foreign Monthly FX',
      'step3.fxNoneVal': 'No foreign-currency monthly subscriptions in Step 2 (upfront Black Friday deal is locked at today spot rate).',
      'step3.fxBaseKey': '{name} Spot Rate',
      'step3.fxDeltaKey': '{name} Annual Change vs CNY',
      'step3.fxMonths': '· Affects {n} months in Step 2',
      'step3.fxMonthsShort': '· {n} months · {base}',
      'step3.fxUp': 'Up +{n}%',
      'step3.fxDown': 'Down {n}%',
      'step3.fxFlat': 'Flat 0%',
      'step3.fxPreview': '{name} {dir}: {sample} shifts from ~¥{now} today to ~¥{end} in Month 12. {note}',
      'step3.fxDirUp': 'appreciates +{n}%',
      'step3.fxDirDown': 'depreciates {n}%',
      'step3.fxDirFlat': 'stays flat',
      'step3.perksSec': 'Bundled Perks Valuation (Default ¥0)',
      'step3.ytmTag': 'Pro Credit ¥0',
      'step3.ytmNote': 'Pro includes YouTube Premium Lite only (no YT Music ad-free/background play).',
      'step3.musicFee': 'Current Music Sub (Optional)',
      'step3.musicNote': 'CNY / mo (credited only in months with full Ultra YT Music)',
      'step3.colabFee': 'Google Colab (Optional)',
      'step3.colabNote': 'CNY / mo (default ¥0; low liquidity, avoid over-valuing bundled CU)',

      'step4.calcTitle': 'Computing Your Black Friday Ledger',
      'step4.calcSub0': 'Aggregating 12-month baseline vs Black Friday flows...',
      'step4.calcSub1': 'Applying bidirectional FX curves & idle amortization...',
      'step4.calcSub2': 'Evaluating model lifecycle EV & break-even odds...',
      'step4.pill0': '12-Mo Flows',
      'step4.pill1': 'FX & Idle Cost',
      'step4.pill2': 'Lifecycle EV',
      'step4.kpiBfCost': 'Black Friday Annual Cost',
      'step4.kpiBfAvg': '(¥{avg}/mo avg)',
      'step4.kpiIdle': 'Black Friday Idle Period',
      'step4.kpiIdleZero': '0 months (active all 12 months)',
      'step4.kpiIdleVal': '{total} idle months (Other Plan {ultra}m + Empty {none}m, ~{cost} amortized)',
      'step4.kpiBreakeven': 'Effective Break-Even',
      'step4.kpiNoBreakeven': 'Cannot break even',
      'step4.kpiBreakevenMo': '{n} months',
      'step4.kpiAvgPro': '(avg replaced value ¥{avg}/mo)',
      'step4.kpiEv': 'Expected Net Value (EV)',
      'step4.kpiProbLine': '(break-even prob {pct}%)',
      'step4.kpiRange': 'Max Upside / Max Downside',
      'step4.kpiOdds': '(reward-to-risk {ratio} : 1)',
      'step4.kpiNoDownside': '(zero downside)',
      'step4.idleTitle': 'Idle Summary: BF Pro sits idle for {total} months',
      'step4.idleDetailUltra': 'During {months} ({n} months), {plans} leaves BF Pro unused (~{pct}% of annual fee, or {cost}). Payback depends on the remaining {pro} active replacement months.',
      'step4.idleDetailNone': '{n} empty months leave BF Pro idle (~{cost} amortized).',
      'step4.chartTitle': '12-Month Cumulative Marginal Spend',
      'step4.chartNote': 'Solid: Buy BF Pro · Dashed: Skip BF & pay monthly',
      'step4.chartBuy': 'Buy:{yen}',
      'step4.chartSkip': 'Skip:{yen}',
      'step4.chartBreakeven': 'Break-even {m}',
      'step4.chartNextGen': '● Next-Gen SOTA ({m})',
      'step4.scenTitle': 'Four-Scenario Comparison',
      'step4.scenNote': 'Marginal subscription cash flows only',
      'step4.scenColTitle': 'Scenario',
      'step4.scenColBuy': 'Buy BF',
      'step4.scenColSkip': 'Skip BF',
      'step4.scenColDiff': 'Net Diff',
      'step4.saveWord': 'Save {yen}',
      'step4.lossWord': 'Loss {yen}',
      'step4.notesTitle': 'Empirical Data & Practical Notes',
      'step4.toggleNotes': 'Multi-Region Account & Bundled Perks Notes',
      'step4.toggleTimeline': 'Historical Model Lifecycle (2.5 Pro → 3.1 Pro → Gemini 4)',
      'step4.toggleFx': '3-Year TRY/CNY History & 2027 Projection',
      'step4.expCopyPng': 'Copy 3x HD Image',
      'step4.expSvg': 'Export SVG',
      'step4.expHtml': 'Export HTML',
      'step4.expText': 'Copy Text',

      'toast.reset': 'Reset to clean initial state',
      'toast.presetLoaded': 'Loaded: {name}',
      'toast.templateApplied': 'Applied 12-month template',
      'toast.selectMonthFirst': 'Select at least 1 month first',
      'toast.clearedN': 'Cleared {n} months',
      'toast.priceUpdated': 'Updated plan price',
      'toast.enterName': 'Please enter a plan name',
      'toast.customApplied': 'Applied custom plan: {name}',
      'toast.copiedPng': 'Copied 3x HD PNG to clipboard',
      'toast.downloadedPng': 'Downloaded 3x HD PNG',
      'toast.pngFailed': 'PNG render failed; try Export SVG',
      'toast.exportedSvg': 'Exported vector SVG',
      'toast.exportedHtml': 'Exported standalone HTML report',
      'toast.copiedText': 'Copied text summary',
      'toast.copyFailed': 'Copy failed',
      'toast.langSwitched': 'Switched to English',
    },
  };

  const MONTH_SHORT_EN = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const MONTH_LABEL_EN = [
    'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027',
    'Jun 2027', 'Jul 2027', 'Aug 2027', 'Sep 2027', 'Oct 2027', 'Nov 2027',
  ];

  const PHASE_LABELS_EN = {
    honeymoon: 'Honeymoon SOTA',
    steady: 'Tier-1 Steady',
    risk: 'Gap / Lag Risk',
    next_gen: 'Next-Gen SOTA',
  };

  const BRAND_EN = {
    '无订阅 / 免费账号': 'None / Free Seat',
    'Google Gemini': 'Google Gemini',
    'OpenAI ChatGPT': 'OpenAI ChatGPT',
    'Anthropic Claude': 'Anthropic Claude',
    'Moonshot Kimi': 'Moonshot Kimi',
    '智谱 GLM (Z.ai)': 'Zhipu GLM (Z.ai)',
  };

  const REGION_EN = {
    '默认': 'Default',
    '免费配额': 'Free Seat',
    '土区': 'TR',
    '土区旧价': 'TR Legacy',
    '日区': 'JP',
    '港区': 'HK',
    '台区': 'TW',
    '美区': 'US',
    '国区': 'CN',
  };

  const ITEM_SHORT_EN = {
    'Ultra 5x · 土旧': 'Ultra 5x · TR Legacy',
    'Ultra 5x · 日区': 'Ultra 5x · JP',
    'Ultra 5x · 美区': 'Ultra 5x · US',
    'Ultra 20x · 日区': 'Ultra 20x · JP',
    'Ultra 20x · 美区': 'Ultra 20x · US',
    'Claude Max': 'Claude Max',
    'ChatGPT Pro': 'ChatGPT Pro',
    'Kimi Max · 国区': 'Kimi Max · CN',
    'Kimi Max · 美区': 'Kimi Max · US',
    'GLM Max · 国区': 'GLM Max · CN',
    'GLM Max · 美区': 'GLM Max · US',
    '团队/学校账号': 'Team / School Seat',
    'Gemini Pro · 土区': 'Gemini Pro · TR',
    'Gemini Pro · 日区': 'Gemini Pro · JP',
    'Gemini Pro · 港区': 'Gemini Pro · HK',
    'Gemini Pro · 台区': 'Gemini Pro · TW',
    'Gemini Pro · 美区': 'Gemini Pro · US',
    'ChatGPT Plus · 土区': 'ChatGPT Plus · TR',
    'ChatGPT Plus · 日区': 'ChatGPT Plus · JP',
    'ChatGPT Plus · 美区': 'ChatGPT Plus · US',
    'Claude Pro · 土区': 'Claude Pro · TR',
    'Claude Pro · 日区': 'Claude Pro · JP',
    'Claude Pro · 美区': 'Claude Pro · US',
    'Kimi Go · 国区': 'Kimi Go · CN',
    'Kimi Plus · 国区': 'Kimi Plus · CN',
    'Kimi Plus · 美区': 'Kimi Plus · US',
    'Kimi Pro · 国区': 'Kimi Pro · CN',
    'Kimi Pro · 美区': 'Kimi Pro · US',
    'GLM Lite · 国区': 'GLM Lite · CN',
    'GLM Lite · 美区': 'GLM Lite · US',
    'GLM Pro · 国区': 'GLM Pro · CN',
    'GLM Pro · 美区': 'GLM Pro · US',
    '本月不买': 'None',
    '公司 / 学校统一账号': 'Team / School Seat',
  };

  const CURRENCY_NAME_EN = {
    TRY: { name: 'TRY', sample: '870 TRY/mo', note: 'Negative = TRY depreciates vs CNY (monthly bills get cheaper). TRY items also support optional June price rebase.' },
    JPY: { name: 'JPY', sample: '2,900 JPY/mo', note: 'Positive = JPY strengthens vs CNY (monthly bills rise); negative = weakens.' },
    HKD: { name: 'HKD', sample: '158 HKD/mo', note: 'HKD is pegged to USD (7.75–7.85) and typically tracks USD vs CNY.' },
    TWD: { name: 'TWD', sample: '650 TWD/mo', note: 'Positive = TWD strengthens vs CNY (monthly bills rise); negative = weakens.' },
    USD: { name: 'USD', sample: '$19.99/mo', note: 'Positive = USD strengthens vs CNY (monthly bills rise); negative = weakens.' },
  };

  function detectInitialLang() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(LANG_STORAGE_KEY);
        if (SUPPORTED_LANGS.includes(saved)) return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    if (typeof navigator !== 'undefined') {
      const navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || 'zh-CN').toLowerCase();
      return navLang.startsWith('zh') ? 'zh-CN' : 'en-US';
    }
    return 'zh-CN';
  }

  let currentLang = detectInitialLang();

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return currentLang;
    currentLang = lang;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
      }
    } catch {
      // Ignore storage access errors
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.title = t('doc.title');
    }
    return currentLang;
  }

  function t(key, params, langOverride) {
    const lang = langOverride || currentLang;
    const dict = MESSAGES[lang] || MESSAGES['zh-CN'];
    let str = dict[key] != null ? dict[key] : (MESSAGES['zh-CN'][key] != null ? MESSAGES['zh-CN'][key] : key);
    if (params && typeof params === 'object') {
      Object.keys(params).forEach((k) => {
        str = str.replaceAll(`{${k}}`, String(params[k]));
      });
    }
    return str;
  }

  function applyDomTranslations(rootEl) {
    if (typeof document === 'undefined') return;
    const scope = rootEl || document;
    document.documentElement.lang = currentLang;
    document.title = t('doc.title');
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
  }

  function localizeMonth(monthIndex, format, langOverride) {
    const lang = langOverride || currentLang;
    if (lang === 'en-US') {
      return format === 'short' ? MONTH_SHORT_EN[monthIndex] : MONTH_LABEL_EN[monthIndex];
    }
    return null;
  }

  function localizePhase(phase, langOverride) {
    const lang = langOverride || currentLang;
    if (lang === 'en-US' && phase && PHASE_LABELS_EN[phase.key]) {
      return PHASE_LABELS_EN[phase.key];
    }
    return phase ? phase.label : '';
  }

  function localizeBrand(brand, langOverride) {
    const lang = langOverride || currentLang;
    return lang === 'en-US' ? (BRAND_EN[brand] || brand) : brand;
  }

  function localizeRegion(region, langOverride) {
    const lang = langOverride || currentLang;
    return lang === 'en-US' ? (REGION_EN[region] || region) : region;
  }

  function localizeItemShort(shortText, langOverride) {
    const lang = langOverride || currentLang;
    return lang === 'en-US' ? (ITEM_SHORT_EN[shortText] || shortText) : shortText;
  }

  function localizeCurrencyMeta(code, zhMeta, langOverride) {
    const lang = langOverride || currentLang;
    if (lang === 'en-US' && CURRENCY_NAME_EN[code]) {
      return {
        name: CURRENCY_NAME_EN[code].name,
        sampleLabel: CURRENCY_NAME_EN[code].sample,
        note: CURRENCY_NAME_EN[code].note,
      };
    }
    return {
      name: zhMeta.name,
      sampleLabel: zhMeta.sampleLabel,
      note: zhMeta.note,
    };
  }

  function formatFutureMonth(baseYear, baseMonth, addMonths, langOverride) {
    const lang = langOverride || currentLang;
    const total = baseYear * 12 + (baseMonth - 1) + Math.round(addMonths);
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    if (lang === 'en-US') {
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${names[m - 1]} ${y}`;
    }
    return `${y}年${m}月`;
  }

  return {
    LANG_STORAGE_KEY,
    SUPPORTED_LANGS,
    MESSAGES,
    detectInitialLang,
    getLang,
    setLang,
    t,
    applyDomTranslations,
    localizeMonth,
    localizePhase,
    localizeBrand,
    localizeRegion,
    localizeItemShort,
    localizeCurrencyMeta,
    formatFutureMonth,
  };
});
