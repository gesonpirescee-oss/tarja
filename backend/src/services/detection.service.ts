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
  RG: /\b\d{1,2}\.?\d{3}\.?\d{3}-?\d{1}\b/g,
  CNH: /\b\d{11}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  PHONE: /\b(\(?\d{2}\)?\s?)?(\d{4,5}-?\d{4})\b/g,
  BANK_ACCOUNT: /\b\d{4,10}\b/g, // Simplificado
  CREDIT_CARD: /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g,
  PIX: /\b[A-Za-z0-9]{32}\b/g, // Simplificado
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
    detections.push({
      type: DetectionType.RG,
      riskLevel: DetectionRiskLevel.HIGH,
      confidence: 85,
      text: match[0],
      startIndex: match.index || 0,
      endIndex: (match.index || 0) + match[0].length
    });
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
    // Validação básica de Luhn
    if (cardNumber.length === 16) {
      detections.push({
        type: DetectionType.CREDIT_CARD,
        riskLevel: DetectionRiskLevel.HIGH,
        confidence: 75,
        text: match[0],
        startIndex: match.index || 0,
        endIndex: (match.index || 0) + match[0].length
      });
    }
  }

  logger.info(`Detected ${detections.length} sensitive data items`);

  return detections;
};
