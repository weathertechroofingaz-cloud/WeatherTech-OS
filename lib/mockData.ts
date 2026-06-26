export type Company = 'WeatherTech Roofing LLC' | 'IHC Painting';

export type Lead = {
  id: string;
  name: string;
  projectType: 'Roofing' | 'Painting';
  status: 'New' | 'Contacted' | 'Qualified';
  source: string;
  value: string;
};

export type Estimate = {
  id: string;
  customer: string;
  estimateDate: string;
  amount: string;
  status: 'Draft' | 'Sent' | 'Approved';
  company: Company;
};

export type Scope = {
  id: string;
  title: string;
  projectType: 'Roofing' | 'Painting';
  status: 'Draft' | 'Ready' | 'Sent';
  assignedTo: string;
};

export type FollowUp = {
  id: string;
  customer: string;
  dueDate: string;
  type: 'Call' | 'Email' | 'Text';
  status: 'Pending' | 'Completed';
};

export const mockData = {
  leads: [
    { id: 'L-001', name: 'East Ridge Home', projectType: 'Roofing', status: 'New', source: 'Website', value: '$7,800' },
    { id: 'L-002', name: 'Maple Ave Residence', projectType: 'Painting', status: 'Contacted', source: 'Referral', value: '$4,200' },
    { id: 'L-003', name: 'Parkside Townhouse', projectType: 'Roofing', status: 'Qualified', source: 'Google Ad', value: '$12,500' },
  ] as Lead[],
  estimates: [
    { id: 'E-101', customer: 'East Ridge Home', estimateDate: '2026-06-17', amount: '$7,800', status: 'Draft', company: 'WeatherTech Roofing LLC' },
    { id: 'E-102', customer: 'Maple Ave Residence', estimateDate: '2026-06-18', amount: '$4,200', status: 'Sent', company: 'IHC Painting' },
  ] as Estimate[],
  scopes: [
    { id: 'S-211', title: 'Roof replacement - East Ridge', projectType: 'Roofing', status: 'Ready', assignedTo: 'Avery' },
    { id: 'S-212', title: 'Exterior painting - Maple Ave', projectType: 'Painting', status: 'Draft', assignedTo: 'Jordan' },
  ] as Scope[],
  followUps: [
    { id: 'F-301', customer: 'Parkside Townhouse', dueDate: '2026-06-20', type: 'Call', status: 'Pending' },
    { id: 'F-302', customer: 'Maple Ave Residence', dueDate: '2026-06-21', type: 'Email', status: 'Pending' },
  ] as FollowUp[],
};
