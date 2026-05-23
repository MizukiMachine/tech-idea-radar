const BATCH_SCHEDULE_HOURS_JST = [0, 4, 8, 12, 16, 20] as const;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
