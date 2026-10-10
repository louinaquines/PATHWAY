// Browser acceptance fixture only. Does not contact a backend or persist data.
const companies = [];
export async function adminRequest(path, options = {}) {
  if (path === '/coordinator/company-directory') return { companies: [...companies] };
  if (path === '/coordinator/company-profile-preview') return { preview: {
    name: 'Sample Test Company', description: 'Public company details for isolated preview testing.',
    email: 'contact@example.com', phone: '+63 000 000 0000', sourceUrl: 'https://example.com/',
    warning: 'Confirm all suggestions before saving. Address and attendance location are not inferred.',
  } };
  if (path === '/coordinator/companies' && options.method === 'POST') {
    const company = { ...JSON.parse(options.body), id: `fixture-${companies.length}`, occupiedSlots: 0 };
    company.availableSlots = company.capacity;
    companies.push(company);
    return { company };
  }
  throw new Error('Operation not supported by isolated fixture.');
}
