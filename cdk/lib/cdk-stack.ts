import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecrdeploy from 'cdk-ecr-deployment'
import path = require('path')
import * as dotenv from 'dotenv';
dotenv.config();

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
    // AppImageのDockerイメージをECRにプッシュ
    const appImage = new ecrAssets.DockerImageAsset(this, 'AppImage', {
      directory: path.join(__dirname, '../../app'),
    })
    const appRepository = new ecr.Repository(this, 'AppRepository', {
      repositoryName: 'app-repository',
    })
    new ecrdeploy.ECRDeployment(this, 'AppImageDeployment', {
      src: new ecrdeploy.DockerImageName(appImage.imageUri),
      dest: new ecrdeploy.DockerImageName(appRepository.repositoryUriForTag(process.env.APP_TAG || 'latest')),
    })

    // AdotImageのDockerイメージをECRにプッシュ
    const adotImage = new ecrAssets.DockerImageAsset(this, 'AdotImage', {
      directory: path.join(__dirname, '../../adot'),
    })
    const adotRepository = new ecr.Repository(this, 'AdotRepository', {
      repositoryName: 'adot-repository',
    })
    new ecrdeploy.ECRDeployment(this, 'AdotImageDeployment', {
      src: new ecrdeploy.DockerImageName(adotImage.imageUri),
      dest: new ecrdeploy.DockerImageName(adotRepository.repositoryUriForTag(process.env.ADOT_TAG || 'latest')),
    })

    // ALBを使用したFargateサービスの作成
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      cluster: cluster,
      memoryLimitMiB: 512,
      cpu: 256,
      desiredCount: 1,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(appRepository.repositoryUriForTag(process.env.APP_TAG || 'latest')),
        containerPort: 8080,
        environment: {
          OTEL_TRACES_EXPORTER: 'otlp',
          OTEL_LOGS_EXPORTER: 'otlp',
          OTEL_METRICS_EXPORTER: 'otlp',
          OTEL_PROPAGATORS: 'xray,tracecontext,baggage,b3',
          OTEL_RESOURCE_ATTRIBUTES: 'service.name=dice-server,aws.log.group.names=dice-server',
          OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
          OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://cw-agent:4316/v1/traces',
          OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://adot:4318/v1/logs',
          OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://cw-agent:4316/v1/metrics',
          OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
          OTEL_TRACES_SAMPLER: 'always_on',
          JAVA_TOOL_OPTIONS: '-javaagent:/app/aws-opentelemetry-agent.jar'
        },
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
      path: './dice',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 2,
    });

    // 自動スケーリング設定
    const scaling = fargateService.service.autoScaleTaskCount({
      maxCapacity: 4,
      minCapacity: 1,
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
