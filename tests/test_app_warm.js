// tests/test_app_warm.js
// App-level guard: Shared-Part cold preparation is scheduled on site load.
const fs = require('fs');
const path = require('path');

const mounted = [];
let warmCalls = 0;
let bankCalls = 0;
let bankNeeded = 0;

global.window = {
  similaritiesData: [{ id: 1, verses: [] }],
  SharedPartIndex: {},
  DiffEngine: {
    _getSharedPartIndex() {
      warmCalls++;
      return {
        questionBank(_settings, needed) {
          bankCalls++;
          bankNeeded = needed;
          return [];
        }
      };
    }
  },
  pageJuzMap: { totalPages: 604, byGid: {} },
  requestIdleCallback(fn) {
    fn();
    return 1;
  },
  cancelIdleCallback() {}
};

global.requestIdleCallback = window.requestIdleCallback;
global.cancelIdleCallback = window.cancelIdleCallback;
global.localStorage = { getItem() { return null; }, setItem() {} };
global.document = { documentElement: { classList: { toggle() {} } } };
global.alert = () => {};

global.Vue = {
  ref: value => ({ value }),
  computed: fn => ({ get value() { return fn(); } }),
  onMounted: fn => mounted.push(fn),
  watch() {},
  createApp: options => ({ mount() { options.setup(); } })
};

const root = path.resolve(__dirname, '..');
eval(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'));

Promise.resolve(mounted[0]()).then(() => {
  if (warmCalls !== 1 || bankCalls !== 1 || bankNeeded < 120) {
    console.log(`  x site load should warm shared-part bank, warmCalls=${warmCalls}, bankCalls=${bankCalls}, needed=${bankNeeded}`);
    process.exit(1);
  }
  console.log('app) Shared-Part bank warms on site load');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
