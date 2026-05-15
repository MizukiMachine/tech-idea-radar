import { useEffect, useRef, useState } from 'react';
import type { XTweet } from '../api/ai';
import './XPostEmbed.css';

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement | null) => void | Promise<unknown>;
      };
    };
  }
}

let widgetsScriptPromise: Promise<void> | null = null;

function ensureWidgetsScript(): Promise<void> {
  if (window.twttr?.widgets) return Promise.resolve();
  if (widgetsScriptPromise) return widgetsScriptPromise;

  widgetsScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://platform.twitter.com/widgets.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('X widgets failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.charset = 'utf-8';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('X widgets failed to load'));
    document.body.appendChild(script);
  });

  return widgetsScriptPromise;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'X';
}

interface XPostEmbedProps {
  tweet: XTweet;
}

export default function XPostEmbed({ tweet }: XPostEmbedProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEmbedFailed(false);

    void ensureWidgetsScript()
      .then(() => {
        if (cancelled) return;
        void window.twttr?.widgets?.load(hostRef.current);
      })
      .catch(() => {
        if (!cancelled) setEmbedFailed(true);
      });

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const iframe = hostRef.current?.querySelector('iframe');
      if (!iframe) setEmbedFailed(true);
    }, 4500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tweet.url]);

  return (
    <div className="x-post-embed">
      {!embedFailed && (
        <div className="x-post-embed__official" ref={hostRef}>
          <blockquote
            className="twitter-tweet"
            data-dnt="true"
            data-theme="light"
            data-width="460"
          >
            <a href={tweet.url}>{tweet.url}</a>
          </blockquote>
        </div>
      )}

      {embedFailed && (
        <article className="x-post-embed__fallback">
          <div className="x-post-embed__fallback-top">
            <div className="x-post-embed__avatar">{initials(tweet.author)}</div>
            <div className="x-post-embed__author">
              <strong>{tweet.author}</strong>
              <span>@{tweet.authorHandle} · {formatDate(tweet.createdAt)}</span>
            </div>
            <span className="x-post-embed__mark">X</span>
          </div>
          <p>{tweet.text}</p>
          <div className="x-post-embed__metrics">
            <span>{tweet.replyCount} replies</span>
            <span>{tweet.retweetCount} reposts</span>
            <span>{tweet.likeCount} likes</span>
          </div>
        </article>
      )}
    </div>
  );
}
