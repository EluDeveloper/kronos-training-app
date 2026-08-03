const fs = require('fs');
const path = require('path');

function sanitizeName(name) {
    return name.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
}

function formatDate(date) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
}

function buildReceiptHtml({ atleta, monto, fechaEmision, vigencia, plan, reciboId }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo de Pago - ${atleta}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
    body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
    .receipt-font { font-family: 'JetBrains Mono', monospace; }
    @media print {
      body { background-color: white; }
      .no-print { display: none; }
      .print-shadow-none { box-shadow: none !important; max-width: 100% !important; margin: 0 !important; padding: 10px !important; }
    }
  </style>
</head>
<body class="antialiased min-h-screen flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg print-shadow-none border border-gray-100">
    <div class="text-center border-b-2 border-gray-800 pb-6 mb-6">
      <h1 class="text-2xl font-bold tracking-widest text-gray-900">KRONOS TRAINING</h1>
      <h2 class="text-lg font-semibold text-gray-600 mt-1">RECIBO DE PAGO</h2>
      <p class="text-sm text-gray-800 mt-2 font-bold uppercase">Atleta: ${atleta}</p>
      <p class="text-sm text-gray-500 receipt-font mt-1">Fecha de emisión: ${fechaEmision}</p>
    </div>
    <div class="mb-6">
      <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3 bg-gray-100 p-2 rounded">Detalle del Pago</h3>
      <div class="flex justify-between receipt-font text-sm text-gray-600 mb-2">
        <span>${plan || 'Pago de Mensualidad'}</span>
        <span>$${monto}</span>
      </div>
      ${vigencia ? `<div class="text-xs text-gray-800 font-semibold receipt-font mb-4">* Vigencia: ${vigencia}</div>` : ''}
    </div>
    <div class="border-t-2 border-gray-800 mt-8 pt-4">
      <div class="flex justify-between items-center text-lg font-bold text-gray-900 receipt-font">
        <span>TOTAL PAGADO</span>
        <span class="text-2xl">$${monto}</span>
      </div>
    </div>
    <div class="mt-8 text-center text-xs text-gray-400">
      <p>Gracias por ser parte la gran familia Kronos.</p>
      <p class="mt-1">Documento generado el ${fechaEmision}.</p>
    </div>
  </div>
</body>
</html>`;
}

function main() {
    const [, , atleta, monto, fechaEmision, vigencia = '', plan = 'Pago de Mensualidad'] = process.argv;

    if (!atleta || !monto || !fechaEmision) {
        console.error('Uso: node generar-recibo.js "Nombre Atleta" monto "DD/MM/AAAA" [vigencia] [plan]');
        process.exit(1);
    }

    const safeName = sanitizeName(atleta);
    const dateKey = formatDate(new Date(fechaEmision.split('/').reverse().join('-')));
    const fileName = `${safeName}-${dateKey}.html`;
    const outputPath = path.join(__dirname, fileName);

    const html = buildReceiptHtml({ atleta, monto, fechaEmision, vigencia, plan, reciboId: fileName });
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Recibo generado: ${outputPath}`);
}

main();
