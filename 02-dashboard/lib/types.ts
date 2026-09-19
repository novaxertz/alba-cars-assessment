import type { Bucket } from './format';

export type VehicleStatus = 'available' | 'reserved' | 'sold';
export type PriceReason = 'manual' | 'scheduled_markdown' | 'automation';

export type Vehicle = {
  id: string;
  owner_id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  mileage_km: number;
  acquired_at: string;
  acquisition_cost_aed: number;
  list_price_aed: number;
  price_change_reason: PriceReason;
  status: VehicleStatus;
  sold_at: string | null;
  sold_price_aed: number | null;
};

/** Read model from the `vehicle_ageing` view — every derived number is computed in Postgres. */
export type AgeingRow = {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  acquired_at: string;
  acquisition_cost_aed: number;
  list_price_aed: number;
  days_on_lot: number;
  holding_cost_aed: number;
  total_markdown_aed: number;
  margin_at_list_aed: number;
  ageing_bucket: Bucket;
};

export type SummaryRow = {
  ageing_bucket: Bucket;
  vehicle_count: number;
  capital_aed: number;
  holding_cost_aed: number;
  markdown_aed: number;
};

export type PriceChange = {
  id: string;
  vehicle_id: string;
  old_price_aed: number;
  new_price_aed: number;
  reason: PriceReason;
  changed_at: string;
};

export type VehiclePhoto = {
  id: string;
  vehicle_id: string;
  storage_path: string;
  thumb_path: string | null;
  is_cover: boolean;
  created_at: string;
};

/** A photo with a short-lived URL attached. The URL is never stored. */
export type SignedPhoto = VehiclePhoto & { url: string };
