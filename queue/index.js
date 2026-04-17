'use strict';

const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');

const QUEUE_NAME = 'content-jobs';

let _queue = null;

/**
 * BullMQ キューのシングルトンを返す。
 * server.js（enqueue側）とworker.js（consume側）で共有する。
 */
function getContentJobQueue() {
  if (_queue) return _queue;
  _queue = new Queue(QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts:         3,
      backoff:          { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,  // 完了ジョブを最大100件保持
      removeOnFail:     50,   // 失敗ジョブを最大50件保持
    },
  });
  return _queue;
}

module.exports = { getContentJobQueue, QUEUE_NAME };
