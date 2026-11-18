#!/usr/bin/env bash
# Cria o repositório, as issues da Sprint 1 e o quadro no GitHub Projects.
# Pré-requisito: gh instalado e logado, com escopo de projetos:
#   gh auth login
#   gh auth refresh -s project
# Uso (dentro da pasta do projeto):
#   GRUPO=gXX ./scripts/criar-projeto-github.sh
set -euo pipefail

GRUPO="${GRUPO:-gXX}"
REPO="${GRUPO}-caixa-moradores"
DONO="$(gh api user --jq .login)"

# --- 1. Repositório ---
if [ ! -d .git ]; then git init -b main; fi
git add -A && git commit -m "Projeto inicial: Caixa da Associação de Moradores" || true
gh repo create "$REPO" --public --source=. --remote=origin --push || git push -u origin main

# --- 2. Quadro (GitHub Projects) ---
PROJ_URL="$(gh project create --owner "$DONO" --title "Cloud Challenge ${GRUPO} - Caixa da Associação" --format json --jq .url)"
PROJ_NUM="$(echo "$PROJ_URL" | grep -o '[0-9]*$')"
gh project link "$PROJ_NUM" --owner "$DONO" --repo "$DONO/$REPO" || true

# --- 3. Labels por papel ---
for L in DEV DADOS NUVEM QA; do gh label create "$L" --repo "$DONO/$REPO" --force >/dev/null; done
gh label create "sprint-1" --repo "$DONO/$REPO" --force >/dev/null

# --- 4. Issues da Sprint 1 (papel | título) ---
# Para atribuir responsável, adicione --assignee USUARIO_GITHUB em cada linha,
# ou atribua depois no quadro.
while IFS='|' read -r PAPEL TITULO; do
  URL="$(gh issue create --repo "$DONO/$REPO" --title "$TITULO" --label "$PAPEL,sprint-1" \
        --body "Sprint 1: Persistência. Papel: **$PAPEL**." )"
  gh project item-add "$PROJ_NUM" --owner "$DONO" --url "$URL" >/dev/null
  echo "criada: $TITULO"
done <<'EOF'
NUVEM|Criar repositório com .gitignore (.env) e .env.example
NUVEM|Criar rg-cloud-gXX e o banco (ou receber credencial do Nível B)
NUVEM|Configurar firewall do banco (serviços do Azure + IP atual)
DADOS|Escrever e rodar banco/schema.sql (tabela, CHECKs, índice)
DADOS|Criar usuário de aplicação sem privilégio de admin
DEV|Conexão via DATABASE_URL e GET /health (200 e 503)
DEV|POST /api/despesas com validação no servidor (400)
DEV|GET /api/despesas com filtros de período e categoria
DEV|Interface mínima: formulário e lista
NUVEM|Criar App Service (F1, Node 20) e configurar DATABASE_URL
QA|Prova de persistência GXX-PALAVRA: 4 prints e reinício
QA|Verificação do ponto de controle 2 pelo grupo da ilha
QA|Publicar planejamento no GitHub Projects
EOF

echo
echo "Repositório: https://github.com/$DONO/$REPO"
echo "Quadro:      $PROJ_URL"
