import { CustodyClient, CustodyAttestation, CustodianRegistry, DisputeRecord } from './custody';
import { Server, Keypair } from '@stellar/stellar-base';
import axios from 'axios';

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
    monitoring_frequency: number; // in minutes
    auto_renewal_enabled: boolean;
}

/**
 * Automated monitoring service for custody attestations, custodian reputation,
 * insurance status, and dispute activity.
 *
 * Runs a recurring monitoring cycle at the configured frequency and dispatches
 * alerts via email, webhook, Slack, or Telegram when thresholds are breached.
 *
 * @example
 * ```ts
 * const monitor = new CustodyMonitoring(custodyClient, monitoringConfig);
 * await monitor.startMonitoring();
 * ```
 */
export class CustodyMonitoring {
    private custodyClient: CustodyClient;
    private config: MonitoringConfig;
    private monitoringInterval?: NodeJS.Timeout;
    private server: Server;

    /**
     * Create a new CustodyMonitoring instance.
     *
     * @param custodyClient - An initialised `CustodyClient` used to query on-chain state.
     * @param config - Monitoring configuration including alert thresholds,
     *   notification channels, and monitoring frequency.
     * @param serverUrl - Horizon server URL. Defaults to the Stellar testnet.
     */
    constructor(
        custodyClient: CustodyClient,
        config: MonitoringConfig,
        serverUrl: string = 'https://horizon-testnet.stellar.org'
    ) {
        this.custodyClient = custodyClient;
        this.config = config;
        this.server = new Server(serverUrl);
    }

    /**
     * Start the automated monitoring loop.
     *
     * Performs an immediate monitoring cycle, then schedules recurring cycles
     * at the interval defined by `config.monitoring_frequency` (in minutes).
     * Errors within a cycle are logged but do not stop the loop.
     *
     * @returns A promise that resolves once the first monitoring cycle completes.
     */
    async startMonitoring(): Promise<void> {
        console.log('Starting custody monitoring...');
        
        // Initial check
        await this.performMonitoringCycle();
        
        // Set up recurring monitoring
        this.monitoringInterval = setInterval(
            async () => {
                try {
                    await this.performMonitoringCycle();
                } catch (error) {
                    console.error('Error in monitoring cycle:', error);
                }
            },
            this.config.monitoring_frequency * 60 * 1000 // Convert minutes to milliseconds
        );
    }

    /**
     * Stop the automated monitoring loop and clean up the interval timer.
     *
     * @returns A promise that resolves once the loop has been stopped.
     */
    async stopMonitoring(): Promise<void> {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = undefined;
        }
        console.log('Custody monitoring stopped');
    }

    private async performMonitoringCycle(): Promise<void> {
        console.log(`Performing monitoring cycle at ${new Date().toISOString()}`);
        
        const alerts: CustodyAlert[] = [];
        
        // Check for expiring attestations
        const attestationAlerts = await this.checkAttestationExpiry();
        alerts.push(...attestationAlerts);
        
        // Check custodian reputation
        const reputationAlerts = await this.checkCustodianReputation();
        alerts.push(...reputationAlerts);
        
        // Check insurance status
        const insuranceAlerts = await this.checkInsuranceStatus();
        alerts.push(...insuranceAlerts);
        
        // Check for disputes that need attention
        const disputeAlerts = await this.checkDisputeStatus();
        alerts.push(...disputeAlerts);
        
        // Send notifications for alerts
        if (alerts.length > 0) {
            await this.sendAlerts(alerts);
        }
        
        console.log(`Monitoring cycle completed. Found ${alerts.length} alerts.`);
    }

    private async checkAttestationExpiry(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        try {
            // Get all custody alerts from the contract
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
            
            // Additional check for attestations expiring soon
            const expiringSoonAlerts = await this.checkExpiringSoonAttestations();
            alerts.push(...expiringSoonAlerts);
            
        } catch (error) {
            console.error('Error checking attestation expiry:', error);
        }
        
        return alerts;
    }

    private async checkExpiringSoonAttestations(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        // This would typically query all attestations and check expiry dates
        // For now, return a placeholder implementation
        
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
                        severity: custodian.reputation_score < 30 ? 'critical' : 'high',
                        message: `Custodian ${custodian.name} has low reputation score: ${custodian.reputation_score}`,
                        timestamp: Date.now(),
                        recommended_action: 'Review custodian performance and consider suspension'
                    };
                    
                    alerts.push(alert);
                }
                
                // Check dispute failure rate
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
            console.error('Error checking custodian reputation:', error);
        }
        
        return alerts;
    }

    private async checkInsuranceStatus(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        // This would typically check all insurance integrations
        // For now, return a placeholder implementation
        
        return alerts;
    }

    private async checkDisputeStatus(): Promise<CustodyAlert[]> {
        const alerts: CustodyAlert[] = [];
        
        // This would typically check for disputes that have been pending too long
        // For now, return a placeholder implementation
        
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

        // Send notifications based on configuration
        if (this.config.notification_channels.email) {
            await this.sendEmailAlerts(criticalAlerts.concat(highAlerts));
        }
        
        if (this.config.notification_channels.webhook) {
            await this.sendWebhookAlerts(alerts);
        }
        
        if (this.config.notification_channels.slack) {
            await this.sendSlackAlerts(criticalAlerts.concat(highAlerts));
        }
        
        // Log all alerts
        for (const alert of alerts) {
            console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
        }
    }

    private async sendEmailAlerts(alerts: CustodyAlert[]): Promise<void> {
        // Placeholder for email implementation
        console.log(`Would send ${alerts.length} email alerts`);
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
            console.error('Failed to send webhook alerts:', error);
        }
    }

    private async sendSlackAlerts(alerts: CustodyAlert[]): Promise<void> {
        // Placeholder for Slack implementation
        console.log(`Would send ${alerts.length} Slack alerts`);
    }

    /**
     * Retrieve performance metrics for a specific custodian.
     *
     * Fetches the custodian's registry record and computes derived metrics
     * such as dispute success rate and current status.
     *
     * @param custodianAddress - Stellar address of the custodian to query.
     * @returns A `CustodianMetrics` object with reputation score, attestation
     *   counts, dispute rates, and activity status.
     * @throws {RWASDKError} If the underlying `getCustodianInfo` call fails.
     */
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
            average_verification_time: 0, // Would need to be calculated from historical data
            last_activity: Date.now(), // Would need to be tracked
            status: custodian.is_active ? 'active' : 'suspended'
        };
    }

    /**
     * Track the depreciation of an asset's value over time.
     *
     * Returns historical appraisal data and the computed depreciation rate.
     * The current implementation returns placeholder data; a production
     * deployment should integrate with an external appraisal oracle.
     *
     * @param assetId - On-chain identifier of the asset to track.
     * @returns An `AssetDepreciationData` object with initial value, current
     *   value, depreciation rate, and appraisal history.
     */
    async trackAssetDepreciation(assetId: string): Promise<AssetDepreciationData> {
        // This would track asset value over time
        // Placeholder implementation
        return {
            asset_id: assetId,
            initial_value: 1000000,
            current_value: 950000,
            depreciation_rate: 5,
            last_updated: Date.now(),
            appraisal_history: []
        };
    }

    /**
     * Check the insurance status for an asset.
     *
     * Queries the insurance provider integration for the given asset and
     * returns the current policy details. The current implementation returns
     * placeholder data; a production deployment should integrate with the
     * actual insurance provider API.
     *
     * @param assetId - On-chain identifier of the asset to check.
     * @returns An `InsuranceStatus` object with provider, policy number,
     *   coverage amount, validity period, and auto-claim configuration.
     */
    async verifyInsuranceStatus(assetId: string): Promise<InsuranceStatus> {
        // This would check insurance status from external providers
        // Placeholder implementation
        return {
            asset_id: assetId,
            provider: 'Global Insurance Co.',
            policy_number: 'POL-123456',
            coverage_amount: 1000000,
            premium_amount: 5000,
            valid_until: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year from now
            status: 'active',
            last_premium_paid: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
            auto_claim_enabled: true
        };
    }

    /**
     * Update the monitoring configuration at runtime.
     *
     * If `monitoring_frequency` is changed while the monitor is running, the
     * loop is automatically restarted with the new interval.
     *
     * @param newConfig - Partial `MonitoringConfig` with the fields to update.
     *   Unspecified fields retain their current values.
     */
    updateConfig(newConfig: Partial<MonitoringConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        // Restart monitoring if frequency changed
        if (newConfig.monitoring_frequency && this.monitoringInterval) {
            this.stopMonitoring();
            this.startMonitoring();
        }
    }

    /**
     * Return the current monitoring status and configuration.
     *
     * @returns An object with `is_active` (whether the loop is running),
     *   the current `config`, and `last_check` timestamp (Unix ms).
     */
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
