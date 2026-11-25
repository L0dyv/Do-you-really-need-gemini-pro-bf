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

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('TRY depreciation curve and multi-currency conversion work accurately', () => {
  const r0 = getTryRateAtOffset(0, 24);
  const r12 = getTryRateAtOffset(12, 24);
  assert.ok(Math.abs(r0 - 7.55) < 0.01);
  assert.ok(Math.abs(r12 - 7.55 * 1.24) < 0.02);

  // 14,500 JPY ≈ 609 CNY, $20 USD ≈ 133.4 CNY, 999.99 TRY at month 0 ≈ 132.4 CNY
  assert.ok(Math.abs(convertToCny(14500, 'JPY', 0, 22) - 609) < 1.5);
  assert.ok(Math.abs(convertToCny(20, 'USD', 0, 22) - 133.4) < 0.2);
  assert.ok(Math.abs(convertToCny(999.99, 'TRY', 0, 22) - 132.45) < 0.2);
  // TRY depreciates over 12 months
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

test('Mid-year Google price hike resets June TRY Pro back to current CNY anchor', () => {
  const s = Object.assign(clone(DEFAULT_STATE), {
    monthlyProRegion: 'tr',
    tryAnnualDepRate: 22,
    googleMidYearHike: true,
  });
  const junePrice = getMonthlyProCny(6, s);
  const expectedBase = 870 / 7.55;
  assert.ok(Math.abs(junePrice - expectedBase) < 0.1);
});

test('Default 477 CNY Turkey Black Friday scenario has positive EV at 65% retention', () => {
  const res = calculateLedger(clone(DEFAULT_STATE));
  assert.equal(res.ultraOverlapMonths, 4);
  assert.equal(res.proCoveredMonths, 8);
  assert.ok(res.breakEvenMonths > 4.2 && res.breakEvenMonths < 5.2);
  assert.ok(res.upsideNet > 250 && res.upsideNet < 400);
  assert.equal(Math.round(res.downsideNet), -477);
  assert.ok(res.breakEvenProbPct > 52 && res.breakEvenProbPct < 65);
  assert.ok(res.expectedNetSavings > 0);
  assert.equal(res.verdict.level, 'buy');
});

test('Multi-currency Big-3 stack (3x Pro + Devin $80 + ChatGPT Plus TRY + custom USD) calculates cleanly', () => {
  const s = Object.assign(clone(DEFAULT_STATE), {
    monthPlans: buildMonthPlan('three_pro_devin'),
  });
  s.monthPlans[1].push(makeSubItem(null, 1, { id: 'custom_cursor', name: 'Cursor Pro', currency: 'USD', amount: 20 }));

  const res = calculateLedger(s);
  assert.equal(res.proCoveredMonths, 12);
  assert.equal(res.ultraOverlapMonths, 0);
  // Buy saves exactly 1x Pro in Jan
  assert.ok(Math.abs(res.monthlyRows[1].monthSavedByBf - res.monthlyRows[1].proUnit) < 0.01);
  // 3 * ($80 * 6.67) + 3 * 70 + $20 * 6.67 ≈ 1600.8 + 210 + 133.4 = 1944.2
  assert.ok(Math.abs(res.totalOtherSubsAnnual - (3 * 80 * 6.67 + 3 * 70 + 20 * 6.67)) < 0.5);
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

test('Marking a non-Gemini plan as replaceableByBf allows Black Friday Pro to offset its cost', () => {
  const s = clone(DEFAULT_STATE);
  // Replace month 4 (Apr) with ChatGPT Plus (TR 999.99 TRY) marked replaceableByBf = true
  s.monthPlans[4] = [makeSubItem('gpt_plus_tr', 1, { replaceableByBf: true })];
  // Replace month 5 (May) with ChatGPT Plus (TR 999.99 TRY) marked replaceableByBf = false
  s.monthPlans[5] = [makeSubItem('gpt_plus_tr', 1, { replaceableByBf: false })];

  const res = calculateLedger(s);
  assert.ok(res.monthlyRows[4].monthSavedByBf > 100);
  assert.equal(res.monthlyRows[4].bfReplacedTarget, 'GPT Plus·土区');
  assert.equal(res.monthlyRows[5].monthSavedByBf, 0);
});

test('All static DOM IDs referenced in app.js exist in index.html and contain zero emojis', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const data = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');

  // Dynamic inline-row IDs are rendered inside db-months-tbody on click
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
