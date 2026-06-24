/**
 * "创建补录任务" / "查看补录任务" 按钮。
 *
 * 用在各分析页面的 priority_items 表格里：没有未关闭任务时显示"创建补录
 * 任务"，点击后从该款式当前缺失的资料直接建任务；已有未关闭任务时显示
 * "查看补录任务"，点击跳转到任务列表页。不要求用户自己复制询单号或款式
 * 编号——itemId 由调用方直接传入。
 */

import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, message } from "antd"

import { createDataCompletionTaskForItem, fetchActiveTaskForItem } from "@/api/data_completion_tasks"
import { useCurrentUser } from "@/contexts/UserContext"

function apiErrorDetail(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { detail?: string } } }
  return err?.response?.data?.detail ?? fallback
}

export default function CreateTaskButton({ itemId, sourceModule }: { itemId: string; sourceModule: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useCurrentUser()
  const [msgApi, msgCtx] = message.useMessage()

  const { data: activeTask, isLoading } = useQuery({
    queryKey: ["active-completion-task", itemId],
    queryFn: () => fetchActiveTaskForItem(itemId),
  })

  const createMutation = useMutation({
    mutationFn: () => createDataCompletionTaskForItem(itemId, { source_module: sourceModule }),
    onSuccess: res => {
      msgApi.success(res.created ? "已创建补录任务" : "该款式已有未完成补录任务")
      queryClient.invalidateQueries({ queryKey: ["active-completion-task", itemId] })
      queryClient.invalidateQueries({ queryKey: ["data-completion-tasks"] })
      queryClient.invalidateQueries({ queryKey: ["data-completion-dashboard"] })
    },
    onError: (e: unknown) => msgApi.error(apiErrorDetail(e, "创建补录任务失败")),
  })

  if (currentUser.role === "viewer") return null

  if (activeTask) {
    return <Button size="small" onClick={() => navigate("/data-completion-tasks")}>查看补录任务</Button>
  }

  return (
    <>
      {msgCtx}
      <Button size="small" loading={isLoading || createMutation.isPending} onClick={() => createMutation.mutate()}>
        创建补录任务
      </Button>
    </>
  )
}
