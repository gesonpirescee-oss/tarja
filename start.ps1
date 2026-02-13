# Script de Inicialização do Projeto Tarja

Write-Host "=== Projeto Tarja - Inicialização ===" -ForegroundColor Cyan
Write-Host ""

# Verificar Node.js
Write-Host "Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Node.js instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "✗ Node.js não encontrado. Instale Node.js 18+ primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se .env existe
Write-Host "`nVerificando arquivo .env..." -ForegroundColor Yellow
if (-not (Test-Path "backend\.env")) {
    Write-Host "⚠ Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "Criando arquivo .env de exemplo..." -ForegroundColor Yellow
    
    $envContent = @"
NODE_ENV=development
PORT=3001
API_VERSION=v1

DATABASE_URL=postgresql://tarja:tarja_dev_password@localhost:5432/tarja_db?schema=public

JWT_SECRET=tarja-dev-secret-key-change-in-production-2024
JWT_REFRESH_SECRET=tarja-dev-refresh-secret-key-change-in-production-2024
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

STORAGE_TYPE=local
STORAGE_LOCAL_PATH=uploads

CORS_ORIGIN=http://localhost:3000

LOG_LEVEL=info
OCR_ENGINE=tesseract
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=application/pdf,image/png,image/jpeg,image/jpg
"@
    
    $envContent | Out-File -FilePath "backend\.env" -Encoding utf8
    Write-Host "✓ Arquivo .env criado em backend\.env" -ForegroundColor Green
    Write-Host "⚠ IMPORTANTE: Ajuste a DATABASE_URL se necessário!" -ForegroundColor Yellow
} else {
    Write-Host "✓ Arquivo .env encontrado" -ForegroundColor Green
}

# Verificar PostgreSQL
Write-Host "`nVerificando PostgreSQL..." -ForegroundColor Yellow
$pgTest = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($pgTest) {
    Write-Host "✓ PostgreSQL parece estar rodando na porta 5432" -ForegroundColor Green
} else {
    Write-Host "⚠ PostgreSQL não encontrado na porta 5432" -ForegroundColor Yellow
    Write-Host "  Você precisa instalar PostgreSQL ou usar Docker" -ForegroundColor Yellow
    Write-Host "  Veja QUICK_START.md para instruções" -ForegroundColor Yellow
}

# Verificar Redis
Write-Host "`nVerificando Redis..." -ForegroundColor Yellow
$redisTest = Test-NetConnection -ComputerName localhost -Port 6379 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($redisTest) {
    Write-Host "✓ Redis parece estar rodando na porta 6379" -ForegroundColor Green
} else {
    Write-Host "⚠ Redis não encontrado na porta 6379" -ForegroundColor Yellow
    Write-Host "  O worker de processamento pode não funcionar sem Redis" -ForegroundColor Yellow
    Write-Host "  Veja QUICK_START.md para instruções" -ForegroundColor Yellow
}

# Verificar dependências
Write-Host "`nVerificando dependências..." -ForegroundColor Yellow
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "⚠ Dependências do backend não instaladas" -ForegroundColor Yellow
    Write-Host "  Execute: cd backend && npm install" -ForegroundColor Yellow
} else {
    Write-Host "✓ Dependências do backend instaladas" -ForegroundColor Green
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "⚠ Dependências do frontend não instaladas" -ForegroundColor Yellow
    Write-Host "  Execute: cd frontend && npm install" -ForegroundColor Yellow
} else {
    Write-Host "✓ Dependências do frontend instaladas" -ForegroundColor Green
}

Write-Host "`n=== Próximos Passos ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure o banco de dados:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   npx prisma migrate dev" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Inicie o backend (Terminal 1):" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Inicie o worker (Terminal 2):" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   npm run worker" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Inicie o frontend (Terminal 3):" -ForegroundColor White
Write-Host "   cd frontend" -ForegroundColor Gray
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Acesse: http://localhost:3000" -ForegroundColor Green
Write-Host ""
