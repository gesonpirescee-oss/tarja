# Guia Rápido para Rodar o Projeto

## ⚠️ Pré-requisitos Necessários

Para rodar o projeto, você precisa de:

1. **PostgreSQL 14+** (banco de dados)
2. **Redis** (para filas de processamento)

### Opções para Instalar:

#### Opção 1: Docker (Recomendado)
```powershell
# Instalar Docker Desktop para Windows
# Download: https://www.docker.com/products/docker-desktop/

# Depois de instalar:
docker compose up -d
```

#### Opção 2: Instalação Local

**PostgreSQL:**
- Download: https://www.postgresql.org/download/windows/
- Ou usar Chocolatey: `choco install postgresql`

**Redis:**
- Download: https://github.com/microsoftarchive/redis/releases
- Ou usar Chocolatey: `choco install redis-64`

## 🚀 Passos para Rodar

### 1. Criar arquivo .env no backend

Crie o arquivo `backend/.env` com o seguinte conteúdo:

```env
NODE_ENV=development
PORT=3001
API_VERSION=v1

# Database - Ajuste conforme sua instalação
DATABASE_URL=postgresql://tarja:tarja_dev_password@localhost:5432/tarja_db?schema=public

# JWT
JWT_SECRET=tarja-dev-secret-key-change-in-production-2024
JWT_REFRESH_SECRET=tarja-dev-refresh-secret-key-change-in-production-2024
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Storage (usar local para desenvolvimento)
STORAGE_TYPE=local
STORAGE_LOCAL_PATH=uploads

# CORS
CORS_ORIGIN=http://localhost:3000

LOG_LEVEL=info
OCR_ENGINE=tesseract
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=application/pdf,image/png,image/jpeg,image/jpg
```

### 2. Configurar Banco de Dados

```powershell
# Criar banco de dados (se não existir)
# Conecte-se ao PostgreSQL e execute:
# CREATE DATABASE tarja_db;
# CREATE USER tarja WITH PASSWORD 'tarja_dev_password';
# GRANT ALL PRIVILEGES ON DATABASE tarja_db TO tarja;

# No diretório backend:
cd backend
npx prisma migrate dev
npx prisma generate
```

### 3. Iniciar Serviços

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Worker (processamento):**
```powershell
cd backend
npm run worker
```

**Terminal 3 - Frontend:**
```powershell
cd frontend
npm run dev
```

### 4. Criar Usuário Inicial

Após iniciar o backend, crie um usuário:

```powershell
# Via PowerShell (Invoke-WebRequest)
$body = @{
    email = "admin@example.com"
    password = "senha123"
    name = "Administrador"
    role = "ADMIN"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/v1/auth/register" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

Ou use o Prisma Studio:
```powershell
cd backend
npx prisma studio
```

## 🌐 Acessos

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/v1/health

## ⚠️ Notas Importantes

1. **Sem PostgreSQL/Redis**: O sistema não funcionará completamente sem esses serviços
2. **Primeira execução**: O Tesseract.js baixará modelos de idioma na primeira vez (requer internet)
3. **Storage**: Está configurado para usar filesystem local (uploads/)

## 🔧 Troubleshooting

### Erro de conexão com banco
- Verifique se PostgreSQL está rodando
- Verifique a DATABASE_URL no .env
- Certifique-se de que o banco e usuário existem

### Erro de conexão com Redis
- O worker pode falhar sem Redis
- Para desenvolvimento básico, você pode comentar temporariamente o uso de filas

### Erro ao processar documentos
- Certifique-se de que o worker está rodando
- Verifique os logs no console
