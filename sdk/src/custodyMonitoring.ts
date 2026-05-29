import { CustodyClient, CustodyAttestation, CustodianRegistry, DisputeRecord } from './custody';
import { Server, Keypair } from '@stellar/stellar-base';
import axios from 'axios';
import { REPUTATION_SCORE_LOW_THRESHOLD, YEAR_IN_MILLISECONDS, MONTH_IN_MILLISECONDS, DAY_IN_MILLISECONDS, MILLISECONDS_PER_MINUTE } from './constants';
import { createLogger, Logger } from './logger';

export interface CustodyAlert {
    asset_id: string;
    alert_type: 'attestation_expired' | 'attestation_expiring_soon' | 'invalid_attestation' | 'custodian_reputation_low' | 'insurance_lapsed';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: number;
    recommended_action: string;
}

export interface CustodianMetrics {
    custodian_address: string;
    name: string;
    reputation_score: number;
    total_attestations: number;
    successful_disputes: number;
    failed_disputes: number;
    dispute_success_rate: number;
    average_verification_time: number;
    last_activity: number;
    status: 'active' | 'suspended' | 'under_review';
}

export interface AssetDepreciationData {
    asset_id: string;
    initial_value: number;
    current_value: number;
    depreciation_rate: number;
    last_updated: number;
    appraisal_history: Array<{
        timestamp: number;
        value: number;
        appraiser: string;
        method: string;
    }>;
}

export interface InsuranceStatus {
    asset_id: string;
    provider: string;
    policy_number: string;
    coverage_amount: number;
    premium_amount: number;
    valid_until: number;
    status: 'active' | 'expired' | 'lapsed' | 'claim_pending';
    last_premium_paid: number;
    auto_claim_enabled: boolean;
}

export interface MonitoringConfig {
    alert_thresholds: {
        attestation_expiry_warning_days: number;
        minimum_reputation_score: number;
        insurance_expiry_warning_days: number;
        max_dispute_failure_rate: number;
    };
    notification_channels: {
        email?: string[];
        webhook?: string;
        telegram?: string;
        slack?: string;
    };
    monitoring_frequency: number;
    auto_renewal_enabled: boolean;
}

export class CustodyMonitoring {
    private custodyClient: CustodyClient;
    private config: MonitoringConfig;
    private monitoringInterval?: NodeJS.Timeout;
    private server: Server;
    private logger: Logger;

    constructor(
        custodyClient: CustodyClient,
        config: MonitoringConfig,
        serverUrl: string = 'https://horizon-testnet.stellar.org'
    ) {
        this.custodyClient = custodyClient;
        this.config = config;
        this.server = new Server(serverUrl);
        this.logger = createLogger('CustodyMonitoring');
    }

    async startMonitoring(): Promise<void> {
        this.logger.info('Starting custody monitoring...');
        
        await this.performMonitoringCycle();
        
        this.monitoringInterval = setInterval(
            async () => {
                try {
                    await this.performMonitoringCycle();
                } catch (error) {
                    this.logger.error('Error in monitoring cycle:', { error });
                }
            },
            this.config.monitoring_frequency * MILLISECONDS_PER_MINUTE
        );
    }

    async stopMonitoring(): Promise<void> {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        this.logger.info('Custody monitoring stopped');
    }

    private async performMonitoringCycle(): Promise<void> {
        this.logger.info(`Performing monitoring cycle at ${new Date().toISOString()}`);
        
        const alerts: CustodyAlert[] = [];
        
        const attestationAlerts = await this.checkAttestationExpiry();
        alerts.push(...attestationAlerts);
        
        const reputationAlerts = await this.checkCustodianReputation();
        alerts.push(...reputationAlerts);
        
        const insuranceAlerts = await this.checkInsuranceStatus();
        alerts.push(...insuranceAlerts);
        
        const disputeAlerts = await this.checkDisputeStatus();
        alerts.push(...disputeAlerts);
        
        if (alerts.length > 0) {
            await this.sendAlerts(alerts);
        }
        
        this.logger.info(`Monitoring cycle completed. Found ${alerts.length} alerts.`);
    }

    private async checkAttestationExpiry(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        try {
            const contractAlerts = await this.custodyClient['getCustodyAlerts']();
            
            for (const [assetId, alertType] of contractAlerts) {
                const validTypes = ['attestation_expired', 'attestation_expiring_soon', 'invalid_attestation', 'custodian_reputation_low', 'insurance_lapsed'] as const;
            const safeAlertType: CustodyAlert['alert_type'] = validTypes.includes(alertType as any)
              ? (alertType as CustodyAlert['alert_type'])
              : 'invalid_attestation';

            const alert: CustodyAlert = {
                    asset_id: assetId,
                    alert_type: safeAlertType,
                    severity: this.determineAlertSeverity(alertType),
                    message: this.generateAlertMessage(alertType, assetId),
                    timestamp: Date.now(),
                    recommended_action: this.getRecommendedAction(alertType)
                };
                
                alerts.push(alert);
            }
            
            const expiringSoonAlerts = await this.checkExpiringSoonAttestations();
            alerts.push(...expiringSoonAlerts);
            
        } catch (error) {
            this.logger.error('Error checking attestation expiry:', { error });
        }
        
        return alerts;
    }

    private async checkExpiringSoonAttestations(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        return alerts;
    }

    private async checkCustodianReputation(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        try {
            const custodians = await this.custodyClient.listActiveCustodians();
            
            for (const custodian of custodians) {
                if (custodian.reputation_score < this.config.alert_thresholds.minimum_reputation_score) {
                    const alert: CustodyAlert = {
                        asset_id: custodian.custodian_address,
                        alert_type: 'custodian_reputation_low',
                        severity: custodian.reputation_score < REPUTATION_SCORE_LOW_THRESHOLD ? 'critical' : 'high',
                        message: `Custodian ${custodian.name} has low reputation score: ${custodian.reputation_score}`,
                        timestamp: Date.now(),
                        recommended_action: 'Review custodian performance and consider suspension'
                    };
                    
                    alerts.push(alert);
                }
                
                const totalDisputes = custodian.successful_disputes + custodian.failed_disputes;
                if (totalDisputes > 0) {
                    const failureRate = custodian.failed_disputes / totalDisputes;
                    if (failureRate > this.config.alert_thresholds.max_dispute_failure_rate) {
                        const alert: CustodyAlert = {
                            asset_id: custodian.custodian_address,
                            alert_type: 'custodian_reputation_low',
                            severity: 'high',
                            message: `Custodian ${custodian.name} has high dispute failure rate: ${(failureRate * 100).toFixed(1)}%`,
                            timestamp: Date.now(),
                            recommended_action: 'Investigate dispute patterns and provide additional training'
                        };
                        
                        alerts.push(alert);
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error checking custodian reputation:', { error });
        }
        
        return alerts;
    }

    private async checkInsuranceStatus(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        return alerts;
    }

    private async checkDisputeStatus(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        return alerts;
    }

    private determineAlertSeverity(alertType: string): 'low' | 'medium' | 'high' | 'critical' {
        switch (alertType) {
            case 'attestation_expiring_soon':
                return 'medium';
            case 'attestation_expired':
            case 'insurance_lapsed':
                return 'high';
            case 'invalid_attestation':
                return 'critical';
            case 'custodian_reputation_low':
                return 'high';
            default:
                return 'medium';
        }
    }

    private generateAlertMessage(alertType: string, assetId: string): string {
        switch (alertType) {
            case 'attestation_expiring_soon':
                return `Attestation for asset ${assetId} is expiring soon`;
            case 'attestation_expired':
                return `Attestation for asset ${assetId} has expired`;
            case 'invalid_attestation':
                return `Invalid attestation detected for asset ${assetId}`;
            case 'insurance_lapsed':
                return `Insurance has lapsed for asset ${assetId}`;
            default:
                return `Alert for asset ${assetId}: ${alertType}`;
        }
    }

    private getRecommendedAction(alertType: string): string {
        switch (alertType) {
            case 'attestation_expiring_soon':
                return 'Submit a new attestation before the current one expires';
            case 'attestation_expired':
                return 'Submit a new attestation immediately to restore asset backing';
            case 'invalid_attestation':
                return 'Investigate the attestation issue and submit a corrected version';
            case 'insurance_lapsed':
                return 'Renew insurance policy immediately';
            case 'custodian_reputation_low':
                return 'Review custodian performance and consider additional oversight';
            default:
                return 'Review the alert and take appropriate action';
        }
    }

    private async sendAlerts(alerts: CustodyAlert[]): Promise<void> {
        const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
        const highAlerts = alerts.filter(alert => alert.severity === 'high');
        const mediumAlerts = alerts.filter(alert => alert.severity === 'medium');
        const lowAlerts = alerts.filter(alert => alert.severity === 'low');

        if (this.config.notification_channels.email) {
            await this.sendEmailAlerts(criticalAlerts.concat(highAlerts));
        }
        
        if (this.config.notification_channels.webhook) {
            await this.sendWebhookAlerts(alerts);
        }
        
        if (this.config.notification_channels.slack) {
            await this.sendSlackAlerts(criticalAlerts.concat(highAlerts));
        }
        
        for (const alert of alerts) {
            this.logger.info(`[${alert.severity.toUpperCase()}] ${alert.message}`);
        }
    }

    private async sendEmailAlerts(alerts: CustodyAlert[]): Promise<void> {
        this.logger.info(`Would send ${alerts.length} email alerts`);
    }

    private async sendWebhookAlerts(alerts: CustodyAlert[]): Promise<void> {
        if (!this.config.notification_channels.webhook) return;
        
        try {
            await axios.post(this.config.notification_channels.webhook, {
                alerts,
                timestamp: Date.now(),
                source: 'custody-monitoring'
            });
        } catch (error) {
            this.logger.error('Failed to send webhook alerts:', { error });
        }
    }

    private async sendSlackAlerts(alerts: CustodyAlert[]): Promise<void> {
        this.logger.info(`Would send ${alerts.length} Slack alerts`);
    }

    async getCustodianMetrics(custodianAddress: string): Promise<CustodianMetrics> {
        const custodian = await this.custodyClient.getCustodianInfo(custodianAddress);
        
        const totalDisputes = custodian.successful_disputes + custodian.failed_disputes;
        const disputeSuccessRate = totalDisputes > 0 ? 
            (custodian.successful_disputes / totalDisputes) * 100 : 100;
        
        return {
            custodian_address: custodian.custodian_address,
            name: custodian.name,
            reputation_score: custodian.reputation_score,
            total_attestations: custodian.total_attestations,
            successful_disputes: custodian.successful_disputes,
            failed_disputes: custodian.failed_disputes,
            dispute_success_rate: disputeSuccessRate,
            average_verification_time: 0,
            last_activity: Date.now(),
            status: custodian.is_active ? 'active' : 'suspended'
        };
    }

    async trackAssetDepreciation(assetId: string): Promise<AssetDepreciationData> {
        return {
            asset_id: assetId,
            initial_value: 1000000,
            current_value: 950000,
            depreciation_rate: 5,
            last_updated: Date.now(),
            appraisal_history: []
        };
    }

    async verifyInsuranceStatus(assetId: string): Promise<InsuranceStatus> {
        return {
            asset_id: assetId,
            provider: 'Global Insurance Co.',
            policy_number: 'POL-123456',
            coverage_amount: 1000000,
            premium_amount: 5000,
            valid_until: Date.now() + YEAR_IN_MILLISECONDS,
            status: 'active',
            last_premium_paid: Date.now() - MONTH_IN_MILLISECONDS,
            auto_claim_enabled: true
        };
    }

    updateConfig(newConfig: Partial<MonitoringConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        if (newConfig.monitoring_frequency && this.monitoringInterval) {
            this.stopMonitoring();
            this.startMonitoring();
        }
    }

    getMonitoringStatus(): {
        is_active: boolean;
        config: MonitoringConfig;
        last_check: number;
    } {
        return {
            is_active: !!this.monitoringInterval,
            config: this.config,
            last_check: Date.now()
        };
    }
}
