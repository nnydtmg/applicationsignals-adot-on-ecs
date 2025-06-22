// このファイルはハンドラーを canary.js にフォワードします
const canary = require('./nodejs/node_modules/canary.js');

exports.handler = async () => {
    return await canary.handler();
};