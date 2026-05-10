export const updateRulesCommand = async (_args: string[]): Promise<void> => {
  console.log('Rule update requires a skill-guard API key.');
  console.log('');
  console.log('Usage:');
  console.log('  skill-guard update-rules --api-key <key>');
  console.log('');
  console.log('This feature is available with a Pro subscription.');
  console.log('For now, rules are loaded from the local rules/base/ directory.');
};
