import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationFormBuilder, { defaultEvaluationForm } from './EvaluationFormBuilder';
test('edits collapsed questions through their action menu', () => {
 function Harness(){const [form,setForm]=useState(defaultEvaluationForm);const [openId,setOpenId]=useState(null);return <EvaluationFormBuilder value={form} onChange={setForm} openId={openId} setOpenId={setOpenId}/>;}
 Object.defineProperty(global.crypto,'randomUUID',{configurable:true,value:()=> 'fixture-added-question'});
 render(<Harness/>);
 fireEvent.change(screen.getByLabelText('Evaluation title'),{target:{value:'My review'}});
 fireEvent.click(screen.getByRole('button',{name:/01.*Technical Skills/}));
 fireEvent.change(screen.getByLabelText('Answer type'),{target:{value:'text'}});
 fireEvent.click(screen.getByLabelText('Required'));
 expect(screen.getByLabelText('Required')).not.toBeChecked();
 fireEvent.click(screen.getByRole('button',{name:'Actions for question 1'}));
 fireEvent.click(screen.getByRole('button',{name:'Move down'}));
 expect(screen.getByLabelText('Question 2')).toHaveValue('Technical Skills');
 fireEvent.click(screen.getByRole('button',{name:'Actions for question 2'}));
 fireEvent.click(screen.getByRole('button',{name:'Remove'}));
 expect(screen.queryByText('Technical Skills')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'+ Add question'}));
 expect(screen.getByLabelText('Question 6')).toHaveValue('');
});
