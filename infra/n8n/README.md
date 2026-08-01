# Backend local de automação — Checkpoint 1

Infraestrutura criada especificamente para o Biz WA Hub. Não usa projetos, templates ou workflows prontos do n8n.

## Serviços

- `n8n`: editor, API e receptor de webhooks, exposto apenas em `127.0.0.1:5678`.
- `n8n-worker`: executa jobs em modo fila.
- `postgres`: banco dedicado ao n8n, sem porta publicada.
- `redis`: fila persistente, sem porta publicada.
- `ollama`: inferência local, sem porta publicada e com modelos persistentes.

PostgreSQL, Redis e Ollama ficam na rede interna `backend`. Apenas n8n e worker também participam da rede `outbound`, necessária para Supabase e provedores opcionais.

## Instalação local

Requisitos: Docker Desktop/Engine com Compose v2 e pelo menos 6 GB livres de memória para o modelo leve.

```bash
cd infra/n8n
cp .env.example .env
```

Substitua todos os valores `change-me`. Exemplos para gerar segredos:

```bash
openssl rand -hex 32
```

Valide e inicie:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
sh scripts/healthcheck.sh
```

Acesse `http://localhost:5678` e crie o proprietário da instância. O arquivo `.env` é ignorado pelo Git.

## Ollama

O modelo não é baixado automaticamente durante reinícios. Após a primeira subida:

```bash
docker compose exec ollama ollama pull llama3.2:3b
```

Máquinas com memória suficiente podem usar:

```bash
docker compose exec ollama ollama pull qwen2.5:7b
```

Confirme os modelos com `docker compose exec ollama ollama list`.

## Supabase remoto durante desenvolvimento

Um Supabase remoto não alcança `localhost`. Para expor temporariamente apenas o n8n:

```bash
cloudflared tunnel --url http://localhost:5678
```

Atualize `N8N_EDITOR_BASE_URL` e `WEBHOOK_URL` com a URL fornecida e recrie `n8n` e `n8n-worker`. Nunca fixe a URL temporária no código.

## Produção

Antes de usar em VPS:

1. configure domínio e proxy reverso com HTTPS;
2. mude `N8N_PROTOCOL=https`, URLs públicas e `N8N_SECURE_COOKIE=true`;
3. mantenha 5678 inacessível diretamente pela internet;
4. restrinja rotas administrativas no proxy;
5. faça backups consistentes de PostgreSQL e dos volumes `n8n_data` e `ollama_data`;
6. monitore `/healthz`, filas, falhas e espaço em disco;
7. atualize imagens somente após revisar breaking changes e testar restauração.

## Backup mínimo

Pare gravações ou use uma ferramenta de backup consistente antes de copiar volumes. Para PostgreSQL:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U n8n -d n8n -Fc > backups/n8n.dump
```

Armazene também uma cópia segura de `N8N_ENCRYPTION_KEY`; sem ela, credenciais restauradas não podem ser decifradas.

## Limites deste checkpoint

Este checkpoint não cria workflows, HMAC, roteamento de IA ou WhatsApp Adapter. Esses itens serão implementados de forma autoral nos próximos checkpoints, após aprovação.
