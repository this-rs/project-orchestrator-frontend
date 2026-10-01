import fs from 'fs';
const [,, dir, root] = process.argv;
const s = JSON.parse(fs.readFileSync(dir+'/coverage-summary.json'));
const t = s.total; console.log('total lines', t.lines, 'stmts', t.statements.pct, 'branches', t.branches.pct, 'funcs', t.functions.pct);
const files = Object.keys(s).filter(k=>k!=='total');
console.log('files reported', files.length);
const zero = files.filter(f=>s[f].lines.covered===0);
console.log('files with 0 covered lines', zero.length, 'lines', zero.reduce((a,f)=>a+s[f].lines.total,0));
fs.writeFileSync(dir+'/zero.txt', zero.map(f=>f.replace(root+'/','')+' '+s[f].lines.total).join('\n'));
// by top dir
const g={};for(const f of files){const r=f.replace(root+'/src/','');const k=r.includes('/')?r.split('/')[0]:'(root)';g[k]??={t:0,c:0,n:0};g[k].t+=s[f].lines.total;g[k].c+=s[f].lines.covered;g[k].n++}
for(const[k,v]of Object.entries(g).sort())console.log(k,v.n,v.t,v.c,(100*v.c/v.t).toFixed(1))
