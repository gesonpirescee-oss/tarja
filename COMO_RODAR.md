# 🚀 Como Rodar o Projeto Tarja

## ✅ Status Atual

- ✓ Node.js instalado (v22.18.0)
- ✓ npm instalado (11.5.2)
- ✓ Dependências instaladas (backend e frontend)
- ✓ Arquivo .env criado
- ✗ PostgreSQL: **NÃO INSTALADO** (necessário)
- ✗ Redis: **NÃO INSTALADO** (necessário)

## 📋 Próximos Passos

### 1. Instalar PostgreSQL e Redis

Você tem 3 opções:

#### Opção A: Docker (Mais Fácil) ⭐ RECOMENDADO

1. Instale Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Após instalar, execute:
```powershell
docker compose up -d
```

Isso iniciará automaticamente:
- PostgreSQL na porta 5432
- Redis na porta 6379
- MinIO na porta 9000

#### Opção B: Instalação Manual

**PostgreSQL:**
- Download: https://www.postgresql.org/download/windows/
- Durante instalação, crie usuário `tarja` com senha `tarja_dev_password`
- Crie banco `tarja_db`

**Redis:**
- Download: https://github.com/microsoftarchive/redis/releases
- Ou use Chocolatey: `choco install redis-64`

#### Opção C: Usar Serviços na Nuvem

- PostgreSQL: Supabase, Railway, ou similar
- Redis: Upstash, Redis Cloud, ou similar
- Ajuste as URLs no arquivo `backend/.env`

### 2. Configurar Banco de Dados

Após ter PostgreSQL rodando:

```powershell
cd backend

# Criar banco e usuário (se não existir)
# Conecte-se ao PostgreSQL e execute:
# CREATE DATABASE tarja_db;
# CREATE USER tarja WITH PASSWORD 'tarja_dev_password';
# GRANT ALL PRIVILEGES ON DATABASE tarja_db TO tarja;

# Executar migrações
npx prisma migrate dev

# Gerar cliente Prisma
npx prisma generate
```

### 3. Iniciar Aplicação

Abra **3 terminais** separados:

**Terminal 1 - Backend:**
```powershell
cd C:\dev\tarja\backend
npm run dev
```

**Terminal 2 - Worker (processamento):**
```powershell
cd C:\dev\tarja\backend
npm run worker
```

**Terminal 3 - Frontend:**
```powershell
cd C:\dev\tarja\frontend
npm run dev
```

### 4. Criar Usuário Inicial

Após iniciar o backend, crie um usuário:

**Opção 1: Via PowerShell**
```powershell
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

**Opção 2: Via Prisma Studio**
```powershell
cd backend
npx prisma studio
```
Abra http://localhost:5555 e crie um usuário manualmente na tabela `User`.

### 5. Acessar Aplicação

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/v1/health

## ⚠️ Importante

1. **Sem PostgreSQL**: O sistema não funcionará
2. **Sem Redis**: O worker de processamento não funcionará (mas o backend pode iniciar)
3. **Primeira execução**: Tesseract.js baixará modelos (requer internet)

## 🔧 Troubleshooting

### Erro: "Cannot connect to database"
- Verifique se PostgreSQL está rodando
- Verifique a DATABASE_URL no `backend/.env`
- Teste conexão: `psql -U tarja -d tarja_db`

### Erro: "Cannot connect to Redis"
- Verifique se Redis está rodando
- O worker falhará, mas o backend pode funcionar sem ele

### Erro ao processar documentos
- Certifique-se de que o worker está rodando (Terminal 2)
- Verifique os logs no console

## 📝 Notas

- O arquivo `.env` já foi criado em `backend/.env`
- Storage está configurado para usar filesystem local (pasta `uploads/`)
- Para produção, ajuste as variáveis de ambiente
