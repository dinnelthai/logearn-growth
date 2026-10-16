const router=require('express').Router(),assets=require('../services/platformAssets')
router.get('/',async(req,res,next)=>{try{const days=Number(req.query.days||7);if(![1,7,30].includes(days))return res.status(400).json({error:'请选择1、7或30天'});res.json(await require('../services/assetValuation').valuate(assets.report(days)))}catch(e){next(e)}})
module.exports=router
