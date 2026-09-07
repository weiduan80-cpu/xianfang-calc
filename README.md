# 现房销售投资测算 · 828 新政

828 新政(现房销售模式)下地产项目财务投资测算工具:输入地价、售价、建安成本、融资比例、开发节奏等参数,自动输出**净利润 / 净利率、自有资金峰值、资本回正时间、股东 IRR**,并对比「旧预售 / 新预售(封顶签约) / 新现房(竣备销售)」三种模式。

- 📱 手机 / 桌面自适应,结果置顶 + 宽表横滑
- 📊 股东现金流逐月模拟(监管资金锁定/释放、开发贷受托支付、利息资本化)
- ⚖️ 盈亏平衡反算(保本售价 / 最高可承受地价,土增税与所得税联动重算)
- 🔬 敏感性分析(售价 / 地价 / 去化周期 / 利率)

> 本工具为静态参数测算,供投资可研参考,不构成投资建议。

## 使用

线上地址(GitHub Pages):https://weiduan80-cpu.github.io/xianfang-calc/

本地运行:`npm install && npm run dev`;构建单文件版:`npm run build`(产物 `dist/index.html`,双击即可离线使用)。

## 技术栈

React 19 · Vite 7 · Tailwind CSS 3 · shadcn/ui · Recharts · TypeScript(测算引擎见 `src/lib/engine.ts`)

## 部署说明

`.github/workflows/` 目录需通过网页端创建(见 `ci/pages-workflow.yml` 模板):仓库 **Settings → Pages → Source 选 GitHub Actions**,然后把 `ci/pages-workflow.yml` 内容粘贴到新建文件 `.github/workflows/pages.yml` 并提交,推送到 main 即自动构建发布。
