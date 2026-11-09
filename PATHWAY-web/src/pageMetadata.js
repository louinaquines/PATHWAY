export const COORDINATOR_PAGE_TITLES = {
  overview: 'Dashboard',
  requirements: 'Student Requirements',
  logbook: 'Attendance & Journals',
  evaluations: 'Supervisor Evaluations',
  clearance: 'Student Clearance',
  placements: 'Company Placements',
  companies: 'Company Directory',
  sections: 'Sections & Students',
  registrations: 'Student Accounts',
  analytics: 'Internship Progress',
  messages: 'Messages',
  notifications: 'Announcements & Alerts',
  classlist: 'Class List & Accounts',
  profile: 'Coordinator Profile',
};

const descriptions = {
  overview: 'See what needs attention in your PATHWAY section.',
  login: 'Secure staff access to the PATHWAY OJT management portal.',
  requirements: 'Review and manage student OJT requirements in PATHWAY.',
  sections: 'Manage OJT sections, requirements, and student assignments in PATHWAY.',
  companies: 'View the PATHWAY partner company directory and internship capacity.',
  logbook: 'Review student OJT logbook submissions in PATHWAY.',
  registrations: 'Review student registrations in PATHWAY.',
  classlist: 'Manage the authorized student roster in PATHWAY.',
  analytics: 'Monitor OJT progress and attendance analytics in PATHWAY.',
  notifications: 'Manage PATHWAY announcements and notifications.',
  evaluations: 'Manage supervisor evaluations in PATHWAY.',
  clearance: 'Review OJT clearance readiness in PATHWAY.',
  admin: 'Manage PATHWAY accounts, terms, settings, and audit records.',
  evaluate: 'Complete a PATHWAY OJT supervisor evaluation.',
};

export function setPageMetadata(view, role = '') {
  const key = view || 'login';
  const name = key === 'admin' ? 'Admin' : key === 'evaluate' ? 'Supervisor Evaluation' : key.charAt(0).toUpperCase() + key.slice(1);
  const coordinatorTitle = role === 'coordinator' ? COORDINATOR_PAGE_TITLES[key] : undefined;
  document.title = `PATHWAY · ${coordinatorTitle ?? name}`;
  let description = document.querySelector('meta[name="description"]');
  if (!description) {
    description = document.createElement('meta');
    description.name = 'description';
    document.head.appendChild(description);
  }
  description.content = descriptions[key] || descriptions.login;
  let robots = document.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.name = 'robots';
    document.head.appendChild(robots);
  }
  robots.content = role || key !== 'login' ? 'noindex, nofollow' : 'index, follow';
}
