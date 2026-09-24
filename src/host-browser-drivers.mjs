// Adapters receive existing official host handles. They never launch or connect a browser.
import { requireValue, hash } from './core.mjs';

const roles = 'radio button|toggle button|menu item|check box|checkbox|checkBox|radioButton|menuItem|button|link|tab|switch|按钮|链接|复选框|单选按钮|标签页';
const control = new RegExp(`^\\s*(\\d+) (${roles})(?: \\([^)]*\\))? (?:Description: )?(.+)$`);
const reserved = /\b(delete|remove|send|submit|publish|pay|purchase|buy|install|upload|reset|restart|rollback|permissions?|authorize|grant|password)\b|删除|发送|提交|发布|支付|购买|安装|上传|重置|重启|回滚|权限|授权|密码/i;
const match = (name, pattern) => {
  if (typeof pattern === 'string') return name === pattern;
  if (pattern instanceof RegExp) { pattern.lastIndex = 0; return pattern.test(name); }
  return false;
};
export function semanticState(snapshot) {
  return snapshot.split('\n').filter(line => !/^The focused UI element is /.test(line))
    .map(line => line.replace(/^(\s*)\d+ /, '$1')).join('\n').trim();
}
function observation(raw, policy, scope) {
  requireValue(typeof raw === 'string', 'INVALID_HOST_OBSERVATION');
  const snapshot = scope ? scope(raw) : raw;
  requireValue(typeof snapshot === 'string' && snapshot.length > 0 && raw.includes(snapshot), 'INVALID_HOST_SCOPE');
  requireValue(snapshot.length <= 50000, 'HOST_OBSERVATION_TOO_LARGE');
  const entries = snapshot.split('\n').filter(line => !/\((?:disabled|unavailable)\)/i.test(line)).map(line => line.match(control)).filter(Boolean)
    .map(m => ({ id: 'ax_' + m[1], text: m[3].trim(), role: m[2], target: Number(m[1]), op: 'click' }));
  const counts = new Map(); for (const entry of entries) counts.set(entry.text, (counts.get(entry.text) || 0) + 1);
  const candidates = entries.filter(c => counts.get(c.text) === 1 && !/\b(disabled|unavailable)\b|已停用|不可用/i.test(c.text))
    .filter(c => policy.allowNames.some(p => match(c.text, p)) && !(policy.denyNames || []).some(p => match(c.text, p)))
    // Consequential labels always hand back, even if included in the host's allow list.
    .map(c => ({ ...c, requiresApproval: reserved.test(c.text) && !/^(preview|查看|预览)\b|^预览/.test(c.text.toLowerCase()) }));
  requireValue(candidates.length <= 40, 'HOST_CANDIDATES_TOO_LARGE');
  return { snapshot, observedAt: Date.now(), candidates, semanticHash: hash(semanticState(snapshot)) };
}
function checkPolicy(policy) {
  requireValue(policy && Array.isArray(policy.allowNames) && policy.allowNames.length > 0 && policy.allowNames.length <= 100, 'HOST_ALLOWLIST_REQUIRED');
  requireValue([...policy.allowNames, ...(policy.denyNames || [])].every(p => typeof p === 'string' || p instanceof RegExp), 'INVALID_HOST_POLICY');
}
export function createChromeDriver({ tab, allowedOrigins, policy, scope }) {
  checkPolicy(policy);
  requireValue(tab?.ax && typeof tab.ax.get === 'function' && typeof tab.ax.click === 'function', 'UNSUPPORTED_CHROME_HOST');
  requireValue(Array.isArray(allowedOrigins) && allowedOrigins.length > 0 && allowedOrigins.every(x => { try { return new URL(x).origin === x; } catch { return false; } }), 'ALLOWED_ORIGINS_REQUIRED');
  return {
    kind: 'chrome',
    async observe() {
      const raw = await tab.ax.get('state', { disableDiffing: true });
      const url = raw.match(/^Browser tab:.* URL: "([^"]+)"\./m)?.[1];
      requireValue(url && allowedOrigins.includes(new URL(url).origin), 'HOST_ORIGIN_CHANGED');
      return observation(raw, policy, scope);
    },
    async execute(action) { requireValue(action.op === 'click' && Number.isInteger(action.target), 'UNSUPPORTED_HOST_ACTION'); await tab.ax.click(action.target); },
  };
}
export function createComputerUseDriver({ sky, app, policy, scope }) {
  checkPolicy(policy);
  requireValue(typeof app === 'string' && app.length > 0 && sky?.get_app_state && sky?.click, 'UNSUPPORTED_COMPUTER_USE_HOST');
  requireValue(typeof scope === 'function', 'HOST_APP_SCOPE_REQUIRED');
  return {
    kind: 'computer-use',
    async observe() { const state = await sky.get_app_state({ app, disableDiff: true }); return observation(state.text, policy, scope); },
    async execute(action) { requireValue(action.op === 'click' && Number.isInteger(action.target), 'UNSUPPORTED_HOST_ACTION'); await sky.click({ app, element_index: action.target }); },
  };
}
