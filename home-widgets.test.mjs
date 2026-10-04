import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const source = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const homeCode = source('./home-widgets.js');
const dashboardCode = source('./dashboard.js');
const github = 'https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/';
const homeCache = '/phone/DublinDashboardHome/';
const originalCache = '/phone/DublinDashboard/weather.json';
const stamp = time => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).format(new Date(time)).replace(' ', 'T');

class XMLParser {
  constructor(xml) { this.xml = xml; }
  parse() {
    const code = 'import sys,json,xml.parsers.expat\np=xml.parsers.expat.ParserCreate()\ne=[]\np.StartElementHandler=lambda n,a:e.append(["start",n,a])\np.EndElementHandler=lambda n:e.append(["end",n])\np.CharacterDataHandler=lambda s:e.append(["text",s])\np.Parse(sys.stdin.read(),True)\nprint(json.dumps(e))';
    const events = JSON.parse(execFileSync('python3', ['-c', code], { input: this.xml }));
    for (const [type, name, attrs] of events) {
      if (type === 'start') this.didStartElement?.(name, attrs);
      if (type === 'end') this.didEndElement?.(name);
      if (type === 'text') this.foundCharacters?.(name);
    }
    return true;
  }
}

function phone() {
  const state = {
    time: Date.parse('2026-10-05T16:00:00Z'), files: new Map([[originalCache, 'large widget data']]),
    requests: [], writes: [], fail: new Set(), bodies: new Map(), status: new Map(),
    rendered: [], previews: [], widget: null, complete: false, app: false,
    live: null, feedAge: 0, parameter: null, family: null
  };
  class PhoneDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.time])); }
    static now() { return state.time; }
  }
  const rail = () => ({
    timezone: 'Europe/Dublin', feedStart: '20261001', validThrough: '20261212', checkedAt: state.time,
    routes: {
      sallinsHeuston: ['22:00:00', '22:11:00', '24:01:00'].map(departure => ({
        departure, serviceId: 'daily', destination: 'Dublin Heuston', trainCode: 'P227'
      })),
      connollySallins: ['18:00:00', '18:32:00'].map(departure => ({
        departure, serviceId: 'weekday', destination: 'Newbridge', trainCode: 'D419'
      }))
    },
    services: Object.fromEntries([['daily', '1111111'], ['weekday', '1111100']].map(([id, weekdays]) => [
      id, { start: '20261001', end: '20261212', weekdays, exceptions: {} }
    ]))
  });
  const weather = () => {
    const data = { queries: [{ queryKey: ['currenthour'], state: { data: {
      temperature: { value: 12.4, feelsLike: 9.6 }, created: new Date(state.time).toISOString()
    } } }] };
    return 'window.__REACT_QUERY_STATE__ = JSON.parse(' + JSON.stringify(JSON.stringify(data)) +
      '); <div class="now-hero__next-hour-symbol"><div class="weather-symbol"><img alt="light rain">';
  };
  const luas = green => '<stopInfo created="' + stamp(state.time - state.feedAge) + '">' +
    '<message>Trams are operating normally</message>' + (green ?
      '<direction name="Inbound"><tram destination="Broombridge" dueMins="1"/></direction>' +
      '<direction name="Outbound"><tram destination="Bride’s Glen" dueMins="2"/></direction>' :
      '<direction name="Outbound"><tram destination="Tallaght" dueMins="3"/></direction>' +
      '<direction name="Inbound"><tram destination="Connolly" dueMins="4"/>' +
      '<tram destination="The Point" dueMins="8"/><tram destination="The Point" dueMins="9"/></direction>') +
    '</stopInfo>';
  class Request {
    constructor(url) { this.url = url; }
    async loadString() {
      state.requests.push(this.url);
      if (state.fail.has(this.url)) throw new Error('offline');
      this.response = { statusCode: state.status.get(this.url) || 200 };
      if (state.bodies.has(this.url)) return state.bodies.get(this.url);
      if (this.url === github + 'home-widgets.js') return homeCode;
      if (this.url === github + 'dashboard.js') return dashboardCode;
      if (this.url.includes('yr.no')) return weather();
      if (this.url.includes('luasforecasts')) return luas(this.url.includes('stop=PAR'));
      if (this.url.includes('api.irishrail.ie')) {
        const live = this.url.includes('StationDesc=Sallins') ? state.live : null;
        return '<ArrayOfObjStationData>' + (live ? '<objStationData>' +
          Object.entries(live).map(([key, value]) => '<' + key + '>' + value + '</' + key + '>').join('') +
          '</objStationData>' : '') + '</ArrayOfObjStationData>';
      }
      throw new Error('Unexpected request: ' + this.url);
    }
    async loadJSON() {
      state.requests.push(this.url);
      assert.equal(this.url, github + 'rail.json');
      if (state.fail.has(this.url)) throw new Error('offline');
      this.response = { statusCode: 200 };
      return rail();
    }
  }
  class Widget {
    constructor() { this.children = []; }
    addText(value) { const item = { value }; this.children.push(item); state.rendered.push(item); return item; }
    addDate(date) {
      const item = { date, applyTimerStyle() { this.timer = true; } };
      this.children.push(item); state.rendered.push(item); return item;
    }
    addStack() { const item = new Widget(); this.children.push(item); return item; }
    addSpacer(spacer) { this.children.push({ spacer }); }
    addImage(image) { const item = { image }; this.children.push(item); state.rendered.push(item); return item; }
    centerAlignContent() { this.alignment = 'center'; }
    setPadding(...values) { this.padding = values; }
    async presentSmall() { state.previews.push('small'); }
    async presentMedium() { state.previews.push('medium'); }
    async presentLarge() { state.previews.push('large'); }
    layoutVertically() { this.vertical = true; }
  }
  const context = vm.createContext({
    Date: PhoneDate, Intl, Request, XMLParser, console: { log() {} },
    args: { get widgetParameter() { return state.parameter; } },
    config: { get runsInApp() { return state.app; }, get widgetFamily() { return state.family; } }, ListWidget: Widget,
    FileManager: { local: () => ({
      documentsDirectory: () => '/phone', joinPath: (a, b) => a + '/' + b,
      fileExists: path => state.files.has(path), createDirectory: path => state.files.set(path, ''),
      readString: path => { if (!state.files.has(path)) throw new Error('not found'); return state.files.get(path); },
      writeString: (path, value) => { state.writes.push(path); state.files.set(path, value); }
    }) },
    Font: { systemFont: size => size, semiboldSystemFont: size => size, semiboldMonospacedSystemFont: size => size },
    Color: class { constructor(hex) { this.hex = hex; } },
    Size: class { constructor(width, height) { this.width = width; this.height = height; } },
    Rect: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
    DrawContext: class {
      constructor() { this.fills = []; }
      setFillColor() {}
      fillRect(rect) { this.fills.push(rect); }
      getImage() { return { fills: this.fills }; }
    },
    Script: {
      setWidget: widget => { state.widget = widget; },
      complete: () => { state.complete = true; state.writes.push('complete'); }
    }
  });
  state.run = async (name, preserveLargeCache = true) => {
    state.rendered.length = 0; state.requests.length = 0; state.writes.length = 0; state.complete = false;
    await vm.runInContext('(async () => {\n' + source('./Dublin ' + name + '.js') + '\n})()', context);
    assert.equal(state.complete, true);
    assert.equal(state.widget.backgroundColor.hex, '1c1c1e');
    assert.equal(state.widget.url, undefined);
    if (preserveLargeCache) {
      assert.equal(state.files.get(originalCache), 'large widget data');
      assert.ok(state.writes.every(path => path === 'complete' || path.startsWith(homeCache) ||
        path === '/phone/DublinDashboard/github-source.js'));
    }
    assert.equal(state.writes.at(-1), 'complete');
    assert.ok(state.widget.refreshAfterDate.getTime() > state.time);
    return state.rendered.filter(item => item.value).map(item => item.value);
  };
  return state;
}

for (const [name, size, heading, credit, provider] of [
  ['Weather', 'small', 'Yr', 'MET Norway', 'yr.no'],
  ['Trains', 'small', '5 Oct', 'NTA/TFI · Irish Rail', 'api.irishrail.ie'],
  ['Luas', 'medium', 'Parnell', 'TII/Luas', 'luasforecasts']
]) test(name + ' uses its own feeds, size, and cache', async () => {
  const p = phone(); p.app = true;
  const text = await p.run(name);
  assert.ok(text.includes(heading)); assert.ok(text.includes(credit));
  assert.deepEqual(p.previews, [size]);
  const providers = p.requests.filter(url => !url.startsWith(github));
  assert.equal(providers.length, name === 'Weather' ? 1 : 2);
  assert.ok(providers.every(url => url.includes(provider)));
  assert.equal(p.requests.includes(github + 'rail.json'), name === 'Trains');
  assert.equal(p.files.get(homeCache + 'data-source.js'), dashboardCode);
  assert.ok(p.files.get(homeCache + 'data-source.js').includes('Copyright (c) 2026, Volodymyr Agafonkin'));
  assert.equal(p.rendered.find(item => item.value === '● ').textColor.hex, '30d158');
});

for (const [parameter, family, heading, credit] of [
  ['weather', 'small', 'Yr', 'MET Norway'],
  ['trains', 'small', '5 Oct', 'NTA/TFI · Irish Rail'],
  ['luas', 'medium', 'Parnell', 'TII/Luas']
]) test('existing Dashboard loader selects ' + parameter + ' without new phone code', async () => {
  const p = phone(); p.parameter = parameter; p.family = family; p.app = true;
  const text = await p.run('Dashboard');
  assert.ok(text.includes(heading)); assert.ok(text.includes(credit));
  assert.deepEqual(p.previews, [family]);
  assert.equal(p.files.get(homeCache + 'home-source.js'), homeCode);
  assert.equal(p.files.get('/phone/DublinDashboard/github-source.js'), dashboardCode);
});

test('blank and unknown parameters preserve the large view; large widgets always keep the large view', async () => {
  for (const [parameter, family] of [[null, 'large'], ['', 'large'], ['unknown', 'medium'], ['weather', 'large']]) {
    const p = phone(); p.parameter = parameter; p.family = family; p.app = true;
    await p.run('Dashboard', false);
    assert.deepEqual(p.previews, ['large']);
    assert.ok(!p.requests.includes(github + 'home-widgets.js'));
  }
});

test('the existing Dashboard loader keeps compact views on download failures', async () => {
  const p = phone(); p.parameter = 'weather'; p.family = 'small';
  await p.run('Dashboard');
  const url = github + 'home-widgets.js';
  for (const failure of ['offline', 'http', 'syntax']) {
    p.fail.clear(); p.status.clear(); p.bodies.clear();
    if (failure === 'offline') p.fail.add(url);
    if (failure === 'http') p.status.set(url, 404);
    if (failure === 'syntax') p.bodies.set(url, '<html>invalid JavaScript</html>');
    assert.ok((await p.run('Dashboard')).includes('12°'));
    assert.equal(p.files.get(homeCache + 'home-source.js'), homeCode);
  }
  p.fail.add(github + 'dashboard.js');
  assert.ok((await p.run('Dashboard')).includes('12°'));
  const first = phone(); first.parameter = 'weather'; first.family = 'small'; first.fail.add(url);
  await assert.rejects(first.run('Dashboard'), /Use the internet for the first run/);
});

test('weather keeps Yr values, daylight scale, next event, and data age colors', async () => {
  const p = phone();
  let text = await p.run('Weather');
  for (const value of ['12°', 'Feels like', '10°', 'Light rain', 'Dark in ']) assert.ok(text.includes(value));
  const image = p.rendered.find(item => item.image);
  assert.equal(image.imageSize.width, 124);
  assert.ok(image.image.fills[1].width > 2 && image.image.fills[1].width < 170);
  assert.equal(p.rendered.filter(item => item.timer).length, 2);
  const cached = JSON.parse(p.files.get(homeCache + 'weather.json'));
  p.files.set(homeCache + 'weather.json', JSON.stringify({ ...cached, fetchedAt: p.time - 6 * 60000 }));
  await p.run('Weather');
  assert.equal(p.rendered.find(item => item.value === '● ').textColor.hex, 'ff9f0a');
  p.files.set(homeCache + 'weather.json', JSON.stringify({ ...cached, fetchedAt: p.time - 16 * 60000 }));
  p.fail.add(p.requests.find(url => url.includes('yr.no')) || 'https://www.yr.no/en/forecast/daily-table/2-2964574/Ireland/Leinster/Dublin%20City/Dublin');
  text = await p.run('Weather');
  assert.ok(text.includes('Light rain'));
  assert.equal(p.rendered.find(item => item.value === '● ').textColor.hex, 'ff453a');
  p.time = Date.parse('2026-10-05T23:30:00Z');
  text = await p.run('Weather');
  assert.ok(text.includes('Bright in ')); assert.ok(text.includes('Unavailable'));
  assert.equal(p.rendered.find(item => item.image).image.fills[1].width, 2);
});

test('trains keep cutoffs, dates, live delays, cancellations, and today only', async () => {
  const p = phone();
  let text = await p.run('Trains');
  assert.ok(text.includes('22:11')); assert.ok(text.includes('18:32'));
  assert.ok(!text.includes('22:00') && !text.includes('18:00'));
  assert.ok(text.includes('5 Oct')); assert.equal(text.filter(value => value === 'scheduled').length, 2);
  assert.ok(text.includes('Sallins → Heuston') && text.includes('Connolly → Sallins'));
  assert.equal(p.rendered.find(item => item.value === '22:11').textColor.hex, '8eafcf');
  p.app = true;
  p.time = Date.parse('2026-10-05T21:12:00Z');
  p.live = { Traincode: 'P227', Traindate: '05 Oct 2026', Destination: 'Dublin Heuston',
    Servertime: stamp(p.time), Status: 'Delayed', Expdepart: '22:18' };
  text = await p.run('Trains');
  assert.ok(text.includes('22:18')); assert.ok(text.includes('live'));
  p.live.Status = 'Cancelled';
  text = await p.run('Trains');
  assert.equal(text.filter(value => value === 'No more today').length, 2);
  p.time = Date.parse('2026-10-10T12:00:00Z'); p.live = null;
  text = await p.run('Trains');
  assert.ok(text.includes('No service today')); assert.ok(!text.includes('18:32'));
});

test('Luas selects the catchable tram and rejects stale or absent forecasts', async () => {
  const p = phone();
  let text = await p.run('Luas');
  assert.ok(text.includes('17:02')); assert.ok(text.includes('17:09')); assert.ok(!text.includes('17:08'));
  assert.ok(text.includes('Parnell') && text.includes('Abbey St → Point') && text.includes('Est.'));
  assert.equal(p.rendered.find(item => item.value === '17:02').textColor.hex, '8cba9a');
  assert.equal(p.rendered.find(item => item.value === '17:09').textColor.hex, 'c99a9a');
  const abbey = p.requests.find(url => url.includes('stop=ABB'));
  p.fail.add(abbey);
  text = await p.run('Luas');
  assert.ok(text.includes('17:02')); assert.ok(text.includes('Unavailable'));
  assert.equal(p.rendered.find(item => item.value === '● ').textColor.hex, 'ff453a');
  p.fail.clear(); p.feedAge = 4 * 60000;
  text = await p.run('Luas');
  assert.ok(!text.includes('17:02') && !text.includes('17:09'));
  assert.equal(text.filter(value => value === 'Unavailable').length, 2);
});

test('small trains preserve expired fallback warnings without competing with route labels', async () => {
  const p = phone();
  p.time = Date.parse('2026-12-13T12:00:00Z');
  p.fail.add(github + 'rail.json');
  const text = await p.run('Trains');
  assert.equal(text.filter(value => value === 'Refresh timetable').length, 2);
  assert.ok(text.includes('NTA/TFI · Irish Rail · old'));
  assert.ok(text.includes('13 Dec'));
  assert.equal(p.widget.children.filter(item => item.value === 'Refresh timetable').length, 2);
  assert.equal(p.rendered.find(item => item.value === '● ').textColor.hex, 'ff453a');
});

test('Luas keeps service alerts visible without long provider messages', async () => {
  const p = phone();
  await p.run('Luas');
  const parnell = p.requests.find(url => url.includes('stop=PAR'));
  const message = 'Green Line services delayed between Parnell and Marlborough';
  p.bodies.set(parnell, '<stopInfo created="' + stamp(p.time) + '"><message>' + message +
    '</message><direction name="Outbound"><tram destination="Bride’s Glen" dueMins="2"/></direction></stopInfo>');
  const text = await p.run('Luas');
  assert.ok(text.includes('17:02') && text.includes('17:09'));
  assert.ok(text.includes('Service alert'));
  assert.ok(!text.includes(message));
});

test('both code downloads keep saved code on offline, HTTP, syntax, and format failures', async () => {
  const p = phone();
  await p.run('Weather');
  for (const file of ['home-widgets.js', 'dashboard.js']) {
    const url = github + file;
    const saved = p.files.get(homeCache + (file === 'dashboard.js' ? 'data-source.js' : 'home-source.js'));
    for (const failure of ['offline', 'http', 'syntax', ...(file === 'dashboard.js' ? ['format'] : [])]) {
      p.fail.clear(); p.status.clear(); p.bodies.clear();
      if (failure === 'offline') p.fail.add(url);
      if (failure === 'http') p.status.set(url, 404);
      if (failure === 'syntax') p.bodies.set(url, '<html>invalid JavaScript</html>');
      if (failure === 'format') p.bodies.set(url, dashboardCode.replace('// Run the dashboard.', '// Changed format.'));
      assert.ok((await p.run('Weather')).includes('12°'));
      assert.equal(p.files.get(homeCache + (file === 'dashboard.js' ? 'data-source.js' : 'home-source.js')), saved);
    }
  }
  const first = phone(); first.fail.add(github + 'home-widgets.js');
  await assert.rejects(first.run('Weather'), /Use the internet for the first run/);
  const data = phone(); data.fail.add(github + 'dashboard.js');
  await assert.rejects(data.run('Weather'), /Use the internet for the first run/);
});

test('a new compact script replaces saved code before Script.complete', async () => {
  const p = phone(); await p.run('Weather');
  const next = homeCode.replace('"Yr"', '"NEW WEATHER"');
  p.bodies.set(github + 'home-widgets.js', next);
  assert.ok((await p.run('Weather')).includes('NEW WEATHER'));
  assert.equal(p.files.get(homeCache + 'home-source.js'), next);
});
