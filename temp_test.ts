import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createEligianServices } from './packages/language/src/eligian-module.js';
import type { Program } from './packages/language/src/generated/ast.js';

const services = createEligianServices(EmptyFileSystem);
const parse = parseHelper<Program>(services.Eligian);

const code = `
  const if = 5
  timeline "Test" at 0s {}
`;

const document = await parse(code);
await services.shared.workspace.DocumentBuilder.build([document], { validation: true });

console.log('Diagnostics:', document.diagnostics);
console.log('All validation errors:', document.diagnostics?.filter(d => d.severity === 1));
