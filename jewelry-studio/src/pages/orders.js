// 订单报价页
import { h, toast, modal, money, num, downloadText } from '../ui/dom.js';
import {
  getOrders, saveOrder, deleteOrder, estimateQuote,
  getPriceOverrides, setPriceOverrides
} from '../state/store.js';
import { METALS, GEMS, metalById, gemById, settingById, cutById, hkRingDiameter } from '../data/materials.js';
import { makeQuotePdf } from '../export/pdf.js';
import { ViewerScene } from '../three/viewerScene.js';

let tableHost = null;

export function renderOrders(root, session) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, '订单报价'), h('p', {}, '配置参数完整存档 · 金属实测体积估重 · 宝石折克拉 · 可导出 PDF / CSV')),
      h('div', { class: 'btn-row' },
        h('button', { id: 'btn-new' }, '按当前配置建单'),
        h('button', { id: 'btn-price' }, '门店调价'),
        h('button', { id: 'btn-csv' }, '导出 CSV')
      )
    ),
    h('div', { class: 'page-body' },
      h('div', { id: 'order-host' })
    )
  );
  root.append(page);
  tableHost = page.querySelector('#order-host');

  page.querySelector('#btn-new').onclick = () => openOrderForm(session);
  page.querySelector('#btn-price').onclick = () => openPricePanel();
  page.querySelector('#btn-csv').onclick = () => exportCsv();

  renderTable();
}

function renderTable() {
  const orders = getOrders();
  tableHost.innerHTML = '';
  if (!orders.length) {
    tableHost.append(h('div', { class: 'empty' },
      h('div', { class: 'big' }, '▤'),
      h('div', {}, '还没有订单'),
      h('div', { class: 'muted', style: 'margin-top:8px' }, '在工作台调好款式后，点击「生成订单报价」或本页「按当前配置建单」')
    ));
    return;
  }
  const rows = orders.map(o => {
    const gem = gemById(o.config.gemId), metal = metalById(o.config.metalId);
    return h('tr', {},
      h('td', {}, h('div', { style: 'font-weight:650' }, o.id), h('div', { class: 'muted' }, o.createdAt)),
      h('td', {}, o.customerName || '门店散客', h('div', { class: 'muted' }, o.customerPhone || '—')),
      h('td', {}, `${metal.short} / ${gem.name}`, h('div', { class: 'muted' },
        o.config.category === 'ring' ? `港度${o.config.ringSize}号 · ${settingById(o.config.setting).name}` :
        o.config.category === 'pendant' ? '吊坠 · ' + settingById(o.config.setting).name : '耳饰一对')),
      h('td', { class: 'num' }, num(o.quote.metal.weightG, 2) + ' g'),
      h('td', { class: 'num' }, num(o.quote.mainGem.carat, 2) + ' ct'),
      h('td', { class: 'num price' }, money(o.quote.total)),
      h('td', {}, h('div', { class: 'btn-row' },
        h('button', { class: 'small', onclick: () => makePdf(o) }, 'PDF'),
        h('button', { class: 'small', onclick: () => editOrder(o) }, '编辑'),
        h('button', { class: 'small', onclick: () => { if (confirm('确认删除订单 ' + o.id + '？')) { deleteOrder(o.id); renderTable(); } } }, '删除')
      ))
    );
  });
  tableHost.append(h('table', { class: 'data' },
    h('thead', {}, h('tr', {}, ...['订单号 / 时间', '客户', '配置摘要', '金属重量', '主石', '总价', '操作'].map(t => h('th', {}, t)))),
    h('tbody', {}, ...rows)
  ));
}

function makePdf(order) {
  makeQuotePdf(order).save(order.id + '-quote.pdf');
  toast('报价 PDF 已导出');
}

function editOrder(o) {
  const body = h('div', {});
  const nameInput = h('input', { value: o.customerName || '', placeholder: '客户姓名' });
  const phoneInput = h('input', { value: o.customerPhone || '', placeholder: '联系电话' });
  const noteInput = h('textarea', { style: 'width:100%;min-height:80px;background:var(--bg-2);border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:10px', placeholder: '备注' });
  noteInput.value = o.note || '';
  body.append(
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '客户姓名'), nameInput),
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '联系电话'), phoneInput),
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '备注'), noteInput)
  );
  const m = modal('编辑订单 ' + o.id, body, h('div', {},
    h('button', { onclick: () => m.close() }, '取消'),
    h('button', { class: 'primary', onclick: () => {
      saveOrder({ ...o, customerName: nameInput.value, customerPhone: phoneInput.value, note: noteInput.value });
      m.close(); renderTable(); toast('订单已更新');
    } }, '保存')
  ));
}

function openOrderForm(session) {
  const hidden = h('div', { style: 'position:fixed;left:-9999px;top:0;width:900px;height:900px' });
  document.body.append(hidden);
  const viewer = new ViewerScene(hidden);
  viewer.setConfig(session.config);
  const measured = viewer.measured || session.measured;
  const quote = estimateQuote(session.config, measured);

  const body = h('div', {});
  // 实时报价摘要
  const summary = h('div', { style: 'background:var(--bg-2);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:16px' });
  const rows = [
    ['金属用量', num(quote.metal.weightG, 3) + ' g （体积 ' + num(quote.metal.volumeMm3, 1) + ' mm³ × 密度 ' + metalById(session.config.metalId).density + '）', money(quote.metal.cost)],
    ['主石', gemById(session.config.gemId).name + ' ' + num(quote.mainGem.carat, 2) + ' ct（' + cutById(session.config.gemCut).name + '）', money(quote.mainGem.cost)],
    ['副石', quote.sideGems.count + ' 颗 / ' + num(quote.sideGems.carat, 2) + ' ct', money(quote.sideGems.cost)],
    ['工费', settingById(session.config.setting).name + ' 工艺', money(quote.craftFee)]
  ];
  summary.append(...rows.map(r => h('div', { class: 'kv' }, h('span', {}, r[0] + '  '), h('span', {}, r[1]), h('b', { class: 'price' }, r[2]))));
  summary.append(h('div', { class: 'divider' }),
    h('div', { class: 'flex-between' }, h('span', { style: 'font-weight:650' }, '合计'), h('span', { class: 'price', style: 'font-size:18px' }, money(quote.total))));

  const nameInput = h('input', { placeholder: '客户姓名（可空）' });
  const phoneInput = h('input', { placeholder: '联系电话（可空）' });
  const noteInput = h('textarea', { style: 'width:100%;min-height:70px;background:var(--bg-2);border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:10px', placeholder: '备注：指圈复核、刻字、交期…' });
  body.append(summary,
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '客户姓名'), nameInput),
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '联系电话'), phoneInput),
    h('label', { class: 'field' }, h('span', { class: 'lab' }, '备注'), noteInput),
    h('div', { class: 'muted' }, '建单后将同时渲染两张成品图（白底透视/正面）随单存档，供 PDF 输出')
  );

  const m = modal('新建订单 · 自动估价', body, h('div', {},
    h('button', { onclick: () => { m.close(); viewer.dispose(); hidden.remove(); } }, '取消'),
    h('button', { class: 'primary', id: 'confirm-order' }, '确认建单并出图')
  ));

  m.mask.querySelector('#confirm-order').onclick = async (e) => {
    const btn = e.target;
    try {
      btn.disabled = true; btn.textContent = '渲染成品图中…';
      const image = await viewer.screenshot(1000, 1000, 'iso', 'white');
      btn.textContent = '渲染第二张…';
      const image2 = await viewer.screenshot(1000, 1000, 'front', 'white');
      const order = saveOrder({
        customerName: nameInput.value,
        customerPhone: phoneInput.value,
        note: noteInput.value,
        config: JSON.parse(JSON.stringify(session.config)),
        measured,
        quote,
        image, image2
      });
      viewer.dispose(); hidden.remove();
      m.close(); renderTable();
      toast('订单 ' + order.id + ' 已创建，总价 ' + money(quote.total));
    } catch (err) {
      console.error(err);
      btn.disabled = false; btn.textContent = '确认建单并出图';
      toast('出图失败：' + (err?.message || err), 4000);
    }
  };
}

function openPricePanel() {
  const overrides = getPriceOverrides();
  const body = h('div', {},
    h('div', { class: 'muted', style: 'margin-bottom:12px' }, '留空 = 用系统参考价；修改后所有新订单按门店价计算')
  );
  const inputs = [];
  const sec = (title, list, key) => {
    body.append(h('div', { class: 'group-title' }, title));
    for (const item of list) {
      const inp = h('input', { type: 'number', value: overrides[item.id] ?? '', placeholder: String(item[key]) });
      inputs.push([item.id, inp]);
      body.append(h('label', { class: 'field' },
        h('span', { class: 'lab' }, h('span', {}, item.name), h('span', { class: 'muted' }, '参考 ' + item[key])), inp));
    }
  };
  sec('金属（元/克）', METALS, 'pricePerGram');
  sec('宝石（元/克拉）', GEMS, 'pricePerCarat');
  const m = modal('门店参考价设置', body, h('div', {},
    h('button', { onclick: () => m.close() }, '取消'),
    h('button', { class: 'primary', onclick: () => {
      const o = {};
      for (const [id, inp] of inputs) if (inp.value !== '') o[id] = Number(inp.value);
      setPriceOverrides(o); m.close(); toast('价格已更新');
    } }, '保存价格')
  ));
}

function exportCsv() {
  const orders = getOrders();
  if (!orders.length) return toast('暂无订单可导出');
  const head = ['订单号', '创建时间', '客户', '电话', '品类', '金属', '主石', '切工', '镶口', '圈号', '金属g', '主石ct', '副石数', '工费', '总价', '备注'];
  const lines = [head.join(',')];
  for (const o of orders) {
    lines.push([
      o.id, o.createdAt, o.customerName || '', o.customerPhone || '',
      o.config.category, metalById(o.config.metalId).name, gemById(o.config.gemId).name,
      cutById(o.config.gemCut).name, settingById(o.config.setting).name,
      o.config.category === 'ring' ? o.config.ringSize : '',
      num(o.quote.metal.weightG, 2), num(o.quote.mainGem.carat, 2),
      o.quote.sideGems.count, Math.round(o.quote.craftFee), Math.round(o.quote.total),
      (o.note || '').replace(/[,\n]/g, ' ')
    ].join(','));
  }
  downloadText('jewelry-orders.csv', lines.join('\n'), 'text/csv');
  toast('CSV 已导出（Excel 可直接打开）');
}
