import { BaseTool } from '../base.js';
import type { ToolDefinition, ToolResult } from '../base.js';
import { createLogger } from '@forgeai/shared';

const logger = createLogger('Tool:Delegate');

// ─── Types ──────────────────────────────────────────────

export interface DelegationResult {
  success: boolean;
  content: string;
  role: string;
  model: string;
  duration: number;
  steps: number;
  tokens?: number;
  error?: string;
}

// Minimal interface to avoid circular dependency with AgentManager
interface DelegateManagerRef {
  delegateTask(params: {
    role: string;
    task: string;
    context?: string;
    parentSessionId: string;
  }): Promise<DelegationResult>;
}

// ─── Global Ref (set by gateway) ────────────────────────

let delegateManagerRef: DelegateManagerRef | null = null;

/**
 * Set the delegate manager reference. Called by gateway at startup.
 */
export function setDelegateManagerRef(ref: DelegateManagerRef): void {
  delegateManagerRef = ref;
  logger.info('Delegate manager ref set');
}

// Track concurrent delegations per parent session
const activeDelegations: Map<string, number> = new Map();
const MAX_CONCURRENT_DELEGATES = 3;

// ─── agent_delegate Tool ────────────────────────────────

export class AgentDelegateTool extends BaseTool {
  readonly definition: ToolDefinition = {
    name: 'agent_delegate',
    description: `Delegate a focused task to a specialist sub-agent that runs independently with its own context. The sub-agent has access to ALL tools (file_manager, shell_exec, web_browse, etc.) and executes the task completely before returning results. Use this to split complex work into parallel independent parts. Call this tool MULTIPLE TIMES in one response to run sub-agents in parallel.`,
    category: 'utility',
    parameters: [
      {
        name: 'role',
        type: 'string',
        description: 'Specialist role for the sub-agent. Be specific. Examples: "Frontend React Developer", "Python Backend Engineer", "Data Analyst", "CSS/UI Designer", "API Documentation Writer"',
        required: true,
      },
      {
        name: 'task',
        type: 'string',
        description: 'Clear, self-contained task description. Must include ALL information the sub-agent needs — it has NO access to your conversation history. Include file paths, requirements, constraints, and expected output.',
        required: true,
      },
      {
        name: 'context',
        type: 'string',
        description: 'Additional context: existing file paths, project structure, tech stack, constraints. The more context, the better the sub-agent performs.',
        required: false,
      },
    ],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const start = Date.now();
    const role = params['role'] as string;
    const task = params['task'] as string;
    const context = params['context'] as string | undefined;
    const sessionId = params['_sessionId'] as string | undefined;

    if (!role || !task) {
      return { success: false, error: 'role and task are required', duration: Date.now() - start };
    }

    if (!delegateManagerRef) {
      return { success: false, error: 'Delegation not available (manager not connected)', duration: Date.now() - start };
    }

    // Enforce concurrent delegation limit per session
    const parentSession = sessionId ?? 'unknown';
    const current = activeDelegations.get(parentSession) ?? 0;
    if (current >= MAX_CONCURRENT_DELEGATES) {
      return {
        success: false,
        error: `Too many concurrent delegations (max ${MAX_CONCURRENT_DELEGATES}). Wait for current sub-agents to finish.`,
        duration: Date.now() - start,
      };
    }

    activeDelegations.set(parentSession, current + 1);
    logger.info(`Delegating to "${role}"`, { parentSession, task: task.substring(0, 120), concurrent: current + 1 });

    try {
      const result = await delegateManagerRef.delegateTask({
        role,
        task,
        context,
        parentSessionId: parentSession,
      });

      if (!result.success) {
        return {
          success: false,
          error: `Sub-agent "${role}" failed: ${result.error ?? 'unknown error'}`,
          duration: Date.now() - start,
        };
      }

      return {
        success: true,
        data: {
          role: result.role,
          result: result.content,
          model: result.model,
          duration: result.duration,
          steps: result.steps,
          tokens: result.tokens,
          message: `Sub-agent "${role}" completed task in ${Math.round(result.duration / 1000)}s with ${result.steps} steps.`,
        },
        duration: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        error: `Delegation failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: Date.now() - start,
      };
    } finally {
      const count = activeDelegations.get(parentSession) ?? 1;
      if (count <= 1) {
        activeDelegations.delete(parentSession);
      } else {
        activeDelegations.set(parentSession, count - 1);
      }
    }
  }
}
