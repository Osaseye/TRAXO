const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const docx = 'TrendFollowing_Complete_Guide.docx';
const slug = 'trend-following';
const tempDir = path.join(__dirname, 'temp_tf');

if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
fs.mkdirSync(tempDir);

const zipPath = path.join(tempDir, slug + '.zip');
const outFolder = path.join(tempDir, slug);
fs.copyFileSync(docx, zipPath);

execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outFolder}' -Force"`);

const xml = fs.readFileSync(path.join(outFolder, 'word', 'document.xml'), 'utf8');
const pMatches = xml.match(/<w:p[^>]*>.*?<\/w:p>/g) || [];
const lines = pMatches.map(p => {
  const tMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
  return tMatches.map(t =>
    t.replace(/<w:t[^>]*>|<\/w:t>/g, '')
     .replace(/&amp;/g, '&')
     .replace(/&lt;/g, '<')
     .replace(/&gt;/g, '>')
     .replace(/&quot;/g, '"')
     .replace(/&apos;/g, "'")
  ).join('');
}).filter(l => l.trim().length > 0);

fs.writeFileSync('trend-following_extracted_text.txt', lines.join('\n\n'), 'utf8');
fs.rmSync(tempDir, { recursive: true });
console.log('Done. Lines:', lines.length);
