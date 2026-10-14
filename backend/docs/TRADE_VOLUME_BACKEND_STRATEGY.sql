WITH index_dt AS (
 SELECT generate_series('2025-10-01 00:00'::timestamp,date_trunc('day',now()),interval '1 day') AS index_dt
),tx_value AS (
 SELECT CASE
 WHEN req::json->>'eventType'='buy' AND chain_id=56 AND req::json#>>'{BestTradeRoutePathDto,tokenIn}'='0x0000000000000000000000000000000000000000' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountIn}' AS decimal(38,6))*pow(10,-18)*600
 WHEN req::json->>'eventType'='buy' AND chain_id=56 AND req::json#>>'{BestTradeRoutePathDto,tokenIn}'<>'0x0000000000000000000000000000000000000000' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountIn}' AS decimal(38,6))*pow(10,-18)
 WHEN req::json->>'eventType'='sell' AND chain_id=56 AND req::json#>>'{BestTradeRoutePathDto,tokenOut}'='0x0000000000000000000000000000000000000000' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountOut}' AS decimal(38,6))*pow(10,-18)*600
 WHEN req::json->>'eventType'='sell' AND chain_id=56 AND req::json#>>'{BestTradeRoutePathDto,tokenOut}'<>'0x0000000000000000000000000000000000000000' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountOut}' AS decimal(38,6))*pow(10,-18)
 WHEN req::json->>'eventType'='buy' AND chain_id=3 AND req::json#>>'{BestTradeRoutePathDto,tokenIn}'='So11111111111111111111111111111111111111112' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountIn}' AS decimal(38,6))*pow(10,-9)*80
 WHEN req::json->>'eventType'='buy' AND chain_id=3 AND req::json#>>'{BestTradeRoutePathDto,tokenIn}'<>'So11111111111111111111111111111111111111112' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountIn}' AS decimal(38,6))*pow(10,-6)
 WHEN req::json->>'eventType'='sell' AND chain_id=3 AND req::json#>>'{BestTradeRoutePathDto,tokenOut}'='So11111111111111111111111111111111111111112' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountOut}' AS decimal(38,6))*pow(10,-9)*80
 WHEN req::json->>'eventType'='sell' AND chain_id=3 AND req::json#>>'{BestTradeRoutePathDto,tokenOut}'<>'So11111111111111111111111111111111111111112' THEN CAST(req::json#>>'{BestTradeRoutePathDto,amountOut}' AS decimal(38,6))*pow(10,-6)
 END AS tx_volume,
 copied_address LIKE 'auto_copy_token%' OR copied_address LIKE 'auto_copy_signal%' AS is_ai,
 cp.created_time,date_trunc('day',cp.created_time) AS index_dt
 FROM copy_trade_tx_v1 cp WHERE cp.status=2
 AND caller<>'GYGdrgiHJRfGkyP2dN85EvdWc9eRd6GjYncL98H5gCWR'
 AND caller<>'0xed2eebf5929f9230a48dfbae0ca085e7a1425e6f'
 AND created_time>='2025-10-01 00:00'
),tx_volume_1d_and_td AS (
 SELECT index_dt,sum(manual_tx_volume_1d) OVER(ORDER BY index_dt) AS manual_order_volume_td,
 sum(ai_tx_volume_1d) OVER(ORDER BY index_dt) AS order_ai_tx_volume_td,
 manual_tx_volume_1d AS order_manual_volume_1d,ai_tx_volume_1d AS order_ai_tx_volume_1d
 FROM (SELECT d.index_dt,sum(CASE WHEN NOT is_ai THEN tx_volume END) AS manual_tx_volume_1d,
 sum(CASE WHEN is_ai THEN tx_volume END) AS ai_tx_volume_1d
 FROM tx_value t RIGHT JOIN index_dt d ON t.index_dt=d.index_dt GROUP BY d.index_dt ORDER BY d.index_dt) t
)
SELECT index_dt,coalesce(manual_order_volume_td,CAST(0 AS double precision))+coalesce(order_ai_tx_volume_td,CAST(0 AS double precision)) AS order_volume_td,
 order_manual_volume_1d AS manual_volume_1d,order_ai_tx_volume_1d AS ai_volume_1d FROM tx_volume_1d_and_td
