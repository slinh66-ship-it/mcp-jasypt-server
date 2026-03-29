/**
 * MCP stdio server：代理本仓库 Spring Boot 的 Jasypt 接口。
 * 需要 Node.js >= 18（全局 fetch）。
 *
 * 环境变量 JASYPT_API_BASE：API 根路径，默认 http://127.0.0.1:8091/hnair-tools/api
 *
 * Cursor 配置示例（settings.json）：
 * "mcpServers": {
 *   "jasypt-tools": {
 *     "command": "node",
 *     "args": ["D:/code/tools/trunk/devkit/mcp-jasypt-server/index.mjs"],
 *     "env": { "JASYPT_API_BASE": "http://127.0.0.1:8091/hnair-tools/api" }
 *   }
 * }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = (process.env.JASYPT_API_BASE || 'http://127.0.0.1:8091/hnair-tools/api').replace(
  /\/$/,
  '',
)

async function postJasypt(path, body) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  if (!res.ok) {
    const msg = typeof data?.message === 'string' ? data.message : text
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return data
}

const mcpServer = new McpServer({
  name: 'jasypt-tools',
  version: '1.0.0',
})

mcpServer.registerTool(
  'jasypt_encrypt_yaml',
  {
    description:
      '调用后端 Jasypt 对 YAML/文本加密：自动识别 username、password、url、secret、user、account、key、lv 等敏感段名；值为 true/false 不加密。可选 targetKeys、algorithm。',
    inputSchema: {
      content: z.string().describe('原始 YAML 或文本'),
      masterPassword: z.string().describe('Jasypt 密码'),
      algorithm: z
        .string()
        .optional()
        .describe('空则后端默认 PBEWithMD5AndDES；可选 PBEWITHHMACSHA512ANDAES_256'),
      targetKeys: z.array(z.string()).optional().describe('额外要加密的 key 或路径（叶子名或 a.b.c）'),
    },
  },
  async ({ content, masterPassword, algorithm, targetKeys }) => {
    const data = await postJasypt('/jasypt/encrypt-text', {
      content,
      masterPassword,
      algorithm: algorithm || undefined,
      targetKeys: targetKeys?.length ? targetKeys : undefined,
    })
    return {
      content: [{ type: 'text', text: data.output ?? JSON.stringify(data) }],
    }
  },
)

mcpServer.registerTool(
  'jasypt_decrypt_yaml',
  {
    description: '调用后端 Jasypt 解密文本中的 ENC(...) 片段，algorithm 需与加密时一致。',
    inputSchema: {
      content: z.string().describe('含 ENC(...) 的文本'),
      masterPassword: z.string().describe('Jasypt 密码'),
      algorithm: z
        .string()
        .optional()
        .describe('空则后端默认 PBEWithMD5AndDES；需与加密时一致'),
    },
  },
  async ({ content, masterPassword, algorithm }) => {
    const data = await postJasypt('/jasypt/decrypt-text', {
      content,
      masterPassword,
      algorithm: algorithm || undefined,
    })
    return {
      content: [{ type: 'text', text: data.output ?? JSON.stringify(data) }],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
