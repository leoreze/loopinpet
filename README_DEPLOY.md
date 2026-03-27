# LoopinPet MVP 1.0 — GitHub + Render Free

## Estrutura de deploy
- **Frontend** servido pelo Express dentro do backend
- **Backend** Node.js + Express em `backend/`
- **Banco** PostgreSQL externo via `DATABASE_URL`

## 1) GitHub
No diretório raiz do projeto:

```bash
git init
git add .
git commit -m "LoopinPet MVP 1.0"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

## 2) Render Free
### Opção recomendada: Blueprint (`render.yaml`)
1. Suba este projeto para o GitHub
2. No Render, clique em **New +** → **Blueprint**
3. Selecione o repositório
4. Informe as variáveis secretas pedidas
5. Faça o deploy

### Opção manual: Web Service
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`

## 3) Variáveis obrigatórias
Configure no Render:
- `DATABASE_URL`
- `JWT_SECRET`

Variáveis opcionais:
- `OPENAI_API_KEY`
- `WHATSAPP_API_URL`
- `WHATSAPP_API_TOKEN`
- `MERCADO_PAGO_ACCESS_TOKEN`

## 4) URL de acesso
Após o deploy:
- Landing/login SaaS: `/tenant/login`
- Health check: `/api/health`

## 5) Observações importantes
- O plano free do Render entra em idle após período sem acesso
- O disco local do Render é efêmero
- Não faça commit do arquivo `.env`
- Para produção real, prefira banco e storage persistentes
