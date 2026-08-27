import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, Button, Card, Descriptions, Divider, InputNumber, Popover, Select, Space, Table, Tag, Typography, message } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"

import { createFirstRoundQuoteItem, updateQuoteItem } from "@/api/inquiry_journey"
import type { QuoteItemUpdateBody } from "@/api/inquiry_journey"
import { fetchCombinedOrderGroupDetail, fetchOrderGroupDetail } from "@/api/order_groups"
import { useCurrentUser } from "@/contexts/UserContext"
import type { OrderGroupInquiryAnalysis, OrderGroupRoundPriceRow, OrderGroupRoundPriceTable, OrderGroupScenario } from "@/types/order_group"

const { Title, Text } = Typography

function val(v: unknown) {
  return v == null || v === "" ? "—" : String(v)
}

function money(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function pct(v: number | null | undefined) {
  return v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`
}

function signedMoney(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—"
  const abs = Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${abs}`
}

function changeText(amount: number | null | undefined, rate: number | null | undefined) {
  if (amount == null && rate == null) return "—"
  return `${signedMoney(amount)} / ${pct(rate)}`
}

function roundName(round: number) {
  const names: Record<number, string> = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五" }
  return names[round] ?? String(round)
}

const tableHeaderStyle = {
  background: "#1f3b66",
  color: "#fff",
  fontWeight: 600,
} as const

function sumValues(rows: OrderGroupRoundPriceRow[], field: "gross_profit_cny" | "trade_amount_usd") {
  const values = rows.map(row => row[field]).filter((value): value is number => value != null && !Number.isNaN(value))
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function sumChanges(rows: OrderGroupRoundPriceRow[], field: "gross_profit_change_amount" | "trade_amount_change_amount") {
  const values = rows.map(row => row[field]).filter((value): value is number => value != null && !Number.isNaN(value))
  return values.length === rows.length && values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

function groupedRoundRows(rows: OrderGroupRoundPriceRow[]) {
  const groups = new Map<string, OrderGroupRoundPriceRow[]>()
  rows.forEach(row => {
    const key = row.series?.trim() || "未分组"
    groups.set(key, [...(groups.get(key) ?? []), row])
  })
  return [...groups.entries()].map(([series, items]) => {
    const gross = sumValues(items, "gross_profit_cny")
    const trade = sumValues(items, "trade_amount_usd")
    const grossChange = sumChanges(items, "gross_profit_change_amount")
    const tradeChange = sumChanges(items, "trade_amount_change_amount")
    const previousGross = gross != null && grossChange != null ? gross - grossChange : null
    const previousTrade = trade != null && tradeChange != null ? trade - tradeChange : null
    return {
      series,
      items,
      gross,
      trade,
      grossChange,
      tradeChange,
      grossChangeRate: grossChange != null && previousGross ? grossChange / previousGross : null,
      tradeChangeRate: tradeChange != null && previousTrade ? tradeChange / previousTrade : null,
    }
  })
}

function InlineNumberInput({
  value,
  onCommit,
  disabled,
  min = 0,
  precision = 2,
}: {
  value: number | null
  onCommit: (value: number | null) => void
  disabled: boolean
  min?: number
  precision?: number
}) {
  return (
    <InputNumber
      key={value ?? "empty"}
      size="small"
      controls={false}
      min={min}
      precision={precision}
      defaultValue={value ?? undefined}
      disabled={disabled}
      style={{ width: "100%" }}
      onPressEnter={event => event.currentTarget.blur()}
      onBlur={event => {
        const next = event.target.value === "" ? null : Number(event.target.value.replace(/,/g, ""))
        const normalized = Number.isNaN(next) ? null : next
        if (normalized !== value) onCommit(normalized)
      }}
    />
  )
}

function calculationMissing(row: OrderGroupRoundPriceRow) {
  const missing: string[] = []
  if (!row.quantity) missing.push("数量")
  if (row.customer_price_usd == null) missing.push("客人价格")
  if (row.selected_factory_price_cny == null) missing.push("工厂价")
  if (row.current_exchange_rate == null) missing.push("汇率")
  return missing
}

function PriceRoundTable({
  table,
  onOpenInquiry,
  onInputChange,
  savingKey,
  canEdit,
}: {
  table: OrderGroupRoundPriceTable
  onOpenInquiry: (inquiryId: string) => void
  onInputChange: (row: OrderGroupRoundPriceRow, quoteRound: number, body: QuoteItemUpdateBody) => void
  savingKey: string | null
  canEdit: boolean
}) {
  const groups = groupedRoundRows(table.rows)
  const isFirstRound = table.quote_round === 1
  const cellStyle = { border: "1px solid #d9e2ec", padding: "7px 8px", verticalAlign: "middle", background: "#fff" } as const
  const totalStyle = { ...cellStyle, background: "#f8fafc", fontWeight: 700 } as const

  return (
    <Card
      size="small"
      title={`第${roundName(table.quote_round)}次报价`}
      styles={{ header: tableHeaderStyle, body: { padding: 0 } }}
      style={{ marginBottom: 0, overflow: "hidden", borderRadius: 0 }}
    >
      <div style={{ overflowX: "auto", background: "#f8fafc" }}>
        <table style={{ width: "100%", minWidth: isFirstRound ? 1320 : 2050, borderCollapse: "collapse", tableLayout: "fixed", fontSize: 13 }}>
          <thead>
            <tr>
              {(isFirstRound
                ? ["系列", "询单号", "订单号", "图片", "数量", "选用工厂", "报价利润值", "客人价格", "毛利润额", "整组毛利润额", "贸易额", "整组贸易额"]
                : ["系列", "询单号", "订单号", "图片", "数量", "选用工厂", "净利润值", "客人价格", "客人价格变动差价", "客人价格变动比率", "毛利润额", "毛利润额变动情况", "整组毛利润额", "整组毛利润额变动情况", "贸易额", "整组贸易额", "整组贸易额变动情况"]
              ).map(label => <th key={label} style={{ ...tableHeaderStyle, border: "1px solid #d9e2ec", padding: "8px 6px", textAlign: "center", width: label === "图片" ? 80 : label.includes("变动") ? 145 : 110 }}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap(group => group.items.map((row, index) => {
              const rowKey = `${table.quote_round}:${row.inquiry_id}`
              const first = index === 0
              const saving = savingKey === rowKey
              const missing = calculationMissing(row)
              const calculationInputs = (
                <Space direction="vertical" size={8} style={{ width: 260 }}>
                  <Text type="secondary">填写后由正式 QuoteItem 公式重新计算毛利润与贸易额。</Text>
                  <label>当下汇率</label>
                  <InlineNumberInput value={row.current_exchange_rate} disabled={!canEdit || saving} precision={4} onCommit={value => onInputChange(row, table.quote_round, { current_exchange_rate: value })} />
                  <label>佣金（%）</label>
                  <InlineNumberInput value={row.commission_pct} disabled={!canEdit || saving} precision={2} onCommit={value => onInputChange(row, table.quote_round, { commission_pct: value })} />
                  <label>港杂费（CNY/件）</label>
                  <InlineNumberInput value={row.port_misc_fee_cny} disabled={!canEdit || saving} onCommit={value => onInputChange(row, table.quote_round, { port_misc_fee_cny: value })} />
                  <label>测试费（CNY/件）</label>
                  <InlineNumberInput value={row.test_fee_cny} disabled={!canEdit || saving} onCommit={value => onInputChange(row, table.quote_round, { test_fee_cny: value })} />
                  <label>其他费用（CNY/件）</label>
                  <InlineNumberInput value={row.misc_fee_cny} disabled={!canEdit || saving} onCommit={value => onInputChange(row, table.quote_round, { misc_fee_cny: value })} />
                </Space>
              )
              return <tr key={rowKey}>
                {first && <td rowSpan={group.items.length} style={{ ...totalStyle, textAlign: "center" }}>{group.series}</td>}
                <td style={cellStyle}><Button type="link" size="small" onClick={() => onOpenInquiry(row.inquiry_id)}>{row.inquiry_no}</Button></td>
                <td style={cellStyle}>{val(row.customer_order_no)}</td>
                <td style={{ ...cellStyle, textAlign: "center", color: "#98a2b3" }}>{row.image ? <img src={row.image} alt="产品" style={{ width: 56, height: 56, objectFit: "contain" }} /> : "暂无图片"}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}><InlineNumberInput value={row.quantity} disabled={!canEdit || saving} precision={0} onCommit={value => onInputChange(row, table.quote_round, { order_quantity: value })} /></td>
                <td style={cellStyle}>
                  <Select
                    size="small"
                    allowClear
                    showSearch
                    value={row.selected_factory ?? undefined}
                    disabled={!canEdit || saving}
                    placeholder="选择工厂"
                    style={{ width: "100%" }}
                    options={row.factory_options.map(option => ({ value: option.factory_name, label: `${option.factory_name} / ¥${money(option.factory_price_cny)}` }))}
                    onChange={factoryName => {
                      const option = row.factory_options.find(item => item.factory_name === factoryName)
                      onInputChange(row, table.quote_round, { selected_factory: factoryName ?? null, selected_factory_price_cny: option?.factory_price_cny ?? null })
                    }}
                  />
                </td>
                <td style={cellStyle}>
                  <InlineNumberInput value={row.profit_value} disabled={!canEdit || saving} onCommit={value => onInputChange(row, table.quote_round, { net_profit_pct: value })} />
                  <Popover title="计算参数" content={calculationInputs} trigger="click">
                    <Button type="link" size="small" style={{ padding: 0 }} disabled={!canEdit}>{missing.length ? `补充参数（缺${missing.join("、")}）` : "计算参数"}</Button>
                  </Popover>
                </td>
                <td style={{ ...cellStyle, textAlign: "right" }}><InlineNumberInput value={row.customer_price_usd} disabled={!canEdit || saving} precision={4} onCommit={value => onInputChange(row, table.quote_round, { final_quote_usd: value })} /></td>
                {!isFirstRound && <td style={{ ...cellStyle, textAlign: "right" }}>{signedMoney(row.customer_price_change_amount)}</td>}
                {!isFirstRound && <td style={{ ...cellStyle, textAlign: "right" }}>{pct(row.customer_price_change_rate)}</td>}
                <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700 }}>{row.gross_profit_cny == null && missing.length ? <Text type="secondary">待补：{missing.join("、")}</Text> : money(row.gross_profit_cny)}</td>
                {!isFirstRound && <td style={{ ...cellStyle, textAlign: "right" }}>{changeText(row.gross_profit_change_amount, row.gross_profit_change_rate)}</td>}
                {first && <td rowSpan={group.items.length} style={{ ...totalStyle, textAlign: "right" }}>{money(group.gross)}</td>}
                {!isFirstRound && first && <td rowSpan={group.items.length} style={{ ...totalStyle, textAlign: "right" }}>{changeText(group.grossChange, group.grossChangeRate)}</td>}
                <td style={{ ...cellStyle, textAlign: "right" }}>{money(row.trade_amount_usd)}</td>
                {first && <td rowSpan={group.items.length} style={{ ...totalStyle, textAlign: "right" }}>{money(group.trade)}</td>}
                {!isFirstRound && first && <td rowSpan={group.items.length} style={{ ...totalStyle, textAlign: "right" }}>{changeText(group.tradeChange, group.tradeChangeRate)}</td>}
              </tr>
            }))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ScenarioCard({ scenario }: { scenario: OrderGroupScenario }) {
  return (
    <Card size="small" title={`${scenario.code}：${scenario.label}`} style={{ marginBottom: 12 }}>
      <Descriptions size="small" column={4}>
        <Descriptions.Item label="工厂数量">{scenario.factory_count}</Descriptions.Item>
        <Descriptions.Item label="整组客户报价总额">{money(scenario.customer_amount_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组工厂成本">{money(scenario.factory_cost_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润">{money(scenario.gross_profit_cny)}</Descriptions.Item>
        <Descriptions.Item label="整组毛利润率">{pct(scenario.gross_profit_rate)}</Descriptions.Item>
        <Descriptions.Item label="缺失字段">{scenario.missing_fields.length ? scenario.missing_fields.join("，") : "—"}</Descriptions.Item>
        {"extra_cost_vs_lowest" in scenario && <Descriptions.Item label="比最低价方案多花">{money(scenario.extra_cost_vs_lowest)}</Descriptions.Item>}
        {"profit_gap_vs_lowest" in scenario && <Descriptions.Item label="比最低价方案利润差">{money(scenario.profit_gap_vs_lowest)}</Descriptions.Item>}
        {"profit_gap_vs_best_unified" in scenario && <Descriptions.Item label="比最佳统一工厂利润差">{money(scenario.profit_gap_vs_best_unified)}</Descriptions.Item>}
      </Descriptions>
      <Text type="secondary">{scenario.management_note}</Text>
      <Table
        size="small"
        style={{ marginTop: 10 }}
        rowKey={r => `${scenario.code}-${r.inquiry_id}`}
        pagination={false}
        dataSource={scenario.selections}
        columns={[
          { title: "询单号", dataIndex: "inquiry_no" },
          { title: "工厂", dataIndex: "factory_name", render: val },
          { title: "工厂价", dataIndex: "factory_price", align: "right", render: money },
        ]}
      />
    </Card>
  )
}

function groupTitle(data: { group: { group_name: string | null; source_file_name: string | null } }) {
  const sourceName = data.group.source_file_name?.replace(/\.(xlsx|xlsm|xls)$/i, "")
  const groupName = data.group.group_name?.replace(/^询单号\s*\/\s*/, "").trim()
  if (sourceName && groupName && groupName !== sourceName) return `${sourceName} / ${groupName}`
  return groupName || sourceName || "订单组"
}

export default function OrderGroupDetailPage() {
  const { groupId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const canEdit = currentUser.role !== "viewer"
  const [msgApi, ctx] = message.useMessage()
  const combinedIds = (searchParams.get("ids") ?? "").split(",").map(s => s.trim()).filter(Boolean)
  const isCombined = !groupId || groupId === "combined"
  const detailQueryKey = isCombined ? ["order-group-combined-detail", combinedIds] : ["order-group-detail", groupId]
  const { data, isLoading, error } = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => isCombined ? fetchCombinedOrderGroupDetail(combinedIds) : fetchOrderGroupDetail(groupId!),
    enabled: isCombined ? combinedIds.length > 0 : !!groupId,
  })
  const inputMutation = useMutation({
    mutationFn: async ({ row, quoteRound, body }: { row: OrderGroupRoundPriceRow; quoteRound: number; body: QuoteItemUpdateBody }) => {
      if (row.quote_item_id) {
        return updateQuoteItem(row.quote_item_id, body)
      }
      return createFirstRoundQuoteItem(row.inquiry_id, {
        order_quantity: row.quantity,
        selected_factory: row.selected_factory,
        selected_factory_price_cny: row.selected_factory_price_cny,
        net_profit_pct: row.profit_value,
        final_quote_usd: row.customer_price_usd,
        current_exchange_rate: row.current_exchange_rate,
        commission_pct: row.commission_pct,
        port_misc_fee_cny: row.port_misc_fee_cny,
        test_fee_cny: row.test_fee_cny,
        misc_fee_cny: row.misc_fee_cny,
        ...body,
      }, { quoteRound })
    },
    onSuccess: async () => {
      msgApi.success("报价输入已保存，计算结果已更新")
      await queryClient.invalidateQueries({ queryKey: detailQueryKey })
    },
    onError: err => msgApi.error((err as Error).message),
  })

  if (isLoading) return <div style={{ padding: 24 }}>加载中...</div>
  if (error) return <div style={{ padding: 24 }}><Alert type="error" showIcon message="无法加载订单组" description={(error as Error).message} /></div>
  if (!data) return null

  const inquiryColumns: ColumnsType<OrderGroupInquiryAnalysis> = [
    { title: "询单号", dataIndex: "inquiry_no", fixed: "left", width: 120, render: (v, r) => <Button type="link" onClick={() => navigate(`/inquiry/${r.inquiry_id}/journey`)}>{v}</Button> },
    { title: "订单号", dataIndex: "customer_order_no", width: 130, render: val },
    { title: "品名", dataIndex: "product_name", width: 180, render: val },
    { title: "数量", dataIndex: "quantity", width: 100, align: "right", render: val },
    { title: "数量占比", dataIndex: "quantity_share", width: 100, align: "right", render: pct },
    { title: "订单状态", dataIndex: "order_status", width: 110, render: val },
    { title: "选用工厂", dataIndex: "selected_factory", width: 140, render: val },
    { title: "给客人报价", dataIndex: "final_quote_usd", width: 120, align: "right", render: money },
    { title: "选用工厂价", dataIndex: "selected_factory_price_cny", width: 120, align: "right", render: money },
    { title: "最低工厂", dataIndex: "lowest_factory", width: 140, render: val },
    { title: "最低价", dataIndex: "lowest_price", width: 110, align: "right", render: money },
    { title: "最高价差%", dataIndex: "spread_pct", width: 120, align: "right", render: pct },
    { title: "毛利润额", dataIndex: "gross_profit_cny", width: 120, align: "right", render: money },
    { title: "贸易额", dataIndex: "trade_amount_usd", width: 120, align: "right", render: money },
    { title: "贸易额占比", dataIndex: "trade_amount_share", width: 110, align: "right", render: pct },
  ]

  return (
    <div style={{ padding: 24 }}>
      {ctx}
      <Space style={{ marginBottom: 12 }}>
        <Button onClick={() => navigate("/order-groups")}>返回订单组列表</Button>
      </Space>
      <Title level={3}>订单组分析</Title>

      <Card size="small" title="订单组基础信息" style={{ marginBottom: 12 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="订单组编号">{data.group.group_code}</Descriptions.Item>
          <Descriptions.Item label="系列 / 组标记">{val(groupTitle(data))}</Descriptions.Item>
          <Descriptions.Item label="客户">{val(data.group.customer_code)}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={data.group.group_status === "active" ? "green" : "gold"}>{data.group.group_status}</Tag></Descriptions.Item>
          <Descriptions.Item label="来源文件">{val(data.group.source_file_name)}</Descriptions.Item>
          <Descriptions.Item label="Sheet">{val(data.group.source_sheet)}</Descriptions.Item>
          <Descriptions.Item label="来源行">{data.group.source_start_row ? `${data.group.source_start_row}-${data.group.source_end_row}` : "—"}</Descriptions.Item>
          <Descriptions.Item label="备注">{val(data.group.notes)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        size="small"
        title={`${groupTitle(data)} · 成组看价格情况`}
        styles={{ header: tableHeaderStyle, body: { padding: 0 } }}
        style={{ marginBottom: 16, overflow: "hidden" }}
      >
        {data.analysis.round_price_tables.length ? (
          data.analysis.round_price_tables.map((table, index) => (
            <div key={table.quote_round}>
              {index > 0 && <Divider style={{ margin: 0 }} />}
              <PriceRoundTable
                table={table}
                onOpenInquiry={inquiryId => navigate(`/inquiry/${inquiryId}/journey`)}
                canEdit={canEdit}
                savingKey={inputMutation.variables ? `${inputMutation.variables.quoteRound}:${inputMutation.variables.row.inquiry_id}` : null}
                onInputChange={(row, quoteRound, body) => inputMutation.mutate({ row, quoteRound, body })}
              />
            </div>
          ))
        ) : (
          <div style={{ padding: 12 }}><Text type="secondary">暂无报价轮次数据。</Text></div>
        )}
      </Card>

      <Card size="small" title="组内询单列表" style={{ marginBottom: 16, display: "none" }}>
        <Table rowKey="inquiry_id" size="small" columns={inquiryColumns} dataSource={data.analysis.inquiries} scroll={{ x: 1800 }} pagination={false} />
      </Card>

      <Card size="small" title="辅助分析" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <ScenarioCard scenario={data.analysis.scenarios.lowest_each} />
          {data.analysis.scenarios.unified_factory.length ? (
            data.analysis.scenarios.unified_factory.map(s => <ScenarioCard key={s.unified_factory ?? s.label} scenario={s} />)
          ) : (
            <Alert type="info" showIcon message="没有工厂给组内所有询单都报过价，暂不能形成统一工厂方案 B。" />
          )}
          <ScenarioCard scenario={data.analysis.scenarios.current_selected} />
          <Card size="small" title="D：自定义组合方案">
            <Text type="secondary">本阶段预留，后续可让业务员手动选择每个询单对应工厂后实时计算整组利润。</Text>
          </Card>
        </Space>
      </Card>

      <Card size="small" title="辅助决策指标" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="最低价方案工厂数量">{data.analysis.auxiliary_metrics.factory_concentration.lowest_each_factory_count}</Descriptions.Item>
          <Descriptions.Item label="当前方案工厂数量">{data.analysis.auxiliary_metrics.factory_concentration.current_factory_count}</Descriptions.Item>
          <Descriptions.Item label="可统一承接工厂数">{data.analysis.auxiliary_metrics.factory_concentration.common_factory_count}</Descriptions.Item>
          <Descriptions.Item label="缺有效报价询单">{data.analysis.auxiliary_metrics.missing_quote_inquiries.length ? data.analysis.auxiliary_metrics.missing_quote_inquiries.join("，") : "—"}</Descriptions.Item>
          <Descriptions.Item label="数量关键款">{data.analysis.auxiliary_metrics.quantity_key_inquiries.map(i => i.inquiry_no).join("，") || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" title="风险与提醒">
        {data.analysis.warnings.length ? (
          <Space direction="vertical">
            {data.analysis.warnings.map(w => <Alert key={w} type="warning" showIcon message={w} />)}
          </Space>
        ) : (
          <Text type="secondary">暂无风险提示。所有分析仅用于辅助决策，最终工厂选择仍需人工确认交期、质量、产能和客户要求。</Text>
        )}
      </Card>
    </div>
  )
}
