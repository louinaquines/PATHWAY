import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationFormBuilder, { defaultEvaluationForm } from './EvaluationFormBuilder';
test('edits questions inline', () => {
 function Harness(){const [form,setForm]=useState(defaultEvaluationForm);return <EvaluationFormBuilder value={form} onChange={setForm}/>;}
 Object.defineProperty(global.crypto,'randomUUID',{configurable:true,value:()=> 'fixture-added-question'});
 render(<Harness/>);
 fireEvent.change(screen.getByLabelText('Evaluation title'),{target:{value:'My review'}});
 fireEvent.click(screen.getAllByRole('button',{name:'Written'})[0]);
 expect(screen.getAllByRole('button',{name:'Written'})[0]).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByLabelText('Required for question 1'));
 expect(screen.getByLabelText('Required for question 1')).not.toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Move question 1 down'}));
 expect(screen.getByLabelText('Question 2')).toHaveValue('Technical Skills');
 fireEvent.click(screen.getByRole('button',{name:'Remove question 2'}));
 expect(screen.queryByDisplayValue('Technical Skills')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'+ Add a question'}));
 expect(screen.getByLabelText('Question 6')).toHaveValue('');
});
