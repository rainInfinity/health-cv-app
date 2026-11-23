// 消费真实页面反馈Hook，验证离页和后台只清理持有的Toast，不清掉其他操作。
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

test('页面失焦或后台清理自身Toast，迟到清理不关闭替换后的提示', () => {
  const slots = []; let cursor = 0, effects = [], focused = true, listener, next = 0, active = null;
  const removed = [];
  const feedback = {
    showToast() { active = ++next; return active; },
    dismissToast(id) { removed.push(id); if (active === id) active = null; },
    replaceToast(id) { if (active !== id) return null; active = ++next; return active; },
  };
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = value; }]; },
    useCallback(callback) { return callback; },
    useEffect(create, deps) {
      const i = cursor++, previous = slots[i];
      if (previous?.deps.length === deps.length && previous.deps.every((value, index) => Object.is(value, deps[index]))) return;
      slots[i] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = create(); });
    },
  };
  const file = path.resolve(__dirname, '../node_modules/.cache/native-test/shared/components/FeedbackHost/usePageToast.js');
  delete require.cache[file];
  const original = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'react') return react;
    if (request === 'react-native') return { AppState: { currentState: 'active', addEventListener(_, callback) { listener = callback; return { remove() {} }; } } };
    if (request === '@react-navigation/native') return { useIsFocused: () => focused };
    if (request === './FeedbackHost') return { useFeedback: () => feedback };
    return original.call(this, request, parent, isMain);
  };
  let usePageToast;
  try { usePageToast = require(file).usePageToast; } finally { Module._load = original; }
  function render() { cursor = 0; const page = usePageToast(); const pending = effects; effects = []; pending.forEach((effect) => effect()); return page; }
  let page = render();
  page.show({ tone: 'loading', message: '刷新中' }); const oldId = active;
  feedback.showToast({ tone: 'error', message: '其他操作' }); const replacement = active;
  const oldCleanup = page.dismiss;
  focused = false; page = render();
  assert.ok(removed.includes(oldId)); assert.equal(active, replacement);
  oldCleanup(); assert.equal(active, replacement);
  focused = true; page = render();
  page.show({ tone: 'loading', message: '等待结果' }); const waiting = active;
  listener('background');
  assert.ok(removed.includes(waiting)); assert.equal(active, null);
  page = render(); page.show({ tone: 'error', message: '后台旧错误' }); assert.equal(active, null);
  listener('active'); page = render(); assert.equal(active, null);
  for (const slot of slots) slot?.cleanup?.();
});
