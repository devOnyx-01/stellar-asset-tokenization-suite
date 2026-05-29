import { Server, TransactionBuilder, Networks, Operation, Asset, Keypair, Account } from '@stellar/stellar-base';
import { Horizon } from '@stellar/stellar-sdk';
import axios from 'axios';
import BigNumber from 'bignumber.js';

export interface CustodyAttestation {
    asset_id: string;
    custodian: string;
    location: string;
    condition: string;
    value: string;
    timestamp: number;
    proof_hash: string;
    verification_type: string;
    insurance_status: string;
    legal_title_hash: string;
    audit_report_hash: string;
    multi_sig_signatures: string[];
    metadata: Record<string, string>;
    is_valid: boolean;
    expires_at: number;
}

export interface CustodianRegistry {
    custodian_address: string;
    name: string;
    jurisdiction: string;
    license_number: string;
    reputation_score: number;
    verification_types: string[];
    is_active: boolean;
    total_attestations: number;
    successful_disputes: number;
    failed_disputes: number;
    bond_required: string;
    insurance_provider: string;
}

export interface DisputeRecord {
    dispute_id: number;
    attestation_id: number;
    challenger: string;
    custodian: string;
    reason: string;
    bond_amount: string;
    evidence_hash: string;
    status: string;
    created_at: number;
    resolved_at: number;
    resolution: string;
    bond_returned: boolean;
    penalty_applied: boolean;
    penalty_amount: string;
}

export interface VerificationTypeConfig {
    verification_type: string;
    required_documents: string[];
    verification_frequency: number;
    multi_sig_required: boolean;
    sig_threshold: number;
    insurance_required: boolean;
    min_insurance_coverage: string;
    iot_monitoring_required: boolean;
    satellite_verification: boolean;
    legal_verification_required: boolean;
}

export interface InsuranceIntegration {
    provider: string;
    policy_number: string;
    coverage_amount: string;
    premium_amount: string;
    valid_until: number;
    claim_auto_trigger: boolean;
    last_premium_paid: number;
    is_active: boolean;
}

export interface CustodianProfile {
    name: string;
    jurisdiction: string;
    license_number: string;
    verification_types: string[];
    bond_required: string;
    insurance_provider: string;
    credentials: {
        professional_license: string;
        insurance_bond: string;
        background_check: string;
        financial_audit: string;
    };
}

export interface ProofData {
    documents: Record<string, string>;
    iot_data?: {
        temperature: number;
        humidity: number;
        location: { lat: number; lng: number };
        motion_detected: boolean;
        timestamp: number;
    };
    satellite_imagery?: {
        image_hash: string;
        coordinates: { lat: number; lng: number };
        timestamp: number;
        verification_type: string;
    };
    legal_verification?: {
        court_filing_hash: string;
        verification_status: string;
        verified_by: string;
        timestamp: number;
    };
    cryptographic_proofs: {
        merkle_root: string;
        merkle_proofs: Record<string, string[]>;
        zk_proof?: string;
        photo_hash: string;
        video_hash: string;
        notary_signature: string;
    };
}

export class CustodyClient {
    private server: Server;
    private contractId: string;
    private networkPassphrase: string;

    constructor(
        contractId: string,
        serverUrl: string = 'https://horizon-testnet.stellar.org',
        networkPassphrase: string = Networks.TESTNET
    ) {
        this.server = new Server(serverUrl);
        this.contractId = contractId;
        this.networkPassphrase = networkPassphrase;
    }

    async registerCustodian(
        signerKeypair: Keypair,
        profile: CustodianProfile
    ): Promise<Horizon.SubmitTransactionResponse> {
        const account = await this.server.loadAccount(signerKeypair.publicKey());
        
        const verificationTypes = profile.verification_types.map(type => 
            new TransactionBuilder(account, { networkPassphrase: this.networkPassphrase, fee: '100' })
                .addOperation(Operation.invokeContractFunction({
                    contract: this.contractId,
                    function: 'register_custodian',
                    args: [
                        ...this.encodeAddress(signerKeypair.publicKey()),
                        ...this.encodeString(profile.name),
                        ...this.encodeString(profile.jurisdiction),
                        ...this.encodeString(profile.license_number),
                        ...this.encodeStringArray(profile.verification_types),
                        ...this.encodeString(profile.bond_required),
                        ...this.encodeString(profile.insurance_provider),
                    ]
                }))
                .setTimeout(30)
                .build()
        );

        const transaction = new TransactionBuilder(account, { 
            networkPassphrase: this.networkPassphrase, 
            fee: '100' 
        })
            .addOperation(Operation.invokeContractFunction({
                contract: this.contractId,
                function: 'register_custodian',
                args: [
                    ...this.encodeAddress(signerKeypair.publicKey()),
                    ...this.encodeString(profile.name),
                    ...this.encodeString(profile.jurisdiction),
                    ...this.encodeString(profile.license_number),
                    ...this.encodeStringArray(profile.verification_types),
                    ...this.encodeString(profile.bond_required),
                    ...this.encodeString(profile.insurance_provider),
                ]
            }))
            .setTimeout(30)
            .build();

        transaction.sign(signerKeypair);
        return await this.server.submitTransaction(transaction);
    }

    async submitAttestation(
        signerKeypair: Keypair,
        assetId: string,
        proofData: ProofData,
        signatures: string[]
    ): Promise<Horizon.SubmitTransactionResponse> {
        const account = await this.server.loadAccount(signerKeypair.publicKey());
        
        const attestation: CustodyAttestation = {
            asset_id: assetId,
            custodian: signerKeypair.publicKey(),
            location: proofData.iot_data?.location ? 
                `${proofData.iot_data.location.lat},${proofData.iot_data.location.lng}` : 
                'unknown',
            condition: 'verified',
            value: '0', // Will be set based on asset type
            timestamp: Date.now(),
            proof_hash: this.calculateProofHash(proofData),
            verification_type: this.determineVerificationType(proofData),
            insurance_status: 'insured',
            legal_title_hash: proofData.legal_verification?.court_filing_hash || '',
            audit_report_hash: proofData.cryptographic_proofs.merkle_root,
            multi_sig_signatures: signatures,
            metadata: this.buildMetadata(proofData),
            is_valid: true,
            expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
        };

        const transaction = new TransactionBuilder(account, { 
            networkPassphrase: this.networkPassphrase, 
            fee: '100' 
        })
            .addOperation(Operation.invokeContractFunction({
                contract: this.contractId,
                function: 'submit_attestation',
                args: [...this.encodeCustodyAttestation(attestation)]
            }))
            .setTimeout(30)
            .build();

        transaction.sign(signerKeypair);
        return await this.server.submitTransaction(transaction);
    }

    async verifyAssetBacking(tokenAddress: string): Promise<{
        is_valid: boolean;
        latest_attestation?: CustodyAttestation;
        alerts: string[];
        insurance_status: string;
    }> {
        try {
            const latestAttestation = await this.getLatestAttestation(tokenAddress);
            const alerts = await this.getCustodyAlerts();
            
            const isValid = latestAttestation ? 
                latestAttestation.is_valid && 
                Date.now() < latestAttestation.expires_at : 
                false;

            const relevantAlerts = alerts
                .filter((entry): entry is [string, string] => {
                  if (!Array.isArray(entry) || entry.length < 2) return false;
                  const [asset] = entry;
                  return asset === tokenAddress;
                })
                .map(([, alert]) => alert);

            return {
                is_valid: isValid,
                latest_attestation: latestAttestation,
                alerts: relevantAlerts,
                insurance_status: latestAttestation?.insurance_status || 'unknown'
            };
        } catch (error) {
            throw new Error(`Failed to verify asset backing: ${error}`);
        }
    }

    async getCustodyHistory(assetId: string): Promise<CustodyAttestation[]> {
        // This would typically query the contract for all attestations
        // For now, return a placeholder implementation
        const attestations: CustodyAttestation[] = [];
        
        // In a real implementation, you would:
        // 1. Query the contract for all attestations related to this asset
        // 2. Sort by timestamp
        // 3. Return the full history
        
        return attestations;
    }

    async initiateDispute(
        signerKeypair: Keypair,
        attestationId: number,
        reason: string,
        bondAmount: string,
        evidenceHash: string
    ): Promise<Horizon.SubmitTransactionResponse> {
        const account = await this.server.loadAccount(signerKeypair.publicKey());
        
        const transaction = new TransactionBuilder(account, { 
            networkPassphrase: this.networkPassphrase, 
            fee: '100' 
        })
            .addOperation(Operation.invokeContractFunction({
                contract: this.contractId,
                function: 'dispute_attestation',
                args: [
                    ...this.encodeNumber(attestationId),
                    ...this.encodeAddress(signerKeypair.publicKey()),
                    ...this.encodeString(reason),
                    ...this.encodeString(bondAmount),
                    ...this.encodeString(evidenceHash),
                ]
            }))
            .setTimeout(30)
            .build();

        transaction.sign(signerKeypair);
        return await this.server.submitTransaction(transaction);
    }

    async getDispute(disputeId: number): Promise<DisputeRecord> {
        // Query the contract for dispute details
        // This is a placeholder implementation
        throw new Error('Not implemented');
    }

    async getCustodianInfo(custodianAddress: string): Promise<CustodianRegistry> {
        // Query the contract for custodian details
        // This is a placeholder implementation
        throw new Error('Not implemented');
    }

    async listActiveCustodians(): Promise<CustodianRegistry[]> {
        // Query the contract for all active custodians
        // This is a placeholder implementation
        throw new Error('Not implemented');
    }

    async getVerificationConfig(verificationType: string): Promise<VerificationTypeConfig> {
        // Query the contract for verification type configuration
        // This is a placeholder implementation
        throw new Error('Not implemented');
    }

    private async getLatestAttestation(assetId: string): Promise<CustodyAttestation | null> {
        // Query the contract for the latest attestation
        // This is a placeholder implementation
        return null;
    }

    private async getCustodyAlerts(): Promise<[string, string][]> {
        // Query the contract for custody alerts
        // This is a placeholder implementation
        return [];
    }

    private calculateProofHash(proofData: ProofData): string {
        // Create a hash from all proof data
        const dataString = JSON.stringify(proofData);
        // In a real implementation, use a proper hash function like SHA-256
        return Buffer.from(dataString).toString('hex').substring(0, 64);
    }

    private determineVerificationType(proofData: ProofData): string {
        // Determine verification type based on provided documents and data
        if (proofData.documents.property_deed) return 'real_estate';
        if (proofData.documents.vault_audit_cert) return 'precious_metals';
        if (proofData.documents.provenance_docs) return 'art_collectibles';
        if (proofData.documents.warehouse_receipt) return 'commodities';
        if (proofData.documents.debtor_confirmation) return 'invoice';
        return 'unknown';
    }

    private buildMetadata(proofData: ProofData): Record<string, string> {
        const metadata: Record<string, string> = {};
        
        if (proofData.iot_data) {
            metadata.iot_monitored = 'true';
            metadata.last_iot_reading = proofData.iot_data.timestamp.toString();
        }
        
        if (proofData.satellite_imagery) {
            metadata.satellite_verified = 'true';
            metadata.satellite_timestamp = proofData.satellite_imagery.timestamp.toString();
        }
        
        if (proofData.legal_verification) {
            metadata.legal_verified = proofData.legal_verification.verification_status;
        }
        
        return metadata;
    }

    // Helper methods for encoding Stellar contract arguments
    private encodeAddress(address: string): Buffer[] {
        if (typeof address !== 'string' || address.length === 0) {
            throw new Error('Invalid address: must be a non-empty string');
        }
        return [Buffer.from(address, 'utf8')];
    }

    private encodeString(str: string): Buffer[] {
        if (typeof str !== 'string') {
            throw new Error('Invalid string: must be a string');
        }
        return [Buffer.from(str, 'utf8')];
    }

    private encodeStringArray(arr: string[]): Buffer[] {
        if (!Array.isArray(arr)) {
            throw new Error('Invalid array: must be an array of strings');
        }
        return [Buffer.from(JSON.stringify(arr), 'utf8')];
    }

    private encodeNumber(num: number): Buffer[] {
        if (typeof num !== 'number' || !Number.isFinite(num)) {
            throw new Error('Invalid number: must be a finite number');
        }
        return [Buffer.from(num.toString(), 'utf8')];
    }

    private encodeCustodyAttestation(attestation: CustodyAttestation): Buffer[] {
        if (!attestation || typeof attestation !== 'object') {
            throw new Error('Invalid attestation: must be an object');
        }
        return [Buffer.from(JSON.stringify(attestation), 'utf8')];
    }
}
