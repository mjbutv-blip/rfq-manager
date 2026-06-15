import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Button, Card, Col, DatePicker, Form, Input, InputNumber,
  message, Modal, Popconfirm, Row, Select, Statistic, Switch,
  Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons"
import dayjs from "dayjs"

import { createProduction, deleteProduction, fetchProductions, fetchProductionStats } from "@/api/productions"
import type { ProductionRecord } from "@/types/production"
import {
  DELAY_RISK_COLOR, DELAY_RISK_LABEL, DELAY_RISK_OPTIONS,
  PRODUCTION_STATUS_COLOR, PRODUCTION_STATUS_LABEL, PRODUCTION_STATUS_OPTIONS,
} from "@/types/production"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography

export default function ProductionListPage() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const qc = useQueryClient()
  const canEdit = user.role !== "viewer"
  const isAdmin = user.role === "admin"

  const [filterNo,        setFilterNo]        = useState("")
  const [filterInqNo,     setFilterInqNo]     = useState("")
  const [filterCustomer,  setFilterCustomer]  = useState("")
  const [filterFactory,   setFilterFactory]   = useState("")
  const [filterCat,       setFilterCat]       = useState("")
  const [filterStatus,    setFilterStatus]    = useState("")
  const [filterRisk,      setFilterRisk]      = useState("")
  const [filterSales,     setFilterSales]     = useState("")
  const [filterGroup,     setFilterGroup]     = useState("")
  const [filterMerchan,   setFilterMerchan]   = useState("")
  const [filterDates,     setFilterDates]     = useState<[string, string] | null>(null)
  const [overdueOnly,     setOverdueOnly]     = useState(false)
  const [page,            setPage]            = useState(1)
  const [showCreate,      setShowCreate]      = useState(false)
  const [createForm]                          = Form.useForm()

  const params = {
    production_no:       filterNo       || undefined,
    inquiry_no:          filterInqNo    || undefined,
    customer_short_name: filterCustomer || undefined,
    factory_name:        filterFactory  || undefined,
    product_category:    filterCat      || undefined,
    production_status:   filterStatus   || undefined,
    delay_risk_level:    filterRisk     || undefined,
    responsible_sales:   filterSales    || undefined,
    group_name:          filterGroup    || undefined,
    merchandiser:        filterMerchan  || undefined,
    start_date:          filterDates?.[0] || undefined,
    end_date:            filterDates?.[1] || undefined,
    overdue_only:        overdueOnly || undefined,
    page,
    page_size: 50,
    sort_by: "delivery_date",
    sort_order: "asc",
  }

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["productions", params],
    queryFn: () => fetchProductions(params),
    placeholderData: prev => prev,
  })

  const { data: stats } = useQuery({
    queryKey: ["production-stats"],
    queryFn: fetchProductionStats,
    refetchInterval: 120_000,
  })

  const createMutation = useMutation({
    mutationFn: createProduction,
    onSuccess: (r) => {
      message.success("生产跟单已创建")
      qc.invalidateQueries({ queryKey: ["productions"] })
      qc.invalidateQueries({ queryKey: ["production-stats"] })
      setShowCreate(false)
      createForm.resetFields()
      navigate(`/productions/${r.id}`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "创建失败")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProduction,
    onSuccess: () => {
      message.success("已删除")
      qc.invalidateQueries({ queryKey: ["productions"] })
      qc.invalidateQueries({ queryKey: ["production-stats"] })
    },
  })

  const handleReset = () => {
    setFilterNo(""); setFilterInqNo(""); setFilterCustomer(""); setFilterFactory("")
    setFilterCat(""); setFilterStatus(""); setFilterRisk(""); setFilterSales("")
    setFilterGroup(""); setFilterMerchan(""); setFilterDates(null); setOverdueOnly(false); setPage(1)
  }

  const columns: ColumnsType<ProductionRecord> = [
    {
      title: "跟单编号",
      dataIndex: "production_no",
      width: 90,
      render: (v: string, r: ProductionRecord) => (
        <a onClick={() => navigate(`/productions/${r.id}`)}>{v}</a>
      ),
    },
    {
      title: "询单号",
      dataIndex: "inquiry_no",
      width: 110,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "客户",
      dataIndex: "customer_short_name",
      width: 90,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "工厂",
      dataIndex: "factory_name",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "品名",
      dataIndex: "product_name",
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "订单数量",
      dataIndex: "order_quantity",
      width: 75,
      align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "交期",
      dataIndex: "delivery_date",
      width: 90,
      render: (v: string | null, r: ProductionRecord) => {
        if (!v) return <Text type="secondary">—</Text>
        const isOverdue = dayjs(v).isBefore(dayjs(), "day")
          && !["completed", "shipped", "cancelled"].includes(r.production_status)
        return <Text style={{ color: isOverdue ? "#ff4d4f" : undefined, fontWeight: isOverdue ? 600 : undefined }}>{v}</Text>
      },
    },
    {
      title: "生产状态",
      dataIndex: "production_status",
      width: 100,
      render: (v: string) => (
        <Tag color={PRODUCTION_STATUS_COLOR[v] ?? "default"}>{PRODUCTION_STATUS_LABEL[v] ?? v}</Tag>
      ),
    },
    {
      title: "延期风险",
      dataIndex: "delay_risk_level",
      width: 70,
      render: (v: string | null) => v && v !== "none"
        ? <Tag color={DELAY_RISK_COLOR[v] ?? "default"}>{DELAY_RISK_LABEL[v] ?? v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "面料",
      dataIndex: "fabric_status",
      width: 55,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">—</Text>
        const colors: Record<string, string> = { received: "green", issue: "red", in_progress: "processing", ordered: "blue" }
        const labels: Record<string, string> = { not_started: "未开始", ordered: "已下单", in_progress: "进行中", received: "已到厂", issue: "有问题" }
        return <Tag color={colors[v] ?? "default"} style={{ fontSize: 11 }}>{labels[v] ?? v}</Tag>
      },
    },
    {
      title: "辅料",
      dataIndex: "accessory_status",
      width: 55,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">—</Text>
        const colors: Record<string, string> = { received: "green", issue: "red", in_progress: "processing", ordered: "blue" }
        const labels: Record<string, string> = { not_started: "未开始", ordered: "已下单", in_progress: "进行中", received: "已到厂", issue: "有问题" }
        return <Tag color={colors[v] ?? "default"} style={{ fontSize: 11 }}>{labels[v] ?? v}</Tag>
      },
    },
    {
      title: "跟单员",
      dataIndex: "merchandiser",
      width: 70,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "负责业务员",
      dataIndex: "responsible_sales",
      width: 80,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "操作",
      key: "action",
      fixed: "right" as const,
      width: isAdmin ? 90 : 65,
      render: (_: unknown, r: ProductionRecord) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Button size="small" type="link" icon={<EyeOutlined />}
            onClick={() => navigate(`/productions/${r.id}`)}>详情</Button>
          {isAdmin && (
            <Popconfirm
              title="确定删除该生产跟单？"
              onConfirm={() => deleteMutation.mutate(r.id)}
              okText="确认" cancelText="取消" okType="danger"
            >
              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>生产跟单</Typography.Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
              新增跟单
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small"><Statistic title="跟单总数" value={stats.total} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="生产中" value={stats.in_production} valueStyle={{ color: "#1677ff" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="逾期" value={stats.overdue}
                valueStyle={{ color: stats.overdue > 0 ? "#ff4d4f" : undefined }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="高风险" value={stats.high_risk}
                valueStyle={{ color: stats.high_risk > 0 ? "#fa8c16" : undefined }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已出货" value={stats.shipped} valueStyle={{ color: "#52c41a" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已完成" value={stats.completed} valueStyle={{ color: "#52c41a" }} />
            </Card>
          </Col>
        </Row>
      )}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="跟单编号" value={filterNo}
              onChange={e => { setFilterNo(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="询单号" value={filterInqNo}
              onChange={e => { setFilterInqNo(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="客户" value={filterCustomer}
              onChange={e => { setFilterCustomer(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="工厂" value={filterFactory}
              onChange={e => { setFilterFactory(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="品名/大类" value={filterCat}
              onChange={e => { setFilterCat(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }}
              options={[{ label: "全部状态", value: "" }, ...PRODUCTION_STATUS_OPTIONS]}
              style={{ width: "100%" }} placeholder="生产状态" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterRisk} onChange={v => { setFilterRisk(v); setPage(1) }}
              options={[{ label: "全部风险", value: "" }, ...DELAY_RISK_OPTIONS]}
              style={{ width: "100%" }} placeholder="延期风险" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="负责业务员" value={filterSales}
              onChange={e => { setFilterSales(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="小组" value={filterGroup}
              onChange={e => { setFilterGroup(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="跟单员" value={filterMerchan}
              onChange={e => { setFilterMerchan(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <DatePicker.RangePicker size="small" style={{ width: "100%" }}
              onChange={v => {
                setFilterDates(v ? [v[0]!.format("YYYY-MM-DD"), v[1]!.format("YYYY-MM-DD")] : null)
                setPage(1)
              }} />
          </Col>
          <Col xs={12} sm={6} md={3} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Switch size="small" checked={overdueOnly} onChange={v => { setOverdueOnly(v); setPage(1) }} />
            <span style={{ fontSize: 12 }}>仅显示逾期</span>
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>重置</Button>
          </Col>
        </Row>
      </Card>

      <Table<ProductionRecord>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1400, y: "calc(100vh - 420px)" }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: t => `共 ${t} 条生产跟单`,
        }}
      />

      <Modal
        title="新增生产跟单"
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        width={620}
      >
        <Form
          form={createForm}
          layout="vertical"
          size="small"
          onFinish={values => {
            const clean: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(values)) {
              if (v !== undefined && v !== null && v !== "") {
                clean[k] = dayjs.isDayjs(v) ? v.format("YYYY-MM-DD") : v
              }
            }
            createMutation.mutate(clean)
          }}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="factory_name" label="工厂名称">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customer_short_name" label="客户简称">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="product_name" label="品名">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="group_name" label="小组">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="order_quantity" label="订单数量">
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="order_date" label="下单日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="delivery_date" label="预计交期" rules={[{ required: true, message: "请填写交期" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="responsible_sales" label="负责业务员">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="merchandiser" label="跟单员">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <style>{`a { cursor: pointer; } .ant-table-cell { font-size: 12px; }`}</style>
    </div>
  )
}
