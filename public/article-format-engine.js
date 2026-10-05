/* Generic DOM capabilities. Geometry follows the officially published verification implementation.
 * Reference: wechatjs/verify-article-structure-spec, commit 1340988eccbb63181a56141a5c2171d55cd42521, MIT.
 * Standards, rule selection, exclusions and parameters are supplied by the library JSON bundle.
 */
(function () {
  'use strict';
  const textNodes = root => {
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const result = []; let node;
    while ((node = walker.nextNode())) if (node.textContent.trim() && !node.parentElement.closest('script,style')) result.push(node);
    return result;
  };
  const text = root => textNodes(root).map(node => node.textContent).join('').trim();
  const style = (node, property) => node.ownerDocument.defaultView.getComputedStyle(node).getPropertyValue(property).trim();
  const line = node => Number(node.closest('[data-source-line]')?.getAttribute('data-source-line')) || undefined;
  let declarations = new WeakMap();
  let sheetRules = new WeakMap();
  function declared(node, property) {
    let cached = declarations.get(node);
    if (!cached) { cached = new Map(); declarations.set(node, cached); }
    if (cached.has(property)) return cached.get(property);
    const values = []; const inline = node.style?.getPropertyValue(property); if (inline) values.push(inline);
    function walk(rules) {
      for (const rule of rules) {
        if (typeof rule.selectorText === 'string') {
          try { if (node.matches(rule.selectorText) && rule.style.getPropertyValue(property)) values.push(rule.style.getPropertyValue(property)); } catch (_) { /* unsupported selector is not certified */ }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    }
    let rules = sheetRules.get(node.ownerDocument);
    if (!rules) { rules = []; for (const sheet of node.ownerDocument.styleSheets) { try { rules.push(...sheet.cssRules); } catch (_) { /* no remote CSS is considered */ } } sheetRules.set(node.ownerDocument, rules); }
    walk(rules); cached.set(property, values); return values;
  }
  const overlaps = (a, b) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const ignored = (node, attribute, value) => attribute && (value ? (node.getAttribute(attribute) || '').split(/\s+/).includes(value) : Boolean(node.closest(`[${attribute}]`)));
  const issues = [];
  function add(rule, node, detail, outcome) { issues.push({ ruleId: rule.id, line: line(node), detail, outcome: outcome || 'violation', html: node.outerHTML?.slice(0, 1500) }); }
  function select(root, selector) { return selector ? [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)] : [root, ...root.querySelectorAll('*')]; }
  function styleCheck(root, rule) {
    const p = rule.parameters;
    for (const node of select(root, p.selector)) {
      if (!node.style) continue;
      const values = p.property ? declared(node, p.property) : [];
      if (rule.operator === 'style.present' && values.length) add(rule, node);
      if (rule.operator === 'style.values' && values.length && p.values.includes(style(node, p.property).toLowerCase())) add(rule, node);
      if (rule.operator === 'style.transparent' && values.length && (/^transparent$/i.test(style(node, p.property)) || /rgba?\([^)]*[,/]\s*0(?:\.0+)?\s*\)$/i.test(style(node, p.property)))) add(rule, node);
      if (rule.operator === 'style.important' && [...node.style].some(property => node.style.getPropertyPriority(property) === 'important')) add(rule, node);
    }
  }
  function leafCheck(root, rule) {
    const p = rule.parameters;
    for (const node of select(root, p.selector)) {
      if (rule.operator === 'dom.leaf-content') {
        if ([...node.children].some(child => p.blockElements.includes(child.tagName.toLowerCase()))) add(rule, node);
      } else {
        const children = [...node.children];
        if ([...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()) || children.some(child => p.disallowedElements.includes(child.tagName.toLowerCase()))) add(rule, node);
        else if (children.some(child => !p.allowedElements.includes(child.tagName.toLowerCase()))) add(rule, node, '组件未在当前白名单中。', p.unknownComponents);
      }
    }
  }
  function nestingCheck(root, rule) {
    const p = rule.parameters; const reported = new Set();
    const signature = node => node.tagName + ':' + (node.getAttribute('style') || '').trim();
    for (const node of select(root)) {
      if (p.mediaExempt.includes(node.tagName.toLowerCase())) continue;
      let length = 1, child = node;
      while (child.children.length === 1 && ![...child.childNodes].some(item => item.nodeType === 3 && item.textContent.trim())) {
        const next = child.children[0]; if (signature(next) !== signature(node)) break;
        length++; child = next;
      }
      if (length > p.limit && ![...reported].some(parent => parent.contains(node))) { add(rule, node); reported.add(node); }
    }
  }
  function heightCheck(root, rule) {
    const p = rule.parameters;
    for (const node of select(root)) {
      if (p.svgExempt && node.closest('svg') || p.ignoreSelector && node.closest(p.ignoreSelector) || p.imageOnlyExempt && !text(node)) continue;
      const declaredHeight = declared(node, p.property); if (!declaredHeight.length) continue;
      const height = parseFloat(style(node, p.property));
      if (height === p.zero) { add(rule, node); continue; }
      if (p.scrollExempt && /auto|scroll/.test(style(node, 'overflow-y'))) continue;
      if (!/hidden|clip/.test(style(node, 'overflow-y'))) continue;
      const rect = node.getBoundingClientRect();
      const clipped = textNodes(node).some(child => { const range = child.ownerDocument.createRange(); range.selectNodeContents(child); return [...range.getClientRects()].some(box => box.bottom > rect.bottom + 1); });
      if (clipped) add(rule, node);
    }
  }
  function lineHeightCheck(root, rule) {
    const p = rule.parameters;
    const rowsOf = node => {
      const rows = [];
      for (const child of textNodes(node)) {
        const range = child.ownerDocument.createRange(); range.selectNodeContents(child);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const row = rows.find(item => Math.min(item.bottom, rect.bottom) - Math.max(item.top, rect.top) > Math.min(item.height, rect.height) * p.sameLineOverlap);
          if (row) { row.top = Math.min(row.top, rect.top); row.bottom = Math.max(row.bottom, rect.bottom); row.height = row.bottom - row.top; }
          else rows.push({ top: rect.top, bottom: rect.bottom, height: rect.height });
        }
      }
      return rows.sort((a, b) => a.top - b.top);
    };
    for (const node of select(root)) {
      const hasText = text(node);
      if (!hasText && p.imageOnlyExempt) continue;
      const height = parseFloat(style(node, p.property)), font = parseFloat(style(node, 'font-size'));
      if (!Number.isFinite(height) || height >= font || !hasText) continue;
      if (node.closest('svg')) { add(rule, node, 'SVG文字行高需人工核对。', 'incomplete'); continue; }
      let rows = rowsOf(node);
      // Zero line-height collapses every line to one Y coordinate. Restore only this
      // isolated measurement copy temporarily to distinguish multi-line from single-line.
      if (height === 0) {
        const original = node.getAttribute('style');
        try { node.style.setProperty(p.property, 'normal', 'important'); rows = rowsOf(node); }
        finally { if (original === null) node.removeAttribute('style'); else node.setAttribute('style', original); }
        if (rows.length > 1 || !p.singleLineExempt) add(rule, node);
        continue;
      }
      if (p.singleLineExempt && rows.length < 2) continue;
      const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
      if (rows.length && range.getBoundingClientRect().height / rows.length < font * p.inkHeightFactor) add(rule, node);
    }
  }
  function opacityCheck(root, rule) {
    const p = rule.parameters;
    for (const image of root.querySelectorAll('img')) {
      if (Number(style(image, p.property)) !== p.value) continue;
      const rect = image.getBoundingClientRect();
      if ([...root.querySelectorAll(p.overlaySelector)].some(svg => style(svg, 'background-image') !== 'none' && overlaps(rect, svg.getBoundingClientRect()))) add(rule, image);
    }
  }
  function animationCheck(root, rule) {
    const p = rule.parameters;
    for (const node of select(root, p.selector)) {
      const events = (node.getAttribute('begin') || '').split(';').map(value => value.trim());
      if (events.some(event => event.includes(p.touch)) && !events.some(event => event.includes(p.click))) add(rule, node);
    }
  }
  function preCheck(root, rule) {
    for (const node of select(root, rule.parameters.selector)) if (text(node) && !(rule.parameters.codeExempt && node.querySelector('code'))) add(rule, node);
  }
  async function widthCheck(root, rule, css) {
    const p = rule.parameters; const html = root.outerHTML; const screens = [];
    for (const width of p.widths) {
      const frame = document.createElement('iframe'); frame.style.cssText = `position:absolute;left:-100000px;top:0;border:0;width:${width}px;height:2000px`;
      frame.sandbox = 'allow-same-origin';
      const ready = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
      const constraints = p.constrainMaxWidth ? '.article-preview *{max-width:100%!important;box-sizing:border-box!important;overflow-wrap:break-word!important}' : '';
      frame.srcdoc = `<!doctype html><html><head><style>body{margin:0}${constraints}${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${html}</body></html>`;
      document.body.append(frame);
      try {
        await ready; const doc = frame.contentDocument; const article = doc.querySelector('.article-preview');
        await Promise.all([...article.querySelectorAll('img')].map(image => new Promise(resolve => {
          if (image.complete && image.naturalWidth || Number(image.getAttribute('data-w')) > 0) { resolve(); return; }
          const timer = setTimeout(done, p.imageLoadTimeoutMs);
          function done() { clearTimeout(timer); image.removeEventListener('load', done); image.removeEventListener('error', done); resolve(); }
          image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true });
        })));
        for (const image of article.querySelectorAll('img')) {
          if (image.naturalWidth) continue;
          const fallback = image.style.width || image.getAttribute('data-w') || image.getAttribute('width');
          if (fallback && parseFloat(fallback) > 0) image.style.width = /[%a-z]/i.test(fallback) ? fallback : `${fallback}px`;
          else {
            image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
            image.style.width = '1px'; image.style.height = '1px';
            add(rule, root, '图片未载入且无尺寸；已按1×1占位测量，实际图片布局仍需核对。', 'incomplete');
          }
        }
        const findings = [article, ...article.querySelectorAll('*')].map((node, index) => {
          const rect = node.getBoundingClientRect(), parent = (node.parentElement || article).getBoundingClientRect();
          const left = rect.left - parent.left, right = parent.right - rect.right;
          return { node, index, width: rect.width, ratio: parent.width ? rect.width / parent.width : 0, centered: Math.abs(left - right) <= p.overflowTolerance, fills: Math.abs(rect.width - parent.width) <= p.overflowTolerance, overflow: rect.left < -p.overflowTolerance || rect.right > width + p.overflowTolerance, ignored: ignored(node, p.ignoreAttribute), text: text(node) };
        });
        screens.push(findings);
      } finally { frame.remove(); }
    }
    const original = [root, ...root.querySelectorAll('*')];
    for (let i = 0; i < original.length; i++) {
      const node = original[i];
      const paragraph = node === root || node.matches(p.paragraphSelector);
      const dimension = declared(node, p.dimensionProperty).some(value => !p.ignoredWidthValues.includes(value.trim()));
      const candidate = node.matches(p.candidateSelector) || dimension && !p.exemptElements.includes(node.tagName.toLowerCase());
      if (!paragraph && !candidate) continue;
      const values = screens.map(screen => screen[i]).filter(Boolean); if (!values.length || values.every(value => value.ignored) || !values.some(value => value.text || value.node.tagName === 'IMG')) continue;
      const overflow = values.some(value => value.overflow && !(p.excludeCenteredOverflow && value.centered));
      const centerMismatch = candidate && values.some(value => value.centered !== values[0].centered);
      const widthDiff = values.some(value => Math.abs(value.width - values[0].width) > p.widthDifference);
      const ratiosDiffer = values.some(value => Math.abs(value.ratio - values[0].ratio) > (values.some(item => item.fills) ? 0 : p.ratioDifference));
      const normalResponsive = widthDiff && values.every(value => Math.abs(value.width - values[0].width) <= p.widthDifference || Math.abs(value.ratio - 1) < p.responsiveFillTolerance);
      if (overflow || centerMismatch || candidate && widthDiff && ratiosDiffer && !normalResponsive) add(rule, original[i], [overflow && '横向溢出', centerMismatch && '居中布局不一致', widthDiff && ratiosDiffer && !normalResponsive && '宽度比例不一致'].filter(Boolean).join('；'));
    }
  }
  const capabilities = { 'style.present': styleCheck, 'style.values': styleCheck, 'style.transparent': styleCheck, 'style.important': styleCheck, 'dom.leaf-content': leafCheck, 'dom.nodeleaf-content': leafCheck, 'dom.redundant-nesting': nestingCheck, 'dom.height-overflow': heightCheck, 'dom.text-overlap': lineHeightCheck, 'dom.opacity-overlay': opacityCheck, 'dom.animation-begin': animationCheck, 'dom.pre-text': preCheck };
  function transform(root, bundle) {
    const preview = bundle.formatter.preview;
    const transforms = {
      preserve: function () {},
      'mp-darkmode': function () {
        if (!window.Darkmode) throw new Error('转换能力未载入。');
        const normalize = window.ArticleColorNormalizer(document);
        const names = bundle.formatter.output.inlineProperties.filter(name => /color|background|shadow/.test(name));
        for (const node of [root, ...root.querySelectorAll('*')]) {
          if (!(node instanceof HTMLElement)) continue;
          const computed = getComputedStyle(node);
          for (const name of names) { const value = computed.getPropertyValue(name); if (value) node.style.setProperty(name, normalize.normalizePaint(value)); }
        }
        window.Darkmode.run([...root.querySelectorAll('*')], { ...preview.dark.options, defaultDarkBgColor: preview.dark.background, container: root, error(error) { throw error; } });
      },
    };
    const run = transforms[preview.dark.transform]; if (!run) throw new Error('未知转换能力。'); run();
  }
  async function inspect(root, bundle, css) {
    issues.length = 0; declarations = new WeakMap(); sheetRules = new WeakMap(); const checked = [];
    const rules = bundle.validator.rules.filter(rule => rule.enabled && rule.stages.includes('rendered'));
    for (const rule of rules) {
      if (capabilities[rule.operator]) { await capabilities[rule.operator](root, rule); checked.push(rule.id); }
      else if (rule.operator === 'dom.responsive-width') { await widthCheck(root, rule, css); checked.push(rule.id); }
      else if (!['official.dark-contrast', 'official.dark-gradient'].includes(rule.operator)) add(rule, root, '能力未实现，无法完成核对。', 'incomplete');
    }
    const darkRules = rules.filter(rule => ['official.dark-contrast', 'official.dark-gradient'].includes(rule.operator));
    if (darkRules.length) {
      transform(root, bundle);
      if (bundle.formatter.preview.dark.transform === 'preserve') darkRules.forEach(rule => add(rule, root, '当前配置未启用相应转换能力。', 'incomplete'));
      else {
        const keys = { 'darkmode-low-contrast': 'official.dark-contrast', 'darkmode-no-gradient': 'official.dark-gradient' };
        // The vendor validator hardcodes data-ignore-dm. Remove it only from this
        // isolated copy while collecting raw findings, then apply each JSON rule's
        // own exception contract. Repeated capabilities can have different thresholds.
        const exemptions = [...root.querySelectorAll('[data-ignore-dm]')].map(node => [node, node.getAttribute('data-ignore-dm')]);
        if (root.hasAttribute('data-ignore-dm')) exemptions.unshift([root, root.getAttribute('data-ignore-dm')]);
        const raw = new Map();
        try {
          exemptions.forEach(([node]) => node.removeAttribute('data-ignore-dm'));
          for (const rule of darkRules) {
            const minimum = rule.operator === 'official.dark-contrast' ? rule.parameters.minimum : 1;
            if (!raw.has(minimum)) raw.set(minimum, window.Darkmode.validate(root, { minContrast: minimum }));
          }
        } finally { exemptions.forEach(([node, value]) => node.setAttribute('data-ignore-dm', value)); }
        for (const rule of darkRules) {
          const minimum = rule.operator === 'official.dark-contrast' ? rule.parameters.minimum : 1;
          for (const item of raw.get(minimum)) if (keys[item.key] === rule.operator && !ignored(item.dom, rule.parameters.ignoreAttribute, rule.parameters.ignoreValue)) add(rule, item.dom);
          checked.push(rule.id);
        }
      }
    }
    return { checked, issues: [...issues], manual: bundle.support.manualReview.filter(rule => root.matches(rule.selector) || root.querySelector(rule.selector)).map(rule => rule.id) };
  }
  window.ArticleFormatEngine = { inspect, transform };
})();
