// Account removal preserves historical documents; only sign-in identity is deleted.
function installCoordinatorAccounts({app,db,auth,requireAdmin,audit}) {
 const change = deleting => async (req,res) => {
  const uid=req.params.coordinatorId, active=req.body?.accountApproved;
  if(!uid || uid===req.staff.uid || (!deleting && typeof active!=='boolean'))return res.status(400).json({error:'Choose a coordinator and a valid account status.'});
  const ref=db.collection('users').doc(uid);
  try {
   const snap=await ref.get();
   if(!snap.exists || !['coordinator','inactive_coordinator'].includes(snap.data().role))return res.status(404).json({error:'Coordinator not found.'});
   if(deleting || !active){const assigned=await db.collection('sections').where('coordinatorId','==',uid).limit(1).get();if(!assigned.empty)return res.status(409).json({error:'Reassign this coordinator’s sections before deactivating or deleting the account.'});}
   // Fail closed: revoke the profile role before changing the authentication identity.
   if(deleting || !active)await ref.update({role:'inactive_coordinator',accountApproved:false});
   if(deleting){try{await auth.deleteUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;}}
   else {await auth.updateUser(uid,{disabled:!active});if(!active)await auth.revokeRefreshTokens(uid);}
   await db.runTransaction(async tx=>{tx.update(ref,{role:deleting?'deleted_coordinator':active?'coordinator':'inactive_coordinator',accountApproved:!deleting && active,accountStatusUpdatedAt:new Date().toISOString(),accountStatusUpdatedBy:req.staff.uid});audit(tx,{actorId:req.staff.uid,actorRole:'admin',action:deleting?'coordinator.deleted':'coordinator.activation_changed',targetType:'users',targetId:uid,details:{accountApproved:!deleting && active}});});
   return res.json({success:true,deleted:deleting,accountApproved:!deleting && active});
  }catch(e){console.error('Coordinator account change failed:',e.code || 'unknown');return res.status(500).json({error:'Account change could not be completed. Refresh and retry; an interrupted removal may leave access disabled.'});}
 };
 app.patch('/admin/coordinators/:coordinatorId/account-status',requireAdmin,change(false));
 app.delete('/admin/coordinators/:coordinatorId',requireAdmin,change(true));
}
module.exports={installCoordinatorAccounts};
