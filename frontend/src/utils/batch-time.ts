const BATCH_SCHEDULE_HOURS_JST = [0, 12] as const;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const BATCH_SLOT_INTERVAL_MS = 12 * 60 * 60 * 1000;
const BATCH_SLOT_FUTURE_GRACE_MS = 5 * 60 * 1000;

export function formatBatchTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const hour = jst.getUTCHours();
  const minute = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

export function scheduledBatchTimeJST(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const jstHour = jst.getUTCHours();
  let batchHour: number = BATCH_SCHEDULE_HOURS_JST[0];
  for (const hour of BATCH_SCHEDULE_HOURS_JST) {
    if (hour <= jstHour) batchHour = hour;
    else break;
  }

  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const hour = String(batchHour).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00+09:00`;
}

export function normalizeBatchTimeJST(
  batchTime: string | null | undefined,
  referenceTime: string | null | undefined,
): string | undefined {
  const fallback = scheduledBatchTimeJST(referenceTime ?? undefined);
  if (!batchTime) return fallback;

  const batchDate = new Date(batchTime);
  if (Number.isNaN(batchDate.getTime())) return fallback ?? undefined;

  const batchJst = new Date(batchDate.getTime() + JST_OFFSET_MS);
  const batchHour = batchJst.getUTCHours();
  if (!BATCH_SCHEDULE_HOURS_JST.some((hour) => hour === batchHour)) {
    return fallback ?? batchTime;
  }

  if (!referenceTime) return batchTime;
  const referenceDate = new Date(referenceTime);
  if (Number.isNaN(referenceDate.getTime())) return batchTime;

  const ageMs = referenceDate.getTime() - batchDate.getTime();
  if (ageMs < -BATCH_SLOT_FUTURE_GRACE_MS) {
    return fallback ?? batchTime;
  }
  if (!fallback) return batchTime;

  const fallbackDate = new Date(fallback);
  if (Number.isNaN(fallbackDate.getTime())) return batchTime;

  const slotDistanceMs = fallbackDate.getTime() - batchDate.getTime();
  if (slotDistanceMs === 0 || slotDistanceMs === BATCH_SLOT_INTERVAL_MS) return batchTime;
  if (slotDistanceMs > 0) return fallback;

  return batchTime;
}
