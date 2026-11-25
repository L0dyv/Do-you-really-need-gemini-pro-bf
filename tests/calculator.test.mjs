import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_STATE, buildMonthPlan, makeSubItem } = require('../js/data.js');
const {
  calculateLedger,
  convertToCny,
  getMonthlyProCny,
  getTryRateAtOffset,
} = require('../js/calculator.js');
const {
  buildSummarySvg,
  buildStandaloneHtml,
} = require('../js/exporter.js');

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
