import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecrdeploy from 'cdk-ecr-deployment';
import * as synthetics from 'aws-cdk-lib/aws-synthetics';
import * as iam from 'aws-cdk-lib/aws-iam';
import path = require('path');
import * as dotenv from 'dotenv';
dotenv.config();

export class CdkStack extends cdk.Stack {
  // 統合テストで使用するためにパブリックプロパティを追加
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;
  public readonly fargateService: ecs_patterns.ApplicationLoadBalancedFargateService;
  public readonly loadBalancer: cdk.aws_elasticloadbalancingv2.ApplicationLoadBalancer;
  public readonly canary: synthetics.Canary;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPCの作成
    this.vpc = new ec2.Vpc(this, 'MyVpc', {
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
    this.cluster = new ecs.Cluster(this, 'MyCluster', {
      vpc: this.vpc,
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

    // タスク実行ロールの作成と権限設定
    const executionRole = new cdk.aws_iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonPrometheusRemoteWriteAccess'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXrayWriteOnlyAccess'),
      ]
    });
    
    // タスクロールの作成と権限設定
    const taskRole = new cdk.aws_iam.Role(this, 'TaskRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXrayWriteOnlyAccess'),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonPrometheusRemoteWriteAccess'),
      ]
    });
    
    // Application SignalsへのアクセスポリシーをIAMロールに追加
    const applicationSignalsPolicy = new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'application-signals:Ingest*',
        'cloudwatch:PutMetricData',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
        'xray:GetSamplingStatisticSummaries'
      ],
      resources: ['*'],
    });
    
    taskRole.addToPrincipalPolicy(applicationSignalsPolicy);
    executionRole.addToPrincipalPolicy(applicationSignalsPolicy);
    
    // タスク定義の作成
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      executionRole: executionRole,
      taskRole: taskRole,
      runtimePlatform: {
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });

    // メインアプリケーションコンテナ
    const appContainer = taskDefinition.addContainer('app', {
      image: ecs.ContainerImage.fromRegistry(appRepository.repositoryUriForTag(process.env.APP_TAG || 'latest')),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: logGroup,
        streamPrefix: 'ecs-app',
      }),
      environment: {
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_LOGS_EXPORTER: 'otlp',
        OTEL_METRICS_EXPORTER: 'otlp',
        OTEL_PROPAGATORS: 'xray,tracecontext,baggage,b3',
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=dice-server,aws.log.group.names=dice-server',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://127.0.0.1:4316/v1/traces',
        // OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:4318/v1/logs',
        OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://127.0.0.1:4316/v1/metrics',
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
        OTEL_TRACES_SAMPLER: 'always_on',
        JAVA_TOOL_OPTIONS: '-javaagent:/app/aws-opentelemetry-agent.jar'
      },
      essential: true,
    });

    appContainer.addPortMappings({
      containerPort: 8080,
      hostPort: 8080,
      protocol: ecs.Protocol.TCP
    });

    // ADOTサイドカーコンテナ
    const adotContainer = taskDefinition.addContainer('adot', {
      image: ecs.ContainerImage.fromRegistry(adotRepository.repositoryUriForTag(process.env.ADOT_TAG || 'latest')),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: logGroup,
        streamPrefix: 'ecs-adot',
      }),
      essential: true,
    });

    // CloudWatch Agentサイドカーコンテナ
    const cwAgentContainer = taskDefinition.addContainer('cw-agent', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest-arm64'),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: logGroup,
        streamPrefix: 'ecs-cw-agent',
      }),
      essential: true,
      environment: {
        CW_CONFIG_CONTENT: JSON.stringify({
          traces: {
            traces_collected: {
              application_signals: {"enabled": true}
            }
          },
          logs: {
            metrics_collected: {
              application_signals: {"enabled": true}
            }
          }
        }),
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=dice-server'
      }
    });
    appContainer.addContainerDependencies({
      container: cwAgentContainer,
      condition: ecs.ContainerDependencyCondition.START
    });
    appContainer.addContainerDependencies({
      container: adotContainer,
      condition: ecs.ContainerDependencyCondition.START
    });

    // ALBを使用したFargateサービスの作成 (カスタムタスク定義を使用)
    this.fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'MyFargateService', {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      publicLoadBalancer: true,
    });

    // LoadBalancerの参照を保存
    this.loadBalancer = this.fargateService.loadBalancer;

    // ALBのヘルスチェック設定
    this.fargateService.targetGroup.configureHealthCheck({
      path: '/healthcheck',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(15),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 4,
      port: '8080',
    });

    // 自動スケーリング設定
    const scaling = this.fargateService.service.autoScaleTaskCount({
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
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: this.fargateService.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ServiceURL', { value: `http://${this.fargateService.loadBalancer.loadBalancerDnsName}` });

    // Canary用のIAMロールを作成
    const canaryRole = new iam.Role(this, 'CanaryRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchSyntheticsFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonPrometheusRemoteWriteAccess')
      ]
    });

    // Application Signals関連の権限を追加
    const applicationSignalsCanaryPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'application-signals:Ingest*',
        'cloudwatch:PutMetricData',
        'synthetics:*',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
        'xray:GetSamplingStatisticSummaries',
        's3:PutObject',
        's3:ListBucket',
      ],
      resources: ['*']
    });

    canaryRole.addToPolicy(applicationSignalsCanaryPolicy);

    // CloudWatch Synthetics Canaryの作成（パブリックアクセス）
    this.canary = new synthetics.Canary(this, 'AppSignalsCanary', {
      schedule: synthetics.Schedule.rate(cdk.Duration.minutes(5)),
      test: synthetics.Test.custom({
        code: synthetics.Code.fromInline('exports.handler = async function () { return "ok"; }'),
        handler: "index.handler",
      }),
      memory: cdk.Size.gibibytes(1),
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_9_1,
      role: canaryRole,
      environmentVariables: {
        URL: `http://${this.fargateService.loadBalancer.loadBalancerDnsName}/rolldice?rolls=12`,
        SERVICE_NAME: 'dice-server',
      },
      startAfterCreation: true,
      activeTracing: true
    });

    // Application Signals統合用の設定
    this.canary.node.addDependency(this.fargateService);
  }
}
