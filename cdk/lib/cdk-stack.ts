import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPCの作成
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2, // Default is all AZs in the region
      natGateways: 1, // Number of NAT gateways
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ECSクラスターの作成
    const cluster = new ecs.Cluster(this, 'MyCluster', {
      vpc: vpc,
      containerInsights: true,
    });

    // CloudWatchロググループの作成
    const logGroup = new logs.LogGroup(this, 'ServiceLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ALBを使用したFargateサービスの作成
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      cluster: cluster,
      memoryLimitMiB: 512,
      cpu: 256,
      desiredCount: 2,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
        containerPort: 80,
        logDriver: ecs.LogDrivers.awsLogs({
          logGroup: logGroup,
          streamPrefix: 'ecs-service',
        }),
      },
      assignPublicIp: false,
      publicLoadBalancer: true,
    });

    // ALBのヘルスチェック設定
    fargateService.targetGroup.configureHealthCheck({
      path: '/',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    });

    // 自動スケーリング設定
    const scaling = fargateService.service.autoScaleTaskCount({
      maxCapacity: 4,
      minCapacity: 2,
    });

    // CPU使用率に基づいたスケーリング
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // アウトプットの定義
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: fargateService.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ServiceURL', { value: `http://${fargateService.loadBalancer.loadBalancerDnsName}` });
  }
}
