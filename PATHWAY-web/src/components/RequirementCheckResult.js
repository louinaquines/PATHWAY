import './RequirementCheckResult.css';
const labels={readability:'Readable file',document_type:'Correct document type',student_identity:'Profile details match',required_fields:'Required fields',date_consistency:'Date consistency',signature_presence:'Signed over printed name',blanks_filled:'All blanks filled in',placement_match:'Placement details match',reference_match:'Matches reference file',required_phrases:'Required phrases present'}
const tiers={green:'Green',yellow:'Yellow',red:'Red'};
const nameText={match:'Name matches profile',partial:'Name partly matches — confirm',mismatch:'Name does not match profile',missing:'Name not found on document'};
const Extra=({review})=><>{review.tier&&<span className={'requirement-tier requirement-tier-'+review.tier}>{tiers[review.tier]}</span>}{review.nameCheck&&<span className="requirement-name-check">{nameText[review.nameCheck.result]}</span>}</>;;
const titles={queued:'Waiting for automatic check',checking:'Checking document',checks_passed:'Automatic check passed. Approval still needed.',needs_review:'Coordinator review needed'};
const MANUAL_REASONS=['consent_required','ai_unavailable','policy_missing','unsupported_file','assignment_changed'];
// One plain-language status for coordinators.
function coordinatorStatus(review){
 if(['queued','checking'].includes(review.status))return {tone:'pending',title:'AI check in progress',note:'Refresh in a moment to see the result.'};
 if(MANUAL_REASONS.includes(review.reason))return {tone:'neutral',title:'Not auto-checked — review manually',note:null};
 if(review.status==='checks_passed'&&review.tier!=='yellow'&&review.tier!=='red')return {tone:'green',title:'Looks complete',note:null};
 if(review.tier==='red')return {tone:'red',title:'Likely wrong or incomplete',note:null};
 return {tone:'yellow',title:'Needs a closer look',note:null};
}
function CompactResult({review}){
 const status=coordinatorStatus(review);
 const findings=review.findings||[];
 const failed=(review.checks||[]).filter(check=>!check.passed);
 const top=findings.slice(0,3), rest=findings.slice(3);
 return <section className={'requirement-check-result requirement-check-compact ai-result ai-result-'+status.tone} aria-label="Automatic document checks" aria-live="polite">
  <div className="ai-result-head"><span className="ai-result-dot" aria-hidden="true"/><strong>{status.title}</strong>{review.nameCheck&&<span className="requirement-name-check">{nameText[review.nameCheck.result]}</span>}<span className="ai-result-tag">AI suggestion · you decide</span></div>
  {status.note&&<p className="ai-result-note">{status.note}</p>}
  {top.length>0&&<ul className="ai-result-findings">{top.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
  {(rest.length>0||(review.checks||[]).length>0)&&<details><summary>{rest.length>0?`Show ${rest.length} more and the checklist`:'Show checklist'}{failed.length>0&&` (${failed.length} to check)`}</summary>
   {rest.length>0&&<ul>{rest.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
   {(review.checks||[]).length>0&&<ul className="ai-result-checks">{review.checks.map(check=><li key={check.key} data-passed={check.passed}><strong>{labels[check.key]||'Additional check'}:</strong> {check.passed?'OK':'Check this'}{check.evidence&&<span> — {check.evidence}</span>}</li>)}</ul>}
  </details>}
 </section>;
}
export default function RequirementCheckResult({review,compact=false}){
 if(!review||!titles[review.status])return null;
 if(compact)return <CompactResult review={review}/>;
 if(false)return <section className={'requirement-check-result requirement-check-compact '+(review.status==='checks_passed'?'requirement-check-passed':'')} aria-label="Automatic document checks" aria-live="polite">
  <details><summary><Extra review={review}/>{titles[review.status]}<span>Check details</span></summary>
   <p>Use these results to guide your review. You decide whether to approve the document.</p>
   {(review.findings||[]).length>0&&<ul>{review.findings.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
   {(review.checks||[]).length>0&&<ul>{review.checks.map(check=><li key={check.key}><strong>{labels[check.key]||'Additional check'}:</strong> {check.passed?'No issue found':'Needs review'}{check.evidence&&<span> — {check.evidence}</span>}</li>)}</ul>}
  </details>
 </section>;
 return <section className={'requirement-check-result '+(review.status==='checks_passed'?'requirement-check-passed':'')} aria-label="Automatic document checks" aria-live="polite">
  <strong>{titles[review.status]}</strong>
  <p>Automatic checks are advisory. Your coordinator makes the approval decision.</p>
  {(review.findings||[]).length>0&&<ul>{review.findings.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
  {(review.checks||[]).length>0&&<details><summary>View checklist results</summary><ul>{review.checks.map(check=><li key={check.key}><strong>{labels[check.key]||'Additional check'}:</strong> {check.passed?'No issue found':'Needs review'}{check.evidence&&<span> — {check.evidence}</span>}</li>)}</ul></details>}
 </section>;
}
