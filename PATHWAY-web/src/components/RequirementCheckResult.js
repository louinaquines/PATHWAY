import './RequirementCheckResult.css';
const labels={readability:'Readable file',document_type:'Correct document type',student_identity:'Profile details match',required_fields:'Required fields',date_consistency:'Date consistency',signature_presence:'Signature area present',placement_match:'Placement details match'};
const titles={queued:'AI checking queued',checking:'AI checking',checks_passed:'Checks passed — approval pending',needs_review:'Coordinator review needed'};
export default function RequirementCheckResult({review}){
 if(!review||!titles[review.status])return null;
 return <section className={'requirement-check-result '+(review.status==='checks_passed'?'requirement-check-passed':'')} aria-label="Automatic document checks" aria-live="polite">
  <strong>{titles[review.status]}</strong>
  <p>Automatic checks are advisory. Your coordinator makes the approval decision.</p>
  {(review.findings||[]).length>0&&<ul>{review.findings.map((finding,index)=><li key={index}>{finding}</li>)}</ul>}
  {(review.checks||[]).length>0&&<details><summary>View checklist results</summary><ul>{review.checks.map(check=><li key={check.key}><strong>{labels[check.key]||'Additional check'}:</strong> {check.passed?'No issue found':'Needs review'}{check.evidence&&<span> — {check.evidence}</span>}</li>)}</ul></details>}
 </section>;
}
