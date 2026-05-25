const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILES = [
  { docx: 'Breakout_Trading_Master_Guide.docx', slug: 'breakout' },
  { docx: 'Order_Block_Strategy_Complete.docx', slug: 'order-block' },
  { docx: 'Supply_Demand_Trading_Strategy.docx', slug: 'supply-demand' }
];

const workspaceDir = __dirname;
const tempExtractDir = path.join(workspaceDir, 'temp_mapping');

if (fs.existsSync(tempExtractDir)) {
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}
fs.mkdirSync(tempExtractDir);

FILES.forEach(({ docx, slug }) => {
  const docxPath = path.join(workspaceDir, docx);
  if (!fs.existsSync(docxPath)) return;

  const zipPath = path.join(tempExtractDir, `${slug}.zip`);
  const outFolder = path.join(tempExtractDir, slug);

  fs.copyFileSync(docxPath, zipPath);
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outFolder}' -Force"`);

  // Read relations
  const relsXmlPath = path.join(outFolder, 'word', '_rels', 'document.xml.rels');
  const docXmlPath = path.join(outFolder, 'word', 'document.xml');

  if (fs.existsSync(relsXmlPath) && fs.existsSync(docXmlPath)) {
    const relsXml = fs.readFileSync(relsXmlPath, 'utf8');
    const docXml = fs.readFileSync(docXmlPath, 'utf8');

    // Parse relations to map rId -> target filename
    const relMatches = relsXml.match(/Id="([^"]+)"[^>]+Target="media\/([^"]+)"/g) || [];
    const relMap = {};
    relMatches.forEach(rel => {
      const idM = rel.match(/Id="([^"]+)"/);
      const targetM = rel.match(/Target="media\/([^"]+)"/);
      if (idM && targetM) {
        relMap[idM[1]] = targetM[1];
      }
    });

    // Scan docXml in order of appearance for embed rIds
    const embedMatches = docXml.match(/r:embed="([^"]+)"/g) || [];
    const orderedImages = [];
    embedMatches.forEach(embed => {
      const idM = embed.match(/r:embed="([^"]+)"/);
      if (idM) {
        const rId = idM[1];
        const filename = relMap[rId];
        if (filename && !orderedImages.includes(filename)) {
          orderedImages.push(filename);
        }
      }
    });

    console.log(`\n--- ${slug.toUpperCase()} IMAGES IN ORDER ---`);
    orderedImages.forEach((img, idx) => {
      console.log(`Figure ${idx + 1}: ${img}`);
    });
  }
});

fs.rmSync(tempExtractDir, { recursive: true, force: true });
