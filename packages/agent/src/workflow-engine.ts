import { createLogger, generateId } from '@forgeai/shared';

const logger = createLogger('Agent:WorkflowEngine');

// ═══════════════════════════════════════════════════════════════════
//  WORKFLOW ENGINE — State Machine for Agentic Workflows
//  
//  Implements the 3 principles for cost-effective agentic workflows:
//  1. Contextual steps — break complex tasks into well-defined steps
//  2. Context extraction — classify and digest context before acting
//  3. State machine via DB — agents always know where they are
// ═══════════════════════════════════════════════════════════════════

// ─── Types ───────────────────────────────────────────────────────

export type WorkflowStatus = 'pending' | 'extracting_context' | 'planning' | 'executing' | 'verifying' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  index: number;
  title: string;
  description: string;
  objective: string;           // clear objective for the LLM to achieve
  status: StepStatus;
  toolsAllowed?: string[];     // restrict which tools this step can use
  expectedOutput?: string;     // what the step should produce
  actualOutput?: string;       // what the step actually produced
  error?: string;
  startedAt?: string;
  completedAt?: string;
  tokenCost?: number;          // track tokens used per step
  retryCount: number;
  maxRetries: number;
}

export interface ExtractedContext {
  taskType: string;            // e.g. 'web_app', 'automation', 'query', 'config'
  entities: string[];          // key entities mentioned (tech, services, names)
  constraints: string[];       // any constraints or requirements
  language: string;            // detected language (pt-BR, en, etc.)
  complexity: 'low' | 'medium' | 'high';
  summary: string;             // digested context for downstream steps
  missingInfo?: string[];      // what info is missing to proceed
}

export interface WorkflowState {
  id: string;
  sessionId: string;
  agentId: string;
  userMessage: string;         // original user request
  status: WorkflowStatus;
  currentStepIndex: number;
  steps: WorkflowStep[];
  context: ExtractedContext | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  totalTokens: number;
  errorCount: number;
}

// ─── DB Persistence Interface ────────────────────────────────────

export interface WorkflowPersistence {
  save(state: WorkflowState): Promise<void>;
  load(workflowId: string): Promise<WorkflowState | null>;
  loadBySession(sessionId: string): Promise<WorkflowState | null>;
  listActive(): Promise<WorkflowState[]>;
  delete(workflowId: string): Promise<void>;
}

// ─── In-Memory Persistence (fallback when no DB) ─────────────────

export class InMemoryWorkflowStore implements WorkflowPersistence {
  private store = new Map<string, WorkflowState>();

  async save(state: WorkflowState): Promise<void> {
    this.store.set(state.id, structuredClone(state));
  }

  async load(workflowId: string): Promise<WorkflowState | null> {
    const s = this.store.get(workflowId);
    return s ? structuredClone(s) : null;
  }

  async loadBySession(sessionId: string): Promise<WorkflowState | null> {
    for (const state of this.store.values()) {
      if (state.sessionId === sessionId && state.status !== 'completed' && state.status !== 'failed' && state.status !== 'cancelled') {
        return structuredClone(state);
      }
    }
    return null;
  }

  async listActive(): Promise<WorkflowState[]> {
    const active: WorkflowState[] = [];
    for (const state of this.store.values()) {
      if (state.status !== 'completed' && state.status !== 'failed' && state.status !== 'cancelled') {
        active.push(structuredClone(state));
      }
    }
    return active;
  }

  async delete(workflowId: string): Promise<void> {
    this.store.delete(workflowId);
  }
}

// ─── MySQL Persistence ───────────────────────────────────────────

// Generic DB interface matching knex API subset — avoids direct knex dependency
interface WorkflowDB {
  (table: string): { where: Function; whereNotIn: Function; orderBy: Function; first: Function; insert: Function; update: Function; select: Function; delete: Function };
  fn: { now: () => unknown };
  schema: { hasTable: (name: string) => Promise<boolean> };
}

export class MySQLWorkflowStore implements WorkflowPersistence {
  constructor(private getDb: () => WorkflowDB) {}

  async save(state: WorkflowState): Promise<void> {
    const db = this.getDb();
    const row = {
      id: state.id,
      session_id: state.sessionId,
      agent_id: state.agentId,
      user_message: state.userMessage.substring(0, 2000),
      status: state.status,
      current_step_index: state.currentStepIndex,
      steps_json: JSON.stringify(state.steps),
      context_json: state.context ? JSON.stringify(state.context) : null,
      metadata_json: JSON.stringify(state.metadata),
      total_tokens: state.totalTokens,
      error_count: state.errorCount,
      completed_at: state.completedAt || null,
      updated_at: db.fn.now(),
    };

    // Upsert
    const exists = await db('workflow_states').where('id', state.id).first();
    if (exists) {
      await db('workflow_states').where('id', state.id).update(row);
    } else {
      await db('workflow_states').insert({ ...row, created_at: db.fn.now() });
    }
  }

  async load(workflowId: string): Promise<WorkflowState | null> {
    const db = this.getDb();
    const row = await db('workflow_states').where('id', workflowId).first() as Record<string, unknown> | undefined;
    return row ? this.rowToState(row) : null;
  }

  async loadBySession(sessionId: string): Promise<WorkflowState | null> {
    const db = this.getDb();
    const row = await db('workflow_states')
      .where('session_id', sessionId)
      .whereNotIn('status', ['completed', 'failed', 'cancelled'])
      .orderBy('created_at', 'desc')
      .first() as Record<string, unknown> | undefined;
    return row ? this.rowToState(row) : null;
  }

  async listActive(): Promise<WorkflowState[]> {
    const db = this.getDb();
    const rows = await db('workflow_states')
      .whereNotIn('status', ['completed', 'failed', 'cancelled'])
      .orderBy('created_at', 'desc') as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToState(r));
  }

  async delete(workflowId: string): Promise<void> {
    const db = this.getDb();
    await db('workflow_states').where('id', workflowId).delete();
  }

  private rowToState(row: Record<string, unknown>): WorkflowState {
    return {
      id: row['id'] as string,
      sessionId: row['session_id'] as string,
      agentId: row['agent_id'] as string,
      userMessage: row['user_message'] as string,
      status: row['status'] as WorkflowStatus,
      currentStepIndex: row['current_step_index'] as number,
      steps: JSON.parse(row['steps_json'] as string) as WorkflowStep[],
      context: row['context_json'] ? JSON.parse(row['context_json'] as string) as ExtractedContext : null,
      metadata: JSON.parse((row['metadata_json'] as string) || '{}'),
      createdAt: (row['created_at'] as Date)?.toISOString?.() || row['created_at'] as string,
      updatedAt: (row['updated_at'] as Date)?.toISOString?.() || row['updated_at'] as string,
      completedAt: row['completed_at'] ? ((row['completed_at'] as Date)?.toISOString?.() || row['completed_at'] as string) : undefined,
      totalTokens: (row['total_tokens'] as number) || 0,
      errorCount: (row['error_count'] as number) || 0,
    };
  }
}

// ─── Workflow Engine ─────────────────────────────────────────────

export class AgentWorkflowEngine {
  private persistence: WorkflowPersistence;

  constructor(persistence?: WorkflowPersistence) {
    this.persistence = persistence ?? new InMemoryWorkflowStore();
  }

  setPersistence(persistence: WorkflowPersistence): void {
    this.persistence = persistence;
    logger.info('Workflow persistence updated');
  }

  // ─── Create a new workflow ─────────────────────────────────

  async createWorkflow(params: {
    sessionId: string;
    agentId: string;
    userMessage: string;
    steps?: Array<{ title: string; description: string; objective: string; toolsAllowed?: string[] }>;
    context?: ExtractedContext;
  }): Promise<WorkflowState> {
    const workflowId = generateId('wf');

    const steps: WorkflowStep[] = (params.steps || []).map((s, i) => ({
      id: generateId('ws'),
      index: i,
      title: s.title,
      description: s.description,
      objective: s.objective,
      status: 'pending' as StepStatus,
      toolsAllowed: s.toolsAllowed,
      retryCount: 0,
      maxRetries: 2,
    }));

    const state: WorkflowState = {
      id: workflowId,
      sessionId: params.sessionId,
      agentId: params.agentId,
      userMessage: params.userMessage,
      status: steps.length > 0 ? 'executing' : 'planning',
      currentStepIndex: 0,
      steps,
      context: params.context || null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalTokens: 0,
      errorCount: 0,
    };

    await this.persistence.save(state);
    logger.info('Workflow created', { workflowId, sessionId: params.sessionId, steps: steps.length });
    return state;
  }

  // ─── Get active workflow for a session ─────────────────────

  async getActiveWorkflow(sessionId: string): Promise<WorkflowState | null> {
    return this.persistence.loadBySession(sessionId);
  }

  // ─── Advance to next step ─────────────────────────────────

  async advanceStep(workflowId: string, result?: { output?: string; tokenCost?: number; error?: string }): Promise<WorkflowState | null> {
    const state = await this.persistence.load(workflowId);
    if (!state) return null;

    const currentStep = state.steps[state.currentStepIndex];
    if (!currentStep) return state;

    // Update current step
    if (result?.error) {
      currentStep.status = 'failed';
      currentStep.error = result.error;
      currentStep.retryCount++;
      state.errorCount++;

      // Retry or fail entire workflow
      if (currentStep.retryCount < currentStep.maxRetries) {
        logger.warn('Workflow step failed, will retry', { workflowId, step: currentStep.title, retry: currentStep.retryCount });
        currentStep.status = 'pending'; // Reset for retry
      } else {
        logger.error('Workflow step permanently failed', { workflowId, step: currentStep.title });
        // Try to skip and continue
        currentStep.status = 'failed';
        state.currentStepIndex++;
      }
    } else {
      currentStep.status = 'completed';
      currentStep.actualOutput = result?.output?.substring(0, 2000);
      currentStep.completedAt = new Date().toISOString();
      currentStep.tokenCost = result?.tokenCost;
      state.totalTokens += result?.tokenCost || 0;
      state.currentStepIndex++;
    }

    // Check if all steps are done
    if (state.currentStepIndex >= state.steps.length) {
      state.status = 'verifying';
      // Auto-complete if no failed steps
      const failedSteps = state.steps.filter(s => s.status === 'failed');
      if (failedSteps.length === 0) {
        state.status = 'completed';
        state.completedAt = new Date().toISOString();
      }
    }

    state.updatedAt = new Date().toISOString();
    await this.persistence.save(state);

    logger.info('Workflow step advanced', {
      workflowId,
      currentStep: state.currentStepIndex,
      totalSteps: state.steps.length,
      status: state.status,
    });

    return state;
  }

  // ─── Set extracted context ─────────────────────────────────

  async setContext(workflowId: string, context: ExtractedContext): Promise<WorkflowState | null> {
    const state = await this.persistence.load(workflowId);
    if (!state) return null;

    state.context = context;
    state.status = state.steps.length > 0 ? 'executing' : 'planning';
    state.updatedAt = new Date().toISOString();
    await this.persistence.save(state);

    logger.info('Workflow context set', { workflowId, taskType: context.taskType, complexity: context.complexity });
    return state;
  }

  // ─── Set workflow steps (after planning phase) ─────────────

  async setSteps(workflowId: string, steps: Array<{ title: string; description: string; objective: string; toolsAllowed?: string[] }>): Promise<WorkflowState | null> {
    const state = await this.persistence.load(workflowId);
    if (!state) return null;

    state.steps = steps.map((s, i) => ({
      id: generateId('ws'),
      index: i,
      title: s.title,
      description: s.description,
      objective: s.objective,
      status: 'pending' as StepStatus,
      toolsAllowed: s.toolsAllowed,
      retryCount: 0,
      maxRetries: 2,
    }));
    state.currentStepIndex = 0;
    state.status = 'executing';
    state.updatedAt = new Date().toISOString();
    await this.persistence.save(state);

    logger.info('Workflow steps set', { workflowId, steps: steps.length });
    return state;
  }

  // ─── Cancel workflow ───────────────────────────────────────

  async cancelWorkflow(workflowId: string): Promise<void> {
    const state = await this.persistence.load(workflowId);
    if (!state) return;

    state.status = 'cancelled';
    state.updatedAt = new Date().toISOString();
    await this.persistence.save(state);
    logger.info('Workflow cancelled', { workflowId });
  }

  // ─── Build context string for LLM injection ───────────────

  buildWorkflowContext(state: WorkflowState): string {
    const parts: string[] = [];
    parts.push(`--- Active Workflow (${state.id}) ---`);
    parts.push(`Status: ${state.status} | Step ${state.currentStepIndex + 1}/${state.steps.length} | Tokens used: ${state.totalTokens}`);

    if (state.context) {
      parts.push(`Task: ${state.context.summary}`);
      if (state.context.entities.length > 0) {
        parts.push(`Entities: ${state.context.entities.join(', ')}`);
      }
      if (state.context.constraints.length > 0) {
        parts.push(`Constraints: ${state.context.constraints.join(', ')}`);
      }
      if (state.context.missingInfo && state.context.missingInfo.length > 0) {
        parts.push(`⚠️ Missing info: ${state.context.missingInfo.join(', ')}`);
      }
    }

    parts.push('');
    parts.push('Steps:');
    for (const step of state.steps) {
      const statusIcon = step.status === 'completed' ? '✅'
        : step.status === 'in_progress' ? '▶️'
        : step.status === 'failed' ? '❌'
        : step.status === 'skipped' ? '⏭️'
        : '⏳';
      parts.push(`${statusIcon} ${step.index + 1}. ${step.title}`);
      if (step.index === state.currentStepIndex && step.status !== 'completed') {
        parts.push(`   CURRENT OBJECTIVE: ${step.objective}`);
        if (step.toolsAllowed) {
          parts.push(`   Allowed tools: ${step.toolsAllowed.join(', ')}`);
        }
      }
      if (step.actualOutput) {
        parts.push(`   Output: ${step.actualOutput.substring(0, 200)}`);
      }
      if (step.error) {
        parts.push(`   Error: ${step.error}`);
      }
    }

    return parts.join('\n');
  }

  // ─── Get current step objective for focused LLM prompt ─────

  getCurrentStepObjective(state: WorkflowState): string | null {
    const step = state.steps[state.currentStepIndex];
    if (!step) return null;
    return `CURRENT TASK (Step ${step.index + 1}/${state.steps.length}): ${step.title}\nOBJECTIVE: ${step.objective}\n${step.description}`;
  }

  // ─── List active workflows ─────────────────────────────────

  async listActive(): Promise<WorkflowState[]> {
    return this.persistence.listActive();
  }

  // ─── Cleanup old completed workflows ───────────────────────

  async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const all = await this.persistence.listActive();
    let cleaned = 0;
    const cutoff = Date.now() - maxAge;

    for (const state of all) {
      const updatedAt = new Date(state.updatedAt).getTime();
      if (updatedAt < cutoff && (state.status === 'completed' || state.status === 'failed')) {
        await this.persistence.delete(state.id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up old workflows', { count: cleaned });
    }
    return cleaned;
  }
}

// ─── Factory ─────────────────────────────────────────────────────

export function createAgentWorkflowEngine(persistence?: WorkflowPersistence): AgentWorkflowEngine {
  return new AgentWorkflowEngine(persistence);
}
