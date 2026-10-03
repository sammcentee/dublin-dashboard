import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
const solar = code.slice(code.indexOf('function sunDay('), code.indexOf('async function daylight('));
const context = vm.createContext({ Date, Math });
vm.runInContext(solar + ';globalThis.calculate = sunDay;', context);

// Regression times rounded to the minute for Dublin, checked against the
// upstream SunCalc algorithm and an independent reference before publication.
const clocks = date => {
  const events = context.calculate(date);
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return Object.fromEntries(Object.entries(events).filter(([key]) => key !== 'date').map(([key, value]) => [key, format.format(new Date(value))]));
};
assert.equal(clocks('2026-10-24').civil_twilight_begin, '07:32');
assert.equal(clocks('2026-10-25').civil_twilight_begin, '06:34', 'Dublin clock change is respected');
assert.equal(clocks('2026-06-21').sunrise, '04:56');
assert.equal(clocks('2026-12-21').sunset, '16:08');

for (let day = 0; day < 365; day++) {
  const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
  const events = context.calculate(date);
  const ordered = ['civil_twilight_begin', 'sunrise', 'solar_noon', 'sunset', 'civil_twilight_end'];
  for (let i = 0; i < ordered.length; i++) {
    const current = new Date(events[ordered[i]]);
    assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(current), date, 'every event belongs to its Dublin date');
    if (i) assert.ok(current > new Date(events[ordered[i - 1]]), 'daily events stay in chronological order');
  }
}
console.log('PASS: Dublin solar dates and event ordering for 2026, clock changes and solstices.');
