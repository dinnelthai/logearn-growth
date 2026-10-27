const router=require('express').Router(),assets=require('../services/platformAssets')
router.get('/',async(req,res,next)=>{try{const days=Number(req.query.days||7);if(![1,7,30].includes(days))return res.status(400).json({error:'请选择1、7或30天'});res.json(await require('../services/assetValuation').valuate(assets.report(days)))}catch(e){next(e)}})
module.exports=router

router.get('/addresses',async(req,res,next)=>{try{const chain=String(req.query.chain||'all'),search=String(req.query.search||''),page=Number(req.query.page||1);if((chain!=='all'&&!assets.CHAINS.some(c=>c.id===chain))||!Number.isInteger(page)||page<1||search.length>200)return res.status(400).json({error:'地址列表查询参数无效'});res.json(await require('../services/assetAddresses').list({chain,search,page}))}catch(e){next(e)}})
