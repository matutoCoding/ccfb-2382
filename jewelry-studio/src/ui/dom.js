// 通用 DOM / 工具
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function money(n) {
  return '¥' + Math.round(n).toLocaleString('zh-CN');
}

export function num(n, d = 2) {
  return Number(n).toFixed(d);
}

export function download(filename, url) {
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  download(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce(fn, ms = 60) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

export function modal(title, bodyNode, footNode) {
  const close = () => mask.remove();
  const mask = h('div', { class: 'modal-mask', onclick: e => { if (e.target === mask) close(); } },
    h('div', { class: 'modal' },
      h('div', { class: 'm-head' }, h('span', {}, title), h('button', { class: 'small ghost', onclick: close }, '✕')),
      h('div', { class: 'm-body' }, bodyNode),
      footNode ? h('div', { class: 'm-foot' }, footNode) : null
    )
  );
  document.body.append(mask);
  return { close, mask };
}

// 滑块字段
export function rangeField(label, value, min, max, step, unit, onChange) {
  const val = h('b', {}, `${value}${unit || ''}`);
  const input = h('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => {
    val.textContent = input.value + (unit || '');
    onChange(parseFloat(input.value));
  });
  return h('label', { class: 'field' },
    h('span', { class: 'lab' }, h('span', {}, label), val),
    input
  );
}

// 分段选择
export function segField(label, options, current, onPick) {
  const btns = options.map(o => h('button', {
    class: o.value === current ? 'on' : '',
    onclick: () => { onPick(o.value); btns.forEach(b => b.classList.remove('on')); }
  }, o.label));
  btns.find((b, i) => options[i].value === current)?.classList.add('on');
  return h('label', { class: 'field' },
    h('span', { class: 'lab' }, h('span', {}, label)),
    h('div', { class: 'seg' }, ...btns)
  );
}

export function selectField(label, options, current, onPick) {
  const sel = h('select', {}, ...options.map(o => {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === current) opt.selected = true;
    return opt;
  }));
  sel.addEventListener('change', () => onPick(sel.value));
  return h('label', { class: 'field' }, h('span', { class: 'lab' }, h('span', {}, label)), sel);
}

export function toggleField(label, checked, onToggle) {
  const input = h('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onToggle(input.checked));
  return h('label', { class: 'checkline' }, input, h('span', {}, label));
}
