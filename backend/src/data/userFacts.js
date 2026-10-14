// Read-only product facts. Numeric event IDs join account_id only; no wallet-ID guesses.
// Mutable source rows remain weakly consistent, even with a creation-time cutoff.
function userFactsCte(period=false) {
  return `, registered AS (
    SELECT 'user:' || account_id::text AS user_key, account_id, created_at, last_login_at, status AS account_status
    FROM public.account_v2 WHERE created_at <= $1::timestamptz
  ), binding_facts AS (
    SELECT account_id,
      BOOL_OR(provider='telegram' AND verified) AS telegram_bound,
      BOOL_OR(provider='email' AND verified) AS email_bound,
      BOOL_OR(provider='phantom' AND verified) AS phantom_bound,
      BOOL_OR(provider='metamask' AND verified) AS metamask_bound,
      COUNT(DISTINCT provider) FILTER(WHERE verified) AS identity_count
    FROM public.account_identity_v2 WHERE created_at <= $1::timestamptz GROUP BY account_id
  ), referral_facts AS (
    SELECT user_id, level1_user_id, invitation_time FROM public.user_invitation_relation
    WHERE is_valid=true AND invitation_time <= $1::timestamptz AND created_time <= $1::timestamptz
      AND level1_user_id IS NOT NULL AND user_id <> level1_user_id
  )${require('./tradeIdentity').tradeIdentityFragment()}, trade_facts AS (
    SELECT v.account_id AS user_id, COUNT(*) AS trade_count${period?', COUNT(*) FILTER(WHERE t.transaction_time >= TO_TIMESTAMP($5::double precision/1000) AND t.transaction_time < TO_TIMESTAMP($6::double precision/1000)) AS trade_count_period':''} FROM public.trading_transaction t JOIN valid_map v ON v.user_id=t.user_id
    WHERE t.transaction_time <= $1::timestamptz AND t.created_time <= $1::timestamptz GROUP BY v.account_id
  ), address_candidates AS (
    SELECT account_id,CASE WHEN subject ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(subject) ELSE subject END AS address
    FROM public.account_identity_v2 WHERE verified=true AND created_at <= $1::timestamptz
      AND ((provider='metamask' AND subject ~ '^0x[0-9a-fA-F]{40}$') OR
        (provider='phantom' AND subject ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'))
    UNION ALL
    SELECT account_id,CASE WHEN address ~ '^0x[0-9a-fA-F]{40}$' THEN LOWER(address) ELSE address END
    FROM public.wallet_v2 WHERE status='active' AND created_at <= $1::timestamptz
  ), address_accounts AS (
    SELECT address,MIN(account_id) AS account_id FROM address_candidates
    WHERE NULLIF(address,'') IS NOT NULL GROUP BY address HAVING COUNT(DISTINCT account_id)=1
  ), nft_facts AS (
    SELECT a.account_id,COUNT(DISTINCT n.chain::text || ':' || n.nft_num::text) AS nft_count
    FROM public.nft_owner n JOIN address_accounts a ON LOWER(n.owner)=a.address
    WHERE n.chain IN(1,8453) AND n.created_time <= $1::timestamptz AND n.updated_time <= $1::timestamptz
    GROUP BY a.account_id
  ), balance_facts AS (
    SELECT a.account_id,BOOL_OR(b.balance>0) AS positive_balance,MAX(b.updated_time) AS balance_updated_at
    FROM public.user_balance b JOIN address_accounts a ON LOWER(b.address)=a.address
    WHERE b.chain IN('1','56','42161') AND b.updated_time <= $1::timestamptz
      AND b.updated_time >= $1::timestamptz-INTERVAL '24 hours' GROUP BY a.account_id
  ), points_facts AS (
    SELECT user_id,MAX(available_points) AS available_points FROM public.user_points_account
    WHERE created_time <= $1::timestamptz AND updated_time <= $1::timestamptz GROUP BY user_id HAVING COUNT(*)=1
  ), product_users AS (
    SELECT COALESCE(r.user_key,f.user_key) AS user_key, f.first_chip, f.source,
      r.account_id, r.created_at, r.last_login_at, r.account_status,
      n.nft_count,bal.positive_balance AS has_balance,bal.balance_updated_at,p.available_points,
      NULL::boolean AS vip_active,
      b.phantom_bound,b.metamask_bound,COALESCE(b.identity_count,0) AS identity_count,
      (SELECT MIN(x.invitation_time) FROM referral_facts x WHERE x.user_id=r.account_id) AS invitation_at,
      CASE WHEN r.account_id IS NULL THEN NULL ELSE COALESCE(b.telegram_bound,false) END AS telegram_bound,
      CASE WHEN r.account_id IS NULL THEN NULL ELSE COALESCE(b.email_bound,false) END AS email_bound,
      EXISTS(SELECT 1 FROM referral_facts x WHERE x.user_id=r.account_id) AS referred_user,
      EXISTS(SELECT 1 FROM referral_facts x WHERE x.level1_user_id=r.account_id) AS inviter,
      COALESCE(t.trade_count,0) AS trade_count${period?', COALESCE(t.trade_count_period,0) AS trade_count_period':''}
    FROM registered r FULL OUTER JOIN facts f ON r.user_key=f.user_key
    LEFT JOIN binding_facts b ON b.account_id=r.account_id
    LEFT JOIN trade_facts t ON t.user_id=r.account_id
    LEFT JOIN nft_facts n ON n.account_id=r.account_id
    LEFT JOIN balance_facts bal ON bal.account_id=r.account_id
    LEFT JOIN points_facts p ON p.user_id=r.account_id
    WHERE COALESCE(r.user_key,f.user_key) LIKE 'user:%'
  )`
}
module.exports={userFactsCte}
