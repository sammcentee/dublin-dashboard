// Dublin Dashboard — use a LARGE Scriptable widget.
// Updates automatically when iOS refreshes the widget. No accounts or API keys are required.
// Original project code: MIT License, copyright (c) 2026 Sam McEntee.
// Data sources and separate licences: https://github.com/sammcentee/dublin-dashboard/blob/main/NOTICE.md
// Weather: MET Norway / Yr; rail: NTA / TFI and Irish Rail; Luas: TII.
// Daylight calculations: adapted from SunCalc under BSD-2-Clause; notice retained below.
const TZ = "Europe/Dublin";
const YR = "https://www.yr.no/en/forecast/daily-table/2-2964574/Ireland/Leinster/Dublin%20City/Dublin";
const RAIL_URL = "https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip";
const EMBEDDED_RAIL = {"source":"https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip","retrievedAt":"2026-10-03","feedVersion":"0553EF0E-F1A8-463C-A62F-38176FC6F829","feedStart":"20261002","feedEnd":"20271002","sourceLastModified":"Fri, 02 Oct 2026 22:18:20 GMT","sourceETag":"\"75b4e3-65ce2e8e5c300\"","timezone":"Europe/Dublin","routes":{"sallinsHeuston":[{"departure":"22:11:00","arrival":"22:46:00","serviceId":"221","tripId":"5936_11751","destination":"Dublin Heuston","trainCode":"P227"},{"departure":"22:29:00","arrival":"22:52:00","serviceId":"200","tripId":"5936_13185","destination":"Dublin Heuston","trainCode":"A531"},{"departure":"23:09:00","arrival":"23:42:00","serviceId":"208","tripId":"5936_11770","destination":"Dublin Heuston","trainCode":"P229"},{"departure":"23:44:00","arrival":"24:17:00","serviceId":"113","tripId":"5936_11791","destination":"Dublin Heuston","trainCode":"P229"}],"connollySallins":[{"departure":"18:32:00","arrival":"19:23:00","serviceId":"183","tripId":"5936_11923","destination":"Newbridge","trainCode":"D419"}]},"services":{"200":{"start":"20261001","end":"20261212","weekdays":"1111110","exceptions":{"20261026":2}},"208":{"start":"20261001","end":"20261212","weekdays":"1111110","exceptions":{"20261003":2,"20261026":2}},"183":{"start":"20261001","end":"20261211","weekdays":"1111100","exceptions":{"20261026":2}},"113":{"start":"20261003","end":"20261003","weekdays":"0000010","exceptions":{}},"221":{"start":"20261001","end":"20261212","weekdays":"1111110","exceptions":{}}},"attribution":"Timetable data: National Transport Authority, CC BY 4.0. Timetable snapshot; not a live service guarantee.","validThrough":"20261212","sourceInfoUrl":"https://www.transportforireland.ie/transitData/PT_Data.html"};
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "DublinDashboard");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);

function readCache(name) {
  try { return JSON.parse(fm.readString(fm.joinPath(folder, name + ".json"))); }
  catch (_) { return null; }
}
function saveCache(name, value) {
  fm.writeString(fm.joinPath(folder, name + ".json"), JSON.stringify(value));
}
function request(url) {
  const r = new Request(url);
  r.timeoutInterval = 12;
  r.headers = { "User-Agent": "DublinDashboard/1.0 (personal Scriptable widget)", "Cache-Control": "no-cache" };
  return r;
}
function headers(response) {
  return Object.fromEntries(Object.entries(response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
}
function parts(date) {
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  return Object.fromEntries(format.formatToParts(date).filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
}
function dateKey(date) {
  const p = parts(date);
  return String(p.year) + String(p.month).padStart(2, "0") + String(p.day).padStart(2, "0");
}
function isoDay(key) { return key.slice(0, 4) + "-" + key.slice(4, 6) + "-" + key.slice(6, 8); }
function shiftDay(key, days) {
  const d = new Date(isoDay(key) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function localDate(key, time) {
  const [h, m, s = 0] = time.split(":").map(Number);
  const target = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)), h, m, s);
  let value = target;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(value));
    value = target - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - value);
  }
  return new Date(value);
}
function clock(date) { return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date); }
function dayLabel(date) { return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(date); }
function parseLocalStamp(stamp) {
  const match = stamp && stamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/);
  return match ? localDate(match[1] + match[2] + match[3], match[4]) : null;
}
function activeService(service, key) {
  if (!service) return false;
  if (service.exceptions[key] !== undefined) return service.exceptions[key] === 1;
  const weekday = (new Date(isoDay(key) + "T12:00:00Z").getUTCDay() + 6) % 7;
  return key >= service.start && key <= service.end && service.weekdays[weekday] === "1";
}

function parseYr(html) {
  const match = html.match(/window\.__REACT_QUERY_STATE__\s*=\s*JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
  if (!match) throw new Error("Yr page format changed");
  const state = JSON.parse(JSON.parse(match[1]));
  const data = state.queries.find(q => q.queryKey[0] === "currenthour")?.state.data;
  if (!Number.isFinite(data?.temperature?.value) || !Number.isFinite(data?.temperature?.feelsLike)) throw new Error("Yr weather unavailable");
  const label = html.match(/<div class="now-hero__next-hour-symbol">\s*<div class="weather-symbol">\s*<img\b[^>]*\balt="([^"]+)"/)?.[1];
  const description = label ? label[0].toUpperCase() + label.slice(1) : null;
  return { temperature: data.temperature.value, feelsLike: data.temperature.feelsLike, description, updatedAt: data.created };
}
async function weather(now) {
  const old = readCache("weather");
  if (old && old.description !== undefined && now.getTime() - old.fetchedAt < 10 * 60000) return old;
  try {
    const result = { ...parseYr(await request(YR).loadString()), fetchedAt: now.getTime() };
    saveCache("weather", result);
    return result;
  } catch (e) {
    console.log(String(e));
    return old && now.getTime() - old.fetchedAt < 60 * 60000 ? { ...old, stale: true } : null;
  }
}
/*
 * Dublin solar calculations adapted from SunCalc by Volodymyr Agafonkin.
 * https://github.com/mourner/suncalc/blob/ecb6bb0b0f3a5003298cfb536e46176117caf4e5/index.js
 * Only solar noon, sunrise/sunset and civil dawn/dusk are retained.
 * Coordinates are fixed to Dublin; delta-T approximation covers 2005–2050.
 *
 * Copyright (c) 2026, Volodymyr Agafonkin
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, this list of
 *       conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright notice, this list
 *       of conditions and the following disclaimer in the documentation and/or other materials
 *       provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function sunDay(date) {
  const { PI, sin, cos, asin, acos, atan2, round } = Math;
  const rad = PI / 180, phi = 53.3498 * rad, lw = 6.2603 * rad;
  const wrap = a => a - 2 * PI * round(a / (2 * PI));
  const time = d => new Date((d + 10957.5) * 86400000).toISOString();
  function coords(d) {
    const year = d / 365.2425;
    const t = (d + (62.92 + year * (0.32217 + year * 0.005589)) / 86400) / 36525;
    const m = rad * (357.52911 + t * (35999.05029 - t * 0.0001537));
    const sm = sin(m), cm = cos(m), om = rad * (125.04 - 1934.136 * t);
    const c = rad * ((1.914602 - t * (0.004817 + t * 0.000014)) * sm + (0.019993 - 0.000101 * t) * 2 * sm * cm + 0.000289 * sm * (3 - 4 * sm * sm));
    const l = rad * (280.46646 + t * (36000.76983 + t * 0.0003032)) + c - rad * (0.00569 + 0.00478 * sin(om));
    const e = rad * (23.439291 - t * (0.0130042 + t * (0.00000016 - t * 0.000000504))) + rad * 0.00256 * cos(om);
    return { ra: atan2(cos(e) * sin(l), cos(l)), dec: asin(sin(e) * sin(l)) };
  }
  const sidereal = d => rad * (280.46061837 + 360.98564736629 * d) - lw;
  const anchor = new Date(date + "T12:00:00Z").getTime() / 86400000 - 10957.5;
  const lon = 0.0009 + lw / (2 * PI);
  let noon = round(anchor - lon) + lon;
  for (let i = 0; i < 3; i++) noon -= wrap(sidereal(noon) - coords(noon).ra) / (2 * PI);
  const declination = coords(noon).dec;
  function crossing(degrees, sign) {
    const target = degrees * rad;
    let d = noon + sign * acos((sin(target) - sin(phi) * sin(declination)) / (cos(phi) * cos(declination))) / (2 * PI);
    for (let i = 0; i < 2; i++) {
      const c = coords(d), h = wrap(sidereal(d) - c.ra);
      const altitude = asin(sin(phi) * sin(c.dec) + cos(phi) * cos(c.dec) * cos(h));
      d += (altitude - target) / (2 * PI * cos(phi) * cos(c.dec) * sin(h));
    }
    return time(d);
  }
  return {
    date, solar_noon: time(noon), sunrise: crossing(-0.833, -1), sunset: crossing(-0.833, 1),
    civil_twilight_begin: crossing(-6, -1), civil_twilight_end: crossing(-6, 1)
  };
}
async function daylight(now) {
  const key = dateKey(now);
  return { days: [sunDay(isoDay(key)), sunDay(isoDay(shiftDay(key, 1)))] };
}
function nextLight(data, now) {
  return data.days.flatMap(d => [
    { name: "Bright again", date: new Date(d.civil_twilight_begin) },
    { name: "Dark", date: new Date(d.civil_twilight_end) }
  ]).filter(e => e.date > now).sort((a, b) => a.date - b.date)[0];
}
function lightLevel(day, now) {
  const anchors = [[day.civil_twilight_begin, 0], [day.sunrise, 0.6], [day.solar_noon, 1], [day.sunset, 0.6], [day.civil_twilight_end, 0]].map(([time, level]) => [new Date(time).getTime(), level]);
  const t = now.getTime();
  if (t <= anchors[0][0] || t >= anchors[4][0]) return 0;
  for (let i = 1; i < anchors.length; i++) {
    if (t <= anchors[i][0]) return anchors[i - 1][1] + (anchors[i][1] - anchors[i - 1][1]) * (t - anchors[i - 1][0]) / (anchors[i][0] - anchors[i - 1][0]);
  }
  return 0;
}

function parseRail(xml) {
  const records = [];
  let row = null, field = null;
  const parser = new XMLParser(xml);
  parser.didStartElement = name => {
    if (name === "objStationData") row = {};
    else if (row) { field = name; row[field] = ""; }
  };
  parser.foundCharacters = text => { if (row && field) row[field] += text; };
  parser.didEndElement = name => {
    if (name === "objStationData") { records.push(row); row = null; }
    field = null;
  };
  if (!parser.parse()) throw new Error("Invalid rail feed");
  return records;
}
async function railBoard(station) {
  return parseRail(await request("https://api.irishrail.ie/realtime/realtime.asmx/getStationDataByNameXML_withNumMins?StationDesc=" + encodeURIComponent(station) + "&NumMins=90").loadString());
}
function nextTrain(data, route, now, board = [], changed = false) {
  const key = dateKey(now);
  if (changed || key < data.feedStart || key > data.validThrough) return { message: "TFI timetable needs refresh" };
  const today = data.routes[route].filter(t => activeService(data.services[t.serviceId], key));
  const candidates = [];
  for (const trip of today) {
    const scheduled = localDate(key, trip.departure);
    if (dateKey(scheduled) !== key) continue;
    const live = board.find(r => r.Traincode?.trim() === trip.trainCode && r.Traindate?.trim() === new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(scheduled) && r.Destination?.trim() === trip.destination && parseLocalStamp(r.Servertime) && Math.abs(now - parseLocalStamp(r.Servertime)) < 3 * 60000);
    if (live && /cancel/i.test(live.Status)) continue;
    let departure = scheduled;
    const isLive = live && live.Status !== "No Information" && /^\d{2}:\d{2}$/.test(live.Expdepart) && live.Expdepart !== "00:00";
    if (isLive) departure = localDate(key, live.Expdepart);
    const cutoff = localDate(key, route === "sallinsHeuston" ? "22:00:00" : "18:00:00");
    if (departure >= now && departure > cutoff && dateKey(departure) === key) candidates.push({ ...trip, departure, scheduled, live: Boolean(isLive) });
  }
  candidates.sort((a, b) => a.departure - b.departure);
  return candidates[0] || { message: today.length ? "No more today" : "No direct service today" };
}

function parseLuas(xml, now) {
  let direction = "", created = null, message = "", inMessage = false;
  const trams = [];
  const parser = new XMLParser(xml);
  parser.didStartElement = (name, a) => {
    if (name === "stopInfo") created = parseLocalStamp(a.created);
    if (name === "direction") direction = a.name;
    if (name === "message") inMessage = true;
    if (name === "tram" && (a.dueMins === "DUE" || /^\d+$/.test(a.dueMins))) {
      const minutes = a.dueMins === "DUE" ? 0 : Number(a.dueMins);
      trams.push({ direction, destination: a.destination, dueNow: minutes === 0, arrival: new Date(created.getTime() + minutes * 60000) });
    }
  };
  parser.foundCharacters = text => { if (inMessage) message += text; };
  parser.didEndElement = name => { if (name === "message") inMessage = false; };
  if (!parser.parse() || !created) throw new Error("Invalid Luas feed");
  if (Math.abs(now - created) > 3 * 60000) throw new Error("Luas feed out of date");
  return { trams: trams.sort((a, b) => a.arrival - b.arrival), created, message: message.trim() };
}
async function luas(stop, now) {
  const xml = await request("https://luasforecasts.rpa.ie/xml/get.ashx?action=forecast&stop=" + stop + "&encrypt=false").loadString();
  return parseLuas(xml, now);
}
function connection(parnell, abbey, now) {
  const upcoming = (feed, match) => (feed?.trams || []).filter(match).map(t => t.dueNow && now - feed.created < 60000 ? { ...t, arrival: new Date(now) } : t).filter(t => t.arrival >= now);
  const green = upcoming(parnell, t => t.direction === "Outbound")[0];
  const red = green && upcoming(abbey, t => t.direction === "Inbound" && t.destination === "The Point").find(t => t.arrival - green.arrival >= 7 * 60000);
  return { green, red };
}

// Heavy timetable decoding runs only in the app, never inside a widget.
async function unzipRail(base64) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const v = new DataView(bytes.buffer), names = new Set(["feed_info.txt", "stop_times.txt", "trips.txt", "calendar.txt", "calendar_dates.txt"]);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || v.getUint32(end, true) !== 0x06054b50) throw new Error("TFI archive not recognised");
  let pos = v.getUint32(end + 16, true);
  const count = v.getUint16(end + 10, true), files = {};
  for (let i = 0; i < count; i++) {
    if (v.getUint32(pos, true) !== 0x02014b50) throw new Error("Invalid TFI ZIP directory");
    const method = v.getUint16(pos + 10, true), size = v.getUint32(pos + 20, true), n = v.getUint16(pos + 28, true), extra = v.getUint16(pos + 30, true), comment = v.getUint16(pos + 32, true), local = v.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + n));
    if (names.has(name)) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      let stream = new Blob([bytes.subarray(start, start + size)]).stream();
      if (method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
      else if (method !== 0) throw new Error("Unsupported TFI archive format");
      files[name] = await new Response(stream).text();
    }
    pos += 46 + n + extra + comment;
  }
  if (!files["stop_times.txt"] || !files["trips.txt"]) throw new Error("TFI timetable missing");
  return files;
}
function extractRailSchedule(files) {
  function readCsv(name, visit) {
    const text = (files[name] || "").replace(/^\uFEFF/, "");
    let columns, row = [], field = "", quoted = false;
    function finishRow() {
      row.push(field);
      if (!columns) columns = row;
      else if (row.some(value => value !== "")) {
        const record = {};
        columns.forEach((column, i) => record[column] = row[i] || "");
        visit(record);
      }
      row = [];
      field = "";
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        finishRow();
        if (char === "\r" && text[i + 1] === "\n") i++;
      } else field += char;
    }
    if (field || row.length) finishRow();
  }
  function seconds(time) {
    const parts = time.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  function dateKey(date) { return date.toISOString().slice(0, 10).replace(/-/g, ""); }
  function parseDate(key) {
    return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
  }

  let feed = {};
  readCsv("feed_info.txt", row => feed = row);
  const pairs = {
    sallinsHeuston: ["8260IR0060", "8220IR0132", 22 * 3600],
    connollySallins: ["8220IR0007", "8260IR0060", 18 * 3600]
  };
  const stations = new Set(["8260IR0060", "8220IR0132", "8220IR0007"]);
  const stops = {};
  readCsv("stop_times.txt", row => {
    if (stations.has(row.stop_id)) (stops[row.trip_id] || (stops[row.trip_id] = {}))[row.stop_id] = row;
  });
  const routes = { sallinsHeuston: [], connollySallins: [] };
  const serviceIds = new Set();
  readCsv("trips.txt", trip => {
    const times = stops[trip.trip_id];
    if (!times) return;
    for (const name of Object.keys(pairs)) {
      const [origin, destination, cutoff] = pairs[name];
      const from = times[origin], to = times[destination];
      if (!from || !to || Number(from.stop_sequence) >= Number(to.stop_sequence) ||
          from.pickup_type === "1" || to.drop_off_type === "1" || seconds(from.departure_time) <= cutoff) continue;
      routes[name].push({ departure: from.departure_time, arrival: to.arrival_time,
        serviceId: trip.service_id, tripId: trip.trip_id,
        destination: trip.trip_headsign, trainCode: trip.trip_short_name });
      serviceIds.add(trip.service_id);
    }
  });
  for (const route of Object.values(routes)) route.sort((a, b) => seconds(a.departure) - seconds(b.departure));

  const services = {};
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  readCsv("calendar.txt", row => {
    if (serviceIds.has(row.service_id)) services[row.service_id] = {
      start: row.start_date, end: row.end_date,
      weekdays: weekdays.map(day => row[day]).join(""), exceptions: {}
    };
  });
  readCsv("calendar_dates.txt", row => {
    if (!serviceIds.has(row.service_id)) return;
    const service = services[row.service_id] || (services[row.service_id] = {
      start: row.date, end: row.date, weekdays: "0000000", exceptions: {}
    });
    service.exceptions[row.date] = Number(row.exception_type);
    if (service.weekdays === "0000000") {
      service.start = service.start < row.date ? service.start : row.date;
      service.end = service.end > row.date ? service.end : row.date;
    }
  });

  let validThrough = "";
  for (const service of Object.values(services)) {
    const limit = feed.feed_end_date || service.end;
    const last = service.end < limit ? service.end : limit;
    if (service.weekdays.includes("1")) {
      const date = parseDate(last);
      while (dateKey(date) >= service.start) {
        const key = dateKey(date), exception = service.exceptions[key];
        if (exception === 1 || (exception !== 2 && service.weekdays[(date.getUTCDay() + 6) % 7] === "1")) {
          if (key > validThrough) validThrough = key;
          break;
        }
        date.setUTCDate(date.getUTCDate() - 1);
      }
    }
    for (const [key, exception] of Object.entries(service.exceptions)) {
      if (exception === 1 && key <= (feed.feed_end_date || key) && key > validThrough) validThrough = key;
    }
  }
  return {
    source: "https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip",
    sourceInfoUrl: "https://www.transportforireland.ie/transitData/PT_Data.html",
    retrievedAt: new Date().toISOString().slice(0, 10),
    feedVersion: feed.feed_version, feedStart: feed.feed_start_date, feedEnd: feed.feed_end_date,
    sourceLastModified: null, sourceETag: null, timezone: "Europe/Dublin",
    routes, services, validThrough,
    attribution: "Timetable data: National Transport Authority, CC BY 4.0. Timetable snapshot; not a live service guarantee."
  };
}
async function timetable(now) {
  let data = readCache("rail") || EMBEDDED_RAIL;
  let check = readCache("rail-check");
  if (config.runsInApp || !check || now.getTime() - check.at > 6 * 3600000) {
    try {
      const head = request(RAIL_URL);
      head.method = "HEAD";
      await head.load();
      const h = headers(head.response);
      if (head.response.statusCode !== 200) throw new Error("TFI check unavailable");
      check = { at: now.getTime(), modified: h["last-modified"], etag: h.etag };
      saveCache("rail-check", check);
    } catch (e) { console.log(String(e)); }
  }
  let changed = Boolean(check && ((check.etag && data.sourceETag && check.etag !== data.sourceETag) || (check.modified && data.sourceLastModified && check.modified !== data.sourceLastModified)));
  if (config.runsInApp && (changed || dateKey(now) > data.validThrough)) {
    try {
      const r = request(RAIL_URL);
      r.timeoutInterval = 45;
      const archive = await r.load();
      if (r.response.statusCode !== 200) throw new Error("TFI download unavailable");
      const view = new WebView();
      await view.loadHTML("<html><body></body></html>");
      const code = "(" + unzipRail.toString() + ")(" + JSON.stringify(archive.toBase64String()) + ").then(files => (" + extractRailSchedule.toString() + ")(files)).then(value => completion({value})).catch(error => completion({error: String(error)}));";
      const result = await view.evaluateJavaScript(code, true);
      if (result.error) throw new Error(result.error);
      const h = headers(r.response);
      data = { ...result.value, retrievedAt: isoDay(dateKey(now)), sourceLastModified: h["last-modified"], sourceETag: h.etag };
      if (!data.validThrough || !data.routes) throw new Error("Invalid TFI timetable");
      saveCache("rail", data);
      changed = false;
    } catch (e) { console.log(String(e)); }
  }
  return { data, changed, unverified: !check || now.getTime() - check.at > 24 * 3600000 };
}

function text(parent, value, size, color = "ffffff", bold = false) {
  const item = parent.addText(String(value));
  item.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  item.textColor = new Color(color);
  item.lineLimit = 1;
  item.minimumScaleFactor = 0.75;
  return item;
}
function timer(parent, date) {
  const item = parent.addDate(date);
  item.applyTimerStyle();
  item.font = Font.semiboldMonospacedSystemFont(17);
  item.textColor = new Color("f8d574");
}
function scale(level) {
  const dc = new DrawContext();
  dc.size = new Size(170, 8);
  dc.opaque = false;
  dc.respectScreenScale = true;
  dc.setFillColor(new Color("394456"));
  dc.fillRect(new Rect(0, 0, 170, 8));
  dc.setFillColor(new Color("f8d574"));
  dc.fillRect(new Rect(0, 0, Math.max(2, level * 170), 8));
  return dc.getImage();
}
function trainRow(w, label, result) {
  text(w, label, 11, "b8c4d4");
  if (result.message) text(w, result.message, 17, "ffffff", true);
  else text(w, clock(result.departure) + " · " + dayLabel(result.departure) + " · " + (result.live ? "live" : "scheduled"), 17, "ffffff", true);
  w.addSpacer(5);
}
async function dashboard() {
  const started = new Date();
  const jobs = await Promise.allSettled([weather(started), daylight(started), timetable(started), railBoard("Sallins"), railBoard("Dublin Connolly"), luas("PAR", started), luas("ABB", started)]);
  jobs.forEach(j => { if (j.status === "rejected") console.log(String(j.reason)); });
  const [yr, sun, rail, sallins, connolly, parnell, abbey] = jobs.map(j => j.status === "fulfilled" ? j.value : null);
  const now = new Date(), w = new ListWidget();
  w.backgroundColor = new Color("142033");
  w.setPadding(13, 15, 12, 15);
  text(w, "DUBLIN  ·  " + dayLabel(now) + "  ·  " + clock(now), 11, "b8c4d4", true);
  w.addSpacer(6);
  text(w, yr ? Math.round(yr.temperature) + "°C  ·  feels " + Math.round(yr.feelsLike) + "°C" : "Yr weather unavailable", 23, "ffffff", true);
  const yrTime = yr?.updatedAt ? " · " + clock(new Date(yr.updatedAt)) : "";
  text(w, (yr ? (yr.description || "Conditions unavailable") + " · " : "") + "Yr · MET Norway" + yrTime + (yr?.stale ? " · cached" : ""), 11, "9eafc5");
  w.addSpacer(5);
  let event;
  if (sun) {
    event = nextLight(sun, now);
    const row = w.addStack();
    text(row, event ? event.name + " in  " : "Daylight unavailable", 13);
    if (event) timer(row, event.date);
    const today = sun.days.find(d => d.date === isoDay(dateKey(now)));
    if (today) {
      const bar = w.addStack();
      bar.centerAlignContent();
      text(bar, "Dark  ", 9, "9eafc5");
      const image = bar.addImage(scale(lightLevel(today, now)));
      image.imageSize = new Size(170, 8);
      text(bar, "  Bright", 9, "f8d574");
    }
  } else text(w, "Daylight unavailable", 13);
  w.addSpacer(8);
  trainRow(w, "SALLINS → HEUSTON · after 22:00 · direct", rail ? nextTrain(rail.data, "sallinsHeuston", now, sallins || [], rail.changed) : { message: "TFI timetable unavailable" });
  trainRow(w, "CONNOLLY → SALLINS · after 18:00 · direct", rail ? nextTrain(rail.data, "connollySallins", now, connolly || [], rail.changed) : { message: "TFI timetable unavailable" });
  const usableParnell = parnell && Math.abs(now - parnell.created) <= 3 * 60000 ? parnell : null;
  const usableAbbey = abbey && Math.abs(now - abbey.created) <= 3 * 60000 ? abbey : null;
  const { green, red } = connection(usableParnell, usableAbbey, now);
  text(w, "PARNELL · southbound Green Line", 11, "b8c4d4");
  text(w, green ? (green.dueNow ? "Due" : clock(green.arrival)) + " · " + green.destination : usableParnell ? "No tram forecast" : "Luas feed unavailable", 17, "ffffff", true);
  w.addSpacer(5);
  text(w, "ABBEY STREET → THE POINT · connecting tram", 11, "b8c4d4");
  text(w, red ? clock(red.arrival) + " · estimated connection" : !green ? "Awaiting Parnell tram" : usableAbbey ? "No connection in forecast" : "Luas feed unavailable", 17, "ffffff", true);
  text(w, "7 min from Parnell · via Marlborough", 9, "9eafc5");
  const messages = [parnell?.message, abbey?.message].filter(m => m && !/operating normally/i.test(m));
  if (messages.length) text(w, [...new Set(messages)].join(" · "), 9, "f8d574");
  w.addSpacer();
  const sources = w.addStack();
  text(sources, "NTA/TFI " + (rail?.data.retrievedAt || "") + (rail?.unverified ? " · unchecked" : ""), 8, "9eafc5");
  sources.addSpacer();
  text(sources, "Irish Rail · TII/Luas" + (usableParnell ? " " + clock(usableParnell.created) : ""), 8, "9eafc5");
  sources.addSpacer();
  text(sources, "SunCalc", 8, "9eafc5");
  text(w, "Automatic updates · timing controlled by iOS", 8, "9eafc5");
  let refresh = now.getTime() + 2 * 60000;
  if (event) refresh = Math.min(refresh, event.date.getTime() + 1000);
  if (green) refresh = Math.min(refresh, green.arrival.getTime() + 15000);
  w.refreshAfterDate = new Date(refresh);
  Script.setWidget(w);
  if (config.runsInApp) await w.presentLarge();
  Script.complete();
}

// Run the dashboard.
await dashboard();
