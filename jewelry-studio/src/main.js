// 入口 + hash 路由
import './styles.css';
import { renderCatalog, disposeCatalog } from './pages/catalog.js';
import { renderWorkbench, disposeWorkbench } from './pages/workbench.js';
import { renderLibrary, disposeLibrary } from './pages/library.js';
import { renderRender, disposeRender } from './pages/render.js';
import { renderOrders } from './pages/orders.js';
import { defaultConfig } from './state/store.js';

const view = document.getElementById('view');
const navLinks = [...document.querySelectorAll('#nav a')];

const routes = {
  catalog: { mount: renderCatalog, dispose: disposeCatalog },
  workbench: { mount: renderWorkbench, dispose: disposeWorkbench },
  library: { mount: renderLibrary, dispose: disposeLibrary },
  render: { mount: renderRender, dispose: disposeRender },
  orders: { mount: renderOrders, dispose: () => {} }
};

let currentRouteName = null;

// 跨页传递的当前配置
export const session = {
  config: defaultConfig(),
  measured: null,
  splitB: null
};

function currentRoute() {
  const r = location.hash.replace('#/', '') || 'catalog';
  return routes[r] ? r : 'catalog';
}

export function navigate(route) {
  location.hash = '#/' + route;
}

function mount() {
  const r = currentRoute();
  if (currentRouteName && routes[currentRouteName]) routes[currentRouteName].dispose();
  currentRouteName = r;
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.route === r));
  view.innerHTML = '';
  routes[r].mount(view, session);
}

window.addEventListener('hashchange', mount);
if (!location.hash) location.hash = '#/catalog';
mount();
