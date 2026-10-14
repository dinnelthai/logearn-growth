const {TYPE_TO_RAWS}=require('../analytics/eventMap')
// North-star uses the same event union as the funnel's chip step.
const ANALYSIS_SQL=TYPE_TO_RAWS.chip.map(name=>`'${name}'`).join(',')
const D7_SQL="(TO_TIMESTAMP(e.client_ts/1000.0) AT TIME ZONE 'Asia/Bangkok')::date = (TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok')::date + 7"
module.exports={ANALYSIS_SQL,D7_SQL}
