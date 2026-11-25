import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, hashRecovery, hotp, newRecoveryCodes, verifyTotp } from './totp.js';
import { verifyStripeSignature } from './stripe.js';
import { parseTag } from '../routes/friends.js';

test('base32 aller-retour', () => {
  const b = Buffer.from('12345678901234567890');
  assert.equal(base32Encode(b), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode(base32Encode(b)), b);
});

test('TOTP : vecteurs de la RFC 6238 (SHA-1)', () => {
  const secret = Buffer.from('12345678901234567890');
  assert.equal(hotp(secret, Math.floor(59 / 30), 8), '94287082');
  assert.equal(hotp(secret, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(hotp(secret, Math.floor(1234567890 / 30), 8), '89005924');
  const b32 = base32Encode(secret);
  const now = 1234567890_000;
  const code = hotp(secret, Math.floor(now / 30000));
  assert.equal(verifyTotp(b32, code, null, now), Math.floor(now / 30000));
  assert.equal(verifyTotp(b32, code, Math.floor(now / 30000), now), null, 'rejeu refusé');
  assert.notEqual(verifyTotp(b32, hotp(secret, Math.floor(now / 30000) - 1), null, now), null, 'décalage -30 s toléré');
  assert.equal(verifyTotp(b32, hotp(secret, Math.floor(now / 30000) - 3), null, now), null);
  assert.equal(verifyTotp(b32, 'abcdef', null, now), null);
});

test('chiffrement du secret et codes de secours', () => {
  const enc = encryptSecret('JBSWY3DPEHPK3PXP');
  assert.notEqual(enc, 'JBSWY3DPEHPK3PXP');
  assert.equal(decryptSecret(enc), 'JBSWY3DPEHPK3PXP');
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.equal(hashRecovery(codes[0].toUpperCase().replace(/-/g, ' ')), hashRecovery(codes[0]));
});

test('signature des webhooks Stripe', () => {
  const secret = 'whsec_test';
  const body = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifyStripeSignature(Buffer.from(body), `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(Buffer.from(body + ' '), `t=${t},v1=${sig}`, secret));
  assert.ok(!verifyStripeSignature(Buffer.from(body), `t=${t - 1000},v1=${createHmac('sha256', secret).update(`${t - 1000}.${body}`).digest('hex')}`, secret), 'trop ancien');
  assert.ok(!verifyStripeSignature(Buffer.from(body), undefined, secret));
});

test('identifiant ami pseudo#1234', () => {
  assert.deepEqual(parseTag(' kiri_fan#0420 '), { username: 'kiri_fan', discriminator: '0420' });
  assert.equal(parseTag('kiri#42'), null);
  assert.equal(parseTag('a#1234'), null);
  assert.equal(parseTag('kiri 1234'), null);
});

test('état des flammes d’amitié', async () => {
  const { flameState } = await import('./flames.js');
  const base = { flame: 5, flameBest: 9, milestones: [3] } as any;
  const today = '2026-11-26';
  assert.equal(flameState({ ...base, flameDate: today, aDate: today, bDate: today }, true, today).status, 'lit');
  const s = flameState({ ...base, flameDate: '2026-11-25', aDate: today, bDate: '2026-11-25' }, true, today);
  assert.equal(s.status, 'waiting_friend');
  assert.equal(s.flame, 5);
  assert.ok(s.atRisk);
  assert.equal(s.next?.days, 7);
  assert.equal(flameState({ ...base, flameDate: '2026-11-25', aDate: '2026-11-25', bDate: today }, true, today).status, 'waiting_me');
  const out = flameState({ ...base, flameDate: '2026-11-20', aDate: '2026-11-20', bDate: '2026-11-20' }, true, today);
  assert.equal(out.status, 'out');
  assert.equal(out.flame, 0);
});
