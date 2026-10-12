# Orbita

Painel local para gerenciar subagentes do Claude Code.

## Uso

```bash
npm install
npm run dev
```

Interface em `http://localhost:5173`, API em `http://127.0.0.1:4545`.

Produção local:

```bash
npm run build
npm start
```

Interface e API em `http://127.0.0.1:4545`.

## Como funciona

- Escopo global: `~/.claude/agents/*.md`
- Escopo de projeto: `<projeto>/.claude/agents/*.md` (registre o projeto na barra lateral)
- Desativar um agente renomeia o arquivo para `*.md.disabled`, e o Claude Code deixa de carregá-lo
- Campos de frontmatter desconhecidos são preservados ao editar
- A API escuta apenas em `127.0.0.1` e rejeita origens externas

## Salão 3D

A visão **Salão 3D** (three.js via `@react-three/fiber`) mostra os mesmos agentes, cadeiras e atividade ao vivo do Salão 2D, com câmera livre:

- Botão esquerdo gira, botão direito move, roda do mouse aproxima
- Clique abre o agente, botão direito liga/desliga, arraste até uma cadeira do Conselho
- ◎ segue a atividade; ✦ liga ou desliga o brilho neon (bloom, lembrado entre sessões); ⤢ enquadra o salão inteiro
- Carregado sob demanda (chunk separado); sem WebGL o botão fica desabilitado e o Salão 2D continua disponível
- A lógica de posicionamento é compartilhada com o 2D em `src/components/hall/layout.ts`

## Inventário e harness

Além dos agentes, a barra lateral lista **skills, comandos, hooks, servidores MCP, plugins e regras** (usuário, projeto, plugins e conta claude.ai), com origem, estado e itens sobrescritos. Valores de `env` e `headers` dos MCPs nunca saem do servidor.

- **Skills e comandos** de usuário e projeto podem ser criados, editados e excluídos, com templates e histórico de versões em `~/.config/orbita/history`
- **Harness** é um perfil de sessão (modelo, esforço, permissões, plugins ligados/desligados, skills desligadas, MCPs exclusivos, agentes extras, instruções). O Orbita **só gera o comando**: grava `settings.json`, `mcp.json` (permissão 0600, com as credenciais) e um plugin de agentes em `~/.config/orbita/harnesses/<id>/` e monta o `claude --settings … --mcp-config … --strict-mcp-config --plugin-dir …`. Nenhum arquivo do `~/.claude` ou do projeto é alterado, e o Orbita não executa nada
- O modo de permissão `bypassPermissions` não é oferecido
- **Uso** lê os transcripts em `~/.claude/projects` (somente leitura) e mostra tokens e custo por dia, projeto, modelo, subagente e sessão. Custo e tokens vêm do registro `cost-state` que o próprio Claude Code grava (só em sessões recentes); nas demais os tokens são aproximados a partir das mensagens e o custo fica em branco, pois o Orbita não estima preços. Um cache em `~/.config/orbita/usage-cache.json` evita reler os arquivos

## Atalhos

- `Ctrl K`: buscar
- `Ctrl S`: salvar no editor
- `Esc`: fechar o editor

## Variáveis de ambiente

- `PORT`: porta da API (padrão 4545)
- `ORBITA_HOME`: substitui o diretório home (útil para testes)
