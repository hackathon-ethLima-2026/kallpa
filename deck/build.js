const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

// ---------- KALLPA design system ----------
const BG    = "0B0F16"; // noche andina (ink azulado)
const CARD  = "121A26"; // card bg
const EDGE  = "23304280"; // no alpha allowed -> use solid
const BORDER= "223046"; // card border
const INK   = "F4F2EC"; // texto principal (blanco cálido)
const MUTED = "8A94A6"; // gris azulado
const GOLD  = "F0B429"; // oro andino (acento principal)
const GOLDD = "C98F1B"; // oro oscuro
const ARB   = "12AAFF"; // azul Arbitrum (solo tags técnicos)
const F     = "Arial";
const MONO  = "Courier New";
const MX    = 0.9; // margen izquierdo

function base(s){ s.background = { color: BG }; }

// marca: círculo de 8 puntos (la junta) alrededor de un rombo (la caja)
function mark(s, cx, cy, r, dot, goldCenter=true){
  for(let i=0;i<8;i++){
    const a = (Math.PI*2*i)/8 - Math.PI/2;
    s.addShape("ellipse", { x: cx + r*Math.cos(a) - dot/2, y: cy + r*Math.sin(a) - dot/2, w: dot, h: dot, fill: { color: GOLD }, line: { type: "none" } });
  }
  const sq = r*0.62;
  s.addShape("rect", { x: cx - sq/2, y: cy - sq/2, w: sq, h: sq, rotate: 45, fill: goldCenter ? { color: GOLD } : { color: BG }, line: { color: GOLD, width: 1.25 } });
}

function logo(s, x, y, scale=1){
  mark(s, x+0.26*scale, y+0.26*scale, 0.20*scale, 0.055*scale);
  s.addText("KALLPA", { x: x+0.58*scale, y: y, w: 2.4*scale, h: 0.52*scale, fontFace: F, fontSize: 20*scale, bold: true, color: INK, charSpacing: 3, margin: 0, valign: "middle" });
}

function kicker(s, label, y=0.72){
  s.addText(label.toUpperCase(), { x: MX, y: y, w: 6, h: 0.3, fontFace: MONO, fontSize: 12, color: GOLD, charSpacing: 4, margin: 0 });
}

function chip(s, txt, x, y, w, color=GOLD){
  s.addShape("roundRect", { x, y, w, h: 0.34, rectRadius: 0.06, fill: { color: BG }, line: { color: color, width: 0.75 } });
  s.addText(txt, { x, y: y+0.005, w, h: 0.33, fontFace: MONO, fontSize: 10.5, color: color, align: "center", valign: "middle", margin: 0 });
}

// ============ 1 · PORTADA ============
let s = p.addSlide(); base(s);
logo(s, MX, 0.62, 1.15);
s.addText([
  { text: "La caja que no puede\n", options: { color: INK } },
  { text: "mentir", options: { color: BG, highlight: GOLD } },
  { text: " ni ", options: { color: INK } },
  { text: "robar", options: { color: BG, highlight: GOLD } },
  { text: ".", options: { color: INK } },
], { x: MX, y: 1.85, w: 10.6, h: 2.7, fontFace: F, fontSize: 60, bold: true, lineSpacing: 66, margin: 0 });
s.addText("Ahorro comunitario custodiado por código: la junta de toda la vida, ahora con solvencia auto-verificable y un score de crédito que se computa en la cadena.",
  { x: MX, y: 4.75, w: 8.6, h: 0.95, fontFace: F, fontSize: 17, color: MUTED, lineSpacing: 24, margin: 0 });
s.addText("Hackathon Ethereum Lima 2026 · Track Arbitrum · DeFi + AI × Blockchain",
  { x: MX, y: 6.75, w: 9.5, h: 0.32, fontFace: F, fontSize: 12.5, color: MUTED, margin: 0 });
mark(s, 11.55, 3.35, 1.05, 0.21, true);

// ============ 2 · EL PROBLEMA ============
s = p.addSlide(); base(s);
kicker(s, "El problema");
s.addText("La plata de la gente vive en cajas\nque nadie puede auditar.", { x: MX, y: 1.05, w: 11.3, h: 1.75, fontFace: F, fontSize: 40, bold: true, color: INK, lineSpacing: 46, margin: 0 });
const probCards = [
  ["Cooperativas", "La SBS disolvió 42 COOPAC en un solo año. Los socios nunca pudieron ver las reservas."],
  ["Juntas y panderos", "Todo el pozo depende de un organizador humano que puede desaparecer con la caja."],
  ["El desenlace", "PrestaPerú: a cada ahorrista le devolvieron S/ 1,400 — sin importar cuánto tenía ahorrado."],
];
probCards.forEach((c,i)=>{
  const x = MX + i*3.95;
  s.addShape("roundRect", { x, y: 3.15, w: 3.65, h: 2.15, rectRadius: 0.09, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
  s.addText(c[0], { x: x+0.28, y: 3.42, w: 3.1, h: 0.4, fontFace: F, fontSize: 17.5, bold: true, color: INK, margin: 0 });
  s.addText(c[1], { x: x+0.28, y: 3.92, w: 3.12, h: 1.25, fontFace: F, fontSize: 13, color: MUTED, lineSpacing: 18, margin: 0 });
});
s.addText([
  { text: "No es falta de ahorro. Es un problema de ", options: { color: INK } },
  { text: "confianza", options: { color: BG, highlight: GOLD, bold: true } },
  { text: ", y hoy la confianza no se puede verificar.", options: { color: INK } },
], { x: MX, y: 5.85, w: 11.3, h: 0.5, fontFace: F, fontSize: 17.5, margin: 0 });

// ============ 3 · POR QUÉ SIGUE SIN RESOLVERSE ============
s = p.addSlide(); base(s);
kicker(s, "Por qué sigue sin resolverse");
s.addText("Tres salidas actuales.\nLa misma falla de fondo.", { x: MX, y: 1.05, w: 11, h: 1.75, fontFace: F, fontSize: 40, bold: true, color: INK, lineSpacing: 46, margin: 0 });
const rows = [
  ["Coopacs reguladas", "La supervisión llega cuando el patrimonio ya se esfumó. El seguro cubre apenas S/ 5,000–10,000.", "Opacidad"],
  ["Juntas informales", "Funcionan por confianza cara a cara. Cuando falla, no hay recurso legal ni rastro.", "Custodio único"],
  ["Apps de ahorro", "Custodian igual que siempre, y tu puntualidad no construye historial en ningún lado.", "Caja negra"],
];
rows.forEach((r,i)=>{
  const y = 3.2 + i*1.18;
  s.addText(r[0], { x: MX, y: y, w: 3.3, h: 0.75, fontFace: F, fontSize: 19, bold: true, color: INK, margin: 0 });
  s.addText(r[1], { x: 4.5, y: y-0.02, w: 5.9, h: 0.85, fontFace: F, fontSize: 13.5, color: MUTED, lineSpacing: 18, margin: 0 });
  chip(s, r[2], 10.7, y+0.02, 1.75);
});

// ============ 4 · LA SOLUCIÓN ============
s = p.addSlide(); base(s);
kicker(s, "La solución", 1.05);
s.addText("Una caja donde la\nconfianza es código.", { x: MX, y: 1.45, w: 6.3, h: 1.7, fontFace: F, fontSize: 37, bold: true, color: INK, lineSpacing: 43, margin: 0 });
const solPts = [
  ["El contrato custodia", "Cada cuota entra al smart contract. Nadie — ni nosotros — puede desviar el pozo."],
  ["Cualquiera audita", "Un QR muestra que la caja cuadra: aportado − distribuido = balance real, en Arbitrum. Sin pedir permiso."],
  ["Tu comportamiento vale", "Un score de IA computado dentro del contrato: sube si cumples, baja si fallas."],
];
solPts.forEach((b,i)=>{
  const y = 3.55 + i*0.95;
  s.addShape("rect", { x: MX+0.02, y: y+0.10, w: 0.13, h: 0.13, rotate: 45, fill: { color: GOLD }, line: { type: "none" } });
  s.addText(b[0], { x: MX+0.4, y: y-0.05, w: 5.6, h: 0.35, fontFace: F, fontSize: 15.5, bold: true, color: INK, margin: 0 });
  s.addText(b[1], { x: MX+0.4, y: y+0.27, w: 5.7, h: 0.6, fontFace: F, fontSize: 12.5, color: MUTED, lineSpacing: 16, margin: 0 });
});
// mock panel derecha
const px = 7.35, py = 1.45, pw = 5.0, ph = 4.9;
s.addShape("roundRect", { x: px, y: py, w: pw, h: ph, rectRadius: 0.12, fill: { color: CARD }, line: { color: BORDER, width: 1 } });
s.addText("JUNTA · LAS EMPRENDEDORAS", { x: px+0.35, y: py+0.3, w: 4.3, h: 0.3, fontFace: MONO, fontSize: 11, color: MUTED, charSpacing: 2, margin: 0 });
s.addText("8 miembras · cuota 50 USDC · ciclo 3 de 8 · 5 de 8 cuotas", { x: px+0.35, y: py+0.62, w: 4.6, h: 0.3, fontFace: F, fontSize: 11.5, color: INK, margin: 0 });
for(let i=0;i<8;i++){ s.addShape("ellipse", { x: px+0.37+i*0.42, y: py+1.06, w: 0.26, h: 0.26, fill: { color: i<5 ? GOLD : "3A4657" }, line: { type: "none" } }); }
const rowsM = [["Aportado","1,050 USDC"],["Distribuido","800 USDC"],["Balance real","250 USDC"]];
rowsM.forEach((r,i)=>{
  const y = py+1.68+i*0.62;
  s.addText(r[0], { x: px+0.35, y, w: 2.7, h: 0.35, fontFace: F, fontSize: 13, color: MUTED, margin: 0 });
  s.addText(r[1], { x: px+2.9, y, w: 1.75, h: 0.35, fontFace: MONO, fontSize: 13.5, color: INK, align: "right", margin: 0 });
});
s.addShape("roundRect", { x: px+0.35, y: py+3.72, w: pw-0.7, h: 0.72, rectRadius: 0.08, fill: { color: "18230F" }, line: { color: GOLD, width: 1 } });
s.addText("✓  CUADRA — aportado − distribuido = balance", { x: px+0.55, y: py+3.78, w: pw-0.85, h: 0.6, fontFace: MONO, fontSize: 11, color: GOLD, valign: "middle", margin: 0 });

// ============ 5 · CÓMO FUNCIONA ============
s = p.addSlide(); base(s);
kicker(s, "Cómo funciona");
s.addText("Tres pasos. Sin bancos, sin papeles.", { x: MX, y: 1.05, w: 11.3, h: 0.85, fontFace: F, fontSize: 40, bold: true, color: INK, margin: 0 });
const steps = [
  ["01","Únete a tu junta","Deposita tu cuota en USDC. El contrato custodia el pozo y paga los turnos en orden. Nadie toca la caja."],
  ["02","Audita cuando quieras","Escanea el QR de tu junta: aportado − distribuido = balance real, verificado en Arbitrum al instante."],
  ["03","Tu puntualidad vale","Un modelo de IA computa tu score dentro del contrato y te abre microcrédito real, sin trámite."],
];
steps.forEach((st,i)=>{
  const x = MX + i*4.0;
  s.addText(st[0], { x, y: 2.5, w: 2, h: 0.85, fontFace: MONO, fontSize: 44, color: GOLDD, margin: 0 });
  s.addText(st[1], { x, y: 3.5, w: 3.6, h: 0.65, fontFace: F, fontSize: 18.5, bold: true, color: INK, margin: 0 });
  s.addText(st[2], { x, y: 4.15, w: 3.55, h: 1.5, fontFace: F, fontSize: 13, color: MUTED, lineSpacing: 18, margin: 0 });
});

// ============ 6 · INNOVACIÓN ============
s = p.addSlide(); base(s);
kicker(s, "Innovación tecnológica");
s.addText([
  { text: "El score no lo calcula un servidor.\n", options: { color: INK } },
  { text: "Lo calcula Arbitrum.", options: { color: BG, highlight: GOLD } },
], { x: MX, y: 1.05, w: 11.3, h: 1.75, fontFace: F, fontSize: 40, bold: true, lineSpacing: 46, margin: 0 });
const tech = [
  ["Score on-chain", "Stylus · Rust", "El modelo de ML corre dentro del contrato, en aritmética de punto fijo. Imposible en Solidity.", ARB],
  ["Integridad verificable", "QR · on-chain", "Cualquier socio comprueba que la caja cuadra —aportado − distribuido = balance— desde su celular, sin confiar en auditores.", GOLD],
  ["Credencial portable", "EAS", "Attestation de EAS con la miembro como destinataria y el hash del modelo: viaja con ella y se lee sin conocer a Kallpa.", ARB],
  ["Custodia programática", "Arbitrum", "El pozo vive en el contrato. Las reglas de turno no tienen dueño con llave.", GOLD],
];
tech.forEach((t,i)=>{
  const x = MX + (i%2)*5.95, y = 3.1 + Math.floor(i/2)*1.62;
  s.addShape("roundRect", { x, y, w: 5.6, h: 1.42, rectRadius: 0.09, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
  s.addText(t[0], { x: x+0.3, y: y+0.18, w: 3.4, h: 0.35, fontFace: F, fontSize: 16.5, bold: true, color: INK, margin: 0 });
  s.addText(t[1], { x: x+3.35, y: y+0.22, w: 2.05, h: 0.3, fontFace: MONO, fontSize: 10.5, color: t[3], align: "right", margin: 0 });
  s.addText(t[2], { x: x+0.3, y: y+0.6, w: 5.0, h: 0.7, fontFace: F, fontSize: 12, color: MUTED, lineSpacing: 15.5, margin: 0 });
});
s.addText("Nuestro modelo corre EN cadena por 163,695 gas — medido en record_score sobre un historial completo, no citado.",
  { x: MX, y: 6.55, w: 11.3, h: 0.35, fontFace: F, fontSize: 13, color: MUTED, margin: 0 });

// ============ 7 · REPUTACIÓN BIDIRECCIONAL ============
s = p.addSlide(); base(s);
kicker(s, "Reputación bidireccional");
s.addText([
  { text: "Un score que solo premia se puede farmear.\n", options: { color: INK } },
  { text: "El nuestro también castiga.", options: { color: BG, highlight: GOLD } },
], { x: MX, y: 1.05, w: 11.5, h: 1.75, fontFace: F, fontSize: 38, bold: true, lineSpacing: 45, margin: 0 });
const bidi = [
  ["SI CUMPLES", "Ocho ciclos puntuales", "El Pool abre tu línea recomputando tu historial en vivo al prestar — automático, sin comité.", "1000", "línea 200 USDC", GOLD, GOLD],
  ["SI FALLAS", "Cuota vencida · disputa perdida", "No hay nada que firmar para castigarte: el default aparece solo con el reloj. Y el Pool decide con tu peor junta, no con la que tú elijas.", "194", "× sin crédito", MUTED, BORDER],
];
bidi.forEach((c,i)=>{
  const x = MX + i*5.95, y = 3.1, w = 5.6, h = 2.6;
  s.addShape("roundRect", { x, y, w, h, rectRadius: 0.1, fill: { color: CARD }, line: { color: c[6], width: 1 } });
  s.addText(c[0], { x: x+0.32, y: y+0.26, w: 3.4, h: 0.3, fontFace: MONO, fontSize: 11, color: c[5], charSpacing: 3, margin: 0 });
  s.addText(c[1], { x: x+0.32, y: y+0.6, w: w-0.64, h: 0.35, fontFace: F, fontSize: 15.5, bold: true, color: INK, margin: 0 });
  s.addText(c[2], { x: x+0.32, y: y+1.0, w: w-0.64, h: 0.8, fontFace: F, fontSize: 12.5, color: MUTED, lineSpacing: 17, margin: 0 });
  s.addText(c[3], { x: x+0.32, y: y+1.9, w: 2.6, h: 0.5, fontFace: MONO, fontSize: 23, bold: true, color: c[5], margin: 0 });
  chip(s, c[4], x+3.0, y+2.0, 2.28, c[5]);
});
s.addText("Bajo un sistema que espera tu firma, el moroso simplemente no firma y nunca lo alcanzan. Acá el tiempo firma por él: cada pago y cada default viven en la junta, y el score se recomputa de ahí en cada préstamo.",
  { x: MX, y: 6.1, w: 11.5, h: 0.8, fontFace: F, fontSize: 14, color: INK, lineSpacing: 19, margin: 0 });

// ============ 8 · ARQUITECTURA ============
s = p.addSlide(); base(s);
kicker(s, "Arquitectura");
s.addText("Cuatro piezas, cero servidores de confianza.", { x: MX, y: 1.05, w: 11.4, h: 0.85, fontFace: F, fontSize: 38, bold: true, color: INK, margin: 0 });
const archNodes = [
  ["App Kallpa", "Scaffold-Stylus", "Español simple, la wallet es la cuenta. Sin backend ni base de datos."],
  ["Contrato Junta", "custodia · turnos", "Guarda el pozo y paga turnos en orden. No existe retiro de admin."],
  ["Motor de Score", "Stylus · Rust · ML", "Inferencia del modelo en punto fijo, dentro del contrato."],
  ["EAS + Pool", "attestation · crédito", "El score se attesta a nombre de la miembro; el Pool presta mirando su peor junta, no la que ella elija."],
];
archNodes.forEach((n,i)=>{
  const x = MX + i*3.02;
  s.addShape("roundRect", { x, y: 2.55, w: 2.72, h: 2.1, rectRadius: 0.1, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
  s.addText(n[0], { x: x+0.22, y: 2.78, w: 2.32, h: 0.35, fontFace: F, fontSize: 14.5, bold: true, color: INK, margin: 0 });
  s.addText(n[1], { x: x+0.22, y: 3.16, w: 2.32, h: 0.28, fontFace: MONO, fontSize: 9.5, color: ARB, margin: 0 });
  s.addText(n[2], { x: x+0.22, y: 3.52, w: 2.34, h: 1.0, fontFace: F, fontSize: 11.5, color: MUTED, lineSpacing: 15, margin: 0 });
  if(i<3) s.addText("→", { x: x+2.68, y: 3.32, w: 0.38, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: GOLD, align: "center", margin: 0 });
});
s.addShape("roundRect", { x: MX, y: 5.1, w: 11.78, h: 0.95, rectRadius: 0.1, fill: { color: BG }, line: { color: GOLDD, width: 1 } });
s.addText([
  { text: "Auditoría pública por QR:  ", options: { color: GOLD, bold: true } },
  { text: "la página lee aportado, distribuido y balance del contrato y los cruza contra el saldo real del token — sin backend, sin nadie que pueda maquillar el número.", options: { color: MUTED } },
], { x: MX+0.35, y: 5.22, w: 11.1, h: 0.7, fontFace: F, fontSize: 13, lineSpacing: 17, margin: 0, valign: "middle" });
chip(s, "Arbitrum Sepolia", MX, 6.45, 1.95, ARB);
chip(s, "USDC de prueba", MX+2.15, 6.45, 1.95, GOLD);
chip(s, "Código abierto en GitHub", MX+4.3, 6.45, 2.6, GOLD);

// ============ 9 · LA DEMO ============
s = p.addSlide(); base(s);
kicker(s, "El momento demo", 1.05);
s.addText("Audita la caja\ndesde tu celular.", { x: MX, y: 1.45, w: 6.4, h: 1.7, fontFace: F, fontSize: 37, bold: true, color: INK, lineSpacing: 43, margin: 0 });
s.addText("María cerró \"Las Emprendedoras\" con sus ocho cuotas puntuales: record_score la computa en Stylus y le da 1000, el máximo (tx en Arbiscan). En \"Los del Mercado\" cobró el pozo y dejó de aportar: 194.",
  { x: MX, y: 3.3, w: 5.9, h: 1.05, fontFace: F, fontSize: 14, color: MUTED, lineSpacing: 19, margin: 0 });
s.addText("La misma dirección, dos veredictos. El Pool no le pregunta cuál mirar: decide con la peor y le cierra el crédito. Nadie declaró nada — el default lo puso el reloj.",
  { x: MX, y: 4.42, w: 5.9, h: 0.75, fontFace: F, fontSize: 14, color: INK, lineSpacing: 19, margin: 0 });
s.addText("Y en vivo: el jurado escanea el QR y ve CUADRA. Mandamos 100 USDC sueltos al contrato → el QR salta a NO CUADRA. La caja se autodenuncia.",
  { x: MX, y: 5.28, w: 5.9, h: 0.75, fontFace: F, fontSize: 14.5, color: INK, lineSpacing: 20, margin: 0 });
s.addText("kallpa-one.vercel.app/auditar · Arbitrum Sepolia", { x: MX, y: 6.35, w: 5.9, h: 0.3, fontFace: MONO, fontSize: 11, color: GOLDD, margin: 0 });
// QR estilizado
const qx = 8.0, qy = 1.55, cell = 0.185, grid = [
"1111101010011111","1000101101010001","1011101010110111","1011100110110111",
"1000101011010001","1111101010111111","0000000110000000","1010111011101101",
"0110010101100110","1011101101011011","0000001010100000","1111100110101110",
"1000101011000101","1011101101110111","1011100010101101","1111101101011010"];
s.addShape("roundRect", { x: qx-0.35, y: qy-0.35, w: grid[0].length*cell+0.7, h: grid.length*cell+1.05, rectRadius: 0.12, fill: { color: "F4F2EC" }, line: { type: "none" } });
grid.forEach((row,r)=>{ [...row].forEach((c,cix)=>{ if(c==="1") s.addShape("rect", { x: qx+cix*cell, y: qy+r*cell, w: cell*0.92, h: cell*0.92, fill: { color: "0B0F16" }, line: { type: "none" } }); }); });
s.addText("ESCANEA Y AUDITA", { x: qx-0.35, y: qy+grid.length*cell+0.12, w: grid[0].length*cell+0.7, h: 0.35, fontFace: MONO, fontSize: 11.5, bold: true, color: "0B0F16", align: "center", margin: 0 });

// ============ 10 · POR QUÉ ARBITRUM ============
s = p.addSlide(); base(s);
kicker(s, "Por qué Arbitrum");
s.addText("Construido sobre lo que Arbitrum\npidió que se construyera.", { x: MX, y: 1.05, w: 11.4, h: 1.75, fontFace: F, fontSize: 40, bold: true, color: INK, lineSpacing: 46, margin: 0 });
const arb = [
  ["Stylus", "Su blog oficial lista el cómputo intensivo en Rust/WASM como oportunidad de construcción. Nuestro motor de score es exactamente eso."],
  ["EAS en Arbitrum", "El estándar que usa Coinbase en producción ya vive en Arbitrum — y el nuestro ya está ahí: schema registrado y attestation emitida en Sepolia."],
  ["Scaffold-Stylus", "Frontend y flujo de contratos sobre el stack del bounty Advanced: Stylus + IA, desplegado en Arbitrum Sepolia."],
];
arb.forEach((r,i)=>{
  const y = 3.15 + i*1.15;
  s.addText(r[0], { x: MX, y, w: 3.2, h: 0.5, fontFace: F, fontSize: 19, bold: true, color: INK, margin: 0 });
  s.addText(r[1], { x: 4.5, y: y-0.02, w: 7.9, h: 0.95, fontFace: F, fontSize: 13.5, color: MUTED, lineSpacing: 18, margin: 0 });
});
chip(s, "Arbitrum Sepolia", MX, 6.6, 1.95, ARB);
chip(s, "Scaffold-Stylus", MX+2.15, 6.6, 1.95, ARB);
chip(s, "Bounty Advanced: Stylus + IA", MX+4.3, 6.6, 2.9, GOLD);

// ============ 11 · MERCADO ============
s = p.addSlide(); base(s);
kicker(s, "Mercado");
s.addText("Dos frentes, el mismo motor.", { x: MX, y: 1.05, w: 11, h: 0.85, fontFace: F, fontSize: 40, bold: true, color: INK, margin: 0 });
const mkt = [
  ["B2C", "Personas", "2 de cada 3 peruanos que ahorran lo hacen informalmente. Juntas sin custodio de confianza, puntualidad que hoy no vale nada."],
  ["B2B", "Instituciones", "Coopacs y fintechs que adopten el estándar de solvencia verificable y consuman el score como attestation."],
];
mkt.forEach((m,i)=>{
  const x = MX + i*6.0;
  s.addShape("roundRect", { x, y: 2.5, w: 5.55, h: 2.5, rectRadius: 0.1, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
  s.addText(m[0], { x: x+0.35, y: 2.85, w: 1.2, h: 0.3, fontFace: MONO, fontSize: 12, color: GOLD, charSpacing: 2, margin: 0 });
  s.addText(m[1], { x: x+0.35, y: 3.2, w: 4.8, h: 0.55, fontFace: F, fontSize: 24, bold: true, color: INK, margin: 0 });
  s.addText(m[2], { x: x+0.35, y: 3.85, w: 4.85, h: 1.0, fontFace: F, fontSize: 13.5, color: MUTED, lineSpacing: 19, margin: 0 });
});
s.addText([
  { text: "No vendemos una app. Construimos la ", options: { color: INK } },
  { text: "infraestructura", options: { color: BG, highlight: GOLD, bold: true } },
  { text: " de la confianza financiera informal.", options: { color: INK } },
], { x: MX, y: 5.65, w: 11.4, h: 0.5, fontFace: F, fontSize: 17.5, margin: 0 });

// ============ 12 · IMPACTO ============
s = p.addSlide(); base(s);
kicker(s, "Impacto potencial");
s.addText("Los números que queremos cambiar.", { x: MX, y: 1.05, w: 11.3, h: 0.85, fontFace: F, fontSize: 40, bold: true, color: INK, margin: 0 });
const stats = [
  ["211,000","familias atrapadas en el crédito gota a gota"],
  ["1,400%","de interés anual que llega a cobrar el prestamista informal"],
  ["42","coopacs disueltas por la SBS en un solo año"],
  ["S/ 1,780M","mueve el crédito informal, +78% en un año"],
];
stats.forEach((st,i)=>{
  const x = MX + (i%2)*6.0, y = 2.55 + Math.floor(i/2)*1.85;
  s.addText(st[0], { x, y, w: 3.4, h: 0.95, fontFace: F, fontSize: 47, bold: true, color: GOLD, margin: 0 });
  s.addText(st[1], { x, y: y+0.98, w: 5.3, h: 0.6, fontFace: F, fontSize: 13.5, color: MUTED, lineSpacing: 17, margin: 0 });
});
s.addText("La puntualidad de millones, por fin construyendo futuro.", { x: MX, y: 6.6, w: 11.3, h: 0.4, fontFace: F, fontSize: 15, color: INK, margin: 0 });

// ============ 13 · ESTADO Y CAMINO ============
s = p.addSlide(); base(s);
kicker(s, "Estado del proyecto");
s.addText("De hackathon a estándar.", { x: MX, y: 1.05, w: 11, h: 0.85, fontFace: F, fontSize: 40, bold: true, color: INK, margin: 0 });
const road = [
  ["HOY","MVP en Arbitrum Sepolia","Junta con custodia real, score computándose en Stylus, attestations EAS y pool de microcrédito. Demo Day: 8 de agosto."],
  ["AGO","Segunda cancha","Aleph Hackathon Lima (22–23 ago, Arbitrum sponsor) con el feedback del jurado ya incorporado."],
  ["LUEGO","Infraestructura","SDK para coopacs y fintechs, privacidad con ZK y aplicación al grant Trailblazer de Arbitrum."],
];
road.forEach((r,i)=>{
  const x = MX + i*4.0;
  s.addText(r[0], { x, y: 2.6, w: 2.4, h: 0.45, fontFace: MONO, fontSize: 17, color: GOLDD, charSpacing: 2, margin: 0 });
  s.addText(r[1], { x, y: 3.15, w: 3.6, h: 0.85, fontFace: F, fontSize: 18, bold: true, color: INK, lineSpacing: 22, margin: 0 });
  s.addText(r[2], { x, y: 4.05, w: 3.55, h: 1.6, fontFace: F, fontSize: 12.5, color: MUTED, lineSpacing: 17.5, margin: 0 });
});

// ============ 14 · EQUIPO Y CIERRE ============
s = p.addSlide(); base(s);
kicker(s, "Quiénes construyen");
s.addText("Cuatro personas, un estándar.", { x: MX, y: 1.05, w: 11, h: 0.8, fontFace: F, fontSize: 38, bold: true, color: INK, margin: 0 });
const team = [
  ["Ely Rivaldo Cortez", "Producto · pitch"],
  ["Diego Cisneros", "Smart contracts"],
  ["Mariana Chambi", "IA · datos"],
  ["Francis Mamani", "Frontend · UX"],
];
team.forEach((t,i)=>{
  const x = MX + i*2.95;
  s.addShape("roundRect", { x, y: 2.35, w: 2.7, h: 1.35, rectRadius: 0.09, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
  s.addText(t[0], { x: x+0.22, y: 2.6, w: 2.3, h: 0.55, fontFace: F, fontSize: 14.5, bold: true, color: INK, lineSpacing: 17, margin: 0 });
  s.addText(t[1], { x: x+0.22, y: 3.22, w: 2.3, h: 0.3, fontFace: MONO, fontSize: 10.5, color: GOLDD, margin: 0 });
});
s.addText([
  { text: "Que nadie pierda sus ahorros por ", options: { color: INK } },
  { text: "confiar", options: { color: BG, highlight: GOLD, bold: true } },
  { text: ".", options: { color: INK } },
], { x: MX, y: 4.6, w: 11.3, h: 0.75, fontFace: F, fontSize: 32, bold: true, margin: 0 });
s.addText("Con Kallpa, no hace falta confiar. Se verifica.", { x: MX, y: 5.45, w: 10, h: 0.5, fontFace: F, fontSize: 17, color: MUTED, margin: 0 });
logo(s, 10.2, 6.55, 0.95);

p.writeFile({ fileName: "kallpa-pitch-deck.pptx" }).then(()=>console.log("OK deck escrito"));
