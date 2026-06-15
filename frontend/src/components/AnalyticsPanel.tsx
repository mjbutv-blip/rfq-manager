/**
 * 数据洞察面板
 * 每种视图显示不同的分析维度：
 *  company  → 业务小组转化率 + 业务员转化率 + 整体漏斗
 *  group    → 组内业务员转化率 + 客户下单情况 + 产品分布
 *  sales    → 该业务员客户转化率 + 月度趋势 + 个人漏斗
 *  customer → 下单规律总结 + 产品/季节偏好 + 客户漏斗
 */

import { Card, Col, Progress, Row, Typography } from "antd"
import type { InquiryItem } from "@/types/inquiry"

const { Text } = Typography
type ViewMode = "company" | "group" | "sales" | "customer"

// ── 基础数据聚合 ──────────────────────────────────────────────────────────────

interface DimStat {
  name: string
  total: number       // 询单总数
  ordered: number     // 已下单数
  lost: number        // 流失数
  rate: number        // 转化率 %
  trade: number       // 总贸易额
  avgGp: number | null // 平均毛利率
}

function buildStats(items: InquiryItem[], key: keyof InquiryItem): DimStat[] {
  const map = new Map<string, { total: number; ordered: number; lost: number; trade: number; gp: number[] }>()
  items.forEach(r => {
    const k = String((r[key] as string | null) ?? "未知")
    if (!map.has(k)) map.set(k, { total: 0, ordered: 0, lost: 0, trade: 0, gp: [] })
    const s = map.get(k)!
    s.total++
    if (r.order_status === "下单") { s.ordered++; s.trade += r.trade_amount ?? 0 }
    if (r.order_status === "流失")   s.lost++
    if (r.gross_profit_rate != null) s.gp.push(r.gross_profit_rate)
  })
  return [...map.entries()]
    .map(([name, s]) => ({
      name,
      total:   s.total,
      ordered: s.ordered,
      lost:    s.lost,
      rate:    s.total > 0 ? Math.round(s.ordered / s.total * 100) : 0,
      trade:   s.trade,
      avgGp:   s.gp.length > 0 ? s.gp.reduce((a, b) => a + b, 0) / s.gp.length : null,
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
}

function countBy(items: InquiryItem[], key: keyof InquiryItem) {
  const map = new Map<string, number>()
  items.forEach(r => {
    const v = String((r[key] as string | null) ?? "未知")
    map.set(v, (map.get(v) ?? 0) + 1)
  })
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

// ── 转化率表格组件 ─────────────────────────────────────────────────────────────

function ConversionTable({ data, title, limit = 8 }: { data: DimStat[]; title: string; limit?: number }) {
  const rows = data.slice(0, limit)
  if (rows.length === 0) return <Text type="secondary">暂无数据</Text>

  return (
    <div>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{title}</Text>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #f0f0f0", color: "#999" }}>
            <th style={{ textAlign: "left",   padding: "3px 0",  fontWeight: 500 }}>名称</th>
            <th style={{ textAlign: "center", padding: "3px 4px", fontWeight: 500 }}>询单</th>
            <th style={{ textAlign: "center", padding: "3px 4px", fontWeight: 500 }}>下单</th>
            <th style={{ textAlign: "left",   padding: "3px 6px", fontWeight: 500, minWidth: 110 }}>转化率</th>
            <th style={{ textAlign: "right",  padding: "3px 0",  fontWeight: 500 }}>贸易额</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const rateColor = r.rate >= 60 ? "#52c41a" : r.rate >= 30 ? "#faad14" : "#ff4d4f"
            return (
              <tr key={r.name} style={{ borderBottom: "1px solid #fafafa" }}>
                <td style={{ padding: "5px 0", fontWeight: 500 }}>{r.name}</td>
                <td style={{ textAlign: "center", padding: "5px 4px", color: "#666" }}>{r.total}</td>
                <td style={{ textAlign: "center", padding: "5px 4px", color: "#52c41a", fontWeight: 600 }}>{r.ordered}</td>
                <td style={{ padding: "5px 6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Progress
                      percent={r.rate}
                      showInfo={false}
                      strokeColor={rateColor}
                      size="small"
                      style={{ flex: 1, margin: 0, minWidth: 60 }}
                    />
                    <Text style={{ fontSize: 11, color: rateColor, fontWeight: 600, minWidth: 32 }}>
                      {r.rate}%
                    </Text>
                  </div>
                </td>
                <td style={{ textAlign: "right", padding: "5px 0", fontSize: 11, color: "#666" }}>
                  {r.trade > 0 ? `$${r.trade.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── 转化漏斗 ──────────────────────────────────────────────────────────────────

function Funnel({ items, title = "订单转化漏斗" }: { items: InquiryItem[]; title?: string }) {
  const total   = items.length
  const quoted  = items.filter(r => r.quote_status && r.quote_status !== "未报价").length
  const ordered = items.filter(r => r.order_status === "下单").length
  const lost    = items.filter(r => r.order_status === "流失").length
  const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0

  const steps = [
    { label: "询单",   n: total,   color: "#1677ff" },
    { label: "已报价", n: quoted,  color: "#722ed1" },
    { label: "已下单", n: ordered, color: "#52c41a" },
    { label: "流失",   n: lost,    color: "#ff4d4f" },
  ]

  return (
    <div>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{title}</Text>
      {steps.map(s => (
        <div key={s.label} style={{ marginBottom: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={{ fontSize: 12 }}>{s.label}</Text>
            <Text style={{ fontSize: 12, color: "#888" }}>{s.n} 条 ({pct(s.n)}%)</Text>
          </div>
          <Progress percent={pct(s.n)} showInfo={false} strokeColor={s.color} size="small" style={{ margin: 0 }} />
        </div>
      ))}
      {total > 0 && (
        <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
          <div style={{ padding: "5px 10px", background: "#f6ffed", borderRadius: 4, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#52c41a" }}>{pct(ordered)}%</div>
            <div style={{ fontSize: 11, color: "#888" }}>转化率</div>
          </div>
          <div style={{ padding: "5px 10px", background: "#fff1f0", borderRadius: 4, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ff4d4f" }}>{pct(lost)}%</div>
            <div style={{ fontSize: 11, color: "#888" }}>流失率</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 横向条形图 ────────────────────────────────────────────────────────────────

function BarList({ data, title, color = "#1677ff", valuePrefix = "", limit = 6 }: {
  data: { name: string; value: number; extra?: string }[]
  title: string
  color?: string
  valuePrefix?: string
  limit?: number
}) {
  const rows = data.slice(0, limit)
  const max  = Math.max(...rows.map(d => d.value), 1)
  return (
    <div>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{title}</Text>
      {rows.length === 0 && <Text type="secondary">暂无数据</Text>}
      {rows.map(d => (
        <div key={d.name} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={{ fontSize: 12 }}>{d.name}</Text>
            <Text style={{ fontSize: 12, color: "#888" }}>{d.extra ?? `${valuePrefix}${d.value}`}</Text>
          </div>
          <Progress percent={Math.round(d.value / max * 100)} showInfo={false}
            strokeColor={color} size="small" style={{ margin: 0 }} />
        </div>
      ))}
    </div>
  )
}

// ── 客户下单规律总结 ───────────────────────────────────────────────────────────

function CustomerPattern({ items }: { items: InquiryItem[] }) {
  const total        = items.length
  const orderedItems = items.filter(r => r.order_status === "下单")
  const n            = orderedItems.length
  const rate         = total > 0 ? Math.round(n / total * 100) : 0

  const topProduct = countBy(orderedItems, "product_category")[0]?.name ?? "—"
  const topSeason  = countBy(orderedItems, "season")[0]?.name ?? "—"
  const avgQty     = n > 0
    ? Math.round(orderedItems.reduce((s, r) => s + (r.order_quantity ?? r.quantity ?? 0), 0) / n)
    : 0
  const avgTrade   = n > 0
    ? orderedItems.reduce((s, r) => s + (r.trade_amount ?? 0), 0) / n
    : 0

  const rateColor = rate >= 60 ? "#52c41a" : rate >= 30 ? "#faad14" : "#ff4d4f"

  return (
    <div>
      <Text strong style={{ fontSize: 13, display: "block", marginBottom: 10 }}>下单规律总结</Text>

      {/* 核心指标 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "询单总数",   val: `${total} 次` },
          { label: "下单次数",   val: `${n} 次`, color: "#52c41a" },
          { label: "询单转化率", val: `${rate}%`, color: rateColor },
          { label: "平均下单量", val: avgQty > 0 ? `${avgQty.toLocaleString()} 件` : "—" },
          { label: "偏好产品",   val: topProduct },
          { label: "偏好季节",   val: topSeason },
        ].map(item => (
          <div key={item.label} style={{ padding: "6px 8px", background: "#fafafa", borderRadius: 4 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: (item as any).color ?? "#262626" }}>
              {item.val}
            </div>
          </div>
        ))}
      </div>

      {/* 平均单价 */}
      {avgTrade > 0 && (
        <div style={{ padding: "6px 10px", background: "#e6f4ff", borderRadius: 4, textAlign: "center" }}>
          <Text style={{ fontSize: 11, color: "#888" }}>平均每单贸易额　</Text>
          <Text strong style={{ fontSize: 14, color: "#1677ff" }}>
            ${avgTrade.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Text>
        </div>
      )}
    </div>
  )
}

// ── 月度趋势 ──────────────────────────────────────────────────────────────────

const MONTH_ORDER = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function MonthlyTrend({ items }: { items: InquiryItem[] }) {
  const raw    = countBy(items, "inquiry_month")
  const sorted = [...raw].sort((a, b) => MONTH_ORDER.indexOf(a.name) - MONTH_ORDER.indexOf(b.name))
  return <BarList title="月度询单趋势" data={sorted.map(d => ({ name: d.name, value: d.count }))} color="#722ed1" />
}

// ── 主面板 ────────────────────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  items: InquiryItem[]
  total: number
  mode: ViewMode
}

export default function AnalyticsPanel({ items, total, mode }: AnalyticsPanelProps) {
  if (items.length === 0) return null

  let col1: React.ReactNode
  let col2: React.ReactNode
  let col3: React.ReactNode

  if (mode === "company") {
    // 全公司：小组转化率 | 业务员转化率（前5） | 整体漏斗
    const groupStats = buildStats(items, "group_name")
    const salesStats = buildStats(items, "responsible_sales").slice(0, 6)

    col1 = <ConversionTable data={groupStats} title="业务小组转化率" />
    col2 = <ConversionTable data={salesStats} title="业务员转化率排名" />
    col3 = <Funnel items={items} />

  } else if (mode === "group") {
    // 小组：组内业务员转化率 | 客户询单/下单 | 产品大类
    const salesStats = buildStats(items, "responsible_sales")
    const custStats  = buildStats(items, "customer_short_name")
    const catData    = countBy(items, "product_category")

    col1 = <ConversionTable data={salesStats} title="业务员转化率（本组）" />
    col2 = <ConversionTable data={custStats}  title="客户下单情况" />
    col3 = (
      <>
        <BarList title="产品大类分布" data={catData.map(d => ({ name: d.name, value: d.count }))} color="#fa8c16" />
        <div style={{ marginTop: 20 }}>
          <Funnel items={items} title="本组转化漏斗" />
        </div>
      </>
    )

  } else if (mode === "sales") {
    // 个人：客户询单转化率 | 月度趋势 | 个人漏斗
    const custStats = buildStats(items, "customer_short_name")

    col1 = <ConversionTable data={custStats} title="客户下单转化率" />
    col2 = <MonthlyTrend items={items} />
    col3 = <Funnel items={items} title="个人转化漏斗" />

  } else {
    // 客户：下单规律总结 | 产品/季节偏好 | 客户漏斗
    const orderedItems = items.filter(r => r.order_status === "下单")
    const catData      = countBy(orderedItems, "product_category")
    const seasonData   = countBy(orderedItems, "season")

    col1 = <CustomerPattern items={items} />
    col2 = (
      <>
        <BarList title="偏好产品大类（已下单）" data={catData.map(d => ({ name: d.name, value: d.count }))} color="#13c2c2" limit={4} />
        <div style={{ marginTop: 16 }}>
          <BarList title="偏好季节（已下单）" data={seasonData.map(d => ({ name: d.name, value: d.count }))} color="#fa8c16" limit={4} />
        </div>
      </>
    )
    col3 = <Funnel items={items} title="该客户转化漏斗" />
  }

  return (
    <Card
      size="small"
      title={
        <span>
          数据洞察
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8, fontWeight: 400 }}>
            基于本页 {items.length} 条 / 共 {total} 条
          </Text>
        </span>
      }
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: "14px 16px" } }}
    >
      <Row gutter={32} align="top">
        <Col span={8} style={{ borderRight: "1px solid #f0f0f0", paddingRight: 24 }}>{col1}</Col>
        <Col span={8} style={{ borderRight: "1px solid #f0f0f0", paddingRight: 24 }}>{col2}</Col>
        <Col span={8}>{col3}</Col>
      </Row>
    </Card>
  )
}
