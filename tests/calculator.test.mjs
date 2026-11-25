import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_STATE } = require('../js/data.js');
const {
  calculateLedger,
  getMonthlyProCny,
  getTryRateAtOffset,
} = require('../js/calculator.js');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('TRY depreciation curve increases TRY per CNY steadily', () => {
  const r0 = getTryRateAtOffset(0, 24);
  const r12 = getTryRateAtOffset(12, 24);
  assert.ok(Math.abs(r0 - 7.55) < 0.01);
  assert.ok(Math.abs(r12 - 7.55 * 1.24) < 0.02);
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

test('Japan 608 CNY Black Friday scenario requires higher retention threshold than Turkey 477 CNY', () => {
  const trRes = calculateLedger(Object.assign(clone(DEFAULT_STATE), { bfCostCny: 477 }));
  const jpRes = calculateLedger(Object.assign(clone(DEFAULT_STATE), { bfPreset: 'jp_web', bfCostCny: 608 }));
  assert.ok(jpRes.breakEvenProbPct > trRes.breakEvenProbPct + 10);
  assert.ok(jpRes.expectedNetSavings < trRes.expectedNetSavings);
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

test('All DOM IDs referenced in app.js exist in index.html and contain zero emojis', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const data = fs.readFileSync(path.join(root, 'js', 'data.js'), 'utf8');

  const ids = [...new Set([...app.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))];
  const missing = ids.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, []);

  const emojiRe = /\p{Extended_Pictographic}/u;
  assert.equal(emojiRe.test(html), false, 'index.html should not contain emojis');
  assert.equal(emojiRe.test(app), false, 'app.js should not contain emojis');
  assert.equal(emojiRe.test(data), false, 'data.js should not contain emojis');
});

