/**
 * 单个订单的来龙去脉表（询单报价详情表）
 *
 * 只读汇总页，模仿 Excel 分区表格的视觉逻辑（深蓝/橙/绿/浅蓝色块 + 表头/数据行）。
 * 工厂报价部分的唯一数据源是 factory_quote_records（"工厂报价录入"卡片），这里不
 * 重复保存任何报价数据——每次都是从后端实时计算后展示。
 */

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, Button, Drawer, Form, InputNumber, Select, Space, Spin, Table, Tag, Typography, message } from "antd"
import { ArrowLeftOutlined, CalculatorOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons"

import { analyzeFirstQuoteRound, createFirstRoundQuoteItem, fetchInquiryJourney, updateQuoteItem, type QuoteItemUpdateBody } from "@/api/inquiry_journey"
import { fetchInquiryStyleItems } from "@/api/inquiry_items"
import type {
  JourneyFactoryQuoteBrief,
  JourneyFirstRound,
  JourneyFirstRoundAnalysisBundle,
  JourneyFirstRoundFactoryAnalysis,
  JourneyHistoricalPriceReference,
  InquiryJourney,
  JourneyPriceAnalysis,
  JourneyRound,
} from "@/types/inquiry_journey"
import type { InquiryStyleItem } from "@/types/inquiry_style_item"

const { Text } = Typography

// ── 颜色层级（不要求与 Excel 像素级一致，只保留分区识别度）─────────────────────
const C_DARK_BLUE = "#1f3864"
const C_GREEN = "#70ad47"
const C_LIGHT_BLUE = "#bdd7ee"
const C_LABEL_BG = "#dce6f1"
const JOURNEY_SCALE_KEY = "rfq_inquiry_journey_scale"
const JOURNEY_SCALE_OPTIONS = [
  { label: "100%", value: 1 },
  { label: "90%", value: 0.9 },
  { label: "80%", value: 0.8 },
  { label: "70%", value: 0.7 },
]

function dash(v: string | number | null | undefined): string {
  return v == null || v === "" ? "—" : String(v)
}

function money(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function ratioPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—"
  return `${(v * 100).toFixed(1)}%`
}

function signedMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—"
  const sign = v > 0 ? "+" : ""
  return `${sign}${money(v)}`
}

function joined(names: string[] | null | undefined): string {
  return names && names.length > 0 ? names.join("、") : "—"
}

function priceWithUnit(value: number | null | undefined, currency?: string | null, unit?: string | null): string {
  if (value == null) return "—"
  const suffix = [currency, unit ? `/${unit}` : ""].filter(Boolean).join("")
  return `${money(value)}${suffix ? ` ${suffix}` : ""}`
}

function quoteTypeName(v: string | null | undefined): string {
  return v === "overseas" ? "海外" : "国内"
}

function roundName(n: number): string {
  const names = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
  if (n >= 0 && n <= 10) return names[n]
  if (n < 20) return `十${names[n - 10]}`
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${names[tens]}十${ones ? names[ones] : ""}`
}

function alertType(level?: string): "success" | "info" | "warning" | "error" {
  if (level === "success" || level === "error" || level === "warning") return level
  return "info"
}

function SectionTitle({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      background: color, color: "#fff", fontWeight: 700, textAlign: "center",
      padding: "7px 10px", border: "1px solid #d9d9d9", borderBottom: 0,
      fontSize: 13,
      lineHeight: 1.2,
    }}>
      {label}
    </div>
  )
}

type ExcelField = { label: string; value: ReactNode; highlight?: boolean }

function ExcelTwoRowTable({ fields, groups }: { fields?: ExcelField[]; groups?: ExcelField[][] }) {
  const rows = groups ?? (fields ? [fields] : [])
  return (
    <div style={{ width: "100%" }}>
      {rows.map((row, rowIndex) => (
        <table
          key={rowIndex}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            marginTop: rowIndex === 0 ? 0 : -1,
          }}
        >
          <tbody>
            <tr>
              {row.map(f => (
                <th key={f.label} style={{
                  background: C_LABEL_BG, border: "1px solid #bfbfbf", padding: "4px 5px",
                  textAlign: "center", fontSize: 12, fontWeight: 600, whiteSpace: "normal",
                  lineHeight: 1.2, wordBreak: "break-word",
                }}>
                  {f.label}
                </th>
              ))}
            </tr>
            <tr>
              {row.map(f => (
                <td key={f.label} style={{
                  background: f.highlight ? "#fff7e6" : "#fff", border: "1px solid #d9d9d9",
                  padding: "4px 5px", textAlign: "center", fontSize: 12,
                  color: f.highlight ? "#d4380d" : undefined, fontWeight: f.highlight ? 700 : 400,
                  lineHeight: 1.2, wordBreak: "break-word",
                }}>
                  {f.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
    </div>
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
              padding: "4px 5px", border: "1px solid #d9d9d9", whiteSpace: "normal",
              lineHeight: 1.2, wordBreak: "break-word",
            }}>
              {f.label}
            </td>
          ))}
        </tr>
        <tr>
          {fields.map((f, i) => (
            <td key={`v${i}`} style={{
              background: f.highlight ? "#fff7e6" : "#fff", fontSize: 13, textAlign: "center",
              padding: "5px 5px", border: "1px solid #d9d9d9",
              fontWeight: f.highlight ? 600 : 400, color: f.highlight ? "#d4380d" : undefined,
              lineHeight: 1.2, wordBreak: "break-word",
            }}>
              {f.value}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function RoundPriceAnalysisSection({
  label,
  analysis,
  quoteCount,
}: {
  label: string
  analysis: JourneyPriceAnalysis
  quoteCount: number
}) {
  const reasonText = analysis.reason === "mismatch"
    ? "币种或单位不一致，暂不自动比较"
    : analysis.reason === "no_price"
    ? "暂无可比较的价格"
    : analysis.reason === "no_quotes"
    ? "暂无报价"
    : null
  return (
    <div style={{ marginTop: 4 }}>
      <SectionTitle label={label} color={C_GREEN} />
      {reasonText && (
        <div style={{
          background: "#fffbe6", border: "1px solid #ffe58f", borderBottom: 0,
          padding: "8px 10px", color: "#8c6d1f", fontSize: 13,
        }}>
          {reasonText}
        </div>
      )}
      <ExcelTwoRowTable groups={[[
        { label: "参与报价工厂数量", value: quoteCount },
        { label: "比较口径", value: analysis.comparable ? `${dash(analysis.currency)} / ${dash(analysis.price_unit)}` : "—" },
        { label: "最低报价工厂", value: joined(analysis.lowest_factories), highlight: true },
        { label: "最低报价", value: priceWithUnit(analysis.lowest_price, analysis.currency, analysis.price_unit), highlight: true },
        { label: "第二低报价工厂", value: joined(analysis.second_lowest_factories) },
        { label: "第二低报价", value: priceWithUnit(analysis.second_lowest_price, analysis.currency, analysis.price_unit) },
      ]]} />
    </div>
  )
}

function factoryQuoteTags(
  it: JourneyFactoryQuoteBrief,
  analysis: JourneyPriceAnalysis | JourneyFirstRoundFactoryAnalysis,
) {
  const name = it.factory_name ?? ""
  const isLowest = it.is_lowest || analysis.lowest_factories.includes(name)
  const isSecondLowest = analysis.second_lowest_factories.includes(name)
  const isHighest = it.is_highest || ("highest_factories" in analysis && analysis.highest_factories.includes(name))
  const isSelected = it.is_selected
  return { isLowest, isSecondLowest, isHighest, isSelected }
}

function quoteRankLabel(it: JourneyFactoryQuoteBrief, analysis: JourneyPriceAnalysis | JourneyFirstRoundFactoryAnalysis): string {
  const tags = factoryQuoteTags(it, analysis)
  if (tags.isLowest) return "最低"
  if (tags.isSecondLowest) return "第二低"
  const price = it.factory_price
  if (price == null || !analysis.comparable) return "—"
  const prices = Array.from(new Set([
    analysis.lowest_price,
    analysis.second_lowest_price,
    "highest_price" in analysis ? analysis.highest_price : null,
    price,
  ].filter((v): v is number => v != null))).sort((a, b) => a - b)
  const rank = prices.findIndex(v => v === price) + 1
  if (rank === 3) return "第三低"
  if (tags.isHighest) return "最高"
  return rank > 0 ? `第${rank}低` : "—"
}

function quoteGapRatio(it: JourneyFactoryQuoteBrief, analysis: JourneyPriceAnalysis | JourneyFirstRoundFactoryAnalysis): string {
  if (!analysis.comparable || it.factory_price == null || !analysis.lowest_price) return "—"
  return ratioPct((it.factory_price - analysis.lowest_price) / analysis.lowest_price)
}

function quoteRankTag(label: string): ReactNode {
  if (label === "最低") return <Tag color="green">最低</Tag>
  if (label === "第二低") return <Tag color="gold">第二低</Tag>
  if (label === "最高") return <Tag color="red">最高</Tag>
  if (label === "—") return <Text type="secondary">—</Text>
  return <Tag color="orange">{label}</Tag>
}

function FactoryQuoteDetails({
  label,
  items,
  analysis,
  emptyText,
  showMetaColumns = true,
}: {
  label: string
  items: JourneyFactoryQuoteBrief[]
  analysis: JourneyPriceAnalysis | JourneyFirstRoundFactoryAnalysis
  emptyText: string
  showMetaColumns?: boolean
}) {
  const headers = showMetaColumns
    ? ["工厂", "工厂报价", "币种", "单位", "标识", "备注", "来源", "录入时间"]
    : ["工厂", "工厂报价", "币种", "单位", "标识", "备注"]
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label={label} color={C_LIGHT_BLUE} />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ background: "#f0f5ff", border: "1px solid #bfbfbf", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ border: "1px solid #d9d9d9", padding: "16px 8px", textAlign: "center", color: "#8c8c8c" }}>
                {emptyText}
              </td>
            </tr>
          ) : items.map(it => {
            const tags = factoryQuoteTags(it, analysis)
            return (
              <tr key={it.id}>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.factory_name)}</td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "right" }}>{money(it.factory_price)}</td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.currency)}</td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.price_unit)}</td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>
                  <Space size={4} wrap>
                    {tags.isLowest && <Tag color="green">最低</Tag>}
                    {tags.isSecondLowest && <Tag color="gold">第二低</Tag>}
                    {tags.isHighest && <Tag color="red">最高</Tag>}
                    {tags.isSelected && <Tag color="blue">选用工厂</Tag>}
                    {!tags.isLowest && !tags.isSecondLowest && !tags.isHighest && !tags.isSelected && <Text type="secondary">—</Text>}
                  </Space>
                </td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.remark)}</td>
                {showMetaColumns && (
                  <>
                    <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.source)}</td>
                    <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>
                      {it.created_at ? new Date(it.created_at).toLocaleString("zh-CN") : "—"}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function analysisReason(analysis: JourneyFirstRoundFactoryAnalysis): string | null {
  if (analysis.comparable) return null
  if (analysis.reason === "mismatch") return "币种或单位不一致，暂不进行价格比较"
  if (analysis.reason === "no_price") return "暂无有效工厂报价，暂不进行价格比较"
  return "暂无第一轮国内工厂报价"
}

function AnalysisAlerts({ messages }: { messages: { level?: string; title: string; message?: string }[] }) {
  if (!messages.length) return null
  return (
    <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size={8}>
      {messages.map((m, idx) => (
        <Alert key={`${m.title}-${idx}`} type={alertType(m.level)} showIcon message={m.title} description={m.message} />
      ))}
    </Space>
  )
}

function FirstRoundExcelSheet({
  firstRound,
  inquiryId,
  analysis,
  canEdit,
  onRecalculate,
  recalculating,
  onSaved,
}: {
  firstRound: JourneyFirstRound
  inquiryId: string
  analysis: JourneyFirstRoundAnalysisBundle
  canEdit: boolean
  onRecalculate: () => void
  recalculating: boolean
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [msgApi, ctx] = message.useMessage()
  const queryClient = useQueryClient()
  const [showSamples, setShowSamples] = useState(false)
  const q = firstRound.quote_item
  const fa = analysis.factory_price_analysis
  const risk = analysis.factory_risk_analysis
  const historical = analysis.historical_price_reference
  const target = analysis.customer_target_price_analysis
  const advice = analysis.factory_selection_advice
  const factoryOptions = Array.from(new Set(firstRound.factory_quotes.map(f => f.factory_name).filter(Boolean) as string[]))
    .map(name => ({ label: name, value: name }))
  const saveMutation = useMutation({
    mutationFn: (values: QuoteItemUpdateBody) => q?.id ? updateQuoteItem(q.id, values) : createFirstRoundQuoteItem(inquiryId, values),
    onSuccess: async () => {
      msgApi.success(q?.id ? "已保存报价参数" : "已创建第一轮报价参数")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inquiry-journey"] }),
        queryClient.invalidateQueries({ queryKey: ["quote-items"] }),
        queryClient.invalidateQueries({ queryKey: ["factory-quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["factory-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["operation-logs"] }),
      ])
      onSaved()
    },
    onError: (e: Error) => msgApi.error(`保存失败：${e.message}`),
  })

  useEffect(() => {
    form.setFieldsValue({
      order_quantity: q?.order_quantity ?? null,
      pieces_per_card: q?.pieces_per_card ?? null,
      calc_quantity: q?.calc_quantity ?? null,
      misc_fee_cny: q?.misc_fee_cny ?? null,
      included_other_fee_cny: q?.included_other_fee_cny ?? null,
      test_fee_cny: q?.test_fee_cny ?? null,
      batch_shipment_count: q?.batch_shipment_count ?? null,
      destination_port_count: q?.destination_port_count ?? null,
      port_misc_fee_cny: q?.port_misc_fee_cny ?? null,
      commission_pct: q?.commission_pct ?? null,
      exchange_rate: q?.exchange_rate ?? null,
      selected_factory: q?.selected_factory ?? null,
      selected_factory_price_cny: q?.selected_factory_price_cny ?? null,
      net_profit_pct: q?.net_profit_pct ?? null,
      final_quote_usd: q?.final_quote_usd ?? null,
      current_exchange_rate: q?.current_exchange_rate ?? null,
      customer_target_price_usd: q?.customer_target_price_usd ?? null,
    })
  }, [form, q])

  const border = "1px solid #d9d9d9"
  const cell = (content: ReactNode, opts: { colSpan?: number; header?: boolean; section?: boolean; strong?: boolean; height?: number; align?: "center" | "right" | "left"; muted?: boolean; color?: string } = {}) => (
    <td colSpan={opts.colSpan} style={{
      border,
      background: opts.section ? (opts.color ?? C_DARK_BLUE) : opts.header ? "#f0f5ff" : "#fff",
      color: opts.section ? "#fff" : opts.muted ? "#8c8c8c" : undefined,
      fontWeight: opts.header || opts.strong || opts.section ? 700 : 400,
      textAlign: opts.align ?? "center",
      verticalAlign: "middle",
      height: opts.height ?? 24,
      padding: opts.section ? "5px 8px" : "3px 5px",
      fontSize: opts.section ? 13 : 12,
      lineHeight: 1.18,
      wordBreak: "break-word",
    }}>{content}</td>
  )
  const quoteCell = (content: ReactNode, opts: { colSpan?: number; header?: boolean; align?: "center" | "right" | "left"; muted?: boolean } = {}) =>
    cell(content, { ...opts, height: opts.header ? 30 : 26 })
  const input = (name: keyof QuoteItemUpdateBody, precision = 4) => (
    <Form.Item noStyle name={name}>
      <InputNumber size="small" controls={false} min={0} precision={precision} style={{ width: "100%" }} />
    </Form.Item>
  )
  const selectedRankText = fa.selected_factory_rank == null ? "—" : fa.selected_factory_rank === 1 ? "最低" : fa.selected_factory_rank === 2 ? "第二低" : `第${fa.selected_factory_rank}低`
  const targetFeasible = target.target_has_profit == null ? "—" : target.target_has_profit ? (target.target_gross_profit_rate != null && target.target_gross_profit_rate >= 0.15 ? "有利润空间" : "利润较薄") : "可能亏损"
  const factoryQuoteColumns = [...firstRound.factory_quotes, ...Array(Math.max(0, 9 - firstRound.factory_quotes.length)).fill(null)].slice(0, 9) as (JourneyFactoryQuoteBrief | null)[]
  const factoryMessages = analysis.analysis_messages.filter(m => ["最低报价差距较大", "最低报价差距明显", "最低报价工厂风险记录", "最低报价工厂限制合作", "工厂问题备注", "建议关注第二低报价工厂"].includes(m.title))
  const reason = analysisReason(fa)

  return (
    <div>
      {ctx}
      {!q && <Alert type="info" showIcon style={{ borderRadius: 0, marginBottom: 8 }} message="当前询单尚未创建第一轮国内报价参数记录，填写后可直接保存创建。" />}
      <Form form={form} disabled={!canEdit} onFinish={values => saveMutation.mutate(values)}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", background: "#fff", border: "1px solid #d9d9d9" }}>
          <colgroup>{Array.from({ length: 10 }).map((_, i) => <col key={i} style={{ width: "10%" }} />)}</colgroup>
          <tbody>
            <tr>{cell("第一轮报价", { colSpan: 10, section: true, height: 36 })}</tr>
            <tr>
              {quoteCell("工厂名称", { header: true })}
              {factoryQuoteColumns.map((it, idx) => <Fragment key={`first-name-${it?.id ?? idx}`}>{quoteCell(dash(it?.factory_name), { muted: !it })}</Fragment>)}
            </tr>
            <tr>
              {quoteCell("工厂价格", { header: true })}
              {factoryQuoteColumns.map((it, idx) => <Fragment key={`first-price-${it?.id ?? idx}`}>{quoteCell(it ? money(it.factory_price) : "—", { align: "right", muted: !it })}</Fragment>)}
            </tr>
            <tr>
              {quoteCell("币种", { header: true })}
              {factoryQuoteColumns.map((it, idx) => <Fragment key={`first-currency-${it?.id ?? idx}`}>{quoteCell(dash(it?.currency), { muted: !it })}</Fragment>)}
            </tr>
            <tr>
              {quoteCell("各个工厂价格比对情况", { header: true })}
              {factoryQuoteColumns.map((it, idx) => <Fragment key={`first-rank-${it?.id ?? idx}`}>{quoteCell(it ? quoteRankTag(quoteRankLabel(it, fa)) : quoteRankTag("—"), { muted: !it })}</Fragment>)}
            </tr>
            <tr>
              {quoteCell("各个工厂价格相差比率", { header: true })}
              {factoryQuoteColumns.map((it, idx) => <Fragment key={`first-gap-${it?.id ?? idx}`}>{quoteCell(it ? quoteGapRatio(it, fa) : "—", { muted: !it })}</Fragment>)}
            </tr>
            {reason && <tr>{cell(reason, { colSpan: 10, muted: true })}</tr>}
            <tr>{cell("", { colSpan: 10, height: 18 })}</tr>
            <tr>
              {cell("价格计算", { colSpan: 5, section: true, color: C_DARK_BLUE, height: 36 })}
              {cell("工厂辅助判断区", { colSpan: 5, section: true, color: C_DARK_BLUE, height: 36 })}
            </tr>
            <tr>
              {["订单数量", "每卡件数", "算价格数量", "杂费", "包含验货，验厂，海运/空运费（客人要求我们报价需要包含运费的情况）其他费用"].map(h => cell(h, { height: 54 }))}
              {cell("选用工厂价位情况", { height: 54 })}
              {cell("选用工厂同最低工厂百分比", { height: 54 })}
              {cell("选用工厂风险等级", { height: 54 })}
              {cell("选用工厂风险原因", { colSpan: 2, height: 54 })}
            </tr>
            <tr>
              {cell(input("order_quantity", 0))}
              {cell(input("pieces_per_card", 0))}
              {cell(input("calc_quantity", 0))}
              {cell(input("misc_fee_cny"))}
              {cell(input("included_other_fee_cny"))}
              {cell(selectedRankText, { strong: fa.selected_factory_rank != null })}
              {cell(ratioPct(fa.selected_factory_gap_pct), { strong: fa.selected_factory_gap_pct != null })}
              {cell(dash(risk.risk_level), { strong: risk.risk_level === "high" || risk.risk_level === "blocked" })}
              {cell(dash(risk.risk_notes), { colSpan: 2, align: "left" })}
            </tr>
            <tr>
              {["测试费", "分批走货", "目的港数量", "港杂费", "佣金"].map(h => cell(h))}
              {cell("历史价格参考区", { colSpan: 5, section: true, color: C_DARK_BLUE })}
            </tr>
            <tr>
              {cell(input("test_fee_cny"))}
              {cell(input("batch_shipment_count"))}
              {cell(input("destination_port_count", 0))}
              {cell(input("port_misc_fee_cny"))}
              {cell(input("commission_pct", 2))}
              {cell("类似款式数量")}
              {cell("历史最低价")}
              {cell("历史最高价")}
              {cell("历史平均价格", { colSpan: 2 })}
            </tr>
            <tr>
              {["报价汇率", "选取工厂", "选取工厂价格", "净利润值", "客人价格"].map(h => cell(h))}
              {cell(historical.samples.length > 0 ? <Button type="link" size="small" onClick={() => setShowSamples(v => !v)}>{historical.sample_count}</Button> : historical.sample_count, { strong: historical.sample_count > 0 })}
              {cell(priceWithUnit(historical.historical_lowest_price, historical.currency, historical.price_unit))}
              {cell(priceWithUnit(historical.historical_highest_price, historical.currency, historical.price_unit))}
              {cell(priceWithUnit(historical.historical_average_price, historical.currency, historical.price_unit), { colSpan: 2 })}
            </tr>
            <tr>
              {cell(input("exchange_rate"))}
              {cell(<Form.Item noStyle name="selected_factory"><Select size="small" allowClear showSearch options={factoryOptions} placeholder="需要人工确认" /></Form.Item>)}
              {cell(input("selected_factory_price_cny"))}
              {cell(input("net_profit_pct", 2))}
              {cell(input("final_quote_usd"))}
              {cell("", { colSpan: 5 })}
            </tr>
            <tr>
              {cell("当下汇率")}
              {cell("毛利润额（人民币）", { colSpan: 2 })}
              {cell("贸易额（美金）", { colSpan: 2 })}
              {cell("", { colSpan: 5 })}
            </tr>
            <tr>
              {cell(input("current_exchange_rate"))}
              {cell(money(q?.gross_profit_cny), { colSpan: 2, strong: true })}
              {cell(money(q?.trade_amount_usd), { colSpan: 2, strong: true })}
              {cell("", { colSpan: 5 })}
            </tr>
            <tr>
              {cell("目标价")}
              {cell("倒推给工厂目标价格时利润值")}
              {cell("倒推给工厂的目标价格")}
              {cell("达到目标价格毛利润额")}
              {cell("达到目标价格贸易额")}
              {cell("目标价分析", { colSpan: 5, section: true, color: C_DARK_BLUE, height: 36 })}
            </tr>
            <tr>
              {cell(input("customer_target_price_usd"))}
              {cell(money(q?.reverse_target_profit_value))}
              {cell(money(q?.reverse_target_price_cny), { strong: true })}
              {cell(money(target.target_gross_profit_cny ?? q?.target_gross_profit_cny), { strong: true })}
              {cell(money(target.target_sales_amount_usd ?? q?.target_trade_amount_usd))}
              {cell("目标价格是否合理", { header: true, height: 58 })}
              {cell("达到目标价格要降的钱数", { header: true, height: 58 })}
              {cell("给客人报的价格和目标价比例", { header: true, height: 58 })}
              {cell("按照达到目标价格的利润值", { colSpan: 2, header: true, height: 58 })}
            </tr>
            <tr>
              {cell("", { colSpan: 5, height: 72 })}
              {cell(target.messages[0]?.message ?? targetFeasible, { align: "left", height: 72 })}
              {cell(signedMoney(target.target_vs_current_diff ?? q?.target_price_gap_usd ?? q?.target_gap_cny), { strong: true })}
              {cell(ratioPct(q?.quote_vs_target_ratio ?? target.target_vs_current_diff_pct))}
              {cell(money(q?.target_profit_value), { colSpan: 2 })}
            </tr>
            <tr>{cell("AI分析提示区", { colSpan: 10, section: true, color: C_DARK_BLUE, height: 40 })}</tr>
          </tbody>
        </table>
        <Space style={{ marginTop: 10 }}>
          <Button icon={<CalculatorOutlined />} onClick={onRecalculate} loading={recalculating}>重新计算</Button>
          <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saveMutation.isPending} disabled={!canEdit}>保存报价参数</Button>
          {!canEdit && <Text type="secondary">当前账号只读，不能保存修改。</Text>}
        </Space>
      </Form>
      {showSamples && historical.samples.length > 0 && <HistoricalSamplesTable historical={historical} />}
      <AnalysisAlerts messages={[...factoryMessages, ...target.messages]} />
      {advice?.triggered && <AnalysisAlerts messages={advice.messages} />}
      <AiAnalysisHints analysis={analysis} />
    </div>
  )
}


function AiAnalysisHints({ analysis }: { analysis: JourneyFirstRoundAnalysisBundle }) {
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label="AI 分析提示区" color={C_DARK_BLUE} />
      <div style={{ border: "1px solid #d9d9d9", borderTop: 0, padding: 12, background: "#fff" }}>
        <Text type="secondary" style={{ display: "block", marginBottom: 10 }}>
          当前为规则生成的分析提示，不调用 AI API，不写入数据库。
        </Text>
        <Space direction="vertical" style={{ width: "100%" }} size={8}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 8 }}>
            {analysis.ai_analysis_messages.map((section, idx) => (
              <div key={section.title} style={{ border: "1px solid #f0f0f0", padding: "7px 9px", background: "#fafafa" }}>
                <Text strong style={{ fontSize: 12 }}>{idx + 1}. {section.title}</Text>
                <ul style={{ margin: "5px 0 0 16px", padding: 0 }}>
                  {(section.items ?? []).map((item, itemIdx) => (
                    <li key={itemIdx} style={{ lineHeight: 1.5, fontSize: 12 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Space>
      </div>
    </div>
  )
}

function JourneyTopSummary({
  inquiry,
  firstRound,
  onOpenStyleItems,
}: {
  inquiry: InquiryJourney["inquiry"]
  firstRound: JourneyFirstRound
  onOpenStyleItems: () => void
}) {
  const styleCountValue = inquiry.style_count > 0 ? (
    <Button type="link" size="small" onClick={onOpenStyleItems} style={{ padding: 0, height: "auto", fontWeight: 700 }}>
      {inquiry.style_count}
    </Button>
  ) : "—"
  const fields: ExcelField[] = [
    { label: "收到客人资料时间", value: dash(firstRound.quote_item?.material_received_date ?? inquiry.inquiry_date) },
    { label: "客户代码", value: dash(inquiry.customer_code) },
    { label: "询单号", value: dash(inquiry.inquiry_no) },
    { label: "订单号", value: dash(inquiry.customer_order_no) },
    { label: "系列", value: dash(inquiry.series_name) },
    { label: "季节", value: dash(inquiry.season) },
    { label: "图片", value: "—" },
    { label: "品类", value: dash(inquiry.product_category) },
    { label: "品名", value: dash(inquiry.style_count > 1 ? "多款式" : inquiry.product_name) },
    { label: "款式数量", value: styleCountValue, highlight: inquiry.style_count > 1 },
    { label: "订单状态", value: dash(inquiry.order_status) },
  ]
  return (
    <div style={{ background: "#fff" }}>
      <FieldGrid fields={fields} />
    </div>
  )
}

function StyleItemsDrawer({
  inquiryId,
  open,
  onClose,
}: {
  inquiryId: string
  open: boolean
  onClose: () => void
}) {
  const { data = [], isFetching, isError, error } = useQuery({
    queryKey: ["inquiry-style-items", inquiryId],
    queryFn: () => fetchInquiryStyleItems(inquiryId),
    enabled: open && !!inquiryId,
  })

  const columns = [
    { title: "款号", dataIndex: "style_no", width: 90, render: (v: string | null) => dash(v) },
    { title: "品名", dataIndex: "product_name", width: 160, render: (v: string | null) => dash(v) },
    { title: "产品大类", dataIndex: "product_category", width: 90, render: (v: string | null) => dash(v) },
    { title: "系列", dataIndex: "series_name", width: 120, render: (v: string | null) => dash(v) },
    { title: "数量", dataIndex: "quantity", width: 90, align: "right" as const, render: (v: number | null) => v == null ? "—" : v.toLocaleString() },
    { title: "面料/材质", dataIndex: "fabric_quality", width: 130, render: (v: string | null) => dash(v) },
    { title: "颜色/印花", dataIndex: "color_print", width: 130, render: (v: string | null) => dash(v) },
    { title: "尺码范围", dataIndex: "size_range", width: 120, render: (v: string | null, row: InquiryStyleItem) => (
      <Space size={4} wrap>
        {v ? <Tag>{v}</Tag> : null}
        {row.sizes.slice(0, 4).map(s => <Tag key={s.id} color={s.is_special_size ? "gold" : "default"}>{s.size_code}</Tag>)}
        {row.sizes.length > 4 && <Tag>+{row.sizes.length - 4}</Tag>}
        {!v && row.sizes.length === 0 ? "—" : null}
      </Space>
    ) },
    { title: "报价状态", dataIndex: "quote_status", width: 90, render: (v: string | null) => dash(v) },
    { title: "订单状态", dataIndex: "order_status", width: 90, render: (v: string | null) => dash(v) },
    { title: "报价单填报人", dataIndex: "quote_prepared_by", width: 110, render: (v: string | null) => dash(v) },
  ]

  return (
    <Drawer
      title={`款式明细（${data.length}）`}
      open={open}
      onClose={onClose}
      width={980}
      destroyOnClose
    >
      {isError ? (
        <Alert type="error" showIcon message="款式明细加载失败" description={(error as Error)?.message ?? "请求失败"} />
      ) : (
        <Table<InquiryStyleItem>
          rowKey="id"
          size="small"
          bordered
          loading={isFetching}
          columns={columns}
          dataSource={data}
          pagination={false}
          scroll={{ x: 1220 }}
        />
      )}
    </Drawer>
  )
}

function HistoricalSamplesTable({ historical }: { historical: JourneyHistoricalPriceReference }) {
  const sampleCell = (content: ReactNode, opts: { header?: boolean; align?: "center" | "right" | "left"; strong?: boolean } = {}) => (
    <td style={{
      border: "1px solid #d9d9d9",
      background: opts.header ? "#f0f5ff" : "#fff",
      fontWeight: opts.header || opts.strong ? 700 : 400,
      textAlign: opts.align ?? "center",
      verticalAlign: "middle",
      padding: "5px 6px",
      lineHeight: 1.2,
      wordBreak: "break-word",
    }}>
      {content}
    </td>
  )

  return (
    <div style={{ marginTop: 8, border: "1px solid #d9d9d9", padding: 8, background: "#fff" }}>
      <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>历史样本明细</Text>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 12 }}>
        <tbody>
          <tr>{["客人代码", "询单号", "品类", "品名", "数量", "工厂", "价格", "订单状态"].map(h => sampleCell(h, { header: true }))}</tr>
          {historical.samples.slice(0, 8).map(s => (
            <tr key={`${s.inquiry_id}-${s.factory_name}-${s.factory_price}-${s.quote_round}`}>
              {sampleCell(dash(s.customer_code))}
              {sampleCell(dash(s.inquiry_no))}
              {sampleCell(dash(s.product_category))}
              {sampleCell(dash(s.product_name))}
              {sampleCell("—")}
              {sampleCell(dash(s.factory_name))}
              {sampleCell(priceWithUnit(s.factory_price, s.currency, s.price_unit))}
              {sampleCell(dash(s.order_status))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FirstRoundBlock({
  firstRound,
  inquiryId,
  analysis,
  canEdit,
  onRecalculate,
  recalculating,
  onSaved,
}: {
  firstRound: JourneyFirstRound
  inquiryId: string
  analysis: JourneyFirstRoundAnalysisBundle
  canEdit: boolean
  onRecalculate: () => void
  recalculating: boolean
  onSaved: () => void
}) {
  return (
    <div style={{ marginBottom: 16, background: "#fff" }}>
      <FirstRoundExcelSheet
        firstRound={firstRound}
        inquiryId={inquiryId}
        analysis={analysis}
        canEdit={canEdit}
        onRecalculate={onRecalculate}
        recalculating={recalculating}
        onSaved={onSaved}
      />
    </div>
  )
}

function roundTitle(round: JourneyRound): string {
  return `${quoteTypeName(round.quote_type)}第${roundName(round.quote_round)}轮报价`
}

function roundQuotes(round: JourneyRound): JourneyFactoryQuoteBrief[] {
  return [round.factory1, round.factory2, ...round.other_factories].filter((it): it is JourneyFactoryQuoteBrief => Boolean(it))
}

function factoryNameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase()
}

function SecondRoundExcelBlock({
  round,
  firstRound,
  inquiryId,
  canEdit,
  onSaved,
}: {
  round: JourneyRound
  firstRound: JourneyFirstRound
  inquiryId: string
  canEdit: boolean
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [msgApi, ctx] = message.useMessage()
  const queryClient = useQueryClient()
  const [showSamples, setShowSamples] = useState(false)
  const items = roundQuotes(round)
  const q = round.quote_item ?? null
  const base = firstRound.quote_item
  const analysis = round.analysis
  const fa = analysis?.factory_price_analysis
  const risk = analysis?.factory_risk_analysis
  const historical = analysis?.historical_price_reference
  const target = analysis?.customer_target_price_analysis
  const factoryOptions = Array.from(new Set(items.map(f => f.factory_name).filter(Boolean) as string[]))
    .map(name => ({ label: name, value: name }))
  const firstRoundByFactory = new Map(
    firstRound.factory_quotes
      .filter(q => q.factory_name)
      .map(q => [factoryNameKey(q.factory_name), q]),
  )
  const quoteSlots = [...items, ...Array(Math.max(0, 9 - items.length)).fill(null)].slice(0, 9) as (JourneyFactoryQuoteBrief | null)[]
  const reason = round.price_analysis.comparable
    ? null
    : round.price_analysis.reason === "mismatch"
    ? "币种或单位不一致，暂不进行价格比较"
    : round.price_analysis.reason === "no_price"
    ? "暂无有效工厂报价，暂不进行价格比较"
    : "暂无第二轮工厂报价"
  const saveMutation = useMutation({
    mutationFn: (values: QuoteItemUpdateBody) => q?.id
      ? updateQuoteItem(q.id, values)
      : createFirstRoundQuoteItem(inquiryId, values, { quoteRound: round.quote_round }),
    onSuccess: async () => {
      msgApi.success(q?.id ? "已保存第二轮报价参数" : "已创建第二轮报价参数")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inquiry-journey"] }),
        queryClient.invalidateQueries({ queryKey: ["quote-items"] }),
        queryClient.invalidateQueries({ queryKey: ["factory-quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["operation-logs"] }),
      ])
      onSaved()
    },
    onError: (e: Error) => msgApi.error(`保存失败：${e.message}`),
  })
  useEffect(() => {
    const source = q ?? base
    form.setFieldsValue({
      order_quantity: source?.order_quantity ?? null,
      pieces_per_card: source?.pieces_per_card ?? null,
      calc_quantity: source?.calc_quantity ?? null,
      misc_fee_cny: source?.misc_fee_cny ?? null,
      included_other_fee_cny: source?.included_other_fee_cny ?? null,
      test_fee_cny: source?.test_fee_cny ?? null,
      batch_shipment_count: source?.batch_shipment_count ?? null,
      destination_port_count: source?.destination_port_count ?? null,
      port_misc_fee_cny: source?.port_misc_fee_cny ?? null,
      commission_pct: source?.commission_pct ?? null,
      exchange_rate: source?.exchange_rate ?? null,
      selected_factory: q?.selected_factory ?? null,
      selected_factory_price_cny: q?.selected_factory_price_cny ?? null,
      net_profit_pct: source?.net_profit_pct ?? null,
      final_quote_usd: q?.final_quote_usd ?? null,
      current_exchange_rate: source?.current_exchange_rate ?? null,
      customer_target_price_usd: q?.customer_target_price_usd ?? null,
    })
  }, [base, form, q])
  const border = "1px solid #d9d9d9"
  const cell = (content: ReactNode, opts: { colSpan?: number; header?: boolean; section?: boolean; strong?: boolean; height?: number; align?: "center" | "right" | "left"; muted?: boolean } = {}) => (
    <td colSpan={opts.colSpan} style={{
      border,
      background: opts.section ? C_DARK_BLUE : opts.header ? "#f0f5ff" : "#fff",
      color: opts.section ? "#fff" : opts.muted ? "#8c8c8c" : undefined,
      fontWeight: opts.header || opts.strong || opts.section ? 700 : 400,
      textAlign: opts.align ?? "center",
      verticalAlign: "middle",
      height: opts.height ?? 24,
      padding: opts.section ? "5px 8px" : "3px 5px",
      fontSize: opts.section ? 13 : 12,
      lineHeight: 1.18,
      wordBreak: "break-word",
    }}>{content}</td>
  )
  const quoteCell = (content: ReactNode, opts: { colSpan?: number; header?: boolean; align?: "center" | "right" | "left"; muted?: boolean; strong?: boolean } = {}) =>
    cell(content, { ...opts, height: opts.header ? 30 : 26 })
  const input = (name: keyof QuoteItemUpdateBody, precision = 4) => (
    <Form.Item noStyle name={name}>
      <InputNumber size="small" controls={false} min={0} precision={precision} style={{ width: "100%" }} />
    </Form.Item>
  )
  const selectedRankText = fa?.selected_factory_rank == null ? "—" : fa.selected_factory_rank === 1 ? "最低" : fa.selected_factory_rank === 2 ? "第二低" : `第${fa.selected_factory_rank}低`
  const targetFeasible = !target || target.target_has_profit == null ? "—" : target.target_has_profit ? (target.target_gross_profit_rate != null && target.target_gross_profit_rate >= 0.15 ? "有利润空间" : "利润较薄") : "可能亏损"
  const finalQuoteDiff = q?.final_quote_usd != null && firstRound.quote_item?.final_quote_usd != null ? q.final_quote_usd - firstRound.quote_item.final_quote_usd : null
  const finalQuoteRatio = q?.final_quote_usd != null && firstRound.quote_item?.final_quote_usd ? (q.final_quote_usd / firstRound.quote_item.final_quote_usd) - 1 : null
  const targetChangeRatio = q?.customer_target_price_usd != null && firstRound.quote_item?.customer_target_price_usd ? (q.customer_target_price_usd / firstRound.quote_item.customer_target_price_usd) - 1 : null

  return (
    <div style={{ marginBottom: 16, background: "#fff" }}>
      {ctx}
      {!q && <Alert type="info" showIcon style={{ borderRadius: 0, marginBottom: 8 }} message="当前询单尚未创建第二轮国内报价参数记录，填写后可直接保存创建。" />}
      <Form form={form} disabled={!canEdit} onFinish={values => saveMutation.mutate(values)}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", background: "#fff", border }}>
          <colgroup>{Array.from({ length: 10 }).map((_, i) => <col key={i} style={{ width: "10%" }} />)}</colgroup>
          <tbody>
          <tr>{cell("第二轮报价", { colSpan: 10, section: true, height: 36 })}</tr>
          <tr>
            {cell("更新内容", { header: true })}
            {cell("—", { colSpan: 9, align: "left", muted: true })}
          </tr>
          <tr>
            {quoteCell("工厂名称", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-name-${it?.id ?? idx}`}>{quoteCell(dash(it?.factory_name), { muted: !it })}</Fragment>)}
          </tr>
          <tr>
            {quoteCell("工厂价格", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-price-${it?.id ?? idx}`}>{quoteCell(it ? money(it.factory_price) : "—", { align: "right", muted: !it })}</Fragment>)}
          </tr>
          <tr>
            {quoteCell("币种", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-currency-${it?.id ?? idx}`}>{quoteCell(dash(it?.currency), { muted: !it })}</Fragment>)}
          </tr>
          <tr>
            {quoteCell("同工厂价格变动比率", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-change-${it?.id ?? idx}`}>{quoteCell(it?.factory_name ? ratioPct((it.factory_price != null && firstRoundByFactory.get(factoryNameKey(it.factory_name))?.factory_price ? it.factory_price / firstRoundByFactory.get(factoryNameKey(it.factory_name))!.factory_price! - 1 : null)) : "—", { strong: !!it, muted: !it })}</Fragment>)}
          </tr>
          <tr>
            {quoteCell("各个工厂价格比对情况", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-rank-${it?.id ?? idx}`}>{quoteCell(it ? quoteRankTag(quoteRankLabel(it, round.price_analysis)) : quoteRankTag("—"), { muted: !it })}</Fragment>)}
          </tr>
          <tr>
            {quoteCell("各个工厂价格相差比率", { header: true })}
            {quoteSlots.map((it, idx) => <Fragment key={`second-gap-${it?.id ?? idx}`}>{quoteCell(it ? quoteGapRatio(it, round.price_analysis) : "—", { muted: !it })}</Fragment>)}
          </tr>
          {reason && <tr>{cell(reason, { colSpan: 10, muted: true })}</tr>}
          <tr>
            {cell("价格计算", { colSpan: 6, section: true, height: 36 })}
            {cell("工厂辅助判断区", { colSpan: 4, section: true, height: 36 })}
          </tr>
          <tr>
            {["订单数量", "每卡件数", "算价格数量", "杂费"].map(h => cell(h, { header: true }))}
            {cell("包含验货，验厂，海运/空运费其他费用", { colSpan: 2, header: true })}
            {cell("选用工厂价位情况", { header: true })}
            {cell("选用工厂同最低工厂百分比", { header: true })}
            {cell("选用工厂风险等级", { header: true })}
            {cell("选用工厂风险原因", { header: true })}
          </tr>
          <tr>
            {cell(input("order_quantity", 0))}
            {cell(input("pieces_per_card", 0))}
            {cell(input("calc_quantity", 0))}
            {cell(input("misc_fee_cny"))}
            {cell(input("included_other_fee_cny"), { colSpan: 2 })}
            {cell(selectedRankText, { strong: fa?.selected_factory_rank != null })}
            {cell(ratioPct(fa?.selected_factory_gap_pct), { strong: fa?.selected_factory_gap_pct != null })}
            {cell(dash(risk?.risk_level), { strong: risk?.risk_level === "high" || risk?.risk_level === "blocked" })}
            {cell(dash(risk?.risk_notes), { align: "left" })}
          </tr>
          <tr>
            {["分批走货", "目的港数量", "港杂费", "测试费", "选取工厂", "选取工厂价格"].map(h => cell(h, { header: true }))}
            {cell("历史价格参考区", { colSpan: 4, section: true, height: 36 })}
          </tr>
          <tr>
            {cell(input("batch_shipment_count"))}
            {cell(input("destination_port_count", 0))}
            {cell(input("port_misc_fee_cny"))}
            {cell(input("test_fee_cny"))}
            {cell(<Form.Item noStyle name="selected_factory"><Select size="small" allowClear showSearch options={factoryOptions} placeholder="需要人工确认" /></Form.Item>)}
            {cell(input("selected_factory_price_cny"))}
            {["类似款式数量", "历史最低价", "历史最高价", "历史平均价格"].map(h => cell(h, { header: true }))}
          </tr>
          <tr>
            {["佣金", "报价汇率", "净利润值", "客人价格", "比上次给客人报价差值", "比上次给客人报价比率"].map(h => cell(h, { header: true }))}
            {cell(
              historical && historical.samples.length > 0
                ? <Button type="link" size="small" onClick={() => setShowSamples(v => !v)}>{historical.sample_count}</Button>
                : historical?.sample_count ?? "—",
              { strong: !!historical?.sample_count },
            )}
            {cell(priceWithUnit(historical?.historical_lowest_price, historical?.currency, historical?.price_unit))}
            {cell(priceWithUnit(historical?.historical_highest_price, historical?.currency, historical?.price_unit))}
            {cell(priceWithUnit(historical?.historical_average_price, historical?.currency, historical?.price_unit))}
          </tr>
          <tr>
            {cell(input("commission_pct", 2))}
            {cell(input("exchange_rate"))}
            {cell(input("net_profit_pct", 2))}
            {cell(input("final_quote_usd"))}
            {cell(signedMoney(finalQuoteDiff), { strong: finalQuoteDiff != null })}
            {cell(ratioPct(finalQuoteRatio), { strong: finalQuoteRatio != null })}
            {cell("", { colSpan: 4 })}
          </tr>
          <tr>
            {cell("当下汇率", { header: true })}
            {cell("毛利润额（人民币）", { colSpan: 2, header: true })}
            {cell("贸易额（美金）", { colSpan: 3, header: true })}
            {cell("", { colSpan: 4 })}
          </tr>
          <tr>
            {cell(input("current_exchange_rate"))}
            {cell(money(q?.gross_profit_cny), { colSpan: 2, strong: true })}
            {cell(money(q?.trade_amount_usd), { colSpan: 3, strong: true })}
            {cell("目标价分析", { colSpan: 4, section: true, height: 36 })}
          </tr>
          <tr>
            {cell("目标价", { header: true })}
            {cell("目标价格变动比率", { header: true })}
            {cell("倒推给工厂目标价格时利润值", { header: true })}
            {cell("倒推给工厂的目标价格", { header: true })}
            {cell("达到目标价格毛利润额", { header: true })}
            {cell("达到目标价格贸易额", { header: true })}
            {cell("目标价格是否合理", { header: true })}
            {cell("达到目标价格要降的钱数", { header: true })}
            {cell("给客人报的价格和目标价比例", { header: true })}
            {cell("按照达到目标价格的利润值", { header: true })}
          </tr>
          <tr>
            {cell(input("customer_target_price_usd"))}
            {cell(ratioPct(targetChangeRatio), { strong: targetChangeRatio != null })}
            {cell(money(q?.reverse_target_profit_value))}
            {cell(money(q?.reverse_target_price_cny), { strong: true })}
            {cell(money(target?.target_gross_profit_cny ?? q?.target_gross_profit_cny), { strong: true })}
            {cell(money(target?.target_sales_amount_usd ?? q?.target_trade_amount_usd))}
            {cell(target?.messages[0]?.message ?? targetFeasible, { align: "left", height: 72 })}
            {cell(signedMoney(target?.target_vs_current_diff ?? q?.target_price_gap_usd ?? q?.target_gap_cny), { strong: true })}
            {cell(ratioPct(q?.quote_vs_target_ratio ?? target?.target_vs_current_diff_pct))}
            {cell(money(q?.target_profit_value))}
          </tr>
          <tr>{cell("AI分析提示区", { colSpan: 10, section: true, height: 40 })}</tr>
          <tr>
            {cell(
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                {(analysis?.ai_analysis_messages ?? []).map((section, idx) => (
                  <div key={section.title} style={{ border: "1px solid #f0f0f0", padding: "6px 8px", background: "#fafafa" }}>
                    <Text strong style={{ fontSize: 12 }}>{idx + 1}. {section.title}</Text>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {(section.items ?? []).map((item, itemIdx) => (
                        <li key={itemIdx} style={{ lineHeight: 1.35, fontSize: 12 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!analysis?.ai_analysis_messages?.length && (
                  <Text type="secondary">当前暂无分析提示，请先保存第二轮报价参数或录入第二轮工厂报价。</Text>
                )}
              </div>,
              { colSpan: 10, align: "left", height: 72 },
            )}
          </tr>
          </tbody>
        </table>
        <Space style={{ marginTop: 10 }}>
          <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saveMutation.isPending} disabled={!canEdit}>保存第二轮报价参数</Button>
          {!canEdit && <Text type="secondary">当前账号只读，不能保存修改。</Text>}
        </Space>
      </Form>
      {showSamples && historical?.samples.length ? <HistoricalSamplesTable historical={historical} /> : null}
    </div>
  )
}

function UnifiedRoundBlock({ round }: { round: JourneyRound }) {
  const title = roundTitle(round)
  const items = roundQuotes(round)
  return (
    <div style={{ marginBottom: 16, border: "1px solid #d9d9d9", background: "#fff" }}>
      <div style={{ background: "#262626", color: "#fff", padding: "6px 10px", fontSize: 14, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ padding: 10 }}>
        <RoundPriceAnalysisSection
          label={`第${roundName(round.quote_round)}轮工厂价格分析`}
          analysis={round.price_analysis}
          quoteCount={items.length}
        />
        <FactoryQuoteDetails
          label={`第${roundName(round.quote_round)}轮工厂报价明细`}
          items={items}
          analysis={round.price_analysis}
          emptyText={`暂无第${roundName(round.quote_round)}轮工厂报价明细`}
        />
      </div>
    </div>
  )
}

export default function InquiryJourneyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [msgApi, ctx] = message.useMessage()
  const [analysisOverride, setAnalysisOverride] = useState<JourneyFirstRoundAnalysisBundle | null>(null)
  const [styleItemsOpen, setStyleItemsOpen] = useState(false)
  const [pageScale, setPageScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem(JOURNEY_SCALE_KEY))
    return JOURNEY_SCALE_OPTIONS.some(opt => opt.value === saved) ? saved : 1
  })

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["inquiry-journey", id],
    queryFn: () => fetchInquiryJourney(id!),
    enabled: !!id,
  })
  const recalcMutation = useMutation({
    mutationFn: () => analyzeFirstQuoteRound(id!),
    onSuccess: data => {
      setAnalysisOverride(data)
      msgApi.success("已重新计算")
      queryClient.invalidateQueries({ queryKey: ["inquiry-journey", id] })
      queryClient.invalidateQueries({ queryKey: ["quote-items"] })
      queryClient.invalidateQueries({ queryKey: ["factory-quotes"] })
      queryClient.invalidateQueries({ queryKey: ["factory-detail"] })
      queryClient.invalidateQueries({ queryKey: ["operation-logs"] })
    },
    onError: (e: Error) => msgApi.error(`重新计算失败：${e.message}`),
  })

  useEffect(() => {
    setAnalysisOverride(null)
  }, [id, data?.first_round?.quote_item?.id])

  if (isLoading) {
    return <div style={{ padding: 48, textAlign: "center" }}><Spin size="large" /></div>
  }
  if (isError || !data) {
    const detail = (error as Error)?.message ?? "加载失败"
    return <div style={{ padding: 24 }}><Alert type="error" message="无法加载来龙去脉表" description={detail} showIcon /></div>
  }

  const { inquiry, first_round, rounds } = data
  const firstRoundAnalysis = analysisOverride ?? first_round.analysis
  const otherRounds = rounds.filter(r => !(r.quote_round === 1 && (r.quote_type ?? "domestic") === "domestic"))
  const scaledContentStyle = { zoom: pageScale } as CSSProperties

  return (
    <div style={{ padding: 24, maxWidth: "none" }}>
      {ctx}
      <Space style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/inquiry/${id}`)}>返回询单详情</Button>
        <Space size={8}>
          <Text type="secondary">页面比例</Text>
          <Select
            size="small"
            value={pageScale}
            options={JOURNEY_SCALE_OPTIONS}
            style={{ width: 92 }}
            onChange={value => {
              setPageScale(value)
              localStorage.setItem(JOURNEY_SCALE_KEY, String(value))
            }}
          />
        </Space>
      </Space>

      <div style={scaledContentStyle}>
        <div>
          <JourneyTopSummary
            inquiry={inquiry}
            firstRound={first_round}
            onOpenStyleItems={() => setStyleItemsOpen(true)}
          />

          {/* 工厂报价轮次（核心区域） */}
          <div style={{ marginTop: 16 }}>
            <FirstRoundBlock
              firstRound={first_round}
              inquiryId={id!}
              analysis={firstRoundAnalysis}
              canEdit={data.can_edit}
              onRecalculate={() => recalcMutation.mutate()}
              recalculating={recalcMutation.isPending}
              onSaved={() => {
                setAnalysisOverride(null)
                queryClient.invalidateQueries({ queryKey: ["inquiry-journey", id] })
              }}
            />
            {otherRounds.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", border: "1px dashed #d9d9d9", background: "#fafafa" }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  当前询单暂无第二轮及后续工厂报价记录。
                </Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/inquiry/${id}#factory-quote`)}>
                  去录入工厂报价
                </Button>
              </div>
            ) : (
              otherRounds.map(r => (
                r.quote_round === 2 && (r.quote_type ?? "domestic") === "domestic"
                  ? (
                    <SecondRoundExcelBlock
                      key={`${r.quote_type}-${r.quote_round}`}
                      round={r}
                      firstRound={first_round}
                      inquiryId={id!}
                      canEdit={data.can_edit}
                      onSaved={() => queryClient.invalidateQueries({ queryKey: ["inquiry-journey", id] })}
                    />
                  )
                  : <UnifiedRoundBlock key={`${r.quote_type}-${r.quote_round}`} round={r} />
              ))
            )}
          </div>

        </div>
      </div>
      <StyleItemsDrawer
        inquiryId={id!}
        open={styleItemsOpen}
        onClose={() => setStyleItemsOpen(false)}
      />
    </div>
  )
}
