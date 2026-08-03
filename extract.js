const fs = require('fs');
const path = require('path');

const extract = (htmlPath, cssRelativePath, jsRelativePath) => {
    const basePath = 'd:/Documents/Code/Primadev-App';
    const absHtml = path.join(basePath, htmlPath);
    const absCss = path.join(basePath, cssRelativePath);
    const absJs = path.join(basePath, jsRelativePath);

    if (!fs.existsSync(absHtml)) {
        console.log("File not found: " + absHtml);
        return;
    }

    let content = fs.readFileSync(absHtml, 'utf8');

    // Extract CSS
    const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/);
    if (styleMatch) {
        fs.mkdirSync(path.dirname(absCss), { recursive: true });
        fs.writeFileSync(absCss, styleMatch[1].trim());
        content = content.replace(styleMatch[0], `<link rel="stylesheet" href="${cssRelativePath}">`);
        console.log(`Extracted CSS to ${cssRelativePath}`);
    }

    // Extract JS - exclude external scripts and match the main inline script block
    // <script> with no attributes
    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
        fs.mkdirSync(path.dirname(absJs), { recursive: true });
        fs.writeFileSync(absJs, scriptMatch[1].trim());
        content = content.replace(scriptMatch[0], `<script src="${jsRelativePath}"></script>`);
        console.log(`Extracted JS to ${jsRelativePath}`);
    }

    fs.writeFileSync(absHtml, content);
};

extract('/app/career.html', '/public/css/career.css', '/public/js/career.js');
extract('/app/admin-dashboard.html', '/public/css/admin.css', '/public/js/admin.js');
console.log('Extraction complete.');
