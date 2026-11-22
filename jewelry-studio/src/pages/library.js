// 材质宝石库页
import { h, toast } from '../ui/dom.js';
import { METALS, GEMS, GEM_CUTS, SETTINGS } from '../data/materials.js';
import { navigate } from '../main.js';
import { getFavorites, removeFavorite } from '../state/store.js';
import { subscribe } from '../state/store.js';

function toHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

export function renderLibrary(root, session) {
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, '材质宝石库'), h('p', {}, 'PBR 物理参数与真实光学常数 · 点击卡片即应用到当前工作台配置')),
      h('div', { class: 'btn-row' }, h('button', { class: 'primary', onclick: () => navigate('workbench') }, '前往工作台'))
    ),
    h('div', { class: 'page-body' },
      h('div', { class: 'group-title', style: 'font-size:14px;margin-top:0' }, '金属 PBR 材质'),
      h('div', { class: 'grid', id: 'metal-grid' }),
      h('div', { class: 'group-title', style: 'font-size:14px' }, '宝石 · 折射率 / 色散 / 密度'),
      h('div', { class: 'grid', id: 'gem-grid' }),
      h('div', { class: 'group-title', style: 'font-size:14px' }, '切工与镶口'),
      h('div', { class: 'grid', id: 'cut-grid' }),
      h('div', { class: 'group-title', style: 'font-size:14px' }, '我的收藏搭配'),
      h('div', { id: 'fav-list' })
    )
  );
  root.append(page);

  // 金属卡
  page.querySelector('#metal-grid').append(...METALS.map(m => h('div', { class: 'card' },
    h('div', { class: 'mat-swatch', style: `background:linear-gradient(135deg, ${toHex(m.color)} 0%, #2a2a2e 55%, ${toHex(m.color)} 100%)` }),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, m.name),
      h('div', { class: 'muted', style: 'margin:6px 0' }, m.note),
      h('div', { class: 'kv' }, h('span', {}, '密度'), h('b', {}, m.density + ' g/cm³')),
      h('div', { class: 'kv' }, h('span', {}, '参考金价'), h('b', {}, '¥' + m.pricePerGram + '/g')),
      h('div', { class: 'kv' }, h('span', {}, '默认粗糙度'), h('b', {}, m.roughness)),
      h('div', { class: 'divider' }),
      h('button', { class: 'small primary', style: 'width:100%;justify-content:center', onclick: () => {
        session.config.metalId = m.id; session.config.metalness = m.metalness; session.config.roughness = m.roughness;
        toast('已应用：' + m.name); navigate('workbench');
      } }, '应用此金属')
    )
  )));

  // 宝石卡
  page.querySelector('#gem-grid').append(...GEMS.map(g => h('div', { class: 'card' },
    h('div', { style: 'padding:22px 0 6px;background:radial-gradient(circle at 50% 40%, #222833, #14171d)' },
      h('div', { class: 'gem-dot', style: `background:radial-gradient(circle at 32% 28%, #ffffffcc, ${toHex(g.color)} 55%, #00000055);box-shadow:0 0 26px ${toHex(g.color)}88` })
    ),
    h('div', { class: 'body' },
      h('div', { class: 'title' }, g.name),
      h('div', { class: 'muted', style: 'margin:6px 0' }, g.note),
      h('div', { class: 'kv' }, h('span', {}, '折射率 IOR'), h('b', {}, g.ior)),
      h('div', { class: 'kv' }, h('span', {}, '色散系数'), h('b', {}, g.dispersion)),
      h('div', { class: 'kv' }, h('span', {}, '密度'), h('b', {}, g.density + ' g/cm³')),
      h('div', { class: 'kv' }, h('span', {}, '参考价'), h('b', {}, '¥' + g.pricePerCarat.toLocaleString() + '/ct')),
      h('div', { class: 'divider' }),
      h('button', { class: 'small primary', style: 'width:100%;justify-content:center', onclick: () => {
        session.config.gemId = g.id;
        if (g.id === 'emerald') session.config.gemCut = 'emerald';
        toast('已应用：' + g.name); navigate('workbench');
      } }, '应用此宝石')
    )
  )));

  // 切工 + 镶口
  const cutHost = page.querySelector('#cut-grid');
  cutHost.append(...GEM_CUTS.map(c => h('div', { class: 'card' },
    h('div', { class: 'body' },
      h('div', { class: 'title' }, c.name),
      h('div', { class: 'muted', style: 'margin:8px 0' },
        c.id === 'round' ? '57/58 刻面明亮式，火彩最强' :
        c.id === 'oval' ? '同明亮刻面拓扑，长轴拉伸显手指修长' :
        '八角阶梯刻面，亭部平行台阶，通透如镜'),
      h('button', { class: 'small', style: 'width:100%', onclick: () => { session.config.gemCut = c.id; navigate('workbench'); } }, '选择切工')
    )
  )));
  cutHost.append(...SETTINGS.map(s => h('div', { class: 'card' },
    h('div', { class: 'body' },
      h('div', { class: 'title' }, s.name + (s.id === 'bezel' ? '' : `（${s.minCount}~${s.maxCount}${s.id === 'prong' ? '爪' : '钉'}）`)),
      h('div', { class: 'muted', style: 'margin:8px 0' }, s.note),
      h('div', { class: 'kv' }, h('span', {}, '基础工费'), h('b', {}, '¥' + s.fee)),
      h('button', { class: 'small', style: 'width:100%', onclick: () => { session.config.setting = s.id; navigate('workbench'); } }, '选择镶口')
    )
  )));

  // 收藏
  const favHost = page.querySelector('#fav-list');
  const renderFavs = () => {
    const favs = getFavorites();
    favHost.innerHTML = '';
    if (!favs.length) { favHost.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, '☆'), '暂无收藏，去工作台把常用搭配收藏起来')); return; }
    favHost.append(h('div', { class: 'grid' }, ...favs.map(f => h('div', { class: 'card' },
      h('div', { class: 'body' },
        h('div', { class: 'flex-between' }, h('div', { class: 'title' }, f.label), h('span', { class: 'tag' }, f.at)),
        h('div', { class: 'muted', style: 'margin:8px 0' },
          `主石 ${f.config.gemSize}mm / ${f.config.gemCut} · 圈号 ${f.config.ringSize} · ${f.config.setting}${f.config.halo ? ' + 围石' : ''}`),
        h('div', { class: 'btn-row' },
          h('button', { class: 'small primary', style: 'flex:1', onclick: () => {
            session.config = JSON.parse(JSON.stringify(f.config)); navigate('workbench');
          } }, '载入工作台'),
          h('button', { class: 'small', onclick: () => removeFavorite(f.id) }, '删除')
        )
      )
    ))));
  };
  renderFavs();
  libraryUnsub = subscribe((name) => { if (name === 'favorites') renderFavs(); });
}

let libraryUnsub = null;
export function disposeLibrary() {
  libraryUnsub?.();
  libraryUnsub = null;
}
