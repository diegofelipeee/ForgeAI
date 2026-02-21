// ─── ForgeCanvas: Artifact System ────────────────────────────────

/** Supported artifact content types */
export type ArtifactType = 'html' | 'react' | 'svg' | 'mermaid' | 'chart' | 'markdown' | 'code';

/** Artifact metadata */
export interface Artifact {
  id: string;
  sessionId: string;
  messageId?: string;
  type: ArtifactType;
  title: string;
  content: string;
  /** Optional: language for code artifacts (e.g. 'typescript', 'python') */
  language?: string;
  /** Optional: chart config for chart artifacts */
  chartConfig?: ArtifactChartConfig;
  /** Version number (incremented on updates) */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Chart configuration for chart-type artifacts */
export interface ArtifactChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar';
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  colors?: string[];
}

/** Artifact creation request */
export interface CreateArtifactRequest {
  sessionId: string;
  messageId?: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  chartConfig?: ArtifactChartConfig;
}

/** Artifact update request */
export interface UpdateArtifactRequest {
  title?: string;
  content?: string;
  language?: string;
  chartConfig?: ArtifactChartConfig;
}

/** Artifact event (broadcast via WebSocket) */
export interface ArtifactEvent {
  type: 'artifact_created' | 'artifact_updated' | 'artifact_deleted' | 'artifact_interaction';
  artifact?: Artifact;
  artifactId: string;
  sessionId: string;
  /** User interaction data sent back from the artifact iframe */
  interaction?: {
    action: string;
    data?: Record<string, unknown>;
  };
}
