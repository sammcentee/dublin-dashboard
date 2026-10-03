import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const loader = fs.readFileSync(new URL('./Dublin Dashboard.js', import.meta.url), 'utf8');
const cachePath = '/phone/DublinDashboard/github-source.js';
const first = 'await Promise.resolve(); Script.setWidget("first"); Script.complete();';
const second = 'await Promise.resolve(); Script.setWidget("second"); Script.complete();';
const files = new Map();
const events = [];
let responseBody = first, statusCode = 200, offline = false;

const context = vm.createContext({
  console: { log() {} },
  FileManager: { local: () => ({
    documentsDirectory: () => '/phone',
    joinPath: (a, b) => a + '/' + b,
    fileExists: path => files.has(path),
    createDirectory: path => files.set(path, ''),
    readString: path => files.get(path),
    writeString: (path, code) => { events.push('save'); files.set(path, code); }
  }) },
  Request: class {
    constructor(url) { assert.equal(url, 'https://raw.githubusercontent.com/sammcentee/dublin-dashboard/main/dashboard.js'); }
    async loadString() {
      if (offline) throw new Error('offline');
      this.response = { statusCode };
      return responseBody;
    }
  },
  Script: {
    setWidget: value => events.push(value),
    complete: () => events.push('complete')
  }
});
const run = () => vm.runInContext('(async () => {\n' + loader + '\n})()', context);

await run();
assert.deepEqual(events, ['save', 'first', 'complete'], 'downloaded code can await and access Scriptable globals; cache is written before Script.complete');
assert.equal(files.get(cachePath), first);

events.length = 0;
responseBody = second;
await run();
assert.deepEqual(events, ['save', 'second', 'complete'], 'a later version replaces the cached source');

for (const failure of ['offline', '404', 'syntax']) {
  events.length = 0;
  offline = failure === 'offline';
  statusCode = failure === '404' ? 404 : 200;
  responseBody = failure === 'syntax' ? '<html>not JavaScript</html>' : '404: Not Found';
  await run();
  assert.deepEqual(events, ['second', 'complete'], failure + ' falls back to the saved script');
  assert.equal(files.get(cachePath), second, failure + ' does not overwrite the cache');
}

files.delete(cachePath);
offline = true;
await assert.rejects(run(), /connected to the internet/, 'first run requires a successful download');
console.log('PASS: GitHub updates, async execution, completion order, offline/404/syntax fallback, and first-run errors.');
