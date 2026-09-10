# Operação — Avisos ESJF

Manual de sobrevivência: o que corre onde, e o que fazer se algo cair.
Última atualização: 2026-09-10.

## 1. Arquitetura (quem faz o quê)

| Peça | Onde corre | Faz o quê |
|---|---|---|
| Site + `/notificacoes` | Vercel (production, `avisos-esjf.vercel.app`) | Lista avisos, subscrições email/push |
| APIs `/api/*` | Vercel serverless (10 functions, limite Hobby = 12!) | avisos, rss, atom, subscribe, unsubscribe, cron, push x3 |
| Cron principal | **cron-job.org** → `GET /api/cron?secret=...` 08–20h, 1h/1h (Europe/Lisbon) | Deteta avisos novos e dispara email + Telegram + Discord + Push |
| Cron backup | Vercel Cron `0 8 * * *` (1x/dia, máx. permitido no Hobby) | Só como rede de segurança |
| Estado (o que já foi enviado) | **Upstash Redis** (`avisos:lastIds`, `avisos:pushSubs`, `avisos:idScheme`) | Sem isto, repete ou falha envios |
| Emails | Resend (domínio `padrehugo.com`, remetente `avisos@padrehugo.com`, Audience `General`) | Confirmações + broadcast |
| Telegram | Bot `@Avisos_ESJF_bot` → canal `@Avisos_ESJF` | Automático via cron |
| Discord | Webhook do servidor Discord | Automático via cron |
| **WhatsApp** | **Servidor próprio da equipa (NÃO é o Vercel). Envio MANUAL por membro da equipa.** | O Vercel **nunca** envia WhatsApp. Não há integração automática. |

> ⚠️ **Nunca** correr `/api/cron?force=true` em produção fora de testes:
> o `force` reenvia os 3 últimos avisos para TODOS os canais.
> O URL do cron-job.org tem de ser só `.../api/cron?secret=SEGREDO`, sem `force`.

## 2. Arrancar sozinho (auto-start)

- **Vercel:** automático, não precisa nada. Deploys seguem o branch `main` do GitHub.
- **cron-job.org:** automático enquanto o job estiver **Habilitado**. Se a conta expirar/suspender, recriar o job com o mesmo URL.
- **Servidor WhatsApp da equipa (Linux):** criar serviço systemd para arrancar no boot:
  ```ini
  # /etc/systemd/system/avisos-whatsapp.service  (ADAPTAR: utilizador, pasta, comando)
  [Unit]
  Description=Avisos ESJF - envio WhatsApp
  After=network-online.target
  Wants=network-online.target

  [Service]
  User=avisos
  WorkingDirectory=/opt/avisos-whatsapp
  ExecStart=/usr/bin/node index.js
  Restart=always
  RestartSec=10
  Environment=NODE_ENV=production

  [Install]
  WantedBy=multi-user.target
  ```
  Ativar: `sudo systemctl enable --now avisos-whatsapp`
  Ver estado: `systemctl status avisos-whatsapp` · Logs: `journalctl -u avisos-whatsapp -f`
- **Alternativa simples (qualquer Linux):** `pm2 start index.js --name avisos-whatsapp && pm2 save && pm2 startup`
- **Windows:** Task Scheduler → tarefa "AvisosWhatsApp" → trigger "At log on" / "At startup".

## 3. Se o servidor WhatsApp for desligado

1. Ligar a máquina (ou pedir a quem gere o hosting).
2. Confirmar que o serviço arrancou: `systemctl status avisos-whatsapp` (ou pm2 `pm2 list`).
3. Se não arrancou: `sudo systemctl start avisos-whatsapp`.
4. Confirmar no canal de WhatsApp que está operacional (mensagem de teste manual).
5. **Não reenviar o histórico:** enviar só novidades a partir desse momento.
   O Vercel **não** reenvia WhatsApps antigos sozinho (não tem acesso ao WhatsApp).

## 4. Se o site/APIs caírem (Vercel)

1. Vercel → projeto `avisos-esjf` → **Deployments**: ver se o último está `READY`.
2. Se `ERROR`: abrir os logs; erros típicos:
   - `exceeded_serverless_functions_per_deployment` → há mais de 12 ficheiros em `api/` (os de `lib/` têm de ficar em `/lib`, na raiz!);
   - cron `*/30` ou `8-20` → o Hobby só aceita **1 cron diário** (manter `0 8 * * *` no `vercel.json`; o horário real vive no cron-job.org).
3. Redeploy: **... → Redeploy** (sem cache se preciso) ou `git commit --allow-empty && git push`.
4. Só **1 deployment em Production** de cada vez; promover com **Promote to Production** se ficar em Preview.

## 5. Duplicados / "recebi 3x a mesma coisa"

1. Ver o URL do job no cron-job.org — **não pode ter `force=true`**.
2. Ver History do job (ligar "Salvar resposta no histórico"): `newCount` deve ser `0` quando não há novidades.
3. Ver estado no Upstash → `GET avisos:lastIds` (REST API): deve ter ~30 IDs (guid `...avisos.php#aviso-...`).
4. Se foi uma migração de esquema de IDs (`avisos:idScheme`), a 1ª execução é silenciosa de propósito.

## 6. Variáveis de ambiente (Vercel → Settings → Environment Variables)

Obrigatórias: `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `EMAIL_FROM` (`Avisos ESJF <avisos@padrehugo.com>`),
`CRON_SECRET` (+ `UNSUBSCRIBE_SECRET` = mesmo valor), `APP_URL` (`https://avisos-esjf.vercel.app`),
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DISCORD_WEBHOOK_URL`.
Opcional: `ADMIN_EMAIL`, `EMAIL_WEBHOOK_URL`, `GEMINI_API_KEY`.
Após mudar vars → **Redeploy** (as functions só leem as novas no próximo deploy).

## 7. WhatsApp via Hermes (OpenCode MCP) — AUTÓNOMO ✅

O envio WhatsApp **não** passa pelo Vercel. É o agente **Hermes** que trata,
em piloto automático (confirmado com ele em 2026-09-10).

- **Quem envia:** Hermes, via script `publicar_avisos.py` corrido pela `cronjob`
  (de hora a hora) no ambiente persistente `gateway`.
- **Como decide:** lê o RSS, compara com o ficheiro de cache `avisos_vistos.txt`
  (histórico do já enviado) e envia **só as novidades** para o canal + grupo.
- **Destinos:**
  - Canal WhatsApp: `https://whatsapp.com/channel/0029Vb9LBduEKyZPVvpx683R`
  - Grupo WhatsApp: gerido pelo Hermes (ID interno por confirmar se preciso).
- **Após desligar/ligar:** o `gateway` arranca sozinho (instalado como serviço),
  a `cronjob` retoma o ciclo horário e o histórico em `avisos_vistos.txt` não se perde.
  Se após reboot prolongado parar: ligar o gateway (`hermes gateway start`) e a cronjob trata do resto.
- **Fonte recomendada:** o feed oficial `https://esjf.edu.pt/feed.php` com
  deduplicação por `guid` (estável; não usar só título/data).
- **Regras anti-duplicados:**
  - Nunca reenviar histórico em massa — o canal já tem subscritores;
  - Testes `?force=true` no Vercel NÃO tocam no WhatsApp (só email/Telegram/Discord/Push);
  - Vercel e Hermes são independentes: cada um tem o seu estado
    (Upstash `avisos:lastIds` vs `avisos_vistos.txt`). Não apagar nenhum dos dois.

## 8. Segredos

Nunca partilhar em chats: `CRON_SECRET`, tokens Vercel/Resend/Telegram/Upstash, webhook Discord.
Se algum vazar: revogar e gerar novo (Vercel Tokens, Resend API keys, @BotFather `/revoke`,
Upstash regenerate, Discord Regenerar webhook) e atualizar Vercel + cron-job.org.
