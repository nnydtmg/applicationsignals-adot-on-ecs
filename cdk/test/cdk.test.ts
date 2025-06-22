import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

// スナップショットテスト - CDKスタック全体のCloudFormationテンプレートをキャプチャ
describe('CdkStack', () => {
  test('Stack creates expected CloudFormation template', () => {
    // テスト用の環境変数を設定
    process.env.APP_TAG = 'test';
    process.env.ADOT_TAG = 'test';
    
    const app = new cdk.App();
    // CDKスタックのインスタンスを作成
    const stack = new Cdk.CdkStack(app, 'MyTestStack');
    // CloudFormationテンプレートを取得
    const template = Template.fromStack(stack);
    
    // テンプレート全体をスナップショットとして保存
    expect(template.toJSON()).toMatchSnapshot();
  });
});
