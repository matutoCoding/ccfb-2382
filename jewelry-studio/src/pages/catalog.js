// 款式库页
import { CATALOG, defaultConfig } from '../state/store.js';
import { METALS, GEMS, GEM_CUTS, SETTINGS } from '../data/materials.js';
import { ViewerScene } from '../three/viewerScene.js';
import { h, toast } from '../ui/dom.js';
import { navigate } from '../main.js';

const thumbs = new Map();

export function disposeCatalog() {
  thumbs.forEach(v => v.dispose());
  thumbs.clear();
}

function makeThumb(cardEl, style) {
  const wrap = h('div', { class: 'thumb' });
  cardEl.append(wrap);
  requestAnimationFrame(() => {
    const viewer = new ViewerScene(wrap, { post: false });
    const cfg = defaultConfig({ ...style.config });
    viewer.setConfig(cfg);
    viewer.setCameraPreset(style.category === 'ring' ? 'iso' : 'front');
    viewer.controls.enableRotate = false;
    thumbs.set(style.id, viewer);
  });
}

export function renderCatalog(root, session) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h1', {}, '款式库'),
        h('p', {}, '基础款 9 款 · 戒指 / 吊坠 / 耳饰 · 选中即入工作台参数化改款')
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'primary', onclick: () => { session.config = defaultConfig(); navigate('workbench'); } }, '＋ 空白定制')
      )
    ),
    h('div', { class: 'page-body' },
      h('div', { class: 'grid', id: 'cat-grid' })
    )
  );
  root.append(page);
  const grid = page.querySelector('#cat-grid');

  const cats = [
    ['ring', '戒指'], ['pendant', '吊坠'], ['earring', '耳饰']
  ];
  for (const [cat, label] of cats) {
    for (const style of CATALOG.filter(s => s.category === cat)) {
      const cfg = defaultConfig({ ...style.config });
      const metal = METALS.find(m => m.id === cfg.metalId);
      const gem = GEMS.find(g => g.id === cfg.gemId);
      const cut = GEM_CUTS.find(c => c.id === cfg.gemCut);
      const setting = SETTINGS.find(s => s.id === cfg.setting);

      const card = h('div', { class: 'card' });
      makeThumb(card, style);
      card.append(
        h('div', { class: 'body' },
          h('div', { class: 'title' }, style.name),
          h('div', { class: 'desc' }, style.desc),
          h('div', { class: 'tags' },
            h('span', { class: 'tag gold' }, metal.short),
            h('span', { class: 'tag' }, gem.name + '·' + cut.short),
            h('span', { class: 'tag' }, setting.name)
          ),
          h('div', { class: 'divider' }),
          h('div', { class: 'btn-row' },
            h('button', {
              class: 'primary small', style: 'flex:1;justify-content:center',
              onclick: () => {
                session.config = defaultConfig({ ...style.config });
                session.splitB = null;
                toast('已载入工作台：' + style.name);
                navigate('workbench');
              }
            }, '进入定制'),
            h('button', {
              class: 'small',
              onclick: () => {
                session.config = defaultConfig({ ...style.config });
                session.splitB = null;
                navigate('render');
              }
            }, '直接出图')
          )
        )
      );
      grid.append(card);
    }
  }
}
