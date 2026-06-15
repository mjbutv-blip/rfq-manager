import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import dayjs from "dayjs"
import {
  Badge, Breadcrumb, Button, Card, Col, DatePicker, Divider, Drawer,
  Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space,
  Statistic, Table, Tag, Tooltip, Typography, message,
} from "antd"
import type { ColumnsType, TablePaginationConfig } from "antd/es/table"
import type { SorterResult } from "antd/es/table/interface"
import {
  DeleteOutlined, DownloadOutlined, EditOutlined, HomeOutlined,
  ReloadOutlined, SearchOutlined, ShopOutlined, TeamOutlined, UserOutlined,
} from "@ant-design/icons"

import { deleteInquiry, exportInquiries, fetchInquiries, updateInquiry } from "@/api/inquiries"
import type { InquiryFilter, InquiryItem } from "@/types/inquiry"
import { ORDER_STATUS_COLOR, ORDER_STATUS_OPTIONS, QUOTE_STATUS_OPTIONS } from "@/types/inquiry"
import AnalyticsPanel from "@/components/AnalyticsPanel"
import { useCurrentUser } from "@/contexts/UserContext"

// ── 产品大类自动识别（与后端 category_detect.py 保持一致） ────────────────────

const TYPE_RULES: [string, string[]][] = [
  ["泳衣", ["泳衣","泳装","泳裤","泳帽","泳圈","bikini","比基尼","swimwear","swimsuit","swim"]],
  ["内衣", ["内衣","文胸","胸罩","内裤","睡衣","家居服","吊带","塑身","打底","bra","underwear","lingerie","brief","panty","nightwear","sleepwear","homewear"]],
]
const CHILD_KEYWORDS = ["童","儿童","幼儿","幼童","婴","kids","children","child","girls","boys","girl","boy","baby","toddler","infant"]

function detectCategory(productName: string | null): string | null {
  if (!productName) return null
  const lower = productName.toLowerCase()
  let categoryType: string | null = null
  for (const [type, kws] of TYPE_RULES) {
    if (kws.some(kw => lower.includes(kw.toLowerCase()))) { categoryType = type; break }
  }
  if (!categoryType) return null
  const isChild = CHILD_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))
  return isChild ? `童装${categoryType}` : categoryType
}

const { Text, Title } = Typography
const { TextArea } = Input

// ── 视图类型 ──────────────────────────────────────────────────────────────────

type ViewMode = "company" | "group" | "sales" | "customer"

function useViewContext() {
  const { groupName, salesName, customerCode } = useParams<{
    groupName?: string
    salesName?: string
    customerCode?: string
  }>()

  const mode: ViewMode = customerCode
    ? "customer"
    : salesName
    ? "sales"
    : groupName
    ? "group"
    : "company"

  const fixedFilter: Partial<InquiryFilter> = useMemo(() => {
    const f: Partial<InquiryFilter> = {}
    if (groupName)    f.group_name       = decodeURIComponent(groupName)
    if (salesName)    f.responsible_sales = decodeURIComponent(salesName)
    if (customerCode) f.customer_code    = decodeURIComponent(customerCode)
    return f
  }, [groupName, salesName, customerCode])

  return { mode, fixedFilter, groupName, salesName, customerCode }
}

// ── 面包屑 ────────────────────────────────────────────────────────────────────

function ViewBreadcrumb({ mode, groupName, salesName, customerCode }: {
  mode: ViewMode
  groupName?: string
  salesName?: string
  customerCode?: string
}) {
  const navigate = useNavigate()

  const items = [
    {
      title: (
        <span style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
          <HomeOutlined /> 全公司
        </span>
      ),
    },
  ]

  if (groupName) {
    const gn = decodeURIComponent(groupName)
    items.push({
      title: (
        <span
          style={{ cursor: mode === "group" ? "default" : "pointer" }}
          onClick={() => mode !== "group" && navigate(`/group/${encodeURIComponent(gn)}`)}
        >
          <TeamOutlined /> {gn}
        </span>
      ),
    })
  }

  if (salesName) {
    const sn = decodeURIComponent(salesName)
    items.push({ title: <span><UserOutlined /> {sn}</span> })
  }

  if (customerCode) {
    const cc = decodeURIComponent(customerCode)
    items.push({ title: <span><ShopOutlined /> 客户：{cc}</span> })
  }

  return <Breadcrumb style={{ marginBottom: 12 }} items={items} />
}

// ── 视图标题 & 统计卡片 ───────────────────────────────────────────────────────

const VIEW_TITLE: Record<ViewMode, string> = {
  company:  "全公司询单总表",
  group:    "小组询单视图",
  sales:    "个人询单视图",
  customer: "客户询单视图",
}

function StatsBar({ items, total, mode }: { items: InquiryItem[]; total: number; mode: ViewMode }) {
  const ordered    = items.filter(r => r.order_status === "下单")
  const totalTrade = ordered.reduce((s, r) => s + (r.trade_amount ?? 0), 0)
  const gpItems    = items.filter(r => r.gross_profit_rate != null)
  const avgGp      = gpItems.length > 0
    ? gpItems.reduce((s, r) => s + (r.gross_profit_rate ?? 0), 0) / gpItems.length
    : null
  const convertRate = total > 0 ? ((ordered.length / items.length) * 100) : 0

  return (
    <Row gutter={16} style={{ marginBottom: 12 }}>
      <Col span={mode === "customer" ? 6 : 6}>
        <Statistic title="询单总数" value={total} suffix="条" />
      </Col>
      <Col span={6}>
        <Statistic title="本页已下单" value={ordered.length} suffix="条" />
      </Col>
      <Col span={6}>
        <Statistic
          title={mode === "customer" ? "客户总贸易额" : "本页贸易额"}
          value={totalTrade} prefix="$" precision={0}
        />
      </Col>
      <Col span={6}>
        {mode === "sales" || mode === "group" ? (
          <Statistic title="平均毛利率" value={avgGp ?? 0} suffix="%" precision={1} />
        ) : (
          <Statistic title="本页转化率" value={convertRate} suffix="%" precision={1} />
        )}
      </Col>
    </Row>
  )
}

// ── 格式化工具 ────────────────────────────────────────────────────────────────

function fmt(v: number | null, prefix = "", suffix = "", dec = 2) {
  if (v == null) return "—"
  return `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}${suffix}`
}

// ── 编辑抽屉 ──────────────────────────────────────────────────────────────────

interface EditDrawerProps {
  record: InquiryItem | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function EditDrawer({ record, open, onClose, onSaved }: EditDrawerProps) {
  const [form] = Form.useForm()
  const [msgApi, ctx] = message.useMessage()

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      updateInquiry(record!.id, values),
    onSuccess: () => {
      msgApi.success("保存成功")
      onSaved()
      onClose()
    },
    onError: (e: Error) => {
      msgApi.error(`保存失败：${e.message}`)
    },
  })

  useEffect(() => {
    if (open && record) {
      form.setFieldsValue({
        ...record,
        inquiry_date: record.inquiry_date ? dayjs(record.inquiry_date) : null,
        order_date:   record.order_date   ? dayjs(record.order_date)   : null,
      })
    }
  }, [open, record, form])

  function handleSave() {
    form.validateFields().then(values => {
      const payload: Record<string, unknown> = { ...values }
      // 日期转字符串
      if (values.inquiry_date) payload.inquiry_date = values.inquiry_date.format("YYYY-MM-DD")
      else payload.inquiry_date = null
      if (values.order_date) payload.order_date = values.order_date.format("YYYY-MM-DD")
      else payload.order_date = null
      // 空字符串→null
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null
      }
      mutation.mutate(payload)
    })
  }

  const colProps = { xs: 24, sm: 12 }

  return (
    <Drawer
      title={`编辑询单：${record?.inquiry_no ?? ""}`}
      open={open}
      onClose={onClose}
      width={720}
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={mutation.isPending} onClick={handleSave}>
            保存
          </Button>
        </Space>
      }
      destroyOnClose
    >
      {ctx}
      <Form form={form} layout="vertical" size="small">

        <Divider orientation="left" plain>客户信息</Divider>
        <Row gutter={12}>
          <Col {...colProps}>
            <Form.Item name="customer_short_name" label="客户简称">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="customer_code" label="客户代码">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="customer_name" label="客户全称">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="customer_order_no" label="客户订单号">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="country" label="国家">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="region" label="地区">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="customer_category" label="客户类别">
              <Input allowClear />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>归属信息</Divider>
        <Row gutter={12}>
          <Col {...colProps}>
            <Form.Item name="group_name" label="所属小组">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="responsible_sales" label="负责业务员">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="assisting_sales" label="协助业务员">
              <Input allowClear />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>产品信息</Divider>
        <Row gutter={12}>
          <Col {...colProps}>
            <Form.Item name="product_name" label="品名">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item label="产品大类" style={{ marginBottom: 0 }}>
              <Space.Compact style={{ width: "100%" }}>
                <Form.Item name="product_category" noStyle>
                  <Input allowClear placeholder="手动填写或点击自动识别" />
                </Form.Item>
                <Button
                  onClick={() => {
                    const name = form.getFieldValue("product_name") as string | null
                    const detected = detectCategory(name)
                    if (detected) {
                      form.setFieldValue("product_category", detected)
                      msgApi.success(`已识别：${detected}`)
                    } else {
                      msgApi.warning("品名中未识别到已知品类关键词")
                    }
                  }}
                >
                  自动识别
                </Button>
              </Space.Compact>
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="series_name" label="系列名">
              <Input allowClear />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="season" label="季节">
              <Input allowClear placeholder="如 SS2026" />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="quantity" label="数量">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="inquiry_date" label="询单日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>报价与订单</Divider>
        <Row gutter={12}>
          <Col {...colProps}>
            <Form.Item name="quote_status" label="报价情况">
              <Select allowClear options={QUOTE_STATUS_OPTIONS.filter(o => o.value)} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="order_status" label="订单状态">
              <Select allowClear options={ORDER_STATUS_OPTIONS.filter(o => o.value)} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="final_quote" label="最终报价 ($)">
              <InputNumber style={{ width: "100%" }} min={0} precision={4} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="factory_price" label="工厂价 (¥)">
              <InputNumber style={{ width: "100%" }} min={0} precision={4} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="gross_profit_rate" label="毛利率 (%)">
              <InputNumber style={{ width: "100%" }} min={-100} max={100} precision={2} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="order_unit_price" label="下单单价 ($)">
              <InputNumber style={{ width: "100%" }} min={0} precision={4} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="order_quantity" label="下单数量">
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="trade_amount" label="贸易额 ($)">
              <InputNumber style={{ width: "100%" }} min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col {...colProps}>
            <Form.Item name="order_date" label="下单日期">
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left" plain>备注</Divider>
        <Form.Item name="remark">
          <TextArea rows={3} allowClear />
        </Form.Item>

      </Form>
    </Drawer>
  )
}

// ── 表格列（带下钻点击 + 编辑按钮） ──────────────────────────────────────────

function useColumns(
  mode: ViewMode,
  canEdit: boolean,
  canDelete: boolean,
  groupName?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
  onEdit?: (record: InquiryItem) => void,
  onDelete?: (record: InquiryItem) => void,
): ColumnsType<InquiryItem> {
  const navigate = useNavigate()

  const antOrder = (field: string) =>
    sortBy === field ? (sortOrder === "asc" ? "ascend" : "descend") : undefined

  return useMemo((): ColumnsType<InquiryItem> => {
    const cols: ColumnsType<InquiryItem> = [
      {
        title: "询单号",
        dataIndex: "inquiry_no",
        fixed: "left",
        width: 110,
        render: (v: string, record) => (
          <a
            style={{ fontWeight: 600, fontSize: 12 }}
            onClick={() => navigate(`/inquiry/${record.id}`)}
          >
            {v}
          </a>
        ),
      },
      {
        title: "客户简称",
        dataIndex: "customer_short_name",
        width: 90,
        render: (v: string | null, record) => {
          const code = record.customer_code
          if (!v || !code) return <Text type="secondary">—</Text>
          if (mode === "customer") return <Text>{v}</Text>
          return (
            <Tooltip title={`查看 ${code} 全部询单`}>
              <a onClick={() => navigate(`/customer/${encodeURIComponent(code)}`)}>{v}</a>
            </Tooltip>
          )
        },
      },
      {
        title: "国家",
        dataIndex: "country",
        width: 70,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "小组",
        dataIndex: "group_name",
        width: 70,
        render: (v: string | null) => {
          if (!v) return "—"
          if (mode === "group" || mode === "sales") return <Tag>{v}</Tag>
          return (
            <Tooltip title={`查看 ${v} 全部询单`}>
              <a onClick={() => navigate(`/group/${encodeURIComponent(v)}`)}>{v}</a>
            </Tooltip>
          )
        },
      },
      {
        title: "负责业务员",
        dataIndex: "responsible_sales",
        width: 90,
        render: (v: string | null, record) => {
          if (!v) return "—"
          if (mode === "sales") return <Text>{v}</Text>
          const gn = record.group_name
          const path = gn
            ? `/group/${encodeURIComponent(gn)}/sales/${encodeURIComponent(v)}`
            : `/group/_/sales/${encodeURIComponent(v)}`
          return (
            <Tooltip title={`查看 ${v} 的询单`}>
              <a onClick={() => navigate(path)}>{v}</a>
            </Tooltip>
          )
        },
      },
      {
        title: "协助",
        dataIndex: "assisting_sales",
        width: 70,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "产品大类",
        dataIndex: "product_category",
        width: 80,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "品名",
        dataIndex: "product_name",
        width: 150,
        ellipsis: { showTitle: false },
        render: (v: string | null) => v
          ? <Tooltip title={v}><span>{v}</span></Tooltip>
          : "—",
      },
      {
        title: "系列",
        dataIndex: "series_name",
        width: 140,
        ellipsis: true,
        render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : "—",
      },
      {
        title: "季节",
        dataIndex: "season",
        width: 85,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "数量",
        dataIndex: "quantity",
        width: 75,
        align: "right",
        render: (v: number | null) => v != null ? v.toLocaleString() : "—",
      },
      {
        title: "询单日期",
        dataIndex: "inquiry_date",
        width: 95,
        sorter: true,
        sortOrder: antOrder("inquiry_date"),
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "报价情况",
        dataIndex: "quote_status",
        width: 85,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "订单状态",
        dataIndex: "order_status",
        width: 100,
        render: (v: string | null) => {
          if (!v) return "—"
          const color = ORDER_STATUS_COLOR[v] ?? "default"
          return <Badge status={color as any} text={v} />
        },
      },
      {
        title: "最终报价",
        dataIndex: "final_quote",
        width: 95,
        align: "right",
        render: (v: number | null) => fmt(v, "$"),
      },
      {
        title: "工厂价",
        dataIndex: "factory_price",
        width: 85,
        align: "right",
        render: (v: number | null) => fmt(v, "¥"),
      },
      {
        title: "毛利率",
        dataIndex: "gross_profit_rate",
        width: 75,
        align: "right",
        render: (v: number | null) => {
          if (v == null) return "—"
          const color = v >= 20 ? "#52c41a" : v >= 15 ? "#faad14" : "#ff4d4f"
          return <Text style={{ color, fontSize: 12 }}>{fmt(v, "", "%", 1)}</Text>
        },
      },
      {
        title: "下单单价",
        dataIndex: "order_unit_price",
        width: 95,
        align: "right",
        render: (v: number | null) => fmt(v, "$"),
      },
      {
        title: "下单数量",
        dataIndex: "order_quantity",
        width: 80,
        align: "right",
        render: (v: number | null) => v != null ? v.toLocaleString() : "—",
      },
      {
        title: "贸易额",
        dataIndex: "trade_amount",
        width: 105,
        align: "right",
        sorter: true,
        sortOrder: antOrder("trade_amount"),
        render: (v: number | null) => fmt(v, "$", "", 0),
      },
      {
        title: "下单日期",
        dataIndex: "order_date",
        width: 95,
        render: (v: string | null) => v ?? "—",
      },
      {
        title: "备注",
        dataIndex: "remark",
        width: 150,
        ellipsis: { showTitle: false },
        render: (v: string | null) => v
          ? <Tooltip title={v}><span>{v}</span></Tooltip>
          : "—",
      },
    ]

    if (canEdit || canDelete) {
      cols.push({
        title: "操作",
        key: "action",
        fixed: "right",
        width: canDelete ? 80 : 60,
        render: (_: unknown, record: InquiryItem) => (
          <Space size={0}>
            {canEdit && onEdit && (
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
              </Tooltip>
            )}
            {canDelete && onDelete && (
              <Popconfirm
                title="确认删除该询单？"
                description={`询单号：${record.inquiry_no}`}
                okText="删除"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => onDelete(record)}
              >
                <Tooltip title="删除">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        ),
      })
    }

    return cols
  }, [mode, canEdit, canDelete, groupName, navigate, sortBy, sortOrder, onEdit, onDelete])
}

// ── 筛选表单 ──────────────────────────────────────────────────────────────────

interface FilterFormProps {
  fixedFilter: Partial<InquiryFilter>
  currentFilter: InquiryFilter
  onSearch: (v: Partial<InquiryFilter>) => void
  onReset: () => void
  loading: boolean
}

function FilterForm({ fixedFilter, currentFilter, onSearch, onReset, loading }: FilterFormProps) {
  const [form] = Form.useForm()
  const [exporting, setExporting] = useState(false)
  const [msgApi, ctx] = message.useMessage()

  const locked = (field: keyof InquiryFilter) => field in fixedFilter

  async function handleExport() {
    setExporting(true)
    try {
      await exportInquiries(currentFilter)
    } catch (e) {
      msgApi.error(`导出失败：${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      {ctx}
      {Object.keys(fixedFilter).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {fixedFilter.group_name        && <Tag color="blue">小组：{fixedFilter.group_name}</Tag>}
          {fixedFilter.responsible_sales && <Tag color="purple">业务员：{fixedFilter.responsible_sales}</Tag>}
          {fixedFilter.customer_code     && <Tag color="orange">客户：{fixedFilter.customer_code}</Tag>}
        </div>
      )}
      <Form form={form} layout="inline" onFinish={() => onSearch(form.getFieldsValue())}>
        <Row gutter={[8, 8]} style={{ width: "100%" }}>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="inquiry_no" style={{ marginBottom: 0 }}>
              <Input placeholder="询单号（模糊）" allowClear />
            </Form.Item>
          </Col>
          {!locked("customer_code") && (
            <Col xs={12} sm={8} md={6} lg={4}>
              <Form.Item name="customer_short_name" style={{ marginBottom: 0 }}>
                <Input placeholder="客户简称" allowClear />
              </Form.Item>
            </Col>
          )}
          {!locked("group_name") && (
            <Col xs={12} sm={8} md={6} lg={4}>
              <Form.Item name="group_name" style={{ marginBottom: 0 }}>
                <Input placeholder="所属小组" allowClear />
              </Form.Item>
            </Col>
          )}
          {!locked("responsible_sales") && (
            <Col xs={12} sm={8} md={6} lg={4}>
              <Form.Item name="responsible_sales" style={{ marginBottom: 0 }}>
                <Input placeholder="负责业务员" allowClear />
              </Form.Item>
            </Col>
          )}
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="product_category" style={{ marginBottom: 0 }}>
              <Input placeholder="产品大类" allowClear />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="product_name" style={{ marginBottom: 0 }}>
              <Input placeholder="品名（模糊）" allowClear />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="series_name" style={{ marginBottom: 0 }}>
              <Input placeholder="系列名" allowClear />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="season" style={{ marginBottom: 0 }}>
              <Input placeholder="季节，如 SS2026" allowClear />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="quote_status" style={{ marginBottom: 0 }}>
              <Select placeholder="报价情况" allowClear
                options={QUOTE_STATUS_OPTIONS.filter(o => o.value)} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="order_status" style={{ marginBottom: 0 }}>
              <Select placeholder="订单状态" allowClear
                options={ORDER_STATUS_OPTIONS.filter(o => o.value)} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Form.Item name="year" style={{ marginBottom: 0 }}>
              <Select placeholder="年份" allowClear
                options={[2026, 2025, 2024].map(y => ({ label: String(y), value: y }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={10}>
            <Space wrap>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit" loading={loading}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); onReset() }}>重置</Button>
              <Button
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={handleExport}
              >
                导出 Excel
              </Button>
            </Space>
          </Col>
        </Row>
      </Form>
    </Card>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE = { page: 1, page_size: 50 }

export default function InquiryTablePage() {
  const { mode, fixedFilter, groupName, salesName, customerCode } = useViewContext()
  const [userFilter, setUserFilter] = useState<Partial<InquiryFilter>>({})
  const [editingRecord, setEditingRecord] = useState<InquiryItem | null>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [deleting, setDeleting] = useState(false)
  const [msgApi, msgCtx] = message.useMessage()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()

  const canEdit   = currentUser.role !== "viewer"
  const canDelete = currentUser.role === "admin"

  const filter: InquiryFilter = useMemo(
    () => ({ ...DEFAULT_PAGE, ...fixedFilter, ...userFilter }),
    [fixedFilter, userFilter],
  )

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ["inquiries", filter],
    queryFn: () => fetchInquiries(filter),
    placeholderData: prev => prev,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["inquiries"] })
  }, [queryClient])

  const handleEdit   = useCallback((record: InquiryItem) => setEditingRecord(record), [])
  const handleSaved  = refresh

  // 单条删除
  const handleDeleteOne = useCallback(async (record: InquiryItem) => {
    try {
      await deleteInquiry(record.id)
      msgApi.success(`已删除：${record.inquiry_no}`)
      setSelectedRowKeys(prev => prev.filter(k => k !== record.id))
      refresh()
    } catch (e) {
      msgApi.error(`删除失败：${(e as Error).message}`)
    }
  }, [msgApi, refresh])

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    const count = selectedRowKeys.length
    Modal.confirm({
      title: `确认删除 ${count} 条询单？`,
      content: "删除后不可恢复，请确认。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        setDeleting(true)
        try {
          await Promise.all(selectedRowKeys.map(id => deleteInquiry(String(id))))
          msgApi.success(`已删除 ${count} 条询单`)
          setSelectedRowKeys([])
          refresh()
        } catch (e) {
          msgApi.error(`部分删除失败：${(e as Error).message}`)
          refresh()
        } finally {
          setDeleting(false)
        }
      },
    })
  }, [selectedRowKeys, msgApi, refresh])

  const columns = useColumns(
    mode, canEdit, canDelete, groupName,
    filter.sort_by, filter.sort_order,
    handleEdit, handleDeleteOne,
  )

  const handleSearch = useCallback((values: Partial<InquiryFilter>) => {
    setUserFilter({ ...values, page: 1 })
  }, [])

  const handleReset = useCallback(() => {
    setUserFilter({})
  }, [fixedFilter])

  const handleTableChange = useCallback((
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<InquiryItem> | SorterResult<InquiryItem>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    setUserFilter(prev => ({
      ...prev,
      page: pagination.current ?? 1,
      page_size: pagination.pageSize ?? 50,
      sort_by:    s?.order ? String(s.field ?? "") : undefined,
      sort_order: s?.order === "ascend" ? "asc" : s?.order === "descend" ? "desc" : undefined,
    }))
  }, [])

  const modeKey = JSON.stringify(fixedFilter)
  useEffect(() => { setUserFilter({}); setSelectedRowKeys([]) }, [modeKey])

  const scrollX = canEdit || canDelete ? 2280 : 2200

  return (
    <div style={{ padding: 16 }}>
      {msgCtx}
      <ViewBreadcrumb
        mode={mode}
        groupName={groupName}
        salesName={salesName}
        customerCode={customerCode}
      />

      <Title level={4} style={{ marginBottom: 12 }}>
        {VIEW_TITLE[mode]}
        {mode !== "company" && (
          <Text type="secondary" style={{ fontSize: 14, fontWeight: 400, marginLeft: 12 }}>
            {mode === "group"    && groupName && decodeURIComponent(groupName)}
            {mode === "sales"    && salesName && decodeURIComponent(salesName)}
            {mode === "customer" && customerCode && `客户代码：${decodeURIComponent(customerCode)}`}
          </Text>
        )}
      </Title>

      {data && <StatsBar items={data.items} total={data.total} mode={mode} />}
      {data && <AnalyticsPanel items={data.items} total={data.total} mode={mode} />}

      <FilterForm
        fixedFilter={fixedFilter}
        currentFilter={filter}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={isFetching}
      />

      {/* 批量删除工具栏（仅 admin 且有勾选时显示） */}
      {canDelete && selectedRowKeys.length > 0 && (
        <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <Text>已选 <strong>{selectedRowKeys.length}</strong> 条</Text>
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={deleting}
            onClick={handleBatchDelete}
          >
            删除所选
          </Button>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>取消选择</Button>
        </div>
      )}

      {isError && (
        <Card style={{ marginBottom: 8, borderColor: "#ff4d4f" }}>
          <Text type="danger">加载失败：{(error as Error).message}</Text>
        </Card>
      )}

      <Table<InquiryItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        scroll={{ x: scrollX, y: "calc(100vh - 380px)" }}
        size="small"
        bordered
        rowSelection={canDelete ? {
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          preserveSelectedRowKeys: true,
        } : undefined}
        pagination={{
          current: (filter.page ?? 1),
          pageSize: (filter.page_size ?? 50),
          total: data?.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          showTotal: (total, range) => `第 ${range[0]}–${range[1]} 条，共 ${total} 条`,
        }}
        onChange={handleTableChange}
        rowClassName={record => record.order_status === "下单" ? "row-ordered" : ""}
      />

      <EditDrawer
        record={editingRecord}
        open={editingRecord !== null}
        onClose={() => setEditingRecord(null)}
        onSaved={handleSaved}
      />

      <style>{`
        .row-ordered td { background-color: #f6ffed !important; }
        .ant-table-cell { font-size: 12px; }
        a { cursor: pointer; }
      `}</style>
    </div>
  )
}
