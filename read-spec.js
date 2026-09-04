const fs = require('fs');
try {
  const spec = fs.readFileSync('docs/SPEC.md', 'utf8');
  console.log('Length:', spec.length);
  const lines = spec.split('\n');
  console.log('Total lines:', lines.length);
  // Find headings or sections
  const headings = lines.filter(l => l.trim().startsWith('#'));
  console.log('Headings:');
  headings.forEach(h => console.log('  ' + h.trim()));
} catch (e) {
  console.error('Error:', e.message);
}
