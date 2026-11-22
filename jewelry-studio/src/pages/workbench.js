// 配置工作台
import { h, toast, debounce, rangeField, segField, selectField, toggleField, num, modal } from '../ui/dom.js';
import {
  METALS, GEMS, GEM_CUTS, SETTINGS, metalById, gemById, hkRingDiameter
} from '../data/materials.js';
import {
  defaultConfig, pushHistory, undo, redo, historyList, jumpHistory,
  addFavorite, estimateQuote
} from '../state/store.js';
import { ViewerScene } from '../three/viewerScene.js';

let viewerA = null, viewerB = null;
let splitOn = false;
let panelHost = null;
let badgeA = null, badgeB = null;
let applyFn = null;
let currentSession = null;

export function disposeWorkbench() {
  viewerA?.dispose(); viewerB?.dispose();
  viewerA = null; viewerB = null; splitOn = false;
  panelHost = null; badgeA = null; badgeB = null; applyFn = null; currentSession = null;
}

export function renderWorkbench(root, session) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', {}, '配置工作台'),
        h('p', {}, '参数化实时变形 · 折射/色散/焦散物理解算 · 改参数与出图同一渲染管线')
      ),
      h('div', { class: 'btn-row' },
        h('button', { id: 'btn-undo' }, '↶ 回退'),
        h('button', { id: 'btn-redo' }, '↷ 重做'),
        h('button', { id: 'btn-history' }, '历史记录'),
        h('button', { id: 'btn-fav' }, '☆ 收藏搭配'),
        h('button', { id: 'btn-split' }, '分屏对比'),
        h('button', { class: 'primary', id: 'btn-to-render' }, '渲染出图 →')
      )
    ),
    h('div', { class: 'workbench' },
      h('div', { class: 'viewport-wrap', id: 'vp-wrap' },
        h('div', { class: 'vp', id: 'vp-a' },
          h('div', { class: 'vp-toolbar' }, toolbarButtons('A')),
          h('div', { class: 'vp-badge', id: 'badge-a' })
        )
      ),
      h('div', { class: 'side-panel' },
        h('div', { class: 'panel-head' },
          h('h2', {}, '参数配置'),
          h('span', { class: 'pill' }, '实时')
        ),
        h('div', { class: 'scroll', id: 'panel' }),
        h('div', { class: 'panel-foot' },
          h('button', { id: 'btn-reset' }, '恢复默认'),
          h('button', { class: 'primary', id: 'btn-order' }, '生成订单报价')
        )
      )
    )
  );
  root.append(page);

  const vpA = page.querySelector('#vp-a');
  panelHost = page.querySelector('#panel');
  badgeA = page.querySelector('#badge-a');

  // 先定义 apply, 保证 rebuildPanel 内控件回调可用
  const apply = debounce((patch) => {
    Object.assign(session.config, patch);
    const m = viewerA.setConfig(session.config);
    session.measured = m;
    if (splitOn && viewerB) viewerB.setConfig(session.splitB);
    rebuildPanel(session);
    pushHistory(session.config);
    updateBadges();
  }, 50);
  applyFn = apply;

  viewerA = new ViewerScene(vpA);
  currentSession = session;
  viewerA.onMeasure = m => { session.measured = m; updateBadges(); };
  viewerA.setConfig(session.config);
  pushHistory(session.config);
  rebuildPanel(session);

  // 头部按钮
  page.querySelector('#btn-undo').onclick = () => {
    const c = undo();
    if (c) { session.config = c; viewerA.setConfig(c); rebuildPanel(session); updateBadges(); }
  };
  page.querySelector('#btn-redo').onclick = () => {
    const c = redo();
    if (c) { session.config = c; viewerA.setConfig(c); rebuildPanel(session); updateBadges(); }
  };
  page.querySelector('#btn-history').onclick = () => openHistory(session);
  page.querySelector('#btn-fav').onclick = () => {
    addFavorite(session.config, gemById(session.config.gemId).name + '·' + metalById(session.config.metalId).short);
    toast('已收藏当前搭配');
  };
  page.querySelector('#btn-split').onclick = () => toggleSplit(page, session);
  page.querySelector('#btn-to-render').onclick = () => { location.hash = '#/render'; };
  page.querySelector('#btn-reset').onclick = () => {
    session.config = defaultConfig();
    viewerA.setConfig(session.config); rebuildPanel(session); pushHistory(session.config); updateBadges();
    toast('已恢复默认参数');
  };
  page.querySelector('#btn-order').onclick = () => { location.hash = '#/orders'; };

  updateBadges();
}

function toolbarButtons(tag) {
  const presets = [['iso', '透视'], ['front', '正面'], ['left', '侧面'], ['top', '俯视']];
  const btns = presets.map(([k, label]) =>
    h('button', { onclick: e => { (tag === 'A' ? viewerA : viewerB).setCameraPreset(k); e.target.classList.add('on'); } }, label)
  );
  btns[0].classList.add('on');
  return btns;
}

function toggleSplit(page, session) {
  splitOn = !splitOn;
  const wrap = page.querySelector('#vp-wrap');
  page.querySelector('#btn-split').classList.toggle('on', splitOn);
  if (splitOn) {
    if (!session.splitB) session.splitB = JSON.parse(JSON.stringify(session.config));
    const vpB = h('div', { class: 'vp', id: 'vp-b' },
      h('div', { class: 'vp-toolbar' }, toolbarButtons('B')),
      h('div', { class: 'vp-badge', id: 'badge-b' })
    );
    wrap.append(vpB);
    viewerB = new ViewerScene(vpB);
    viewerB.onMeasure = updateBadges;
    viewerB.setConfig(session.splitB);
    viewerB.syncCameraFrom(viewerA);
    badgeB = vpB.querySelector('#badge-b');
    // B 视口底部操作: 同步A的视角 / 把B配置取回A
    vpB.querySelector('#badge-b').append(
      h('div', { class: 'btn-row', style: 'margin-top:8px' },
        h('button', { class: 'small', onclick: () => viewerB.syncCameraFrom(viewerA) }, '同步A视角'),
        h('button', { class: 'small', onclick: () => {
          session.config = JSON.parse(JSON.stringify(session.splitB));
          viewerA.setConfig(session.config); rebuildPanel(session); toast('B 款已取回主配置');
        } }, '取回B款'),
        h('button', { class: 'small', onclick: () => {
          session.splitB = JSON.parse(JSON.stringify(session.config));
          viewerB.setConfig(session.splitB); toast('已把当前A款复制为B款');
        } }, 'A→B')
      )
    );
    updateBadges();
  } else {
    viewerB?.dispose(); viewerB = null; badgeB = null;
    page.querySelector('#vp-b')?.remove();
  }
}

function rebuildPanel(session) {
  if (!panelHost) return;
  const c = session.config;
  const apply = applyFn;
  panelHost.innerHTML = '';
  const P = panelHost;

  // ---- 款式 ----
  P.append(h('div', { class: 'group-title' }, '款式'));
  P.append(segField('品类', [
    { label: '戒指', value: 'ring' }, { label: '吊坠', value: 'pendant' }, { label: '耳饰', value: 'earring' }
  ], c.category, v => apply({ category: v })));

  // ---- 金属 ----
  P.append(h('div', { class: 'group-title' }, '金属材质 PBR'));
  P.append(selectField('金属', METALS.map(m => ({ label: m.name, value: m.id })), c.metalId, v => apply({ metalId: v })));
  P.append(rangeField('金属度 metalness', c.metalness, 0, 1, 0.01, '', v => apply({ metalness: v })));
  P.append(rangeField('粗糙度 roughness', c.roughness, 0.02, 0.6, 0.01, '', v => apply({ roughness: v })));
  P.append(rangeField('金属壁厚', c.bandThickness, 0.8, 3, 0.1, ' mm', v => apply({ bandThickness: v })));
  if (c.category === 'ring') {
    P.append(rangeField('指圈号（港度）', c.ringSize, 6, 26, 1, ' 号', v => apply({ ringSize: v })));
    P.append(h('div', { class: 'muted', style: 'margin:-6px 0 12px' },
      '内径 ' + num(hkRingDiameter(c.ringSize), 2) + ' mm · 圈号变化戒圈实时缩放'));
  }
  if (c.category === 'pendant') {
    P.append(rangeField('吊咀口径', c.bailSize, 2.5, 7, 0.1, ' mm', v => apply({ bailSize: v })));
  }
  if (c.category === 'earring') {
    P.append(segField('耳饰结构', [
      { label: '耳钉', value: 'stud' }, { label: '耳坠', value: 'drop' }
    ], c.earringStyle, v => apply({ earringStyle: v })));
  }

  // ---- 主石 ----
  P.append(h('div', { class: 'group-title' }, '主石 · 物理光学'));
  P.append(selectField('宝石品种', GEMS.map(g => ({ label: `${g.name}（IOR ${g.ior} / 色散 ${g.dispersion}）`, value: g.id })), c.gemId, v => apply({ gemId: v })));
  P.append(segField('切工', GEM_CUTS.map(x => ({ label: x.name, value: x.id })), c.gemCut, v => apply({ gemCut: v })));
  P.append(rangeField('主石尺寸', c.gemSize, 3, 12, 0.1, ' mm', v => apply({ gemSize: v })));
  P.append(rangeField('亭深', c.gemHeight, 2, 8, 0.1, ' mm', v => apply({ gemHeight: v })));
  const g = gemById(c.gemId);
  P.append(h('div', { class: 'muted', style: 'margin:-6px 0 12px' },
    `折射率 n=${g.ior} · 色散=${g.dispersion} · 密度=${g.density} g/cm³ — 刻面几何真实生成`));

  // ---- 镶口 ----
  P.append(h('div', { class: 'group-title' }, '镶口'));
  P.append(segField('镶嵌方式', SETTINGS.map(s => ({ label: s.name, value: s.id })), c.setting, v => {
    const s = SETTINGS.find(x => x.id === v);
    apply({ setting: v, prongCount: Math.min(Math.max(c.prongCount, s.minCount), s.maxCount) });
  }));
  if (c.setting !== 'bezel') {
    const s = SETTINGS.find(x => x.id === c.setting);
    P.append(rangeField(c.setting === 'prong' ? '爪数量' : '密钉数量', c.prongCount, s.minCount, s.maxCount, 1, ' 个',
      v => apply({ prongCount: Math.round(v) })));
  }
  P.append(toggleField('围石群镶 halo（自动贴合曲面）', c.halo, v => apply({ halo: v })));
  if (c.halo) P.append(rangeField('围石数量', c.haloCount, 6, 24, 1, ' 颗', v => apply({ haloCount: Math.round(v) })));

  // ---- 渲染 ----
  P.append(h('div', { class: 'group-title' }, '视口渲染'));
  P.append(segField('环境背景', [{ label: '摄影棚', value: 'studio' }, { label: '白底', value: 'white' }], c.env,
    v => apply({ env: v })));
  P.append(toggleField('景深 DOF（Bokeh 物理虚化）', c.dof, v => apply({ dof: v })));
  P.append(toggleField('辉光 Bloom（火彩溢出）', c.bloom, v => apply({ bloom: v })));
  P.append(toggleField('物理焦散（折射光汇聚）', c.caustics, v => apply({ caustics: v })));

  // ---- 实时报价摘要 ----
  if (session.measured) {
    const q = estimateQuote(c, session.measured);
    P.append(h('div', { class: 'group-title' }, '实时估价'));
    P.append(h('div', { class: 'kv' }, h('span', {}, '金属重量'), h('b', {}, num(q.metal.weightG, 3) + ' g')));
    P.append(h('div', { class: 'kv' }, h('span', {}, '主石克拉'), h('b', {}, num(q.mainGem.carat, 2) + ' ct')));
    P.append(h('div', { class: 'kv' }, h('span', {}, '副石数量'), h('b', {}, q.sideGems.count + ' 颗')));
    P.append(h('div', { class: 'kv', style: 'margin-top:8px' }, h('span', {}, '预估总价'), h('b', { class: 'price' }, '¥' + Math.round(q.total).toLocaleString('zh-CN'))));
  }
  updateBadges();
}

function badgeHtml(c, measured) {
  const gem = gemById(c.gemId), metal = metalById(c.metalId);
  const base = h('div', {},
    h('div', {}, h('b', {}, metal.short), ' / ', h('b', {}, gem.name), ' · ', SETTINGS.find(s => s.id === c.setting).name),
    h('div', { class: 'muted' },
      c.category === 'ring' ? `港度 ${c.ringSize} 号 · 内径 ${num(hkRingDiameter(c.ringSize), 2)}mm` :
      c.category === 'pendant' ? `吊咀 ${c.bailSize}mm` : (c.earringStyle === 'stud' ? '耳钉一对' : '耳坠一对'),
      ` · 主石 ${c.gemSize}mm · 壁${c.bandThickness}mm`
    )
  );
  if (measured) {
    base.append(h('div', { class: 'muted' },
      `金属体积 ${num(measured.metalVolumeMm3, 1)} mm³ · 宝石体积 ${num(measured.gemVolumeMm3, 1)} mm³`));
  }
  return base;
}

function updateBadges() {
  if (!currentSession) return;
  if (badgeA) { badgeA.innerHTML = ''; badgeA.append(badgeHtml(currentSession.config, currentSession.measured)); }
  if (badgeB && currentSession.splitB) {
    const m = viewerB?.measured || null;
    const node = badgeHtml(currentSession.splitB, m);
    badgeB.innerHTML = '';
    badgeB.append(h('div', { style: 'color:var(--gold-2);font-weight:650;margin-bottom:4px' }, 'B 款（对比）'), node);
  }
}

function openHistory(session) {
  const list = historyList().reverse();
  const body = h('div', {}, list.map(item =>
    h('div', {
      class: 'flex-between',
      style: `padding:10px 12px;border:1px solid var(--line);border-radius:9px;margin-bottom:8px;cursor:pointer;${item.current ? 'border-color:var(--gold);background:rgba(201,168,106,.08)' : ''}`,
      onclick: () => {
        const cfg = jumpHistory(item.index);
        if (cfg) { session.config = cfg; viewerA.setConfig(cfg); rebuildPanel(session); m.close(); toast('已回到该历史版本'); }
      }
    },
      h('div', {},
        h('div', {}, `#${item.index + 1} ${gemById(item.config.gemId).name} · ${metalById(item.config.metalId).short} · ${SETTINGS.find(s => s.id === item.config.setting).name}`),
        h('div', { class: 'muted' }, `圈号 ${item.config.ringSize} · 主石 ${item.config.gemSize}mm · ${item.config.halo ? '围石' : '无围石'}`)
      ),
      item.current ? h('span', { class: 'pill' }, '当前') : null
    )
  ));
  const m = modal('配置历史（点击回退到任意版本）', body,
    h('button', { onclick: () => m.close() }, '关闭'));
}

