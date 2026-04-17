'use strict';

/**
 * BullMQ 用 Redis 接続設定
 *
 * ローカル開発:
 *   REDIS_HOST=localhost  REDIS_PORT=6379
 *
 * Upstash (本番推奨):
 *   REDIS_URL=rediss://default:<password>@<endpoint>:6380
 *   （Upstash ダッシュボードの "ioredis" 接続文字列をそのままコピー）
 */
function getRedisConnection() {
  if (process.env.REDIS_URL) {
    // Upstash / 接続URL形式
    return {
      url:                    process.env.REDIS_URL,
      maxRetriesPerRequest:   null, // BullMQ 必須設定
      enableReadyCheck:       false,
    };
  }

  // ローカル Redis
  return {
    host:                 process.env.REDIS_HOST || 'localhost',
    port:                 parseInt(process.env.REDIS_PORT || '6379', 10),
    password:             process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  };
}

module.exports = { getRedisConnection };
