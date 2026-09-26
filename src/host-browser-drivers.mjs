// Adapters receive existing official host handles. They never launch or connect a browser.
import { requireValue, hash } from './core.mjs';

const roles = 'radio button|toggle button|menu item|check box|checkbox|checkBox|radioButton|menuItem|button|link|tab|switch|按钮|链接|复选框|单选按钮|标签页';
const control = new RegExp(`^\\s*(\\d+) (${roles})(?: \\([^)]*\\))? (?:Description: )?(.+)$`);
const reserved = /\b(delete|remove|send|submit|publish|pay|purchase|buy|install|upload|reset|restart|rollback|permissions?|authorize|grant|password)\b|删除|发送|提交|发布|支付|购买|安装|上传|重置|重启|回滚|权限|授权|密码/i;
// Host AX metadata is not part of a control's accessible name. Keep it for
// denial/risk checks and exact snapshot revalidation, never for broad matching.
const accessibleName = label => label.split(/(?:, |\s+)(?:Value|ID|Help|URL): /, 1)[0].trim();
const readOnlyPreview = /^Preview rollback (?:readiness|plan|details)$|^预览回滚(?:准备情况|计划|详情)$/i;
const match = (name, pattern) => {
  if (typeof pattern === 'string') return name === pattern;
  if (pattern instanceof RegExp) { pattern.lastIndex = 0; return pattern.test(name); }
  return false;
};
// Agent-supplied, reviewed equivalents for this surface only. Never infer
// authorization from a page's own translation dictionary or model response.
export function createLocalizedPolicy({ actions, denyNames = [] }) {
  requireValue(Array.isArray(actions) && actions.length > 0 && actions.length <= 40, 'INVALID_HOST_LOCALIZATION');
  const seen = new Set();
  const groups = actions.map(names => {
    requireValue(Array.isArray(names) && names.length > 0 && names.length <= 5, 'INVALID_HOST_LOCALIZATION');
    return names.map(name => {
      requireValue(typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 300 && !seen.has(name), 'INVALID_HOST_LOCALIZATION');
      seen.add(name); return name;
    });
  });
  const policy = { allowNames: groups.flat(), denyNames: [...denyNames], equivalentNames: groups };
  checkPolicy(policy); return policy;
}
// Bind to an identity observed through the official host. Select an exact
// subtree, not a footer string: AX may merge text or localize role names.
export function createWebScope({title, url}) {
  requireValue(typeof title==='string'&&title.trim().length>0&&typeof url==='string'&&url.trim().length>0,'HOST_WEB_IDENTITY_REQUIRED');
  requireValue(!/[\r\n]/.test(title+url),'INVALID_HOST_WEB_IDENTITY');
  return raw=>{
    requireValue(typeof raw==='string','INVALID_HOST_OBSERVATION');
    const lines=raw.split('\n'),roots=[];
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^([ \t]*)\d+ (?:HTML内容|HTML content|AXWebArea|WebArea|web area)(?: Description:)? (.*), URL: (.*?)\r?$/);
      if(m)roots.push({index:i,indent:m[1],title:m[2],url:m[3]});
    }
    requireValue(roots.length===1,'HOST_WEB_SCOPE_AMBIGUOUS');
    const root=roots[0];requireValue(root.title===title&&root.url===url,'HOST_WEB_IDENTITY_CHANGED');
    let end=root.index+1;
    for(;end<lines.length;end++){
      if(!lines[end].trim())continue;
      const indent=lines[end].match(/^[ \t]*/)[0];
      if(!indent.startsWith(root.indent)||indent.length<=root.indent.length)break;
    }
    return lines.slice(root.index,end).join('\n');
  };
}
export function semanticState(snapshot) {
  return snapshot.split('\n').filter(line => !/^The focused UI element is /.test(line))
    .map(line => line.replace(/^(\s*)\d+ /, '$1')).join('\n').trim();
}
function observation(raw, policy, scope) {
  requireValue(typeof raw === 'string', 'INVALID_HOST_OBSERVATION');
  const snapshot = scope ? scope(raw) : raw;
  requireValue(typeof snapshot === 'string' && snapshot.length > 0 && raw.includes(snapshot), 'INVALID_HOST_SCOPE');
  requireValue(snapshot.length <= 50000, 'HOST_OBSERVATION_TOO_LARGE');
  const entries = snapshot.split('\n').filter(line => !/\((?:disabled|unavailable)\)/i.test(line)).map(line => line.replace(/\r$/,'').match(control)).filter(Boolean)
    .map(m => ({ id: 'ax_' + m[1], text: accessibleName(m[3]), description: m[3].trim(), role: m[2], target: Number(m[1]), op: 'click' }));
  const counts = new Map(); for (const entry of entries) counts.set(entry.text, (counts.get(entry.text) || 0) + 1);
  const groups = policy.equivalentNames || [];
  const ambiguous = new Set(groups.filter(names => entries.filter(c => names.includes(c.text)).length > 1).flat());
  const candidates = entries.filter(c => counts.get(c.text) === 1 && !/\b(disabled|unavailable)\b|已停用|不可用/i.test(c.text))
    .filter(c => !ambiguous.has(c.text))
    .filter(c => policy.allowNames.some(p => match(c.text, p)) && !(policy.denyNames || []).some(p => match(c.text, p) || match(c.description, p) || groups.some(names => names.includes(c.text) && names.some(name => match(name,p)))))
    // Consequential labels always hand back, even if included in the host's allow list.
    .map(c => ({ ...c, requiresApproval: (reserved.test(c.description) && !(readOnlyPreview.test(c.text) && !reserved.test(c.description.slice(c.text.length)))) ||
      groups.some(names => names.includes(c.text) && names.some(name => reserved.test(name) && !readOnlyPreview.test(name))) }));
  requireValue(candidates.length <= 40, 'HOST_CANDIDATES_TOO_LARGE');
  return { snapshot, observedAt: Date.now(), candidates, semanticHash: hash(semanticState(snapshot)) };
}
function checkPolicy(policy) {
  requireValue(policy && Array.isArray(policy.allowNames) && policy.allowNames.length > 0 && policy.allowNames.length <= 100, 'HOST_ALLOWLIST_REQUIRED');
  requireValue([...policy.allowNames, ...(policy.denyNames || [])].every(p => typeof p === 'string' || p instanceof RegExp), 'INVALID_HOST_POLICY');
  if (policy.equivalentNames !== undefined) requireValue(Array.isArray(policy.equivalentNames) && policy.equivalentNames.length <= 40 &&
    policy.equivalentNames.every(g => Array.isArray(g) && g.length > 0 && g.length <= 5 && g.every(n => typeof n === 'string' && policy.allowNames.includes(n))) &&
    new Set(policy.equivalentNames.flat()).size === policy.equivalentNames.flat().length, 'INVALID_HOST_LOCALIZATION');
}
export function createChromeDriver({ tab, allowedOrigins, policy, scope }) {
  checkPolicy(policy);
  requireValue(tab?.ax && typeof tab.ax.get === 'function' && typeof tab.ax.click === 'function', 'UNSUPPORTED_CHROME_HOST');
  requireValue(Array.isArray(allowedOrigins) && allowedOrigins.length > 0 && allowedOrigins.every(x => { try { return new URL(x).origin === x; } catch { return false; } }), 'ALLOWED_ORIGINS_REQUIRED');
  return {
    kind: 'chrome',
    reobserveOnChange: Boolean(policy.equivalentNames?.length),
    async observe() {
      const raw = await tab.ax.get('state', { disableDiffing: true });
      const url = raw.match(/^Browser tab:.* URL: "([^"]+)"\./m)?.[1];
      requireValue(url && allowedOrigins.includes(new URL(url).origin), 'HOST_ORIGIN_CHANGED');
      return observation(raw, policy, scope);
    },
    async execute(action) { requireValue(action.op === 'click' && Number.isInteger(action.target), 'UNSUPPORTED_HOST_ACTION'); await tab.ax.click(action.target); },
  };
}
export function createComputerUseDriver({ sky, app, window, policy, scope, calculatorKeys }) {
  checkPolicy(policy);
  requireValue(calculatorKeys === undefined || window !== undefined, 'HOST_CALCULATOR_KEYS_UNSUPPORTED');
  if (window !== undefined) {
    requireValue(app === undefined && sky?.target === 'windows' && typeof sky.get_window_state === 'function' && typeof sky.click === 'function', 'UNSUPPORTED_COMPUTER_USE_HOST');
    requireValue(window && Number.isSafeInteger(window.id) && window.id > 0 && typeof window.app === 'string' && window.app.length > 0, 'HOST_WINDOW_IDENTITY_REQUIRED');
    requireValue(typeof scope === 'function', 'HOST_APP_SCOPE_REQUIRED');
    // Bind the selected window, not a mutable caller object or foreground app.
    const bound = Object.freeze({ id: window.id, app: window.app });
    let keys = null;
    if (calculatorKeys !== undefined) {
      // Explicit, reviewed one-key alternatives for a calculator only. Never
      // switch to keyboard input automatically after an uncertain click.
      requireValue(/(?:^|[\\/])(?:win32calc|CalculatorApp)\.exe$/i.test(bound.app) && typeof sky.press_key === 'function', 'HOST_CALCULATOR_KEYS_UNSUPPORTED');
      requireValue(calculatorKeys && typeof calculatorKeys === 'object' && !Array.isArray(calculatorKeys), 'INVALID_HOST_KEY_BINDINGS');
      keys = Object.freeze({ ...calculatorKeys });
      requireValue(Object.keys(keys).length > 0 && Object.keys(keys).length <= 20 && Object.entries(keys).every(([name,key]) => policy.allowNames.includes(name) && typeof key === 'string' && /^(?:[0-9]|plus|minus|asterisk|slash|period|Return)$/.test(key)), 'INVALID_HOST_KEY_BINDINGS');
    }
    let fresh = null;
    return {
      kind: 'computer-use',
      progressRecheck: keys ? 'calculator_keys' : null,
      reobserveOnChange: Boolean(policy.equivalentNames?.length),
      async observe() {
        fresh = null;
        const state = await sky.get_window_state({ window: { ...bound }, include_screenshot: !keys, include_text: true });
        requireValue(state?.window?.id === bound.id && state.window.app === bound.app, 'HOST_WINDOW_IDENTITY_CHANGED');
        // AX-only selection requires indexed tree evidence, never document text
        // or coordinates derived from an unavailable screenshot.
        const observed = observation(state.accessibility?.tree, policy, scope);
        if (keys) {
          observed.candidates = observed.candidates.filter(c => Object.hasOwn(keys,c.text));
          const raw=state.accessibility.tree;
          observed.progressSource={rawSemanticHash:hash(semanticState(raw)),rawChars:raw.length,scopedChars:observed.snapshot.length,rawSnapshot:raw.length<=50000?raw:null};
        }
        fresh = observed.candidates.map(c => ({ ...c }));
        return observed;
      },
      async execute(action) {
        const candidates = fresh; fresh = null;
        requireValue(action?.op === 'click' && Number.isSafeInteger(action.target) && action.target >= 0, 'UNSUPPORTED_HOST_ACTION');
        requireValue(candidates?.some(c => c.target === action.target && c.id === action.id && c.text === action.text && !c.requiresApproval), 'HOST_FRESH_ALLOWED_ACTION_REQUIRED');
        if (keys) await sky.press_key({ window: { ...bound }, key: keys[action.text] });
        else await sky.click({ window: { ...bound }, element_index: action.target });
      },
    };
  }
  requireValue(typeof app === 'string' && app.length > 0 && sky?.get_app_state && sky?.click, 'UNSUPPORTED_COMPUTER_USE_HOST');
  requireValue(typeof scope === 'function', 'HOST_APP_SCOPE_REQUIRED');
  return {
    kind: 'computer-use',
    reobserveOnChange: Boolean(policy.equivalentNames?.length),
    async observe() { const state = await sky.get_app_state({ app, disableDiff: true }); return observation(state.text, policy, scope); },
    async execute(action) { requireValue(action.op === 'click' && Number.isInteger(action.target), 'UNSUPPORTED_HOST_ACTION'); await sky.click({ app, element_index: action.target }); },
  };
}
