import client from "./client"
import type {
  JourneyImportConfirmResult,
  JourneyImportDecisions,
  JourneyImportPreview,
} from "@/types/inquiry_journey_import"

export async function previewJourneyImport(file: File): Promise<JourneyImportPreview> {
  const form = new FormData()
  form.append("file", file)
  const { data } = await client.post<JourneyImportPreview>("/inquiry-journey-import/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function confirmJourneyImport(
  file: File,
  decisions: JourneyImportDecisions,
): Promise<JourneyImportConfirmResult> {
  const form = new FormData()
  form.append("file", file)
  form.append("decisions", JSON.stringify(decisions))
  const { data } = await client.post<JourneyImportConfirmResult>("/inquiry-journey-import/confirm", form, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}
