const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILES = [
  {
    docx: 'Breakout_Trading_Master_Guide.docx',
    slug: 'breakout'
  },
  {
    docx: 'Order_Block_Strategy_Complete.docx',
    slug: 'order-block'
  },
  {
    docx: 'Supply_Demand_Trading_Strategy.docx',
    slug: 'supply-demand'
  }
];

const workspaceDir = __dirname;
const tempExtractDir = path.join(workspaceDir, 'temp_extracted');

// Ensure clean temp dir
if (fs.existsSync(tempExtractDir)) {
  fs.rmSync(tempExtractDir, { recursive: true, force: true });
}
fs.mkdirSync(tempExtractDir);

FILES.forEach(({ docx, slug }) => {
  console.log(`Processing: ${docx}...`);
  const docxPath = path.join(workspaceDir, docx);
  if (!fs.existsSync(docxPath)) {
    console.error(`File not found: ${docx}`);
    return;
  }

  // Define paths
  const zipPath = path.join(tempExtractDir, `${slug}.zip`);
  const outFolder = path.join(tempExtractDir, slug);

  // Copy to zip
  fs.copyFileSync(docxPath, zipPath);

  // Extract zip using PowerShell
  console.log(`Unzipping ${slug}...`);
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outFolder}' -Force"`);

  // Parse word/document.xml
  const docXmlPath = path.join(outFolder, 'word', 'document.xml');
  if (fs.existsSync(docXmlPath)) {
    console.log(`Extracting text for ${slug}...`);
    const xml = fs.readFileSync(docXmlPath, 'utf8');
    
    // Extract paragraphs w:p
    const pMatches = xml.match(/<w:p[^>]*>.*?<\/w:p>/g) || [];
    const textLines = pMatches.map(p => {
      // Find all text elements w:t inside paragraph
      const tMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
      return tMatches.map(t => {
        // Strip XML tags and return content
        let val = t.replace(/<w:t[^>]*>|<\/w:t>/g, '');
        // Resolve XML entities
        return val
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
      }).join('');
    }).filter(line => line.trim().length > 0);

    const txtContent = textLines.join('\n\n');
    const txtOutPath = path.join(workspaceDir, `${slug}_extracted_text.txt`);
    fs.writeFileSync(txtOutPath, txtContent, 'utf8');
    console.log(`Saved text to ${txtOutPath}`);
  } else {
    console.warn(`No document.xml found for ${slug}`);
  }

  // Move images
  const mediaDir = path.join(outFolder, 'word', 'media');
  const targetImgDir = path.join(workspaceDir, 'public', 'strategies', slug);
  
  if (fs.existsSync(mediaDir)) {
    console.log(`Extracting images for ${slug}...`);
    fs.mkdirSync(targetImgDir, { recursive: true });
    const imgFiles = fs.readdirSync(mediaDir);
    
    imgFiles.forEach(img => {
      const srcPath = path.join(mediaDir, img);
      const destPath = path.join(targetImgDir, img);
      fs.copyFileSync(srcPath, destPath);
      console.log(`Moved: ${img} -> public/strategies/${slug}/${img}`);
    });
  } else {
    console.log(`No images found for ${slug}`);
  }
});

// Clean up zip files
fs.rmSync(tempExtractDir, { recursive: true, force: true });
console.log('Extraction complete!');
