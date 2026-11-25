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
      'nav.step0': '1. 选黑五',
      'nav.step1': '2. 不买黑五',
      'nav.step2': '3. 买黑五后',
      'nav.step3': '4. 模型周期',
      'nav.step4': '5. 结论',
      'nav.presets': '预设场景...',
      'nav.reset': '重置',
      'nav.prev': '上一步',
      'nav.next': '下一步',
      'nav.seeVerdict': '查看结论',
      'nav.mobilePrev': '← 上一步',
      'nav.mobileNext': '下一步 →',
      'nav.langTitle': '切换界面语言（中文 / English）',
      'nav.undo': '撤销',
      'nav.redo': '前进',
      'nav.undoTitle': '撤销 (Ctrl+Z)',
      'nav.redoTitle': '前进 / 重做 (Ctrl+Y / Ctrl+Shift+Z)',

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

      'step2.titleA': '如果不买黑五，你会怎么订？',
      'step2.hintA': '先填不买黑五时每个月原本会开的订阅（点单元格可连选叠加多个，鼠标拖动或勾选可整批同步修改）；填完点右侧 > 进入「买黑五后」方案',
      'step2b.titleB': '如果买了黑五 Pro，你还会怎么订？',
      'step2b.hintB': '每月已固定包含「黑五 Gemini Pro」（不可删改），其余订阅默认同步自上一步；在有变化的月份点 × 划掉省下的订阅，或拖动勾选批量修改',
      'step2b.dropProBtn': '一键划掉重复的 Gemini Pro',
      'step2b.syncAllBtn': '全部恢复与上一步同步',
      'step2b.batchPickBtn': '批量编辑额外订阅 ▾',
      'step2b.batchClearBtn': '仅用黑五（清零额外订）',
      'step2b.batchSyncBtn': '恢复与上步同步',
      'step2b.thRefA': '不买黑五（参考）',
      'step2b.thBuy': '买黑五后 · 固定含黑五 Pro + 额外订阅（支持拖动多选）',
      'step2b.thDiff': '额外支出 / 对比省下',
      'step2b.lockedBfPill': '黑五 Gemini Pro · 已含',
      'step2b.lockedBfTip': '已购 12 个月黑五包年，每月固定包含且不可移除',
      'step2b.batchAll': '批量编辑方案 B：全年 12 个月',
      'step2b.batchN': '批量编辑方案 B：已选 {n} 个月',
      'step2b.clearedN': '已将 {n} 个月设为仅用黑五 Pro（清零额外订阅）',
      'step2b.syncedAll': '已将全部 12 个月恢复与「不买黑五」同步',
      'step2b.syncedN': '已将 {n} 个月恢复与「不买黑五」同步',
      'step2b.footLabel': '双方案对照',
      'step2b.footPlanA': '不买黑五总计 <strong class="mono">{totalA}</strong> · 买黑五含预付 <strong class="mono">{totalB}</strong>（预付 {bf} + 额外 {extraB}）',
      'step2.title': '不买黑五 vs 买黑五：12 个月对照',
      'step2.modeSkip': '1. 填原方案（不买黑五）',
      'step2.modeBuy': '2. 对比：买黑五 Pro',
      'step2.phaseSettings': '模型周期设置',
      'step2.phaseMeta': 'SOTA {sota}月 / 留存 {prob}%',
      'step2.tplPlaceholder': '整年模板...',
      'step2.tplRegionPro': '按当前地区填充全年 12 月 Pro',
      'step2.tplDefault': '12-3月土区旧价 Ultra / 4-11月月付 Pro',
      'step2.tplOffseason': '1-3月 Ultra / 4-8月 Pro / 9-11月不买',
      'step2.tplReplaceGpt': '12-3月 Ultra / 4-11月 ChatGPT Plus',
      'step2.tplEmpty': '清空全年（全部不买）',
      'step2.hintSkip': '先填「方案 A：不买黑五，你会订什么？」（点击单元格可连选叠加多个订阅，拖动或勾选可整批同步修改）；填完切到「2. 对比：买黑五 Pro」',
      'step2.hintBuy': '方案 B 默认随左侧 A 同步，无需重填；只在有变化的月份点 × 删掉省下的订阅，或点击单元格改档/加选，直接对比两套总价',
      'step2.selectedAll': '已选全年 12 月',
      'step2.selectedN': '已选 {n} 个月',
      'step2.batchPickBtn': '批量编辑订阅 ▾',
      'step2.batchClearBtn': '设为本月不买',
      'step2.thMonth': '月份与模型阶段',
      'step2.thTunePhase': '调周期',
      'step2.thSkip': '不买黑五，你会订什么？（可叠加）',
      'step2.thBuy': '买黑五后，还会另外订什么？',
      'step2.thDropPro': '划掉 Pro',
      'step2.thDropProTip': '一键从方案 B 移除所有 Gemini Pro 月付',
      'step2.thSaveDiff': '本月差额',
      'step2.thSaveOrig': '方案 A 月费',
      'step2.pickPlaceholder': '点击添加订阅',
      'step2.addAnotherTitle': '同月叠加另一个订阅',
      'step2.removeItemTitle': '移除此项订阅',
      'step2.hikeTag': '6月追调',
      'step2.bfNoExtra': '不再额外订',
      'step2.bfSyncBack': '同步 A',
      'step2.bfSyncBackTip': '恢复与左侧方案 A 自动同步',
      'step2.bfSyncedTag': '同左侧',
      'step2.bfClearExtraTip': '清空该月额外订阅（只用黑五 Pro）',
      'step2.bfWaitBaseline': '同左侧（无额外订）',
      'step2.saveMonth': '省 {yen}',
      'step2.extraSpend': '多花 {yen}',
      'step2.sameZero': '无变化 · ¥0',
      'step2.emptyZero': '未填 · ¥0',
      'step2.footTitle': '全年总价',
      'step2.footSkip': '方案 A 全年总计 <strong class="mono">{totalA}</strong>（已填 {filled} 月）',
      'step2.footBuy': '黑五预付 <strong class="mono">{bf}</strong> + 额外 <strong class="mono">{extraB}</strong> = <strong class="mono">{totalB}</strong>',
      'step2.footDiffSave': '净省 {yen}',
      'step2.footDiffLoss': '多花 {yen}',
      'step2.footRight': '第 4 步汇总计价',
      'step2.phaseTooltip': '点击调整模型周期',

      'picker.singleTarget': '{month} · 方案 A（可多选叠加）',
      'picker.buySingleTarget': '{month} · 方案 B（买黑五后额外订）',
      'picker.batchAll': '批量编辑：全年 12 个月（可多选叠加）',
      'picker.batchN': '批量编辑：已选 {n} 个月（可多选叠加）',
      'picker.selectedInCell': '已选订阅（点击调地区/改价，× 移除）：',
      'picker.done': '完成',
      'picker.regionHint': '切换「{name}」地区与计价：',
      'picker.hikeCheck': '6月追调',
      'picker.updatePrice': '更新价格',
      'picker.regionsCount': '{n} 个地区',
      'picker.customToggle': '+ 自定义订阅名称与月费',
      'picker.customNamePh': '输入订阅名称（如 Cursor Pro / Devin）',
      'picker.customPricePh': '原币月费',
      'picker.apply': '应用',

      'modal.kicker': 'MODEL LIFECYCLE · CENTER PEEK',
      'modal.close': '关闭 ×',
      'modal.title': '设定模型周期与留存把握',
      'modal.lead': '参考历史实证：Gemini 2.5 Pro（2025.03.25）一直撑到 Claude Opus 4.5（2025.11.24）上线，实战约 8 个月；3.1 Pro 到 Gemini 4 间隔约 9 个月。',
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
      'modal.retainKey': '主力期后留存把握 (p)',
      'modal.retainHelpDyn': '指过了前 {k} 个月主力期（截至 {until}）后，你有多大把握继续按表格用满全年（权重 p），而不是中途停用黑五（权重 1−p）。',
      'modal.evTitle': '主观留存把握 vs 数学盈亏平衡线',
      'modal.evLine': '盈亏线 {pct}%',
      'modal.evAbove': '高于盈亏线 +{gap} pp',
      'modal.evBelow': '低于盈亏线 {gap} pp',
      'modal.evAlready': '主力期内已锁定回本',
      'modal.evImpossible': '全年完整执行仍未回本',
      'modal.evDetPos': '两端结果相同（已回本）',
      'modal.evDetNeg': '两端结果相同（未回本）',
      'modal.evLeft': '0%（主力期止即停用）',
      'modal.evRight': '100%（按计划用满全年）',
      'modal.doneBtn': '完成并返回表格',

      'step3.title': '核对汇率走势与模型周期',
      'step3.lead': '今日黑五包年按当前即期汇率一次性锁定；下方确认未来 12 个月外币月付汇率，以及模型 SOTA 主力期与留存把握。',
      'step3.fxSec': '未来 12 个月外币汇率走势（仅作用于第 2、3 步中的外币月付）',
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
      'step3.spotTitle': '计价口径说明',
      'step3.spotNote': '今日黑五包年按 t = 0 即期汇率一次性付清，不受后续汇率波动影响；未来各月按月付费的外币订阅按 FX(t) = FX(0) × (1 + r)^(t/12) 折算为名义人民币。所有订阅增删与方案切换均以第 2 步表格为唯一数据源。',

      'step4.readyHint': '全部参数已就绪，点击右侧按钮生成你的 12 个月决策备忘录',
      'step4.calcBtn': '选好了，开始测算 →',
      'step4.calcTitle': '正在核对 12 个月账本',
      'step4.replayUpfront': '今日预付 · 黑五包年',
      'step4.replaySave': '替省 {yen}',
      'step4.replayIdle': '闲置 ¥0',
      'step4.replayCum': '累计 {yen}',
      'step4.replayWeight': '留存加权 · 下行 D({wD}%) / 上行 U({wU}%)',
      'step4.replayDone': '核对完成 · 12 个月期望净节省 {ev}',
      'step4.memoTitle': '黑五订阅决策',
      'step4.heroEvLabel': '12 个月期望净节省 (EV) · CNY',
      'step4.evRateText': '期望净节省率 {rate}（相对今日预付 {bf}）',
      'step4.condProbLabel': '留存把握',
      'step4.condProbAbove': '盈亏线 {line}%，高于 +{gap} pp',
      'step4.condProbBelow': '盈亏线 {line}%，低于 {gap} pp',
      'step4.condProbLocked': '主力期内已锁定回本（盈亏线 0%）',
      'step4.condProbImpossible': '全年完整执行仍未回本',
      'step4.condProbDet': '主力期后无新增替代月',
      'step4.condCrossLabel': '累计回本',
      'step4.condCrossNone': '12 个月内未回本',
      'step4.condCrossSub': '折合回本用量 {n} 个月 · 月均平替 ¥{avg}',
      'step4.condCrossSubInf': '当前表格未设置黑五替代月',
      'step4.stripUpfront': '今日预付 {bf}',
      'step4.stripMonthly': '年费月均 ¥{avg}/月',
      'step4.stripIdleZero': '闲置 0 月（全年生效）',
      'step4.stripIdle': '闲置 {n} 月 · 摊销 {cost}',
      'step4.idleDetailsSummary': '展开查看 {n} 个黑五闲置月份明细',
      'step4.idleDetailUltra': '在 {months} 这 {n} 个月里，保留原订阅（{plans}）使黑五 Pro 处于闲置状态（约占年费 {pct}%，摊销 {cost}）；其余 {pro} 个月由黑五替代省月费。',
      'step4.idleDetailNone': '当前有 {n} 个未填月份使黑五 Pro 闲置（约占年费 {pct}%，摊销 {cost}）。',
      'step4.legacyUltraNote': '提示：账本中含土区旧价 Ultra，当前默认其在对应月份可正常续费；如需测算中途断续或换用其他方案的影响，可直接返回第 2 步修改对应月份。',
      'step4.payoffTitle': '两端结果与留存权重',
      'step4.payoffRatio': '盈亏比 {ratio}×',
      'step4.payoffDownLabel': '第 {k} 月止停用 (D)',
      'step4.payoffUpLabel': '完整执行全年 (U)',
      'step4.payoffWeight': '权重 {w}%',
      'step4.chartTitle': '12 个月累积边际支出对比',
      'step4.chartNote': '实线：买黑五 Pro（含今日预付）· 虚线：不买黑五按原方案月付',
      'step4.chartToday': '今日',
      'step4.chartBuy': '买:{yen}',
      'step4.chartSkip': '不买:{yen}',
      'step4.chartBreakeven': '{m}回本',
      'step4.chartNextGen': '预期下代 Gemini SOTA ({m})',
      'step4.scenTitle': '四种情景对照',
      'step4.scenNote': '单位：CNY · 买入支出含今日预付',
      'step4.scenColTitle': '情景',
      'step4.scenColBuy': '买入支出 (CNY)',
      'step4.scenColSkip': '月付支出 (CNY)',
      'step4.scenColDiff': '净节省 (CNY)',
      'step4.scenFootnote': '净节省 = 月付支出 − 买入支出。金额为各行所示期间的名义人民币支出，买入支出含今日预付。',
      'step4.compareTitle': '12 个月双方案逐月对照',
      'step4.compareNote': '方案 A（不买黑五）vs 方案 B（含黑五 Pro）',
      'step4.cmpMonth': '月份',
      'step4.cmpPlanA': '不买黑五 (A)',
      'step4.cmpPlanB': '买黑五后 (B)',
      'step4.cmpDiff': '当月差额',
      'step4.cmpCum': '累计净省',
      'step4.notesTitle': '汇率口径、敏感性验证与实证参考',
      'step4.toggleFxBasis': '汇率计价口径（已按即期汇率与历史趋势自动代入，展开可微调）',
      'step4.toggleFxBasisActive': '汇率计价口径（已自动代入：{fx} · 展开可微调）',
      'step4.toggleSensitivity': '3 × 3 敏感性矩阵（留存把握 ±10pp × 汇率 ±5pp）',
      'step4.sensNoFx': '当前第 2 步未涉及外币月付，结论仅随主力期后留存把握 (p) 线性变化。',
      'step4.sensCorner': '{cur} 年化 \\ 留存 p',
      'step4.sensNote': '单元格为对应假设下的 12 个月期望净节省 (EV, CNY)；描边格为当前基准假设。',
      'step4.toggleNotes': '多区账号与附带权益注意事项',
      'step4.note1Title': '独立 Apple ID 隔离',
      'step4.note1Body': 'iOS / iPadOS 内购按 Apple ID 一对一绑定 Google One 订阅链，不可与已有 Ultra 主号共用同一个 Apple ID。',
      'step4.note2Title': '下单前仅登录目标 Google 账号',
      'step4.note2Body': '防止内购凭证误绑到其他 Google 账号；走苹果内购不会改变 Google 账号归属地。',
      'step4.note3Title': '关闭自动续费',
      'step4.note3Body': '首年促销价到期后会自动按原价续订，下单后建议立即在系统订阅管理中关闭自动续费。',
      'step4.note4Title': '附带权益口径',
      'step4.note4Body': 'Pro 附带的 YouTube Premium Lite 不含 YT Music（听歌插广告且手机无法息屏）；Colab CU 流动性较低，未计入现金流折抵。',
      'step4.toggleTimeline': '历史模型周期率参考（2.5 Pro → 3.1 Pro → Gemini 4）',
      'step4.tlTime': '时间',
      'step4.tlModel': '模型节点',
      'step4.tlSpan': '实战周期',
      'step4.tlNote': '说明',
      'step4.toggleFx': '土耳其里拉近三年汇率与 2027 推算',
      'step4.fxPeriod': '时间节点',
      'step4.fxRate': '1元换里拉',
      'step4.fxYoy': '同比',
      'step4.fxPro': '土区 Pro',
      'step4.fxUltra': 'Ultra 新价',
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
      'toast.alreadyAdded': '该月已包含此订阅，可点击胶囊直接调整价格',
      'toast.droppedPro': '已从方案 B 一键划掉 {n} 个月的 Gemini Pro',
      'toast.droppedProNone': '方案 B 中当前没有待划掉的 Gemini Pro',
      'toast.syncedBack': '已恢复与方案 A 自动同步',
      'toast.undone': '已撤销上一步操作',
      'toast.redone': '已重做操作',
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
      'brand.name': 'Gemini BF Ledger',
      'nav.step0': '1. Deal',
      'nav.step1': '2. Without BF',
      'nav.step2': '3. With BF',
      'nav.step3': '4. Cycle',
      'nav.step4': '5. Memo',
      'nav.presets': 'Presets...',
      'nav.reset': 'Reset',
      'nav.prev': 'Back',
      'nav.next': 'Next',
      'nav.seeVerdict': 'See Verdict',
      'nav.mobilePrev': '← Back',
      'nav.mobileNext': 'Next →',
      'nav.langTitle': 'Switch language (中文 / English)',
      'nav.undo': 'Undo',
      'nav.redo': 'Redo',
      'nav.undoTitle': 'Undo (Ctrl+Z)',
      'nav.redoTitle': 'Redo (Ctrl+Y / Ctrl+Shift+Z)',

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

      'step2.titleA': 'Without Black Friday, what will you buy?',
      'step2.hintA': 'Fill what you would subscribe to without BF (click a cell to multi-select plans, drag or check rows to batch-edit together), then click > for the With-BF plan',
      'step2b.titleB': 'With Black Friday Pro, what else will you buy?',
      'step2b.hintB': 'Every month permanently includes locked "BF Gemini Pro"; extra subs auto-sync from Step 2 — click × to drop saved plans, or drag-select rows to batch-edit',
      'step2b.dropProBtn': 'Drop Duplicate Gemini Pro',
      'step2b.syncAllBtn': 'Sync All with Step 2',
      'step2b.batchPickBtn': 'Batch Edit Extra Subs ▾',
      'step2b.batchClearBtn': 'BF Pro Only (Clear Extra)',
      'step2b.batchSyncBtn': 'Sync with Step 2',
      'step2b.thRefA': 'Without BF (Ref)',
      'step2b.thBuy': 'With BF · Locked BF Pro + Extra Subs (Drag Multi-Select)',
      'step2b.thDiff': 'Extra / Saved vs A',
      'step2b.lockedBfPill': 'BF Gemini Pro · Included',
      'step2b.lockedBfTip': 'Prepaid 12-month Black Friday Pro is fixed in every month',
      'step2b.batchAll': 'Batch Edit Plan B: All 12 Months',
      'step2b.batchN': 'Batch Edit Plan B: {n} Months',
      'step2b.clearedN': 'Set {n} months to BF Pro only (cleared extra subs)',
      'step2b.syncedAll': 'Synced all 12 months with Without-BF plan',
      'step2b.syncedN': 'Synced {n} months with Without-BF plan',
      'step2b.footLabel': 'Comparison',
      'step2b.footPlanA': 'Without BF <strong class="mono">{totalA}</strong> · With BF <strong class="mono">{totalB}</strong> (Upfront {bf} + Extra {extraB})',
      'step2.title': 'Skip vs Buy Black Friday: 12-Month Comparison',
      'step2.modeSkip': '1. Baseline Plan (No BF)',
      'step2.modeBuy': '2. Compare: With BF Pro',
      'step2.phaseSettings': 'Model Cycle',
      'step2.phaseMeta': 'SOTA {sota}m · Retain {prob}%',
      'step2.tplPlaceholder': 'Templates...',
      'step2.tplRegionPro': 'Fill all 12 months with selected region Pro',
      'step2.tplDefault': 'Dec–Mar Legacy TR Ultra / Apr–Nov Monthly Pro',
      'step2.tplOffseason': 'Jan–Mar Ultra / Apr–Aug Pro / Sep–Nov Off',
      'step2.tplReplaceGpt': 'Dec–Mar Ultra / Apr–Nov ChatGPT Plus',
      'step2.tplEmpty': 'Clear all 12 months',
      'step2.hintSkip': 'Fill Plan A ("What would you subscribe to without BF?"). Click any cell to multi-select plans, drag or check rows to batch-edit together, then open "2. Compare: With BF Pro"',
      'step2.hintBuy': 'Plan B mirrors Plan A automatically — only edit months that change (click × to drop a saved plan, or click a cell to swap/add) and compare total spend',
      'step2.selectedAll': 'All 12 months selected',
      'step2.selectedN': '{n} months selected',
      'step2.batchPickBtn': 'Batch Edit Plans ▾',
      'step2.batchClearBtn': 'Set to None',
      'step2.thMonth': 'Month & Model Phase',
      'step2.thTunePhase': 'Tune',
      'step2.thSkip': 'Without BF, what will you buy? (Stackable)',
      'step2.thBuy': 'With BF, what else will you buy?',
      'step2.thDropPro': 'Drop Pro',
      'step2.thDropProTip': 'Remove all monthly Gemini Pro from Plan B in one click',
      'step2.thSaveDiff': 'Monthly Diff',
      'step2.thSaveOrig': 'Plan A Cost',
      'step2.pickPlaceholder': 'Add subscription',
      'step2.addAnotherTitle': 'Stack another subscription in this month',
      'step2.removeItemTitle': 'Remove this subscription',
      'step2.hikeTag': 'Jun Rebase',
      'step2.bfNoExtra': 'No extra sub',
      'step2.bfSyncBack': 'Sync A',
      'step2.bfSyncBackTip': 'Restore auto-sync with Plan A',
      'step2.bfSyncedTag': 'Same as A',
      'step2.bfClearExtraTip': 'Clear extra subscriptions for this month (BF Pro only)',
      'step2.bfWaitBaseline': 'Same as A (none)',
      'step2.saveMonth': 'Save {yen}',
      'step2.extraSpend': '+{yen} extra',
      'step2.sameZero': 'No diff · ¥0',
      'step2.emptyZero': 'Empty · ¥0',
      'step2.footTitle': 'Annual Total',
      'step2.footSkip': 'Plan A Total <strong class="mono">{totalA}</strong> ({filled}m filled)',
      'step2.footBuy': 'BF Upfront <strong class="mono">{bf}</strong> + Extra <strong class="mono">{extraB}</strong> = <strong class="mono">{totalB}</strong>',
      'step2.footDiffSave': 'Save {yen}',
      'step2.footDiffLoss': '+{yen} cost',
      'step2.footRight': 'Tallied in Step 4',
      'step2.phaseTooltip': 'Click to tune model cycle',

      'picker.singleTarget': '{month} · Plan A (Multi-select)',
      'picker.buySingleTarget': '{month} · Plan B (Extra with BF)',
      'picker.batchAll': 'Batch Edit: All 12 Months (Multi-select)',
      'picker.batchN': 'Batch Edit: {n} Months (Multi-select)',
      'picker.selectedInCell': 'Selected (click to tune region/price, × to remove):',
      'picker.done': 'Done',
      'picker.regionHint': 'Select region & pricing for {name}:',
      'picker.hikeCheck': 'Jun FX rebase',
      'picker.updatePrice': 'Update',
      'picker.regionsCount': '{n} regions',
      'picker.customToggle': '+ Custom Subscription Name & Price',
      'picker.customNamePh': 'Plan name (e.g. Cursor Pro / Devin)',
      'picker.customPricePh': 'Monthly fee',
      'picker.apply': 'Apply',

      'modal.kicker': 'MODEL LIFECYCLE · CENTER PEEK',
      'modal.close': 'Close ×',
      'modal.title': 'Model Lifecycle & Retention Confidence',
      'modal.lead': 'Historical benchmark: Gemini 2.5 Pro (Mar 25, 2025) held up ~8 months until Claude Opus 4.5 (Nov 24, 2025); 3.1 Pro to Gemini 4 took ~9 months.',
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
      'modal.retainKey': 'Post-SOTA Retention Prob (p)',
      'modal.retainHelpDyn': 'Your confidence (0–100%) that after the first {k} SOTA months (through {until}) you will execute the full plan (weight p) rather than dropping BF Pro (weight 1−p).',
      'modal.evTitle': 'Your Retention Confidence vs Break-Even Line',
      'modal.evLine': 'Break-even {pct}%',
      'modal.evAbove': 'Above break-even +{gap} pp',
      'modal.evBelow': 'Below break-even {gap} pp',
      'modal.evAlready': 'Already breaks even within SOTA span',
      'modal.evImpossible': 'Full-year execution still net negative',
      'modal.evDetPos': 'Identical endpoints (net positive)',
      'modal.evDetNeg': 'Identical endpoints (net negative)',
      'modal.evLeft': '0% (Drop after SOTA)',
      'modal.evRight': '100% (Full year)',
      'modal.doneBtn': 'Done & Return to Table',

      'step3.title': 'FX Outlook & Model Lifecycle',
      'step3.lead': 'Your upfront Black Friday cost is locked at spot FX. Confirm your 12-month FX outlook, SOTA span, and post-SOTA retention confidence below.',
      'step3.fxSec': '12-Month FX Outlook (Applies to Foreign Monthly Charges in Steps 2 & 3)',
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
      'step3.spotTitle': 'Valuation Basis',
      'step3.spotNote': 'Today Black Friday deal is paid once at spot FX (t = 0) and is immune to future FX moves. Monthly foreign subscriptions follow FX(t) = FX(0) × (1 + r)^(t/12) in nominal CNY. Step 2 is the single source of truth for all plan changes.',

      'step4.readyHint': 'All inputs are ready — generate your 12-month financial decision memo',
      'step4.calcBtn': 'Done, Calculate Now →',
      'step4.calcTitle': 'Auditing 12-Month Ledger',
      'step4.replayUpfront': 'Today Upfront · BF Annual',
      'step4.replaySave': 'Save {yen}',
      'step4.replayIdle': 'Idle ¥0',
      'step4.replayCum': 'Cum {yen}',
      'step4.replayWeight': 'EV Weighting · Downside D({wD}%) / Upside U({wU}%)',
      'step4.replayDone': 'Audit Complete · 12-Mo Expected Net Savings {ev}',
      'step4.memoTitle': 'Black Friday Decision Memo',
      'step4.heroEvLabel': '12-Month Expected Net Savings (EV) · CNY',
      'step4.evRateText': 'Expected Net Savings Rate {rate} (on {bf} upfront)',
      'step4.condProbLabel': 'Retention Confidence',
      'step4.condProbAbove': 'Break-even {line}%, +{gap} pp margin',
      'step4.condProbBelow': 'Break-even {line}%, {gap} pp short',
      'step4.condProbLocked': 'Locked even inside SOTA span (0% line)',
      'step4.condProbImpossible': 'Full plan stays net negative',
      'step4.condProbDet': 'No post-SOTA replacement months',
      'step4.condCrossLabel': 'Cumulative Payback',
      'step4.condCrossNone': 'Not within 12 months',
      'step4.condCrossSub': 'Equiv. {n} mo usage · avg ¥{avg}/mo',
      'step4.condCrossSubInf': 'No BF replacement months configured',
      'step4.stripUpfront': 'Upfront {bf}',
      'step4.stripMonthly': 'Avg ¥{avg}/mo',
      'step4.stripIdleZero': '0 idle months (active all year)',
      'step4.stripIdle': '{n} idle mo · {cost} amortized',
      'step4.idleDetailsSummary': 'Inspect {n} Black Friday idle months',
      'step4.idleDetailUltra': 'During {months} ({n} mo), keeping baseline ({plans}) leaves BF Pro idle (~{pct}% of annual fee, {cost} amortized); the other {pro} months replace monthly fees.',
      'step4.idleDetailNone': '{n} empty months leave BF Pro idle (~{pct}% of annual fee, {cost} amortized).',
      'step4.legacyUltraNote': 'Note: Legacy Turkey Ultra is scheduled in Step 2 and assumed renewable in those months. Edit any month in Step 2 directly to model a mid-year cancellation or switch.',
      'step4.payoffTitle': 'Payoff Endpoints & Retention Weights',
      'step4.payoffRatio': 'Payoff Ratio {ratio}×',
      'step4.payoffDownLabel': 'Drop after Mo {k} (D)',
      'step4.payoffUpLabel': 'Full-Year Plan (U)',
      'step4.payoffWeight': 'Weight {w}%',
      'step4.chartTitle': '12-Month Cumulative Marginal Spend',
      'step4.chartNote': 'Solid: Buy BF Pro (incl. today upfront) · Dashed: Skip BF & pay monthly',
      'step4.chartToday': 'Now',
      'step4.chartBuy': 'Buy:{yen}',
      'step4.chartSkip': 'Skip:{yen}',
      'step4.chartBreakeven': 'Payback {m}',
      'step4.chartNextGen': 'Est. Next Gemini SOTA ({m})',
      'step4.scenTitle': 'Four-Scenario Comparison',
      'step4.scenNote': 'Unit: CNY · Buy includes today upfront',
      'step4.scenColTitle': 'Scenario',
      'step4.scenColBuy': 'Buy (CNY)',
      'step4.scenColSkip': 'Monthly (CNY)',
      'step4.scenColDiff': 'Net Saved (CNY)',
      'step4.scenFootnote': 'Net Saved = Monthly − Buy. Nominal CNY outflows for each shown horizon; Buy includes today upfront cost.',
      'step4.compareTitle': '12-Month Dual-Plan Comparison',
      'step4.compareNote': 'Plan A (Without BF) vs Plan B (With BF Pro)',
      'step4.cmpMonth': 'Month',
      'step4.cmpPlanA': 'Without BF (A)',
      'step4.cmpPlanB': 'With BF (B)',
      'step4.cmpDiff': 'Monthly Diff',
      'step4.cmpCum': 'Cum. Net',
      'step4.notesTitle': 'FX Basis, Sensitivity Audit & Empirical Notes',
      'step4.toggleFxBasis': 'FX Valuation Basis (Auto-applied from spot & historical trend; expand to adjust)',
      'step4.toggleFxBasisActive': 'FX Valuation Basis (Auto-applied: {fx} · expand to adjust)',
      'step4.toggleSensitivity': '3 × 3 Sensitivity Matrix (Retention ±10pp × FX ±5pp)',
      'step4.sensNoFx': 'No foreign-currency monthly bills in Step 2; EV varies linearly with post-SOTA retention confidence (p) only.',
      'step4.sensCorner': '{cur} YoY \\ Retain p',
      'step4.sensNote': 'Each cell shows 12-month Expected Net Savings (EV, CNY). Outlined cell is your current baseline.',
      'step4.toggleNotes': 'Multi-Region Account & Bundled Perks Notes',
      'step4.note1Title': 'Separate Apple ID Isolation',
      'step4.note1Body': 'iOS / iPadOS IAP binds 1-to-1 per Apple ID to a Google One subscription chain; do not share the same Apple ID with an existing Ultra account.',
      'step4.note2Title': 'Sign In Only to the Target Google Account',
      'step4.note2Body': 'Prevents the IAP receipt from attaching to the wrong Google account. Purchasing via Apple IAP does not change your Google account region.',
      'step4.note3Title': 'Disable Auto-Renew Immediately',
      'step4.note3Body': 'The Year-1 Black Friday promo renews at full list price automatically; turn off auto-renew in subscription settings right after purchase.',
      'step4.note4Title': 'Bundled Perks Valuation',
      'step4.note4Body': 'Pro bundles YouTube Premium Lite only (no ad-free YT Music or background play); Colab CU has low liquidity and is excluded from cash-flow credit.',
      'step4.toggleTimeline': 'Historical Model Lifecycle (2.5 Pro → 3.1 Pro → Gemini 4)',
      'step4.tlTime': 'Date',
      'step4.tlModel': 'Model Release',
      'step4.tlSpan': 'Usable Span',
      'step4.tlNote': 'Notes',
      'step4.toggleFx': '3-Year TRY/CNY History & 2027 Projection',
      'step4.fxPeriod': 'Period',
      'step4.fxRate': 'TRY per 1 CNY',
      'step4.fxYoy': 'YoY',
      'step4.fxPro': 'TR Pro',
      'step4.fxUltra': 'TR Ultra New',
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
      'toast.alreadyAdded': 'Already added in this month; click its pill to adjust pricing',
      'toast.droppedPro': 'Removed monthly Gemini Pro from Plan B across {n} months',
      'toast.droppedProNone': 'No monthly Gemini Pro found in Plan B',
      'toast.syncedBack': 'Restored auto-sync with Plan A',
      'toast.undone': 'Undid last change',
      'toast.redone': 'Redid change',
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
    'Cognition Devin': 'Cognition Devin',
    'Moonshot Kimi': 'Moonshot Kimi',
    '智谱 GLM (Z.ai)': 'Zhipu GLM (Z.ai)',
  };

  const REGION_EN = {
    '默认': 'Default',
    '免费配额': 'Free Seat',
    '土区': 'TR',
    '土区旧价': 'TR Legacy',
    '土区新价': 'TR New',
    '日区': 'JP',
    '港区': 'HK',
    '台区': 'TW',
    '美区': 'US',
    '国区': 'CN',
  };

  const ITEM_SHORT_EN = {
    'Ultra 5x · 土旧': 'Ultra 5x · TR Legacy',
    'Ultra 5x · 土区': 'Ultra 5x · TR',
    'Ultra 5x · 日区': 'Ultra 5x · JP',
    'Ultra 5x · 港区': 'Ultra 5x · HK',
    'Ultra 5x · 台区': 'Ultra 5x · TW',
    'Ultra 5x · 美区': 'Ultra 5x · US',
    'Ultra 20x · 土区': 'Ultra 20x · TR',
    'Ultra 20x · 日区': 'Ultra 20x · JP',
    'Ultra 20x · 港区': 'Ultra 20x · HK',
    'Ultra 20x · 台区': 'Ultra 20x · TW',
    'Ultra 20x · 美区': 'Ultra 20x · US',
    'Claude Max · 土区': 'Claude Max 5x · TR',
    'Claude Max · 日区': 'Claude Max 5x · JP',
    'Claude Max 5x · 美区': 'Claude Max 5x · US',
    'Claude Max · 美区': 'Claude Max 5x · US',
    'Claude Max 20x · 土区': 'Claude Max 20x · TR',
    'Claude Max 20x · 日区': 'Claude Max 20x · JP',
    'Claude Max 20x · 美区': 'Claude Max 20x · US',
    'Claude Max': 'Claude Max',
    'ChatGPT Pro 100 · 土区': 'ChatGPT Pro 100 · TR',
    'ChatGPT Pro 100 · 日区': 'ChatGPT Pro 100 · JP',
    'ChatGPT Pro 100 · 美区': 'ChatGPT Pro 100 · US',
    'ChatGPT Pro 200 · 土区': 'ChatGPT Pro 200 · TR',
    'ChatGPT Pro 200 · 日区': 'ChatGPT Pro 200 · JP',
    'ChatGPT Pro 200 · 美区': 'ChatGPT Pro 200 · US',
    'ChatGPT Pro 200（历史）': 'ChatGPT Pro 200 (Legacy)',
    'ChatGPT Pro 500 · 土区': 'ChatGPT Pro 500 · TR',
    'ChatGPT Pro 500 · 日区': 'ChatGPT Pro 500 · JP',
    'ChatGPT Pro 500 · 美区': 'ChatGPT Pro 500 · US',
    'Devin Pro · 美区': 'Devin Pro · US',
    'Devin Max · 美区': 'Devin Max · US',
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
    '旧价合约': 'Legacy rate',
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
