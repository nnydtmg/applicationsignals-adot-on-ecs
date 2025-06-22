import * as cdk from 'aws-cdk-lib';
import * as integ from '@aws-cdk/integ-tests-alpha';
import * as assertions from 'aws-cdk-lib/assertions';
import * as http from 'http';
import * as https from 'https';
import { CdkStack } from '../lib/cdk-stack';

/**
 * アプリケーションシグナルの統合テスト
 * 
 * このテストでは、アプリケーションが正常にデプロイされた後、
 * Application Signalsが正しく構成され、テレメトリーデータを送信していることを確認します。
 * 
 * テスト実行方法：
 * 1. デプロイ：npx cdk-integ integ.application-signals.ts --app "npx ts-node test/integ.application-signals.ts"
 * 2. アサーション実行：npx cdk-integ integ.application-signals.ts --app "npx ts-node test/integ.application-signals.ts" --assert
 */

// テスト用のアプリケーション作成
const app = new cdk.App();

// テスト用の環境変数設定
process.env.APP_TAG = 'app-signals-test';
process.env.ADOT_TAG = 'adot-signals-test';

// テスト対象のスタック作成
const stack = new CdkStack(app, 'app-signals-test-stack');

// 統合テスト設定
const integ_test = new integ.IntegTest(app, 'ApplicationSignalsIntegTest', {
  testCases: [stack],
  cdkCommandOptions: {
    destroy: {
      args: {
        force: true,
      },
    },
  },
});

// アプリケーションエンドポイントに対するリクエスト送信関数
async function makeHttpRequest(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to request ${url}, status code: ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// ECSサービスが正常に実行されているか確認
const ecsService = integ_test.assertions.awsApiCall('ECS', 'describeServices', {
  cluster: stack.cluster.clusterName,
  services: [stack.fargateService.service.serviceName],
});

ecsService.assertAtPath('services.0.runningCount', 1);

// ALBのDNS名を取得
const albDetails = integ_test.assertions.awsApiCall('ElasticLoadBalancingV2', 'describeLoadBalancers', {
  LoadBalancerArns: [stack.loadBalancer.loadBalancerArn],
});

// ヘルスチェックエンドポイントにリクエストを送信して正常応答を確認するステップ
// 注意: 実際の統合テストでは、ALBのDNS名を使用して直接アプリケーションにリクエストを
// 送信することもできますが、ここではAWSのAPIを使ってリソースの状態を確認しています。

// Application Signalsのメトリクスを確認 - CloudWatchメトリクスが作成されているか
const appSignalsMetrics = integ_test.assertions.awsApiCall('CloudWatch', 'listMetrics', {
  Namespace: 'AWS/ApplicationSignals',
  Dimensions: [
    {
      Name: 'Service',
      Value: 'dice-server'
    }
  ]
});

// 少なくとも1つのメトリクスが存在することを確認
appSignalsMetrics.assertAtPath('Metrics', assertions.Match.arrayWith([
  assertions.Match.objectLike({
    Namespace: 'AWS/ApplicationSignals'
  })
]));

app.synth();