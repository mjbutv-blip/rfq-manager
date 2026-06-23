import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { Badge, ConfigProvider, Layout, Menu } from "antd"
import zhCN from "antd/locale/zh_CN"
import {
  BarChartOutlined,
  BellOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  ContactsOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  OrderedListOutlined,
  ShopOutlined,
  TeamOutlined,
  UploadOutlined,
} from "@ant-design/icons"
import { useQuery } from "@tanstack/react-query"

import { UserProvider, useAuth, useCurrentUser } from "@/contexts/UserContext"
import UserSwitcher from "@/components/UserSwitcher"
import { fetchWarningSummary } from "@/api/warnings"

import DashboardPage       from "@/pages/DashboardPage"
import InquiryTablePage    from "@/pages/InquiryTable"
import InquiryDetailPage   from "@/pages/InquiryDetail"
import InquiryImportPage   from "@/pages/InquiryImportPage"
import AnalyticsPage       from "@/pages/AnalyticsPage"
import QuoteDataQualityPage from "@/pages/QuoteDataQualityPage"
import CustomerCategoryStylesPage from "@/pages/CustomerCategoryStylesPage"
import ProcessAnalysisPage from "@/pages/ProcessAnalysisPage"
import SizeAnalysisPage from "@/pages/SizeAnalysisPage"
import QuantityAnalysisPage from "@/pages/QuantityAnalysisPage"
import PreparerAnalysisPage from "@/pages/PreparerAnalysisPage"
import QuoteAnalysisOverviewPage from "@/pages/QuoteAnalysisOverviewPage"
import DataCompletionTasksPage from "@/pages/DataCompletionTasksPage"
import WarningPage         from "@/pages/WarningPage"
import OperationLogPage    from "@/pages/OperationLogPage"
import CustomerListPage    from "@/pages/CustomerListPage"
import CustomerDetailPage  from "@/pages/CustomerDetailPage"
import FactoryListPage     from "@/pages/FactoryListPage"
import FactoryDetailPage   from "@/pages/FactoryDetailPage"
import SampleListPage      from "@/pages/SampleListPage"
import SampleDetailPage    from "@/pages/SampleDetailPage"
import ProductionListPage  from "@/pages/ProductionListPage"
import ProductionDetailPage from "@/pages/ProductionDetailPage"
import LoginPage           from "@/pages/LoginPage"
import RegisterPage        from "@/pages/RegisterPage"
import UserManagePage      from "@/pages/UserManagePage"
import BackupPage          from "@/pages/BackupPage"

const { Header, Content } = Layout

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth()
  const { pathname } = useLocation()
  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: pathname }} replace />
  }
  return <>{children}</>
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useCurrentUser()

  const canImport      = user.role === "admin" || user.role === "group_leader"
  const canViewWarnings = user.role !== "viewer"
  const canViewLogs    = user.role !== "viewer"
  const isAdmin        = user.role === "admin"

  const { data: warningSummary } = useQuery({
    queryKey: ["warning-summary"],
    queryFn: fetchWarningSummary,
    enabled: canViewWarnings,
    refetchInterval: 60_000,
    retry: false,
  })
  const highCount = warningSummary?.high ?? 0

  const selectedKey = pathname.startsWith("/import")
    ? "import"
    : pathname.startsWith("/quote-data-quality")
    ? "quote-data-quality"
    : pathname.startsWith("/customer-category-styles")
    ? "customer-category-styles"
    : pathname.startsWith("/process-analysis")
    ? "process-analysis"
    : pathname.startsWith("/size-analysis")
    ? "size-analysis"
    : pathname.startsWith("/quantity-analysis")
    ? "quantity-analysis"
    : pathname.startsWith("/quote-preparer-analysis")
    ? "quote-preparer-analysis"
    : pathname.startsWith("/quote-analysis-overview")
    ? "quote-analysis-overview"
    : pathname.startsWith("/analytics")
    ? "analytics"
    : pathname.startsWith("/warnings")
    ? "warnings"
    : pathname.startsWith("/data-completion-tasks")
    ? "data-completion-tasks"
    : pathname.startsWith("/operation-logs")
    ? "operation-logs"
    : pathname.startsWith("/customers")
    ? "customers"
    : pathname.startsWith("/factories")
    ? "factories"
    : pathname.startsWith("/samples")
    ? "samples"
    : pathname.startsWith("/productions")
    ? "productions"
    : pathname.startsWith("/user-manage")
    ? "user-manage"
    : pathname.startsWith("/backups")
    ? "backups"
    : pathname === "/dashboard"
    ? "dashboard"
    : "inquiries"

  type MenuItem = { key: string; icon: React.ReactNode; label: React.ReactNode; onClick: () => void }

  const menuItems: (MenuItem | null)[] = [
    { key: "dashboard", icon: <DashboardOutlined />, label: "数据总览", onClick: () => navigate("/dashboard") },
    { key: "inquiries", icon: <FileTextOutlined />, label: "询单总表", onClick: () => navigate("/") },
    canImport
      ? { key: "import", icon: <UploadOutlined />, label: "导入询单", onClick: () => navigate("/import") }
      : null,
    { key: "analytics", icon: <BarChartOutlined />, label: "数据分析", onClick: () => navigate("/analytics") },
    { key: "quote-analysis-overview", icon: <FileSearchOutlined />, label: "报价资料分析总览", onClick: () => navigate("/quote-analysis-overview") },
    { key: "quote-data-quality", icon: <FileSearchOutlined />, label: "报价资料完整度", onClick: () => navigate("/quote-data-quality") },
    { key: "customer-category-styles", icon: <BarChartOutlined />, label: "客户品类款式分析", onClick: () => navigate("/customer-category-styles") },
    { key: "process-analysis", icon: <BarChartOutlined />, label: "产品工艺分析", onClick: () => navigate("/process-analysis") },
    { key: "size-analysis", icon: <BarChartOutlined />, label: "尺码范围分析", onClick: () => navigate("/size-analysis") },
    { key: "quantity-analysis", icon: <BarChartOutlined />, label: "报价数量分析", onClick: () => navigate("/quantity-analysis") },
    { key: "quote-preparer-analysis", icon: <BarChartOutlined />, label: "报价填报人分析", onClick: () => navigate("/quote-preparer-analysis") },
    canViewWarnings
      ? {
          key: "warnings",
          icon: <BellOutlined />,
          label: (
            <Badge count={highCount} size="small" offset={[6, -2]}>
              预警中心
            </Badge>
          ),
          onClick: () => navigate("/warnings"),
        }
      : null,
    { key: "data-completion-tasks", icon: <CheckSquareOutlined />, label: "资料补录任务", onClick: () => navigate("/data-completion-tasks") },
    canViewLogs
      ? { key: "operation-logs", icon: <ClockCircleOutlined />, label: "操作日志", onClick: () => navigate("/operation-logs") }
      : null,
    { key: "customers", icon: <ContactsOutlined />, label: "客户档案", onClick: () => navigate("/customers") },
    { key: "factories", icon: <ShopOutlined />, label: "工厂档案", onClick: () => navigate("/factories") },
    { key: "samples", icon: <ExperimentOutlined />, label: "打样管理", onClick: () => navigate("/samples") },
    { key: "productions", icon: <OrderedListOutlined />, label: "生产跟单", onClick: () => navigate("/productions") },
    isAdmin
      ? { key: "user-manage", icon: <TeamOutlined />, label: "用户管理", onClick: () => navigate("/user-manage") }
      : null,
    isAdmin
      ? { key: "backups", icon: <CloudServerOutlined />, label: "数据备份", onClick: () => navigate("/backups") }
      : null,
  ]

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", padding: "0 24px", gap: 0 }}>
        <span
          style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginRight: 40, cursor: "pointer", flexShrink: 0 }}
          onClick={() => navigate("/dashboard")}
        >
          询单管理系统
        </span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, background: "transparent" }}
          items={menuItems.filter(Boolean) as MenuItem[]}
        />
        <div style={{ flexShrink: 0, marginLeft: 16 }}>
          <UserSwitcher />
        </div>
      </Header>
      <Content style={{ background: "#f5f5f5" }}>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />

          <Route path="/" element={<InquiryTablePage />} />
          <Route path="/group/:groupName" element={<InquiryTablePage />} />
          <Route path="/group/:groupName/sales/:salesName" element={<InquiryTablePage />} />
          <Route path="/customer/:customerCode" element={<InquiryTablePage />} />

          <Route path="/inquiry/:id" element={<InquiryDetailPage />} />

          <Route path="/import" element={<InquiryImportPage />} />

          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/quote-data-quality" element={<QuoteDataQualityPage />} />
          <Route path="/customer-category-styles" element={<CustomerCategoryStylesPage />} />
          <Route path="/process-analysis" element={<ProcessAnalysisPage />} />
          <Route path="/size-analysis" element={<SizeAnalysisPage />} />
          <Route path="/quantity-analysis" element={<QuantityAnalysisPage />} />
          <Route path="/quote-preparer-analysis" element={<PreparerAnalysisPage />} />
          <Route path="/quote-analysis-overview" element={<QuoteAnalysisOverviewPage />} />
          <Route path="/data-completion-tasks" element={<DataCompletionTasksPage />} />

          <Route path="/warnings" element={<WarningPage />} />

          <Route path="/operation-logs" element={<OperationLogPage />} />

          <Route path="/customers"               element={<CustomerListPage />} />
          <Route path="/customers/:customerCode" element={<CustomerDetailPage />} />

          <Route path="/factories"               element={<FactoryListPage />} />
          <Route path="/factories/:factoryId"    element={<FactoryDetailPage />} />

          <Route path="/samples"                 element={<SampleListPage />} />
          <Route path="/samples/:sampleId"       element={<SampleDetailPage />} />

          <Route path="/productions"             element={<ProductionListPage />} />
          <Route path="/productions/:productionId" element={<ProductionDetailPage />} />

          <Route path="/user-manage"             element={<UserManagePage />} />
          <Route path="/backups"                 element={<BackupPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Content>
    </Layout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <BrowserRouter>
          <UserProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="*" element={<RequireAuth><AppLayout /></RequireAuth>} />
            </Routes>
          </UserProvider>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
