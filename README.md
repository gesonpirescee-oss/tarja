# Tarja - Sistema de Tarja de Informações Sensíveis (LGPD)

Aplicação web especializada em identificar e aplicar tarja (redação/ocultação) em dados sensíveis de documentos eletrônicos, com foco em conformidade com a LGPD.

## 🏗️ Arquitetura

- **Frontend**: React 18+ com TypeScript
- **Backend**: Node.js 18+ com Express e TypeScript
- **Banco de Dados**: PostgreSQL 14+
- **ORM**: Prisma
- **Armazenamento**: S3 compatível (MinIO para desenvolvimento)
- **Queue**: BullMQ (Redis)

## 📋 Pré-requisitos

- Node.js 18+ LTS
- PostgreSQL 14+
- Redis (para filas)
- Docker e Docker Compose (opcional, para desenvolvimento)

## 🚀 Início Rápido

### Desenvolvimento Local

1. **Clone o repositório** (se aplicável)

2. **Instale as dependências**:
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

3. **Configure as variáveis de ambiente**:
```bash
# Backend
cp backend/.env.example backend/.env
# Edite backend/.env com suas configurações

# Frontend
cp frontend/.env.example frontend/.env
```

4. **Configure o banco de dados**:
```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

5. **Inicie os serviços**:
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Worker (processamento)
cd backend
npm run worker
```

## 📁 Estrutura do Projeto

```
tarja/
├── backend/          # API Node.js/Express
├── frontend/         # SPA React
├── shared/           # Código compartilhado (tipos, utils)
├── docs/             # Documentação
└── plan.md           # Plano do projeto
```

## 🔐 Segurança

- Autenticação JWT com refresh tokens
- Criptografia AES-256 para arquivos
- RBAC (Role-Based Access Control)
- Validação rigorosa de entrada
- Logs de auditoria imutáveis

## 📊 Conformidade LGPD

- Privacy by Design/Default
- Trilha de auditoria completa
- Políticas de retenção configuráveis
- Atendimento a direitos do titular
- Relatórios de conformidade

## 🧪 Testes

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## 📝 Licença

[Definir licença]

## 👥 Contribuindo

[Instruções de contribuição]
