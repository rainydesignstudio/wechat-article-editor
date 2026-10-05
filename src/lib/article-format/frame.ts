import { articlePreviewStyle } from './preview';
import { assertCurrentFormat, assertFormatReady, getFormatSnapshot, subscribeFormatSnapshot, type FormatSnapshot } from './runtime';

export type RenderedFinding = { ruleId: string; line?: number; detail?: string; outcome: 'violation' | 'review' | 'incomplete'; html?: string };
export type RenderedInspection = { checked: string[]; issues: RenderedFinding[]; manual: string[] };
function scriptJson(value: unknown): string { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
export function formatPreviewDocument(css: string, html: string, dark: boolean, snapshot = getFormatSnapshot()): string {
  const preview = snapshot.bundle.formatter.preview;
  const payload = scriptJson({ kind: 'preview', bundle: snapshot.bundle, dark });
  const safeCss = articlePreviewStyle(css).replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:${dark ? preview.dark.background : preview.light.background};color:${preview.color};font-family:${preview.fontFamily}}html,body{min-height:100%}${safeCss}</style><script type="application/json" data-article-format-config>${payload}</script><script src="/mp-darkmode.js"></script><script src="/article-format-engine.js"></script><script defer src="/article-format-bootstrap.js"></script></head><body>${html}</body></html>`;
}
export async function inspectRenderedFormat(root: HTMLElement, css: string, snapshot: FormatSnapshot = getFormatSnapshot(), signal?: AbortSignal): Promise<RenderedInspection> {
  assertFormatReady(snapshot); signal?.throwIfAborted();
  if (typeof document === 'undefined') throw new Error('实际布局校验需要浏览器。');
  const token = crypto.randomUUID(); const frame = document.createElement('iframe');
  const widthRule = snapshot.bundle.validator.rules.find(rule => rule.enabled && rule.operator === 'dom.responsive-width');
  const widths = widthRule?.parameters.widths as number[] | undefined;
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${widths?.[0] ?? snapshot.bundle.formatter.output.visual.width}px;height:2000px;border:0;pointer-events:none`;
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  const preview = snapshot.bundle.formatter.preview;
  const fullCss = `body{margin:0;font-family:${preview.fontFamily};background:${preview.light.background};color:${preview.color}}${articlePreviewStyle(css)}`;
  const payload = scriptJson({ kind: 'inspection', bundle: snapshot.bundle, token, css: fullCss, origin: location.origin });
  const html = root.outerHTML;
  return new Promise<RenderedInspection>((resolve, reject) => {
    let done = false;
    let unsubscribe = () => {};
    const abort = () => finish(new Error('实际布局检查已取消。'));
    const timer = window.setTimeout(() => finish(new Error('布局／深色校验超时，尚未完成核对。')), 20000);
    const finish = (error?: Error, value?: RenderedInspection) => {
      if (done) return; done = true;
      clearTimeout(timer); unsubscribe(); signal?.removeEventListener('abort', abort); window.removeEventListener('message', receive); frame.remove();
      if (error) reject(error); else { try { assertCurrentFormat(snapshot); resolve(value!); } catch (cause) { reject(cause); } }
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.token !== token) return;
      if (event.data.error) finish(new Error(event.data.error));
      else if (Array.isArray(event.data.result?.checked) && Array.isArray(event.data.result?.issues)) finish(undefined, event.data.result);
    };
    unsubscribe = subscribeFormatSnapshot(() => { if (getFormatSnapshot().id !== snapshot.id) finish(new Error('格式配置已切换，旧检查已取消。')); });
    signal?.addEventListener('abort', abort, { once: true });
    window.addEventListener('message', receive);
    frame.srcdoc = `<!doctype html><html><head><style>${fullCss.replace(/<\/style/gi, '<\\/style')}</style><script type="application/json" data-article-format-config>${payload}</script><script src="/mp-darkmode.js"></script><script src="/article-format-engine.js"></script><script defer src="/article-format-bootstrap.js"></script></head><body>${html}</body></html>`;
    document.body.append(frame);
  });
}
