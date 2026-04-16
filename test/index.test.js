const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCliArgs, buildRecordIdQuery, extractRecordData } = require('../index');

test('parseCliArgs: default values', () => {
  const parsed = parseCliArgs([]);
  assert.equal(parsed.forceYes, false);
  assert.equal(parsed.targetRecordId, '');
  assert.equal(parsed.limit, 3);
});

test('parseCliArgs: --yes and numeric limit', () => {
  const parsed = parseCliArgs(['10', '--yes']);
  assert.equal(parsed.forceYes, true);
  assert.equal(parsed.targetRecordId, '');
  assert.equal(parsed.limit, 10);
});

test('parseCliArgs: --record-id (space)', () => {
  const parsed = parseCliArgs(['--record-id', '1234', '-y']);
  assert.equal(parsed.forceYes, true);
  assert.equal(parsed.targetRecordId, '1234');
  assert.equal(parsed.limit, 3);
});

test('parseCliArgs: --record-id=VALUE', () => {
  const parsed = parseCliArgs(['--record-id=5678']);
  assert.equal(parsed.forceYes, false);
  assert.equal(parsed.targetRecordId, '5678');
  assert.equal(parsed.limit, 3);
});

test('parseCliArgs: invalid record-id is ignored', () => {
  const parsed = parseCliArgs(['--record-id', 'abc']);
  assert.equal(parsed.targetRecordId, '');
});

test('buildRecordIdQuery returns kintone query', () => {
  const query = buildRecordIdQuery('1234');
  assert.equal(query, '$id = "1234" limit 1');
});

test('extractRecordData reads default field names', () => {
  const record = {
    '$id': { value: '42' },
    '施工事例UPレコード番号': { value: 'EX-42' },
    '住所': { value: '千葉県柏市' },
    '施工箇所': { value: ['浴室', '洗面化粧台'] },
    '物件種別': { value: '戸建て' },
    'リフォーム期間': { value: '5日間' },
    'リフォーム費用': { value: '170万円' },
    '施工主様のお悩み': { value: '寒い浴室' },
    'リフォームのポイント': { value: '断熱改善' },
    'お客様の声': { value: '満足です' },
    'メーカー名や商品名': { value: 'TOTO サザナ' },
    '施工面積': { value: '12㎡' },
    '築年数': { value: '30年' },
    '担当者から一言': { value: 'ありがとうございました' },
    '作成者': { value: { name: '担当A' } },
    '店舗選択': { value: ['柏ショールーム店'] },
    '施工前の写真': { value: [{ fileKey: 'before-1' }] },
    '施工中の写真': { value: [{ fileKey: 'during-1' }] },
    '施工後の写真': { value: [{ fileKey: 'after-1' }] },
  };

  const data = extractRecordData(record);
  assert.equal(data.recordId, '42');
  assert.equal(data.title, 'EX-42');
  assert.equal(data.location, '千葉県柏市');
  assert.equal(data.area, '浴室、洗面化粧台');
  assert.equal(data.tanto, '担当A');
  assert.equal(data.beforeImages.length, 1);
  assert.equal(data.duringImages.length, 1);
  assert.equal(data.afterImages.length, 1);
});
