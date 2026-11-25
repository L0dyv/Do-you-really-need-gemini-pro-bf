import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  BF_DEAL_PRESETS,
  DEFAULT_STATE,
  buildMonthPlan,
  buildPlanPair,
  makeSubItem,
} = require('../js/data.js');
const {
  calculateLedger,
  convertToCny,
  getCnyPerUnit,
  getMonthlyProCny,
  getTryRateAtOffset,
} = require('../js/calculator.js');
const {
  buildSummarySvg,
  buildStandaloneHtml,
} = require('../js/exporter.js');
const i18n = require('../js/i18n.js');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('TRY depreciation curve and multi-currency conversion work accurately', () => {
  const r0 = getTryRateAtOffset(0, 24);
  const r12 = getTryRateAtOffset(12, 24);
  assert.ok(Math.abs(r0 - 7.55) < 0.01);
  assert.ok(Math.abs(r12 - 7.55 * 1.24) < 0.02);

  assert.ok(Math.abs(convertToCny(14500, 'JPY', 0, 22) - 609) < 1.5);
  assert.ok(Math.abs(convertToCny(20, 'USD', 0, 22) - 133.4) < 0.2);
  assert.ok(Math.abs(convertToCny(999.99, 'TRY', 0, 22) - 132.45) < 0.2);
  assert.ok(convertToCny(999.99, 'TRY', 12, 22) < convertToCny(999.99, 'TRY', 0, 22));
});

test('Turkey monthly Pro depreciates in CNY without mid-year hike', () => {
  const s = Object.assign(clone(DEFAULT_STATE), {
    monthlyProRegion: 'tr',
    tryAnnualDepRate: 22,
    googleMidYearHike: false,
  });
  const decPrice = getMonthlyProCny(0, s);
  const julPrice = getMonthlyProCny(7, s);
  assert.ok(decPrice > 110 && decPrice < 116);
  assert.ok(julPrice < decPrice);
  assert.ok(julPrice > 95 && julPrice < 105);
});

test('Per-subscription TRY midYearHike resets June TRY item back to initial CNY anchor without affecting other items', () => {
  const s = clone(DEFAULT_STATE);
  s.monthPlans[6] = [makeSubItem('gpt_plus_tr', 1, { midYearHike: true })];
  s.buyMonthPlans[6] = [];
  s.buyMonthSynced[6] = false;
  s.monthPlans[7] = [makeSubItem('gpt_plus_tr', 1, { midYearHike: false })];
  s.buyMonthPlans[7] = [];
  s.buyMonthSynced[7] = false;
  const res = calculateLedger(s);
  const expectedBase = 999.99 / 7.55;
  assert.ok(Math.abs(res.monthlyRows[6].monthSavedByBf - expectedBase) < 0.2);
  assert.ok(res.monthlyRows[7].monthSavedByBf < expectedBase - 10);
});

test('Default 477 CNY Turkey Black Friday dual-basket baseline matches Step 2 single source of truth', () => {
  const res = calculateLedger(clone(DEFAULT_STATE));
  assert.equal(res.ultraOverlapMonths, 4);
  assert.equal(res.proCoveredMonths, 8);
  assert.equal(res.hasLegacyTurkeyUltra, true);
  assert.ok(res.breakEvenMonths > 4.2 && res.breakEvenMonths < 5.2);
  assert.ok(res.upsideNet > 250 && res.upsideNet < 400);
  // SOTA cutoff is 7 months: months 0..3 unchanged (Ultra both sides), months 4..6 save ~3 months of TR Pro
  assert.ok(res.downsideNet > -220 && res.downsideNet < -120);
  // Baseline scenario row must strictly equal upsideNet and totalSkipCost - totalBuyCost
  const baselineScen = res.scenarios.find((sc) => sc.isBaseline);
  assert.ok(baselineScen);
  assert.ok(Math.abs(baselineScen.diff - res.upsideNet) < 0.01);
  assert.ok(Math.abs((res.totalSkipCost - res.totalBuyCost) - res.upsideNet) < 0.01);
  assert.ok(res.expectedNetSavings > 0);
  assert.equal(res.verdict.level, 'buy');
});

test('Dual-basket supports multi-subscription stacking (GPT Pro + Devin) and tier downgrade (Ultra 20x -> Ultra 5x)', () => {
  const s = clone(DEFAULT_STATE);
  const empty = buildPlanPair('empty');
  s.monthPlans = empty.monthPlans;
  s.buyMonthPlans = empty.buyMonthPlans;
  s.buyMonthSynced = empty.buyMonthSynced;
  s.fxAnnualChangePct = { TRY: 0, JPY: 0, HKD: 0, TWD: 0, USD: 0 };

  // Month 0: Plan A has ChatGPT Pro 100 ($100) + Devin Pro ($20); Plan B keeps only Devin Pro ($20)
  s.monthPlans[0] = [makeSubItem('idle_gpt_pro100_us', 1), makeSubItem('devin_pro_us', 1)];
  s.buyMonthPlans[0] = [makeSubItem('devin_pro_us', 1)];
  s.buyMonthSynced[0] = false;

  // Month 1: Plan A has Ultra 20x US ($199.99); Plan B downgrades to Ultra 5x US ($99.99)
  s.monthPlans[1] = [makeSubItem('idle_ultra_20x_us', 1)];
  s.buyMonthPlans[1] = [makeSubItem('idle_ultra_us', 1)];
  s.buyMonthSynced[1] = false;

  // Month 2: Plan A has Devin Pro ($20), Plan B is explicitly cleared [] (buyMonthSynced=false must NOT revert to synced!)
  s.monthPlans[2] = [makeSubItem('devin_pro_us', 1)];
  s.buyMonthPlans[2] = [];
  s.buyMonthSynced[2] = false;

  const res = calculateLedger(s);
  const usd = 6.67;
  assert.ok(Math.abs(res.monthlyRows[0].monthSavedByBf - 100 * usd) < 0.2);
  assert.ok(Math.abs(res.monthlyRows[1].monthSavedByBf - 100 * usd) < 0.2);
  assert.ok(Math.abs(res.monthlyRows[2].monthSavedByBf - 20 * usd) < 0.2);
  assert.equal(res.proCoveredMonths, 3);
  assert.equal(res.crossoverMonthIndex, 0);
});

test('Dual-basket supports multi-seat subscriptions (2x Gemini Pro) and 1 BF seat offsets only 1 seat', () => {
  const s = Object.assign(clone(DEFAULT_STATE), buildPlanPair('empty'), {
    fxAnnualChangePct: { TRY: 0, JPY: 0, HKD: 0, TWD: 0, USD: 0 },
  });
  // Plan A has 2x Gemini Pro US ($19.99 * 2); Plan B offsets only 1 seat -> 1x Gemini Pro US remains
  s.monthPlans[0] = [makeSubItem('gemini_pro_us', 2)];
  const derived = require('../js/data.js').deriveDefaultBuyPlans(s.monthPlans);
  s.buyMonthPlans = derived.buyMonthPlans;
  s.buyMonthSynced = derived.buyMonthSynced;

  assert.equal(s.buyMonthPlans[0].length, 1);
  assert.equal(s.buyMonthPlans[0][0].qty, 1);

  const res = calculateLedger(s);
  const oneProCny = 19.99 * 6.67;
  assert.ok(Math.abs(res.monthlyRows[0].skipMonthFlow - oneProCny * 2) < 0.2);
  assert.ok(Math.abs(res.monthlyRows[0].buyMonthFlow - oneProCny) < 0.2);
  assert.ok(Math.abs(res.monthlyRows[0].monthSavedByBf - oneProCny) < 0.2);
});

test('Moving effectiveSotaMonths (K) changes downsideNet (D) and EV, and EV endpoints p=0/100 match D/U', () => {
  const sShort = Object.assign(clone(DEFAULT_STATE), { effectiveSotaMonths: 4, retainProbPct: 60 });
  const sLong = Object.assign(clone(DEFAULT_STATE), { effectiveSotaMonths: 9, retainProbPct: 60 });
  const rShort = calculateLedger(sShort);
  const rLong = calculateLedger(sLong);

  assert.ok(rLong.downsideNet > rShort.downsideNet, 'Longer SOTA span must improve downsideNet');
  assert.ok(rLong.expectedNetSavings > rShort.expectedNetSavings, 'Longer SOTA span must improve EV');

  const rP0 = calculateLedger(Object.assign(clone(DEFAULT_STATE), { retainProbPct: 0 }));
  const rP100 = calculateLedger(Object.assign(clone(DEFAULT_STATE), { retainProbPct: 100 }));
  assert.ok(Math.abs(rP0.expectedNetSavings - rP0.downsideNet) < 0.01);
  assert.ok(Math.abs(rP100.expectedNetSavings - rP100.upsideNet) < 0.01);

  // 3x3 sensitivity center cell must exactly equal expectedNetSavings
  const centerCell = rLong.sensitivity.rows[1].cells[1];
  assert.equal(centerCell.isCenter, true);
  assert.ok(Math.abs(centerCell.ev - rLong.expectedNetSavings) < 0.01);
});

test('Break-even probability classifies already_even, impossible, threshold, and U < D direction cleanly', () => {
  // Impossible: empty 12 months
  const empty = buildPlanPair('empty');
  const rEmpty = calculateLedger(Object.assign(clone(DEFAULT_STATE), empty));
  assert.equal(rEmpty.breakEvenProbStatus, 'deterministic');
  assert.equal(rEmpty.breakEvenProbPct, null);

  // Already even inside SOTA span: 12 months US Pro ($19.99) vs ¥477 BF
  const allUs = buildPlanPair('all_pro', 'gemini_pro_us');
  const rAlready = calculateLedger(Object.assign(clone(DEFAULT_STATE), allUs, { effectiveSotaMonths: 7 }));
  assert.equal(rAlready.breakEvenProbStatus, 'already_even');
  assert.equal(rAlready.breakEvenProbPct, 0);

  // Reverse direction (U < D): Month 0 saves $100, Month 10 spends $120 extra in B
  const sRev = Object.assign(clone(DEFAULT_STATE), buildPlanPair('empty'), {
    effectiveSotaMonths: 5,
    fxAnnualChangePct: { TRY: 0, JPY: 0, HKD: 0, TWD: 0, USD: 0 },
  });
  sRev.monthPlans[0] = [makeSubItem('idle_gpt_pro100_us', 1)];
  sRev.buyMonthPlans[0] = [];
  sRev.buyMonthSynced[0] = false;
  sRev.monthPlans[10] = [];
  sRev.buyMonthPlans[10] = [makeSubItem('idle_gpt_pro100_us', 1)];
  sRev.buyMonthSynced[10] = false;
  const rRev = calculateLedger(sRev);
  assert.ok(rRev.downsideNet > 0 && rRev.upsideNet < 0);
  assert.equal(rRev.breakEvenProbStatus, 'threshold');
  assert.equal(rRev.breakEvenProbDirection, 'lte');
});

test('All static DOM IDs referenced in app.js exist in index.html and contain zero emojis', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const data = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');

  const dynamicPrefix = 'inline-';
  const ids = [...new Set([...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))]
    .filter((id) => !id.startsWith(dynamicPrefix));
  const missing = ids.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);

  const emojiRe = /\p{Extended_Pictographic}/u;
  assert.equal(emojiRe.test(html), false, 'index.html should not contain emojis');
  assert.equal(emojiRe.test(app), false, 'app.js should not contain emojis');
  assert.equal(emojiRe.test(data), false, 'data.js should not contain emojis');
});

test('Exporter generates valid vector SVG and standalone HTML with L0dyv attribution and handles null breakEvenProbPct', () => {
  const s = clone(DEFAULT_STATE);
  const res = calculateLedger(s);
  const svg = buildSummarySvg(s, res);
  const html = buildStandaloneHtml(s, res);

  assert.ok(svg.startsWith('<?xml') && svg.includes('<svg') && svg.includes('</svg>'));
  assert.ok(svg.includes('L0dyv') && svg.includes('L0dyv/do-you-really-need-gemini-pro-bf'));
  assert.ok(html.startsWith('<!DOCTYPE html>') && html.includes('github.com/L0dyv/do-you-really-need-gemini-pro-bf'));

  // Empty plan (breakEvenProbPct === null) must export cleanly without throwing
  const sEmpty = Object.assign(clone(DEFAULT_STATE), buildPlanPair('empty'));
  const svgEmpty = buildSummarySvg(sEmpty, calculateLedger(sEmpty));
  assert.ok(svgEmpty.includes('</svg>'));

  const emojiRe = /\p{Extended_Pictographic}/u;
  assert.equal(emojiRe.test(svg), false, 'exported SVG should not contain emojis');
  assert.equal(emojiRe.test(html), false, 'exported HTML should not contain emojis');
});

test('Bidirectional FX sliders change monthly bills but never alter today upfront Black Friday cost', () => {
  const jpPair = buildPlanPair('all_pro', 'gemini_pro_jp');
  const sUp = Object.assign(clone(DEFAULT_STATE), jpPair, {
    bfPreset: 'jp_web',
    bfCurrency: 'JPY',
    bfRawAmount: 14500,
    bfCostCny: BF_DEAL_PRESETS.jp_web.cnyCost,
    fxAnnualChangePct: { TRY: -18, JPY: 15, HKD: 0, TWD: 0, USD: 0 },
  });
  const sDown = Object.assign(clone(sUp), {
    fxAnnualChangePct: { TRY: -18, JPY: -15, HKD: 0, TWD: 0, USD: 0 },
  });
  const resUp = calculateLedger(sUp);
  const resDown = calculateLedger(sDown);

  assert.equal(resUp.bfCost, resDown.bfCost, 'Upfront Black Friday cost must remain constant');
  assert.ok(resUp.monthlyRows[11].monthSavedByBf > resDown.monthlyRows[11].monthSavedByBf);
  assert.ok(getCnyPerUnit('JPY', 12, sUp) > getCnyPerUnit('JPY', 0, sUp));
  assert.ok(getCnyPerUnit('JPY', 12, sDown) < getCnyPerUnit('JPY', 0, sDown));
});

test('Dynamic FX panel reflects actual Step 2 monthly plans across both Plan A and Plan B', () => {
  const hkPair = buildPlanPair('all_pro', 'gemini_pro_hk');
  const sHk = Object.assign(clone(DEFAULT_STATE), hkPair, {
    bfPreset: 'hk_web',
    bfCurrency: 'HKD',
    bfRawAmount: 794,
    bfCostCny: BF_DEAL_PRESETS.hk_web.cnyCost,
  });
  sHk.monthPlans[10] = [makeSubItem('claude_pro_us', 1)];
  sHk.buyMonthPlans[10] = [];
  sHk.buyMonthSynced[10] = false;
  sHk.monthPlans[11] = [makeSubItem('claude_pro_us', 1)];
  sHk.buyMonthPlans[11] = [];
  sHk.buyMonthSynced[11] = false;

  const resHk = calculateLedger(sHk);
  assert.equal(resHk.hasLegacyTurkeyUltra, false);
  assert.deepEqual(
    resHk.activeFxCurrencies.map((c) => c.currency),
    ['HKD', 'USD']
  );
  assert.equal(resHk.activeFxCurrencies[0].monthsCount, 10);
  assert.equal(resHk.activeFxCurrencies[1].monthsCount, 2);
});

test('TRY mid-year hike only raises sticker price on depreciation and never discounts on appreciation', () => {
  const sApp = clone(DEFAULT_STATE);
  sApp.fxAnnualChangePct = { TRY: 10, JPY: 0, HKD: 0, TWD: 0, USD: 0 };
  sApp.monthPlans[6] = [makeSubItem('gemini_pro_tr', 1, { midYearHike: true })];
  sApp.buyMonthPlans[6] = [];
  sApp.buyMonthSynced[6] = false;
  const res = calculateLedger(sApp);
  const expectedM6 = convertToCny(870, 'TRY', 7, sApp);
  assert.ok(Math.abs(res.monthlyRows[6].monthSavedByBf - expectedM6) < 0.05);
});

test('i18n dictionaries have full zh-CN / en-US key parity, valid HTML keys, English export, and zero emojis', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const i18nSrc = fs.readFileSync(path.join(root, 'js', 'i18n.js'), 'utf8');

  const zhKeys = Object.keys(i18n.MESSAGES['zh-CN']).sort();
  const enKeys = Object.keys(i18n.MESSAGES['en-US']).sort();
  assert.deepEqual(enKeys, zhKeys, 'zh-CN and en-US must have identical keys');

  const htmlKeys = [...new Set([...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]))];
  const missingInZh = htmlKeys.filter((k) => !(k in i18n.MESSAGES['zh-CN']));
  const missingInEn = htmlKeys.filter((k) => !(k in i18n.MESSAGES['en-US']));
  assert.deepEqual(missingInZh, []);
  assert.deepEqual(missingInEn, []);

  const s = clone(DEFAULT_STATE);
  const resEn = calculateLedger(s, 'en-US');
  assert.equal(resEn.verdict.badge, 'Worth Buying');
  const svgEn = buildSummarySvg(s, resEn, 'en-US');
  assert.ok(svgEn.includes('Gemini Pro Black Friday Ledger'));

  const emojiRe = /\p{Extended_Pictographic}/u;
  assert.equal(emojiRe.test(i18nSrc), false, 'i18n.js should not contain emojis');
  assert.equal(emojiRe.test(svgEn), false, 'English SVG export should not contain emojis');
});
