# Taboo Subscriptions Sync

Serviço Back-End (NestJS) para análise, classificação e sincronização de assinaturas vindas da Whop (e futuros provedores).

## 🎯 Abordagem Principal

**Análise via API (Polling Direto)** - Não dependemos de webhooks! O sistema faz queries diretas na API do Whop para identificar:

- ✅ Usuários em trial
- ✅ Conversões (trialing → active)
- ✅ Não conversões (trialing → canceled/expired)
- ✅ Renovações mensais e anuais
- ✅ Primeiros pagamentos

📖 **Veja o fluxo completo em:** [FLUXO.md](./FLUXO.md)

## 🏗️ Arquitetura

O sistema foi projetado para ser **escalável e multi-provedor**:

- **WhopModule**: Contém tudo relacionado ao Whop (análise, backfill, memberships, payments, plans)
- **ConsolidatedModule**: Agrega dados de TODOS os provedores (interface unificada)
- **MetricsModule**: Métricas consolidadas de todos os provedores

Quando adicionar novos provedores (Stripe, PayPal, etc), cada um terá seu próprio módulo com seus próprios memberships, payments e plans, e serão agregados no `ConsolidatedModule`.

📖 **Veja o fluxo completo em:** [FLUXO.md](./FLUXO.md)

## 🛡️ Proteções Anti-Poison Pill Implementadas

Este serviço implementa múltiplas camadas de proteção para evitar falhas em cascata, loops infinitos e sobrecarga do sistema:

### ⚠️ **IMPORTANTE: Análise via API (Polling Direto)**

**NÃO dependemos de webhooks!** O sistema usa **análise direta via API**:

1. **Polling direto na API** - Consulta a API do Whop para obter dados atualizados
2. **Análise inteligente** - Identifica trials, conversões, renovações baseado em dados reais
3. **Reconciliação periódica** - Valida e corrige discrepâncias

Isso garante que sempre temos dados atualizados e confiáveis, sem depender de webhooks que podem falhar.

### 1. Circuit Breaker

- **Localização**: `src/core/circuit-breaker/`
- **Proteção**: Previne chamadas à Whop API quando ela está indisponível
- **Configuração**: Via variáveis de ambiente (`CIRCUIT_BREAKER_*`)
- **Monitoramento**: Estado exposto no healthcheck

### 2. Timeouts

- **Localização**: `src/core/timeout/`
- **Proteção**: Limita tempo máximo de execução de operações
- **Aplicado em**:
  - Análise: 5min
  - Backfill: 30min
  - API calls: 10s
  - DB queries: 5s

### 3. Limites de Processamento

- **Localização**: `src/core/limits/`
- **Proteção**: Previne processamento infinito
- **Limites**:
  - Max records por run: 10.000
  - Max processing time: 30min
  - Max pages: 1.000

### 4. Validação Rigorosa de Payloads

- **Localização**: `src/core/validation/`
- **Proteção**: Rejeita payloads malformados antes de processar
- **Validações**:
  - Estrutura básica
  - Campos obrigatórios
  - Validação com DTOs (class-validator)

### 5. Dead Letter Queue (DLQ)

- **Localização**: `src/core/dlq/`
- **Proteção**: Armazena eventos falhos sem encher o sistema
- **Limites**:
  - Max size: 10.000 eventos
  - Retention: 7 dias
  - Alert threshold: 8.000 eventos
- **Rotação**: Automática de eventos antigos

### 6. Healthcheck Inteligente

- **Localização**: `src/modules/health/`
- **Endpoint**: `GET /api/health`
- **Verifica**:
  - Database connection
  - Whop API (circuit breaker state)
  - Queue size
  - DLQ size
  - Circuit breakers status
  - Memory e disk

### 7. Graceful Degradation

- **Localização**: `src/core/graceful-degradation/`
- **Proteção**: Sistema continua funcionando mesmo com componentes falhando
- **Comportamento**:
  - Se Whop API cair: circuit breaker protege, análise falha gracefully
  - Se DB cair: rejeita novas análises (503) mas não quebra
  - Se queue encher: rejeita novos eventos (503) com retry-after

### 8. Rate Limiting

- **Configuração**: Via `@nestjs/throttler`
- **Limite**: 100 requests/min por endpoint
- **Aplicado em**: Todos os endpoints públicos

### 9. Checkpoint em Jobs Longos

- **Localização**: `src/core/checkpoint/`
- **Proteção**: Permite retomar backfill de onde parou
- **Aplicado em**: Backfill de memberships e payments
- **Salvamento**: A cada batch processado

### 10. Logs e Alertas

- **Logger**: Pino (estruturado)
- **Logs de proteções**: Todas as proteções ativadas são logadas
- **Alertas críticos**:
  - DLQ > 80% do limite
  - Circuit breaker aberto por > 5min
  - Backfill timeout > 3x
  - Queue size > 1000 eventos
  - Taxa de erro em análises > 10%

### 11. Reconciliação Periódica

- **Localização**: `src/modules/whop/services/reconciliation.service.ts`
- **Proteção**: Detecta gaps comparando nosso DB com Whop API (fonte da verdade)
- **Frequência**: Diariamente às 2h (configurável)
- **Endpoint manual**: `POST /api/jobs/reconciliation`
- **O que faz**:
  - Compara memberships do nosso DB com Whop API
  - Compara payments do nosso DB com Whop API
  - Detecta registros faltando
  - Detecta registros desatualizados
  - Sincroniza automaticamente

## 🚀 Instalação

```bash
npm install
```

## ⚙️ Configuração

Copie `.env.example` para `.env` e configure as variáveis:

```bash
cp .env.example .env
```

## 🏃 Execução

```bash
# Desenvolvimento
npm run start:dev

# Produção
npm run build
npm run start:prod
```

## 📡 Endpoints

### Análise (Principal) ⭐

- `GET /api/analysis/memberships?startDate=2024-01-01&endDate=2024-01-31` - Análise completa
- `GET /api/analysis/trials` - Apenas usuários em trial
- `GET /api/analysis/conversions` - Apenas conversões
- `GET /api/analysis/renewals?type=all|monthly|yearly` - Apenas renovações

**Todos retornam emails para exportação!** 📊 Veja: [FLUXO.md](./FLUXO.md)

### Backfill

- `POST /api/jobs/backfill/memberships` - Backfill de memberships
- `POST /api/jobs/backfill/payments` - Backfill de payments

### Reconciliação

- `POST /api/jobs/reconciliation` - Reconciliação manual (detecta gaps)

### Health

- `GET /api/health` - Healthcheck do sistema

## 🔍 Monitoramento

Todas as proteções são monitoradas via:

- Healthcheck endpoint
- Logs estruturados (Pino)
- Métricas de circuit breakers
- Tamanho do DLQ

## 📝 Notas

- As proteções são ativadas automaticamente quando os limites são atingidos
- **Análise via API** garante dados sempre atualizados, sem depender de webhooks
- Backfill pode ser retomado de onde parou usando checkpoints
- **Todos os endpoints de análise retornam emails** para fácil exportação para planilhas
- Reconciliação periódica valida e corrige discrepâncias

## 📊 Análise via API

### Como Funciona

O sistema faz **polling direto na API do Whop** para identificar todos os cenários:

1. **Busca memberships** por status (trialing, active, canceled, expired)
2. **Busca payments** para análise de renovações
3. **Analisa e classifica** cada cenário baseado em dados reais
4. **Retorna emails** junto com os dados para exportação

### Endpoints Disponíveis

- `GET /api/analysis/memberships` - Análise completa com todos os cenários
- `GET /api/analysis/trials` - Apenas trials
- `GET /api/analysis/conversions` - Apenas conversões
- `GET /api/analysis/renewals` - Apenas renovações (mensal/anual)

📖 **Veja o fluxo completo em:** [FLUXO.md](./FLUXO.md)

## 📋 Exportação para Planilha

Todos os endpoints retornam **emails** junto com os dados:

```json
{
  "emails": {
    "usersInTrial": ["user1@email.com", ...],
    "convertedUsers": ["user2@email.com", ...],
    "monthlyRenewals": ["user3@email.com", ...],
    ...
  }
}
```

📖 **Veja o fluxo completo em:** [FLUXO.md](./FLUXO.md)

## 🔄 Reconciliação

### Por que é necessário?

Mesmo com análise via API, a reconciliação serve como validação adicional:

- Detecta gaps que possam ter sido perdidos
- Valida consistência dos dados
- Sincroniza automaticamente

### Como funciona?

1. **Automática**: Executa diariamente às 2h (configurável via `RECONCILIATION_INTERVAL_HOURS`)
2. **Manual**: Via endpoint `POST /api/jobs/reconciliation`
3. **Processo**:
   - Busca memberships/payments da Whop API (fonte da verdade)
   - Compara com nosso DB
   - Detecta gaps (registros faltando)
   - Detecta desatualizações
   - Sincroniza automaticamente

### Configuração

```env
RECONCILIATION_ENABLED=true
RECONCILIATION_INTERVAL_HOURS=24
```
# taboo-subscriptions-sync
