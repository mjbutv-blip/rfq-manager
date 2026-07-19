import type { OrderGroupInquiryAnalysis, OrderGroupScenario } from "@/types/order_group"

export interface OrderSeriesListItem {
  id: string
  series_code: string
  series_name: string | null
  customer_code: string | null
  customer_name: string | null
  inquiry_count: number
  inquiry_nos: string[]
  order_group_count: number
  source_file_name: string | null
  source_sheet: string | null
  source_start_row: number | null
  source_end_row: number | null
  series_status: string
  created_at: string | null
}

export interface OrderSeriesGroup {
  id: string
  group_code: string
  group_name: string | null
  inquiry_nos: string[]
  source_start_row: number | null
  source_end_row: number | null
  group_status: string
}

export interface OrderSeriesDetail {
  series: {
    id: string
    series_code: string
    series_name: string | null
    source_file_name: string | null
    source_sheet: string | null
    source_start_row: number | null
    source_end_row: number | null
    customer_code: string | null
    series_status: string
    notes: string | null
    created_at: string | null
  }
  items: { id: string; inquiry_id: string; inquiry_no: string; source_sheet: string | null; source_row: number | null; sort_order: number }[]
  order_groups: OrderSeriesGroup[]
  analysis: {
    inquiries: OrderGroupInquiryAnalysis[]
    scenarios: {
      lowest_each: OrderGroupScenario
      unified_factory: OrderGroupScenario[]
      current_selected: OrderGroupScenario
      custom_placeholder: { label: string; status: string }
    }
    auxiliary_metrics: {
      factory_concentration: {
        lowest_each_factory_count: number
        current_factory_count: number
        common_factory_count: number
      }
      missing_quote_inquiries: string[]
      quantity_key_inquiries: OrderGroupInquiryAnalysis[]
    }
    series_summary: {
      total_quantity: number
      trade_amount_usd: number | null
      gross_profit_cny: number | null
      selected_factory_count: number
      top_selected_factories: { factory_name: string; count: number }[]
      order_group_count: number
      ungrouped_inquiry_nos: string[]
      missing_quote_inquiries: string[]
    }
    warnings: string[]
  }
}
