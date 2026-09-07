import { useMemo, useState } from 'react'
import {
  runModel,
  solveBreakEven,
  DEFAULT_INPUTS,
  MODE_LABEL,
  type Mode,
  type ModelInputs,
  type EngineResult,
} from '@/lib/engine'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'

const fmt = (x: number, d = 2) =>
  x.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtSign = (x: number, d = 2) => (x > 0 ? `+${fmt(x, d)}` : fmt(x, d))
const fmtPct = (x: number | null, d = 1) => (x === null ? '—' : `${(x * 100).toFixed(d)}%`)
const month = (m: number | null) => (m === null ? '—' : `第${m}月`)

interface NumFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  slider?: { min: number; max: number; step: number }
  hint?: string
}

function NumField({ label, value, onChange, unit, step = 1, min, max, slider, hint }: NumFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground flex-1 truncate" title={label}>
          {label}
        </Label>
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            value={value}
            step={step}
            min={min}
            max={max}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!Number.isNaN(v)) onChange(v)
            }}
            className="h-7 w-20 sm:w-24 text-right tnum text-xs px-2"
          />
          {unit && <span className="text-xs text-muted-foreground w-8 shrink-0">{unit}</span>}
        </div>
      </div>
      {slider && (
        <Slider
          value={[value]}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          onValueChange={([v]) => onChange(v)}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
      </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium text-amber-400/90">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-4">{children}</CardContent>
    </Card>
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <Card className={`border-border/60 ${accent ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
      <CardContent className="px-4 py-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`tnum text-2xl font-semibold mt-1 ${accent ? 'text-amber-400' : ''}`}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  )
}

const MODE_COLORS: Record<Mode, string> = {
  old: '#8b949e',
  newPresale: '#d29922',
  cash: '#f0883e',
}

function CashFlowChart({ r, mode }: { r: EngineResult; mode: Mode }) {
  const data = r.flows.map((f) => ({
    m: `t=${f.m}`,
    当月股东现金流: +f.equityCF.toFixed(3),
    累计股东净现金流: +f.cumEquity.toFixed(3),
  }))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 8% 17%)" vertical={false} />
        <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'hsl(40 8% 58%)' }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(40 8% 58%)' }} tickFormatter={(v: number) => `${v}`} width={44} />
        <Tooltip
          contentStyle={{
            background: 'hsl(30 9% 10%)',
            border: '1px solid hsl(30 8% 20%)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'hsl(40 18% 92%)' }}
          formatter={(v: number) => [`${fmt(v)} 亿`, '']}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine x={`t=${r.peakMonth}`} stroke="#e5484d" strokeDasharray="4 4" label={{ value: '峰值', fontSize: 11, fill: '#e5484d' }} />
        {r.paybackMonth !== null && (
          <ReferenceLine
            x={`t=${r.paybackMonth}`}
            stroke="#3fb950"
            strokeDasharray="4 4"
            label={{ value: '回正', fontSize: 11, fill: '#3fb950' }}
          />
        )}
        <Bar dataKey="当月股东现金流" fill={MODE_COLORS[mode]} opacity={0.85} radius={[2, 2, 0, 0]} />
        <Line type="monotone" dataKey="累计股东净现金流" stroke="#58a6ff" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function Sensitivity({ inputs, mode }: { inputs: ModelInputs; mode: Mode }) {
  type Mut = (inp: ModelInputs) => ModelInputs
  const factors: { name: string; scenarios: { label: string; mut: Mut }[] }[] = [
    {
      name: '销售均价',
      scenarios: [
        { label: '-10%', mut: (i) => ({ ...i, salePrice: i.salePrice * 0.9 }) },
        { label: '-5%', mut: (i) => ({ ...i, salePrice: i.salePrice * 0.95 }) },
        { label: '基准', mut: (i) => i },
        { label: '+5%', mut: (i) => ({ ...i, salePrice: i.salePrice * 1.05 }) },
        { label: '+10%', mut: (i) => ({ ...i, salePrice: i.salePrice * 1.1 }) },
      ],
    },
    {
      name: '土地总价',
      scenarios: [
        { label: '-10%', mut: (i) => ({ ...i, landPrice: i.landPrice * 0.9 }) },
        { label: '-5%', mut: (i) => ({ ...i, landPrice: i.landPrice * 0.95 }) },
        { label: '基准', mut: (i) => i },
        { label: '+5%', mut: (i) => ({ ...i, landPrice: i.landPrice * 1.05 }) },
        { label: '+10%', mut: (i) => ({ ...i, landPrice: i.landPrice * 1.1 }) },
      ],
    },
    {
      name: mode === 'old' ? '去化周期(旧)' : mode === 'newPresale' ? '签约+放款周期' : '去化周期',
      scenarios: [
        {
          label: '-6月',
          mut: (i) =>
            mode === 'old'
              ? { ...i, salesMonthsOld: Math.max(1, i.salesMonthsOld - 6) }
              : mode === 'newPresale'
                ? { ...i, signMonths: Math.max(1, i.signMonths - 3), mortgageMonths: Math.max(1, i.mortgageMonths - 3) }
                : { ...i, salesMonths: Math.max(1, i.salesMonths - 6) },
        },
        {
          label: '-3月',
          mut: (i) =>
            mode === 'old'
              ? { ...i, salesMonthsOld: Math.max(1, i.salesMonthsOld - 3) }
              : mode === 'newPresale'
                ? { ...i, signMonths: Math.max(1, i.signMonths - 1), mortgageMonths: Math.max(1, i.mortgageMonths - 2) }
                : { ...i, salesMonths: Math.max(1, i.salesMonths - 3) },
        },
        { label: '基准', mut: (i) => i },
        {
          label: '+3月',
          mut: (i) =>
            mode === 'old'
              ? { ...i, salesMonthsOld: i.salesMonthsOld + 3 }
              : mode === 'newPresale'
                ? { ...i, signMonths: i.signMonths + 1, mortgageMonths: i.mortgageMonths + 2 }
                : { ...i, salesMonths: i.salesMonths + 3 },
        },
        {
          label: '+6月',
          mut: (i) =>
            mode === 'old'
              ? { ...i, salesMonthsOld: i.salesMonthsOld + 6 }
              : mode === 'newPresale'
                ? { ...i, signMonths: i.signMonths + 3, mortgageMonths: i.mortgageMonths + 3 }
                : { ...i, salesMonths: i.salesMonths + 6 },
        },
      ],
    },
    {
      name: '开发贷利率',
      scenarios: [
        { label: '-1pp', mut: (i) => ({ ...i, loanRate: i.loanRate - 1 }) },
        { label: '-0.5pp', mut: (i) => ({ ...i, loanRate: i.loanRate - 0.5 }) },
        { label: '基准', mut: (i) => i },
        { label: '+0.5pp', mut: (i) => ({ ...i, loanRate: i.loanRate + 0.5 }) },
        { label: '+1pp', mut: (i) => ({ ...i, loanRate: i.loanRate + 1 }) },
      ],
    },
  ]

  const rows = useMemo(
    () =>
      factors.map((f) => ({
        name: f.name,
        rows: f.scenarios.map((s) => {
          const r = runModel(s.mut(inputs), mode)
          return {
            label: s.label,
            netProfit: r.netProfit,
            netMargin: r.netMargin,
            irr: r.irr,
            payback: r.paybackMonth,
            peak: r.peakEquity,
          }
        }),
      })),
    [inputs, mode]
  )

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((f) => (
        <Card key={f.name} className="border-border/60">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium">{f.name}敏感性</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 pt-0">
            <div className="overflow-x-auto">
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-8">情景</TableHead>
                  <TableHead className="h-8 text-right">净利(亿)</TableHead>
                  <TableHead className="h-8 text-right">净利率</TableHead>
                  <TableHead className="h-8 text-right">IRR</TableHead>
                  <TableHead className="h-8 text-right">回正</TableHead>
                  <TableHead className="h-8 text-right">峰值(亿)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {f.rows.map((s) => (
                  <TableRow key={s.label} className={`text-xs tnum ${s.label === '基准' ? 'bg-amber-500/10' : ''}`}>
                    <TableCell className="py-1.5">{s.label}</TableCell>
                    <TableCell className="py-1.5 text-right">{fmt(s.netProfit)}</TableCell>
                    <TableCell className="py-1.5 text-right">{fmtPct(s.netMargin)}</TableCell>
                    <TableCell className="py-1.5 text-right">{fmtPct(s.irr)}</TableCell>
                    <TableCell className="py-1.5 text-right">{s.payback === null ? '—' : `${s.payback}月`}</TableCell>
                    <TableCell className="py-1.5 text-right">{fmt(s.peak)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function Home() {
  const [inputs, setInputs] = useState<ModelInputs>(DEFAULT_INPUTS)
  const [mode, setMode] = useState<Mode>('cash')

  const set = (key: keyof ModelInputs) => (v: number) => setInputs((p) => ({ ...p, [key]: v }))

  const r = useMemo(() => runModel(inputs, mode), [inputs, mode])
  const cmp = useMemo(
    () => ({
      old: runModel(inputs, 'old'),
      newPresale: runModel(inputs, 'newPresale'),
      cash: runModel(inputs, 'cash'),
    }),
    [inputs]
  )
  const gap = useMemo(() => {
    const base = -cmp.old.peakEquity
    const cur = -cmp[mode].peakEquity
    return cur - base
  }, [cmp, mode])

  const be = useMemo(() => solveBreakEven(inputs, mode), [inputs, mode])
  const beAll = useMemo(
    () =>
      ({
        old: solveBreakEven(inputs, 'old'),
        newPresale: solveBreakEven(inputs, 'newPresale'),
        cash: solveBreakEven(inputs, 'cash'),
      }) as Record<Mode, { salePrice: number | null; landPrice: number | null }>,
    [inputs]
  )
  const priceMargin = be.salePrice !== null ? (inputs.salePrice - be.salePrice) / inputs.salePrice : null
  const landHeadroom = be.landPrice !== null ? (be.landPrice - inputs.landPrice) / inputs.landPrice : null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold tracking-wide">
              现房销售投资测算
              <span className="ml-2 text-xs sm:text-sm font-normal text-muted-foreground">828 新政 · 三模式对比</span>
            </h1>
            <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
              口径:股东自有资金现金流 · 逐月模拟 · 购房资金全额监管至竣备
            </p>
          </div>
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
              {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                <TabsTrigger key={k} value={k} className="text-[11px] sm:text-xs px-2">
                  {MODE_LABEL[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[340px_1fr]">
        {/* 输入面板:桌面居左,手机排在结果之后 */}
        <div className="space-y-4 order-2 lg:order-1">
          <Group title="项目量价">
            <NumField label="总地价" value={inputs.landPrice} onChange={set('landPrice')} unit="亿" step={0.5}
              slider={{ min: 1, max: 50, step: 0.5 }} />
            <NumField label="契税及土地费用率" value={inputs.deedRate} onChange={set('deedRate')} unit="%" step={0.1} />
            <NumField label="计容建面" value={inputs.buildArea} onChange={set('buildArea')} unit="万㎡" step={0.5} />
            <NumField label="可售建面" value={inputs.saleArea} onChange={set('saleArea')} unit="万㎡" step={0.5} />
            <NumField label="销售均价" value={inputs.salePrice} onChange={set('salePrice')} unit="元/㎡" step={100}
              slider={{ min: 6000, max: 30000, step: 100 }} />
            <NumField label="其他货值(车位等)" value={inputs.otherValue} onChange={set('otherValue')} unit="亿" step={0.1} />
            <div className="rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground tnum">
              货值合计 {fmt(r.revenue)} 亿 · 楼面价 {(inputs.landPrice * 10000 / inputs.buildArea).toFixed(0)} 元/㎡ ·
              地货比 {(inputs.landPrice / r.revenue * 100).toFixed(0)}%
            </div>
          </Group>

          <Group title="成本费用">
            <NumField label="建安单方" value={inputs.buildCostPer} onChange={set('buildCostPer')} unit="元/㎡" step={50}
              slider={{ min: 1500, max: 6000, step: 50 }} />
            <NumField label="前期费费率(占建安)" value={inputs.prelimRate} onChange={set('prelimRate')} unit="%" step={0.5} />
            <NumField label="管理费率(占货值)" value={inputs.mgmtRate} onChange={set('mgmtRate')} unit="%" step={0.1} />
            <NumField label="营销费率(占货值)" value={inputs.sellExpRate} onChange={set('sellExpRate')} unit="%" step={0.1} />
            <div className="rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground tnum">
              开发总成本 {fmt(r.devCost)} 亿(含税前) · 土地含契税 {fmt(r.landTotal)} 亿
            </div>
          </Group>

          <Group title="开发节奏(月,t=0 拿地)">
            <NumField label="开工" value={inputs.startMonth} onChange={set('startMonth')} unit="月" min={0} />
            <NumField label="主体封顶" value={inputs.topOutMonth} onChange={set('topOutMonth')} unit="月" min={0} />
            <NumField label="竣工备案" value={inputs.completeMonth} onChange={set('completeMonth')} unit="月" min={0} />
            <Separator />
            <NumField label="土地首付比例" value={inputs.landFirstRatio} onChange={set('landFirstRatio')} unit="%" min={0} max={100} />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="土地二期月" value={inputs.landPayMonth2} onChange={set('landPayMonth2')} unit="月" min={0} />
              <NumField label="土地三期月" value={inputs.landPayMonth3} onChange={set('landPayMonth3')} unit="月" min={0} />
            </div>
            {mode === 'old' && (
              <>
                <NumField label="开盘(旧模式)" value={inputs.openMonthOld} onChange={set('openMonthOld')} unit="月" min={0} />
                <NumField label="旧模式去化月数" value={inputs.salesMonthsOld} onChange={set('salesMonthsOld')} unit="月" min={1} />
              </>
            )}
            {mode === 'newPresale' && (
              <>
                <NumField label="签约期(封顶起)" value={inputs.signMonths} onChange={set('signMonths')} unit="月" min={1} />
                <NumField label="按揭放款月数(竣备起)" value={inputs.mortgageMonths} onChange={set('mortgageMonths')} unit="月" min={1} />
              </>
            )}
            {mode === 'cash' && (
              <NumField label="现房去化月数(竣备起)" value={inputs.salesMonths} onChange={set('salesMonths')} unit="月" min={1} />
            )}
          </Group>

          <Group title="资金与税负">
            <NumField label="开发贷比例(占开发成本)" value={inputs.loanRatio} onChange={set('loanRatio')} unit="%" step={5}
              slider={{ min: 0, max: 100, step: 5 }} />
            <NumField label="开发贷年利率" value={inputs.loanRate} onChange={set('loanRate')} unit="%" step={0.1}
              slider={{ min: 2, max: 8, step: 0.1 }} />
            {mode === 'cash' && (
              <NumField label="定金比例(≤5%,施工期监管)" value={inputs.depositRate} onChange={set('depositRate')} unit="%" step={0.5} max={5} />
            )}
            {mode === 'newPresale' && (
              <NumField label="首付比例" value={inputs.downPayRatio} onChange={set('downPayRatio')} unit="%" step={5} max={100} />
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="增值税率" value={inputs.vatRate} onChange={set('vatRate')} unit="%" step={0.5} />
              <NumField label="附加税率(占增值税)" value={inputs.surchargeRate} onChange={set('surchargeRate')} unit="%" step={1} />
            </div>
            <NumField label="企业所得税率" value={inputs.citRate} onChange={set('citRate')} unit="%" step={1} />
          </Group>
        </div>

        {/* 结果区:手机置顶,桌面居右 */}
        <div className="space-y-4 min-w-0 order-1 lg:order-2">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
            <Kpi label="项目净利润(税后)" value={`${fmt(r.netProfit)} 亿`} sub={`货值 ${fmt(r.revenue)} 亿`} accent />
            <Kpi label="销售净利率" value={fmtPct(r.netMargin)} sub={`VS 旧预售 ${fmtPct(cmp.old.netMargin)}`} />
            <Kpi
              label="自有资金峰值"
              value={`${fmt(-r.peakEquity)} 亿`}
              sub={`第 ${r.peakMonth} 月 · ${gap >= 0 ? '+' : ''}${fmt(gap)} 亿 vs 旧预售`}
            />
            <Kpi label="资本回正时间" value={month(r.paybackMonth)} sub={`旧预售 ${month(cmp.old.paybackMonth)} · 差 ${r.paybackMonth !== null && cmp.old.paybackMonth !== null ? r.paybackMonth - cmp.old.paybackMonth : '—'} 月`} />
            <Kpi label="股东自有资金 IRR" value={fmtPct(r.irr)} sub={`旧预售 ${fmtPct(cmp.old.irr)}`} />
            <Kpi label="全周期利息(资本化)" value={`${fmt(r.totalInterest)} 亿`} sub={`峰值贷款 ${fmt(r.peakLoan)} 亿`} />
          </div>

          <Card className="border-border/60">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">
                股东现金流走势 <span className="text-xs font-normal text-muted-foreground">— {MODE_LABEL[mode]}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-2">
              <CashFlowChart r={r} mode={mode} />
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">三模式对比(同一项目参数)</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="overflow-x-auto">
              <Table className="min-w-[440px]">
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-8">指标</TableHead>
                    {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                      <TableHead key={k} className={`h-8 text-right ${k === mode ? 'text-amber-400' : ''}`}>
                        {MODE_LABEL[k]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    [
                      ['净利润(亿)', (x: EngineResult) => fmt(x.netProfit)],
                      ['销售净利率', (x: EngineResult) => fmtPct(x.netMargin)],
                      ['自有资金峰值(亿)', (x: EngineResult) => fmt(-x.peakEquity)],
                      ['峰值时点', (x: EngineResult) => `第${x.peakMonth}月`],
                      ['资本回正', (x: EngineResult) => month(x.paybackMonth)],
                      ['股东 IRR', (x: EngineResult) => fmtPct(x.irr)],
                      ['全周期利息(亿)', (x: EngineResult) => fmt(x.totalInterest)],
                    ] as [string, (x: EngineResult) => string][]
                  ).map(([label, fn]) => (
                    <TableRow key={label} className="text-xs tnum">
                      <TableCell className="py-1.5 text-muted-foreground">{label}</TableCell>
                      {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                        <TableCell key={k} className={`py-1.5 text-right ${k === mode ? 'text-amber-400 font-medium' : ''}`}>
                          {fn(cmp[k])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground px-2">
                新政后(新预售/新现房)峰值资金占用显著高于旧预售 —— 预售的去金融化使土地与建设期资金几乎全部由股东自有资金和开发贷覆盖,且占用周期拉长至竣备后。
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">
                盈亏平衡分析 <span className="text-xs font-normal text-muted-foreground">— 项目净利润 = 0 反算,土增税/所得税随价格联动重算</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-secondary/40 px-4 py-3">
                  <div className="text-xs text-muted-foreground">保本销售均价({MODE_LABEL[mode]})</div>
                  <div className="tnum text-2xl font-semibold text-amber-400 mt-1">
                    {be.salePrice === null ? '无解(全域亏损)' : `${Math.round(be.salePrice).toLocaleString('zh-CN')} 元/㎡`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    当前售价 {inputs.salePrice.toLocaleString('zh-CN')} 元/㎡ ·{' '}
                    {priceMargin === null
                      ? '—'
                      : priceMargin >= 0
                        ? <>安全边际 <span className="text-green-500 tnum">{(priceMargin * 100).toFixed(1)}%</span></>
                        : <>当前售价低于保本线 <span className="text-red-400 tnum">{(-priceMargin * 100).toFixed(1)}%</span></>}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-secondary/40 px-4 py-3">
                  <div className="text-xs text-muted-foreground">最高可承受总地价(净利=0)</div>
                  <div className="tnum text-2xl font-semibold text-amber-400 mt-1">
                    {be.landPrice === null ? '无解(当前条件无法覆盖地价)' : `${fmt(be.landPrice)} 亿`}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {be.landPrice === null
                      ? '—'
                      : `折合楼面价 ${((be.landPrice * 10000) / inputs.buildArea).toFixed(0)} 元/㎡ · 当前地价 ${fmt(inputs.landPrice)} 亿,${landHeadroom !== null && landHeadroom >= 0 ? '上浮空间' : '超出承受'} ${landHeadroom === null ? '—' : `${(Math.abs(landHeadroom) * 100).toFixed(1)}%`}`}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
              <Table className="min-w-[440px]">
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-8">盈亏临界值</TableHead>
                    {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                      <TableHead key={k} className={`h-8 text-right ${k === mode ? 'text-amber-400' : ''}`}>
                        {MODE_LABEL[k]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="text-xs tnum">
                    <TableCell className="py-1.5 text-muted-foreground">保本均价(元/㎡)</TableCell>
                    {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                      <TableCell key={k} className={`py-1.5 text-right ${k === mode ? 'text-amber-400 font-medium' : ''}`}>
                        {beAll[k].salePrice === null ? '—' : Math.round(beAll[k].salePrice!).toLocaleString('zh-CN')}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow className="text-xs tnum">
                    <TableCell className="py-1.5 text-muted-foreground">最高承受地价(亿)</TableCell>
                    {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
                      <TableCell key={k} className={`py-1.5 text-right ${k === mode ? 'text-amber-400 font-medium' : ''}`}>
                        {beAll[k].landPrice === null ? '—' : fmt(beAll[k].landPrice!)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                注:三种模式保本线接近——新政对「项目是否赚钱」的利润表冲击有限,真正的杀伤力在「占用多少资本、多久回正」(见上方对比表),即赚的是利润、压的是资本。
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="py-3 px-4 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">关键节点表(自动生成)</CardTitle>
              <Badge variant="outline" className="text-[11px]">
                峰值 {fmt(-r.peakEquity)} 亿 · 回正 {month(r.paybackMonth)}
              </Badge>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              <div className="overflow-x-auto">
              <Table className="min-w-[480px]">
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-8 w-20">时点</TableHead>
                    <TableHead className="h-8 min-w-[160px]">事件</TableHead>
                    <TableHead className="h-8 text-right w-28">当月股东现金流</TableHead>
                    <TableHead className="h-8 text-right w-28">累计股东净现金流</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.milestones.map((ms, i) => (
                    <TableRow key={i} className="text-xs tnum">
                      <TableCell className="py-1.5">t={ms.m}</TableCell>
                      <TableCell className="py-1.5 text-foreground/90 min-w-[160px]">{ms.event}</TableCell>
                      <TableCell className={`py-1.5 text-right ${(ms.cf ?? 0) > 0 ? 'text-green-500' : (ms.cf ?? 0) < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {ms.cf === null ? '—' : `${fmtSign(ms.cf)} 亿`}
                      </TableCell>
                      <TableCell className={`py-1.5 text-right ${ms.cum >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {fmtSign(ms.cum)} 亿
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 text-sm font-medium text-amber-400/90">敏感性分析 — {MODE_LABEL[mode]}</h3>
            <Sensitivity inputs={inputs} mode={mode} />
          </div>

          <Card className="border-border/60">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium">测算口径与假设</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed space-y-1.5">
              <p>1. 现金流为股东自有资金口径:土地款(含契税)全额自筹;开发贷按比例的 80% 受托支付工程款,不经过股东;利息资本化计入贷款余额,竣备后回款优先还贷,余额回流股东。</p>
              <p>2. 监管规则(828 新政):新预售模式首付全额监管、按揭竣备后放款;现房模式施工期定金(≤货值 5%)监管、竣备后释放;监管资金竣备时一次性解除。</p>
              <p>3. 建安支出 85% 开工→封顶匀速投入,15% 封顶→竣备;管理费开工→竣备分摊;营销费、增值税及附加随销售确认;土增税(四级超率累进)与所得税在清盘月缴纳,回正口径已预留该税费。</p>
              <p>4. 分配采用前瞻口径:仅当覆盖全部未来支出(含清算税费)后的剩余资金才允许回流股东,避免高估回正速度。利润表收入/成本为不含税价,增值税不进利润表。</p>
              <p>5. 本工具为静态参数测算,供投资可研参考,不构成投资建议;默认参数参考强二线城市典型项目,可按实际地块调整。</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
