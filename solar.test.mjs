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
  return Object.fromEntries(Object.entries(events).filter(([key]) => key !== 'date').map(([key, value]) => [key, value === null ? null : format.format(new Date(value))]));
};
assert.equal(clocks('2026-10-24').civil_twilight_begin, '07:32');
assert.equal(clocks('2026-10-25').civil_twilight_begin, '06:34', 'Dublin clock change is respected');
assert.equal(clocks('2026-06-21').sunrise, '04:56');
assert.equal(clocks('2026-12-21').sunset, '16:08');
// Nautical and astronomical values also agree with Skyfield and JPL DE421 to the minute.
assert.equal(clocks('2026-10-12').astronomical_twilight_begin, '05:50');
assert.equal(clocks('2026-10-12').nautical_twilight_begin, '06:30');
assert.equal(clocks('2026-10-12').astronomical_twilight_end, '20:31');
assert.equal(clocks('2026-12-21').astronomical_twilight_begin, '06:27');
assert.equal(clocks('2026-12-21').nautical_twilight_end, '17:36');
assert.equal(clocks('2026-12-21').astronomical_twilight_end, '18:19');
assert.equal(clocks('2026-06-21').nautical_twilight_begin, '02:29');
assert.equal(clocks('2026-06-21').nautical_twilight_end, '00:23', 'midsummer nautical dusk falls after midnight');
assert.equal(clocks('2026-06-21').astronomical_twilight_begin, null, 'no astronomical night at midsummer');
assert.equal(clocks('2026-06-21').astronomical_twilight_end, null);

const ordered = ['astronomical_twilight_begin', 'nautical_twilight_begin', 'civil_twilight_begin', 'sunrise', 'solar_noon',
  'sunset', 'civil_twilight_end', 'nautical_twilight_end', 'astronomical_twilight_end'];
for (let day = 0; day < 365; day++) {
  const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
  const events = context.calculate(date);
  const present = ordered.filter(key => events[key] !== null);
  if (present.length < ordered.length) {
    assert.ok(ordered.filter(key => events[key] === null).every(key => key.startsWith('astronomical')), 'only astronomical twilight can be missing in Dublin');
    assert.ok(date >= '2026-05-14' && date <= '2026-07-29', 'astronomical night is missing only around midsummer');
  }
  for (let i = 0; i < present.length; i++) {
    const current = new Date(events[present[i]]);
    if (/^(nautical|astronomical)_twilight_end$/.test(present[i])) {
      assert.ok(current - new Date(events.solar_noon) < 12 * 3600000, 'a late dusk stays within the night after its date');
    } else {
      assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(current), date, 'every event belongs to its Dublin date');
    }
    if (i) assert.ok(current > new Date(events[present[i - 1]]), 'daily events stay in chronological order');
  }
}
console.log('PASS: Dublin solar dates and event ordering for 2026, clock changes, solstices and all three twilights.');
