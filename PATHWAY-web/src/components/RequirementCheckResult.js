import './RequirementCheckResult.css';
const labels={readability:'Readable file',document_type:'Correct document type',student_identity:'Profile details match',required_fields:'Required fields',date_consistency:'Date consistency',signature_presence:'Signature area present',placement_match:'Placement details match',reference_match:'Matches reference file',required_phrases:'Required phrases present'}
const tiers={green:'Green',yellow:'Yellow',red:'Red'};
const nameText={match:'Name matches profile',partial:'Name partly matches — confirm',mismatch:'Name does not match profile',missing:'Name not found on document'};
const Extra=({review})=><>{review.tier&&<span className={'requirement-tier requirement-tier-'+review.tier}>{tiers[review.tier]}</span>}{review.nameCheck&&<span className="requirement-name-check">{nameText[review.nameCheck.result]}</span>}</>;;
const titles={queued:'Waiting for automatic check',checking:'Checking document',checks_passed:'Automatic check passed. Approval still needed.',needs_review:'Coordinator review needed'};
export default function RequirementCheckResult({review,compact=false}){
 if(!review||!titles[review.status])return null;
 if(compact)return <section className={'requirement-check-result requirement-check-compact '+(review.status==='checks_passed'?'requirement-check-passed':'')} aria-label="Automatic document checks" aria-live="polite">
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
