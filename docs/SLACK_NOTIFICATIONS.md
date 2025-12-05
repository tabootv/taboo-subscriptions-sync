# Slack Notifications

Este documento descreve como configurar notificações de logs críticos no Slack para o serviço Taboo Subscriptions Sync.

## Visão Geral

O sistema envia automaticamente logs de nível **WARN** e **ERROR** para um canal do Slack usando Incoming Webhooks. As mensagens são formatadas com blocos visuais ricos, incluindo:

- 🔴 **Errors**: Erros críticos que requerem atenção imediata
- ⚠️ **Warnings**: Avisos importantes (rate limits, retries, etc)
- 💀 **Fatal**: Erros fatais que causam crash da aplicação

## Configuração do Slack

### Passo 1: Criar um Incoming Webhook

1. Acesse o workspace do Slack onde deseja receber as notificações
2. Vá em **Apps** no menu lateral
3. Busque por **"Incoming Webhooks"**
4. Clique em **"Add to Slack"**
5. Selecione o canal onde deseja receber os logs (ex: `#logs-producao`, `#alertas-sistema`)
6. Clique em **"Add Incoming WebHooks integration"**
7. Copie a **Webhook URL** (formato: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`)

### Passo 2: Configurar a Aplicação

Adicione a Webhook URL no arquivo `.env`:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Importante**: Nunca commite o arquivo `.env` com a URL real. Use variáveis de ambiente no servidor de produção.

### Passo 3: Reiniciar a Aplicação

```bash
npm run start:dev  # Desenvolvimento
# ou
npm run start:prod # Produção
```

A partir deste momento, todos os logs de nível WARN e ERROR serão enviados para o Slack.

## Exemplo de Mensagens

### Warning - Rate Limit

```
⚠️ WARN
━━━━━━━━━━━━━━━━━━━━━━
Message: Rate limit hit, retrying with backoff
Time: 05/12/2025 15:40:42

Endpoint: /members/mber_123ABC
Status: 429

Attempt: 2/3
Wait Time: 10000ms
```

### Error - Circuit Breaker Opened

```
🔴 ERROR
━━━━━━━━━━━━━━━━━━━━━━
Message: Circuit breaker opened
Time: 05/12/2025 15:45:30

Circuit Breaker: whop-api
State: open

Stack Trace:
Error: Too many failures
  at CircuitBreakerService...
```

### Fatal - Application Crash

```
💀 FATAL
━━━━━━━━━━━━━━━━━━━━━━
Message: Unhandled exception
Time: 05/12/2025 16:00:15

Stack Trace:
TypeError: Cannot read property 'data' of undefined
  at WhopApiClient.makeRequest...
```

## Customização

### Alterar o Nível Mínimo de Logs

Por padrão, apenas **WARN** e **ERROR** são enviados. Para alterar isso, edite `src/core/logger/logger.config.ts`:

**Apenas Errors (sem warnings):**

```typescript
const slackTransport = new SlackTransport(
  slackWebhook,
  'error', // Só errors e fatal
);
```

**Incluir Info (mais verboso):**

```typescript
const slackTransport = new SlackTransport(
  slackWebhook,
  'info', // Tudo: info, warn, error, fatal
);
```

### Desabilitar Notificações

Para desabilitar temporariamente sem remover o código:

1. Remova ou comente a variável `SLACK_WEBHOOK_URL` do `.env`
2. Reinicie a aplicação

## Campos Contextuais

As mensagens do Slack incluem informações contextuais automaticamente, quando disponíveis:

| Campo            | Descrição                      | Exemplo             |
| ---------------- | ------------------------------ | ------------------- |
| `endpoint`       | Endpoint da API que falhou     | `/members/mber_123` |
| `statusCode`     | HTTP status code               | `429`, `500`        |
| `circuitBreaker` | Nome do circuit breaker        | `whop-api`          |
| `state`          | Estado do circuit breaker      | `open`, `half_open` |
| `attempt`        | Tentativa atual de retry       | `2/3`               |
| `waitTime`       | Tempo de espera antes do retry | `10000ms`           |
| `stack`          | Stack trace do erro            | Primeiras 500 chars |

## Troubleshooting

### Mensagens não estão sendo enviadas

1. **Verifique a Webhook URL**
   - Confirme que a URL está correta no `.env`
   - Teste a URL manualmente:
     ```bash
     curl -X POST -H 'Content-type: application/json' \
       --data '{"text":"Test message"}' \
       YOUR_WEBHOOK_URL
     ```

2. **Verifique o nível de log**
   - Certifique-se de que há logs de nível WARN ou ERROR sendo gerados
   - Verifique a variável `LOG_LEVEL` no `.env` (deve ser `info` ou menor)

3. **Verifique os logs da aplicação**
   - Se houver erros ao enviar para o Slack, eles aparecerão no console:
     ```
     Failed to send log to Slack: Invalid webhook URL
     ```

### Rate Limit do Slack

O Slack tem limite de **1 mensagem por segundo** por webhook. Se você estiver gerando muitos logs:

1. **Aumente o nível mínimo para `error`** (ignora warnings)
2. **Use agregação de logs** em produção (ex: enviar resumo a cada 5 minutos)
3. **Configure alertas específicos** em vez de todos os logs

### Webhook Inválido

Se o webhook for inválido ou expirar:

1. O erro será logado no console mas **não quebrará a aplicação**
2. Gere um novo webhook no Slack
3. Atualize o `.env` com a nova URL
4. Reinicie a aplicação

## Segurança

### Proteção da Webhook URL

- ✅ **NUNCA** commite a Webhook URL no código
- ✅ Use variáveis de ambiente (`.env` em dev, env vars em prod)
- ✅ Adicione `.env` ao `.gitignore`
- ✅ Rotacione o webhook periodicamente (ex: a cada 6 meses)

### Informações Sensíveis nos Logs

O sistema **não** envia:

- Senhas ou tokens
- Dados de cartão de crédito
- PII (Personally Identifiable Information) não necessária

Se você precisar logar dados sensíveis, adicione sanitização em `slack-transport.ts`:

```typescript
private sanitizeLog(log: any): any {
  const sanitized = { ...log };

  // Remove campos sensíveis
  delete sanitized.password;
  delete sanitized.apiKey;
  delete sanitized.creditCard;

  return sanitized;
}
```

## Performance

### Impacto na Aplicação

- ✅ **Assíncrono**: Não bloqueia o processamento principal
- ✅ **Fail-safe**: Erros ao enviar para Slack não quebram a app
- ✅ **Leve**: ~200 bytes por mensagem
- ✅ **Sem retry**: Se falhar, não tenta novamente (evita loops)

### Monitoramento

Para monitorar o uso das notificações:

1. Verifique o canal do Slack regularmente
2. Configure alertas se houver muitos errors
3. Analise padrões de warnings para identificar problemas recorrentes

## Boas Práticas

### Canais Recomendados

- `#logs-producao`: Logs de produção (apenas errors)
- `#logs-staging`: Logs de staging (errors e warnings)
- `#logs-dev`: Logs de desenvolvimento (opcional, pode ser muito verboso)

### Frequência de Notificações

- **Produção**: Apenas errors críticos
- **Staging**: Errors e warnings importantes
- **Desenvolvimento**: Opcional (pode usar apenas console)

### Ações ao Receber Notificações

1. **🔴 ERROR**: Investigue imediatamente
2. **⚠️ WARN**: Monitore, aja se recorrente
3. **💀 FATAL**: Escale para on-call, investigue urgentemente

## Exemplos de Uso

### Testar Notificações Manualmente

```typescript
import { logger } from './src/core/logger/logger.config';

const log = logger();

// Gera um warning
log.warn({ endpoint: '/test', statusCode: 429 }, 'Test warning message');

// Gera um error
log.error({ circuitBreaker: 'test-cb', state: 'open' }, 'Test error message');
```

### Adicionar Contexto Customizado

```typescript
log.warn(
  {
    endpoint: '/custom-endpoint',
    customField: 'custom value',
    userId: 'user_123',
  },
  'Custom warning with extra fields',
);
```

Os campos customizados aparecerão na mensagem do Slack automaticamente.

## Suporte

Para dúvidas ou problemas:

1. Verifique a [documentação do Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
2. Revise os logs da aplicação para erros específicos
3. Consulte o código fonte em `src/core/logger/slack-transport.ts`

## Changelog

- **2025-12-05**: Implementação inicial com suporte a WARN e ERROR
