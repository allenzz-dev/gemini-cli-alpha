/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tool for delegating from semantic agent to visual agent.
 *
 * The semantic browser agent uses this tool when it needs to perform
 * visual/coordinate-based interactions that cannot be done via the
 * accessibility tree.
 *
 * With MCP --experimental-vision, the visual tools (click_at, etc.) are
 * provided by chrome-devtools-mcp and discovered dynamically. The visual
 * agent uses these MCP tools along with take_screenshot for visual context.
 */

import {
  DeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ToolInvocation,
} from '../../tools/tools.js';
import type { Part } from '@google/genai';
import type { MessageBus } from '../../confirmation-bus/message-bus.js';
import type { BrowserManager } from './browserManager.js';
import type { Config } from '../../config/config.js';
import { LocalAgentExecutor } from '../local-executor.js';
import { VisualAgentDefinition } from './visualAgentDefinition.js';
import { createMcpDeclarativeTools } from './mcpToolWrapper.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Invocation for the delegate_to_visual_agent tool.
 */
class DelegateToVisualAgentInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly config: Config,
    params: Record<string, unknown>,
    messageBus: MessageBus,
  ) {
    super(
      params,
      messageBus,
      'delegate_to_visual_agent',
      'Delegate to Visual Agent',
    );
  }

  getDescription(): string {
    const instruction = this.params['instruction'] as string;
    const preview =
      instruction.length > 50
        ? instruction.substring(0, 50) + '...'
        : instruction;
    return `Delegating to visual agent: "${preview}"`;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const instruction = String(this.params['instruction'] ?? '');

      debugLogger.log(`Delegating to visual agent: ${instruction}`);

      // Capture screenshot for visual agent via MCP tool
      const screenshotResult = await this.browserManager.callTool(
        'take_screenshot',
        {},
      );

      // Extract base64 image data from MCP response
      // MCP take_screenshot returns { type: 'image', data: base64, mimeType: 'image/png' }
      let screenshotBase64 = '';
      let mimeType = 'image/png';
      const content = screenshotResult.content?.[0];
      if (content) {
        if (content.type === 'image' && content.data) {
          screenshotBase64 = content.data;
          mimeType = content.mimeType ?? 'image/png';
        } else if (content.text) {
          // Fallback: might be base64 data in text field
          screenshotBase64 = content.text;
        }
      }

      if (!screenshotBase64) {
        debugLogger.warn('Failed to capture screenshot for visual agent');
      }

      // Create visual agent tools from MCP (includes click_at, etc. from --experimental-vision)
      const mcpTools = await createMcpDeclarativeTools(
        this.browserManager,
        this.messageBus,
      );

      // Build initial messages with screenshot as inlineData Part
      // This is how we inject the image into the visual agent's context
      const initialMessages: Array<{ role: 'user' | 'model'; parts: Part[] }> =
        [];
      if (screenshotBase64) {
        initialMessages.push({
          role: 'user',
          parts: [
            {
              text: `Your task is: ${instruction}\n\nHere is the current screenshot of the page:`,
            },
            {
              inlineData: {
                mimeType,
                data: screenshotBase64,
              },
            },
            {
              text: 'Analyze this screenshot and perform the necessary actions to complete the task.',
            },
          ],
        });
      }

      // Configure the visual agent definition with MCP tools and initial messages
      const visualDefinition: typeof VisualAgentDefinition = {
        ...VisualAgentDefinition,
        toolConfig: {
          tools: mcpTools,
        },
        promptConfig: {
          ...VisualAgentDefinition.promptConfig,
          // Use initialMessages instead of query when we have a screenshot
          initialMessages: screenshotBase64 ? initialMessages : undefined,
          // Clear query if using initialMessages to avoid duplication
          query: screenshotBase64
            ? undefined
            : VisualAgentDefinition.promptConfig.query,
        },
      };

      // Create activity callback for visual agent
      const onActivity = (): void => {
        // Visual agent activity is logged but not streamed to user
        debugLogger.log('Visual agent activity');
      };

      // Create and run the visual agent
      const executor = await LocalAgentExecutor.create(
        visualDefinition,
        this.config,
        onActivity,
      );

      // Run with instruction (screenshot is now in initialMessages)
      const output = await executor.run(
        {
          instruction,
        },
        signal,
      );

      debugLogger.log(`Visual agent finished: ${output.terminate_reason}`);

      // Format result for semantic agent
      const resultText = `Visual Agent Result:
Termination Reason: ${output.terminate_reason}
Result: ${output.result}`;

      return {
        llmContent: resultText,
        returnDisplay: resultText,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Visual agent delegation failed: ${errorMsg}`);
      return {
        llmContent: `Visual delegation failed: ${errorMsg}`,
        returnDisplay: `Visual delegation failed: ${errorMsg}`,
        error: { message: errorMsg },
      };
    }
  }
}

/**
 * DeclarativeTool for delegating to the visual agent.
 */
class DelegateToVisualAgentTool extends DeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor(
    private readonly browserManager: BrowserManager,
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      'delegate_to_visual_agent',
      'delegate_to_visual_agent',
      'Delegate a task that requires visual interaction (coordinate-based clicks, complex drag-and-drop) OR visual identification (finding elements by color, layout, or visual appearance not in the AX tree).',
      Kind.Other,
      {
        type: 'object',
        properties: {
          instruction: {
            type: 'string',
            description:
              'Clear instruction for the visual agent (e.g., "Click the blue submit button", "Find the yellow letter").',
          },
        },
        required: ['instruction'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  build(
    params: Record<string, unknown>,
  ): ToolInvocation<Record<string, unknown>, ToolResult> {
    return new DelegateToVisualAgentInvocation(
      this.browserManager,
      this.config,
      params,
      this.messageBus,
    );
  }
}

/**
 * Creates the delegate_to_visual_agent tool for the semantic agent.
 */
export function createDelegateToVisualAgentTool(
  browserManager: BrowserManager,
  config: Config,
  messageBus: MessageBus,
): DelegateToVisualAgentTool {
  return new DelegateToVisualAgentTool(browserManager, config, messageBus);
}
