# Guia de Setup do Projeto Tarja

## Pré-requisitos

- Node.js 18+ LTS
- PostgreSQL 14+
- Redis
- Docker e Docker Compose (opcional, mas recomendado)

## Setup Inicial

### 1. Iniciar Serviços com Docker Compose

```bash
docker-compose up -d
```

Isso iniciará:
- PostgreSQL na porta 5432
- Redis na porta 6379
- MinIO (S3 compatível) na porta 9000 (API) e 9001 (Console)

### 2. Configurar Backend

```bash
cd backend

# Instalar dependências
npm install

# Copiar arquivo de ambiente
# Crie um arquivo .env baseado nas variáveis do .env.example
# (Nota: .env.example pode não existir devido a restrições, mas as variáveis estão documentadas)

# Configurar variáveis de ambiente no .env:
# DATABASE_URL=postgresql://tarja:tarja_dev_password@localhost:5432/tarja_db?schema=public
# JWT_SECRET=your-secret-key
# JWT_REFRESH_SECRET=your-refresh-secret-key
# REDIS_HOST=localhost
# REDIS_PORT=6379

# Executar migrações do Prisma
npx prisma migrate dev
npx prisma generate

# Criar usuário inicial (opcional - via script ou diretamente no banco)
```

### 3. Configurar Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Criar arquivo .env (opcional, padrões funcionam para desenvolvimento)
# VITE_API_URL=http://localhost:3001
# VITE_API_VERSION=v1
```

### 4. Iniciar Aplicação

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Worker (processamento):**
```bash
cd backend
npm run worker
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

## Acessos

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## Criar Usuário Inicial

Você pode criar um usuário inicial de duas formas:

### Opção 1: Via API (após iniciar o backend)

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "senha123",
    "name": "Administrador",
    "role": "ADMIN"
  }'
```

### Opção 2: Via Prisma Studio

```bash
cd backend
npx prisma studio
```

E criar manualmente na interface.

## Estrutura do Projeto

```
tarja/
├── backend/          # API Node.js/Express/TypeScript
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── workers/
│   │   └── utils/
│   └── prisma/
├── frontend/         # SPA React/TypeScript
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── store/
└── docker-compose.yml
```

## Próximos Passos

1. Fazer login no sistema
2. Fazer upload de um documento PDF ou imagem
3. Aguardar processamento (OCR + detecção)
4. Revisar detecções no editor
5. Aplicar tarja

## Troubleshooting

### Erro de conexão com banco de dados
- Verifique se o PostgreSQL está rodando: `docker ps`
- Verifique a DATABASE_URL no .env

### Erro de conexão com Redis
- Verifique se o Redis está rodando: `docker ps`
- Verifique REDIS_HOST e REDIS_PORT no .env

### Erro ao processar documentos
- Verifique se o worker está rodando
- Verifique os logs do worker para erros

### Problemas com OCR
- Tesseract.js requer download de modelos de idioma na primeira execução
- Certifique-se de ter conexão com internet na primeira vez
