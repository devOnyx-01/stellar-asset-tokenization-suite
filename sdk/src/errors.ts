import { ErrorCode } from './types';

export class RWASDKError extends Error {
  public code: ErrorCode;
  public details?: any;

  constructor(code: ErrorCode, message: string, details?: any) {
    super(message);
    this.name = 'RWASDKError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

export class NetworkError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.NETWORK_ERROR, message, details);
  }
}

export class TransactionError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.TRANSACTION_FAILED, message, details);
  }
}

export class InsufficientBalanceError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.INSUFFICIENT_BALANCE, message, details);
  }
}

export class ComplianceError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.COMPLIANCE_FAILED, message, details);
  }
}

export class UnauthorizedError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.UNAUTHORIZED, message, details);
  }
}

export class InvalidParametersError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.INVALID_PARAMETERS, message, details);
  }
}

export class TimeoutError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.TIMEOUT, message, details);
  }
}

export class ContractError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.CONTRACT_ERROR, message, details);
  }
}

export class OracleError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.ORACLE_ERROR, message, details);
  }
}

export class AssetNotFoundError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.ASSET_NOT_FOUND, message, details);
  }
}

export class OrderNotFoundError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.ORDER_NOT_FOUND, message, details);
  }
}

export class DistributionNotFoundError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.DISTRIBUTION_NOT_FOUND, message, details);
  }
}

export class ProofNotFoundError extends RWASDKError {
  constructor(message: string, details?: any) {
    super(ErrorCode.PROOF_NOT_FOUND, message, details);
  }
}
