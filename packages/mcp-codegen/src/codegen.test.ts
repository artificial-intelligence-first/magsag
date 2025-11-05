import { describe, expect, it } from 'vitest';
import { generateModules } from './codegen.js';

describe('generateModules', () => {
  it('creates modules for tool specs', () => {
    const files = generateModules({
      specs: [
        {
          sourcePath: 'demo.yaml',
          definition: {
            id: 'demo',
            tools: [
              {
                name: 'demo_tool',
                summary: 'Demo tool',
                input: {
                  type: 'object',
                  required: ['id'],
                  properties: {
                    id: { type: 'string' }
                  }
                },
                output: {
                  type: 'object',
                  properties: {
                    result: { type: 'string' }
                  }
                }
              }
            ]
          }
        }
      ]
    });

    const module = files.find((file) => file.filePath === 'demo/demo-tool.ts');
    expect(module).toBeDefined();
    expect(module?.contents).toContain('export const demoTool = callMcpTool');

    const serverIndex = files.find((file) => file.filePath === 'demo/index.ts');
    expect(serverIndex).toBeDefined();
    expect(serverIndex?.contents).toContain("export { demoTool } from './demo-tool.js';");

    const rootIndex = files.find((file) => file.filePath === 'index.ts');
    expect(rootIndex).toBeDefined();
  });
});
