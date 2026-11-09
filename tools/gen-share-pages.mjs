// 문서별 미리보기(OG) 페이지 생성: d/<view>-<code>/index.html
// 각 파일은 그 문서의 'Q 제목'을 <title>/og:title 로 갖고, 사람이 열면 본 사이트 해시 주소로 즉시 이동한다.
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

// 저장소 루트: 인자로 받거나, 이 파일(tools/) 의 상위 폴더
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SITE = 'https://triup-devteam.github.io/triup-motion-faq/';
const OG_IMAGE = SITE + 'images/logo-motion.png';
const SITE_NAME = 'Triup Motion E 고객센터';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// index.html 의 docCode 와 '한 글자도' 같아야 한다 (안 맞으면 리다이렉트가 문서를 못 찾는다)
// FAQ 제목의 'Q. ' 접두어는 해시 입력에서 뺀다 — 접두어를 붙이기 전에 배포한 공유 주소를 그대로 유지하기 위해.
function docCode(t){ var s = (t || '').trim().replace(/^Q\s*\.\s*/, ''), h = 5381; for(var i = 0; i < s.length; i++){ h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0; } return h.toString(36); }

function dec(s){
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, '\u00a0')
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (m, d) => String.fromCodePoint(parseInt(d, 16)))
    .replace(/&amp;/g, '&');
}
function text(frag){ return dec(String(frag).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(); }
function attr(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function slice(startMark, endMark){
  const a = html.indexOf(startMark);
  if(a < 0) throw new Error('못 찾음: ' + startMark);
  const b = html.indexOf(endMark, a);
  if(b < 0) throw new Error('닫는 태그 못 찾음: ' + startMark);
  return html.slice(a, b);
}

const SECTIONS = [
  { view: 'faq',    label: 'FAQ',     list: 'id="faq-list"', listEnd: '</aside>', detail: 'id="faq-detail"', detailEnd: '</section>' },
  { view: 'manual', label: '매뉴얼',   list: 'id="man-list"', listEnd: '</aside>', detail: 'id="man-detail"', detailEnd: '</section>' },
  { view: 'notice', label: '공지사항', list: 'id="ntc-list"', listEnd: '</aside>', detail: 'id="ntc-detail"', detailEnd: '</section>' },
  { view: 'update', label: '업데이트', list: 'id="upd-list"', listEnd: '</aside>', detail: 'id="upd-detail"', detailEnd: '</section>' },
];

const docs = [];
const warn = [];

for(const S of SECTIONS){
  const listHtml = slice(S.list, S.listEnd);
  const detailHtml = slice(S.detail, S.detailEnd);

  // 목록 버튼: data-id -> qi-text (docCode 의 입력)
  const titles = new Map();
  const order = [];
  const reItem = /<button class="q-item"([\s\S]*?)<\/button>/g;
  let m;
  while((m = reItem.exec(listHtml))){
    const chunk = m[0];
    const id = (chunk.match(/data-id="([^"]+)"/) || [])[1];
    const t = (chunk.match(/<span class="qi-text">([\s\S]*?)<\/span>/) || [])[1];
    if(!id || t == null){ warn.push(`${S.view}: 버튼 파싱 실패`); continue; }
    titles.set(id, text(t));
    order.push(id);
  }

  // 상세 패널: data-id -> dp-q(제목), dp-body 첫 문단(설명)
  const parts = detailHtml.split('<div class="detail-panel" data-id="').slice(1);
  const panels = new Map();
  for(const p of parts){
    const id = p.slice(0, p.indexOf('"'));
    const q = (p.match(/<h2 class="dp-q">([\s\S]*?)<\/h2>/) || [])[1];
    const body = (p.match(/<div class="dp-body">([\s\S]*)/) || [])[1] || '';
    const firstP = (body.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || '';
    panels.set(id, { q: q == null ? '' : text(q), desc: text(firstP) });
  }

  for(const id of order){
    const title = titles.get(id);
    const pan = panels.get(id);
    if(!pan){ warn.push(`${S.view}/${id}: 상세 패널 없음 → 건너뜀`); continue; }
    if(!title){ warn.push(`${S.view}/${id}: 제목 비어 있음 → 건너뜀`); continue; }
    if(pan.q && pan.q !== title) warn.push(`${S.view}/${id}: 목록 제목과 상세 제목 불일치\n    목록: ${title}\n    상세: ${pan.q}`);
    docs.push({ view: S.view, label: S.label, id, title, code: docCode(title), desc: pan.desc });
  }
}

// 코드 충돌 검사(같은 섹션 안에서 제목이 같으면 주소가 겹친다)
const seen = new Map();
for(const d of docs){
  const key = d.view + '-' + d.code;
  if(seen.has(key)) warn.push(`주소 충돌: ${key} ← "${seen.get(key)}" / "${d.title}"`);
  else seen.set(key, d.title);
}

function page(d){
  const url = SITE + 'd/' + d.view + '-' + d.code + '/';
  const target = '../../#' + d.view + '/' + d.code;
  const desc = d.desc ? d.desc.slice(0, 120) + (d.desc.length > 120 ? '…' : '') : `${SITE_NAME} ${d.label} 문서`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(d.title)}</title>
<meta name="description" content="${attr(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${attr(SITE_NAME)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${attr(d.title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${attr(url)}">
<meta property="og:image" content="${attr(OG_IMAGE)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${attr(d.title)}">
<meta name="twitter:description" content="${attr(desc)}">
<meta name="twitter:image" content="${attr(OG_IMAGE)}">
<link rel="icon" href="../../images/logo-motion.png">
<!-- 사람이 열면 본 사이트의 해당 문서로 즉시 이동. meta refresh 를 쓰지 않는 이유: 일부 미리보기 봇이 이를 따라가면
     문서 제목 대신 사이트 공통 제목을 가져가기 때문. 봇은 JS 를 실행하지 않으므로 위 og 태그를 그대로 읽는다. -->
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{margin:0;padding:48px 20px;font-family:"Malgun Gothic","맑은 고딕",system-ui,sans-serif;text-align:center;color:#182234;background:#f4f7fb}a{color:#2172de;font-weight:700}</style>
</head>
<body>
<p>${attr(d.title)}</p>
<p><a href="${attr(target)}">문서 열기 →</a></p>
</body>
</html>
`;
}

// ---- 옛 주소 별칭 ----
// 제목이 바뀌면 docCode 가 달라져 이미 배포한 공유 주소가 404 가 된다.
// tools/doc-aliases.json 의 aliases: { "<옛 폴더>": "<그 다음 폴더>" }
// 제목이 두 번 이상 바뀌어도 한 칸씩 따라가 마지막 살아 있는 문서까지 이어간다(연쇄 해석).
const liveCodes = new Set(docs.map(d => d.view + '-' + d.code));
const byCode = new Map(docs.map(d => [d.view + '-' + d.code, d]));

const ALIAS_FILE = path.join(ROOT, 'tools', 'doc-aliases.json');
let aliasRaw = {};
if(fs.existsSync(ALIAS_FILE)){
  try {
    aliasRaw = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')).aliases || {};
  } catch(e){
    warn.push('doc-aliases.json 을 읽지 못했다 (별칭 없이 진행): ' + e.message);
  }
}

const aliasTargets = new Map(); // 옛 폴더 -> 살아 있는 문서
for(const from of Object.keys(aliasRaw)){
  if(liveCodes.has(from)){
    warn.push('별칭이 살아 있는 주소를 덮으려 한다 (무시): ' + from);
    continue;
  }
  let cur = aliasRaw[from];
  let hops = 0;
  while(!liveCodes.has(cur) && aliasRaw[cur] && hops < 20){ cur = aliasRaw[cur]; hops++; }
  if(!liveCodes.has(cur)){
    warn.push('별칭의 끝이 지금 문서가 아니다 (건너뜀): ' + from + ' -> ' + cur);
    continue;
  }
  aliasTargets.set(from, byCode.get(cur));
}

// ---- 폴더 쓰기 ----
const outDir = path.join(ROOT, 'd');
fs.rmSync(outDir, { recursive: true, force: true });
for(const d of docs){
  const dir = path.join(outDir, d.view + '-' + d.code);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(d), 'utf8');
}
// 별칭 폴더는 대상 문서와 같은 내용을 쓴다(og 제목·설명이 그 문서로 나오고, 사람은 그 문서로 넘어간다).
for(const [from, d] of aliasTargets){
  const dir = path.join(outDir, from);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(d), 'utf8');
}

// ---- 사라진 옛 주소 검사 ----
// git 이력에 있었는데 이번에 안 만들어지고 별칭도 없는 폴더 = 그 주소로 보낸 링크가 404 가 된다.
let gone = [];
try {
  const commits = execFileSync('git', ['rev-list', 'HEAD', '--', 'd'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const hist = new Set();
  for(const c of commits){
    const out = execFileSync('git', ['ls-tree', '--name-only', c, '--', 'd/'], { cwd: ROOT, encoding: 'utf8' });
    for(let line of out.split('\n')){
      if(!line.startsWith('d/')) continue;
      line = line.slice(2);
      if(line.endsWith('/')) line = line.slice(0, -1);
      if(line) hist.add(line);
    }
  }
  gone = [...hist].filter(n => !liveCodes.has(n) && !aliasTargets.has(n)).sort();
} catch(e){
  gone = null; // git 이 없거나 저장소가 아니면 검사하지 않는다
}

const bySec = {};
for(const d of docs) bySec[d.view] = (bySec[d.view] || 0) + 1;
console.log('생성:', docs.length, '건', JSON.stringify(bySec));
console.log('예시:', docs[0].view + '-' + docs[0].code, '->', docs[0].title);
if(aliasTargets.size){
  console.log('옛 주소 별칭:', aliasTargets.size, '건');
  for(const [from, d] of aliasTargets) console.log('  ' + from + ' -> ' + d.view + '-' + d.code + '  (' + d.title + ')');
} else {
  console.log('옛 주소 별칭: 없음');
}
if(gone === null){
  console.log('사라진 옛 주소 검사: 건너뜀 (git 확인 불가)');
} else if(gone.length){
  console.log('');
  console.log('--- 링크가 죽은 옛 주소 ' + gone.length + '건 ---');
  console.log('  제목이 바뀐 문서다. tools/doc-aliases.json 의 aliases 에 아래 줄을 넣고 다시 돌릴 것:');
  for(const n of gone) console.log('    "' + n + '": "<지금 주소>",');
} else {
  console.log('사라진 옛 주소: 없음 (지금까지 배포한 공유 링크가 모두 열린다)');
}
if(warn.length){ console.log('\n--- 확인 필요 ---'); warn.forEach(w => console.log('  ' + w)); }
else console.log('경고 없음');
