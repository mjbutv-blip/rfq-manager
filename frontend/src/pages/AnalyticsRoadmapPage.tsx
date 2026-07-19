import { Card, Descriptions, Space, Table, Tag, Typography, Button } from "antd"
import type { ColumnsType } from "antd/es/table"

const { Title, Text, Paragraph } = Typography

type Priority = "P0 / 第一阶段" | "P1 / 第二阶段" | "P1" | "P1 / P2" | "P2 / 第三阶段"
type Status = "已完成" | "部分已完成" | "可立即开发" | "需要补字段" | "需要后续数据" | "暂不做"

interface RoadmapItem {
  dimension: string
  excelSource: string
  value: string
  status: Status
  priority: Priority
  dependencies: string[]
  missingFields?: string[]
  reuse?: string
  note?: string
}

interface RoadmapSection {
  title: string
  positioning: string
  priority: Priority
  reason: string
  items: RoadmapItem[]
}

const statusColor: Record<Status, string> = {
  已完成: "green",
  部分已完成: "blue",
  可立即开发: "cyan",
  需要补字段: "orange",
  需要后续数据: "gold",
  暂不做: "default",
}

const priorityColor: Record<Priority, string> = {
  "P0 / 第一阶段": "red",
  "P1 / 第二阶段": "purple",
  P1: "purple",
  "P1 / P2": "geekblue",
  "P2 / 第三阶段": "default",
}

const sections: RoadmapSection[] = [
  {
    title: "一、客户与订单转化分析（最核心）",
    positioning: "评估客户质量、报价效率、报价策略和未成交原因。",
    priority: "P0 / 第一阶段",
    reason: "系统已有询单、报价状态、订单状态、报价轮次、下单信息，最容易先做出结果。",
    items: [
      {
        dimension: "询单转化率",
        excelSource: "询单总表：订单状态（报价 / 打样 / 下单）、下单时间",
        value: "计算收到资料到下单的整体转化率，评估客户质量和业务开发效率。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["inquiries.order_status", "inquiries.quote_status", "inquiries.order_date", "inquiries.inquiry_date"],
      },
      {
        dimension: "报价次数与下单关系",
        excelSource: "询单总表：第 1-4 次报价记录 + 最终是否下单",
        value: "分析报几次价最容易成交，哪些客户需要反复议价，优化报价策略。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["quote_items.quote_round", "quote_items.quote_type", "quote_items.quote_date", "inquiries.order_status"],
      },
      {
        dimension: "报价周期时长",
        excelSource: "询单总表：每次报价的收到资料到给客人报价间隔天数",
        value: "统计平均报价响应时间，找出工厂报价慢或内部核价慢等瓶颈。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["inquiries.inquiry_date", "quote_items.material_received_date", "quote_items.factory_arranged_date", "quote_items.client_quoted_date"],
      },
      {
        dimension: "客户目标价达成率",
        excelSource: "总表：目标价 vs 给客人报的价格 + 比例",
        value: "分析哪些客户目标价压得低、哪些容易达成，指导客户分级和利润策略。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["quote_items.customer_target_price_usd", "quote_items.final_quote_usd", "quote_items.quote_vs_target_ratio"],
      },
      {
        dimension: "未下单原因统计",
        excelSource: "询单总表：未下单时间 / 原因列",
        value: "归类未下单原因，针对价格、客户没拿到单、交期等问题改进。",
        status: "需要补字段",
        priority: "P0 / 第一阶段",
        dependencies: ["inquiries.order_status", "字段缺失：inquiries.not_ordered_reason", "字段缺失：inquiries.not_ordered_date"],
        missingFields: ["未下单原因", "未下单时间"],
      },
    ],
  },
  {
    title: "二、工厂供应链管理分析（降本关键）",
    positioning: "找出价格有优势、响应快、被选中率高的工厂，帮助降本和优化工厂选择。",
    priority: "P0 / 第一阶段",
    reason: "已有 factory_quote_records、quote_round、quote_type、factory_price、selected_factory，可与工厂报价录入和订单组分析联动。",
    items: [
      {
        dimension: "工厂价格竞争力排名",
        excelSource: "总表：10+ 家工厂报价",
        value: "统计每家工厂的报价排名，建立工厂价格梯队数据库。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["factory_quote_records.factory_name", "factory_quote_records.factory_price", "factory_quote_records.quote_round", "factory_quote_records.quote_type"],
      },
      {
        dimension: "工厂价格离散度",
        excelSource: "总表：第二低 / 最低比率、第三低 / 最低比率",
        value: "分析同一款不同工厂报价差多少，判断降本空间和价格透明度。",
        status: "部分已完成",
        priority: "P0 / 第一阶段",
        dependencies: ["factory_quote_records.factory_price", "factory_quote_records.currency", "factory_quote_records.price_unit"],
        reuse: "单个订单来龙去脉表、订单组分析已做最低/最高/价差百分比。",
      },
      {
        dimension: "工厂中标率",
        excelSource: "总表：选用工厂名字 + 所有参与报价工厂",
        value: "统计报价次数和最终被选中次数，找出合作稳定且性价比高的工厂。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["factory_quote_records.factory_name", "quote_items.selected_factory", "quote_items.quote_round", "quote_items.quote_type"],
      },
      {
        dimension: "国内 vs 海外工厂价差",
        excelSource: "询单总表：安排国内工厂报价日期 vs 海外工厂报价日期 + 价格",
        value: "对比中国工厂和海外工厂价格差、交期差，优化产能分配。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["factory_quote_records.quote_type", "factory_quote_records.factory_price", "factory_quote_records.currency", "factory_quote_records.price_unit"],
      },
      {
        dimension: "工厂降价幅度",
        excelSource: "总表：工厂比上一次报价差值和比率",
        value: "分析哪些工厂好谈价、每轮能压多少，建立议价策略库。",
        status: "可立即开发",
        priority: "P0 / 第一阶段",
        dependencies: ["factory_quote_records.factory_name", "factory_quote_records.factory_price", "factory_quote_records.quote_round"],
      },
      {
        dimension: "工厂响应速度",
        excelSource: "询单总表：安排报价日期 vs 收到工厂报价时间",
        value: "统计每家工厂报价时效，识别响应慢的供应商。",
        status: "需要补字段",
        priority: "P0 / 第一阶段",
        dependencies: ["quote_items.factory_arranged_date", "factory_quote_records.created_at", "字段缺失：factory_quote_records.received_at"],
        missingFields: ["收到工厂报价时间"],
      },
    ],
  },
  {
    title: "三、利润与成本结构分析（赚钱逻辑）",
    positioning: "看清楚利润来自哪里，哪些成本在侵蚀利润，汇率和订单量如何影响赚钱能力。",
    priority: "P1 / 第二阶段",
    reason: "部分字段已存在，但测试费、杂费、分批走货、运费等字段仍需补齐。",
    items: [
      {
        dimension: "单品毛利率",
        excelSource: "总表：选用工厂价格 vs 给客人报的价格 + 汇率 + 毛利润额",
        value: "计算每个款的毛利率，找出高利润款和亏损款。",
        status: "可立即开发",
        priority: "P1 / 第二阶段",
        dependencies: ["quote_items.selected_factory_price_cny", "quote_items.final_quote_usd", "quote_items.exchange_rate", "quote_items.gross_profit_cny", "quote_items.gross_profit_pct"],
      },
      {
        dimension: "利润构成拆解",
        excelSource: "总表：港杂费 / 测试费 / 杂费 / 运费 / 净利润值 / 佣金",
        value: "分析各项费用占比，看哪块成本侵蚀利润最多。",
        status: "需要补字段",
        priority: "P1 / 第二阶段",
        dependencies: ["quote_items.port_misc_fee_cny", "字段缺失：quote_items.test_fee_cny", "字段缺失：quote_items.misc_fee_cny", "字段缺失：quote_items.freight_fee_cny", "quote_items.commission_pct", "quote_items.gross_profit_cny"],
        missingFields: ["测试费", "杂费", "运费"],
      },
      {
        dimension: "汇率波动影响",
        excelSource: "总表：报价汇率 vs 当下汇率 + 毛利润额",
        value: "测算汇率变化对利润的影响，做汇率风险预警。",
        status: "可立即开发",
        priority: "P1 / 第二阶段",
        dependencies: ["quote_items.exchange_rate", "quote_items.current_exchange_rate", "quote_items.final_quote_usd", "quote_items.gross_profit_cny"],
      },
      {
        dimension: "规模效应分析",
        excelSource: "总表：订单数量 vs 单价",
        value: "分析订单量越大工厂单价能降多少，找出最优报价量级。",
        status: "可立即开发",
        priority: "P1 / 第二阶段",
        dependencies: ["quote_items.order_quantity", "quote_items.calc_quantity", "factory_quote_records.factory_price", "quote_items.final_quote_usd"],
      },
    ],
  },
  {
    title: "四、产品与品类分析（选品方向）",
    positioning: "判断哪些品类更容易成交，哪些工艺和面料影响成本，客户偏好什么尺码和款式。",
    priority: "P1 / P2",
    reason: "部分内容已和报价资料分析、工艺分析、尺码分析重合，应复用已有页面；成本类分析依赖更完整报价单结构化数据。",
    items: [
      {
        dimension: "品类下单率",
        excelSource: "询单总表：品名 + 订单状态",
        value: "统计不同品类询单量和下单转化率，判断哪些品类好做。",
        status: "部分已完成",
        priority: "P1 / P2",
        dependencies: ["inquiries.product_name", "inquiries.product_category", "inquiries.order_status"],
        reuse: "报价资料分析、客户品类款式分析已有部分基础。",
      },
      {
        dimension: "工艺复杂度与价格关系",
        excelSource: "报价单：做工说明 + 总表价格",
        value: "分析满印、定位印、开模等工艺对成本的影响幅度。",
        status: "需要后续数据",
        priority: "P1 / P2",
        dependencies: ["inquiry_item_processes.process_tag", "factory_quote_records.factory_price", "字段缺失：结构化工艺复杂度"],
        reuse: "产品工艺分析已有工艺标签基础。",
        missingFields: ["结构化工艺复杂度", "工艺成本拆分"],
      },
      {
        dimension: "面料成本占比",
        excelSource: "报价单：面料品质 + 总表价格",
        value: "建立面料和价格对应关系，快速估算新品成本。",
        status: "需要后续数据",
        priority: "P1 / P2",
        dependencies: ["字段缺失：fabric_quality", "字段缺失：fabric_cost_cny", "factory_quote_records.factory_price"],
        missingFields: ["面料品质结构化字段", "面料成本"],
      },
      {
        dimension: "印花成本测算",
        excelSource: "报价单：印花颜色数 / 定位 / 朝向要求 + 总表价格",
        value: "统计每增加一个印花颜色成本涨多少，定位印花比普通印花贵多少。",
        status: "需要后续数据",
        priority: "P1 / P2",
        dependencies: ["字段缺失：print_color_count", "字段缺失：print_position_type", "factory_quote_records.factory_price"],
        missingFields: ["印花颜色数", "印花定位类型"],
      },
      {
        dimension: "辅料成本占比",
        excelSource: "报价单：辅料 sheet 的各辅料单价 + 数量",
        value: "计算辅料成本占 FOB 价比例，找出可优化的辅料采购项。",
        status: "需要后续数据",
        priority: "P1 / P2",
        dependencies: ["字段缺失：accessory_items", "字段缺失：accessory_cost_cny", "quote_items.final_quote_usd"],
        missingFields: ["辅料明细", "辅料成本"],
      },
      {
        dimension: "尺码数量与成本关系",
        excelSource: "总表：尺码范围 / 码数 + 单价",
        value: "分析码数越多是否单价越高，优化报价模板。",
        status: "部分已完成",
        priority: "P1 / P2",
        dependencies: ["inquiry_item_sizes.size_code", "factory_quote_records.factory_price", "quote_items.final_quote_usd"],
        reuse: "尺码范围分析已有尺码标签基础。",
      },
      {
        dimension: "尺码分布分析",
        excelSource: "总表：尺码范围 / 码数",
        value: "分析尺码集中区间、小众特殊尺码占比。",
        status: "部分已完成",
        priority: "P1 / P2",
        dependencies: ["inquiry_item_sizes.size_code", "inquiry_item_sizes.is_special_size"],
        reuse: "尺码范围分析已覆盖部分内容。",
      },
      {
        dimension: "客户尺码偏好",
        excelSource: "总表：尺码范围 / 码数",
        value: "分析不同客户尺码需求差异，匹配客户目标客群身材特征。",
        status: "部分已完成",
        priority: "P1 / P2",
        dependencies: ["inquiries.customer_code", "inquiries.customer_short_name", "inquiry_item_sizes.size_code"],
        reuse: "尺码范围分析可扩展到客户维度。",
      },
      {
        dimension: "品类布局分析",
        excelSource: "报价单：翻单情况 / 做工说明",
        value: "分析同品类款式集中度、款式迭代、重复款或相似款。",
        status: "需要后续数据",
        priority: "P1 / P2",
        dependencies: ["inquiries.product_category", "inquiries.product_name", "inquiry_items.style_no", "字段缺失：repeat_order_flag"],
        missingFields: ["翻单标记", "相似款识别字段"],
      },
      {
        dimension: "订单规模汇总",
        excelSource: "报价单或总表：订单数量",
        value: "统计全年订单总数量、单订单平均数量、最大最小订单量、各品类订单量。",
        status: "可立即开发",
        priority: "P1 / 第二阶段",
        dependencies: ["inquiries.quantity", "quote_items.order_quantity", "inquiries.product_category", "inquiries.order_status"],
      },
      {
        dimension: "订单量分布分析",
        excelSource: "报价单或总表：订单数量",
        value: "按订单量区间分析订单数和金额占比，识别核心批量区间。",
        status: "可立即开发",
        priority: "P1 / 第二阶段",
        dependencies: ["inquiries.quantity", "quote_items.order_quantity", "quote_items.trade_amount_usd", "inquiries.trade_amount"],
      },
    ],
  },
  {
    title: "五、运营效率与流程管理（内部提效）",
    positioning: "找出报价、打样、合同、转单流程中的慢点和问题点。",
    priority: "P2 / 第三阶段",
    reason: "合同回签周期暂时不用；其余可后续结合报价日期、打样记录、转单记录实现。",
    items: [
      {
        dimension: "报价全流程时效",
        excelSource: "询单总表：收到资料→安排国内报价→安排海外报价→给客人报价",
        value: "拆解每个环节耗时，找出最慢环节。",
        status: "可立即开发",
        priority: "P2 / 第三阶段",
        dependencies: ["quote_items.material_received_date", "quote_items.factory_arranged_date", "quote_items.client_quoted_date", "quote_items.quote_type"],
      },
      {
        dimension: "打样次数统计",
        excelSource: "询单总表：打样次数列",
        value: "分析平均打几次样能下单，打样次数多的款是否更容易成单。",
        status: "需要补字段",
        priority: "P2 / 第三阶段",
        dependencies: ["sample_records.inquiry_id", "sample_records.sample_status", "字段缺失：sample_count_on_inquiry"],
        missingFields: ["询单打样次数汇总口径"],
      },
      {
        dimension: "样板管理效率",
        excelSource: "询单总表：原样地点、客供布色 / 品质样参考情况",
        value: "统计样板流转周期，减少样板丢失和等待时间。",
        status: "需要后续数据",
        priority: "P2 / 第三阶段",
        dependencies: ["sample_records.created_at", "sample_records.status", "字段缺失：sample_location", "字段缺失：sample_received_at"],
        missingFields: ["样板地点", "样板流转时间"],
      },
      {
        dimension: "合同回签周期",
        excelSource: "询单总表：客人合同收到日期 vs 核对 / 回签日期",
        value: "统计合同处理时长，优化内部审批流程。",
        status: "暂不做",
        priority: "P2 / 第三阶段",
        dependencies: ["字段缺失：contract_received_at", "字段缺失：contract_signed_at"],
        missingFields: ["合同收到日期", "合同回签日期"],
        note: "Excel 备注为暂时不用。",
      },
      {
        dimension: "转单问题追踪",
        excelSource: "询单总表：转单时间、转单后疑问、落实时间",
        value: "统计转单问题数量和解决时长，减少转单损耗。",
        status: "部分已完成",
        priority: "P2 / 第三阶段",
        dependencies: ["transfer_orders.created_at", "transfer_orders.question", "transfer_orders.resolved_at"],
        reuse: "系统已有转单记录，可扩展问题闭环字段。",
      },
    ],
  },
  {
    title: "六、公司整体经营分析（管理层视角）",
    positioning: "给管理层看整体业务趋势、客户贡献和团队效率。",
    priority: "P1",
    reason: "询单量趋势、成交额趋势、客户贡献度比较容易做；人效分析需要明确跟进人字段和权限展示口径。",
    items: [
      {
        dimension: "月度 / 季度询单量趋势",
        excelSource: "询单总表：收到资料日期（按月统计）",
        value: "看询单量趋势，判断淡旺季和业务增长情况。",
        status: "部分已完成",
        priority: "P1",
        dependencies: ["inquiries.inquiry_date", "inquiries.inquiry_year", "inquiries.inquiry_month"],
        reuse: "数据总览已有基础趋势，可做管理层版本。",
      },
      {
        dimension: "月度 / 季度成交额趋势",
        excelSource: "总表：贸易额（美金）+ 下单时间",
        value: "统计成交金额趋势，做营收预测和业绩复盘。",
        status: "可立即开发",
        priority: "P1",
        dependencies: ["inquiries.trade_amount", "quote_items.trade_amount_usd", "inquiries.order_date", "inquiries.order_status"],
      },
      {
        dimension: "客户贡献度排名",
        excelSource: "总表：按客户汇总贸易额和利润",
        value: "找出 TOP 贡献客户，做客户分层维护。",
        status: "部分已完成",
        priority: "P1",
        dependencies: ["inquiries.customer_code", "inquiries.customer_short_name", "inquiries.trade_amount", "quote_items.gross_profit_cny"],
        reuse: "客户档案已有客户汇总基础。",
      },
      {
        dimension: "人均产能 / 人效",
        excelSource: "询单总表：如果增加跟进人列",
        value: "统计业务员跟进询单数、成单数、利润额。第一版只做管理视角，不做人事绩效排名。",
        status: "需要后续数据",
        priority: "P2 / 第三阶段",
        dependencies: ["inquiries.responsible_sales", "inquiries.assisting_sales", "inquiries.order_status", "quote_items.gross_profit_cny", "字段待确认：跟进人口径"],
        missingFields: ["跟进人口径", "权限展示口径"],
      },
    ],
  },
]

const phasePlan = [
  {
    title: "第一阶段：立刻做，价值高，字段基本已有",
    items: ["客户与订单转化分析", "工厂供应链管理分析", "公司整体趋势基础版"],
    color: "#fff1f0",
  },
  {
    title: "第二阶段：字段补齐后做",
    items: ["利润与成本结构分析", "产品与品类分析进阶版", "订单规模和订单量分布"],
    color: "#f9f0ff",
  },
  {
    title: "第三阶段：流程数据稳定后做",
    items: ["运营效率与流程管理", "合同回签周期", "人效分析"],
    color: "#f5f5f5",
  },
]

function dependencyTags(item: RoadmapItem) {
  return (
    <Space size={4} wrap>
      {item.dependencies.map(dep => (
        <Tag key={dep} color={dep.startsWith("字段缺失") || dep.startsWith("字段待确认") ? "orange" : "blue"}>
          {dep}
        </Tag>
      ))}
    </Space>
  )
}

export default function AnalyticsRoadmapPage() {
  const columns: ColumnsType<RoadmapItem> = [
    { title: "分析维度", dataIndex: "dimension", width: 170, fixed: "left" },
    { title: "状态", dataIndex: "status", width: 120, render: (s: Status) => <Tag color={statusColor[s]}>{s}</Tag> },
    { title: "优先级", dataIndex: "priority", width: 130, render: (p: Priority) => <Tag color={priorityColor[p]}>{p}</Tag> },
    { title: "数据来源", dataIndex: "excelSource", width: 260 },
    { title: "依赖字段", width: 360, render: (_, r) => dependencyTags(r) },
    { title: "业务价值", dataIndex: "value", width: 360 },
    { title: "复用 / 备注", width: 260, render: (_, r) => r.reuse || r.note || (r.missingFields?.length ? `字段缺失：${r.missingFields.join("、")}` : "—") },
    {
      title: "预留操作",
      width: 230,
      fixed: "right",
      render: () => (
        <Space>
          <Button size="small" disabled>查看详情</Button>
          <Button size="small" disabled>开始开发</Button>
          <Button size="small" disabled>查看依赖字段</Button>
        </Space>
      ),
    },
  ]

  const immediate = sections.flatMap(s => s.items).filter(i => i.status === "可立即开发")
  const missing = sections.flatMap(s => s.items).filter(i => i.status === "需要补字段" || i.status === "需要后续数据")
  const paused = sections.flatMap(s => s.items).filter(i => i.status === "暂不做")

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>数据分析中心规划</Title>
      <Paragraph type="secondary">
        来源文件：豆包数据分析7-14更新.xls / Sheet1。此页面只做分析模块整理、优先级规划、数据来源映射和开发阶段拆分，不导入业务数据、不创建询单或报价记录。
      </Paragraph>

      <Card title="建议开发顺序" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
          {phasePlan.map(phase => (
            <div key={phase.title} style={{ background: phase.color, border: "1px solid #d9d9d9", padding: 12, borderRadius: 6 }}>
              <Text strong>{phase.title}</Text>
              <ul style={{ marginBottom: 0, paddingLeft: 18 }}>
                {phase.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="规划概览" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={4}>
          <Descriptions.Item label="分析大类">{sections.length}</Descriptions.Item>
          <Descriptions.Item label="分析维度">{sections.reduce((sum, s) => sum + s.items.length, 0)}</Descriptions.Item>
          <Descriptions.Item label="可立即开发">{immediate.length}</Descriptions.Item>
          <Descriptions.Item label="需补字段/后续数据">{missing.length}</Descriptions.Item>
          <Descriptions.Item label="暂不做">{paused.map(i => i.dimension).join("、") || "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      {sections.map(section => (
        <Card key={section.title} title={section.title} style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="板块定位">{section.positioning}</Descriptions.Item>
            <Descriptions.Item label="建议优先级"><Tag color={priorityColor[section.priority]}>{section.priority}</Tag></Descriptions.Item>
            <Descriptions.Item label="优先级原因">{section.reason}</Descriptions.Item>
          </Descriptions>
          <Table
            rowKey="dimension"
            size="small"
            columns={columns}
            dataSource={section.items}
            scroll={{ x: 1800 }}
            pagination={false}
          />
        </Card>
      ))}
    </div>
  )
}
