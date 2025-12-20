/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, validateModelOutput } from './test-helper.js';
import { join } from 'node:path';
import { writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';

describe('MCP Image Content', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should successfully handle image content from MCP server', async () => {
    const serverScript = `#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs');

const log = (msg) => fs.appendFileSync('mcp-server.log', msg + '\\n');

log('Server starting...');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  log('RECEIVED: ' + line);
  try {
    const request = JSON.parse(line);
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'image-server', version: '1.0.0' }
        }
      };
      log('SENDING: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{
            name: 'get_image',
            description: 'Returns a tiny 1x1 image',
            inputSchema: { type: 'object', properties: {} }
          }]
        }
      };
      log('SENDING: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/call') {
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            { type: 'text', text: '1x1 image' },
            {
              type: 'image',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
              mimeType: 'image/png'
            }
          ]
        }
      };
      log('SENDING: ' + JSON.stringify(response));
      process.stdout.write(JSON.stringify(response) + '\\n');
    }
  } catch (e) {
    log('ERROR: ' + e.message);
  }
});

// Send initialized notification
const notification = { jsonrpc: '2.0', method: 'initialized' };
log('SENDING NOTIFICATION: ' + JSON.stringify(notification));
process.stdout.write(JSON.stringify(notification) + '\\n');
`;
    const tempFakeResponsesPath = join(
      os.tmpdir(),
      `fake-responses-${Date.now()}.json`,
    );
    const fakeResponses = [
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'image-server__get_image',
                        args: {},
                      },
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'I see the image. It is a 1x1 transparent PNG.',
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
      JSON.stringify({
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Final response after tool description.',
                    },
                  ],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      }),
    ].join('\n');
    writeFileSync(tempFakeResponsesPath, fakeResponses);

    await rig.setup('mcp-image-content', {
      settings: {
        mcpServers: {
          'image-server': {
            command: process.execPath,
            args: ['mcp-server.cjs'], // Placeholder, will be absolute below
            timeout: 5000,
          },
        },
        telemetry: {
          logPrompts: true,
        },
        tools: {
          enableHooks: true,
        },
        allowedTools: ['image-server__get_image'],
        hooks: {
          AfterTool: [
            {
              matcher: 'image-server__get_image',
              hooks: [
                {
                  type: 'command',
                  command: 'echo "{\\"decision\\": \\"allow\\"}"',
                },
              ],
            },
          ],
        },
      },
      fakeResponsesPath: tempFakeResponsesPath,
    });

    const testServerPath = join(rig.testDir!, 'mcp-server.cjs');
    writeFileSync(testServerPath, serverScript);

    if (process.platform !== 'win32') {
      chmodSync(testServerPath, 0o755);
    }

    // Rewrite settings.json with absolute path to the server script
    const settingsPath = join(rig.testDir!, '.gemini', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.mcpServers['image-server'].args = [testServerPath];
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // List files to verify
    const fsFiles = existsSync(rig.testDir!)
      ? readFileSync(testServerPath, 'utf-8')
      : 'DIR_MISSING';
    console.log('Server script content length:', fsFiles.length);

    try {
      const output = await rig.run({
        args: 'Call image-server__get_image and describe what you see.',
        yolo: false,
      });

      const foundToolCall = await rig.waitForToolCall(
        'image-server__get_image',
      );
      expect(
        foundToolCall,
        'Expected to find image-server__get_image tool call',
      ).toBeTruthy();

      // Verify hook logs
      await rig.waitForTelemetryReady();
      const hookLogs = rig.readHookLogs();
      const afterToolLog = hookLogs.find(
        (l) => l.hookCall.hook_event_name === 'AfterTool',
      );
      expect(afterToolLog, 'Expected to find AfterTool hook log').toBeDefined();

      const toolResponse = afterToolLog!.hookCall.hook_input
        .tool_response as Record<string, unknown>;
      expect(toolResponse['llmContent']).toBeDefined();

      // Check for image content in llmContent
      const llmContent = toolResponse['llmContent'] as Array<
        Record<string, unknown>
      >;
      const imagePart = llmContent.find((p) => p['inlineData']);
      expect(
        imagePart,
        'Expected to find image part in llmContent',
      ).toBeDefined();
      const inlineData = imagePart!['inlineData'] as Record<string, string>;
      expect(inlineData['mimeType']).toBe('image/png');
      expect(inlineData['data']).toBe(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      );

      // Verify model output
      validateModelOutput(output, '1x1', 'MCP image test');
    } catch (e) {
      // Print logs for debugging
      const mcpLogPath = join(rig.testDir!, 'mcp-server.log');
      if (existsSync(mcpLogPath)) {
        console.error(
          'MCP Server Log Content:\n',
          readFileSync(mcpLogPath, 'utf-8'),
        );
      } else {
        console.error('MCP Server Log file not found at:', mcpLogPath);
      }
      throw e;
    }
  });
});
