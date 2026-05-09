export interface GeneratedFile {
  path: string;
  type: 'report' | 'data' | 'visualization';
  content: string;
}

export interface Metadata {
  executedAt: string;
  model: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}
