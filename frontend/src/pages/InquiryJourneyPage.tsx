/**
 * 单个订单的来龙去脉表（询单报价详情表）
 *
 * 只读汇总页，模仿 Excel 分区表格的视觉逻辑（深蓝/橙/绿/浅蓝色块 + 表头/数据行）。
 * 工厂报价部分的唯一数据源是 factory_quote_records（"工厂报价录入"卡片），这里不
 * 重复保存任何报价数据——每次都是从后端实时计算后展示。
 */

import type { ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Alert, Button, Space, Spin, Typography } from "antd"
import { ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons"

import { fetchInquiryJourney } from "@/api/inquiry_journey"
import type { JourneyFactoryQuoteBrief, JourneyPriceAnalysis, JourneyRound } from "@/types/inquiry_journey"

const { Title, Text } = Typography

// ── 颜色层级（不要求与 Excel 像素级一致，只保留分区识别度）─────────────────────
const C_DARK_BLUE = "#1f3864"
const C_ORANGE = "#ed7d31"
const C_GREEN = "#70ad47"
const C_LIGHT_BLUE = "#bdd7ee"
const C_LABEL_BG = "#dce6f1"

function dash(v: string | number | null | undefined): string {
  return v == null || v === "" ? "—" : String(v)
}

function money(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v}%`
}

// ── 通用：分区表头条 ────────────────────────────────────────────────────────────

function BandRow({ bands }: { bands: { label: string; color: string; span: number }[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        {bands.map((b, i) => <col key={i} span={b.span} />)}
      </colgroup>
      <tbody>
        <tr>
          {bands.map((b, i) => (
            <td
              key={i} colSpan={b.span}
              style={{
                background: b.color, color: "#fff", fontWeight: 600, textAlign: "center",
                padding: "6px 8px", border: "1px solid #fff", fontSize: 13,
              }}
            >
              {b.label}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

// ── 通用：标签/值字段行（标签浅色底，值白底）────────────────────────────────────

function FieldGrid({ fields }: { fields: { label: string; value: ReactNode; highlight?: boolean }[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <tbody>
        <tr>
          {fields.map((f, i) => (
            <td key={`l${i}`} style={{
              background: C_LABEL_BG, fontSize: 12, fontWeight: 500, textAlign: "center",
              padding: "5px 6px", border: "1px solid #d9d9d9", whiteSpace: "nowrap",
            }}>
              {f.label}
            </td>
          ))}
        </tr>
        <tr>
          {fields.map((f, i) => (
            <td key={`v${i}`} style={{
              background: f.highlight ? "#fff7e6" : "#fff", fontSize: 13, textAlign: "center",
              padding: "8px 6px", border: "1px solid #d9d9d9",
              fontWeight: f.highlight ? 600 : 400, color: f.highlight ? "#d4380d" : undefined,
            }}>
              {f.value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function factoryCell(c: JourneyFactoryQuoteBrief | null): { name: string; price: string } {
  if (!c) return { name: "—", price: "—" }
  return {
    name: c.factory_name ?? "—",
    price: c.factory_price != null ? `${money(c.factory_price)} ${c.currency ?? ""}/${c.price_unit ?? ""}` : "—",
  }
}

function PriceAnalysisFields({ analysis }: { analysis: JourneyPriceAnalysis }) {
  if (!analysis.comparable) {
    const reasonText = analysis.reason === "mismatch"
      ? "币种或单位不一致，暂不自动比较"
      : analysis.reason === "no_price"
      ? "暂无可比较的价格"
      : "暂无报价"
    return (
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ background: "#fff", textAlign: "center", padding: "16px 8px", border: "1px solid #d9d9d9", color: "#8c8c8c", fontSize: 12 }}>
              {reasonText}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <FieldGrid fields={[
      { label: "最低工厂", value: analysis.lowest_factories.join("、") || "—", highlight: true },
      { label: "最低价格", value: analysis.lowest_price != null ? `${money(analysis.lowest_price)} ${analysis.currency}/${analysis.price_unit}` : "—", highlight: true },
      { label: "第二低工厂", value: analysis.second_lowest_factories.join("、") || "—" },
      { label: "第二低价格", value: analysis.second_lowest_price != null ? `${money(analysis.second_lowest_price)} ${analysis.currency}/${analysis.price_unit}` : "—" },
    ]} />
  )
}

function OtherFactoriesTable({ items }: { items: JourneyFactoryQuoteBrief[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 4 }}>
      <Text type="secondary" style={{ fontSize: 12, display: "block", padding: "4px 6px", background: "#fafafa" }}>
        本轮其他工厂报价明细
      </Text>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["工厂", "工厂报价", "币种", "单位", "备注", "录入时间"].map(h => (
              <th key={h} style={{ background: "#f0f0f0", border: "1px solid #d9d9d9", padding: "4px 6px", fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "center" }}>{dash(it.factory_name)}</td>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "right" }}>{money(it.factory_price)}</td>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "center" }}>{dash(it.currency)}</td>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "center" }}>{dash(it.price_unit)}</td>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "center" }}>{dash(it.remark)}</td>
              <td style={{ border: "1px solid #d9d9d9", padding: "4px 6px", textAlign: "center" }}>
                {it.created_at ? new Date(it.created_at).toLocaleString("zh-CN") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoundBlock({ round }: { round: JourneyRound }) {
  const f1 = factoryCell(round.factory1)
  const f2 = factoryCell(round.factory2)
  return (
    <div style={{ marginBottom: 16, border: "1px solid #d9d9d9" }}>
      <div style={{ background: "#262626", color: "#fff", padding: "4px 10px", fontSize: 13, fontWeight: 600 }}>
        第 {round.quote_round} 轮报价
      </div>
      <BandRow bands={[
        { label: "工厂报价（含税含运费/元/件）", color: C_ORANGE, span: 2 },
        { label: "工厂价格分析", color: C_GREEN, span: 2 },
      ]} />
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <tbody>
          <tr>
            <td style={{ width: "12.5%" }}><FieldGrid fields={[{ label: "工厂1名称（含税含运费）", value: f1.name }]} /></td>
            <td style={{ width: "12.5%" }}><FieldGrid fields={[{ label: "工厂1价格", value: f1.price }]} /></td>
            <td style={{ width: "12.5%" }}><FieldGrid fields={[{ label: "工厂2名称（含税含运费）", value: f2.name }]} /></td>
            <td style={{ width: "12.5%" }}><FieldGrid fields={[{ label: "工厂2价格", value: f2.price }]} /></td>
            <td colSpan={4} style={{ width: "50%" }}><PriceAnalysisFields analysis={round.price_analysis} /></td>
          </tr>
        </tbody>
      </table>
      <OtherFactoriesTable items={round.other_factories} />
    </div>
  )
}

export default function InquiryJourneyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inquiry-journey", id],
    queryFn: () => fetchInquiryJourney(id!),
    enabled: !!id,
  })

  if (isLoading) {
    return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>
  }
  if (isError || !data) {
    const detail = (error as Error)?.message ?? "加载失败"
    return <div style={{ padding: 24 }}><Alert type="error" message="无法加载来龙去脉表" description={detail} showIcon /></div>
  }

  const { inquiry, customer, applicable_factory, rounds } = data

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/inquiry/${id}`)}>返回询单详情</Button>
      </Space>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 1100 }}>
          {/* 标题条 */}
          <div style={{ background: C_DARK_BLUE, color: "#fff", padding: "10px 16px", fontSize: 16, fontWeight: 700 }}>
            询单报价详情表｜{dash(inquiry.customer_code)}-{inquiry.inquiry_no}
          </div>

          {/* 基本信息 */}
          <FieldGrid fields={[
            { label: "客户代码", value: dash(inquiry.customer_code) },
            { label: "询单号", value: inquiry.inquiry_no },
            { label: "客户订单号", value: dash(inquiry.customer_order_no) },
            { label: "品名", value: dash(inquiry.style_count > 1 ? "多款式" : inquiry.product_name) },
            { label: "系列", value: dash(inquiry.series_name) },
            { label: "所属小组", value: dash(inquiry.group_name) },
            { label: "负责业务员", value: dash(inquiry.responsible_sales) },
            { label: "询单日期", value: dash(inquiry.inquiry_date) },
            { label: "客户名称", value: dash(customer?.customer_name ?? inquiry.customer_name) },
          ]} />

          {/* 报价基本参数 / 订单状态 */}
          <div style={{ marginTop: 12 }}>
            <BandRow bands={[
              { label: "报价基本参数", color: C_DARK_BLUE, span: 8 },
              { label: "订单状态", color: C_ORANGE, span: 6 },
            ]} />
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <tbody>
                <tr>
                  <td style={{ width: "57%" }}>
                    <FieldGrid fields={[
                      { label: "订单数量", value: dash(inquiry.order_quantity ?? inquiry.quantity) },
                      { label: "报价倍数", value: "—" },
                      { label: "运输费", value: "—" },
                      { label: "报价汇率", value: "—" },
                      { label: "最终报价", value: money(inquiry.final_quote) },
                      { label: "工厂价", value: money(inquiry.factory_price) },
                      { label: "毛利率", value: pct(inquiry.gross_profit_rate) },
                      { label: "备注", value: dash(inquiry.remark) },
                    ]} />
                  </td>
                  <td style={{ width: "43%" }}>
                    <FieldGrid fields={[
                      { label: "订单状态", value: dash(inquiry.order_status) },
                      { label: "当下汇率", value: "—" },
                      { label: "贸易额", value: money(inquiry.trade_amount) },
                      { label: "备注", value: dash(inquiry.remark) },
                      { label: "下单日期", value: dash(inquiry.order_date) },
                      { label: "适用工厂", value: dash(applicable_factory?.factory_name) },
                    ]} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 业务人员报价 */}
          <div style={{ marginTop: 12 }}>
            <BandRow bands={[{ label: "业务人员报价", color: C_DARK_BLUE, span: 1 }]} />
            <FieldGrid fields={[
              { label: "净利润%", value: "—" },
              { label: "佣金%", value: "—" },
              { label: "适用工厂", value: dash(applicable_factory?.factory_name) },
              {
                label: "适用工厂价格",
                value: applicable_factory?.factory_price != null
                  ? `${money(applicable_factory.factory_price)} ${applicable_factory.currency ?? ""}/${applicable_factory.price_unit ?? ""}`
                  : "—",
              },
              { label: "最终报价", value: money(inquiry.final_quote) },
              { label: "工厂价", value: money(inquiry.factory_price) },
              { label: "毛利率", value: pct(inquiry.gross_profit_rate) },
            ]} />
          </div>

          {/* 工厂报价轮次（核心区域） */}
          <div style={{ marginTop: 16 }}>
            <Title level={5} style={{ marginBottom: 8 }}>几轮报价综合分析</Title>
            {rounds.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", border: "1px dashed #d9d9d9", background: "#fafafa" }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  当前询单暂无工厂报价记录。请先在"工厂报价录入"区域新增报价。
                </Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/inquiry/${id}#factory-quote`)}>
                  去录入工厂报价
                </Button>
              </div>
            ) : (
              rounds.map(r => <RoundBlock key={r.quote_round} round={r} />)
            )}
          </div>

          {/* 目标价分析（暂无数据来源字段，统一显示 —） */}
          <div style={{ marginTop: 12, marginBottom: 24 }}>
            <BandRow bands={[{ label: "目标价分析", color: C_LIGHT_BLUE, span: 1 }]} />
            <FieldGrid fields={[
              { label: "客户目标价（美金）", value: "—" },
              { label: "报价/目标价比例", value: "—" },
              { label: "达目标需降（元/件）", value: "—" },
              { label: "倒推工厂目标价", value: "—" },
              { label: "毛利润额（人民币）", value: "—" },
            ]} />
          </div>
        </div>
      </div>
    </div>
  )
}
