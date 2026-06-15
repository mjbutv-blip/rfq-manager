import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  Button, Card, Col, Form, Input, InputNumber, message,
  Modal, Row, Select, Statistic, Table, Tag, Typography,
} from "antd"
import type { ColumnsType } from "antd/es/table"
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons"

import { createFactory, fetchFactories, fetchFactorySummary } from "@/api/factories"
import type { FactoryListItem } from "@/types/factory"
import {
  COOPERATION_STATUS_COLOR, COOPERATION_STATUS_LABEL, COOPERATION_STATUS_OPTIONS,
  PRICE_POSITION_LABEL, PRICE_POSITION_OPTIONS,
  RISK_LEVEL_COLOR, RISK_LEVEL_LABEL, RISK_LEVEL_OPTIONS,
} from "@/types/factory"
import { useCurrentUser } from "@/contexts/UserContext"

const { Text } = Typography

export default function FactoryListPage() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const qc = useQueryClient()
  const canEdit = user.role !== "viewer"

  const [filterName,    setFilterName]    = useState("")
  const [filterCountry, setFilterCountry] = useState("")
  const [filterCoop,    setFilterCoop]    = useState("")
  const [filterRisk,    setFilterRisk]    = useState("")
  const [filterPrice,   setFilterPrice]   = useState("")
  const [filterCat,     setFilterCat]     = useState("")
  const [filterCap,     setFilterCap]     = useState("")
  const [filterCert,    setFilterCert]    = useState("")
  const [page,          setPage]          = useState(1)
  const [showCreate,    setShowCreate]    = useState(false)
  const [createForm]                      = Form.useForm()

  const params = {
    factory_name:       filterName    || undefined,
    country:            filterCountry || undefined,
    cooperation_status: filterCoop    || undefined,
    risk_level:         filterRisk    || undefined,
    price_position:     filterPrice   || undefined,
    main_category:      filterCat     || undefined,
    capability_tag:     filterCap     || undefined,
    certificate_tag:    filterCert    || undefined,
    page,
    page_size: 50,
  }

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["factories", params],
    queryFn: () => fetchFactories(params),
    placeholderData: prev => prev,
  })

  const { data: summary } = useQuery({
    queryKey: ["factory-summary"],
    queryFn: fetchFactorySummary,
    refetchInterval: 120_000,
  })

  const createMutation = useMutation({
    mutationFn: createFactory,
    onSuccess: (factory) => {
      message.success("工厂已创建")
      qc.invalidateQueries({ queryKey: ["factories"] })
      qc.invalidateQueries({ queryKey: ["factory-summary"] })
      setShowCreate(false)
      createForm.resetFields()
      navigate(`/factories/${factory.id}`)
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      message.error(msg ?? "创建失败")
    },
  })

  const handleReset = () => {
    setFilterName(""); setFilterCountry(""); setFilterCoop("")
    setFilterRisk(""); setFilterPrice(""); setFilterCat("")
    setFilterCap(""); setFilterCert(""); setPage(1)
  }

  const columns: ColumnsType<FactoryListItem> = [
    {
      title: "工厂简称",
      key: "name",
      width: 120,
      render: (_: unknown, r: FactoryListItem) => (
        <a onClick={() => navigate(`/factories/${r.id}`)}>
          {r.factory_short_name || r.factory_name || r.factory_code}
        </a>
      ),
    },
    {
      title: "工厂名称",
      dataIndex: "factory_name",
      width: 160,
      ellipsis: true,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "国家",
      dataIndex: "country",
      width: 65,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "地区",
      dataIndex: "region",
      width: 65,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "擅长品类",
      dataIndex: "main_categories",
      width: 140,
      render: (v: string[]) => v?.length
        ? v.slice(0, 3).map(t => <Tag key={t} style={{ marginBottom: 2 }}>{t}</Tag>)
        : <Text type="secondary">—</Text>,
    },
    {
      title: "能力标签",
      dataIndex: "capability_tags",
      width: 140,
      render: (v: string[]) => v?.length
        ? v.slice(0, 3).map(t => <Tag key={t} color="blue" style={{ marginBottom: 2 }}>{t}</Tag>)
        : <Text type="secondary">—</Text>,
    },
    {
      title: "认证",
      dataIndex: "certificate_tags",
      width: 100,
      render: (v: string[]) => v?.length
        ? v.slice(0, 2).map(t => <Tag key={t} color="cyan" style={{ marginBottom: 2 }}>{t}</Tag>)
        : <Text type="secondary">—</Text>,
    },
    {
      title: "价格定位",
      dataIndex: "price_position",
      width: 70,
      render: (v: string | null) => v ? <Tag>{PRICE_POSITION_LABEL[v] ?? v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "MOQ",
      dataIndex: "moq",
      width: 60,
      align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "交期(天)",
      dataIndex: "normal_lead_time_days",
      width: 70,
      align: "right" as const,
      render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: "合作状态",
      dataIndex: "cooperation_status",
      width: 80,
      render: (v: string | null) => v
        ? <Tag color={COOPERATION_STATUS_COLOR[v] ?? "default"}>{COOPERATION_STATUS_LABEL[v] ?? v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "风险",
      dataIndex: "risk_level",
      width: 55,
      render: (v: string | null) => v
        ? <Tag color={RISK_LEVEL_COLOR[v] ?? "default"}>{RISK_LEVEL_LABEL[v] ?? v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "报价次数",
      dataIndex: "quote_count",
      width: 70,
      align: "right" as const,
    },
    {
      title: "下单次数",
      dataIndex: "ordered_count",
      width: 70,
      align: "right" as const,
    },
    {
      title: "转化率",
      dataIndex: "order_conversion_rate",
      width: 70,
      align: "right" as const,
      render: (v: number | null) => {
        if (v == null) return <Text type="secondary">—</Text>
        const color = v >= 50 ? "#52c41a" : v >= 25 ? "#faad14" : "#ff4d4f"
        return <Text style={{ color }}>{v.toFixed(1)}%</Text>
      },
    },
    {
      title: "操作",
      key: "action",
      fixed: "right" as const,
      width: 65,
      render: (_: unknown, r: FactoryListItem) => (
        <Button size="small" type="link" onClick={() => navigate(`/factories/${r.id}`)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>工厂档案</Typography.Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreate(true)}>
              新增工厂
            </Button>
          )}
        </div>
      </div>

      {/* 统计卡片 */}
      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="工厂总数" value={summary.total_factories} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="合作中" value={summary.active_factories} valueStyle={{ color: "#52c41a" }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="高风险" value={summary.high_risk_factories} valueStyle={{ color: "#ff4d4f" }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="有报价记录" value={summary.factories_with_quotes} /></Card>
          </Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={6} md={4}>
            <Input placeholder="工厂名称" value={filterName}
              onChange={e => { setFilterName(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="国家/地区" value={filterCountry}
              onChange={e => { setFilterCountry(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="擅长品类" value={filterCat}
              onChange={e => { setFilterCat(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="能力标签" value={filterCap}
              onChange={e => { setFilterCap(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Input placeholder="认证标签" value={filterCert}
              onChange={e => { setFilterCert(e.target.value); setPage(1) }} allowClear />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterPrice} onChange={v => { setFilterPrice(v); setPage(1) }}
              options={[{ label: "全部定位", value: "" }, ...PRICE_POSITION_OPTIONS]}
              style={{ width: "100%" }} placeholder="价格定位" />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select value={filterCoop} onChange={v => { setFilterCoop(v); setPage(1) }}
              options={[{ label: "全部状态", value: "" }, ...COOPERATION_STATUS_OPTIONS]}
              style={{ width: "100%" }} placeholder="合作状态" />
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Select value={filterRisk} onChange={v => { setFilterRisk(v); setPage(1) }}
              options={[{ label: "全部风险", value: "" }, ...RISK_LEVEL_OPTIONS]}
              style={{ width: "100%" }} placeholder="风险" />
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Button icon={<ReloadOutlined />} onClick={handleReset} style={{ width: "100%" }}>重置</Button>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Table<FactoryListItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        size="small"
        bordered
        scroll={{ x: 1500, y: "calc(100vh - 380px)" }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: p => setPage(p),
          showTotal: t => `共 ${t} 家工厂`,
        }}
      />

      {/* 新增工厂弹窗 */}
      <Modal
        title="新增工厂"
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
          onFinish={values => createMutation.mutate(values)}
        >
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="factory_name" label="工厂名称" rules={[{ required: true, message: "请输入工厂名称" }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="factory_short_name" label="工厂简称">
                <Input placeholder="不填则自动截取前20字" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="country" label="国家">
                <Input placeholder="如 中国" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="region" label="地区">
                <Input placeholder="如 广东" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cooperation_status" label="合作状态">
                <Select options={COOPERATION_STATUS_OPTIONS} allowClear placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="price_position" label="价格定位">
                <Select options={PRICE_POSITION_OPTIONS} allowClear placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="risk_level" label="风险等级">
                <Select options={RISK_LEVEL_OPTIONS} allowClear placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="moq" label="MOQ">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="normal_lead_time_days" label="常规交期(天)">
                <InputNumber style={{ width: "100%" }} min={0} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="contact_person" label="联系人">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_phone" label="联系电话">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contact_email" label="联系邮箱">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="main_categories" label="擅长品类">
                <Select mode="tags" placeholder="输入后按回车" options={[
                  { label: "泳装", value: "泳装" }, { label: "内衣", value: "内衣" },
                  { label: "内裤", value: "内裤" }, { label: "运动服", value: "运动服" },
                  { label: "睡衣", value: "睡衣" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="capability_tags" label="能力标签">
                <Select mode="tags" placeholder="输入后按回车" options={[
                  { label: "无缝", value: "无缝" }, { label: "有缝", value: "有缝" },
                  { label: "带杯文胸", value: "带杯文胸" }, { label: "环保面料", value: "环保面料" },
                  { label: "快速打样", value: "快速打样" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="certificate_tags" label="认证标签">
                <Select mode="tags" placeholder="输入后按回车" options={[
                  { label: "BSCI", value: "BSCI" }, { label: "SEDEX", value: "SEDEX" },
                  { label: "GRS", value: "GRS" }, { label: "OK100", value: "OK100" },
                ]} />
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
