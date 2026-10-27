module.exports=(router,{db,get,wrap})=>{
 const evidence=require('../services/activityEvidence')
 router.get('/:id/evidence',wrap((req,res)=>res.json(evidence.read(db,get(req.params.id,req.user.user_id),req.query))))
 router.post('/:id/evidence/assignments',wrap((req,res)=>{const a=get(req.params.id,req.user.user_id),result=evidence.assign(db,a,req.body,req.user.user_id);res.status(201).json({...result,...evidence.read(db,get(a.id,req.user.user_id))})}))
 router.post('/:id/evidence/records',wrap((req,res)=>{const a=get(req.params.id,req.user.user_id),result=evidence.record(db,a,req.body,req.user.user_id);res.status(result.existing?200:201).json({...result,...evidence.read(db,a)})}))
}
