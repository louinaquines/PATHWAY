import React from 'react';
import { createRoot } from 'react-dom/client';
import ApprovalWelcome from '../../../PATHWAY-master/components/ApprovalWelcome';
import StudentLogoutScreen from '../../../PATHWAY-master/components/StudentLogoutScreen';
createRoot(document.getElementById('root')).render(<div style={{height:'100vh',display:'flex'}}>{location.search.includes('logout') ? <StudentLogoutScreen/> : <ApprovalWelcome onComplete={()=>{}} />}</div>);
