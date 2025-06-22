import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

// Canaryのモックを作成
jest.mock('aws-cdk-lib/aws-synthetics', () => {
  const original = jest.requireActual('aws-cdk-lib/aws-synthetics');
  return {
    ...original,
    Canary: jest.fn().mockImplementation(() => ({
      node: {
        addDependency: jest.fn(),
      },
      canaryName: 'MockCanaryName'
    })),
    Test: {
      custom: jest.fn().mockReturnValue({}),
    },
    Schedule: {
      rate: jest.fn().mockReturnValue({}),
    },
    Runtime: {
      SYNTHETICS_NODEJS_PUPPETEER_9_1: 'SYNTHETICS_NODEJS_PUPPETEER_9_1',
    },
    Code: {
      fromAsset: jest.fn().mockReturnValue({}),
    },
  };
});

describe('CdkStack Resources', () => {
  let template: Template;
  
  beforeAll(() => {
    // テスト用の環境変数を設定
    process.env.APP_TAG = 'test';
    process.env.ADOT_TAG = 'test';
    
    // スタックを作成
    const app = new cdk.App();
    const stack = new Cdk.CdkStack(app, 'MyTestStack');
    template = Template.fromStack(stack);
  });
  
  // VPCリソースのテスト
  test('VPC Created', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });
  
  // ECSクラスターのテスト
  test('ECS Cluster Created', () => {
    template.resourceCountIs('AWS::ECS::Cluster', 1);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterSettings: [
        {
          Name: 'containerInsights',
          Value: 'enabled'
        }
      ]
    });
  });
  
  // Fargateタスク定義のテスト
  test('Fargate Task Definition Created', () => {
    template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      RequiresCompatibilities: ['FARGATE'],
      Cpu: '1024',
      Memory: '2048',
      NetworkMode: 'awsvpc',
      RuntimePlatform: {
        OperatingSystemFamily: 'LINUX',
        CpuArchitecture: 'ARM64'
      }
    });
  });
  
  // ALBのテスト
  test('Application Load Balancer Created', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/healthcheck',
      Port: 80,  // ALBのデフォルトポートは80
      Protocol: 'HTTP',
      HealthCheckPort: '8080'  // ヘルスチェックは8080ポートで行われる
    });
  });
  
  // Canaryテストはモックによりスキップ - Canaryは統合テストで検証する
  test('IAM Role for Canary Created', () => {
    // 最低限、Canary用のIAMロールが存在することを確認
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            }
          })
        ])
      }
    });
  });
  
  // IAMロールのテスト
  test('IAM Roles Created', () => {
    // タスク実行ロールとタスクロール（少なくとも3つのIAMロールが存在するはず）
    const iamRoles = template.findResources('AWS::IAM::Role');
    expect(Object.keys(iamRoles).length).toBeGreaterThanOrEqual(3);
    
    // Application SignalsのPolicyをチェック
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'application-signals:Ingest*'
            ]),
            Effect: 'Allow'
          })
        ])
      }
    });
  });
});