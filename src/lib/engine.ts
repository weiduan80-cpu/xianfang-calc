// 828 新政现房销售 · 项目投资测算引擎
// 口径:股东现金流(开发贷受托支付不经过股东;利息资本化进贷款余额,竣备后回款优先还贷)
// 单位:金额为亿元,面积 万㎡,单价 元/㎡,时间 月(t=0 为拿地)

export type Mode = 'old' | 'newPresale' | 'cash'

export const MODE_LABEL: Record<Mode, string> = {
  old: '旧预售(对照)',
  newPresale: '新预售(封顶签约)',
  cash: '新现房(竣备销售)',
}

export interface ModelInputs {
  // 项目量价
  landPrice: number // 总地价(亿)
  deedRate: number // 契税及土地费用率 %
  buildArea: number // 计容建面(万㎡)
  saleArea: number // 可售建面(万㎡)
  salePrice: number // 销售均价(元/㎡)
  otherValue: number // 车位/商业等其他货值(亿)
  // 成本费用
  buildCostPer: number // 建安单方(元/㎡)
  prelimRate: number // 前期费费率(占建安)%
  mgmtRate: number // 管理费率(占货值)%
  sellExpRate: number // 营销费率(占货值)%
  // 开发节奏(月)
  startMonth: number // 开工
  topOutMonth: number // 主体封顶
  completeMonth: number // 竣工备案
  openMonthOld: number // 旧模式开盘(开工后约8个月,投入达25%即可预售)
  salesMonthsOld: number // 旧模式去化月数
  salesMonths: number // 现房模式去化月数
  signMonths: number // 新预售签约期(封顶后起,月)
  mortgageMonths: number // 新预售按揭放款月数(竣备后起)
  landFirstRatio: number // 土地首付比例 %
  landPayMonth2: number // 土地第二期月份
  landPayMonth3: number // 土地第三期月份
  // 资金与税负
  loanRatio: number // 开发贷比例(占开发总成本)%
  loanRate: number // 开发贷年利率 %
  depositRate: number // 现房定金比例(占货值,≤5)% 施工期收取、监管
  downPayRatio: number // 首付比例 %
  vatRate: number // 增值税率 %
  surchargeRate: number // 附加税率(占增值税)%
  citRate: number // 企业所得税率 %
}

export const DEFAULT_INPUTS: ModelInputs = {
  landPrice: 15,
  deedRate: 3.8,
  buildArea: 26.75,
  saleArea: 21.4,
  salePrice: 14000,
  otherValue: 1.5,
  buildCostPer: 2800,
  prelimRate: 10,
  mgmtRate: 1.5,
  sellExpRate: 2,
  startMonth: 2,
  topOutMonth: 20,
  completeMonth: 22,
  openMonthOld: 8,
  salesMonthsOld: 12,
  salesMonths: 10,
  signMonths: 6,
  mortgageMonths: 6,
  landFirstRatio: 50,
  landPayMonth2: 6,
  landPayMonth3: 12,
  loanRatio: 80,
  loanRate: 3.5,
  depositRate: 5,
  downPayRatio: 30,
  vatRate: 9,
  surchargeRate: 12,
  citRate: 25,
}

export interface MonthFlow {
  m: number
  equityCF: number // 当月股东现金流(流出为负)
  cumEquity: number // 累计股东净现金流
  sales: number // 当月销售签约额
  usable: number // 当月可用回款(监管前)
  released: number // 当月监管资金释放
  loanDraw: number
  loanRepay: number
  loanBalance: number
  interest: number
  constr: number
  landPay: number
  locked: number // 期末监管账户余额
}

export interface Milestone {
  m: number | string
  event: string
  cf: number | null
  cum: number
}

export interface EngineResult {
  flows: MonthFlow[]
  months: number
  revenue: number
  netProfit: number
  netMargin: number
  irr: number | null // 股东自有资金年化 IRR
  peakEquity: number // 自有资金峰值(占用)
  peakMonth: number
  paybackMonth: number | null // 资本回正时间
  totalInterest: number
  peakLoan: number
  landTotal: number
  devCost: number
  vat: number
  surcharge: number
  lvt: number
  cit: number
  totalCost: number
  milestones: Milestone[]
}

const spread = (from: number, to: number, total: number): Map<number, number> => {
  const map = new Map<number, number>()
  const n = Math.max(1, to - from + 1)
  for (let m = from; m <= to; m++) map.set(m, total / n)
  return map
}

const linear = (from: number, months: number, total: number): Map<number, number> => {
  const map = new Map<number, number>()
  if (months <= 0) {
    map.set(from, total)
    return map
  }
  for (let i = 0; i < months; i++) map.set(from + i, total / months)
  return map
}

const mapGet = (map: Map<number, number>, m: number): number => map.get(m) ?? 0

/** 土地增值税:四级超率累进 */
function calcLVT(revenueNet: number, landTotal: number, devCost: number, surcharge: number) {
  const deduct = landTotal + devCost * 1.2 + (landTotal + devCost) * 0.1 + surcharge
  const gain = revenueNet - deduct
  if (gain <= 0) return { lvt: 0, ratio: 0, deduct }
  const r = gain / deduct
  let lvt: number
  if (r <= 0.5) lvt = gain * 0.3
  else if (r <= 1) lvt = gain * 0.4 - deduct * 0.05
  else if (r <= 2) lvt = gain * 0.5 - deduct * 0.15
  else lvt = gain * 0.6 - deduct * 0.35
  return { lvt: Math.max(0, lvt), ratio: r, deduct }
}

function solveIRR(flows: number[]): number | null {
  // 月度 IRR,二分法
  const f = (r: number) => flows.reduce((acc, cf, m) => acc + cf / Math.pow(1 + r, m), 0)
  let lo = -0.5
  let hi = 1.0
  if (f(lo) * f(hi) > 0) return null
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (f(lo) * f(mid) <= 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

export function runModel(inp: ModelInputs, mode: Mode): EngineResult {
  const revenue = (inp.saleArea * inp.salePrice) / 10000 + inp.otherValue
  const landTotal = inp.landPrice * (1 + inp.deedRate / 100)
  const buildCost = (inp.buildArea * inp.buildCostPer) / 10000
  const devCost = buildCost * (1 + inp.prelimRate / 100)

  // 税金(全周期,按签约确认增值税;土增税/所得税竣工清算口径在清盘月缴纳)
  const outputVAT = Math.max(0, ((revenue - inp.landPrice) / (1 + inp.vatRate / 100)) * (inp.vatRate / 100))
  const inputVAT = (devCost / (1 + inp.vatRate / 100)) * (inp.vatRate / 100)
  const vat = Math.max(0, outputVAT - inputVAT)
  const surcharge = vat * (inp.surchargeRate / 100)
  const revenueNet = inp.landPrice + (revenue - inp.landPrice) / (1 + inp.vatRate / 100)
  const { lvt } = calcLVT(revenueNet, landTotal, devCost, surcharge)
  const mgmtFee = revenue * (inp.mgmtRate / 100)
  const sellExp = revenue * (inp.sellExpRate / 100)

  // 土地款支付计划
  const landSched = new Map<number, number>()
  landSched.set(0, landTotal * (inp.landFirstRatio / 100))
  const rest = landTotal * (1 - inp.landFirstRatio / 100)
  landSched.set(inp.landPayMonth2, mapGet(landSched, inp.landPayMonth2) + rest / 2)
  landSched.set(inp.landPayMonth3, mapGet(landSched, inp.landPayMonth3) + rest / 2)

  // 建安支出:85% 开工→封顶,15% 封顶→竣备
  const constrSched = new Map<number, number>()
  const pre = spread(inp.startMonth, inp.topOutMonth, devCost * 0.85)
  const post = spread(inp.topOutMonth + 1, inp.completeMonth, devCost * 0.15)
  pre.forEach((v, k) => constrSched.set(k, mapGet(constrSched, k) + v))
  post.forEach((v, k) => constrSched.set(k, mapGet(constrSched, k) + v))

  const mgmtSched = spread(inp.startMonth, inp.completeMonth, mgmtFee)

  // 销售/回款计划(按模式)
  const salesSched = new Map<number, number>() // 签约额
  const usableSched = new Map<number, number>() // 当月可用资金
  const lockedSched = new Map<number, number>() // 进入监管账户

  if (mode === 'old') {
    // 旧预售:签约即回款,当月可用(首付+按揭,简化按揭滞后 1-2 个月)
    linear(inp.openMonthOld, inp.salesMonthsOld, revenue).forEach((v, k) => {
      salesSched.set(k, mapGet(salesSched, k) + v)
      usableSched.set(k, mapGet(usableSched, k) + v)
    })
  } else if (mode === 'newPresale') {
    // 新预售:封顶签约,首付进监管锁定;按揭竣备后放款(竣备后到账即解除监管)
    linear(inp.topOutMonth, inp.signMonths, revenue * (inp.downPayRatio / 100)).forEach((v, k) => {
      salesSched.set(k, mapGet(salesSched, k) + v)
      if (k < inp.completeMonth) lockedSched.set(k, mapGet(lockedSched, k) + v)
      else usableSched.set(k, mapGet(usableSched, k) + v)
    })
    linear(inp.completeMonth, inp.mortgageMonths, revenue * (1 - inp.downPayRatio / 100)).forEach((v, k) => {
      salesSched.set(k, mapGet(salesSched, k) + v)
      usableSched.set(k, mapGet(usableSched, k) + v)
    })
  } else {
    // 新现房:施工期收定金(监管,含在总房价内,竣备后释放),竣备后网签即回款
    linear(inp.startMonth, Math.max(1, inp.topOutMonth - inp.startMonth + 1), revenue * (inp.depositRate / 100)).forEach(
      (v, k) => {
        salesSched.set(k, mapGet(salesSched, k) + v) // 定金即认购,计入销售确认
        lockedSched.set(k, mapGet(lockedSched, k) + v)
      }
    )
    linear(inp.completeMonth, inp.salesMonths, revenue * (1 - inp.depositRate / 100)).forEach((v, k) => {
      salesSched.set(k, mapGet(salesSched, k) + v)
      usableSched.set(k, mapGet(usableSched, k) + v)
    })
  }

  const settleMonth =
    mode === 'old'
      ? inp.openMonthOld + inp.salesMonthsOld
      : mode === 'newPresale'
        ? inp.completeMonth + inp.mortgageMonths
        : inp.completeMonth + inp.salesMonths

  const T = Math.min(72, Math.max(settleMonth + 6, inp.landPayMonth3 + 2, inp.completeMonth + 2))

  const loanCap = devCost * (inp.loanRatio / 100)
  const monthlyRate = inp.loanRate / 100 / 12

  // 前瞻资金需求:未来各月(土地+资本金建安+管理费+营销/增值税附加+清盘税)与未来可用回款的后缀差额,
  // 用于"可分配余额"判断——只有覆盖全部未来支出后的剩余资金才允许回流股东
  const suffixNeed: number[] = new Array(T + 2).fill(0)
  {
    let acc = 0
    for (let m = T; m >= 0; m--) {
      const salesRatio = revenue > 0 ? mapGet(salesSched, m) / revenue : 0
      const netNeed =
        mapGet(landSched, m) +
        mapGet(constrSched, m) * (1 - inp.loanRatio / 100) +
        mapGet(mgmtSched, m) +
        (sellExp + vat + surcharge) * salesRatio -
        mapGet(usableSched, m) -
        mapGet(lockedSched, m)
      acc += netNeed
      suffixNeed[m] = acc
    }
  }

  const simulate = (reserveSettle: number) => {
    let loanBalance = 0
    let peakLoan = 0
    let totalInterest = 0
    let lockedPool = 0
    let pool = 0
    let cumEquity = 0
    let peakEquity = 0
    let peakMonth = 0

    const flows: MonthFlow[] = []
    const equityFlows: number[] = []

    for (let m = 0; m <= T; m++) {
      // 1. 利息资本化
      const interest = loanBalance * monthlyRate
      loanBalance += interest
      totalInterest += interest

      // 2. 开发贷提取(受托支付工程款)
      const constr = mapGet(constrSched, m)
      const drawCap = Math.max(0, loanCap - (loanBalance - interest))
      const loanDraw = Math.min(drawCap, constr * (inp.loanRatio / 100))
      loanBalance += loanDraw
      peakLoan = Math.max(peakLoan, loanBalance)
      const equityConstr = constr - loanDraw

      // 3. 收入与监管释放
      const sales = mapGet(salesSched, m)
      const usable = mapGet(usableSched, m)
      lockedPool += mapGet(lockedSched, m)
      let released = 0
      if (m === inp.completeMonth && lockedPool > 0) {
        released = lockedPool
        lockedPool = 0
      }
      pool += usable + released

      // 4. 支出
      const landPay = mapGet(landSched, m)
      const salesRatio = revenue > 0 ? sales / revenue : 0
      const fees = mapGet(mgmtSched, m) + sellExp * salesRatio + (vat + surcharge) * salesRatio
      let tax = 0
      if (m === settleMonth) tax = reserveSettle // 土增税清算 + 所得税
      pool -= landPay + equityConstr + fees + tax

      // 5. 股东注入 / 分配(前瞻口径:覆盖全部未来支出后的剩余资金才回流)
      // 开发贷期限匹配项目建设期:竣备前不提前归还(避免提前清偿后再提取的失真),竣备后回款优先还贷
      let inject = 0
      let dist = 0
      if (pool < 0) {
        inject = -pool
        pool = 0
      }
      let repay = 0
      if (m >= inp.completeMonth) {
        repay = Math.min(loanBalance, pool)
        loanBalance -= repay
        pool -= repay
      }
      if (m >= inp.completeMonth && loanBalance <= 0.000001) {
        const futureNeed = (m < T ? suffixNeed[m + 1] : 0) + (settleMonth > m ? reserveSettle : 0)
        dist = Math.max(0, pool - Math.max(0, futureNeed))
        pool -= dist
      }
      // 期末清扫:剩余资金全部回流股东,保证现金流闭环
      if (m === T && pool > 0) {
        dist += pool
        pool = 0
      }
      cumEquity += dist - inject
      if (cumEquity < peakEquity) {
        peakEquity = cumEquity
        peakMonth = m
      }
      equityFlows.push(dist - inject)
      flows.push({
        m,
        equityCF: dist - inject,
        cumEquity,
        sales,
        usable,
        released,
        loanDraw,
        loanRepay: repay,
        loanBalance,
        interest,
        constr,
        landPay,
        locked: lockedPool,
      })
    }

    return { flows, equityFlows, totalInterest, peakLoan, peakEquity, peakMonth }
  }

  // 两遍模拟:第一遍得利息总额→算所得税;第二遍把土增税+所得税作为清盘预留,回正口径更保守
  // 口径:收入与开发成本均为不含税价,增值税不进利润表(附加税除外)
  const first = simulate(lvt)
  const devCostNet = devCost - inputVAT // 利润表口径:开发成本剔除进项税
  const ebt =
    revenueNet -
    landTotal -
    devCostNet -
    mgmtFee -
    sellExp -
    surcharge -
    lvt -
    first.totalInterest
  const cit = Math.max(0, ebt * (inp.citRate / 100))
  const sim = simulate(lvt + cit)

  const { flows, equityFlows, totalInterest, peakLoan } = sim
  let peakEquity = sim.peakEquity
  let peakMonth = sim.peakMonth
  const monthlyIRR = solveIRR(equityFlows)
  const irr = monthlyIRR === null ? null : Math.pow(1 + monthlyIRR, 12) - 1

  let paybackMonth: number | null = null
  for (let m = peakMonth; m < flows.length; m++) {
    if (flows[m].cumEquity >= -0.005) {
      paybackMonth = m
      break
    }
  }

  // 关键节点表
  const milestones: Milestone[] = []
  const at = (mm: number) => flows[Math.min(mm, flows.length - 1)]?.cumEquity ?? 0
  const cfAt = (mm: number) => flows[Math.min(mm, flows.length - 1)]?.equityCF ?? null
  milestones.push({ m: 0, event: `土地款首期(${inp.landFirstRatio}%,含契税)`, cf: cfAt(0), cum: at(0) })
  if (inp.startMonth > 0)
    milestones.push({ m: inp.startMonth, event: '开工,建安资本金按月投入', cf: cfAt(inp.startMonth), cum: at(inp.startMonth) })
  if (inp.landPayMonth2 > inp.startMonth)
    milestones.push({ m: inp.landPayMonth2, event: `土地款第二期(${((100 - inp.landFirstRatio) / 2).toFixed(0)}%)`, cf: cfAt(inp.landPayMonth2), cum: at(inp.landPayMonth2) })
  if (inp.landPayMonth3 > inp.landPayMonth2)
    milestones.push({ m: inp.landPayMonth3, event: `土地款第三期(${((100 - inp.landFirstRatio) / 2).toFixed(0)}%)`, cf: cfAt(inp.landPayMonth3), cum: at(inp.landPayMonth3) })
  milestones.push({
    m: inp.topOutMonth,
    event: mode === 'newPresale' ? '主体封顶,预售签约启动(首付进监管)' : mode === 'old' ? '主体封顶(已预售回款)' : '主体封顶',
    cf: cfAt(inp.topOutMonth),
    cum: at(inp.topOutMonth),
  })
  milestones.push({
    m: inp.completeMonth,
    event:
      mode === 'cash'
        ? `竣工备案,定金${(revenue * (inp.depositRate / 100)).toFixed(2)}亿释放,现房销售启动`
        : mode === 'newPresale'
          ? '竣工备案,监管资金释放,优先偿还开发贷'
          : '竣工备案',
    cf: cfAt(inp.completeMonth),
    cum: at(inp.completeMonth),
  })
  milestones.push({ m: peakMonth, event: '累计投入峰值(自有资金)', cf: cfAt(peakMonth), cum: at(peakMonth) })
  if (paybackMonth !== null && paybackMonth !== peakMonth)
    milestones.push({ m: paybackMonth, event: '资金回正', cf: cfAt(paybackMonth), cum: at(paybackMonth) })
  milestones.push({ m: settleMonth, event: `清盘结算(土增税清算${lvt.toFixed(2)}亿)`, cf: cfAt(settleMonth), cum: at(settleMonth) })

  const netProfit = ebt - cit
  const netMargin = revenue > 0 ? netProfit / revenue : 0

  return {
    flows,
    months: T + 1,
    revenue,
    netProfit,
    netMargin,
    irr,
    peakEquity,
    peakMonth,
    paybackMonth,
    totalInterest,
    peakLoan,
    landTotal,
    devCost,
    vat,
    surcharge,
    lvt,
    cit,
    totalCost: landTotal + devCost + mgmtFee + sellExp + totalInterest + vat + surcharge + lvt + cit,
    milestones,
  }
}

export interface BreakEven {
  salePrice: number | null // 保本销售均价(净利润=0)
  landPrice: number | null // 最高可承受总地价(净利润=0)
}

/** 扫描+二分求解净利润=0 的临界值(净利润对售价/地价单调不增,土增税档位拐点由扫描覆盖) */
function solveZero(fn: (x: number) => number, lo: number, hi: number): number | null {
  const N = 60
  let prevX = lo
  let prevY = fn(lo)
  if (Math.abs(prevY) < 1e-9) return lo
  for (let i = 1; i <= N; i++) {
    const x = lo + ((hi - lo) * i) / N
    const y = fn(x)
    if (Math.abs(y) < 1e-9) return x
    if (prevY * y < 0) {
      let a = prevX
      let b = x
      let fa = prevY
      for (let j = 0; j < 60; j++) {
        const mid = (a + b) / 2
        const fm = fn(mid)
        if (fa * fm <= 0) b = mid
        else {
          a = mid
          fa = fm
        }
      }
      return (a + b) / 2
    }
    prevX = x
    prevY = y
  }
  return null
}

/** 盈亏平衡:反算保本售价与最高可承受地价(当前模式口径,土增税/所得税随价格联动重算) */
export function solveBreakEven(inp: ModelInputs, mode: Mode): BreakEven {
  const base = runModel(inp, mode)
  const profitAt = (mut: Partial<ModelInputs>) => runModel({ ...inp, ...mut }, mode).netProfit

  const salePrice = solveZero(
    (p) => profitAt({ salePrice: p }),
    Math.max(500, inp.salePrice * 0.2),
    Math.max(1000, inp.salePrice * 2.5)
  )
  const landPrice = solveZero(
    (l) => profitAt({ landPrice: l }),
    0.01,
    Math.max(1, Math.max(inp.landPrice * 2.5, base.revenue * 1.5))
  )
  return { salePrice, landPrice }
}
