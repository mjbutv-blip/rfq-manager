import client from "@/api/client"
import type { BaseInquiryImportConfirmResult, BaseInquiryImportPreview } from "@/types/base_inquiry_import"

function buildForm(file: File, uniformCustomerCode?: string): FormData {
  const form = new FormData()
  form.append("file", file)
  if (uniformCustomerCode?.trim()) {
    form.append("uniform_customer_code", uniformCustomerCode.trim())
  }
  return form
}

export async function previewBaseInquiryImport(file: File, uniformCustomerCode?: string): Promise<BaseInquiryImportPreview> {
  const res = await client.post<BaseInquiryImportPreview>(
    "/base-inquiry-import/preview",
    buildForm(file, uniformCustomerCode),
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  return res.data
}

export async function confirmBaseInquiryImport(file: File, uniformCustomerCode?: string): Promise<BaseInquiryImportConfirmResult> {
  const res = await client.post<BaseInquiryImportConfirmResult>(
    "/base-inquiry-import/confirm",
    buildForm(file, uniformCustomerCode),
    { headers: { "Content-Type": "multipart/form-data" } },
  )
  return res.data
}
