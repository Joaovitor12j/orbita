import { promises as fs } from 'node:fs'
import path from 'node:path'
import { HTTPException } from 'hono/http-exception'
import { readJson } from './inventory/mcp'
import { CLAUDE_DIR } from './store'

// Liga ou desliga um plugin instalado gravando `enabledPlugins` no settings do escopo dele.
// Só mexe nessa chave: o resto do arquivo é preservado e a versão anterior fica em `.orbita.bak`.

interface Installation {
  scope?: string
  projectPath?: string
}

type Settings = Record<string, unknown> & { enabledPlugins?: Record<string, boolean> }

const fail = (status: 400 | 404, message: string): never => {
  throw new HTTPException(status, { message })
}

export interface PluginToggleInput {
  key: string
  enabled: boolean
  /** Só para plugins instalados em escopo de projeto. */
  projectPath?: string
}

// Entre `settings.json` e `settings.local.json`, escreve onde a chave já aparece por último
// (a camada que vence na leitura); sem registro anterior, usa `settings.json`.
async function targetFile(dir: string, key: string) {
  const shared = path.join(dir, 'settings.json')
  const local = path.join(dir, 'settings.local.json')
  const localSettings = await readJson<Settings>(local)
  return localSettings?.enabledPlugins && key in localSettings.enabledPlugins ? local : shared
}

export async function setPluginEnabled(input: PluginToggleInput): Promise<{ path: string }> {
  if (typeof input.enabled !== 'boolean') fail(400, 'Estado inválido')
  const registry = await readJson<{ plugins?: Record<string, Installation[]> }>(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'))
  const installs = registry?.plugins?.[input.key]
  if (!installs?.length) return fail(404, 'Plugin não está instalado')

  const install = input.projectPath
    ? installs.find((i) => i.scope === 'project' && i.projectPath === input.projectPath)
    : installs.find((i) => i.scope !== 'project')
  if (!install) return fail(404, 'Instalação não encontrada para este escopo')

  const dir = install.scope === 'project' ? path.join(install.projectPath!, '.claude') : CLAUDE_DIR
  const file = await targetFile(dir, input.key)
  const raw = await fs.readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : fail(400, `Não foi possível ler ${path.basename(file)}`)))

  let settings: Settings = {}
  if (raw !== null && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      settings = parsed as Settings
    } catch {
      return fail(400, `${path.basename(file)} não é um JSON válido: corrija o arquivo antes de alterar plugins`)
    }
  }
  if (settings.enabledPlugins !== undefined && (typeof settings.enabledPlugins !== 'object' || settings.enabledPlugins === null || Array.isArray(settings.enabledPlugins))) {
    fail(400, '`enabledPlugins` está em formato inesperado')
  }

  settings.enabledPlugins = { ...settings.enabledPlugins, [input.key]: input.enabled }

  await fs.mkdir(path.dirname(file), { recursive: true })
  if (raw !== null) await fs.writeFile(`${file}.orbita.bak`, raw)
  const temp = `${file}.orbita-${process.pid}.tmp`
  await fs.writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`)
  await fs.rename(temp, file)
  return { path: file }
}
