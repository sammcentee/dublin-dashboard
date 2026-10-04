import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';
import { unzipRail, extractRailSchedule } from './scripts/rail-data.mjs';

const source = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8').split('// Run the dashboard.')[0];
const now = Date.parse('2026-10-04T11:00:00Z');
const jsonUrl = 'https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/rail.json';
const cachePath = '/phone/DublinDashboard/rail.json';
const csv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n';
const sallins = '8260IR0060', heuston = '8220IR0132', connolly = '8220IR0007';
const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'trip_short_name']];
const stops = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type']];

function trip(id, from, to, departure, service = 'weekdays', options = {}) {
  trips.push(['rail', service, id, options.destination || 'Dublin Heuston', id]);
  stops.push([id, departure, departure, from, options.reversed ? 2 : 1, options.pickup || '0', '0']);
  stops.push([id, '24:17:00', '24:17:00', to, options.reversed ? 1 : 2, '0', options.dropoff || '0']);
}
trip('late', sallins, heuston, '23:10:00');
trip('first', sallins, heuston, '22:05:00');
trip('midnight', sallins, heuston, '24:05:00');
trip('exact22', sallins, heuston, '22:00:00');
trip('reverse', sallins, heuston, '22:06:00', 'weekdays', { reversed: true });
trip('noPickup', sallins, heuston, '22:07:00', 'weekdays', { pickup: '1' });
trip('noDropoff', sallins, heuston, '22:08:00', 'weekdays', { dropoff: '1' });
trip('return', connolly, sallins, '18:15:00', 'weekdays', { destination: 'Newbridge, through Sallins' });
trip('exact18', connolly, sallins, '18:00:00');
trip('special', sallins, heuston, '22:40:00', 'special');
// The two legs belong to different trains and must never become a direct trip.
trip('changeA', connolly, 'interchange', '18:20:00');
trip('changeB', 'interchange', sallins, '18:40:00');

const files = {
  'feed_info.txt': csv([['feed_start_date', 'feed_end_date', 'feed_version'], ['20261001', '20261231', 'fixture-feed']]),
  'stop_times.txt': csv(stops),
  'trips.txt': csv(trips),
  'calendar.txt': csv([
    ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['weekdays', 1, 1, 1, 1, 1, 0, 0, '20261001', '20261231']
  ]),
  'calendar_dates.txt': csv([
    ['service_id', 'date', 'exception_type'], ['weekdays', '20261026', 2], ['special', '20261010', 1]
  ])
};
const fixture = () => ({ ...extractRailSchedule(files), checkedAt: now - 3600000, retrievedAt: '2026-10-04', sourceETag: 'original-feed' });

function phone({ embedded = fixture(), cached, body = fixture(), status = 200, error, runsInApp = false } = {}) {
  const storage = new Map();
  const requests = [];
  if (cached) storage.set(cachePath, JSON.stringify(cached));
  const context = vm.createContext({
    Date, Intl, console: { log() {} }, config: { runsInApp },
    FileManager: { local: () => ({
      documentsDirectory: () => '/phone', joinPath: (a, b) => a + '/' + b,
      fileExists: path => storage.has(path), createDirectory() {},
      readString: path => { if (!storage.has(path)) throw Error('not found'); return storage.get(path); },
      writeString: (path, value) => storage.set(path, value)
    }) },
    Request: class {
      constructor(url) { assert.equal(url, jsonUrl); requests.push(this); }
      async loadJSON() {
        if (error) throw error;
        this.response = { statusCode: status };
        return structuredClone(body);
      }
    }
  });
  vm.runInContext(source, context);
  const api = vm.runInContext('({timetable,nextTrain,EMBEDDED_RAIL})', context);
  // Replace the fixture dependency inside this VM; the production source is untouched.
  for (const key of Object.keys(api.EMBEDDED_RAIL)) delete api.EMBEDDED_RAIL[key];
  Object.assign(api.EMBEDDED_RAIL, structuredClone(embedded));
  return { api, storage, requests, config: context.config };
}

test('widget accepts a changed upstream timetable without opening Scriptable', async () => {
  const older = fixture();
  const newer = { ...fixture(), checkedAt: now, sourceETag: 'new-nightly-feed', feedVersion: 'next-feed' };
  newer.routes.sallinsHeuston[0].departure = '22:19:00';
  const p = phone({ embedded: older, cached: older, body: newer });
  const result = await p.api.timetable(new Date(now));
  assert.equal(p.config.runsInApp, false);
  assert.equal(result.data.feedVersion, 'next-feed');
  assert.equal(result.data.routes.sallinsHeuston[0].departure, '22:19:00');
  assert.equal(result.unverified, false);
  assert.equal(JSON.parse(p.storage.get(cachePath)).sourceETag, 'new-nightly-feed');
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].method, undefined, 'the phone does not probe the full ZIP with HEAD');
});

test('new embedded data replaces an old phone cache even when GitHub is offline', async () => {
  const cached = { ...fixture(), feedVersion: 'old-phone-cache' };
  delete cached.checkedAt; // The original on-phone ZIP cache predates this field.
  const embedded = { ...fixture(), checkedAt: now, feedVersion: 'new-embedded' };
  const p = phone({ cached, embedded, error: Error('offline') });
  const result = await p.api.timetable(new Date(now));
  assert.equal(result.data.feedVersion, 'new-embedded');
  assert.equal(result.unverified, false);
});

test('an older GitHub CDN response cannot downgrade the newest cached snapshot', async () => {
  const cached = { ...fixture(), checkedAt: now, feedVersion: 'newest-cache' };
  const p = phone({ cached, body: fixture() });
  const result = await p.api.timetable(new Date(now));
  assert.equal(result.data.feedVersion, 'newest-cache');
  assert.equal(JSON.parse(p.storage.get(cachePath)).feedVersion, 'newest-cache');
});

for (const [name, failure] of [
  ['network outage', { error: Error('offline') }],
  ['HTTP404', { status: 404 }],
  ['malformed JSON', { error: SyntaxError('Unexpected token < in JSON') }],
  ['invalid JSON shape', { body: { checkedAt: now } }],
  ['missing source-check timestamp', { body: { ...fixture(), checkedAt: undefined } }],
  ['non-numeric source-check timestamp', { body: { ...fixture(), checkedAt: 'yesterday' } }],
  ['invalid future source-check timestamp', { body: { ...fixture(), checkedAt: now + 6 * 60000 } }]
]) {
  test(name + ' preserves the cache and bounds background retries', async () => {
    const cached = { ...fixture(), checkedAt: now, feedVersion: 'saved-working-feed' };
    const p = phone({ cached, ...failure });
    const before = p.storage.get(cachePath);
    const first = await p.api.timetable(new Date(now));
    assert.equal(first.data.feedVersion, 'saved-working-feed');
    assert.equal(p.storage.get(cachePath), before);
    await p.api.timetable(new Date(now + 2 * 60000));
    await p.api.timetable(new Date(now + 59 * 60000));
    assert.equal(p.requests.length, 1);
    await p.api.timetable(new Date(now + 3600000));
    assert.equal(p.requests.length, 2, 'retry automatically at the hourly boundary');
  });
}

test('manual app execution can retry before the background polling interval', async () => {
  const p = phone();
  await p.api.timetable(new Date(now));
  p.config.runsInApp = true;
  await p.api.timetable(new Date(now + 1000));
  assert.equal(p.requests.length, 2);
});

test('downloading stale data does not make its source verification fresh', async () => {
  const stale = { ...fixture(), checkedAt: now - 25 * 3600000 };
  const p = phone({ embedded: stale, body: stale });
  const result = await p.api.timetable(new Date(now));
  assert.equal(result.data.checkedAt, stale.checkedAt);
  assert.equal(result.unverified, true);
});

test('expired schedules warn instead of claiming that no train operates', async () => {
  const expired = { ...fixture(), validThrough: '20261003', checkedAt: now - 25 * 3600000 };
  const p = phone({ embedded: expired, cached: expired, error: Error('offline') });
  const result = await p.api.timetable(new Date(now));
  assert.equal(p.api.nextTrain(result.data, 'sallinsHeuston', new Date(now)).message, 'TFI timetable needs refresh');
  assert.equal(result.unverified, true);
});

test('today-only departures retain weekdays, special dates, and no tomorrow fallback', () => {
  const p = phone();
  const data = fixture();
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', new Date(now)).message, 'No direct service today', 'Sunday does not offer Monday');
  const monday = new Date('2026-10-05T11:00:00Z');
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', monday).trainCode, 'first');
  assert.equal(p.api.nextTrain(data, 'connollySallins', monday).trainCode, 'return');
  assert.equal(p.api.nextTrain(data, 'connollySallins', new Date('2026-10-05T17:16:00Z')).message, 'No more today');
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', new Date('2026-10-05T22:11:00Z')).message, 'No more today', '24:05 departure belongs to tomorrow');
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', new Date('2026-10-10T11:00:00Z')).trainCode, 'special', 'calendar-only extra service');
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', new Date('2026-10-26T11:00:00Z')).message, 'No direct service today', 'bank holiday removal');
});

test('the publisher keeps direct usable trips strictly after each cutoff', () => {
  const data = fixture();
  assert.deepEqual(data.routes.sallinsHeuston.map(t => t.trainCode), ['first', 'special', 'late', 'midnight']);
  assert.deepEqual(data.routes.connollySallins.map(t => t.trainCode), ['return']);
  assert.equal(data.routes.connollySallins[0].destination, 'Newbridge, through Sallins', 'quoted CSV headsign stays intact');
  assert.equal(data.validThrough, '20261231');
});

test('strict cutoffs also apply when live estimates replace scheduled departure', () => {
  const p = phone();
  const data = fixture();
  const monday = new Date('2026-10-05T16:00:00Z');
  const record = (trip, time) => ({
    Traincode: trip.trainCode, Traindate: '05 Oct 2026', Destination: trip.destination,
    Servertime: '2026-10-05T17:00:00', Expdepart: time, Status: 'En Route'
  });
  const outbound = data.routes.sallinsHeuston[0];
  const inbound = data.routes.connollySallins[0];
  assert.equal(p.api.nextTrain(data, 'sallinsHeuston', monday, [record(outbound, '22:00')]).trainCode, 'late');
  assert.equal(p.api.nextTrain(data, 'connollySallins', monday, [record(inbound, '18:00')]).message, 'No more today');
  assert.equal(p.api.nextTrain(data, 'connollySallins', monday, [record(inbound, '18:01')]).live, true);
});

function zip(contents, method) {
  const chunks = [], entries = [];
  let offset = 0;
  for (const [name, text] of Object.entries(contents)) {
    const filename = Buffer.from(name), plain = Buffer.from(text);
    const compressed = method === 8 ? deflateRawSync(plain) : plain;
    let crc = 0xffffffff;
    for (const byte of plain) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(plain.length, 22); local.writeUInt16LE(filename.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(plain.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    chunks.push(local, filename, compressed); entries.push(directory, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(entries);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(contents).length, 8); end.writeUInt16LE(Object.keys(contents).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]).toString('base64');
}

for (const method of [0, 8]) {
  test('publisher decodes a real ' + (method === 8 ? 'deflated' : 'stored') + ' GTFS ZIP', async () => {
    const decoded = await unzipRail(zip({ ...files, 'unused.txt': 'not part of the timetable' }, method));
    assert.deepEqual(decoded, files);
    assert.equal(extractRailSchedule(decoded).routes.connollySallins[0].trainCode, 'return');
  });
}

test('publisher rejects malformed archives and missing timetable tables', async () => {
  await assert.rejects(unzipRail(Buffer.from('not a ZIP archive').toString('base64')), /archive not recognised/);
  await assert.rejects(unzipRail(zip({ 'feed_info.txt': files['feed_info.txt'] }, 0)), /timetable missing/);
});
