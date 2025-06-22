# GitHub Actions Workflows

このディレクトリには、GitHub Actions用のワークフローファイルが含まれています。

## テストワークフロー

### 1. `test.yml`

プルリクエスト作成時および更新時、masterブランチへのプッシュ時に実行される基本テストワークフローです。

- **unit-tests**: スナップショットテストと単体テストを実行
- **cdk-synth**: CDKスタックの構文チェックを実行
- **integ-test**: 統合テスト（コメントアウト - 必要に応じて有効化）

### 2. `mock-integ-test.yml`

実際のAWS環境へのデプロイなしで統合テストをシミュレートするモックテストワークフローです。

- **mock-integ-test**: Integ test用のTypeScriptファイルが正常にコンパイルされることを確認

## 実行環境の準備

実際の統合テストを実行するには、以下のGitHub Secretsを設定する必要があります：

- `AWS_ACCESS_KEY_ID`: AWS IAMユーザーのアクセスキー
- `AWS_SECRET_ACCESS_KEY`: AWS IAMユーザーのシークレットアクセスキー
- `AWS_REGION`: AWSリージョン（例: `ap-northeast-1`）

## 注意事項

1. 統合テストは実際のAWSリソースをデプロイするため、コストが発生します。
2. マスターブランチのワークフローは慎重に扱い、不要なデプロイを避けてください。
3. `test.yml`の`integ-test`ジョブは、デフォルトでコメントアウトされています。必要に応じて有効化してください。