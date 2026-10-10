import React from 'react';
import { createRoot } from 'react-dom/client';
import CompanyDirectoryTab from '../src/pages/CompanyDirectoryTab';
createRoot(document.getElementById('root')).render(<CompanyDirectoryTab readOnly={false} />);
