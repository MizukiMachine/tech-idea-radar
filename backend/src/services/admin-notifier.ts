import nodemailer from 'nodemailer';
import type { RssSourceUnavailableDetails } from 'ai-engine';

interface RssFailureAlert {
  operation: string;
  errorMessage: string;
  occurredAt: string;
  details?: RssSourceUnavailableDetails;
  ideaCacheGeneratedAt?: string | null;
  trendCacheGeneratedAt?: string | null;
}

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
}

const DEFAULT_ALERT_COOLDOWN_MINUTES = 60;
const lastAlertSentAt = new Map<string, number>();
let missingConfigLogged = false;

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim() ?? '';
  const to = process.env.ADMIN_ALERT_EMAIL_TO?.trim() ?? '';
  if (!host || !to) return null;

  const port = parsePositiveNumber(process.env.SMTP_PORT, 587);
  const secure = process.env.SMTP_SECURE === undefined
    ? port === 465
    : isTruthy(process.env.SMTP_SECURE);
  const user = process.env.SMTP_USER?.trim() || undefined;
  const pass = process.env.SMTP_PASS || undefined;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from: process.env.ADMIN_ALERT_EMAIL_FROM?.trim() || user || 'builder-agent-chain@localhost',
    to,
  };
}

function getCooldownMs(): number {
  return parsePositiveNumber(
    process.env.ADMIN_ALERT_COOLDOWN_MINUTES,
    DEFAULT_ALERT_COOLDOWN_MINUTES,
  ) * 60 * 1000;
}

function formatList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : '-';
}

function formatSourceErrors(errors: { source: string; message: string }[] | undefined): string {
  if (!errors || errors.length === 0) return '-';
  return errors.map((error) => `${error.source}: ${error.message}`).join('\n');
}

function buildAlertText(alert: RssFailureAlert): string {
  const details = alert.details ?? {};
  return [
    'Builder Agent Chain のRSS取得に失敗したため、LLMアイデア生成を停止しました。',
    '',
    `発生時刻: ${alert.occurredAt}`,
    `処理: ${alert.operation}`,
    `エラー: ${alert.errorMessage}`,
    `フォーカスキーワード: ${formatList(details.focusKeywords)}`,
    `RSS記事数: ${details.rssArticleCount ?? '-'}`,
    `注目キーワード数: ${details.trendingKeywordCount ?? '-'}`,
    `除外済み使用RSS数: ${details.skippedPreviouslyUsedRssCount ?? '-'}`,
    `取得元: ${formatList(details.sourceNames)}`,
    `取得元エラー:\n${formatSourceErrors(details.sourceErrors)}`,
    `アイデアキャッシュ生成日時: ${alert.ideaCacheGeneratedAt ?? '-'}`,
    `トレンドキャッシュ生成日時: ${alert.trendCacheGeneratedAt ?? '-'}`,
    '',
    '対応してください: RSSフィード、MCP RSS scout、ネットワーク、認証/レート制限、対象フィードの仕様変更を確認してください。',
  ].join('\n');
}

function alertKey(alert: RssFailureAlert): string {
  const details = alert.details ?? {};
  return [
    'RSS_SOURCE_UNAVAILABLE',
    alert.operation,
    details.rssArticleCount ?? 0,
    details.trendingKeywordCount ?? 0,
    details.skippedPreviouslyUsedRssCount ?? 0,
  ].join(':');
}

function isAlertSuppressed(alert: RssFailureAlert): boolean {
  const key = alertKey(alert);
  const now = Date.now();
  const lastSentAt = lastAlertSentAt.get(key) ?? 0;
  return now - lastSentAt < getCooldownMs();
}

function markAlertSent(alert: RssFailureAlert): void {
  lastAlertSentAt.set(alertKey(alert), Date.now());
}

export async function notifyAdminOfRssFailure(alert: RssFailureAlert): Promise<void> {
  const config = getEmailConfig();
  if (!config) {
    if (!missingConfigLogged) {
      console.warn('[AdminNotifier] Email alerts are not configured. Set SMTP_HOST and ADMIN_ALERT_EMAIL_TO.');
      missingConfigLogged = true;
    }
    return;
  }

  if (isAlertSuppressed(alert)) return;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass
      ? { user: config.user, pass: config.pass }
      : undefined,
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: `[Builder Agent Chain] RSS取得失敗: ${alert.operation}`,
    text: buildAlertText(alert),
  });
  markAlertSent(alert);
}
