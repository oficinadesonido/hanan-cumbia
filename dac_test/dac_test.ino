/* ============================================================
 *  HANAN CUMBIA - Test de hardware de audio (DAC MCP4901)
 *  ------------------------------------------------------------
 *  Proposito: aislar el camino DAC -> amplificador -> parlante,
 *  sin timers, sin samples, sin secuenciador. Si esto NO suena,
 *  el problema es de hardware (DAC/amp/parlante/soldaduras).
 *  Si esto SI suena pero el firmware no, el problema es de
 *  datos/firmware (samples en silencio), no de hardware.
 *
 *  Hardware (igual que el firmware real):
 *    - DAC MCP4901, 8-bit, SPI, CS = pin 10, gain x1.
 *
 *  Que hace:
 *    1) Tono diente de sierra continuo (~480 Hz): recorre TODOS
 *       los 256 codigos del DAC -> verifica todo el rango y da
 *       maximo volumen. Deberias oir un zumbido fuerte y claro.
 *    2) Cada 2 s alterna a una onda cuadrada (0/255) un instante,
 *       como segunda prueba bien marcada.
 * ============================================================ */

#include <SPI.h>
#include <DAC_MCP49xx.h>

// Mismo DAC y mismo pin CS que hanan26Taller.ino
DAC_MCP49xx dac(DAC_MCP49xx::MCP4901, 10);

void setup() {
  pinMode(10, OUTPUT);      // CS del DAC
  SPI.begin();
  SPI.setBitOrder(MSBFIRST);
  dac.setGain(1);           // ganancia x1 (igual que el firmware)
  dac.output(127);          // reposo a media escala (silencio "centrado")
}

void loop() {
  // --- 1) Diente de sierra ~480 Hz durante ~2 segundos ---
  // 256 muestras por ciclo. Con ~8 us por muestra -> ~488 Hz.
  unsigned long t0 = millis();
  while (millis() - t0 < 2000) {
    for (int v = 0; v < 256; v++) {
      dac.output((byte)v);
      delayMicroseconds(6);   // ajusta el tono; menos = mas agudo
    }
  }

  // --- 2) Onda cuadrada bien fuerte ~440 Hz durante ~1 segundo ---
  unsigned long t1 = millis();
  while (millis() - t1 < 1000) {
    dac.output(255);
    delayMicroseconds(1136);  // medio periodo de ~440 Hz
    dac.output(0);
    delayMicroseconds(1136);
  }
}
