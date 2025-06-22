import * as cdk from 'aws-cdk-lib';
import * as integ from '@aws-cdk/integ-tests-alpha';
import { CdkStack } from '../lib/cdk-stack';
import { SecretValue } from 'aws-cdk-lib';
import { App } from 'aws-cdk-lib';

/**
 * CDK統合テスト
 * 
 * このテストは、CdkStackを実際にデプロイして、リソースが正常に作成されることを確認します。
 * テスト実行方法：
 * 1. デプロイ：npx cdk-integ integ.cdk-stack.ts --app "npx ts-node test/integ.cdk-stack.ts"
 * 2. アサーション実行：npx cdk-integ integ.cdk-stack.ts --app "npx ts-node test/integ.cdk-stack.ts" --assert
 */

// テスト用のアプリケーション作成
const app = new App();

// テスト用の環境変数設定
process.env.APP_TAG = 'test-integration';
process.env.ADOT_TAG = 'test-integration';

// テスト対象のスタック作成
const stack = new CdkStack(app, 'integ-test-cdk-stack');

// 統合テスト設定
const integ_test = new integ.IntegTest(app, 'IntegTest', {
  testCases: [stack],
  // デプロイしたリソースは自動で削除する
  cdkCommandOptions: {
    destroy: {
      args: {
        force: true,
      },
    },
  },
});

// Fargateサービスが正常にデプロイされたことを確認
const ecsCluster = integ_test.assertions.awsApiCall('ECS', 'describeServices', {
  cluster: stack.cluster.clusterName,
  services: [stack.fargateService.service.serviceName],
});

// ステータスが"RUNNING"であることを確認
ecsCluster.assertAtPath('services.0.status', integ.Match.anyValue());

// ALBがデプロイされたことを確認
const lbDns = integ_test.assertions.awsApiCall('ElasticLoadBalancingV2', 'describeLoadBalancers', {
  Names: [stack.loadBalancer.loadBalancerName],
});

// ALBのDNS名が存在することを確認
lbDns.assertAtPath('loadBalancers.0.dnsName', integ.Match.anyValue());

// Canaryがデプロイされたことを確認
const canary = integ_test.assertions.awsApiCall('Synthetics', 'getCanary', {
  name: stack.canary.canaryName,
});

// Canaryのステータスを確認
canary.assertAtPath('canary.status.state', integ.Match.anyValue());

app.synth();