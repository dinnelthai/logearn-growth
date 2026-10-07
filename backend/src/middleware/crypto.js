/**
 * auth.js — password hashing and session helpers using node:crypto only.
 * scrypt params: N=16384, r=8, p=1 → ~100ms on modern hardware.
 */
const { scrypt, randomBytes, timingSafeEqual } = require('node:crypto')
const { promisify } = require('node:util')

const scryptAsync = promisify(scrypt)
const KEYLEN = 64
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await scryptAsync(password, salt, KEYLEN)
  return `${salt}:${hash.toString('hex')}`
}

async function verifyPassword(password, stored) {
  const [salt, hashHex] = stored.split(':')
  if (!salt || !hashHex) return false
  const hashBuf = Buffer.from(hashHex, 'hex')
  const derived = await scryptAsync(password, salt, KEYLEN)
  return timingSafeEqual(hashBuf, derived)
}

function generateToken() {
  return randomBytes(32).toString('hex')
}

function tokenExpiry() {
  return Date.now() + SESSION_TTL_MS
}

module.exports = { hashPassword, verifyPassword, generateToken, tokenExpiry }
