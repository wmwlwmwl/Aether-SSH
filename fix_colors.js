const fs = require('fs');
let content = fs.readFileSync('frontend/src/components/ProbePanel.jsx', 'utf8');
content = content.replace(/'#e2e8f0'/g, "'var(--text-1)'")
                 .replace(/'#94a3b8'/g, "'var(--text-3)'")
                 .replace(/'#64748b'/g, "'var(--text-4)'")
                 .replace(/'#475569'/g, "'var(--text-4)'")
                 .replace(/rgba\(255,255,255,0\.03\)/g, "var(--bg-2)")
                 .replace(/rgba\(255,255,255,0\.04\)/g, "var(--border-light)")
                 .replace(/rgba\(255,255,255,0\.06\)/g, "var(--border)")
                 .replace(/rgba\(255,255,255,0\.07\)/g, "var(--border)")
                 .replace(/rgba\(255,255,255,0\.02\)/g, "var(--bg-1)")
                 .replace(/rgba\(255,255,255,0\.08\)/g, "var(--border-light)")
                 .replace(/'#171e1b'/g, "'var(--bg-1)'")
                 .replace(/rgba\(0,0,0,0\.72\)/g, "rgba(0,0,0,0.5)");
fs.writeFileSync('frontend/src/components/ProbePanel.jsx', content, 'utf8');
