import type { Prisma } from "@/generated/prisma/client";
import type { SettingValueType } from "@/generated/prisma/enums";
import { getEnv } from "@/lib/config/env";
import { getPrisma } from "@/lib/db/prisma";

const CACHE_MS = 15_000;
const cache = new Map<string, { value: unknown; at: number }>();

export function clearSettingsCache(): void {
  cache.clear();
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;

  const row = await getPrisma().appSetting.findUnique({
    where: { key },
    select: { valueJson: true },
  });

  const value = (row ? row.valueJson : fallback) as T;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(
  key: string,
  value: Prisma.InputJsonValue,
  type: SettingValueType,
  updatedById: string,
  meta?: { category?: string; label?: string },
): Promise<void> {
  await getPrisma().appSetting.upsert({
    where: { key },
    update: { valueJson: value, valueType: type, updatedById },
    create: {
      key,
      valueJson: value,
      valueType: type,
      updatedById,
      category: meta?.category ?? "general",
      label: meta?.label,
    },
  });

  cache.delete(key);
}

export interface PaymentSettings {
  fee: number;
  currency: string;
  upiId: string;
  payeeName: string;
  qrFileId: string | null;
  instructions: string;
  hardTierEnabled: boolean;
}

async function readHardTierEnabled(): Promise<boolean> {
  const value = await getSetting<unknown>("hard_tier_enabled", false);

  return (
    value === true ||
    value === "true" ||
    value === "1" ||
    value === 1
  );
}

/** Fee, UPI ID and QR are admin-editable settings; env values are only first-run defaults. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const env = getEnv();

  const [fee, currency, upiId, payeeName, qrFileId, instructions, hardTierEnabled] =
    await Promise.all([
      getSetting<number>("certificate_fee", env.CERTIFICATE_FEE),
      getSetting<string>("currency", env.CURRENCY),
      getSetting<string>("upi_id", env.UPI_ID ?? ""),
      getSetting<string>("upi_payee_name", env.UPI_PAYEE_NAME ?? ""),
      getSetting<string | null>("upi_qr_file_id", null),
      getSetting<string>("payment_instructions", ""),
      readHardTierEnabled(),
    ]);

  return {
    fee: Number(fee),
    currency: String(currency),
    upiId: String(upiId ?? ""),
    payeeName: String(payeeName ?? ""),
    qrFileId: qrFileId ? String(qrFileId) : null,
    instructions: String(instructions ?? ""),
    hardTierEnabled,
  };
}

export async function isAutoApproveEnabled(): Promise<boolean> {
  return Boolean(await getSetting<boolean>("application_auto_approve", false));
}

/** Feature flag that gates Hard-tier behaviour (template headroom and reviewer checklist). */
export async function isHardTierEnabled(): Promise<boolean> {
  return readHardTierEnabled();
}