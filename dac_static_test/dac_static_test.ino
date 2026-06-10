/* ============================================================
 *  HANAN CUMBIA - Test ESTATICO del DAC (para multimetro DC)
 *  ------------------------------------------------------------
 *  No genera audio: fija el DAC en niveles DC fijos y los va
 *  cambiando cada 2 s. Pensado para MEDIR CON MULTIMETRO en DC,
 *  no para escuchar. Aisla "el DAC obedece al SPI" del resto.
 *
 *  Hardware: MCP4901, SPI, CS=pin 10, gain x1, Vref=Vdd(5V).
 *
 *  QUE MEDIR (punta + en pin 8 / Vout del U1, punta - en GND):
 *    El valor debe ir cambiando en ESTE ciclo (Vref=5V, gain x1):
 *      code   0   -> ~0.00 V
 *      code  64   -> ~1.25 V
 *      code 127   -> ~2.49 V
 *      code 191   -> ~3.73 V
 *      code 255   -> ~4.98 V
 *
 *  LECTURA:
 *    - Vout SIGUE la escalera     -> DAC + SPI OK. El fallo esta
 *      despues (R serie / cap / jack / falta amplificacion).
 *    - Vout CLAVADO (0V, 5V o un valor fijo) -> el DAC NO recibe
 *      SPI valido: revisar continuidad CS(10)/SDI(11)/SCK(13)
 *      Nano->U1, o soldadura del U1. Tambien medir Vref(pin6)=5V
 *      y LDAC(pin5)=0V.
 *    - El LED del pin 13 (SCK) debe parpadear tenue: hay clock SPI.
 * ============================================================ */

#include <SPI.h>
#include <DAC_MCP49xx.h>

DAC_MCP49xx dac(DAC_MCP49xx::MCP4901, 10);

const byte steps[] = {0, 64, 127, 191, 255};
byte i = 0;

void setup() {
  pinMode(10, OUTPUT);   // CS
  pinMode(13, OUTPUT);   // SCK -> el LED onboard parpadea con cada escritura
  SPI.begin();
  SPI.setBitOrder(MSBFIRST);
  dac.setGain(1);
}

void loop() {
  dac.output(steps[i]);          // fija el nivel...
  // reescribe varias veces para que se vea actividad de SCK en el LED
  for (int k = 0; k < 200; k++) { dac.output(steps[i]); delay(10); }
  i = (i + 1) % (sizeof(steps));
}
