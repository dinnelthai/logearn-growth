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
  const decimals = category === 'erc20' ? Number(transfer.rawContract?.decimal ?? 18) : chain.nativeDecimals
  const symbol = category === 'erc20' ? (transfer.asset || `TOKEN ${contract ? contract.slice(0, 8) : ''}`.trim()) : chain.native
  const raw = rawValue(transfer.rawContract?.value ?? transfer.value, decimals)
  const timestamp = Date.parse(transfer.metadata?.blockTimestamp || '')
  return {
    timestamp: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    tx_hash: transfer.hash || null,
    source_address: transfer.from || null,
    target_address: transfer.to || null,
    symbol,
    contract_address: contract,
    decimals,
    raw_amount: raw.toString(),
    amount: formatUnits(raw, decimals),
    category,
  }
}

async function scanEvmOutgoing(chain, url, sourceAddress, targetAddress, range, fetchImpl, resolvedBlockRange) {
  const blockRange = resolvedBlockRange === undefined ? await evmBlockRange(url, range.start, range.end, fetchImpl) : resolvedBlockRange
  if (!blockRange) return []
  const transfers = []
  let pageKey, pages = 0
  do {
    const params = {
      fromBlock: blockRange.fromBlock,
      toBlock: blockRange.toBlock,
      fromAddress: sourceAddress,
      toAddress: targetAddress,
      category: ['external', 'internal', 'erc20'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: '0x3e8',
      order: 'asc',
    }
    if (pageKey) params.pageKey = pageKey
    const result = await rpc(url, 'alchemy_getAssetTransfers', [params], fetchImpl)
    pages++
    for (const item of (Array.isArray(result.transfers) ? result.transfers : [])) {
      const time = Date.parse(item.metadata?.blockTimestamp || '')
      if (Number.isFinite(time) && (time < range.start || time >= range.end)) continue
      transfers.push(evmTransferItem(chain, item))
    }
    pageKey = result.pageKey
    if (pages >= MAX_PAGES && pageKey) throw Error('历史转账记录超过查询上限，请缩小日期范围')
  } while (pageKey)
  return transfers
}

async function evmBalances(chain, url, address, transfers, fetchImpl) {
  const warnings = []
  const [nativeRaw, defaultTokens] = await Promise.all([
    rpc(url, 'eth_getBalance', [address, 'latest'], fetchImpl),
    rpc(url, 'alchemy_getTokenBalances', [address, 'DEFAULT_TOKENS'], fetchImpl).catch(error => { warnings.push(`默认Token余额列表不可用：${error.message}`); return null }),
  ])
  const native = { symbol: chain.native, contract_address: null, decimals: chain.nativeDecimals, amount: formatUnits(BigInt(nativeRaw || '0x0'), chain.nativeDecimals) }
  const contracts = new Map()
  for (const token of (chain.knownTokens || [])) contracts.set(token.address.toLowerCase(), { ...token, contract_address: token.address.toLowerCase() })
  for (const transfer of transfers) if (transfer.contract_address) {
    const key = transfer.contract_address.toLowerCase()
    const previous = contracts.get(key) || { contract_address: key, symbol: transfer.symbol, decimals: transfer.decimals }
    if (!previous.symbol || previous.symbol.startsWith('TOKEN ')) previous.symbol = transfer.symbol
    if (!Number.isInteger(previous.decimals)) previous.decimals = transfer.decimals
    contracts.set(key, previous)
  }
  const defaults = Array.isArray(defaultTokens?.tokenBalances) ? defaultTokens.tokenBalances : []
  if (defaultTokens) warnings.push('EVM当前Token余额包含默认Token列表及本次统计涉及的Token；其他未被RPC索引的合约可能不在列表中。')
  for (const token of defaults) {
    const key = String(token.contractAddress || '').toLowerCase()
    if (EVM_ADDRESS.test(key) && !contracts.has(key)) contracts.set(key, { contract_address: key, symbol: null, decimals: null })
  }
  const entries = [...contracts.values()].slice(0, 100)
  if (contracts.size > entries.length) warnings.push('Token余额列表超过100种，仅展示前100种')
  let queried = null
  if (entries.length) {
    queried = await rpc(url, 'alchemy_getTokenBalances', [address, entries.map(item => item.contract_address)], fetchImpl).catch(error => {
      warnings.push(`Token余额批量读取失败：${error.message}`)
      return null
    })
  }
  const returned = new Map((queried?.tokenBalances || []).map(item => [String(item.contractAddress || '').toLowerCase(), item]))
  const defaultMap = new Map(defaults.map(item => [String(item.contractAddress || '').toLowerCase(), item]))
  const balances = [native]
  for (const token of entries) {
    const row = returned.get(token.contract_address) || defaultMap.get(token.contract_address)
    let raw = row?.tokenBalance
    let decimals = Number.isInteger(token.decimals) ? token.decimals : Number(row?.decimals)
    let symbol = token.symbol || null
    if (raw == null || !Number.isInteger(decimals)) {
      const [balanceResult, metadata] = await Promise.all([
        rpc(url, 'eth_call', [{ to: token.contract_address, data: `0x70a08231${address.toLowerCase().slice(2).padStart(64, '0')}` }, 'latest'], fetchImpl).catch(() => null),
        rpc(url, 'alchemy_getTokenMetadata', [token.contract_address], fetchImpl).catch(() => null),
      ])
      if (raw == null && balanceResult != null) raw = balanceResult
      if (!Number.isInteger(decimals) && Number.isInteger(metadata?.decimals)) decimals = metadata.decimals
      if (!symbol) symbol = metadata?.symbol || null
    } else if (!symbol) {
      const metadata = await rpc(url, 'alchemy_getTokenMetadata', [token.contract_address], fetchImpl).catch(() => null)
      symbol = metadata?.symbol || null
      if (!Number.isInteger(decimals) && Number.isInteger(metadata?.decimals)) decimals = metadata.decimals
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) decimals = 18
    if (!symbol) symbol = `TOKEN ${token.contract_address.slice(0, 8)}`
    if (raw == null) {
      warnings.push(`${symbol}余额无法读取`)
      continue
    }
    const normalizedRaw = typeof raw === 'string' && /^0x$/i.test(raw) ? '0x0' : (raw || '0x0')
    balances.push({ symbol, contract_address: token.contract_address, decimals, amount: formatUnits(BigInt(normalizedRaw), decimals) })
  }
  return { balances, warnings }
}

function solanaAccountKeys(transaction) {
  return (transaction.transaction?.message?.accountKeys || []).map(key => typeof key === 'string' ? key : key.pubkey)
}
function solanaOutgoingTransfers(transaction, sourceAddress, targetAddress, chain) {
  const keys = solanaAccountKeys(transaction)
  const owners = new Map()
  for (const balance of [...(transaction.meta?.preTokenBalances || []), ...(transaction.meta?.postTokenBalances || [])]) {
    if (balance.owner) owners.set(balance.accountIndex, { owner: balance.owner, mint: balance.mint, decimals: balance.uiTokenAmount?.decimals })
  }
  const instructions = [
    ...(transaction.transaction?.message?.instructions || []),
    ...(transaction.meta?.innerInstructions || []).flatMap(group => group.instructions || []),
  ]
  const timestamp = transaction.blockTime ? new Date(Number(transaction.blockTime) * 1000).toISOString() : null
  const signature = transaction.transaction?.signatures?.[0] || null
  const result = []
  for (const instruction of instructions) {
    const parsed = instruction.parsed
    const info = parsed?.info
    if (!parsed || !info) continue
    if (instruction.program === 'system' && ['transfer', 'transferWithSeed'].includes(parsed.type)) {
      const from = info.source || info.from || info.sourceBase
      if (from === sourceAddress && info.destination === targetAddress && /^\d+$/.test(String(info.lamports))) {
        const raw = BigInt(info.lamports)
        result.push({ timestamp, tx_hash: signature, source_address: sourceAddress, target_address: targetAddress, symbol: chain.native, contract_address: null, decimals: chain.nativeDecimals, raw_amount: raw.toString(), amount: formatUnits(raw, chain.nativeDecimals), category: 'native' })
      }
      continue
    }
    if (!['spl-token', 'spl-token-2022'].includes(instruction.program) || !['transfer', 'transferChecked', 'transferCheckedWithFee'].includes(parsed.type)) continue
    const sourceTokenAccount = String(info.source || '')
    const destinationTokenAccount = String(info.destination || '')
    const sourceMeta = owners.get(keys.indexOf(sourceTokenAccount))
    const destinationMeta = owners.get(keys.indexOf(destinationTokenAccount))
    const sourceOwner = sourceMeta?.owner || info.authority
    const destinationOwner = destinationMeta?.owner || (destinationTokenAccount === targetAddress ? targetAddress : null)
    if (sourceOwner !== sourceAddress || destinationOwner !== targetAddress) continue
    const mint = info.mint || sourceMeta?.mint || destinationMeta?.mint
    const tokenAmount = info.tokenAmount?.amount ?? info.amount
    if (!mint || !/^\d+$/.test(String(tokenAmount))) continue
    const decimals = Number(info.tokenAmount?.decimals ?? sourceMeta?.decimals ?? destinationMeta?.decimals ?? 0)
    const raw = BigInt(tokenAmount)
    const symbol = mint === SOLANA_USDC ? 'USDC' : mint === SOLANA_USDT ? 'USDT' : `SPL ${mint.slice(0, 6)}`
    result.push({ timestamp, tx_hash: signature, source_address: sourceAddress, target_address: targetAddress, symbol, contract_address: mint, decimals, raw_amount: raw.toString(), amount: formatUnits(raw, decimals), category: 'spl-token' })
  }
  return result
}

async function solanaSignatures(url, address, range, fetchImpl) {
  const signatures = []
  let before
  for (let page = 0; page < MAX_PAGES; page++) {
    const options = { limit: 1000, commitment: 'finalized' }
    if (before) options.before = before
    const rows = await rpc(url, 'getSignaturesForAddress', [address, options], fetchImpl)
    if (!Array.isArray(rows) || !rows.length) break
    let olderThanRange = false
    for (const row of rows) {
      const timestamp = Number(row.blockTime) * 1000
      if (Number.isFinite(timestamp) && timestamp < range.start) { olderThanRange = true; break }
      if (!row.err && Number.isFinite(timestamp) && timestamp < range.end) signatures.push({ signature: row.signature, timestamp })
    }
    if (olderThanRange || rows.length < 1000) return signatures
    before = rows.at(-1).signature
  }
  throw Error('Solana历史交易超过查询上限，请缩小日期范围')
}

async function scanSolanaOutgoing(chain, url, sourceAddress, targetAddress, range, fetchImpl) {
  const signatures = await solanaSignatures(url, sourceAddress, range, fetchImpl)
  const transfers = []
  for (let index = 0; index < signatures.length; index += 4) {
    const batch = await Promise.all(signatures.slice(index, index + 4).map(async item => {
      const tx = await rpc(url, 'getTransaction', [item.signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }], fetchImpl)
      return tx ? solanaOutgoingTransfers(tx, sourceAddress, targetAddress, chain) : []
    }))
    for (const rows of batch) transfers.push(...rows)
  }
  return transfers
}

async function solanaBalances(chain, url, address, fetchImpl) {
  const [nativeResult, ...tokenResults] = await Promise.all([
    rpc(url, 'getBalance', [address, { commitment: 'finalized' }], fetchImpl),
    ...TOKEN_PROGRAMS.map(programId => rpc(url, 'getTokenAccountsByOwner', [address, { programId }, { encoding: 'jsonParsed', commitment: 'finalized' }], fetchImpl).catch(error => ({ error }))),
  ])
  const balances = [{ symbol: chain.native, contract_address: null, decimals: chain.nativeDecimals, amount: formatUnits(BigInt(nativeResult?.value || 0), chain.nativeDecimals) }]
  const tokens = new Map()
  const warnings = []
  for (const result of tokenResults) {
    if (result.error) { warnings.push(`SPL Token余额读取失败：${result.error.message}`); continue }
    for (const row of (result.value || [])) {
      const info = row.account?.data?.parsed?.info
      const token = info?.tokenAmount
      const mint = info?.mint
      if (!mint || !token || !/^\d+$/.test(String(token.amount))) continue
      const decimals = Number(token.decimals || 0)
      const current = tokens.get(mint) || { symbol: mint === SOLANA_USDC ? 'USDC' : mint === SOLANA_USDT ? 'USDT' : `SPL ${mint.slice(0, 6)}`, contract_address: mint, decimals, raw: 0n }
      current.raw += BigInt(token.amount)
      tokens.set(mint, current)
    }
  }
  for (const token of tokens.values()) balances.push({ symbol: token.symbol, contract_address: token.contract_address, decimals: token.decimals, amount: formatUnits(token.raw, token.decimals) })
  return { balances, warnings }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

async function queryOutgoingTransfers({ sourceWallets, targets, startDate, endDate, fetchImpl = globalThis.fetch } = {}) {
  if (!Array.isArray(sourceWallets) || !sourceWallets.length) fail('请先完成第一步旧钱包查询，获取来源钱包地址')
  if (sourceWallets.length > 5000) fail('来源钱包数量超过5000个，请缩小第一步查询范围')
  if (!targets || typeof targets !== 'object') fail('请填写各链的转出目标地址')
  const range = parseDateRange(startDate, endDate)
  const chains = await Promise.all(CHAINS.map(async chain => {
    const targetInput = String(targets[chain.key] || '').trim()
    if (!targetInput) return { chain: { id: chain.id, name: chain.name }, status: 'skipped', message: '未填写目标地址', sources: [] }
    const targetAddress = chain.family === 'evm' ? (EVM_ADDRESS.test(targetInput) ? targetInput.toLowerCase() : null) : (SOLANA_ADDRESS.test(targetInput) ? targetInput : null)
    if (!targetAddress) return { chain: { id: chain.id, name: chain.name }, target_address: targetInput, status: 'invalid_target', message: `${chain.name}目标地址格式无效`, sources: [] }
    let sources
    try { sources = normalizeSourceWallets(sourceWallets, chain) } catch (error) {
      return { chain: { id: chain.id, name: chain.name }, target_address: targetAddress, status: 'error', message: error.message, sources: [] }
    }
    if (!sources.length) return { chain: { id: chain.id, name: chain.name }, target_address: targetAddress, status: 'no_sources', message: '第一步没有找到该链可用的旧钱包地址', sources: [] }
    const url = process.env[chain.env]
    if (!url) return { chain: { id: chain.id, name: chain.name }, target_address: targetAddress, status: 'error', message: `${chain.name} RPC尚未配置`, sources: [] }
    let resolvedBlockRange
    let blockRangeError
    if (chain.family === 'evm') {
      try { resolvedBlockRange = await evmBlockRange(url, range.start, range.end, fetchImpl) }
      catch (error) { blockRangeError = error }
    }
    const results = await mapLimit(sources, 2, async source => {
      const item = { account_ids: source.account_ids, source_address: source.address, status: 'ok', transfers: [], totals: [], balances: [], transfer_count: 0, transaction_count: 0, warnings: [] }
      try {
        if (blockRangeError) throw blockRangeError
        item.transfers = chain.family === 'evm'
          ? await scanEvmOutgoing(chain, url, source.address, targetAddress, range, fetchImpl, resolvedBlockRange)
          : await scanSolanaOutgoing(chain, url, source.address, targetAddress, range, fetchImpl)
        item.totals = aggregateTransfers(item.transfers)
        item.transfer_count = item.transfers.length
        item.transaction_count = new Set(item.transfers.map(transfer => transfer.tx_hash).filter(Boolean)).size
      } catch (error) {
        item.status = 'history_error'
        item.error = error.message
      }
      try {
        const balanceResult = chain.family === 'evm'
          ? await evmBalances(chain, url, source.address, item.transfers, fetchImpl)
          : await solanaBalances(chain, url, source.address, fetchImpl)
        item.balances = balanceResult.balances
        item.warnings.push(...balanceResult.warnings)
      } catch (error) {
        item.warnings.push(`当前余额读取失败：${error.message}`)
      }
      return item
    })
    return { chain: { id: chain.id, name: chain.name }, target_address: targetAddress, status: 'ok', source_count: results.length, sources: results }
  }))
  return { start_date: startDate, end_date: endDate, timezone: 'UTC+7', chains }
}

module.exports = {
  CHAINS,
  parseDateRange,
  formatUnits,
  normalizeSourceWallets,
  aggregateTransfers,
  solanaOutgoingTransfers,
  scanEvmOutgoing,
  evmTransferItem,
  queryOutgoingTransfers,
}
