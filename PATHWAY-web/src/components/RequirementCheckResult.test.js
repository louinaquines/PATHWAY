import {render,screen} from '@testing-library/react';
import RequirementCheckResult from './RequirementCheckResult';
test('passed checks are visibly pending human approval, with readable findings',()=>{
 render(<RequirementCheckResult review={{status:'checks_passed',checks:[{key:'readability',passed:true,evidence:'Text is visible.'}],findings:[]}}/>);
 expect(screen.getByText('Automatic check passed. Approval still needed.')).toBeInTheDocument();
 expect(screen.getByText(/coordinator makes the approval decision/)).toBeInTheDocument();
 expect(screen.getByText('Readable file:')).toBeInTheDocument();
});
test('coordinator review displays the reason without claiming rejection',()=>{
 render(<RequirementCheckResult review={{status:'needs_review',checks:[],findings:['The date is unreadable.']}}/>);
 expect(screen.getByText('Coordinator review needed')).toBeInTheDocument();
 expect(screen.getByText('The date is unreadable.')).toBeInTheDocument();
 expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
});

test('compact review shows a plain status and the top findings directly',()=>{
 render(<RequirementCheckResult compact review={{status:'needs_review',tier:'yellow',findings:['End date is before start date.','No student name.','Address incomplete.','Notarial date later.'],checks:[{key:'readability',passed:true}]}}/>);
 expect(screen.getByText('Needs a closer look')).toBeInTheDocument();
 expect(screen.getByText('End date is before start date.').closest('details')).toBeNull();
 expect(screen.getByText('Notarial date later.').closest('details')).not.toHaveAttribute('open');
 expect(screen.getByText(/you decide/)).toBeInTheDocument();
});
test('compact review explains when a document was not auto-checked',()=>{
 render(<RequirementCheckResult compact review={{status:'needs_review',reason:'consent_required',findings:[],checks:[]}}/>);
 expect(screen.getByText('Not auto-checked — review manually')).toBeInTheDocument();
});
