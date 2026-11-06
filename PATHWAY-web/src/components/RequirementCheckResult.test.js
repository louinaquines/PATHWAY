import {render,screen} from '@testing-library/react';
import RequirementCheckResult from './RequirementCheckResult';
test('passed checks are visibly pending human approval, with readable findings',()=>{
 render(<RequirementCheckResult review={{status:'checks_passed',checks:[{key:'readability',passed:true,evidence:'Text is visible.'}],findings:[]}}/>);
 expect(screen.getByText('Checks passed — approval pending')).toBeInTheDocument();
 expect(screen.getByText(/coordinator makes the approval decision/)).toBeInTheDocument();
 expect(screen.getByText('Readable file:')).toBeInTheDocument();
});
test('coordinator review displays the reason without claiming rejection',()=>{
 render(<RequirementCheckResult review={{status:'needs_review',checks:[],findings:['The date is unreadable.']}}/>);
 expect(screen.getByText('Coordinator review needed')).toBeInTheDocument();
 expect(screen.getByText('The date is unreadable.')).toBeInTheDocument();
 expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
});

test('compact review keeps findings accessible behind an expandable summary',()=>{
 render(<RequirementCheckResult compact review={{status:'needs_review',findings:['Permission was not provided.'],checks:[]}}/>);
 const reason=screen.getByText('Permission was not provided.');
 expect(reason.closest('details')).not.toHaveAttribute('open');
 expect(screen.getByText('Coordinator review needed')).toBeInTheDocument();
 expect(screen.getByText(/You make the approval decision/)).toBeInTheDocument();
});
