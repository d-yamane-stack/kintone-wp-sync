'use strict';

// Prisma Client のシングルトン
// 複数箇所でrequireしても接続が1本になるようにする

let _client = null;

function getPrismaClient() {
  if (_client) return _client;
  const { PrismaClient } = require('@prisma/client');
  _client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  return _client;
}

async function disconnectPrisma() {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

module.exports = { getPrismaClient, disconnectPrisma };
