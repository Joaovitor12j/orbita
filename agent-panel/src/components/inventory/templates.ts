import type { EditableKind } from '../../../shared/inventory'

export interface Template {
  id: string
  label: string
  description: string
  body: string
  fields: Record<string, string>
}

export const TEMPLATES: Record<EditableKind, Template[]> = {
  skill: [
    {
      id: 'blank',
      label: 'Em branco',
      description: '',
      body: '# Título\n\n## Quando usar\n\n- \n\n## Passos\n\n1. \n',
      fields: {},
    },
    {
      id: 'workflow',
      label: 'Fluxo passo a passo',
      description: 'Conduz [tarefa] em etapas. Use quando o usuário pedir [situação 1] ou [situação 2].',
      body: '# Fluxo\n\n## Quando usar\n\nUse quando [gatilho]. Não use quando [exceção].\n\n## Passos\n\n1. Entenda o pedido e confirme o que falta.\n2. Execute [ação principal].\n3. Valide o resultado antes de responder.\n\n## Regras\n\n- \n',
      fields: {},
    },
    {
      id: 'reference',
      label: 'Referência de projeto',
      description: 'Convenções e decisões de [projeto/área]. Consulte antes de alterar [parte do código].',
      body: '# Convenções\n\n## Estrutura\n\n- \n\n## Padrões\n\n- \n\n## Armadilhas conhecidas\n\n- \n',
      fields: { 'allowed-tools': 'Read, Grep, Glob' },
    },
  ],
  command: [
    {
      id: 'blank',
      label: 'Em branco',
      description: '',
      body: 'Descreva a tarefa aqui. Use $ARGUMENTS para receber o que vier depois do comando.\n',
      fields: {},
    },
    {
      id: 'review',
      label: 'Revisar um arquivo',
      description: 'Revisa um arquivo e aponta problemas',
      body: 'Revise $ARGUMENTS com foco em correção, legibilidade e riscos.\n\nResponda com:\n\n1. Problemas encontrados (do mais grave ao mais leve)\n2. Sugestão de correção para cada um\n',
      fields: { 'argument-hint': '[arquivo]', 'allowed-tools': 'Read, Grep' },
    },
    {
      id: 'git-summary',
      label: 'Resumo do diff (git)',
      description: 'Resume as mudanças não commitadas',
      body: 'Resuma as mudanças atuais do repositório.\n\n- Status: !`git status --short`\n- Diff: !`git diff HEAD`\n\nExplique em poucas linhas o que mudou e por quê, e aponte qualquer coisa suspeita.\n',
      fields: { 'allowed-tools': 'Bash(git status:*), Bash(git diff:*)' },
    },
  ],
}
