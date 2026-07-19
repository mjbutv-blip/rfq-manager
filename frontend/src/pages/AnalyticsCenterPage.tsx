import { useNavigate } from "react-router-dom"
import { Button, Card, Col, Row, Space, Tag, Typography } from "antd"
import {
  AppstoreOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileSearchOutlined,
  ShopOutlined,
  TeamOutlined,
} from "@ant-design/icons"

const { Title, Text, Paragraph } = Typography

type ModuleStatus = "已上线" | "基础版" | "依赖补字段"

interface AnalyticsModule {
  title: string
  path: string
  problem: string
  status: ModuleStatus
  dataSources: string[]
  enhancements: string[]
  icon: React.ReactNode
}

interface AnalyticsSection {
  title: string
  description: string
  modules: AnalyticsModule[]
}

const statusColor: Record<ModuleStatus, string> = {
  已上线: "green",
  基础版: "blue",
  依赖补字段: "orange",
}

const sections: AnalyticsSection[] = [
  {
    title: "核心经营分析",
    description: "看公司整体表现、客户质量、成交和利润质量。",
    modules: [
      {
        title: "公司经营分析",
        path: "/company-management-analysis",
        problem: "看月度询单、报价、下单、成交额、客户贡献和团队基础产出。",
        status: "基础版",
        dataSources: ["inquiries"],
        enhancements: ["增加同比/环比", "增加季度视图", "明确人效统计口径"],
        icon: <BarChartOutlined />,
      },
      {
        title: "客户与订单转化分析",
        path: "/customer-conversion-analysis",
        problem: "评估客户质量、报价效率、报价轮次和目标价达成情况。",
        status: "基础版",
        dataSources: ["inquiries", "quote_items"],
        enhancements: ["接入未下单原因", "精确报价周期", "按客户分层"],
        icon: <TeamOutlined />,
      },
      {
        title: "利润成本分析",
        path: "/profit-cost-analysis",
        problem: "识别利润贡献、低毛利订单、毛利字段缺失和成本数据完整度。",
        status: "基础版",
        dataSources: ["inquiries", "quote_items"],
        enhancements: ["补测试费/杂费/分批走货", "拆解净利润", "汇率影响测算"],
        icon: <DollarOutlined />,
      },
    ],
  },
  {
    title: "报价与供应链分析",
    description: "看工厂报价竞争力、订单组统筹和报价资料质量。",
    modules: [
      {
        title: "工厂供应链分析",
        path: "/factory-supply-analysis",
        problem: "比较工厂报价次数、最低价次数、价格排名、币种单位风险。",
        status: "基础版",
        dataSources: ["factory_quote_records", "quote_items"],
        enhancements: ["工厂响应速度", "降价幅度", "中标率精确计算"],
        icon: <ShopOutlined />,
      },
      {
        title: "订单组分析",
        path: "/order-groups",
        problem: "按一组订单比较最低价方案、统一工厂方案和当前选用方案。",
        status: "基础版",
        dataSources: ["order_groups", "order_group_items", "quote_items", "factory_quote_records"],
        enhancements: ["导入预览人工确认", "自定义组合方案", "交期/质量风险字段"],
        icon: <AppstoreOutlined />,
      },
      {
        title: "报价分析总览",
        path: "/quote-analysis-overview",
        problem: "汇总报价资料完整度、补录优先级和报价资料分析入口。",
        status: "已上线",
        dataSources: ["inquiry_items", "inquiry_item_processes", "inquiry_item_sizes"],
        enhancements: ["和经营分析指标联动", "补录任务闭环", "按导入批次追踪"],
        icon: <FileSearchOutlined />,
      },
    ],
  },
  {
    title: "产品与流程分析",
    description: "看产品品类表现、流程慢点、资料补录和后续运营风险。",
    modules: [
      {
        title: "产品品类分析",
        path: "/product-category-analysis",
        problem: "按询单/订单口径分析品类表现、客户品类偏好和系列排名。",
        status: "基础版",
        dataSources: ["inquiries"],
        enhancements: ["接入工艺复杂度", "面辅料成本占比", "尺码偏好联动"],
        icon: <AppstoreOutlined />,
      },
      {
        title: "运营效率分析",
        path: "/operation-efficiency-analysis",
        problem: "识别待处理、超期跟进、状态缺失和流程周期异常。",
        status: "基础版",
        dataSources: ["inquiries"],
        enhancements: ["合同回签周期", "打样次数统计", "转单问题追踪"],
        icon: <ClockCircleOutlined />,
      },
      {
        title: "资料完整度",
        path: "/quote-data-quality",
        problem: "发现报价资料缺失字段，推动补录和后续结构化分析。",
        status: "已上线",
        dataSources: ["inquiry_items", "import_batches"],
        enhancements: ["按责任人闭环", "自动生成补录任务", "影响分析权重"],
        icon: <FileSearchOutlined />,
      },
    ],
  },
]

export default function AnalyticsCenterPage() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ marginBottom: 4 }}>数据分析中心</Title>
        <Text type="secondary">
          统一进入经营、客户、工厂、产品、利润和流程分析；复杂规划和字段依赖仍保留在分析规划页。
        </Text>
      </div>

      {sections.map(section => (
        <div key={section.title} style={{ marginBottom: 24 }}>
          <Space direction="vertical" size={2} style={{ marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>{section.title}</Title>
            <Text type="secondary">{section.description}</Text>
          </Space>

          <Row gutter={[16, 16]}>
            {section.modules.map(module => (
              <Col key={module.path} xs={24} md={12} xl={8}>
                <Card
                  size="small"
                  title={
                    <Space>
                      <span style={{ color: "#1677ff", fontSize: 16 }}>{module.icon}</span>
                      <span>{module.title}</span>
                    </Space>
                  }
                  extra={<Tag color={statusColor[module.status]}>{module.status}</Tag>}
                  style={{ height: "100%" }}
                  styles={{ body: { minHeight: 210, display: "flex", flexDirection: "column" } }}
                >
                  <Paragraph style={{ marginBottom: 12 }}>{module.problem}</Paragraph>

                  <Space size={4} wrap style={{ marginBottom: 12 }}>
                    {module.dataSources.map(source => (
                      <Tag key={source}>{source}</Tag>
                    ))}
                  </Space>

                  <div style={{ marginBottom: 14 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>后续增强：</Text>
                    <div style={{ marginTop: 4 }}>
                      <Space size={4} wrap>
                        {module.enhancements.map(item => (
                          <Tag key={item} color="default">{item}</Tag>
                        ))}
                      </Space>
                    </div>
                  </div>

                  <div style={{ marginTop: "auto" }}>
                    <Button type="primary" onClick={() => navigate(module.path)}>
                      进入分析
                    </Button>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      ))}

      <Card size="small">
        <Space wrap>
          <Text type="secondary">需要看完整规划、优先级和字段依赖：</Text>
          <Button onClick={() => navigate("/analytics-roadmap")}>查看分析规划</Button>
        </Space>
      </Card>
    </div>
  )
}
