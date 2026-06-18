import client from "./client"
import type { ConfirmRowsRequest, ImportBatch, ImportPreviewResponse } from "@/types/import"

export async function previewImport(
  file: File,
  previewLimit = 50,
  overrideSales?: string,
): Promise<ImportPreviewResponse> {
  const form = new FormData()
  form.append("file", file)
  form.append("preview_limit", String(previewLimit))
  if (overrideSales) form.append("override_sales", overrideSales)
  const { data } = await client.post<ImportPreviewResponse>("/imports/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function confirmImport(
  file: File,
  uploadedBy = "系统管理员",
  overrideSales?: string,
): Promise<ImportBatch> {
  const form = new FormData()
  form.append("file", file)
  form.append("uploaded_by", uploadedBy)
  if (overrideSales) form.append("override_sales", overrideSales)
  const { data } = await client.post<ImportBatch>("/imports/confirm", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function confirmImportRows(body: ConfirmRowsRequest): Promise<ImportBatch> {
  const { data } = await client.post<ImportBatch>("/imports/confirm-rows", body)
  return data
}

export async function fetchImportHistory(limit = 20, offset = 0): Promise<ImportBatch[]> {
  const { data } = await client.get<ImportBatch[]>("/imports", { params: { limit, offset } })
  return data
}
