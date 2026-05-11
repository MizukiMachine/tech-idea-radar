const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
const API_BASE = DEFAULT_API_BASE.replace(/\/$/, "");

export type StepResult = {
  step: number;
  name: string;
  output: unknown;
};

export type WorkflowCallbacks = {
  onStepComplete?: (result: StepResult) => void;
  onStepProgress?: (data: { step: number; text: string; charCount: number }) => void;
  onWorkflowComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
};

export async function executeStep(step: number, input: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/ai/steps/${step}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function runWorkflow(
  input: unknown,
  callbacks: WorkflowCallbacks = {},
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/ai/workflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6);
            try {
              const data = JSON.parse(raw);
              if (currentEvent === "step_progress") {
                callbacks.onStepProgress?.(data);
              } else if (currentEvent === "step_complete") {
                callbacks.onStepComplete?.(data);
              } else if (currentEvent === "workflow_complete") {
                callbacks.onWorkflowComplete?.(data);
              } else if (currentEvent === "error") {
                callbacks.onError?.(data.error ?? "Unknown error");
              }
            } catch {
              // skip malformed data lines
            }
            currentEvent = "";
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError?.(err.message);
      }
    });

  return controller;
}
