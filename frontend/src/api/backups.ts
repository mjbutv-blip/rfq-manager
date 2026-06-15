import api from "./client"

export interface BackupRecord {
  backup_id: string
  backup_name: string
  file_name: string | null
  file_size: number | null
  generated_by: string
  generated_at: string | null
  status: "generated" | "failed"
  included_tables: string[]
  row_counts: Record<string, number>
  error_message: string | null
}

export interface GenerateBackupResult {
  backup_id: string
  file_name: string
  download_url: string
  included_tables: string[]
  row_counts: Record<string, number>
  file_size: number
  message: string
}

export interface SheetInfo {
  sheet_name: string
  row_count: number
  status: "ok" | "warning"
  missing_columns: string[]
}

export interface RestorePreviewResult {
  file_name: string
  sheets: SheetInfo[]
  can_restore: boolean
  message: string
}

export async function generateBackup(): Promise<GenerateBackupResult> {
  const res = await api.post("/backups/generate")
  return res.data
}

export async function listBackups(page = 1, pageSize = 20): Promise<BackupRecord[]> {
  const res = await api.get("/backups", { params: { page, page_size: pageSize } })
  return res.data
}

/** 通过认证头下载备份文件，触发浏览器保存对话框 */
export async function downloadBackup(backupId: string, fileName: string): Promise<void> {
  const res = await api.get(`/backups/${backupId}/download`, {
    responseType: "blob",
  })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const a   = document.createElement("a")
  a.href     = url
  a.download = fileName || "backup.xlsx"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export async function restorePreview(file: File): Promise<RestorePreviewResult> {
  const form = new FormData()
  form.append("file", file)
  const res = await api.post("/backups/restore/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data
}
