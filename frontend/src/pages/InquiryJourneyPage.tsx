/**
 * 单个订单的来龙去脉表（询单报价详情表）
 *
 * 只读汇总页，模仿 Excel 分区表格的视觉逻辑（深蓝/橙/绿/浅蓝色块 + 表头/数据行）。
 * 工厂报价部分的唯一数据源是 factory_quote_records（"工厂报价录入"卡片），这里不
 * 重复保存任何报价数据——每次都是从后端实时计算后展示。
 */

import { useEffect, useState, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, AutoComplete, Button, Card, Col, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Spin, Table, Tag, Typography, message } from "antd"
import { ArrowLeftOutlined, CalculatorOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons"

import { analyzeFirstQuoteRound, createFirstRoundQuoteItem, fetchInquiryJourney, updateQuoteItem, type QuoteItemUpdateBody } from "@/api/inquiry_journey"
import { createFactoryQuote, deleteFactoryQuote, updateFactoryQuote } from "@/api/factory_quotes"
import { fetchFactories } from "@/api/factories"
import { CURRENCY_OPTIONS, PRICE_UNIT_OPTIONS } from "@/types/factory_quote"
import type {
  JourneyFactoryQuoteBrief,
  JourneyFirstRound,
  JourneyFirstRoundAnalysisBundle,
  JourneyFirstRoundFactoryAnalysis,
  JourneyHistoricalPriceReference,
  JourneyPriceAnalysis,
  JourneyRound,
} from "@/types/inquiry_journey"

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

function SectionTitle({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      background: color, color: "#fff", fontWeight: 700, textAlign: "center",
      padding: "7px 10px", border: "1px solid #d9d9d9", borderBottom: 0,
      fontSize: 14,
    }}>
      {label}
    </div>
  )
}

type ExcelField = { label: string; value: ReactNode; highlight?: boolean }

function ExcelTwoRowTable({ fields, groups }: { fields?: ExcelField[]; groups?: ExcelField[][] }) {
  const rows = groups ?? (fields ? [fields] : [])
  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      {rows.map((row, rowIndex) => (
        <table
          key={rowIndex}
          style={{
            minWidth: Math.max(900, row.length * 150),
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
                  background: C_LABEL_BG, border: "1px solid #bfbfbf", padding: "6px 8px",
                  textAlign: "center", fontSize: 12, fontWeight: 600, whiteSpace: "normal",
                  lineHeight: 1.35, wordBreak: "break-word",
                }}>
                  {f.label}
                </th>
              ))}
            </tr>
            <tr>
              {row.map(f => (
                <td key={f.label} style={{
                  background: f.highlight ? "#fff7e6" : "#fff", border: "1px solid #d9d9d9",
                  padding: "8px 8px", textAlign: "center", fontSize: 13,
                  color: f.highlight ? "#d4380d" : undefined, fontWeight: f.highlight ? 700 : 400,
                  lineHeight: 1.35, wordBreak: "break-word",
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

function FactoryQuoteDetails({
  label,
  items,
  analysis,
  emptyText,
}: {
  label: string
  items: JourneyFactoryQuoteBrief[]
  analysis: JourneyPriceAnalysis | JourneyFirstRoundFactoryAnalysis
  emptyText: string
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label={label} color={C_LIGHT_BLUE} />
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["工厂", "工厂报价", "币种", "单位", "标识", "备注", "来源", "录入时间"].map(h => (
              <th key={h} style={{ background: "#f0f5ff", border: "1px solid #bfbfbf", padding: "7px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ border: "1px solid #d9d9d9", padding: "16px 8px", textAlign: "center", color: "#8c8c8c" }}>
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
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>{dash(it.source)}</td>
                <td style={{ border: "1px solid #d9d9d9", padding: "7px 8px", textAlign: "center" }}>
                  {it.created_at ? new Date(it.created_at).toLocaleString("zh-CN") : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FirstRoundBaseParams({
  firstRound,
  inquiryId,
  canEdit,
  onRecalculate,
  recalculating,
  onSaved,
}: {
  firstRound: JourneyFirstRound
  inquiryId: string
  canEdit: boolean
  onRecalculate: () => void
  recalculating: boolean
  onSaved: () => void
}) {
  const [form] = Form.useForm()
  const [msgApi, ctx] = message.useMessage()
  const queryClient = useQueryClient()
  const q = firstRound.quote_item
  const factoryOptions = Array.from(new Set(firstRound.factory_quotes.map(f => f.factory_name).filter(Boolean) as string[]))
    .map(name => ({ label: name, value: name }))
  const saveMutation = useMutation({
    mutationFn: (values: QuoteItemUpdateBody) => {
      return q?.id ? updateQuoteItem(q.id, values) : createFirstRoundQuoteItem(inquiryId, values)
    },
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
      calc_quantity: q?.calc_quantity ?? null,
      batch_shipment_count: q?.batch_shipment_count ?? null,
      port_misc_fee_cny: q?.port_misc_fee_cny ?? null,
      test_fee_cny: q?.test_fee_cny ?? null,
      misc_fee_cny: q?.misc_fee_cny ?? null,
      exchange_rate: q?.exchange_rate ?? null,
      net_profit_pct: q?.net_profit_pct ?? null,
      commission_pct: q?.commission_pct ?? null,
      selected_factory: q?.selected_factory ?? null,
      selected_factory_price_cny: q?.selected_factory_price_cny ?? null,
      final_quote_usd: q?.final_quote_usd ?? null,
      current_exchange_rate: q?.current_exchange_rate ?? null,
      customer_target_price_usd: q?.customer_target_price_usd ?? null,
    })
  }, [form, q])

  return (
    <div>
      {ctx}
      <SectionTitle label="第一轮报价计算区" color={C_ORANGE} />
      {!q && (
        <Alert
          type="info"
          showIcon
          style={{ borderRadius: 0, borderBottom: 0 }}
          message="当前询单尚未创建第一轮国内报价参数记录，填写后可直接保存创建。"
        />
      )}
      <Form form={form} layout="vertical" disabled={!canEdit} onFinish={values => saveMutation.mutate(values)}>
        <div style={{ padding: 10, border: "1px solid #d9d9d9", borderTop: 0 }}>
          <Row gutter={12}>
            {[
              ["订单数量", "order_quantity", 0],
              ["算价格数量", "calc_quantity", 0],
              ["分批走货情况", "batch_shipment_count", 4],
              ["港杂费", "port_misc_fee_cny", 4],
              ["测试费", "test_fee_cny", 4],
              ["杂费", "misc_fee_cny", 4],
              ["报价汇率", "exchange_rate", 4],
              ["净利润值", "net_profit_pct", 2],
              ["佣金", "commission_pct", 2],
              ["选用工厂价格", "selected_factory_price_cny", 4],
              ["给客人报的价格", "final_quote_usd", 4],
              ["当下汇率", "current_exchange_rate", 4],
              ["客人目标价格", "customer_target_price_usd", 4],
            ].map(([label, name, precision]) => (
              <Col span={6} key={String(name)}>
                <Form.Item label={label} name={name as string}>
                  <InputNumber style={{ width: "100%" }} min={0} precision={precision as number} />
                </Form.Item>
              </Col>
            ))}
            <Col span={6}>
              <Form.Item label="选用工厂名字" name="selected_factory">
                <Select allowClear showSearch options={factoryOptions} placeholder="需要人工确认" />
              </Form.Item>
            </Col>
          </Row>
          <ExcelTwoRowTable fields={[
            { label: "毛利润额（人民币）", value: money(q?.gross_profit_cny) },
            { label: "贸易额（美金）", value: money(q?.trade_amount_usd) },
            { label: "给客人报的价格和目标价比例", value: ratioPct(q?.quote_vs_target_ratio) },
            { label: "按照达到目标价格的利润值", value: money(q?.target_profit_value) },
            { label: "达到目标价格要降的钱数", value: money(q?.target_price_gap_usd ?? q?.target_gap_cny) },
            { label: "倒推给工厂的目标价格", value: money(q?.reverse_target_price_cny) },
          ]} />
          <Space style={{ marginTop: 12 }}>
            <Button icon={<CalculatorOutlined />} onClick={onRecalculate} loading={recalculating}>
              重新计算
            </Button>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={saveMutation.isPending} disabled={!canEdit}>
              保存报价参数
            </Button>
            {!canEdit && <Text type="secondary">当前账号只读，不能保存修改。</Text>}
          </Space>
        </div>
      </Form>
    </div>
  )
}

function analysisReason(analysis: JourneyFirstRoundFactoryAnalysis): string | null {
  if (analysis.comparable) return null
  if (analysis.reason === "mismatch") return "币种或单位不一致，暂不进行价格比较"
  if (analysis.reason === "no_price") return "暂无有效工厂报价，暂不进行价格比较"
  return "暂无第一轮国内工厂报价"
}

function FirstRoundFactoryAnalysis({ analysis }: { analysis: JourneyFirstRoundFactoryAnalysis }) {
  const reason = analysisReason(analysis)
  const marketFields: ExcelField[] = [
    { label: "参与报价工厂数量", value: analysis.quote_count },
    { label: "有效报价数量", value: analysis.valid_quote_count },
    { label: "最低报价工厂", value: joined(analysis.lowest_factories), highlight: true },
    { label: "最低报价", value: priceWithUnit(analysis.lowest_price, analysis.currency, analysis.price_unit), highlight: true },
    { label: "第二低报价工厂", value: joined(analysis.second_lowest_factories) },
    { label: "第二低报价", value: priceWithUnit(analysis.second_lowest_price, analysis.currency, analysis.price_unit) },
    { label: "最高报价工厂", value: joined(analysis.highest_factories) },
    { label: "最高报价", value: priceWithUnit(analysis.highest_price, analysis.currency, analysis.price_unit) },
    { label: "平均报价", value: priceWithUnit(analysis.average_price, analysis.currency, analysis.price_unit) },
    { label: "中位数报价", value: priceWithUnit(analysis.median_price, analysis.currency, analysis.price_unit) },
  ]
  const selectedFields: ExcelField[] = [
    { label: "最高价 - 最低价", value: priceWithUnit(analysis.spread_amount, analysis.currency, analysis.price_unit) },
    { label: "最高价相比最低价高百分比", value: ratioPct(analysis.spread_pct), highlight: true },
    { label: "第二低价比最低价高百分比", value: ratioPct(analysis.second_lowest_vs_lowest_pct), highlight: true },
    { label: "选用工厂", value: dash(analysis.selected_factory), highlight: true },
    { label: "选用工厂价格", value: priceWithUnit(analysis.selected_factory_price, analysis.currency, analysis.price_unit), highlight: true },
    { label: "选用工厂价格排名", value: analysis.selected_factory_rank == null ? "—" : `第 ${analysis.selected_factory_rank} 名` },
    { label: "选用工厂比最低价高多少", value: priceWithUnit(analysis.selected_factory_gap_amount, analysis.currency, analysis.price_unit) },
    { label: "选用工厂比最低价高百分比", value: ratioPct(analysis.selected_factory_gap_pct) },
    { label: "选用工厂是否最低价", value: analysis.selected_factory_is_lowest == null ? "—" : analysis.selected_factory_is_lowest ? "是" : "否", highlight: true },
  ]
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label="第一轮工厂价格分析" color={C_GREEN} />
      {reason && (
        <div style={{
          background: "#fffbe6", border: "1px solid #ffe58f", borderBottom: 0,
          padding: "8px 10px", color: "#8c6d1f", fontSize: 13,
        }}>
          {reason}
        </div>
      )}
      <ExcelTwoRowTable groups={[marketFields, selectedFields]} />
    </div>
  )
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

function FactoryDecisionAid({ analysis }: { analysis: JourneyFirstRoundAnalysisBundle }) {
  const fa = analysis.factory_price_analysis
  const risk = analysis.factory_risk_analysis
  const advice = analysis.factory_selection_advice ?? {
    triggered: false,
    threshold_pct: 0.15,
    gap_pct: null,
    lowest_factories: [],
    second_lowest_factories: [],
    risk_level: null,
    attention_factory_names: [],
    messages: [],
  }
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label="工厂选择辅助判断区" color={C_GREEN} />
      <ExcelTwoRowTable groups={[[
        { label: "选用工厂是否最低价", value: fa.selected_factory_is_lowest == null ? "—" : fa.selected_factory_is_lowest ? "是" : "否", highlight: true },
        { label: "选用工厂比最低价高多少", value: priceWithUnit(fa.selected_factory_gap_amount, fa.currency, fa.price_unit) },
        { label: "选用工厂比最低价高百分比", value: ratioPct(fa.selected_factory_gap_pct) },
        { label: "最低工厂风险等级", value: dash(risk.risk_level), highlight: risk.risk_level === "high" || risk.risk_level === "blocked" },
        { label: "最低工厂问题备注", value: dash(risk.risk_notes) },
        { label: "建议关注工厂", value: joined(advice.attention_factory_names), highlight: advice.triggered },
        { label: "需要人工确认", value: advice.triggered ? "是" : "—", highlight: advice.triggered },
      ]]} />
      <AnalysisAlerts messages={analysis.analysis_messages.filter(m => ["最低报价差距较大", "最低报价差距明显", "最低报价工厂风险记录", "最低报价工厂限制合作", "工厂问题备注", "建议关注第二低报价工厂"].includes(m.title))} />
    </div>
  )
}

function HistoricalPriceReference({ historical }: { historical: JourneyHistoricalPriceReference }) {
  const columns = [
    { title: "询单号", dataIndex: "inquiry_no", width: 120 },
    { title: "客户", dataIndex: "customer_short_name", width: 120, render: (v: string | null, r: { customer_code: string | null }) => v || r.customer_code || "—" },
    { title: "品类", dataIndex: "product_category", width: 90, render: (v: string | null) => dash(v) },
    { title: "品名", dataIndex: "product_name", width: 140, render: (v: string | null) => dash(v) },
    { title: "系列", dataIndex: "series_name", width: 120, render: (v: string | null) => dash(v) },
    { title: "工厂", dataIndex: "factory_name", width: 140, render: (v: string | null) => dash(v) },
    { title: "价格", dataIndex: "factory_price", width: 90, align: "right" as const, render: (v: number | null, r: { currency: string | null; price_unit: string | null }) => priceWithUnit(v, r.currency, r.price_unit) },
    { title: "询单日期", dataIndex: "inquiry_date", width: 110, render: (v: string | null) => dash(v) },
    { title: "订单状态", dataIndex: "order_status", width: 100, render: (v: string | null) => dash(v) },
  ]
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label="历史价格参考区" color={C_LIGHT_BLUE} />
      {historical.message && (
        <Alert type={historical.status === "no_data" ? "info" : "warning"} showIcon style={{ borderRadius: 0, borderBottom: 0 }} message={historical.message} />
      )}
      <ExcelTwoRowTable groups={[[
        { label: "匹配规则", value: dash(historical.match_rule) },
        { label: "历史样本数量", value: historical.sample_count },
        { label: "历史最低价", value: priceWithUnit(historical.historical_lowest_price, historical.currency, historical.price_unit) },
        { label: "历史最高价", value: priceWithUnit(historical.historical_highest_price, historical.currency, historical.price_unit) },
        { label: "历史平均价", value: priceWithUnit(historical.historical_average_price, historical.currency, historical.price_unit) },
        { label: "历史中位数价", value: priceWithUnit(historical.historical_median_price, historical.currency, historical.price_unit) },
      ], [
        { label: "常规价格区间 P25", value: priceWithUnit(historical.normal_price_range_low, historical.currency, historical.price_unit), highlight: true },
        { label: "常规价格区间 P75", value: priceWithUnit(historical.normal_price_range_high, historical.currency, historical.price_unit), highlight: true },
        { label: "当前最低价低于历史区间", value: historical.current_lowest_below_range == null ? "—" : historical.current_lowest_below_range ? "是" : "否" },
        { label: "当前选用工厂价高于历史区间", value: historical.selected_price_above_range == null ? "—" : historical.selected_price_above_range ? "是" : "否" },
      ]]} />
      {historical.samples.length > 0 && (
        <div style={{ border: "1px solid #d9d9d9", borderTop: 0, padding: 10, background: "#fff" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>历史样本明细</Text>
          <Table
            rowKey={r => `${r.inquiry_id}-${r.factory_name}-${r.factory_price}`}
            columns={columns}
            dataSource={historical.samples}
            size="small"
            pagination={{ pageSize: 5, size: "small" }}
            scroll={{ x: 1030 }}
          />
        </div>
      )}
    </div>
  )
}

function CustomerTargetAnalysis({ analysis }: { analysis: JourneyFirstRoundAnalysisBundle }) {
  const target = analysis.customer_target_price_analysis
  return (
    <div style={{ marginTop: 10 }}>
      <SectionTitle label="客人目标价可行性分析区" color={C_ORANGE} />
      <ExcelTwoRowTable groups={[[
        { label: "客人目标价", value: money(target.customer_target_price_usd), highlight: true },
        { label: "当前给客人报的价格", value: money(target.final_quote_usd) },
        { label: "目标价 vs 当前报价差额", value: signedMoney(target.target_vs_current_diff), highlight: true },
        { label: "目标价 vs 当前报价差百分比", value: ratioPct(target.target_vs_current_diff_pct) },
        { label: "达到目标价所需降价百分比", value: ratioPct(target.required_discount_pct), highlight: true },
      ], [
        { label: "按目标价预计销售额", value: money(target.target_sales_amount_usd) },
        { label: "按目标价预计毛利润", value: money(target.target_gross_profit_cny) },
        { label: "按目标价预计毛利率", value: ratioPct(target.target_gross_profit_rate), highlight: true },
        { label: "目标价下是否仍有利润", value: target.target_has_profit == null ? "—" : target.target_has_profit ? "是" : "否", highlight: true },
        { label: "缺少关键字段", value: target.missing_fields.length ? target.missing_fields.join("、") : "—" },
      ]]} />
      <AnalysisAlerts messages={target.messages} />
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
          {analysis.ai_analysis_messages.map((section, idx) => (
            <div key={section.title} style={{ border: "1px solid #f0f0f0", padding: "8px 10px", background: "#fafafa" }}>
              <Text strong>{idx + 1}. {section.title}</Text>
              <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {(section.items ?? []).map((item, itemIdx) => (
                  <li key={itemIdx} style={{ lineHeight: 1.7 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </Space>
      </div>
    </div>
  )
}

interface FirstRoundQuoteForm {
  factory_id: string | null
  factory_name: string
  factory_price: number | null
  currency: string
  price_unit: string
  remark: string
}

function formFromBrief(r: JourneyFactoryQuoteBrief): FirstRoundQuoteForm {
  return {
    factory_id: r.factory_id,
    factory_name: r.factory_name ?? "",
    factory_price: r.factory_price,
    currency: r.currency ?? "CNY",
    price_unit: r.price_unit ?? "件",
    remark: r.remark ?? "",
  }
}

function emptyFirstRoundQuoteForm(): FirstRoundQuoteForm {
  return { factory_id: null, factory_name: "", factory_price: null, currency: "CNY", price_unit: "件", remark: "" }
}

function FirstRoundFactoryQuoteEditor({
  inquiryId,
  firstRound,
  canEdit,
}: {
  inquiryId: string
  firstRound: JourneyFirstRound
  canEdit: boolean
}) {
  const [msgApi, ctx] = message.useMessage()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<{ localId: string; form: FirstRoundQuoteForm }[]>([])
  const [edits, setEdits] = useState<Record<string, FirstRoundQuoteForm>>({})

  const { data: factoryList } = useQuery({
    queryKey: ["factories-for-quote-select"],
    queryFn: () => fetchFactories({ page_size: 200 }),
  })
  const factoryOptions = (factoryList?.items ?? []).map(f => ({
    value: f.factory_short_name || f.factory_name || "",
    id: f.id,
  }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["inquiry-journey", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["quote-items"] })
    queryClient.invalidateQueries({ queryKey: ["factory-quotes", inquiryId] })
    queryClient.invalidateQueries({ queryKey: ["factory-detail"] })
    queryClient.invalidateQueries({ queryKey: ["operation-logs"] })
  }

  const validate = (form: FirstRoundQuoteForm): string | null => {
    if (!form.factory_id && !form.factory_name.trim()) return "请选择工厂或填写工厂名称"
    if (form.factory_price == null || form.factory_price < 0) return "请填写工厂报价（不能为负数）"
    return null
  }

  const body = (form: FirstRoundQuoteForm) => ({
    factory_id: form.factory_id,
    factory_name: form.factory_name.trim() || undefined,
    factory_price: form.factory_price ?? 0,
    currency: form.currency,
    price_unit: form.price_unit,
    quote_round: 1,
    quote_type: "domestic",
    remark: form.remark.trim() || undefined,
  })

  const createMutation = useMutation({
    mutationFn: ({ form }: { localId: string; form: FirstRoundQuoteForm }) =>
      createFactoryQuote(inquiryId, body(form)),
    onSuccess: (_res, vars) => {
      msgApi.success("第一轮工厂报价已保存")
      setDrafts(prev => prev.filter(d => d.localId !== vars.localId))
      invalidate()
    },
    onError: (e: Error) => msgApi.error(`保存失败：${e.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: FirstRoundQuoteForm }) =>
      updateFactoryQuote(id, body(form)),
    onSuccess: (_res, vars) => {
      msgApi.success("第一轮工厂报价已更新")
      setEdits(prev => { const next = { ...prev }; delete next[vars.id]; return next })
      invalidate()
    },
    onError: (e: Error) => msgApi.error(`保存失败：${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFactoryQuote(id),
    onSuccess: () => {
      msgApi.success("已删除第一轮工厂报价")
      invalidate()
    },
    onError: (e: Error) => msgApi.error(`删除失败：${e.message}`),
  })

  const renderForm = (
    key: string,
    form: FirstRoundQuoteForm,
    onChange: (f: FirstRoundQuoteForm) => void,
    onSave: () => void,
    onDelete: () => void,
    saving: boolean,
    deleting: boolean,
    isDraft: boolean,
  ) => (
    <Card key={key} size="small" style={{ marginBottom: 8, background: isDraft ? "#fafafa" : undefined }}>
      <Row gutter={12} align="middle">
        <Col span={7}>
          <Text type="secondary" style={{ fontSize: 12 }}>工厂</Text>
          <AutoComplete
            disabled={!canEdit}
            value={form.factory_name}
            options={factoryOptions}
            filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
            onSelect={(value, option) => onChange({ ...form, factory_name: value, factory_id: (option as { id: string }).id })}
            onChange={value => onChange({ ...form, factory_name: value, factory_id: null })}
            style={{ width: "100%" }}
            placeholder="选择已有工厂或输入名称"
          />
        </Col>
        <Col span={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>报价</Text>
          <InputNumber disabled={!canEdit} min={0} precision={4} value={form.factory_price} onChange={v => onChange({ ...form, factory_price: v })} style={{ width: "100%" }} />
        </Col>
        <Col span={3}>
          <Text type="secondary" style={{ fontSize: 12 }}>币种</Text>
          <Select disabled={!canEdit} value={form.currency} options={CURRENCY_OPTIONS.map(v => ({ label: v, value: v }))} onChange={v => onChange({ ...form, currency: v })} style={{ width: "100%" }} />
        </Col>
        <Col span={3}>
          <Text type="secondary" style={{ fontSize: 12 }}>单位</Text>
          <Select disabled={!canEdit} value={form.price_unit} options={PRICE_UNIT_OPTIONS.map(v => ({ label: v, value: v }))} onChange={v => onChange({ ...form, price_unit: v })} style={{ width: "100%" }} />
        </Col>
        <Col span={5}>
          <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
          <Input disabled={!canEdit} value={form.remark} onChange={e => onChange({ ...form, remark: e.target.value })} />
        </Col>
        <Col span={2}>
          {canEdit && (
            <Space size={4}>
              <Popconfirm title={isDraft ? "取消新增？" : "删除该第一轮报价？"} onConfirm={onDelete}>
                <Button size="small" danger loading={deleting}>删</Button>
              </Popconfirm>
              <Button size="small" type="primary" loading={saving} onClick={onSave}>存</Button>
            </Space>
          )}
        </Col>
      </Row>
    </Card>
  )

  return (
    <div style={{ marginTop: 10 }}>
      {ctx}
      <SectionTitle label="第一轮国内工厂报价录入" color={C_LIGHT_BLUE} />
      <div style={{ border: "1px solid #d9d9d9", borderTop: 0, padding: 10, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <Text type="secondary">只录入 quote_round = 1、quote_type = domestic 的工厂报价。</Text>
          {canEdit && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setDrafts(prev => [...prev, { localId: `draft-${Date.now()}`, form: emptyFirstRoundQuoteForm() }])}>新增第一轮报价</Button>}
        </div>
        {firstRound.factory_quotes.map(r => {
          const form = edits[r.id] ?? formFromBrief(r)
          return renderForm(
            r.id,
            form,
            f => setEdits(prev => ({ ...prev, [r.id]: f })),
            () => {
              const err = validate(form)
              if (err) { msgApi.warning(err); return }
              updateMutation.mutate({ id: r.id, form })
            },
            () => deleteMutation.mutate(r.id),
            updateMutation.isPending && updateMutation.variables?.id === r.id,
            deleteMutation.isPending && deleteMutation.variables === r.id,
            false,
          )
        })}
        {drafts.map(d => renderForm(
          d.localId,
          d.form,
          f => setDrafts(prev => prev.map(x => x.localId === d.localId ? { ...x, form: f } : x)),
          () => {
            const err = validate(d.form)
            if (err) { msgApi.warning(err); return }
            createMutation.mutate({ localId: d.localId, form: d.form })
          },
          () => setDrafts(prev => prev.filter(x => x.localId !== d.localId)),
          createMutation.isPending && createMutation.variables?.localId === d.localId,
          false,
          true,
        ))}
        {firstRound.factory_quotes.length === 0 && drafts.length === 0 && (
          <Text type="secondary">暂无第一轮国内工厂报价。</Text>
        )}
      </div>
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
    <div style={{ marginBottom: 16, border: "1px solid #d9d9d9", background: "#fff" }}>
      <div style={{ background: "#262626", color: "#fff", padding: "6px 10px", fontSize: 14, fontWeight: 700 }}>
        第一轮报价
      </div>
      <div style={{ padding: 10 }}>
        <FirstRoundBaseParams
          firstRound={firstRound}
          inquiryId={inquiryId}
          canEdit={canEdit}
          onRecalculate={onRecalculate}
          recalculating={recalculating}
          onSaved={onSaved}
        />
        <FirstRoundFactoryAnalysis analysis={analysis.factory_price_analysis} />
        <FactoryQuoteDetails
          label="第一轮工厂报价明细"
          items={firstRound.factory_quotes}
          analysis={analysis.factory_price_analysis}
          emptyText="暂无第一轮国内工厂报价明细"
        />
        <FirstRoundFactoryQuoteEditor inquiryId={inquiryId} firstRound={firstRound} canEdit={canEdit} />
        <FactoryDecisionAid analysis={analysis} />
        <HistoricalPriceReference historical={analysis.historical_price_reference} />
        <CustomerTargetAnalysis analysis={analysis} />
        <AiAnalysisHints analysis={analysis} />
      </div>
    </div>
  )
}

function roundTitle(round: JourneyRound): string {
  return `${quoteTypeName(round.quote_type)}第${roundName(round.quote_round)}轮报价`
}

function roundQuotes(round: JourneyRound): JourneyFactoryQuoteBrief[] {
  return [round.factory1, round.factory2, ...round.other_factories].filter((it): it is JourneyFactoryQuoteBrief => Boolean(it))
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

  const { inquiry, customer, applicable_factory, first_round, rounds } = data
  const firstRoundAnalysis = analysisOverride ?? first_round.analysis
  const otherRounds = rounds.filter(r => !(r.quote_round === 1 && (r.quote_type ?? "domestic") === "domestic"))

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {ctx}
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
              otherRounds.map(r => <UnifiedRoundBlock key={`${r.quote_type}-${r.quote_round}`} round={r} />)
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
