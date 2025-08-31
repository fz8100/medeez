#!/usr/bin/env python3
"""
AWS Cost Analysis Script for Medeez SaaS Platform
Analyzes costs, provides recommendations, and generates reports
"""

import json
import boto3
import argparse
import datetime
from decimal import Decimal
from typing import Dict, List, Any
import pandas as pd

class CostAnalyzer:
    def __init__(self, environment: str):
        self.environment = environment
        self.ce_client = boto3.client('ce')
        self.pricing_client = boto3.client('pricing', region_name='us-east-1')
        
    def get_monthly_costs(self, months_back: int = 3) -> Dict[str, Any]:
        """Get monthly costs for the specified environment"""
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=30 * months_back)
        
        try:
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.strftime('%Y-%m-%d'),
                    'End': end_date.strftime('%Y-%m-%d')
                },
                Granularity='MONTHLY',
                Metrics=['UnblendedCost', 'UsageQuantity'],
                GroupBy=[
                    {'Type': 'DIMENSION', 'Key': 'SERVICE'}
                ],
                Filter={
                    'Dimensions': {
                        'Key': 'RESOURCE_ID',
                        'Values': [f'*{self.environment}*'],
                        'MatchOptions': ['CONTAINS']
                    }
                }
            )
            return response
        except Exception as e:
            print(f"Error fetching cost data: {e}")
            return {}
    
    def get_daily_costs(self, days_back: int = 30) -> Dict[str, Any]:
        """Get daily costs for trend analysis"""
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days_back)
        
        try:
            response = self.ce_client.get_cost_and_usage(
                TimePeriod={
                    'Start': start_date.strftime('%Y-%m-%d'),
                    'End': end_date.strftime('%Y-%m-%d')
                },
                Granularity='DAILY',
                Metrics=['UnblendedCost'],
                GroupBy=[
                    {'Type': 'DIMENSION', 'Key': 'SERVICE'}
                ],
                Filter={
                    'Dimensions': {
                        'Key': 'RESOURCE_ID',
                        'Values': [f'*{self.environment}*'],
                        'MatchOptions': ['CONTAINS']
                    }
                }
            )
            return response
        except Exception as e:
            print(f"Error fetching daily cost data: {e}")
            return {}
    
    def get_rightsizing_recommendations(self) -> Dict[str, Any]:
        """Get AWS rightsizing recommendations"""
        try:
            response = self.ce_client.get_rightsizing_recommendation(
                Service='AmazonEC2',
                Configuration={
                    'BenefitsConsidered': True,
                    'RecommendationTarget': 'SAME_INSTANCE_FAMILY'
                }
            )
            return response
        except Exception as e:
            print(f"Error fetching rightsizing recommendations: {e}")
            return {}
    
    def get_reserved_instance_recommendations(self) -> Dict[str, Any]:
        """Get Reserved Instance recommendations"""
        try:
            response = self.ce_client.get_reservation_purchase_recommendation(
                Service='AmazonEC2',
                AccountScope='PAYER',
                LookbackPeriodInDays='SIXTY_DAYS',
                TermInYears='ONE_YEAR',
                PaymentOption='NO_UPFRONT'
            )
            return response
        except Exception as e:
            print(f"Error fetching RI recommendations: {e}")
            return {}
    
    def analyze_costs(self) -> Dict[str, Any]:
        """Perform comprehensive cost analysis"""
        monthly_costs = self.get_monthly_costs()
        daily_costs = self.get_daily_costs()
        
        analysis = {
            'environment': self.environment,
            'timestamp': datetime.datetime.now().isoformat(),
            'monthly_costs': self.process_monthly_costs(monthly_costs),
            'daily_trends': self.process_daily_costs(daily_costs),
            'recommendations': self.generate_recommendations(),
            'cost_optimization': self.get_cost_optimization_opportunities()
        }
        
        return analysis
    
    def process_monthly_costs(self, cost_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process monthly cost data"""
        if not cost_data or 'ResultsByTime' not in cost_data:
            return {}
        
        total_cost = 0
        services = {}
        
        for result in cost_data['ResultsByTime']:
            month = result['TimePeriod']['Start']
            monthly_total = 0
            
            for group in result['Groups']:
                service = group['Keys'][0] if group['Keys'] else 'Unknown'
                cost = float(group['Metrics']['UnblendedCost']['Amount'])
                usage = float(group['Metrics']['UsageQuantity']['Amount'])
                
                if service not in services:
                    services[service] = {'cost': 0, 'usage': 0, 'trend': []}
                
                services[service]['cost'] += cost
                services[service]['usage'] += usage
                services[service]['trend'].append({'month': month, 'cost': cost})
                
                monthly_total += cost
            
            total_cost += monthly_total
        
        # Sort services by cost
        sorted_services = sorted(
            services.items(), 
            key=lambda x: x[1]['cost'], 
            reverse=True
        )
        
        return {
            'total_cost': round(total_cost, 2),
            'services': dict(sorted_services),
            'top_services': [
                {'name': name, 'cost': round(data['cost'], 2)} 
                for name, data in sorted_services[:5]
            ]
        }
    
    def process_daily_costs(self, cost_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process daily cost trends"""
        if not cost_data or 'ResultsByTime' not in cost_data:
            return {}
        
        daily_totals = []
        
        for result in cost_data['ResultsByTime']:
            date = result['TimePeriod']['Start']
            daily_total = 0
            
            for group in result['Groups']:
                cost = float(group['Metrics']['UnblendedCost']['Amount'])
                daily_total += cost
            
            daily_totals.append({
                'date': date,
                'cost': round(daily_total, 2)
            })
        
        # Calculate trend
        if len(daily_totals) >= 7:
            recent_week = sum([d['cost'] for d in daily_totals[-7:]])
            previous_week = sum([d['cost'] for d in daily_totals[-14:-7]])
            trend = 'increasing' if recent_week > previous_week else 'decreasing'
            trend_percentage = ((recent_week - previous_week) / previous_week * 100) if previous_week > 0 else 0
        else:
            trend = 'insufficient_data'
            trend_percentage = 0
        
        return {
            'daily_costs': daily_totals,
            'trend': trend,
            'trend_percentage': round(trend_percentage, 2),
            'avg_daily_cost': round(sum([d['cost'] for d in daily_totals]) / len(daily_totals), 2) if daily_totals else 0
        }
    
    def generate_recommendations(self) -> List[str]:
        """Generate cost optimization recommendations"""
        recommendations = []
        
        # DynamoDB recommendations
        recommendations.extend([
            "Consider using DynamoDB On-Demand for variable workloads",
            "Implement TTL for temporary data to reduce storage costs",
            "Use sparse GSIs to minimize storage and query costs",
            "Compress large text fields before storing in DynamoDB"
        ])
        
        # Lambda recommendations
        recommendations.extend([
            "Right-size Lambda memory allocation based on actual usage",
            "Enable Lambda Provisioned Concurrency only for critical functions",
            "Use ARM-based Graviton2 processors for better price-performance",
            "Implement efficient cold start optimization"
        ])
        
        # S3 recommendations
        recommendations.extend([
            "Enable S3 Intelligent Tiering for automatic cost optimization",
            "Use S3 lifecycle policies to transition to cheaper storage classes",
            "Compress files before uploading to S3",
            "Delete incomplete multipart uploads regularly"
        ])
        
        # CloudFront recommendations
        recommendations.extend([
            "Optimize CloudFront cache hit ratio to reduce origin requests",
            "Use appropriate price class based on user geography",
            "Enable compression for text-based content"
        ])
        
        return recommendations
    
    def get_cost_optimization_opportunities(self) -> Dict[str, Any]:
        """Identify specific cost optimization opportunities"""
        opportunities = {
            'immediate': [
                "Enable S3 Intelligent Tiering",
                "Implement DynamoDB TTL for expired records",
                "Optimize Lambda memory allocation",
                "Clean up unused S3 objects"
            ],
            'short_term': [
                "Implement Reserved Capacity for predictable workloads",
                "Use Spot Instances for non-critical batch processing",
                "Optimize CloudFront caching strategies",
                "Implement cost budgets and alerts"
            ],
            'long_term': [
                "Consider multi-region deployment optimization",
                "Evaluate Savings Plans for compute workloads",
                "Implement automated scaling policies",
                "Regular cost reviews and optimization cycles"
            ]
        }
        
        return opportunities
    
    def calculate_cost_per_doctor(self, total_cost: float, active_doctors: int = None) -> Dict[str, Any]:
        """Calculate cost per doctor metrics"""
        if active_doctors is None:
            # Estimate based on environment
            if self.environment == 'prod':
                active_doctors = 100  # Estimate
            elif self.environment == 'staging':
                active_doctors = 10
            else:
                active_doctors = 5
        
        cost_per_doctor = total_cost / active_doctors if active_doctors > 0 else 0
        target_cost_per_doctor = 50  # $50/month target
        
        return {
            'cost_per_doctor': round(cost_per_doctor, 2),
            'target_cost': target_cost_per_doctor,
            'within_target': cost_per_doctor <= target_cost_per_doctor,
            'variance': round(cost_per_doctor - target_cost_per_doctor, 2),
            'active_doctors': active_doctors
        }
    
    def generate_report(self, output_file: str = None) -> str:
        """Generate comprehensive cost analysis report"""
        analysis = self.analyze_costs()
        
        # Calculate additional metrics
        monthly_data = analysis['monthly_costs']
        total_cost = monthly_data.get('total_cost', 0)
        cost_per_doctor_data = self.calculate_cost_per_doctor(total_cost)
        
        report = {
            'environment': self.environment,
            'analysis_date': datetime.datetime.now().isoformat(),
            'summary': {
                'total_monthly_cost': total_cost,
                'cost_per_doctor': cost_per_doctor_data,
                'top_cost_drivers': monthly_data.get('top_services', []),
                'trend': analysis['daily_trends'].get('trend', 'unknown')
            },
            'detailed_analysis': analysis,
            'action_items': [
                'Review top 3 cost drivers for optimization opportunities',
                'Implement immediate cost optimization recommendations',
                'Set up cost budgets and alerts for early warning',
                'Schedule monthly cost review meetings'
            ]
        }
        
        # Save to file if specified
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(report, f, indent=2)
        
        return json.dumps(report, indent=2)

def main():
    parser = argparse.ArgumentParser(description='AWS Cost Analysis for Medeez')
    parser.add_argument('--environment', required=True, choices=['dev', 'staging', 'prod'],
                       help='Environment to analyze')
    parser.add_argument('--threshold', type=float, default=100,
                       help='Cost threshold for alerts')
    parser.add_argument('--output', help='Output file for report')
    parser.add_argument('--format', choices=['json', 'csv'], default='json',
                       help='Output format')
    
    args = parser.parse_args()
    
    analyzer = CostAnalyzer(args.environment)
    
    if args.format == 'json':
        report = analyzer.generate_report(args.output)
        print(report)
    elif args.format == 'csv':
        # Generate CSV report
        analysis = analyzer.analyze_costs()
        monthly_data = analysis['monthly_costs']
        
        # Create DataFrame for CSV export
        services_data = []
        for service, data in monthly_data.get('services', {}).items():
            services_data.append({
                'service': service,
                'cost': data['cost'],
                'usage': data['usage']
            })
        
        df = pd.DataFrame(services_data)
        if args.output:
            df.to_csv(args.output, index=False)
        else:
            print(df.to_csv(index=False))

if __name__ == '__main__':
    main()