export type AppPageAccessDefinition = {
  key: string;
  label: string;
  route: string;
  description: string;
  adminOnly?: boolean;
};

export const appPageAccessDefinitions = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    route: '/',
    description: 'Command deck and global metrics.',
  },
  {
    key: 'generator',
    label: 'Generator',
    route: '/test-generator',
    description: 'Launch source-driven or KB-driven generation.',
  },
  {
    key: 'generationRuns',
    label: 'Generation Runs',
    route: '/test-generator/runs',
    description: 'Inspect generation run history.',
  },
  {
    key: 'testSuites',
    label: 'Test Suites',
    route: '/test-generator/review',
    description: 'Review and approve generated suites.',
  },
  {
    key: 'manualExecution',
    label: 'Manual Execution',
    route: '/manual-execution',
    description: 'Run approved suites manually.',
  },
  {
    key: 'knowledgeBase',
    label: 'Knowledge Base',
    route: '/knowledge-base',
    description: 'Unified workspace for knowledge authoring.',
  },
  {
    key: 'exports',
    label: 'Testcase Library',
    route: '/test-generator/export',
    description: 'Approved suites organized for scoped export.',
  },
  {
    key: 'admin',
    label: 'Admin',
    route: '/admin',
    description: 'Manage users and access controls.',
    adminOnly: true,
  },
] as const satisfies readonly AppPageAccessDefinition[];

export type AppPageAccessKey = (typeof appPageAccessDefinitions)[number]['key'];

export const appPageAccessKeys = appPageAccessDefinitions.map((definition) => definition.key) as AppPageAccessKey[];

export const appPageAccessRoutes = new Map(appPageAccessDefinitions.map((definition) => [definition.key, definition.route]));
