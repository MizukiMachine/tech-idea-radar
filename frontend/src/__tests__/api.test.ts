import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

function health(stackId: string | null, requireDevStackHeader = true) {
  return {
    status: 'ok',
    service: 'tech-idea-radar-backend',
    config: {
      requireDevStackHeader,
    },
    process: {
      devStackId: stackId,
    },
  };
}

const ideasResponse = {
  status: 'cached',
  candidates: [],
  generatedAt: new Date().toISOString(),
  sourceSummary: {
    rssItemCount: 0,
    usedLLMFallback: false,
  },
  batches: [],
};

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('API dev-stack boundary', () => {
  it('rejects an explicit non-local API base outside the local dev stack unless allowlisted', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');

    const { fetchIdeas } = await import('../api/ai');

    await expect(fetchIdeas()).rejects.toThrow(/VITE_ALLOWED_API_BASES/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses an allowlisted explicit API base outside the local dev stack', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test');
    vi.stubEnv('VITE_ALLOWED_API_BASES', 'https://api.example.test');
    mockFetch.mockResolvedValueOnce(jsonResponse(ideasResponse));

    const { fetchIdeas, getApiBase } = await import('../api/ai');
    await fetchIdeas();

    expect(getApiBase()).toBe('https://api.example.test');
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.test/api/ai/ideas', undefined);
  });

  it('rejects an explicit loopback API base outside the local dev stack', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3999');

    const { fetchIdeas } = await import('../api/ai');

    await expect(fetchIdeas()).rejects.toThrow(/VITE_ALLOWED_API_BASES/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forces same-origin proxy and validates the backend stack during local dev', async () => {
    vi.stubEnv('VITE_DEV_STACK_ID', 'dev-current');
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3999');
    mockFetch
      .mockResolvedValueOnce(jsonResponse(health('dev-current')))
      .mockResolvedValueOnce(jsonResponse(ideasResponse));

    const { fetchIdeas, getApiBase, getExpectedDevStackId } = await import('../api/ai');
    await fetchIdeas();

    expect(getExpectedDevStackId()).toBe('dev-current');
    expect(getApiBase()).toBe('(same-origin /api)');
    expect(mockFetch).toHaveBeenNthCalledWith(1, '/health', expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(Object),
    }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/ai/ideas', undefined);
  });

  it('rejects a stale or unrelated backend before reading application data', async () => {
    vi.stubEnv('VITE_DEV_STACK_ID', 'dev-current');
    mockFetch.mockResolvedValueOnce(jsonResponse(health('dev-old')));

    const { fetchIdeas } = await import('../api/ai');

    await expect(fetchIdeas()).rejects.toThrow(/DEV_STACK_MISMATCH/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/health', expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(Object),
    }));
  });

  it('rejects a backend that is not enforcing the dev-stack API boundary', async () => {
    vi.stubEnv('VITE_DEV_STACK_ID', 'dev-current');
    mockFetch.mockResolvedValueOnce(jsonResponse(health('dev-current', false)));

    const { fetchIdeas } = await import('../api/ai');

    await expect(fetchIdeas()).rejects.toThrow(/DEV_STACK_MISMATCH/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('times out the backend health check instead of waiting indefinitely', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_DEV_STACK_ID', 'dev-current');
    mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }));

    const { fetchIdeas } = await import('../api/ai');
    const result = expect(fetchIdeas()).rejects.toThrow(/timed out after 5000ms/);

    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
