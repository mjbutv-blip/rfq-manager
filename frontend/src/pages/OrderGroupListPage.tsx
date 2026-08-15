import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button, Card, Popconfirm, Space, Table, Tag, Typography, message } from "antd"
import type { ColumnsType } from "antd/es/table"
import { useNavigate } from "react-router-dom"

import { cancelOrderGroup, fetchOrderGroups } from "@/api/order_groups"
import type { OrderGroupListItem } from "@/types/order_group"

const { Title, Text } = Typography

function val(v: unknown) {
  return v == null || v === "" ? "—" : String(v)
}

export default function OrderGroupListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const { data, isLoading } = useQuery({ queryKey: ["order-groups"], queryFn: fetchOrderGroups })
  const cancelMutation = useMutation({
    mutationFn: cancelOrderGroup,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["order-groups"] })
      message.success("已取消分组")
    },
    onError: err => message.error((err as Error).message),
  })

  const columns: ColumnsType<OrderGroupListItem> = [
    { title: "订单组编号", dataIndex: "group_code", width: 170, fixed: "left" },
    { title: "系列 / 组标记", dataIndex: "group_name", width: 220, ellipsis: true, render: val },
    { title: "客户", width: 140, render: (_, r) => r.customer_name || r.customer_code || "—" },
    { title: "询单数", dataIndex: "inquiry_count", width: 90, align: "right" },
    { title: "询单号", dataIndex: "inquiry_nos", width: 260, render: v => v.join("，") },
    { title: "来源 Excel", dataIndex: "source_file_name", width: 220, ellipsis: true, render: val },
    { title: "Sheet", dataIndex: "source_sheet", width: 110, render: val },
    { title: "来源行", width: 120, render: (_, r) => r.source_start_row ? `${r.source_start_row}-${r.source_end_row}` : "—" },
    { title: "状态", dataIndex: "group_status", width: 100, render: s => <Tag color={s === "active" ? "green" : "gold"}>{s}</Tag> },
    { title: "创建时间", dataIndex: "created_at", width: 180, render: v => v ? new Date(v).toLocaleString("zh-CN") : "—" },
    {
      title: "操作",
      width: 220,
      fixed: "right",
      render: (_, r) => (
        <Space>
          <Button size="small" type="primary" onClick={() => navigate(`/order-groups/${r.id}`)}>查看分析</Button>
          <Button size="small" disabled>编辑分组</Button>
          <Popconfirm title="确认取消这个订单组？" onConfirm={() => cancelMutation.mutate(r.id)}>
            <Button size="small" danger>取消分组</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>订单组分析</Title>
      <Card>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Text type="secondary">用于查看同一报价单系列下，被标注为“一套/一组”的多个询单整体报价、工厂组合、毛利润和风险提示。</Text>
          <Space wrap>
            <Button
              type="primary"
              disabled={selectedGroupIds.length === 0}
              onClick={() => navigate(`/order-groups/combined?ids=${selectedGroupIds.join(",")}`)}
            >
              合并分析{selectedGroupIds.length ? `（${selectedGroupIds.length}组）` : ""}
            </Button>
            <Button onClick={() => navigate("/order-groups/demo")}>查看示例订单组</Button>
          </Space>
        </Space>
        <Table
          style={{ marginTop: 16 }}
          rowKey="id"
          loading={isLoading}
          rowSelection={{
            selectedRowKeys: selectedGroupIds,
            onChange: keys => setSelectedGroupIds(keys.map(String)),
          }}
          columns={columns}
          dataSource={data?.items ?? []}
          scroll={{ x: 1600 }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </div>
  )
}
