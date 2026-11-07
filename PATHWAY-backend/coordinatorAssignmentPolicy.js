function coordinatorAssignmentOnly(req,res) {
  return res.status(403).json({error:'Company placements are assigned by your coordinator. Students cannot create or change company assignments.'});
}
module.exports={coordinatorAssignmentOnly};
