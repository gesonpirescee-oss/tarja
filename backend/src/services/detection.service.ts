import { DetectionType, DetectionRiskLevel } from '@prisma/client';
import { logger } from '../utils/logger';

interface DetectionResult {
  type: DetectionType;
  riskLevel: DetectionRiskLevel;
  confidence: number;
  text: string;
  startIndex: number;
  endIndex: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Regex patterns para detecção
const patterns = {
  CPF: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  RG: /\b\d{1,2}\.?\d{3}\.?\d{3}-?\d{0,2}\b/g,
  CNH: /\b\d{11}\b/g,
  TITLE: /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Título de Eleitor
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b(\(?\d{2}\)?\s?)?(\d{4,5}-?\d{4})\b/g,
  BANK_AGENCY: /\b(ag[êe]ncia|ag\.?)\s*:?\s*(\d{4,5})\b/gi,
  BANK_ACCOUNT: /\b(conta|cc)\s*:?\s*(\d{4,10}(?:-?\d{1,2})?)\b/gi,
  PIX: /\b[A-Za-z0-9]{26,35}\b/g, // Chave PIX (email, CPF, CNPJ, aleatória)
  ADDRESS: /\b(Rua|Av\.|Avenida|Rod\.|Rodovia|Estrada|Praça|Alameda|Travessa|R\.|Av)\s+[A-Za-z0-9\s,]+,\s*\d+[A-Za-z]?\s*(?:-?\s*\d+)?[A-Za-z]?\b/gi,
  CEP: /\b\d{5}-?\d{3}\b/g,
  CREDIT_CARD: /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g,
};

// Validação de CPF
function validateCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(10))) return false;

  return true;
}

// Validação de e-mail
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validação de RG (alguns estados têm dígito verificador)
function validateRG(rg: string): boolean {
  const cleanRG = rg.replace(/\D/g, '');
  
  // RG geralmente tem 7-9 dígitos
  if (cleanRG.length < 7 || cleanRG.length > 9) return false;
  
  // Validação básica: não pode ser todos os dígitos iguais
  if (/^(\d)\1+$/.test(cleanRG)) return false;
  
  // Validação específica para alguns estados (exemplo: SP)
  // SP: 9 dígitos, último é dígito verificador
  if (cleanRG.length === 9) {
    const digits = cleanRG.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += digits[i] * (9 - i);
    }
    const remainder = sum % 11;
    const checkDigit = remainder < 2 ? 0 : 11 - remainder;
    if (checkDigit !== digits[8]) {
      return false; // Falhou validação SP, mas pode ser de outro estado
    }
  }
  
  return true;
}

// Validação de CNH
function validateCNH(cnh: string): boolean {
  const cleanCNH = cnh.replace(/\D/g, '');
  if (cleanCNH.length !== 11) return false;
  
  // Validação básica: não pode ser todos os dígitos iguais
  if (/^(\d)\1+$/.test(cleanCNH)) return false;
  
  // Algoritmo de validação de CNH
  let sum = 0;
  let multiplier = 9;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCNH.charAt(i)) * multiplier;
    multiplier--;
  }
  
  let digit1 = sum % 11;
  if (digit1 >= 10) {
    digit1 = 0;
  }
  
  if (digit1 !== parseInt(cleanCNH.charAt(9))) {
    return false;
  }
  
  sum = 0;
  multiplier = 1;
  
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCNH.charAt(i)) * multiplier;
    multiplier++;
    if (multiplier > 9) multiplier = 1;
  }
  
  let digit2 = sum % 11;
  if (digit2 >= 10) {
    digit2 = 0;
  }
  
  return digit2 === parseInt(cleanCNH.charAt(10));
}

// Validação de Título de Eleitor
function validateTitle(title: string): boolean {
  const cleanTitle = title.replace(/\D/g, '');
  if (cleanTitle.length !== 12) return false;
  
  // Validação básica
  if (/^(\d)\1+$/.test(cleanTitle)) return false;
  
  // Algoritmo de validação
  const digits = cleanTitle.split('').map(Number);
  const stateCode = parseInt(cleanTitle.substring(8, 10));
  
  if (stateCode < 1 || stateCode > 28) return false;
  
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * (i + 2);
  }
  
  const remainder = sum % 11;
  const checkDigit1 = remainder < 2 ? 0 : 11 - remainder;
  
  if (checkDigit1 !== digits[10]) return false;
  
  sum = 0;
  for (let i = 8; i < 10; i++) {
    sum += digits[i] * (i - 6);
  }
  sum += checkDigit1 * 2;
  
  const remainder2 = sum % 11;
  const checkDigit2 = remainder2 < 2 ? 0 : 11 - remainder2;
  
  return checkDigit2 === digits[11];
}

// Validação de CEP
function validateCEP(cep: string): boolean {
  const cleanCEP = cep.replace(/\D/g, '');
  if (cleanCEP.length !== 8) return false;
  
  // CEPs inválidos conhecidos
  const invalidCEPs = ['00000000', '11111111', '22222222', '33333333', '44444444', 
                       '55555555', '66666666', '77777777', '88888888', '99999999'];
  if (invalidCEPs.includes(cleanCEP)) return false;
  
  return true;
}

// Validação de chave PIX
function validatePIX(pix: string): boolean {
  const cleanPIX = pix.replace(/\s/g, '');
  
  // PIX pode ser:
  // - Email (já validado)
  // - CPF/CNPJ (11 ou 14 dígitos)
  // - Telefone (11 dígitos começando com +55)
  // - Chave aleatória (32 caracteres alfanuméricos)
  
  if (cleanPIX.length === 32 && /^[A-Za-z0-9]{32}$/.test(cleanPIX)) {
    return true; // Chave aleatória
  }
  
  if (cleanPIX.length === 11 && /^\d{11}$/.test(cleanPIX)) {
    return validateCPF(cleanPIX); // Pode ser CPF
  }
  
  if (cleanPIX.length === 14 && /^\d{14}$/.test(cleanPIX)) {
    return true; // Pode ser CNPJ (validação simplificada)
  }
  
  if (cleanPIX.includes('@')) {
    return validateEmail(cleanPIX); // Email
  }
  
  return false;
}

export const detectSensitiveData = (text: string): DetectionResult[] => {
  const detections: DetectionResult[] = [];

  // Detectar CPF
  const cpfMatches = text.matchAll(patterns.CPF);
  for (const match of cpfMatches) {
    const cpf = match[0].replace(/\D/g, '');
    if (validateCPF(cpf)) {
      detections.push({
        type: DetectionType.CPF,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 95,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar RG
  const rgMatches = text.matchAll(patterns.RG);
  for (const match of rgMatches) {
    if (validateRG(match[0])) {
      detections.push({
        type: DetectionType.RG,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 90,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar E-mail
  const emailMatches = text.matchAll(patterns.EMAIL);
  for (const match of emailMatches) {
    if (validateEmail(match[0])) {
      detections.push({
        type: DetectionType.EMAIL,
        riskLevel: DetectionRiskLevel.MEDIUM,
        confidence: 90,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Telefone
  const phoneMatches = text.matchAll(patterns.PHONE);
  for (const match of phoneMatches) {
    const phone = match[0].replace(/\D/g, '');
    if (phone.length >= 10 && phone.length <= 11) {
      detections.push({
        type: DetectionType.PHONE,
        riskLevel: DetectionRiskLevel.MEDIUM,
        confidence: 80,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Cartão de Crédito
  const cardMatches = text.matchAll(patterns.CREDIT_CARD);
  for (const match of cardMatches) {
    const cardNumber = match[0].replace(/\D/g, '');
    // Validação de Luhn
    if (cardNumber.length === 16 && validateLuhn(cardNumber)) {
      detections.push({
        type: DetectionType.CREDIT_CARD,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 85,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar CNH
  const cnhMatches = text.matchAll(patterns.CNH);
  for (const match of cnhMatches) {
    if (validateCNH(match[0])) {
      detections.push({
        type: DetectionType.CNH,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 90,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Título de Eleitor
  const titleMatches = text.matchAll(patterns.TITLE);
  for (const match of titleMatches) {
    if (validateTitle(match[0])) {
      detections.push({
        type: DetectionType.TITLE,
        riskLevel: DetectionRiskLevel.MEDIUM,
        confidence: 85,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar CEP
  const cepMatches = text.matchAll(patterns.CEP);
  for (const match of cepMatches) {
    if (validateCEP(match[0])) {
      detections.push({
        type: DetectionType.ADDRESS,
        riskLevel: DetectionRiskLevel.MEDIUM,
        confidence: 70,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Endereços
  const addressMatches = text.matchAll(patterns.ADDRESS);
  for (const match of addressMatches) {
    // Verificar se não é um falso positivo (ex: "Rua A, 123" sem contexto)
    const addressText = match[0];
    if (addressText.length > 10) { // Endereços reais são mais longos
      detections.push({
        type: DetectionType.ADDRESS,
        riskLevel: DetectionRiskLevel.MEDIUM,
        confidence: 75,
        text: addressText,
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + addressText.length
      });
    }
  }

  // Detectar Agência Bancária
  const agencyMatches = text.matchAll(patterns.BANK_AGENCY);
  for (const match of agencyMatches) {
    const agencyNumber = match[2] || match[0].replace(/\D/g, '');
    if (agencyNumber.length >= 4 && agencyNumber.length <= 5) {
      detections.push({
        type: DetectionType.BANK_AGENCY,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 80,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Conta Bancária
  const accountMatches = text.matchAll(patterns.BANK_ACCOUNT);
  for (const match of accountMatches) {
    const accountNumber = match[2] || match[0].replace(/\D/g, '');
    if (accountNumber.length >= 4 && accountNumber.length <= 10) {
      detections.push({
        type: DetectionType.BANK_ACCOUNT,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 80,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  // Detectar Chave PIX
  const pixMatches = text.matchAll(patterns.PIX);
  for (const match of pixMatches) {
    if (validatePIX(match[0])) {
      detections.push({
        type: DetectionType.PIX,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 85,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  logger.info(`Detected ${detections.length} sensitive data items`);

  return detections;
};

// Validação de Luhn (para cartões de crédito)
function validateLuhn(cardNumber: string): boolean {
  let sum = 0;
  let isEven = false;

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber.charAt(i));

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}
