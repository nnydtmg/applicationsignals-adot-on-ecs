const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const syntheticsConfiguration = synthetics.getConfiguration();

// アプリケーションの検証用の URL
const url = process.env.URL || 'https://example.com';

// レポートリクエストとHeaders等の設定
syntheticsConfiguration.setConfig({
    restrictedHeaders: ['X-Amz-Security-Token', 'Authorization'],
    restrictedUrlParameters: ['Auth'],
    includeRequestHeaders: true,
    includeResponseHeaders: true,
    includeRequestBody: true,
    includeResponseBody: true,
    environmentVariables: {
        APPLICATION_SIGNALS_INTEGRATION: 'true',
        SERVICE_NAME: 'dice-server-canary'
    }
});

// canary関数
const pageLoadBlueprint = async function () {
    // Application Signalsに統合するための情報を追加
    syntheticsConfiguration.withEnvironmentVariable('OTEL_RESOURCE_ATTRIBUTES', 'service.name=dice-server-canary');
    
    // ヘッダーの定義
    const headers = {
        'User-Agent': 'CloudWatch Synthetics Canary',
        'X-Canary': 'true'
    };

    let page;
    try {
        // ステップ1: ページを開く
        log.info(`Navigating to URL: ${url}`);
        
        // ページに移動
        page = await synthetics.getPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // レスポンスコードの確認
        if (response.status() !== 200) {
            throw new Error(`Failed to load page. Status code: ${response.status()}`);
        }
        
        await synthetics.takeScreenshot('page_loaded', 'loaded');
        
        // ステップ2: /api/dice エンドポイントを呼び出してサイコロを振る
        log.info('Testing the dice roll API endpoint');
        const apiResponse = await page.evaluate(async () => {
            const res = await fetch('/api/dice', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return {
                status: res.status,
                body: await res.text()
            };
        });
        
        if (apiResponse.status !== 200) {
            throw new Error(`API call failed. Status code: ${apiResponse.status}`);
        }
        
        log.info(`API Response: ${apiResponse.body}`);
        
        // ステップ3: ヘルスチェックエンドポイントを呼び出す
        log.info('Testing the healthcheck endpoint');
        const healthResponse = await page.evaluate(async () => {
            const res = await fetch('/healthcheck', {
                method: 'GET'
            });
            return {
                status: res.status,
                body: await res.text()
            };
        });
        
        if (healthResponse.status !== 200) {
            throw new Error(`Healthcheck failed. Status code: ${healthResponse.status}`);
        }
        
        log.info('Healthcheck successful');
        
    } catch (error) {
        log.error(`Failed to complete canary: ${error.message}`, error);
        throw error;
    } finally {
        if (page) {
            await page.close();
        }
    }
};

exports.handler = async () => {
    return await pageLoadBlueprint();
};