# applicationsignals-adot-on-ecs

## ランタイムメトリクスの取得
[こちら](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AppSignals-MetricsCollected.html#AppSignals-RuntimeMetrics)を参考に、エージェントのバージョンを指定。

## Synthetic Canaryのアセットパス
これまで、`任意のパス/nodejs/node_modules/index.js`だったものが、なぜか`任意のパス/nodejs/node_modules/nodejs/node_modules/index.js`になっていた。
