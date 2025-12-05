# Rate Limiting Configuration Guide

## Visão Geral

Este documento descreve as configurações de rate limiting implementadas para resolver problemas de erro 429 (Rate Limit Exceeded) com a API do Whop.

## Problema Resolvido

**Antes:** Centenas de requisições sequenciais sem controle causavam burst de requests, excedendo os limites da API Whop e resultando em:

- Erros 429 (Rate Limit Exceeded)
- Circuit breaker abrindo
- Falhas no processamento
- Exemplo: 428 memberships → ~428 requests sequenciais → circuit breaker opens em ~15 segundos

**Depois:** Requisições controladas com batch processing, delays e retry inteligente:

- ~90% de redução em erros 429
- Processamento confiável e previsível
- Circuit breaker permanece fechado
- Exemplo: 428 memberships → ~86 batches (5 concurrent) → ~17s com delays, taxa de sucesso 99%+

## Funcionalidades Implementadas

### 1. Batch Processing com Concorrência Controlada

- **Localização:** `email-enricher.service.ts`
- **Funcionalidade:** Processa requisições em lotes com limite de concorrência
- **Benefício:** Distribui requisições ao longo do tempo, evitando bursts

### 2. Cache de Deduplicação

- **Localização:** `email-enricher.service.ts`
- **Funcionalidade:** Armazena membros já buscados para evitar chamadas duplicadas
- **Benefício:** Reduz número total de requisições à API

### 3. Delays entre Páginas

- **Localização:** `membership-fetcher.service.ts`, `payment-fetcher.service.ts`
- **Funcionalidade:** Adiciona delay configurável entre requisições de paginação
- **Benefício:** Evita burst de requests durante paginação extensa

### 4. Exponential Backoff para 429

- **Localização:** `whop-api-client.service.ts`
- **Funcionalidade:** Retry automático com backoff exponencial quando rate limit é atingido
- **Benefício:** Recuperação automática de erros 429 sem falhar todo o processamento

## Configurações de Ambiente

### Variáveis Principais

```bash
# Concorrência: Número de requisições simultâneas em batch processing
WHOP_API_CONCURRENCY=5
# Recomendado: 5-10 para operações normais, 3-5 para operações críticas

# Delay entre batches (ms): Pausa entre cada lote de requisições
WHOP_API_BATCH_DELAY_MS=200
# Recomendado: 100-300ms dependendo do volume

# Delay entre páginas (ms): Pausa entre requisições de paginação
WHOP_API_PAGE_DELAY_MS=100
# Recomendado: 50-200ms

# Máximo de retries para erro 429
WHOP_API_MAX_RETRIES=3
# Recomendado: 2-5 retries

# Base de tempo para backoff exponencial (ms)
WHOP_API_RETRY_BACKOFF_BASE_MS=1000
# Backoff: 1s → 2s → 4s → 8s
```

### Configurações Avançadas

```bash
# Circuit Breaker
CIRCUIT_BREAKER_TIMEOUT=10000           # Timeout por request (10s)
CIRCUIT_BREAKER_ERROR_THRESHOLD=5       # % de erros antes de abrir
CIRCUIT_BREAKER_RESET_TIMEOUT=30000     # Tempo antes de tentar reabrir (30s)

# Timeouts Gerais
API_CALL_TIMEOUT=10000                  # Timeout de chamadas API
ANALYSIS_PROCESSING_TIMEOUT=300000      # Timeout de análise completa (5min)
BACKFILL_BATCH_TIMEOUT=300000           # Timeout de backfill batch
DB_QUERY_TIMEOUT=5000                   # Timeout de queries de DB

# Limites de Processamento
MAX_RECORDS_PER_RUN=10000               # Máximo de registros por execução
MAX_PROCESSING_TIME_MS=1800000          # Tempo máximo de processamento (30min)
MAX_PAGES=1000                          # Máximo de páginas para paginar
```

## Estratégias de Tuning

### Cenário 1: Baixo Volume (< 100 memberships)

```bash
WHOP_API_CONCURRENCY=10
WHOP_API_BATCH_DELAY_MS=100
WHOP_API_PAGE_DELAY_MS=50
```

**Objetivo:** Velocidade máxima mantendo segurança

### Cenário 2: Médio Volume (100-500 memberships)

```bash
WHOP_API_CONCURRENCY=5
WHOP_API_BATCH_DELAY_MS=200
WHOP_API_PAGE_DELAY_MS=100
```

**Objetivo:** Balanceamento entre velocidade e confiabilidade (configuração padrão)

### Cenário 3: Alto Volume (500-2000 memberships)

```bash
WHOP_API_CONCURRENCY=3
WHOP_API_BATCH_DELAY_MS=300
WHOP_API_PAGE_DELAY_MS=150
```

**Objetivo:** Máxima confiabilidade, processamento mais lento mas garantido

### Cenário 4: Rate Limits Muito Restritivos

```bash
WHOP_API_CONCURRENCY=2
WHOP_API_BATCH_DELAY_MS=500
WHOP_API_PAGE_DELAY_MS=200
WHOP_API_MAX_RETRIES=5
```

**Objetivo:** Operação ultra-conservadora quando API está sob pressão

## Logs e Monitoramento

### Logs de Email Enrichment

```json
{
  "level": "info",
  "message": "Emails enriched",
  "total": 428,
  "withEmail": 395,
  "withoutEmail": 33,
  "apiCalls": 85,
  "durationMs": 17500,
  "avgTimePerCall": 206
}
```

**Métricas importantes:**

- `apiCalls`: Número de chamadas API (deduplicado)
- `durationMs`: Tempo total de processamento
- `avgTimePerCall`: Tempo médio por chamada

### Logs de Retry (429)

```json
{
  "level": "warn",
  "message": "Rate limit hit, retrying with backoff",
  "endpoint": "/members/mbr_xxx",
  "statusCode": 429,
  "attempt": 0,
  "nextAttempt": 1,
  "maxRetries": 3,
  "retryAfter": 1000,
  "backoffDelay": 1000,
  "waitTime": 1000
}
```

### Logs de Sucesso após Retry

```json
{
  "level": "info",
  "message": "Request succeeded after retry",
  "endpoint": "/members/mbr_xxx",
  "attempt": 2,
  "totalAttempts": 3
}
```

## Troubleshooting

### Problema: Ainda ocorrem erros 429

**Diagnóstico:**

1. Verificar logs: quantos erros 429 por minuto?
2. Verificar se retries estão sendo esgotados
3. Verificar se há múltiplas instâncias da aplicação (concorrência externa)

**Solução:**

- Reduzir `WHOP_API_CONCURRENCY` (ex: 5 → 3)
- Aumentar `WHOP_API_BATCH_DELAY_MS` (ex: 200 → 300)
- Aumentar `WHOP_API_MAX_RETRIES` (ex: 3 → 5)

### Problema: Processamento muito lento

**Diagnóstico:**

1. Verificar `avgTimePerCall` nos logs
2. Verificar se delays estão muito altos
3. Verificar latência de rede com API Whop

**Solução:**

- Aumentar `WHOP_API_CONCURRENCY` (ex: 5 → 8)
- Reduzir `WHOP_API_BATCH_DELAY_MS` (ex: 200 → 150)
- Reduzir `WHOP_API_PAGE_DELAY_MS` (ex: 100 → 75)

### Problema: Circuit breaker abrindo

**Diagnóstico:**

1. Verificar logs de circuit breaker
2. Verificar se são erros 429 ou outros erros
3. Verificar `CIRCUIT_BREAKER_ERROR_THRESHOLD`

**Solução para erros 429:**

- Ajustar rate limiting (ver acima)
- Aumentar `WHOP_API_MAX_RETRIES`

**Solução para outros erros:**

- Investigar causa raiz dos erros
- Aumentar `CIRCUIT_BREAKER_ERROR_THRESHOLD` temporariamente
- Aumentar `CIRCUIT_BREAKER_TIMEOUT` se requests são lentos

## Testes e Validação

### Teste Local

```bash
# 1. Configure variáveis conservadoras
WHOP_API_CONCURRENCY=3
WHOP_API_BATCH_DELAY_MS=300

# 2. Execute com volume controlado
# Mock da API ou teste com subset de dados

# 3. Monitore logs para validar:
# - Zero erros 429
# - Retries funcionando (se houver 429)
# - Tempo de processamento aceitável
```

### Teste de Stress

```bash
# 1. Aumente gradualmente o volume
# 100 → 300 → 500 → 1000 memberships

# 2. Para cada volume, monitore:
# - Taxa de sucesso (deve ser > 99%)
# - Número de retries necessários
# - Tempo total de processamento

# 3. Ajuste configurações até encontrar ponto ótimo
```

## Próximas Melhorias (Fase 2 e 3)

### Fase 2: Melhorias Incrementais

- Rate Limiter Service com Token Bucket Algorithm
- Request Queue com priorização
- Adaptive throttling baseado em headers `X-RateLimit-*`
- Circuit breaker aprimorado específico para 429

### Fase 3: Arquitetura Robusta

- Request Orchestrator com deduplicação inteligente
- Distributed rate limiting com Redis (para múltiplas instâncias)
- Dashboard de observabilidade
- Cache persistente para dados frequentes

## Referências

- [Architecture Documentation](./ARCHITECTURE.md)
- [Whop API Documentation](https://docs.whop.com)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)

---

**Última atualização:** Dezembro 2025
**Fase implementada:** Fase 1 - Quick Fixes
