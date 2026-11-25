import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BF_DEAL_PRESETS, DEFAULT_STATE, buildMonthPlan, makeSubItem } = require('../js/data.js');
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
  s.monthPlans[7] = [makeSubItem('gpt_plus_tr', 1, { midYearHike: false })];
  const res = calculateLedger(s);
  const expectedBase = 999.99 / 7.55;
  assert.ok(Math.abs(res.monthlyRows[6].monthSavedByBf - expectedBase) < 0.2);
  assert.ok(res.monthlyRows[7].monthSavedByBf < expectedBase - 10);
});

test('Default 477 CNY Turkey Black Friday marginal plan has clean 4 idle + 8 replaceable months', () => {
  const res = calculateLedger(clone(DEFAULT_STATE));
  assert.equal(res.ultraOverlapMonths, 4);
  assert.equal(res.proCoveredMonths, 8);
  assert.equal(res.totalOtherSubsAnnual, 0);
  assert.ok(res.breakEvenMonths > 4.2 && res.breakEvenMonths < 5.2);
  assert.ok(res.upsideNet > 250 && res.upsideNet < 400);
  assert.equal(Math.round(res.downsideNet), -477);
  assert.ok(res.expectedNetSavings > 0);
  assert.equal(res.verdict.level, 'buy');
});

test('Replacing ChatGPT Plus or Claude Pro in off-season credits exact converted currency savings', () => {
  const s = Object.assign(clone(DEFAULT_STATE), {
    monthPlans: buildMonthPlan('replace_gpt'),
  });
  // Month 4 (Apr): ChatGPT Plus TR (999.99 TRY)
  const res = calculateLedger(s);
  assert.equal(res.ultraOverlapMonths, 4);
  assert.equal(res.proCoveredMonths, 8);
  assert.ok(res.monthlyRows[4].monthSavedByBf > 110 && res.monthlyRows[4].monthSavedByBf < 130);
});

test('Double-pro fallback when Turkey Ultra fails reduces downside of Black Friday Pro', () => {
  const s = Object.assign(clone(DEFAULT_STATE), {
    ultraRenewalMode: 'immediate_fail',
    fallbackUltraStrategy: 'double_pro',
  });
  const res = calculateLedger(s);
  assert.equal(res.ultraOverlapMonths, 0);
  assert.equal(res.proCoveredMonths, 12);
  assert.ok(res.downsideNet > -100);
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

test('Exporter generates valid vector SVG and standalone HTML with L0dyv attribution and zero emojis', () => {
  const s = clone(DEFAULT_STATE);
  const res = calculateLedger(s);
  const svg = buildSummarySvg(s, res);
  const html = buildStandaloneHtml(s, res);

  assert.ok(svg.startsWith('<?xml') && svg.includes('<svg') && svg.includes('</svg>'));
  assert.ok(svg.includes('L0dyv') && svg.includes('L0dyv/do-you-really-need-gemini-pro-bf'));
  assert.ok(html.startsWith('<!DOCTYPE html>') && html.includes('github.com/L0dyv/do-you-really-need-gemini-pro-bf'));

  const emojiRe = /\p{Extended_Pictographic}/u;
  assert.equal(emojiRe.test(svg), false, 'exported SVG should not contain emojis');
  assert.equal(emojiRe.test(html), false, 'exported HTML should not contain emojis');
});

test('Bidirectional FX sliders change monthly bills but never alter today upfront Black Friday cost', () => {
  const sUp = Object.assign(clone(DEFAULT_STATE), {
    bfPreset: 'jp_web',
    bfCurrency: 'JPY',
    bfRawAmount: 14500,
    bfCostCny: BF_DEAL_PRESETS.jp_web.cnyCost,
    monthPlans: buildMonthPlan('all_pro', 'gemini_pro_jp'),
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

test('Dynamic FX panel and Legacy Ultra decoupling reflect actual Step 2 monthly plans across all 5 regions', () => {
  const sHk = Object.assign(clone(DEFAULT_STATE), {
    bfPreset: 'hk_web',
    bfCurrency: 'HKD',
    bfRawAmount: 794,
    bfCostCny: BF_DEAL_PRESETS.hk_web.cnyCost,
    monthPlans: buildMonthPlan('all_pro', 'gemini_pro_hk'),
  });
  // Mix 2 months of USD Claude Pro into HK plan
  sHk.monthPlans[10] = [makeSubItem('claude_pro_us', 1)];
  sHk.monthPlans[11] = [makeSubItem('claude_pro_us', 1)];

  const resHk = calculateLedger(sHk);
  assert.equal(resHk.needsLegacyUltraRenewal, false);
  assert.deepEqual(
    resHk.activeFxCurrencies.map((c) => c.currency),
    ['HKD', 'USD']
  );
  assert.equal(resHk.activeFxCurrencies[0].monthsCount, 10);
  assert.equal(resHk.activeFxCurrencies[1].monthsCount, 2);

  // Legacy Ultra immediate_fail -> fallback JP Ultra keeps needsLegacyUltraRenewal=true and surfaces JPY
  const sFail = Object.assign(clone(DEFAULT_STATE), {
    ultraRenewalMode: 'immediate_fail',
    fallbackUltraStrategy: 'jp_ultra',
  });
  const resFail = calculateLedger(sFail);
  assert.equal(resFail.needsLegacyUltraRenewal, true);
  assert.ok(resFail.activeFxCurrencies.some((c) => c.currency === 'JPY'));
});

test('TRY mid-year hike only raises sticker price on depreciation and never discounts on appreciation', () => {
  const sApp = clone(DEFAULT_STATE);
  sApp.fxAnnualChangePct = { TRY: 10, JPY: 0, HKD: 0, TWD: 0, USD: 0 };
  sApp.monthPlans[6] = [makeSubItem('gemini_pro_tr', 1, { midYearHike: true })];
  sApp.monthPlans[7] = [makeSubItem('gemini_pro_tr', 1, { midYearHike: false })];
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
