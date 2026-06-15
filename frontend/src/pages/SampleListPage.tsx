import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Button, Card, Col, DatePicker, Form, Input, InputNumber,
  message, Modal, Popconfirm, Row, Select, Statistic, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons"
import dayjs from "dayjs"

import { createSample, deleteSample, fetchSamples, fetchSampleStats } from "@/api/samples"
import type { SampleRecord } from "@/types/sample"
import {
  FINAL_RESULT_COLOR, FINAL_RESULT_LABEL, FINAL_RESULT_OPTIONS,
  FEE_PAID_BY_OPTIONS,
  FEE_PAYMENT_STATUS_OPTIONS,
  SAMPLE_STATUS_COLOR, SAMPLE_STATUS_LABEL, SAMPLE_STATUS_OPTIONS,
  SAMPLE_TYPE_LABEL, SAMPLE_TYPE_OPTIONS,
} from "@/types/sample"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography
const { RangePicker } = DatePicker

export default function SampleListPage() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const qc = useQueryClient()
  const canEdit = user.role !== "viewer"
  const isAdmin = user.role === "admin"

  const [filterSampleNo,    setFilterSampleNo]    = useState("")
  const [filterInquiryNo,   setFilterInquiryNo]   = useState("")
  const [filterCustomer,    setFilterCustomer]    = useState("")
  const [filterFactory,     setFilterFactory]     = useState("")
  const [filterCat,         setFilterCat]         = useState("")
  const [filterProduct,     setFilterProduct]     = useState("")
  const [filterType,        setFilterType]        = useState("")
  const [filterStatus,      setFilterStatus]      = useState("")
  const [filterResult,      setFilterResult]      = useState("")
  const [filterSales,       setFilterSales]       = useState("")
  const [filterGroup,       setFilterGroup]       = useState("")
  const [filterDates,       setFilterDates]       = useState<[string, string] | null>(null)
  const [page,              setPage]              = useState(1)
  const [showCreate,        setShowCreate]        = useState(false)
  const [createForm]                              = Form.useForm()

  const params = {
    sample_no:           filterSampleNo  || undefined,
    inquiry_no:          filterInquiryNo || undefined,
    customer_short_name: filterCustomer  || undefined,
    factory_name:        filterFactory   || undefined,
    product_category:    filterCat       || undefined,
    product_name:        filterProduct   || undefined,
    sample_type:         filterType      || undefined,
    sample_status:       filterStatus    || undefined,
    final_result:        filterResult    || undefined,
    responsible_sales:   filterSales     || undefined,
    group_name:          filterGroup     || undefined,
    start_date:          filterDates?.[0] || undefined,
    end_date:            filterDates?.[1] || undefined,
    page,
    page_size: 50,
    sort_by: "created_at",
    sort_order: "desc",
  }

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["samples", params],
    queryFn: () => fetchSamples(params),
    placeholderData: prev => prev,
  })

  const { data: stats } = useQuery({
    queryKey: ["sample-stats"],
    queryFn: fetchSampleStats,
    refetchInterval: 120_000,
  })

  const createMutation = useMutation({
    mutationFn: createSample,
    onSuccess: (s) => {
      message.success("打样记录已创建")
      qc.invalidateQueries({ queryKey: ["samples"] })
      qc.invalidateQueries({ queryKey: ["sample-stats"] })
      setShowCreate(false)
      createForm.resetFields()
      navigate(`/samples/${s.id}`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "创建失败")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSample,
    onSuccess: () => {
      message.success("已删除")
      qc.invalidateQueries({ queryKey: ["samples"] })
      qc.invalidateQueries({ queryKey: ["sample-stats"] })
    },
  })

  const handleReset = () => {
    setFilterSampleNo(""); setFilterInquiryNo(""); setFilterCustomer("")
    setFilterFactory(""); setFilterCat(""); setFilterProduct("")
    setFilterType(""); setFilterStatus(""); setFilterResult("")
    setFilterSales(""); setFilterGroup(""); setFilterDates(null); setPage(1)
  }

  const columns: ColumnsType<SampleRecord> = [
    {
      title: "打样编号",
      dataIndex: "sample_no",
      width: 90,
      render: (v: string, r: SampleRecord) => (
        <a onClick={() => navigate(`/samples/${r.id}`)}>{v}</a>
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
      title: "系列",
      dataIndex: "series_name",
      width: 90,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "打样类型",
      dataIndex: "sample_type",
      width: 70,
      render: (v: string | null) => v ? <Tag>{SAMPLE_TYPE_LABEL[v] ?? v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "数量",
      dataIndex: "sample_quantity",
      width: 55,
      align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "打样状态",
      dataIndex: "sample_status",
      width: 90,
      render: (v: string) => (
        <Tag color={SAMPLE_STATUS_COLOR[v] ?? "default"}>{SAMPLE_STATUS_LABEL[v] ?? v}</Tag>
      ),
    },
    {
      title: "工厂交期",
      dataIndex: "factory_due_date",
      width: 90,
      render: (v: string | null, r: SampleRecord) => {
        if (!v) return <Text type="secondary">—</Text>
        const isOverdue = dayjs(v).isBefore(dayjs(), "day")
          && !["approved", "rejected", "cancelled", "sent", "received"].includes(r.sample_status)
        return <Text style={{ color: isOverdue ? "#ff4d4f" : undefined }}>{v}</Text>
      },
    },
    {
      title: "寄样日期",
      dataIndex: "sample_sent_at",
      width: 90,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "快递单号",
      dataIndex: "tracking_no",
      width: 110,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "修改次数",
      dataIndex: "revision_count",
      width: 65,
      align: "right" as const,
    },
    {
      title: "最终结果",
      dataIndex: "final_result",
      width: 80,
      render: (v: string) => v && v !== "pending"
        ? <Tag color={FINAL_RESULT_COLOR[v] ?? "default"}>{FINAL_RESULT_LABEL[v] ?? v}</Tag>
        : <Text type="secondary">待定</Text>,
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
      width: isAdmin ? 120 : 85,
      render: (_: unknown, r: SampleRecord) => (
        <div style={{ display: "flex", gap: 4 }}>
          <Button size="small" type="link" icon={<EyeOutlined />}
            onClick={() => navigate(`/samples/${r.id}`)}>详情</Button>
          {canEdit && (
            <Button size="small" type="link" icon={<EditOutlined />}
              onClick={() => navigate(`/samples/${r.id}`)}>编辑</Button>
          )}
          {isAdmin && (
            <Popconfirm
              title="确定删除该打样记录？"
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
        <Typography.Title level={4} style={{ margin: 0 }}>打样管理</Typography.Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
              新增打样
            </Button>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small"><Statistic title="打样总数" value={stats.total} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="制作中" value={stats.making} valueStyle={{ color: "#1677ff" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已寄出" value={stats.sent} valueStyle={{ color: "#13c2c2" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="已确认" value={stats.approved} valueStyle={{ color: "#52c41a" }} />
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
              <Statistic title="公司垫付费" value={stats.company_fee_total}
                prefix="¥" precision={2} valueStyle={{ fontSize: 16 }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="打样编号" value={filterSampleNo}
              onChange={e => { setFilterSampleNo(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="询单号" value={filterInquiryNo}
              onChange={e => { setFilterInquiryNo(e.target.value); setPage(1) }} allowClear />
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
            <Input placeholder="产品大类" value={filterCat}
              onChange={e => { setFilterCat(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="品名" value={filterProduct}
              onChange={e => { setFilterProduct(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterType} onChange={v => { setFilterType(v); setPage(1) }}
              options={[{ label: "全部类型", value: "" }, ...SAMPLE_TYPE_OPTIONS]}
              style={{ width: "100%" }} placeholder="打样类型" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }}
              options={[{ label: "全部状态", value: "" }, ...SAMPLE_STATUS_OPTIONS]}
              style={{ width: "100%" }} placeholder="打样状态" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterResult} onChange={v => { setFilterResult(v); setPage(1) }}
              options={[{ label: "全部结果", value: "" }, ...FINAL_RESULT_OPTIONS]}
              style={{ width: "100%" }} placeholder="最终结果" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="负责业务员" value={filterSales}
              onChange={e => { setFilterSales(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="小组" value={filterGroup}
              onChange={e => { setFilterGroup(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <RangePicker size="small" style={{ width: "100%" }}
              onChange={v => {
                setFilterDates(v ? [v[0]!.format("YYYY-MM-DD"), v[1]!.format("YYYY-MM-DD")] : null)
                setPage(1)
              }} />
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>重置</Button>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Table<SampleRecord>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1600, y: "calc(100vh - 400px)" }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: t => `共 ${t} 条打样记录`,
        }}
      />

      {/* 新增弹窗 */}
      <Modal
        title="新增打样记录"
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields() }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        width={640}
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
              <Form.Item name="product_category" label="产品大类">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="product_name" label="品名">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="series_name" label="系列">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="responsible_sales" label="负责业务员">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sample_type" label="打样类型" rules={[{ required: true, message: "请选择打样类型" }]}>
                <Select options={SAMPLE_TYPE_OPTIONS} placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sample_quantity" label="打样数量">
                <InputNumber style={{ width: "100%" }} min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="group_name" label="小组">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="assigned_to_factory_at" label="分配工厂日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="factory_due_date" label="工厂预计交期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fee_paid_by" label="费用承担方">
                <Select options={FEE_PAID_BY_OPTIONS} allowClear placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sample_fee" label="打样费用">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fee_payment_status" label="付款状态">
                <Select options={FEE_PAYMENT_STATUS_OPTIONS} allowClear placeholder="请选择" />
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
