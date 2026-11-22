# 曜金工坊 · 珠宝定制 Web 工作台

门店现场用的 3D 珠宝定制网页：当场换材质、换宝石、改镶口与指圈，物理渲染看成品，一键出图、报价、建单。

## 启动

```bash
npm install
npm run dev        # 开发, 默认 http://localhost:5180
npm run build      # 生产构建, 输出 dist/
npm run preview    # 预览生产包
```

无需任何外部贴图/HDR/字体资源，环境光、字体、图标全部程序化生成，离线可跑。

## 五个页面

| 路由 | 页面 | 能力 |
|---|---|---|
| `#/catalog` | 款式库 | 戒指/吊坠/耳饰 9 个基础款，每张卡片是实时 WebGL 缩略图 |
| `#/workbench` | 配置工作台 | 参数化实时变形、分屏对比、历史回退/重做、收藏搭配 |
| `#/library` | 材质宝石库 | 5 种 PBR 金属、9 种宝石（真实 IOR/色散/密度）、3 切工、3 镶口 |
| `#/render` | 渲染出图 | 6 视角 × 2 背景批量出 1200×1200 PNG，图集 PDF |
| `#/orders` | 订单报价 | 参数存档、自动估重/克拉/报价、门店调价、PDF/CSV 导出 |

## 核心技术点（对应需求的“真算不贴图”）

- **PBR 金属**：`MeshPhysicalMaterial`，铂金/黄金/玫瑰金等可调 metalness、roughness，程序化 PMREM 摄影棚环境提供真实反射。
- **宝石光学**：`transmission` 物理透射 + 真实 `ior`（钻石 2.417、红宝 1.765…）+ r172 `dispersion` 物理色散 + Beer-Lambert 吸收色。
- **刻面几何**：圆/椭圆明亮切、祖母绿阶梯切全部程序化生成非索引多面体，逐面平面法线（flat shading），不是贴图。
- **物理焦散**：`src/three/caustics.js` 对宝石表面采样点做两次 Snell 折射（空气→宝石→空气），RGB 三通道用色散修正后的不同 IOR 分别解算地面落点，HalfFloat RT 累加，呈现真分光焦散。
- **同一渲染管线**：视口与出图共用 `ViewerScene`，所见即所得；轨道旋转/缩放、PCF 软阴影、Bokeh 景深、UnrealBloom 辉光。
- **真实计量**：金属/宝石体积用有向四面体法对实际三角网格求和（`geometryVolumeMm3`），金属重量 = 体积×密度，宝石 = 体积×密度÷0.2 折克拉。

## 参数化能力

- 戒指：港度 6–26 号查表插值内径，戒圈实时缩放；金属壁厚 0.8–3mm
- 镶口：爪镶（3–8 爪）/ 钉镶密钉（4–24 钉）/ 包镶；halo 围石群镶沿圆周自动排列贴合
- 吊坠：吊咀口径；耳饰：耳钉/耳坠成对生成
- 历史栈最多 40 步，可跳任意版本；收藏与订单存 localStorage

## 目录结构

```
src/
├── data/materials.js     金属/宝石/镶口物理常数与港度圈号表
├── state/store.js        配置/历史/收藏/订单持久化 + 报价计算
├── three/
│   ├── gemGeometry.js    三种刻面几何 + 体积/表面采样
│   ├── jewelryBuilder.js 参数化首饰构建(戒圈/镶口/吊坠/耳饰)
│   ├── caustics.js       Snell 折射 + RGB 色散焦散通道
│   ├── environment.js    程序化 PMREM 环境 + 灯光软阴影
│   ├── materials.js      PBR 材质工厂
│   └── viewerScene.js    视口/后期/截图主类
├── pages/                五个路由页面
├── export/pdf.js         报价单/图集 PDF(中文 canvas 栅格化)
└── ui/dom.js             DOM 与控件工具
tests/
├── verify.mjs            Playwright 全链路自动化
├── vol.test.mjs          体积算法正确性
└── pdf-unit.mjs          PDF 生成单元测试
```

## 自动化验证

```bash
node tests/vol.test.mjs    # 体积: 球/盒/柱/圆环对照解析公式
node tests/pdf-unit.mjs    # 两类 PDF 生成
node tests/verify.mjs      # 五页面交互全链路(需先 npm run dev)
```

测试用 headless Chromium + SwiftShader 软件渲染，建单出图较慢属正常；真机带 GPU 秒级完成。
