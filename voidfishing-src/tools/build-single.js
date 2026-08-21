/* Inlines every stylesheet and script into one self-contained index file.
   Classic scripts concatenate in order, so this is a straight substitution. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = (html.match(/<link rel="stylesheet" href="([^"]+)">/g) || [])
  .map(tag => tag.match(/href="([^"]+)"/)[1]);
const js = (html.match(/<script src="([^"]+)"><\/script>/g) || [])
  .map(tag => tag.match(/src="([^"]+)"/)[1]);

const styles = css.map(f => '/* ' + f + ' */\n' + fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const scripts = js.map(f => '/* ' + f + ' */\n' + fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

// drop the individual tags, then inject the combined blocks
html = html.replace(/<link rel="stylesheet" href="[^"]+">\n?/g, '');
html = html.replace(/<!-- [a-z ]+ -->\n?(?=<script src=)/g, '');
html = html.replace(/<script src="[^"]+"><\/script>\n?/g, '');
html = html.replace('</head>', '<style>\n' + styles + '\n</style>\n</head>');
html = html.replace('</body>', '<script>\n' + scripts + '\n</script>\n</body>');

const out = path.join(root, 'dist', 'void-fishing.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', path.relative(root, out),
            (fs.statSync(out).size / 1024).toFixed(0) + 'KB',
            '(' + css.length + ' stylesheets, ' + js.length + ' scripts inlined)');
