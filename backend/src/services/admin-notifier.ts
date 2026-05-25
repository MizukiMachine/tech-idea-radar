import nodemailer from 'nodemailer';
import https from 'node:https';
import http from 'node:http';
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
let missingWebhookLogged = false;

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
    from: process.env.ADMIN_ALERT_EMAIL_FROM?.trim() || user || 'tech-idea-radar@localhost',
    to,
  };
}

function getCooldownMs(): number {
  return parsePositiveNumber(
    process.env.ADMIN_ALERT_COOLDOWN_MINUTES,
    DEFAULT_ALERT_COOLDOWN_MINUTES,
  ) * 60 * 1000;
}

function getWebhookUrl(): string {
  return process.env.ADMIN_ALERT_WEBHOOK_URL?.trim() ?? '';
}

function formatList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : '-';
}

function formatSourceErrors(errors: { source: string; message: string }[] | undefined): string {
  if (!errors || errors.length === 0) return '-';
  return errors.map((error) => `${error.source}: ${error.message}`).join('\n');
}

function formatSummaryErrors(errors: RssSourceUnavailableDetails['summaryErrors']): string {
  if (!errors || errors.length === 0) return '-';
  return errors
    .slice(0, 20)
    .map((error) => {
      const url = error.url ? ` (${error.url})` : '';
      return `#${error.index} ${error.source}: ${error.title}${url} - ${error.message}`;
    })
    .join('\n');
}

function alertTitle(alert: RssFailureAlert): string {
  return alert.operation.includes('summary')
    ? 'RSS要約失敗'
    : 'RSS取得失敗';
}

function alertLead(alert: RssFailureAlert): string {
  return alert.operation.includes('summary')
    ? 'Lume のRSS記事要約または日本語変換に失敗したため、該当記事をトレンド表示から除外しました。'
    : 'Lume のRSS取得に失敗したため、LLMアイデア生成を停止しました。';
}

function buildAlertText(alert: RssFailureAlert): string {
  const details = alert.details ?? {};
  return [
    alertLead(alert),
    '',
    `発生時刻: ${alert.occurredAt}`,
    `処理: ${alert.operation}`,
    `エラー: ${alert.errorMessage}`,
    `フォーカスキーワード: ${formatList(details.focusKeywords)}`,
    `RSS記事数: ${details.rssArticleCount ?? '-'}`,
    `注目キーワード数: ${details.trendingKeywordCount ?? '-'}`,
    `除外済み使用RSS数: ${details.skippedPreviouslyUsedRssCount ?? '-'}`,
    `要約失敗数: ${details.summaryFailureCount ?? '-'}`,
    `取得元: ${formatList(details.sourceNames)}`,
    `取得元エラー:\n${formatSourceErrors(details.sourceErrors)}`,
    `要約エラー:\n${formatSummaryErrors(details.summaryErrors)}`,
    `アイデアキャッシュ生成日時: ${alert.ideaCacheGeneratedAt ?? '-'}`,
    `トレンドキャッシュ生成日時: ${alert.trendCacheGeneratedAt ?? '-'}`,
    '',
    alert.operation.includes('summary')
      ? '対応してください: 要約プロンプト、LLMレスポンス形式、対象記事本文、メタ情報混入、英日変換の失敗を確認してください。'
      : '対応してください: RSSフィード、ネットワーク、認証/レート制限、対象フィードの仕様変更を確認してください。',
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
    details.summaryFailureCount ?? 0,
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
  if (isAlertSuppressed(alert)) return;

  const config = getEmailConfig();
  if (config) {
    try {
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
        subject: `[Lume] ${alertTitle(alert)}: ${alert.operation}`,
        text: buildAlertText(alert),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[AdminNotifier] Email notification failed: ${message}`);
    }
  } else if (!missingConfigLogged) {
    console.warn('[AdminNotifier] Email alerts are not configured. Set SMTP_HOST and ADMIN_ALERT_EMAIL_TO.');
    missingConfigLogged = true;
  }

  // Send webhook notification (Slack/Discord)
  await sendWebhookNotification(alert);

  markAlertSent(alert);
}

function buildWebhookPayload(alert: RssFailureAlert, webhookUrl: string): Record<string, unknown> {
  const details = alert.details ?? {};
  const isDiscord = webhookUrl.includes('discord.com');

  const text = [
    `**[Lume] ${alertTitle(alert)}: ${alert.operation}**`,
    `発生時刻: ${alert.occurredAt}`,
    `エラー: ${alert.errorMessage}`,
    `RSS記事数: ${details.rssArticleCount ?? '-'}`,
    `注目キーワード数: ${details.trendingKeywordCount ?? '-'}`,
    `要約失敗数: ${details.summaryFailureCount ?? '-'}`,
    `アイデアキャッシュ生成日時: ${alert.ideaCacheGeneratedAt ?? '-'}`,
    `トレンドキャッシュ生成日時: ${alert.trendCacheGeneratedAt ?? '-'}`,
  ].join('\n');

  if (isDiscord) {
    return {
      content: text,
      username: 'Lume Alert',
    };
  }

  // Slack format
  return {
    text,
    username: 'Lume Alert',
    icon_emoji: ':warning:',
  };
}

async function sendWebhookNotification(alert: RssFailureAlert): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    if (!missingWebhookLogged) {
      console.log('[AdminNotifier] Webhook alerts not configured. Set ADMIN_ALERT_WEBHOOK_URL for Slack/Discord notifications.');
      missingWebhookLogged = true;
    }
    return;
  }

  try {
    const payload = JSON.stringify(buildWebhookPayload(alert, webhookUrl));
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`Unsupported webhook protocol: ${url.protocol}`);
    }
    const client = url.protocol === 'https:' ? https : http;

    await new Promise<void>((resolve, reject) => {
      const req = client.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10000,
      }, (res) => {
        res.resume(); // drain response
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Webhook request timed out')); });
      req.write(payload);
      req.end();
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[AdminNotifier] Webhook notification failed: ${message}`);
  }
}
