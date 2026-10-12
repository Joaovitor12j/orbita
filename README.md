# Órbita

**Um painel local para ver e controlar tudo o que molda o seu [Claude Code](https://claude.com/claude-code):** agentes, skills, comandos, hooks, servidores MCP, plugins, regras, sessões em andamento e consumo de tokens, tudo numa interface só.

O Claude Code guarda a configuração espalhada em muitos lugares: `~/.claude`, `.claude/` de cada projeto, `~/.claude.json`, plugins instalados, conectores da conta claude.ai. Com o tempo fica difícil responder perguntas simples: *qual skill está valendo neste projeto? esse MCP vem de onde? por que esse comando não carrega? quanto eu gastei esta semana?* O Órbita lê tudo isso, mostra em um lugar e permite editar o que é seguro editar.

> Roda **somente na sua máquina**, escuta apenas em `127.0.0.1` e não envia nada para fora. Não é um produto da Anthropic nem tem relação oficial com ela.

## O que ele faz

| Seção | O que mostra e o que permite |
| --- | --- |
| **Agentes** | Cria, edita, copia, liga/desliga e exclui subagentes (`~/.claude/agents` e `<projeto>/.claude/agents`). Visões em lista, **Salão 2D** e **Salão 3D** (three.js) com atividade ao vivo. |
| **Skills e comandos** | Lista os de usuário, projeto, plugins e conta. Os de usuário e projeto podem ser criados, editados e excluídos, com validação, templates e **histórico de versões** com restauração. |
| **Hooks, MCPs e regras** | Inventário somente leitura, com origem, estado e itens sobrescritos por outro escopo. MCPs repetidos (plugin + conector) viram uma linha só. Segredos são ocultados. |
| **Plugins** | Lista com versão, escopo e o que cada um traz. Permite **ligar e desligar** plugins instalados (grava `enabledPlugins` no `settings.json` do escopo). Instalar e remover continua sendo pelo próprio Claude Code. |
| **Harness** | Perfis de sessão (modelo, esforço, permissões, plugins, skills desligadas, MCPs exclusivos, agentes extras, instruções). O Órbita **só gera o comando** `claude …` para você copiar. |
| **Sessões** | Monitor somente leitura das sessões do Claude Code em andamento e em segundo plano: estado, projeto, custo e atividade recente. |
| **Uso** | Tokens e custo por dia, projeto, modelo, subagente e sessão, lidos dos transcripts locais. |

## Instalação

Requisitos: **Node.js 22.12+** (ou 20.19+) e o Claude Code instalado (o comando `claude` no `PATH` só é necessário para a seção Sessões).

```bash
git clone https://github.com/Joaovitor12j/orbita.git
cd orbita/agent-panel
npm install
```

Desenvolvimento (interface em `http://localhost:5173`, API em `http://127.0.0.1:4545`):

```bash
npm run dev
```

Uso normal (interface e API em `http://127.0.0.1:4545`):

```bash
npm run build
npm start
```

Registre seus projetos na barra lateral para que o Órbita leia e edite o `.claude/` de cada um. Projetos que o Claude Code já abriu aparecem como sugestão.

### Variáveis de ambiente

| Variável | Efeito |
| --- | --- |
| `PORT` | Porta da API (padrão `4545`). |
| `ORBITA_HOME` | Substitui o diretório home. Útil para testar contra uma cópia de `~/.claude` sem tocar na sua. |
| `ORBITA_CLAUDE_BIN` | Caminho do executável `claude` (padrão: `claude` no `PATH`). |

### Atalhos

`Ctrl K` busca · `Ctrl S` salva no editor · `Esc` fecha o editor.

## Como funciona

Servidor [Hono](https://hono.dev) (Node + TypeScript) que lê os arquivos do Claude Code e expõe uma API JSON, e interface React + Vite. O tipo compartilhado entre os dois fica em `shared/`.

```
agent-panel/
  server/    API: leitura do inventário, edição, harness, sessões, uso
  shared/    tipos usados pelo servidor e pela interface
  src/       interface React (inclui o Salão 2D/3D)
sandbox/     agentes de exemplo para experimentar (use com ORBITA_HOME ou registre como projeto)
```

O que é lido e onde:

- Agentes, skills e comandos: `~/.claude/{agents,skills,commands}` e `<projeto>/.claude/…`
- Plugins: `~/.claude/plugins/installed_plugins.json` e a pasta de instalação de cada um
- MCPs e projetos conhecidos: `~/.claude.json`, `.mcp.json`, plugins
- Sessões: saída de `claude agents --json --all` e o fim do transcript de cada sessão
- Uso: transcripts em `~/.claude/projects` (somente leitura). Custo e tokens vêm do registro que o próprio Claude Code grava; o Órbita não estima preços.

O que ele escreve:

| Ação | Onde escreve |
| --- | --- |
| Editar agentes | `~/.claude/agents` ou `<projeto>/.claude/agents`. Desligar um agente renomeia para `*.md.disabled`. |
| Editar skills e comandos | Só as pastas `skills/` e `commands/` de usuário e projeto, nunca as de plugins. Versões anteriores em `~/.config/orbita/history`. |
| Ligar/desligar plugin | Chave `enabledPlugins` do `settings.json` (ou `settings.local.json`, se a chave já estiver lá) do escopo do plugin. O resto do arquivo é preservado e o anterior fica em `*.orbita.bak`. Vale para as próximas sessões. |
| Harness | Só `~/.config/orbita/harnesses/`. Nenhum arquivo do `~/.claude` ou do projeto é alterado e o Órbita **não executa** o comando gerado. |
| Preferências do próprio Órbita | `~/.config/orbita/` (projetos registrados, posição das cadeiras, cache de uso). |

## Segurança e privacidade

O Órbita lê arquivos sensíveis (transcripts de conversa, configurações de MCP com credenciais). Por isso:

- **Só local.** O servidor escuta em `127.0.0.1`, recusa requisições cujo `Host` não seja o endereço local (proteção contra *DNS rebinding*) e recusa origens externas. Escritas exigem `Content-Type: application/json`, o que impede formulários de outros sites. As respostas trazem `X-Frame-Options: DENY` para impedir que outro site o embuta numa página.
- **Não exponha na rede.** Não há autenticação. Não troque o `hostname` para `0.0.0.0`, não publique a porta e não coloque um proxy reverso na frente sem adicionar autenticação.
- **Segredos nunca vão para o navegador.** Valores de `env` e `headers` dos MCPs são ocultados no servidor; argumentos, URLs e comandos de hook passam por um filtro que esconde chaves, tokens e senhas. Esse filtro é **por heurística**: um segredo escrito num formato incomum pode passar. Revise antes de compartilhar capturas de tela.
- **Conteúdo de skills, comandos, regras e transcripts é exibido como está.** A seção Sessões mostra trechos recentes das conversas; trate a tela como informação sensível.
- **Credenciais só no harness, e só em disco.** O `mcp.json` gerado por um harness contém as credenciais reais dos MCPs escolhidos (o Claude Code precisa delas). Ele fica em `~/.config/orbita/harnesses/<id>/` com permissão `0600`, e a pasta com `0700`. O modo de permissão `bypassPermissions` não é oferecido.
- **Escrita restrita.** Toda escrita valida o caminho: só entram arquivos dentro das pastas esperadas dos escopos registrados, com nomes validados. Plugins só podem ser ligados/desligados se estiverem em `installed_plugins.json`.
- **Sem shell.** O único processo que o Órbita inicia é `claude agents --json --all` / `claude logs <id>`, via `execFile` com argumentos fixos e `id` validado.
- **Fontes do Google.** `index.html` carrega as fontes Inter e JetBrains Mono do Google Fonts, então o navegador contata o Google ao abrir a interface. Para uso 100% offline, hospede as fontes localmente.

Encontrou uma falha? Abra uma *issue* sem detalhes sensíveis ou, se for grave, entre em contato com o mantenedor antes de divulgar.

## Estado do projeto

Projeto pessoal em evolução (versão 0.x). Instalar e remover plugins e iniciar ou parar sessões ainda não são suportados: hoje o Órbita mostra os comandos para você executar.

Comandos úteis: `npm run typecheck` (checagem de tipos) e `npm run build` (typecheck + build).
