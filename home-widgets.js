// Compact Home Screen and Lock Screen widgets. Original code: MIT, copyright (c) 2026 Sam McEntee.
// Provider credits and licences: https://github.com/sammcentee/dublin-dashboard/blob/main/NOTICE.md
// The named phone loader supplies view: weather, trains or luas.
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "DublinDashboardHome");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
const savedData = fm.joinPath(folder, "data-source.js");
const AsyncFunction = (async function () {}).constructor;

function dataLibrary(source) {
  const end = source.indexOf("// Run the dashboard.");
  const cache = 'fm.joinPath(fm.documentsDirectory(), "DublinDashboard")';
  if (end < 0 || !source.includes(cache)) throw new Error("Dashboard data format changed");
  // Reuse the data functions without running the large widget or using its cache.
  const code = source.slice(0, end).replace(cache, 'fm.joinPath(fm.documentsDirectory(), "DublinDashboardHome")');
  return new AsyncFunction(code + "\nreturn {weather,daylight,nextLight,lightLevel,timetable,railBoard,nextTrain,luas,connection,clock,dayLabel,dateKey,isoDay,text,scale,freshnessColor};");
}
let api;
try {
  const request = new Request("https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/dashboard.js");
  request.timeoutInterval = 5;
  request.headers = { "Cache-Control": "no-cache" };
  const source = await request.loadString();
  if (request.response.statusCode !== 200) throw new Error("GitHub returned HTTP " + request.response.statusCode);
  api = await dataLibrary(source)();
  fm.writeString(savedData, source);
} catch (error) {
  console.log("Dashboard data update unavailable: " + String(error));
  if (!fm.fileExists(savedData)) throw new Error("Use the internet for the first run of this script.");
  api = await dataLibrary(fm.readString(savedData))();
}
const { text, clock } = api;
const circular = config.widgetFamily === "accessoryCircular";
const lockScreen = circular || config.widgetFamily === "accessoryRectangular";

async function results(jobs) {
  const settled = await Promise.allSettled(jobs);
  settled.forEach(job => { if (job.status === "rejected") console.log(String(job.reason)); });
  return settled.map(job => job.status === "fulfilled" ? job.value : null);
}
function header(widget, label, now, age) {
  const row = widget.addStack();
  row.centerAlignContent();
  text(row, label, lockScreen ? 8 : 10, "aeaeb2", true);
  row.addSpacer();
  const color = api.freshnessColor(age);
  if (lockScreen) freshnessMark(row, age);
  else text(row, "● ", 10, color, true);
  const elapsed = row.addDate(now);
  elapsed.applyTimerStyle();
  elapsed.font = Font.semiboldMonospacedSystemFont(lockScreen ? 7 : 9);
  elapsed.textColor = new Color(color);
  elapsed.lineLimit = 1;
  elapsed.minimumScaleFactor = 0.75;
  widget.addSpacer(lockScreen ? 1 : 2);
}
function freshnessMark(row, age) {
  // Lock Screen tint hides the freshness colors, so old or missing data also changes the symbol.
  text(row, !Number.isFinite(age) ? "?" : age >= 5 * 60000 ? "!" : "●", 6, api.freshnessColor(age), true);
}

const started = new Date();
const w = new ListWidget();
if (!lockScreen) w.backgroundColor = new Color("1c1c1e");
// A centered 46 pt square fits inside Apple's smallest listed 68 pt circle.
w.setPadding(...(circular ? [11, 11, 11, 11] : lockScreen ? [4, 5, 4, 5] : [6, 8, 6, 8]));
if (circular) w.addSpacer();
let event, green;

if (view === "weather") {
  const [yr, sun] = await results([api.weather(started), api.daylight(started)]);
  const now = new Date();
  if (lockScreen) {
    const row = w.addStack();
    row.centerAlignContent();
    text(row, yr ? Math.round(yr.temperature) + "°" : "—", 14, "f2f2f7", true);
    row.addSpacer();
    freshnessMark(row, yr ? now - yr.fetchedAt : Infinity);
    const condition = [[/thunder/i, "Storm"], [/sleet/i, "Sleet"], [/snow/i, "Snow"], [/rain/i, "Rain"],
      [/fog|mist/i, "Fog"], [/cloud/i, "Cloud"], [/clear|fair/i, "Clear"], [/sun/i, "Sun"]]
      .find(([pattern]) => pattern.test(yr?.description || ""))?.[1] || "?";
    text(w, yr ? "F" + Math.round(yr.feelsLike) + "° " + condition : "No data", 7.5, "aeaeb2");
    event = sun && api.nextLight(sun, now);
    if (event) {
      const countdown = w.addStack();
      text(countdown, event.name === "Bright again" ? "B" : "D", 7, "b7a17a");
      countdown.addSpacer(2);
      const timer = countdown.addDate(event.date);
      timer.applyTimerStyle();
      timer.font = Font.semiboldMonospacedSystemFont(7);
      timer.textColor = new Color("b7a17a");
      timer.lineLimit = 1;
      timer.minimumScaleFactor = 0.75;
    } else text(w, "Light ?", 7, "b7a17a");
    const today = sun?.days.find(day => day.date === api.isoDay(api.dateKey(now)));
    if (today) {
      w.addSpacer(1);
      w.addImage(api.scale(api.lightLevel(today, now))).imageSize = new Size(40, 2);
    }
  } else {
    header(w, "Yr", now, yr ? now.getTime() - yr.fetchedAt : Infinity);
    const temperature = w.addStack();
    temperature.centerAlignContent();
    text(temperature, yr ? Math.round(yr.temperature) + "°" : "Unavailable", yr ? 22 : 13, "f2f2f7", true);
    if (yr) {
      temperature.addSpacer();
      const feels = temperature.addStack();
      feels.layoutVertically();
      text(feels, "Feels like", 9, "aeaeb2");
      text(feels, Math.round(yr.feelsLike) + "°", 12, "aeaeb2", true);
      text(w, yr.description || "Conditions unavailable", 9, "aeaeb2").lineLimit = 2;
    }
    w.addSpacer(2);
    event = sun && api.nextLight(sun, now);
    if (event) {
      const row = w.addStack();
      text(row, event.name === "Bright again" ? "Bright in " : "Dark in ", 9, "b7a17a");
      const countdown = row.addDate(event.date);
      countdown.applyTimerStyle();
      countdown.font = Font.semiboldMonospacedSystemFont(11);
      countdown.textColor = new Color("b7a17a");
      countdown.lineLimit = 1;
      countdown.minimumScaleFactor = 0.75;
    } else text(w, "Daylight unavailable", 10, "b7a17a");
    const today = sun?.days.find(day => day.date === api.isoDay(api.dateKey(now)));
    if (today) {
      w.addSpacer(2);
      w.addImage(api.scale(api.lightLevel(today, now))).imageSize = new Size(90, 2);
    }
    w.addSpacer();
    text(w, "MET Norway", 8, "8e8e93");
  }
} else if (view === "trains") {
  const [rail, sallins, connolly] = await results([api.timetable(started), api.railBoard("Sallins"), api.railBoard("Dublin Connolly")]);
  const now = new Date();
  const age = rail && !rail.unverified && sallins && connolly ? now - started : Infinity;
  if (lockScreen) {
    const row = w.addStack();
    text(row, api.dayLabel(now).replace(/^\S+\s+/, ""), 7, "aeaeb2", true);
    row.addSpacer();
    freshnessMark(row, age);
    w.addSpacer(1);
  } else header(w, api.dayLabel(now).replace(/^\S+\s+/, ""), now, age);
  for (const [route, label, board] of [
    ["sallinsHeuston", "Sallins → Heuston", sallins],
    ["connollySallins", "Connolly → Sallins", connolly]
  ]) {
    const train = rail ? api.nextTrain(rail.data, route, now, board || []) : { message: "Timetable unavailable" };
    if (lockScreen) {
      const row = w.addStack();
      row.centerAlignContent();
      text(row, route === "sallinsHeuston" ? "SH" : "CS", 6.5, "8eafcf", true);
      row.addSpacer();
      const value = train.departure ? (train.live ? "" : "~") + clock(train.departure) :
        /unavailable|refresh/i.test(train.message) ? "?" : "—";
      text(row, value, 11.5, "8eafcf", true);
    } else {
      text(w, label, 10, "8eafcf", true);
      if (train.departure) {
        const row = w.addStack();
        row.centerAlignContent();
        text(row, clock(train.departure), 18, "8eafcf", true);
        row.addSpacer();
        text(row, train.live ? "live" : "scheduled", 8, "8e8e93");
      } else {
        const message = train.message === "TFI timetable needs refresh" ? "Refresh timetable" : train.message === "No direct service today" ? "No service today" : train.message;
        text(w, message, 10, "8eafcf", true).lineLimit = 2;
      }
    }
    w.addSpacer(1);
  }
  if (!lockScreen) {
    w.addSpacer();
    text(w, "NTA · Irish Rail" + (rail?.unverified ? " · old" : ""), 8, "8e8e93");
  }
} else if (view === "luas") {
  const feeds = await results([api.luas("PAR", started), api.luas("ABB", started)]);
  const now = new Date();
  const [parnell, abbey] = feeds.map(feed => feed && Math.abs(now - feed.created) <= 3 * 60000 ? feed : null);
  const connection = api.connection(parnell, abbey, now);
  green = connection.green;
  const red = connection.red;
  const messages = feeds.map(feed => feed?.message).filter(message => message && !/operating normally/i.test(message));
  header(w, "TII/Luas" + (lockScreen && messages.length ? " !" : ""), now, parnell && abbey ? now - Math.min(parnell.created.getTime(), abbey.created.getTime()) : Infinity);
  for (const [label, value, color] of [
    ["Parnell", green ? green.dueNow ? "Due" : clock(green.arrival) : parnell ? "No forecast" : "Unavailable", "8cba9a"],
    ["Abbey St → Point", red ? clock(red.arrival) : abbey ? "No connection" : "Unavailable", "c99a9a"]
  ]) {
    const stop = w.addStack();
    stop.centerAlignContent();
    text(stop, lockScreen && label !== "Parnell" ? "Abbey → Point" : label, lockScreen ? 9 : 10, color, true);
    stop.addSpacer();
    const display = lockScreen ? value === "Unavailable" ? "?" : /^No /.test(value) ? "—" :
      label !== "Parnell" && red ? "~" + value : value : value;
    text(stop, display, lockScreen ? 16 : /^\d\d:\d\d$/.test(value) || value === "Due" ? 22 : 11, color, true);
    if (!lockScreen && label !== "Parnell" && red) {
      stop.addSpacer(4);
      text(stop, "Est.", 9, "8e8e93");
    }
    w.addSpacer(lockScreen ? 1 : 4);
  }
  if (!lockScreen) {
    w.addSpacer(3);
    if (messages.length) text(w, "Service alert", 10, "ff9f0a");
    w.addSpacer();
  }
}
if (circular) w.addSpacer();
let refresh = Date.now() + 2 * 60000;
if (event) refresh = Math.min(refresh, event.date.getTime() + 1000);
if (green) refresh = Math.min(refresh, green.arrival.getTime() + 15000);
w.refreshAfterDate = new Date(refresh);
Script.setWidget(w);
if (config.runsInApp) {
  if (circular) await w.presentAccessoryCircular();
  else if (lockScreen) await w.presentAccessoryRectangular();
  else if (view !== "luas") await w.presentSmall();
  else await w.presentMedium();
}
Script.complete();
