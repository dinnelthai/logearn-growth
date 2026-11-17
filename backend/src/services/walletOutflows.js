const DAY = 86400000
const MAX_DAYS = 366
const MAX_SOURCES_PER_CHAIN = 100
const MAX_PAGES = 100
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOLANA_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]

const CHAINS = [
  { key: 'solana', id: '3', name: 'Solana', family: 'solana', env: 'ASSET_RPC_SOLANA', native: 'SOL', nativeDecimals: 9 },
  { key: 'bsc', id: '56', name: 'BSC', family: 'evm', env: 'ASSET_RPC_BSC', native: 'BNB', nativeDecimals: 18,
    knownTokens: [{ address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', symbol: 'USDC', decimals: 18 }, { address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', decimals: 18 }] },
  { key: 'robinhood', id: '4663', name: 'Robinhood', family: 'evm', env: 'ASSET_RPC_ROBINHOOD', native: 'ETH', nativeDecimals: 18, knownTokens: [] },
  { key: 'arc', id: '5042', name: 'Arc', family: 'evm', env: 'ASSET_RPC_ARC', native: 'USDC', nativeDecimals: 18, knownTokens: [] },
]

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }) }

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label}格式应为YYYY-MM-DD`)
  const utc = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) fail(`${label}不是有效日期`)
  return utc - 7 * 3600000
}

function parseDateRange(startDate, endDate) {
  const start = parseDate(startDate, '开始日期')
  const end = parseDate(endDate, '结束日期') + DAY
  if (end <= start) fail('结束日期不能早于开始日期')
  if (end - start > MAX_DAYS * DAY) fail(`日期范围不能超过${MAX_DAYS}天`)
  return { start, end }
}

function normalizeSourceWallets(sourceWallets, chain) {
  const byAddress = new Map()
  for (const source of sourceWallets) {
    const address = String(source?.address || '').trim()
    const family = String(source?.chain_family || '').toLowerCase()
    const valid = chain.family === 'solana'
      ? SOLANA_ADDRESS.test(address) && (!family || family === 'solana')
      : EVM_ADDRESS.test(address) && (!family || family === 'evm')
    if (!valid) continue
    const key = chain.family === 'evm' ? address.toLowerCase() : address
    const current = byAddress.get(key) || { address: key, account_ids: [] }
    const accountIds = [...(Array.isArray(source.account_ids) ? source.account_ids : []), ...(source.account_id != null ? [source.account_id] : [])]
    for (const accountId of accountIds) if (accountId != null && !current.account_ids.includes(String(accountId))) current.account_ids.push(String(accountId))
    byAddress.set(key, current)
  }
  const result = [...byAddress.values()]
  if (result.length > MAX_SOURCES_PER_CHAIN) fail(`${chain.name}来源钱包超过${MAX_SOURCES_PER_CHAIN}个，请缩小第一步查询范围`)
  return result
}

async function rpc(url, method, params, fetchImpl = globalThis.fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() + attempt, method, params }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const body = await response.json()
      if (body.error || body.result === undefined) throw Error(body.error?.message || 'RPC error')
      return body.result
    } catch (error) {
      if (attempt === 2) throw Error(`${method}请求失败：${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

function hex(value) { return `0x${BigInt(value).toString(16)}` }
function formatUnits(raw, decimals) {
  const value = BigInt(raw)
  const negative = value < 0n
  const absolute = negative ? -value : value
  if (!decimals) return `${negative ? '-' : ''}${absolute}`
  const digits = absolute.toString().padStart(decimals + 1, '0')
  const fraction = digits.slice(-decimals).replace(/0+$/, '')
  return `${negative ? '-' : ''}${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ''}`
}
function parseDecimalRaw(value, decimals) {
  const match = String(value ?? '').trim().match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) throw Error('RPC金额格式无效')
  let [, sign, whole, fraction = '', exponent = '0'] = match
  let digits = whole + fraction
  let scale = fraction.length - Number(exponent)
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0 }
  if (scale > decimals) {
    const excess = scale - decimals
    if (/[1-9]/.test(digits.slice(-excess))) throw Error('RPC金额精度超限')
    digits = digits.slice(0, -excess)
    scale = decimals
  }
  digits += '0'.repeat(decimals - scale)
  const raw = BigInt(digits || '0')
  return sign === '-' ? -raw : raw
}
function rawValue(value, decimals) {
  if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value)
  return parseDecimalRaw(value, decimals)
}
function tokenKey(token) { return token.contract_address ? `erc20:${token.contract_address.toLowerCase()}` : `native:${token.symbol}` }
function aggregateTransfers(transfers) {
  const totals = new Map()
  for (const transfer of transfers) {
    const key = tokenKey(transfer)
    const item = totals.get(key) || { symbol: transfer.symbol, contract_address: transfer.contract_address || null, decimals: transfer.decimals, raw_amount: 0n, amount: '0' }
    item.raw_amount += BigInt(transfer.raw_amount)
    item.amount = formatUnits(item.raw_amount, item.decimals)
    totals.set(key, item)
  }
  return [...totals.values()].map(({ raw_amount, ...item }) => item)
}

async function blockTimestamp(url, number, fetchImpl) {
  const block = await rpc(url, 'eth_getBlockByNumber', [hex(number), false], fetchImpl)
  return block ? Number(BigInt(block.timestamp) * 1000n) : null
}
async function firstBlockAtOrAfter(url, target, latest, fetchImpl) {
  let low = 0, high = latest + 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const timestamp = await blockTimestamp(url, middle, fetchImpl)
    if (timestamp == null || timestamp >= target) high = middle
    else low = middle + 1
  }
  return low
}
async function evmBlockRange(url, start, end, fetchImpl) {
  const latest = Number(BigInt(await rpc(url, 'eth_blockNumber', [], fetchImpl)))
  const latestTime = await blockTimestamp(url, latest, fetchImpl)
  if (latestTime == null || latestTime < start) return null
  const from = await firstBlockAtOrAfter(url, start, latest, fetchImpl)
  const endFirst = latestTime < end ? latest + 1 : await firstBlockAtOrAfter(url, end, latest, fetchImpl)
  const to = Math.min(latest, endFirst - 1)
  return from <= to ? { fromBlock: hex(from), toBlock: hex(to) } : null
}

function evmTransferItem(chain, transfer) {
  const category = String(transfer.category || '')
  const contract = category === 'erc20' ? String(transfer.rawContract?.address || '').toLowerCase() : null
