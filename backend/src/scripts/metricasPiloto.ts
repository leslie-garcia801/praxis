// Pilot metrics report (specs §12, task 0053). Read-only: it never writes to the database.
// Usage: pnpm job:metricas-piloto -- --desde 2026-11-16 --hasta 2026-12-20 [--carrera Programación] [--semestre 5]
//        [--grupo A] [--tipo SERVICIO_SOCIAL|PRACTICAS] [--plantel <id>] [--csv ruta.csv | --csv -]
// Production: node dist/scripts/metricasPiloto.js --desde ... --hasta ...
// Exit codes: 0 ok, 1 unexpected failure, 2 bad arguments (usage message printed).
import { writeFile } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';
import { MENSAJE_USO, parsearArgumentos } from '../modules/metricasPiloto/metricasPiloto.args.js';
import { formatearCsv, formatearReporte } from '../modules/metricasPiloto/metricasPiloto.formato.js';
import { ErrorUsoMetricas, generarReportePiloto } from '../modules/metricasPiloto/metricasPiloto.service.js';

const args = parsearArgumentos(process.argv.slice(2));

if (!args.ok) {
  console.error(args.mensaje);
  process.exitCode = 2;
} else {
  try {
    const reporte = await generarReportePiloto(args.valor, new Date());
    const csvEnSalida = args.valor.csv === '-';
    // With --csv - the CSV owns stdout (so it can be redirected); the text report goes to stderr.
    const imprimir = csvEnSalida ? console.error : console.log;
    imprimir(formatearReporte(reporte));
    if (args.valor.csv) {
      const csv = formatearCsv(reporte.filas);
      if (csvEnSalida) process.stdout.write(csv);
      else {
        await writeFile(args.valor.csv, csv, 'utf8');
        imprimir(`\nCSV escrito en ${args.valor.csv} (${reporte.filas.length} fila(s)).`);
      }
    }
  } catch (error) {
    if (error instanceof ErrorUsoMetricas) {
      console.error(`${error.message}\n\n${MENSAJE_USO}`);
      process.exitCode = 2;
    } else {
      console.error('El reporte de métricas del piloto falló:', error);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}
