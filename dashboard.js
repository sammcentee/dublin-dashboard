// Dublin Dashboard — use a LARGE Scriptable widget.
// Updates automatically when iOS refreshes the widget. No accounts or API keys are required.
// Original project code: MIT License, copyright (c) 2026 Sam McEntee.
// Data sources and separate licences: https://github.com/sammcentee/dublin-dashboard/blob/main/NOTICE.md
// Weather: MET Norway / Yr; rain: Open-Meteo.com; rail: NTA / TFI and Irish Rail; Luas: TII.
// Daylight calculations: adapted from SunCalc under BSD-2-Clause; notice retained below.
const TZ = "Europe/Dublin";
const YR = "https://www.yr.no/en/forecast/daily-table/2-2964574/Ireland/Leinster/Dublin%20City/Dublin";
const RAIL_URL = "https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/rail.json";
const EMBEDDED_RAIL = {"source":"https://www.transportforireland.ie/transitData/Data/GTFS_Irish_Rail.zip","sourceInfoUrl":"https://www.transportforireland.ie/transitData/PT_Data.html","retrievedAt":"2026-10-04","feedVersion":"892A3408-F422-4978-8896-7420CF625122","feedStart":"20261003","feedEnd":"20271003","sourceLastModified":"Sat, 03 Oct 2026 22:15:56 GMT","sourceETag":"\"75b285-65cf6fe27df00\"","timezone":"Europe/Dublin","routes":{"sallinsHeuston":[{"departure":"22:11:00","arrival":"22:46:00","serviceId":"216","tripId":"5936_11751","destination":"Dublin Heuston","trainCode":"P227"},{"departure":"22:29:00","arrival":"22:52:00","serviceId":"195","tripId":"5936_13185","destination":"Dublin Heuston","trainCode":"A531"},{"departure":"23:09:00","arrival":"23:42:00","serviceId":"203","tripId":"5936_11770","destination":"Dublin Heuston","trainCode":"P229"},{"departure":"23:44:00","arrival":"24:17:00","serviceId":"65","tripId":"5936_11791","destination":"Dublin Heuston","trainCode":"P229"}],"connollySallins":[{"departure":"18:32:00","arrival":"19:23:00","serviceId":"180","tripId":"5936_11923","destination":"Newbridge","trainCode":"D419"}]},"services":{"65":{"start":"20261003","end":"20261003","weekdays":"0000010","exceptions":{}},"180":{"start":"20261002","end":"20261211","weekdays":"1111100","exceptions":{"20261026":2}},"195":{"start":"20261002","end":"20261212","weekdays":"1111110","exceptions":{"20261026":2}},"203":{"start":"20261002","end":"20261212","weekdays":"1111110","exceptions":{"20261003":2,"20261026":2}},"216":{"start":"20261002","end":"20261212","weekdays":"1111110","exceptions":{}}},"validThrough":"20261212","attribution":"Timetable data: National Transport Authority, CC BY 4.0. Timetable snapshot; not a live service guarantee.","checkedAt":1791111945903};
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
  // Yr's first day interval covers only the rest of today.
  const today = state.queries.find(q => q.queryKey[0] === "forecast")?.state.data?.dayIntervals?.[0]?.temperature;
  const range = [data.temperature.value, today?.min, today?.max].filter(Number.isFinite);
  return { temperature: data.temperature.value, feelsLike: data.temperature.feelsLike, description, symbol: data.symbolCode?.next1Hour || null, low: Math.min(...range), high: Math.max(...range) };
}
// Yr for the phone's location, or Dublin if no location is known.
async function weather(now, place) {
  const url = place ? "https://www.yr.no/en/forecast/daily-table/" + place.latitude.toFixed(3) + "," + place.longitude.toFixed(3) : YR;
  const old = readCache("weather");
  // Reuse for less than 5 minutes, so the refresh dot stays green only for fresh data.
  if (old && old.url === url && now.getTime() - old.fetchedAt < 4 * 60000) return old;
  try {
    const result = { ...parseYr(await request(url).loadString()), url, fetchedAt: now.getTime() };
    // Keep today's earlier values so the low and high cover the whole day.
    const seen = readCache("temperature-range"), day = dateKey(now);
    if (seen?.day === day) {
      result.low = Math.min(result.low, seen.low);
      result.high = Math.max(result.high, seen.high);
    }
    saveCache("temperature-range", { day, low: result.low, high: result.high });
    saveCache("weather", result);
    return result;
  } catch (e) {
    console.log(String(e));
    return old && old.low !== undefined && now.getTime() - old.fetchedAt < 60 * 60000 ? { ...old, stale: true } : null;
  }
}
// The phone's location, or the last known one.
async function position() {
  let place = readCache("location");
  try {
    Location.setAccuracyToHundredMeters();
    const found = await Promise.race([Location.current(), new Promise((_, reject) => Timer.schedule(5000, false, () => reject(new Error("Location timed out"))))]);
    place = { latitude: found.latitude, longitude: found.longitude };
    saveCache("location", place);
  } catch (e) { console.log(String(e)); }
  return place;
}
// Rain in the next 60 minutes at the phone's location: Open-Meteo 15-minute model forecast, not radar.
async function rain(now, place) {
  if (!place) return { message: "Rain check needs location" };
  const data = await request("https://api.open-meteo.com/v1/forecast?latitude=" + place.latitude.toFixed(3) + "&longitude=" + place.longitude.toFixed(3) +
    "&minutely_15=precipitation&forecast_minutely_15=6&timeformat=unixtime").loadJSON();
  // Each value is the rain in the 15 minutes before its time.
  const { time, precipitation } = data.minutely_15;
  const i = time.findIndex((t, k) => t * 1000 > now.getTime() && (t - 900) * 1000 < now.getTime() + 60 * 60000 && precipitation[k] >= 0.1);
  return { start: i === -1 ? null : new Date(Math.max(now.getTime(), (time[i] - 900) * 1000)) };
}
function weatherSymbol(code) {
  const night = /_night$/.test(code);
  return /thunder/.test(code) ? "cloud.bolt.rain.fill" : /snow/.test(code) ? "cloud.snow.fill" : /sleet/.test(code) ? "cloud.sleet.fill" :
    /^heavyrain/.test(code) ? "cloud.heavyrain.fill" : /rainshowers/.test(code) ? (night ? "cloud.moon.rain.fill" : "cloud.sun.rain.fill") :
    /^lightrain/.test(code) ? "cloud.drizzle.fill" : /rain/.test(code) ? "cloud.rain.fill" : /fog/.test(code) ? "cloud.fog.fill" :
    /^(fair|partlycloudy)/.test(code) ? (night ? "cloud.moon.fill" : "cloud.sun.fill") :
    /^clearsky/.test(code) ? (night ? "moon.stars.fill" : "sun.max.fill") : "cloud.fill";
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
function nextTrain(data, route, now, board = []) {
  const key = dateKey(now);
  if (key < data.feedStart || key > data.validThrough) return { message: "TFI timetable needs refresh" };
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
// Minutes from Abbey Street to PartnerRe, The Exchange, George's Dock: scheduled TFI ride plus OpenStreetMap walk.
// The Point trams: George's Dock stop, then 87 m. Connolly trams: Busáras stop, then 392 m.
const WORK_MINUTES = { "The Point": 6, "Connolly": 9 };
function connections(parnell, abbey, now) {
  const upcoming = (feed, match) => (feed?.trams || []).filter(match).map(t => t.dueNow && now - feed.created < 60000 ? { ...t, arrival: new Date(now) } : t).filter(t => t.arrival >= now);
  const reds = upcoming(abbey, t => t.direction === "Inbound" && t.destination in WORK_MINUTES);
  return upcoming(parnell, t => t.direction === "Outbound").slice(0, 5).map(green => {
    const red = reds.find(t => t.arrival - green.arrival >= 5 * 60000);
    return { green, red, work: red && new Date(red.arrival.getTime() + WORK_MINUTES[red.destination] * 60000) };
  });
}

async function timetable(now) {
  let data = readCache("rail");
  if (!data || (data.checkedAt || 0) < (EMBEDDED_RAIL.checkedAt || 0)) data = EMBEDDED_RAIL;
  const check = readCache("rail-fetch");
  if (config.runsInApp || !check || now.getTime() - check.at >= 3600000) {
    saveCache("rail-fetch", { at: now.getTime() });
    try {
      const r = request(RAIL_URL);
      const value = await r.loadJSON();
      if (r.response.statusCode !== 200) throw new Error("TFI download unavailable");
      if (value.timezone !== TZ || !/^\d{8}$/.test(value.feedStart) || !/^\d{8}$/.test(value.validThrough) ||
          !Array.isArray(value.routes?.sallinsHeuston) || !Array.isArray(value.routes?.connollySallins) || !value.services ||
          !Number.isFinite(value.checkedAt) || value.checkedAt <= 0 || value.checkedAt > now.getTime() + 5 * 60000) throw new Error("Invalid TFI timetable");
      if (value.checkedAt >= (data.checkedAt || 0)) {
        data = value;
        saveCache("rail", data);
      }
    } catch (e) { console.log(String(e)); }
  }
  return { data, unverified: !data.checkedAt || now.getTime() - data.checkedAt > 24 * 3600000 };
}

function text(parent, value, size, color = "f2f2f7", bold = false) {
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
  item.textColor = new Color("b7a17a");
}
function freshnessColor(age) {
  return age < 5 * 60000 ? "30d158" : "ff453a";
}
function scale(level) {
  const dc = new DrawContext();
  dc.size = new Size(170, 6);
  dc.opaque = false;
  dc.respectScreenScale = true;
  dc.setFillColor(new Color("3a3a3c"));
  dc.fillRect(new Rect(0, 0, 170, 6));
  dc.setFillColor(new Color("9f8d6c"));
  dc.fillRect(new Rect(0, 0, Math.max(2, level * 170), 6));
  return dc.getImage();
}
// Muted colours for actual temperatures (°C), from cold to hot.
const TEMPERATURE_COLORS = [[-5, "8e9be0"], [3, "7fb0dc"], [9, "7cc2b5"], [14, "a9c47c"], [19, "e0c063"], [24, "e39b5b"], [29, "d96c5b"]];
function temperatureColor(t) {
  const i = TEMPERATURE_COLORS.findIndex(([v]) => v >= t);
  if (i === 0) return TEMPERATURE_COLORS[0][1];
  if (i === -1) return TEMPERATURE_COLORS[TEMPERATURE_COLORS.length - 1][1];
  const [[v0, c0], [v1, c1]] = [TEMPERATURE_COLORS[i - 1], TEMPERATURE_COLORS[i]], f = (t - v0) / (v1 - v0);
  return [0, 2, 4].map(j => Math.round(parseInt(c0.slice(j, j + 2), 16) * (1 - f) + parseInt(c1.slice(j, j + 2), 16) * f).toString(16).padStart(2, "0")).join("");
}
// Temperature gauge in the style of Apple Weather: a 3/4 ring from today's low to high.
function temperatureRing(yr) {
  const size = 60, c = size / 2, r = 25, width = 5, start = 0.75 * Math.PI, sweep = 1.5 * Math.PI;
  const point = f => new Point(c + r * Math.cos(start + f * sweep), c + r * Math.sin(start + f * sweep));
  const dc = new DrawContext();
  dc.size = new Size(size, size);
  dc.opaque = false;
  dc.respectScreenScale = true;
  for (let i = 0; i <= 120; i++) {
    const p = point(i / 120);
    dc.setFillColor(new Color(temperatureColor(yr.low + (yr.high - yr.low) * i / 120)));
    dc.fillEllipse(new Rect(p.x - width / 2, p.y - width / 2, width, width));
  }
  const marker = point(yr.high > yr.low ? Math.min(1, Math.max(0, (yr.temperature - yr.low) / (yr.high - yr.low))) : 0.5);
  dc.setFillColor(new Color("1c1c1e"));
  dc.fillEllipse(new Rect(marker.x - 5, marker.y - 5, 10, 10));
  dc.setFillColor(new Color("f2f2f7"));
  dc.fillEllipse(new Rect(marker.x - 3, marker.y - 3, 6, 6));
  dc.setTextAlignedCenter();
  dc.setFont(Font.semiboldSystemFont(19));
  dc.setTextColor(new Color("f2f2f7"));
  dc.drawTextInRect(Math.round(yr.temperature) + "°", new Rect(0, c - 12, size, 24));
  dc.setFont(Font.semiboldSystemFont(10));
  dc.setTextColor(new Color("8e8e93"));
  dc.drawTextInRect(String(Math.round(yr.low)), new Rect(c - 21, size - 13, 18, 13));
  dc.drawTextInRect(String(Math.round(yr.high)), new Rect(c + 3, size - 13, 18, 13));
  return dc.getImage();
}
function trainRow(w, label, result) {
  text(w, label, 11, "8eafcf");
  if (result.message) text(w, result.message, 17, "8eafcf", true);
  else text(w, clock(result.departure) + " · " + dayLabel(result.departure) + " · " + (result.live ? "live" : "scheduled"), 17, "8eafcf", true);
  w.addSpacer(5);
}
async function dashboard() {
  const started = new Date(), place = await position();
  const jobs = await Promise.allSettled([weather(started, place), daylight(started), timetable(started), railBoard("Sallins"), railBoard("Dublin Connolly"), luas("PAR", started), luas("ABB", started), rain(started, place)]);
  jobs.forEach(j => { if (j.status === "rejected") console.log(String(j.reason)); });
  const [yr, sun, rail, sallins, connolly, parnell, abbey, wet] = jobs.map(j => j.status === "fulfilled" ? j.value : null);
  const now = new Date(), w = new ListWidget();
  const usableParnell = parnell && Math.abs(now - parnell.created) <= 3 * 60000 ? parnell : null;
  const usableAbbey = abbey && Math.abs(now - abbey.created) <= 3 * 60000 ? abbey : null;
  const dataAge = !rail || rail.unverified || !sallins || !connolly ? Infinity :
    now.getTime() - Math.min(yr?.fetchedAt || 0, usableParnell?.created.getTime() || 0, usableAbbey?.created.getTime() || 0);
  const statusColor = freshnessColor(dataAge);
  w.backgroundColor = new Color("1c1c1e");
  w.setPadding(13, 15, 12, 15);
  const header = w.addStack();
  header.centerAlignContent();
  if (yr) {
    header.addImage(temperatureRing(yr)).imageSize = new Size(60, 60);
    header.addSpacer(10);
    const info = header.addStack();
    info.layoutVertically();
    const condition = info.addStack();
    condition.centerAlignContent();
    if (yr.symbol) {
      const icon = condition.addImage(SFSymbol.named(weatherSymbol(yr.symbol)).image);
      icon.imageSize = new Size(20, 20);
      icon.tintColor = new Color("f2f2f7");
      condition.addSpacer(6);
    }
    text(condition, (yr.description || "Conditions unavailable") + (yr.stale ? " · cached" : ""), 14, "f2f2f7", true).lineLimit = 2;
    info.addSpacer(3);
    text(info, "Feels " + Math.round(yr.feelsLike) + "°C", 13, "8e8e93");
  } else text(header, "Yr weather unavailable", 23, "f2f2f7", true);
  header.addSpacer();
  const freshness = header.addStack();
  freshness.centerAlignContent();
  freshness.backgroundColor = new Color("2c2c2e");
  freshness.cornerRadius = 9;
  freshness.setPadding(5, 8, 5, 8);
  // Widgets cannot animate, so old data gets a still red outline instead of a flash.
  if (statusColor === "ff453a") {
    freshness.borderColor = new Color("ff453a", 0.6);
    freshness.borderWidth = 1.5;
  }
  text(freshness, "●", 22, statusColor, true);
  freshness.addSpacer(6);
  const refreshed = freshness.addStack();
  refreshed.layoutVertically();
  text(refreshed, "REFRESHED " + clock(now), 8, "aeaeb2", true);
  const elapsed = refreshed.addDate(now);
  elapsed.applyTimerStyle();
  elapsed.font = Font.semiboldMonospacedSystemFont(17);
  elapsed.textColor = new Color(statusColor);
  w.addSpacer(6);
  const rainRow = w.addStack();
  rainRow.centerAlignContent();
  if (wet?.start) {
    const umbrella = rainRow.addImage(SFSymbol.named("umbrella.fill").image);
    umbrella.imageSize = new Size(14, 14);
    umbrella.tintColor = new Color("7fb0dc");
    rainRow.addSpacer(5);
    text(rainRow, wet.start <= now ? "Rain now" : "Rain from " + clock(wet.start), 13, "7fb0dc", true);
  } else text(rainRow, wet ? wet.message || "Dry next hour" : "Rain forecast unavailable", 12, "8e8e93");
  w.addSpacer(5);
  let event;
  if (sun) {
    event = nextLight(sun, now);
    const row = w.addStack();
    text(row, event ? event.name + " in  " : "Daylight unavailable", 13, "b7a17a");
    if (event) timer(row, event.date);
    const today = sun.days.find(d => d.date === isoDay(dateKey(now)));
    if (today) {
      const bar = w.addStack();
      bar.centerAlignContent();
      text(bar, "Dark  ", 9, "8e8e93");
      const image = bar.addImage(scale(lightLevel(today, now)));
      image.imageSize = new Size(170, 6);
      text(bar, "  Bright", 9, "b7a17a");
    }
  } else text(w, "Daylight unavailable", 13);
  w.addSpacer(8);
  trainRow(w, "SALLINS → HEUSTON · after 22:00 · direct", rail ? nextTrain(rail.data, "sallinsHeuston", now, sallins || []) : { message: "TFI timetable unavailable" });
  trainRow(w, "CONNOLLY → SALLINS · after 18:00 · direct", rail ? nextTrain(rail.data, "connollySallins", now, connolly || []) : { message: "TFI timetable unavailable" });
  const trips = connections(usableParnell, usableAbbey, now);
  const head = w.addStack();
  text(head, "PARNELL", 11, "8cba9a");
  text(head, "  →  ABBEY ST", 11, "c99a9a");
  text(head, "  →  WORK", 11, "f4b183");
  head.addSpacer();
  text(head, "5 min transfer · estimated", 9, "8e8e93");
  if (!trips.length) text(w, usableParnell ? "No tram forecast" : "Luas feed unavailable", 15, "8cba9a", true);
  for (const { green, red, work } of trips) {
    const row = w.addStack();
    row.centerAlignContent();
    text(row, green.dueNow ? "Due  " : clock(green.arrival), 15, "8cba9a").font = Font.semiboldMonospacedSystemFont(15);
    text(row, "  →  ", 13, "8e8e93");
    if (red) {
      text(row, clock(red.arrival), 15, "c99a9a").font = Font.semiboldMonospacedSystemFont(15);
      text(row, "  " + red.destination, 11, "c99a9a");
      text(row, "  →  ", 13, "8e8e93");
      text(row, clock(work), 15, "f4b183").font = Font.semiboldMonospacedSystemFont(15);
    } else text(row, usableAbbey ? "No connection in forecast" : "Luas feed unavailable", 13, "c99a9a", true);
  }
  const messages = [parnell?.message, abbey?.message].filter(m => m && !/operating normally/i.test(m));
  if (messages.length) text(w, [...new Set(messages)].join(" · "), 9, "ff9f0a");
  w.addSpacer();
  let refresh = now.getTime() + 2 * 60000;
  if (event) refresh = Math.min(refresh, event.date.getTime() + 1000);
  if (trips.length) refresh = Math.min(refresh, trips[0].green.arrival.getTime() + 15000);
  w.refreshAfterDate = new Date(refresh);
  Script.setWidget(w);
  if (config.runsInApp) await w.presentLarge();
  Script.complete();
}

// Run the dashboard.
await dashboard();
