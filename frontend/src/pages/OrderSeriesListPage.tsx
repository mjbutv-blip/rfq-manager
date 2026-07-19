import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate } from "react-router-dom"

import { cancelOrderSeries, fetchOrderSeries } from "@/api/order_series"
import type { OrderSeriesListItem } from "@/types/order_series"

const { Title, Text } = Typography

function val(v: unknown) {
  return v == null || v === "" ? "—" : String(v)
}

export default function OrderSeriesListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["order-series"], queryFn: fetchOrderSeries })
  const cancelMutation = useMutation({
    mutationFn: cancelOrderSeries,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["order-series"] })
      message.success("已取消报价单系列")
    },
    onError: err => message.error((err as Error).message),
  })

  const columns: ColumnsType<OrderSeriesListItem> = [
    { title: "系列编号", dataIndex: "series_code", width: 180, fixed: "left" },
    { title: "报价单系列", dataIndex: "series_name", width: 180, render: val },
    { title: "客户", width: 120, render: (_, r) => r.customer_name || r.customer_code || "—" },
    { title: "询单数", dataIndex: "inquiry_count", width: 80, align: "right" },
    { title: "订单组数", dataIndex: "order_group_count", width: 90, align: "right" },
    { title: "询单号", dataIndex: "inquiry_nos", width: 300, render: v => v.join("，") },
    { title: "来源 Excel", dataIndex: "source_file_name", width: 220, ellipsis: true, render: val },
    { title: "Sheet", dataIndex: "source_sheet", width: 100, render: val },
    { title: "来源行", width: 100, render: (_, r) => r.source_start_row ? `${r.source_start_row}-${r.source_end_row}` : "—" },
    { title: "状态", dataIndex: "series_status", width: 90, render: s => <Tag color={s === "active" ? "green" : "gold"}>{s}</Tag> },
    { title: "创建时间", dataIndex: "created_at", width: 170, render: v => v ? new Date(v).toLocaleString("zh-CN") : "—" },
    {
      title: "操作",
      width: 180,
      fixed: "right",
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" onClick={() => navigate(`/order-series/${r.id}`)}>查看分析</Button>
          <Popconfirm title="确认取消这个报价单系列？" onConfirm={() => cancelMutation.mutate(r.id)}>
            <Button size="small" danger>取消</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>报价单系列分析</Title>
      <Card>
        <Text type="secondary">同一个 Excel 报价单里的询单作为一个系列；系列内标注“一套/一组”的询单会继续进入订单组分析。</Text>
        <Table
          style={{ marginTop: 16 }}
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 1700 }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </div>
  )
}
